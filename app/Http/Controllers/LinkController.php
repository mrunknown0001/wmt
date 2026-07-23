<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreLinkRequest;
use App\Http\Requests\UpdateLinkRequest;
use App\Models\Department;
use App\Models\Division;
use App\Models\Link;
use App\Models\LinkAssignment;
use App\Models\LinkGroup;
use App\Models\Team;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class LinkController extends Controller
{
    public function index(Request $request): Response
    {
        $this->authorize('viewAny', Link::class);

        $user = $request->user();
        $canManage = $user->hasPermissionTo('manage-links');

        $query = Link::with('user', 'creator', 'assignments.assignable');

        if (!$canManage) {
            // Assigned directly, via an org unit, a role, or a custom group.
            $query->visibleTo($user);
        } else {
            if ($userId = $request->input('user_id')) {
                $query->where('user_id', $userId);
            }
        }

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', '%' . $search . '%')
                    ->orWhere('url', 'like', '%' . $search . '%')
                    ->orWhere('description', 'like', '%' . $search . '%');
            });
        }

        $links = $query->orderByDesc('created_at')
            ->paginate(20)
            ->withQueryString();

        $users = $canManage
            ? User::where('is_active', true)->orderBy('name')->get(['id', 'name'])
            : [];

        return Inertia::render('Links/Index', [
            'links' => $links,
            'users' => $users,
            'filters' => [
                'search' => $request->input('search', ''),
                'user_id' => $request->input('user_id', ''),
            ],
        ]);
    }

    /** Everything a link can be assigned to, for the picker. */
    private static function assignmentOptions(): array
    {
        return [
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'teams' => Team::withCount(['members' => fn ($q) => $q->where('is_active', true)])
                ->orderBy('name')->get(['id', 'name']),
            'departments' => Department::orderBy('name')->get(['id', 'name']),
            'divisions' => Division::orderBy('name')->get(['id', 'name']),
            'roles' => \Spatie\Permission\Models\Role::orderBy('name')->get(['id', 'name']),
            'linkGroups' => LinkGroup::withCount('members')->orderBy('name')->get(['id', 'name']),
        ];
    }

    /** Current assignments as {type, id} pairs the picker understands. */
    private static function assignmentPayload(Link $link): array
    {
        return $link->assignments
            ->map(fn (LinkAssignment $a) => ['type' => $a->type_key, 'id' => $a->assignable_id])
            ->filter(fn ($a) => $a['type'] !== null)
            ->values()
            ->all();
    }

    /**
     * Replace a link's assignments with the submitted set. Unknown types and ids
     * that don't resolve are dropped rather than stored as dangling targets.
     */
    private static function syncAssignments(Link $link, array $assignments): void
    {
        $rows = [];

        foreach ($assignments as $assignment) {
            $class = LinkAssignment::TYPES[$assignment['type'] ?? ''] ?? null;
            $id = $assignment['id'] ?? null;

            if (!$class || !$id || !$class::whereKey($id)->exists()) {
                continue;
            }

            $rows[$class . ':' . $id] = ['assignable_type' => $class, 'assignable_id' => (int) $id];
        }

        $link->assignments()->delete();

        foreach ($rows as $row) {
            $link->assignments()->create($row);
        }
    }

    public function create(): Response
    {
        $this->authorize('create', Link::class);

        return Inertia::render('Links/Create', [
            ...self::assignmentOptions(),
        ]);
    }

    public function store(StoreLinkRequest $request): RedirectResponse
    {
        $data = $request->validated();
        $assignments = $data['assignments'] ?? [];
        unset($data['assignments']);

        $link = Link::create([
            ...$data,
            'created_by' => $request->user()->id,
        ]);

        self::syncAssignments($link, $assignments);

        ActivityLogger::logCreated($link, $request->user());

        return redirect()->route('links.index')
            ->with('success', 'Link created successfully.');
    }

    public function edit(Link $link): Response
    {
        $this->authorize('update', $link);

        $link->load('user', 'creator', 'assignments.assignable');

        return Inertia::render('Links/Edit', [
            'link' => $link,
            'assignments' => self::assignmentPayload($link),
            ...self::assignmentOptions(),
        ]);
    }

    public function update(UpdateLinkRequest $request, Link $link): RedirectResponse
    {
        $oldValues = $link->only(['title', 'description', 'url', 'user_id']);

        $data = $request->validated();
        $assignments = $data['assignments'] ?? null;
        unset($data['assignments']);

        $link->update($data);

        if ($assignments !== null) {
            self::syncAssignments($link, $assignments);
        }

        ActivityLogger::logChanges($link, $oldValues, $request->user());

        return redirect()->route('links.index')
            ->with('success', 'Link updated successfully.');
    }

    public function destroy(Link $link): RedirectResponse
    {
        $this->authorize('delete', $link);

        ActivityLogger::logDeleted($link, auth()->user());

        $link->delete();

        return redirect()->route('links.index')
            ->with('success', 'Link deleted successfully.');
    }
}
