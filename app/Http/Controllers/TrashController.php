<?php

namespace App\Http\Controllers;

use App\Models\Division;
use App\Models\Department;
use App\Models\Team;
use App\Models\User;
use App\Models\Project;
use App\Models\Task;
use App\Models\Link;
use App\Models\Folder;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class TrashController extends Controller
{
    private const TYPES = [
        'divisions' => Division::class,
        'departments' => Department::class,
        'teams' => Team::class,
        'users' => User::class,
        'projects' => Project::class,
        'tasks' => Task::class,
        'links' => Link::class,
        'folders' => Folder::class,
    ];

    public function index(Request $request): Response
    {
        abort_unless($request->user()->hasRole('admin'), 403);

        $typeFilter = $request->query('type', null);
        $items = [];

        if (!$typeFilter || $typeFilter === 'divisions') {
            $items = array_merge($items, $this->getTrashedItems(
                Division::onlyTrashed()->get(),
                'divisions',
                'name'
            ));
        }

        if (!$typeFilter || $typeFilter === 'departments') {
            $items = array_merge($items, $this->getTrashedItems(
                Department::onlyTrashed()->whereHas('division')->get(),
                'departments',
                'name'
            ));
        }

        if (!$typeFilter || $typeFilter === 'teams') {
            $items = array_merge($items, $this->getTrashedItems(
                Team::onlyTrashed()->whereHas('department')->get(),
                'teams',
                'name'
            ));
        }

        if (!$typeFilter || $typeFilter === 'users') {
            $items = array_merge($items, $this->getTrashedItems(
                User::onlyTrashed()->get(),
                'users',
                'name'
            ));
        }

        if (!$typeFilter || $typeFilter === 'projects') {
            $items = array_merge($items, $this->getTrashedItems(
                Project::onlyTrashed()->get(),
                'projects',
                'name'
            ));
        }

        if (!$typeFilter || $typeFilter === 'tasks') {
            $items = array_merge($items, $this->getTrashedItems(
                Task::onlyTrashed()
                    ->whereHas('project')
                    ->where(function ($q) {
                        $q->whereNull('parent_id')->orWhereHas('parent');
                    })
                    ->get(),
                'tasks',
                'title'
            ));
        }

        if (!$typeFilter || $typeFilter === 'links') {
            $items = array_merge($items, $this->getTrashedItems(
                Link::onlyTrashed()->get(),
                'links',
                'title'
            ));
        }

        if (!$typeFilter || $typeFilter === 'folders') {
            $items = array_merge($items, $this->getTrashedItems(
                Folder::onlyTrashed()->whereNull('source_type')->get(),
                'folders',
                'name'
            ));
        }

        usort($items, fn ($a, $b) => $b['deleted_at']->timestamp <=> $a['deleted_at']->timestamp);

        $perPage = 20;
        $page = $request->query('page', 1);
        $offset = ($page - 1) * $perPage;
        $paginated = array_slice($items, $offset, $perPage);
        $total = count($items);
        $lastPage = (int) ceil($total / $perPage);

        return Inertia::render('Trash/Index', [
            'items' => $paginated,
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => $lastPage,
            ],
            'filters' => [
                'type' => $typeFilter,
            ],
        ]);
    }

    public function restore(Request $request, string $type, int $id): RedirectResponse
    {
        abort_unless($request->user()->hasRole('admin'), 403);

        abort_unless(isset(self::TYPES[$type]), 404);

        $modelClass = self::TYPES[$type];
        $model = $modelClass::onlyTrashed()->findOrFail($id);
        $model->restore();

        return back()->with('success', ucfirst($type) . ' restored successfully.');
    }

    public function forceDelete(Request $request, string $type, int $id): RedirectResponse
    {
        abort_unless($request->user()->hasRole('admin'), 403);

        abort_unless(isset(self::TYPES[$type]), 404);

        $modelClass = self::TYPES[$type];
        $model = $modelClass::onlyTrashed()->findOrFail($id);
        $model->forceDelete();

        return back()->with('success', ucfirst($type) . ' permanently deleted.');
    }

    /** Ceiling on one bulk action, so a runaway selection can't wedge a request. */
    private const BULK_MAX = 200;

    public function bulkRestore(Request $request): RedirectResponse
    {
        abort_unless($request->user()->hasRole('admin'), 403);

        [$restored, $missing] = $this->eachSelected($request, fn ($model) => $model->restore());

        return back()->with('success', $this->bulkMessage($restored, $missing, 'restored'));
    }

    public function bulkForceDelete(Request $request): RedirectResponse
    {
        abort_unless($request->user()->hasRole('admin'), 403);

        [$deleted, $missing] = $this->eachSelected($request, fn ($model) => $model->forceDelete());

        return back()->with('success', $this->bulkMessage($deleted, $missing, 'permanently deleted'));
    }

    /**
     * Run an action over the selected items.
     *
     * Grouped by type so each kind costs one query rather than one per row, but
     * still acted on as models: restoring and force-deleting fire observers and
     * cascade to related records, none of which a mass update would do.
     *
     * @return array{0: int, 1: int} [acted on, no longer in the trash]
     */
    private function eachSelected(Request $request, callable $action): array
    {
        $validated = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:' . self::BULK_MAX],
            'items.*.type' => ['required', 'string', Rule::in(array_keys(self::TYPES))],
            'items.*.id' => ['required', 'integer'],
        ]);

        $done = 0;
        $missing = 0;

        foreach (collect($validated['items'])->groupBy('type') as $type => $group) {
            $ids = collect($group)->pluck('id')->map(fn ($id) => (int) $id)->unique();

            $models = self::TYPES[$type]::onlyTrashed()->whereIn('id', $ids)->get();

            foreach ($models as $model) {
                $action($model);
                $done++;
            }

            // Someone else emptied it, or a cascade took it with a parent in the
            // same batch. Counted rather than failed: the selection has been
            // dealt with either way.
            $missing += $ids->count() - $models->count();
        }

        return [$done, $missing];
    }

    private function bulkMessage(int $done, int $missing, string $verb): string
    {
        $message = $done . ' ' . str('item')->plural($done) . ' ' . $verb . '.';

        if ($missing > 0) {
            $message .= ' ' . $missing . ' ' . str('item')->plural($missing)
                . ' were no longer in the trash.';
        }

        return $message;
    }

    private function getTrashedItems($models, string $type, string $labelField): array
    {
        return $models->map(function ($model) use ($type, $labelField) {
            return [
                'type' => $type,
                'id' => $model->id,
                'label' => $model->{$labelField},
                'deleted_at' => $model->deleted_at,
                'days_remaining' => 30 - (int) $model->deleted_at->diffInDays(now()),
            ];
        })->toArray();
    }
}
