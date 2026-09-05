<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\TimeLogAmendment;
use App\Services\TimeTracker;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The queue of time corrections: what is waiting on you, and what you asked for.
 *
 * Corrections used to be reachable only through the notification that announced
 * them, which is fine on the day and useless a week later — a request nobody
 * clicked simply sat there, and the person who raised it had nowhere to look.
 *
 * Two lists, because they are two different jobs: "To decide" is work, "My
 * requests" is a status check. Somebody who runs no project sees only the
 * second, and the page says so rather than showing them an empty queue.
 */
class TimeCorrectionController extends Controller
{
    private const PER_PAGE = 20;

    public function index(Request $request): Response
    {
        $user = $request->user();

        $canDecideAny = TimeLogAmendment::query()->decidableBy($user)->exists();

        // Default to the queue when there is one to work, otherwise to the
        // person's own requests — landing on somebody else's empty inbox tells
        // them nothing about their own correction.
        $tab = $request->query('tab');
        $tab = in_array($tab, ['to_decide', 'mine'], true)
            ? $tab
            : ($canDecideAny ? 'to_decide' : 'mine');

        // Only "mine" may be viewed without running a project; asking for the
        // queue you cannot act on gets you your own list.
        if ($tab === 'to_decide' && ! $canDecideAny) {
            $tab = 'mine';
        }

        $status = $request->query('status');
        $status = in_array($status, [TimeLogAmendment::PENDING, TimeLogAmendment::APPROVED, TimeLogAmendment::REJECTED, 'all'], true)
            ? $status
            : TimeLogAmendment::PENDING;

        $projectId = (int) $request->query('project') ?: null;

        $base = fn () => $tab === 'to_decide'
            ? TimeLogAmendment::query()->decidableBy($user)
            : TimeLogAmendment::query()->where('requested_by', $user->id);

        $query = $base()
            ->with([
                'requester:id,name',
                'reviewer:id,name',
                'timeLog:id,task_id,user_id,minutes,logged_on,note',
                'timeLog.task:id,title,project_id',
                'timeLog.task.project:id,name',
                // An addition names its task directly — there is no entry to
                // reach it through until the day it is approved.
                'task:id,title,project_id',
                'task.project:id,name',
            ])
            ->when($status !== 'all', fn ($q) => $q->where('status', $status))
            ->when($projectId, fn ($q, $id) => $q->where(fn ($w) => $w
                ->whereHas('timeLog.task', fn ($t) => $t->where('project_id', $id))
                ->orWhereHas('task', fn ($t) => $t->where('project_id', $id))))
            // Oldest first while they are waiting — a queue is worked from the
            // front. Decided ones read newest first, which is a history.
            ->orderBy('created_at', $status === TimeLogAmendment::PENDING ? 'asc' : 'desc');

        $amendments = $query->paginate(self::PER_PAGE)->withQueryString();

        // Which projects appear in this list at all, for the filter. Taken from
        // the unfiltered set so choosing one never empties the dropdown that
        // chose it.
        $projectIds = (clone $base())
            ->with(['timeLog.task:id,project_id', 'task:id,project_id'])
            ->get()
            ->map(fn (TimeLogAmendment $a) => $a->timeLog?->task?->project_id ?? $a->task?->project_id)
            ->filter()
            ->unique();

        return Inertia::render('TimeCorrections/Index', [
            'amendments' => [
                'data' => collect($amendments->items())->map(fn (TimeLogAmendment $a) => $this->row($a))->all(),
                'links' => $amendments->linkCollection()->toArray(),
                'total' => $amendments->total(),
                'from' => $amendments->firstItem(),
                'to' => $amendments->lastItem(),
            ],
            'projects' => Project::whereIn('id', $projectIds)->orderBy('name')->get(['id', 'name']),
            'filters' => ['tab' => $tab, 'status' => $status, 'project' => $projectId],
            'canDecideAny' => $canDecideAny,
            'counts' => [
                'to_decide' => TimeLogAmendment::query()->decidableBy($user)->pending()->count(),
                'mine' => TimeLogAmendment::where('requested_by', $user->id)->pending()->count(),
            ],
        ]);
    }

    private function row(TimeLogAmendment $amendment): array
    {
        $log = $amendment->timeLog;
        $task = $amendment->subjectTask();

        return [
            'id' => $amendment->id,
            'kind' => $amendment->kind,
            'status' => $amendment->status,
            'reason' => $amendment->reason,
            'requester' => $amendment->requester?->name,
            'requested_by' => $amendment->requested_by,
            'requested_at' => $amendment->created_at?->toIso8601String(),
            'reviewer' => $amendment->reviewer?->name,
            'reviewed_at' => $amendment->reviewed_at?->toIso8601String(),
            'review_note' => $amendment->review_note,
            'original_duration' => TimeTracker::formatMinutes($amendment->original_minutes),
            'requested_duration' => TimeTracker::formatMinutes($amendment->requested_minutes),
            // What the entry says now, which is the requested figure once the
            // correction is approved and the original after a refusal.
            'current_duration' => TimeTracker::formatMinutes($log?->minutes),
            'logged_on' => ($amendment->logged_on ?? $log?->logged_on)?->toDateString(),
            'note' => $log?->note,
            'task_id' => $task?->id,
            'task_title' => $task?->title,
            'project_id' => $task?->project_id,
            'project_name' => $task?->project?->name,
        ];
    }
}
