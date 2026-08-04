<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Project;
use App\Models\Team;
use App\Models\User;
use App\Services\FolderService;
use App\Services\WorkloadService;
use Illuminate\Support\Carbon;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class WorkloadController extends Controller
{
    public function index(Request $request): Response
    {
        $viewer = $request->user();

        $from = $this->parseDate($request->query('from')) ?? now()->startOfWeek();
        $to = $this->parseDate($request->query('to')) ?? $from->copy()->addDays(13);

        if ($to->lessThan($from)) {
            $to = $from->copy()->addDays(13);
        }

        $users = $this->visiblePeople($viewer, $request);

        $projectId = $request->query('project') ? (int) $request->query('project') : null;

        return Inertia::render('Workload/Index', [
            'workload' => WorkloadService::build($users, $from, $to, $projectId),
            'filters' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'team' => $request->query('team'),
                'department' => $request->query('department'),
                'project' => $request->query('project'),
            ],
            'teams' => Team::orderBy('name')->get(['id', 'name']),
            'departments' => Department::orderBy('name')->get(['id', 'name']),
            'projects' => $this->visibleProjects($viewer),
            'maxDays' => WorkloadService::MAX_DAYS,
        ]);
    }

    /**
     * Whose workload this person may see.
     *
     * Someone's hours are a management view, so it follows the same shape as
     * the rest of the app: admins and executives see everyone, a head or leader
     * sees their own unit, and anyone else sees themselves.
     */
    private function visiblePeople(User $viewer, Request $request)
    {
        $query = User::where('is_active', true)->orderBy('name');

        if ($request->query('team')) {
            $query->where('team_id', (int) $request->query('team'));
        }

        if ($request->query('department')) {
            $query->where('department_id', (int) $request->query('department'));
        }

        if ($viewer->can('manage-users') || $viewer->hasRole('executive')) {
            return $query->get(['id', 'name', 'daily_capacity_minutes', 'working_days', 'team_id', 'department_id']);
        }

        $ledTeams = Team::where('leader_id', $viewer->id)->pluck('id');
        $headedDepartments = Department::where('head_id', $viewer->id)->pluck('id');

        if ($ledTeams->isEmpty() && $headedDepartments->isEmpty()) {
            // Not responsible for anyone — their own load is still useful.
            return User::whereKey($viewer->id)
                ->get(['id', 'name', 'daily_capacity_minutes', 'working_days', 'team_id', 'department_id']);
        }

        return $query->where(function ($q) use ($ledTeams, $headedDepartments, $viewer) {
            $q->whereIn('team_id', $ledTeams)
                ->orWhereIn('department_id', $headedDepartments)
                ->orWhere('id', $viewer->id);
        })->get(['id', 'name', 'daily_capacity_minutes', 'working_days', 'team_id', 'department_id']);
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
