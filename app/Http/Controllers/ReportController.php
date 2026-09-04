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

    /** What the project filter calls the tasks that belong to no project. */
    private const NO_PROJECT = 'none';

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

        // Lists, not single ids: every one of these filters takes several at
        // once, and a bookmark carrying a single id is just a list of one.
        //
        // "none" among the projects means the tasks that belong to no project —
        // the standalone ones. They are in the totals either way; without a way
        // to ask for them, picking every project still came up short of the
        // unfiltered figure with nothing on the page to explain the gap.
        $filters = [
            'project_ids' => self::idList($request, 'project'),
            'project_none' => self::hasNone($request, 'project'),
            'approval_project_ids' => self::idList($request, 'approval_project'),
            'assigned_to' => self::idList($request, 'assignee'),
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
                // Handed back the way the page sent it, sentinel and all, so
                // the filter can show "No project" as chosen.
                'project' => array_merge(
                    $filters['project_ids'],
                    $filters['project_none'] ? [self::NO_PROJECT] : [],
                ),
                'approval_project' => $filters['approval_project_ids'],
                'assignee' => $filters['assigned_to'],
            ],
            'projects' => $this->visibleProjects($user),
            'approvalProjects' => $this->visibleApprovalProjects($user),
            'people' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'maxDays' => self::MAX_DAYS,
        ]);
    }

    /**
     * A comma-joined list of ids from the query string.
     *
     * Tolerant of an old single-value link: "3" parses to [3] just as "3,7"
     * parses to [3, 7], so a bookmark saved before the filters went multiple
     * still lands on the same report.
     */
    /** Whether the "no project" sentinel is among the chosen values. */
    private static function hasNone(Request $request, string $key): bool
    {
        return collect(explode(',', (string) $request->query($key)))
            ->map(fn ($v) => trim($v))
            ->contains(self::NO_PROJECT);
    }

    private static function idList(Request $request, string $key): array
    {
        return collect(explode(',', (string) $request->query($key)))
            ->map(fn ($v) => (int) trim($v))
            ->filter()
            ->unique()
            ->values()
            ->all();
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
