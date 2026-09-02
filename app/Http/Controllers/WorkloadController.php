<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\User;
use App\Services\FolderService;
use App\Services\OrgScope;
use App\Services\WorkloadService;
use Illuminate\Support\Carbon;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Illuminate\Http\JsonResponse;
use Inertia\Response;

class WorkloadController extends Controller
{
    public function index(Request $request): Response
    {
        $viewer = $request->user();

        // Two ways in, and they mean different things: the permission opens the
        // whole organisation, heading a division or department opens that branch.
        abort_unless($viewer->canViewWorkload(), 403);

        $from = $this->parseDate($request->query('from')) ?? now()->startOfWeek();
        $to = $this->parseDate($request->query('to')) ?? $from->copy()->addDays(13);

        if ($to->lessThan($from)) {
            $to = $from->copy()->addDays(13);
        }

        $users = $this->visiblePeople($viewer, $request);

        $projectId = $request->query('project') ? (int) $request->query('project') : null;

        // The filter lists are the viewer's own units, so the page can never
        // offer a department they are not entitled to look inside.
        $units = OrgScope::visibleUnits($viewer);

        return Inertia::render('Workload/Index', [
            'workload' => WorkloadService::build($users, $from, $to, $projectId),
            'filters' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'team' => $request->query('team'),
                'department' => $request->query('department'),
                'project' => $request->query('project'),
            ],
            'teams' => $units['teams']->map->only(['id', 'name'])->values(),
            'departments' => $units['departments']->map->only(['id', 'name'])->values(),
            'projects' => $this->visibleProjects($viewer),
            'scope' => $this->scopeLabel($viewer, $units),
            'maxDays' => WorkloadService::MAX_DAYS,
        ]);
    }

    /**
     * Whose workload this page is showing, in words.
     *
     * A head arriving at a page titled "Workload" would otherwise have no way
     * to tell a quiet branch from a page that is quietly showing them less than
     * they expected.
     *
     * @param  array{divisions: \Illuminate\Support\Collection, departments: \Illuminate\Support\Collection, teams: \Illuminate\Support\Collection}  $units
     */
    private function scopeLabel(User $viewer, array $units): ?string
    {
        if (OrgScope::seesEverything($viewer)) {
            return null;
        }

        $divisionIds = $units['divisions']->pluck('id');

        // Only the units they head themselves are named. Everything underneath
        // arrived with one of those and would just make the line longer, so a
        // department inside a division they run is left out of the sentence.
        $named = $units['divisions']->pluck('name')
            ->merge(
                $units['departments']
                    ->reject(fn ($d) => $divisionIds->contains($d->division_id))
                    ->pluck('name')
            );

        // Somebody who only leads a team can still be granted the permission
        // outright. Naming their team beats saying nothing, which would read as
        // "the whole organisation".
        if ($named->isEmpty()) {
            $named = $units['teams']->pluck('name');
        }

        return $named->isEmpty() ? null : $named->join(', ', ' and ');
    }

    /**
     * What one number on the grid is made of.
     *
     * Answers for one person and, usually, one day: the tasks whose estimates
     * add up to that cell, with how much of each landed there — plus the ones
     * carrying no estimate at all, which is the question the grid raises and
     * cannot answer.
     */
    public function breakdown(Request $request): JsonResponse
    {
        $viewer = $request->user();

        abort_unless($viewer->canViewWorkload(), 403);

        $validated = $request->validate([
            'user' => ['required', 'integer'],
            'from' => ['required', 'date'],
            'to' => ['required', 'date'],
            'date' => ['nullable', 'date'],
            'project' => ['nullable', 'integer'],
        ]);

        // Whose numbers this person may look at is the same question the grid
        // answers; asking it again here stops the drill-down being a way round
        // the scope the page applies.
        $subject = User::where('is_active', true)
            ->when(! OrgScope::seesEverything($viewer),
                fn ($q) => $q->whereIn('id', OrgScope::manageablePeopleIds($viewer)))
            ->find($validated['user']);

        abort_unless($subject, 404);

        $from = $this->parseDate($validated['from']) ?? now()->startOfWeek();
        $to = $this->parseDate($validated['to']) ?? $from->copy()->addDays(13);

        if ($to->lessThan($from)) {
            $to = $from->copy()->addDays(13);
        }

        $day = isset($validated['date']) ? $this->parseDate($validated['date']) : null;

        return response()->json([
            'user' => ['id' => $subject->id, 'name' => $subject->name],
            'date' => $day?->toDateString(),
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'daily_capacity_minutes' => (int) $subject->daily_capacity_minutes,
            ...WorkloadService::breakdown(
                $subject,
                $from,
                $to,
                $validated['project'] ?? null,
                $day,
            ),
        ]);
    }

    /**
     * Whose workload this person may see.
     *
     * Scope comes from OrgScope, the same downward walk of the org chart that
     * My Personnel and task cover use: a division head reaches every department
     * and team beneath their division, a department head reaches the teams
     * inside theirs, and admins reach everybody. Sharing that one rule is the
     * point — this page used to carry its own copy, which had no answer for a
     * division head at all and missed anyone filed under a team but with no
     * department stamped on their row.
     */
    private function visiblePeople(User $viewer, Request $request)
    {
        $columns = ['id', 'name', 'daily_capacity_minutes', 'working_days', 'team_id', 'department_id'];

        $query = User::where('is_active', true)->orderBy('name');

        if ($request->query('team')) {
            $query->where('team_id', (int) $request->query('team'));
        }

        if ($request->query('department')) {
            $query->where('department_id', (int) $request->query('department'));
        }

        if (OrgScope::seesEverything($viewer)) {
            return $query->get($columns);
        }

        // Narrowed to their own people, so a hand-typed team or department id
        // in the query string can only ever subtract from the branch they run.
        return $query->whereIn('id', OrgScope::manageablePeopleIds($viewer))->get($columns);
    }

    private function visibleProjects(User $viewer)
    {
        $query = Project::where('status', '!=', 'archived')->orderBy('name');

        if (!$viewer->can('manage-projects') && !$viewer->hasRole('executive')) {
            $overseen = FolderService::overseenFolderIds($viewer);

            $query->where(function ($q) use ($viewer, $overseen) {
                $q->where('owner_id', $viewer->id)
                    ->orWhereHas('members', fn ($m) => $m->where('users.id', $viewer->id))
                    ->orWhereHas('tasks', fn ($t) => $t->where('assigned_to', $viewer->id))
                    ->orWhereIn('folder_id', $overseen);
            });
        }

        return $query->get(['id', 'name']);
    }

    private function parseDate(?string $value): ?Carbon
    {
        if (!$value) {
            return null;
        }

        try {
            return Carbon::parse($value)->startOfDay();
        } catch (\Throwable) {
            return null;
        }
    }
}
