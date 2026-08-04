<?php

namespace App\Http\Controllers;

use App\Models\Task;
use App\Models\TaskDelegation;
use App\Services\OrgScope;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The people a supervisor is responsible for, laid out as the org chart is.
 *
 * A team leader sees their team; a department head sees their department and
 * the teams inside it; a division head sees the whole branch. Everyone else has
 * nobody to look at and does not get the page.
 *
 * Scope comes from Division.head_id / Department.head_id / Team.leader_id, the
 * same rule the calendar filters and task cover use.
 */
class MyPersonnelController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();

        abort_unless(OrgScope::hasAnyScope($user), 403);

        $peopleIds = OrgScope::manageablePeopleIds($user);

        return Inertia::render('MyPersonnel/Index', [
            'units' => OrgScope::personnelTree($user, $this->taskStats($peopleIds)),
            'coveredBy' => $this->coverNotes($peopleIds),
            'viewerId' => $user->id,
        ]);
    }

    /**
     * Open and overdue task counts for everyone on the page.
     *
     * Two grouped queries for the whole list rather than a pair per person —
     * a division head can easily be looking at a hundred people.
     *
     * @return array<int, array{open_tasks: int, overdue_tasks: int}>
     */
    private function taskStats($peopleIds): array
    {
        if ($peopleIds->isEmpty()) {
            return [];
        }

        $open = Task::query()
            ->whereIn('assigned_to', $peopleIds)
            ->whereNotIn('status', Task::CLOSING_STATUSES)
            ->groupBy('assigned_to')
            ->pluck(DB::raw('count(*)'), 'assigned_to');

        $overdue = Task::query()
            ->whereIn('assigned_to', $peopleIds)
            ->whereNotIn('status', Task::CLOSING_STATUSES)
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<', now()->toDateString())
            ->groupBy('assigned_to')
            ->pluck(DB::raw('count(*)'), 'assigned_to');

        $stats = [];

        foreach ($peopleIds as $id) {
            $stats[$id] = [
                'open_tasks' => (int) ($open[$id] ?? 0),
                'overdue_tasks' => (int) ($overdue[$id] ?? 0),
            ];
        }

        return $stats;
    }

    /**
     * Who is currently away, and who is holding their work.
     *
     * A supervisor looking at their people wants to know that somebody's queue
     * is temporarily somebody else's before reading anything into the numbers.
     *
     * @return array<int, array{delegates: array, period: string}>
     */
    private function coverNotes($peopleIds): array
    {
        if ($peopleIds->isEmpty()) {
            return [];
        }

        return TaskDelegation::running()
            ->whereIn('user_id', $peopleIds)
            ->with('delegates:id,name')
            ->get()
            ->mapWithKeys(fn (TaskDelegation $d) => [$d->user_id => [
                'delegates' => $d->delegates->pluck('name')->all(),
                'period' => $d->periodLabel(),
            ]])
            ->all();
    }
}
