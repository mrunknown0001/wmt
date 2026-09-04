<?php

namespace App\Http\Controllers;

use App\Models\ApprovalProject;
use App\Models\Project;
use App\Models\User;
use App\Services\FolderService;
use App\Services\ReportService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class ReportController extends Controller
{
    /** Longest window a single report will cover. */
    private const MAX_DAYS = 366;

    public function index(Request $request): Response
    {
        $user = $request->user();

        $to = $this->parseDate($request->query('to')) ?? now()->endOfDay();
        $from = $this->parseDate($request->query('from')) ?? $to->copy()->subDays(29)->startOfDay();

        if ($from->greaterThan($to)) {
            $from = $to->copy()->subDays(29)->startOfDay();
        }

        if ($from->diffInDays($to) > self::MAX_DAYS) {
            $from = $to->copy()->subDays(self::MAX_DAYS)->startOfDay();
        }

        $filters = [
            'project_id' => $request->query('project') ? (int) $request->query('project') : null,
            'approval_project_id' => $request->query('approval_project') ? (int) $request->query('approval_project') : null,
            'assigned_to' => $request->query('assignee') ? (int) $request->query('assignee') : null,
        ];

        return Inertia::render('Reports/Index', [
            'cycleTime' => ReportService::cycleTime($user, $from, $to, $filters),
            'onTime' => ReportService::onTime($user, $from, $to, $filters),
            'throughput' => ReportService::throughput($user, $from, $to, $filters),
            'effort' => ReportService::effort($user, $from, $to, $filters),
            'estimateAccuracy' => ReportService::estimateAccuracy($user, $from, $to, $filters),
            'elapsedAccuracy' => ReportService::elapsedAccuracy($user, $from, $to, $filters),
            'approvals' => ReportService::approvalTurnaround($user, $from, $to, $filters),
            'approvers' => ReportService::approverTurnaround($from, $to, $filters),
            'escalations' => ReportService::escalations($user, $filters),
            'filters' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'project' => $filters['project_id'],
                'approval_project' => $filters['approval_project_id'],
                'assignee' => $filters['assigned_to'],
            ],
            'projects' => $this->visibleProjects($user),
            'approvalProjects' => $this->visibleApprovalProjects($user),
            'people' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'maxDays' => self::MAX_DAYS,
        ]);
    }

    private function visibleProjects(User $user)
    {
        $query = Project::where('status', '!=', 'archived')->orderBy('name');

        if (!$user->can('manage-projects') && !$user->hasRole('executive')) {
            $overseen = FolderService::overseenFolderIds($user);

            $query->where(function ($q) use ($user, $overseen) {
                $q->where('owner_id', $user->id)
                    ->orWhereHas('members', fn ($m) => $m->where('users.id', $user->id))
                    ->orWhereHas('tasks', fn ($t) => $t->where('assigned_to', $user->id))
                    ->orWhereIn('folder_id', $overseen);
            });
        }

        return $query->get(['id', 'name']);
    }

    private function visibleApprovalProjects(User $user)
    {
        if (!$user->canAccessApprovals()) {
            return collect();
        }

        $query = ApprovalProject::where('status', '!=', 'archived')->orderBy('name');

        if (!$user->can('manage-approval-projects') && !$user->hasRole('executive')) {
            $query->where(function ($q) use ($user) {
                $q->where('owner_id', $user->id)
                    ->orWhereHas('members', fn ($m) => $m->where('user_id', $user->id));
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
            return Carbon::parse($value)->endOfDay();
        } catch (\Throwable) {
            return null;
        }
    }
}
