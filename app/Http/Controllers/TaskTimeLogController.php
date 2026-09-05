<?php

namespace App\Http\Controllers;

use App\Models\Task;
use App\Models\TaskTimeLog;
use App\Models\TimeLogAmendment;
use App\Services\MotionEffortGenerator;
use App\Services\TimeTracker;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The time recorded against a task.
 *
 * Reading and removing only. Nothing here writes an entry any more: effort is
 * worked out from the task's clock by MotionEffortGenerator, and the two ways a
 * person can put a figure of their own on the record — pausing for the day, and
 * asking for a correction — live with the clock and with the corrections queue
 * respectively.
 */
class TaskTimeLogController extends Controller
{
    /** Entries on a task, newest first. */
    public function index(Request $request, Task $task): JsonResponse
    {
        $this->authorize('view', $task);

        $logs = $task->timeLogs()
            ->with(['user:id,name', 'amendments' => fn ($q) => $q->latest('id')->with('requester:id,name', 'reviewer:id,name')])
            ->latest('logged_on')->latest('id')->get();

        return response()->json([
            'logs' => $logs->map(fn (TaskTimeLog $log) => $this->payload($log)),
            'total_minutes' => $task->loggedMinutes(),
            'estimated_minutes' => $task->estimated_minutes,
            // Whether the person reading this decides corrections, so the panel
            // knows to offer Approve and Reject rather than "waiting".
            'can_review_amendments' => TimeLogAmendmentController::canReviewTask($request->user(), $task),
            // Amendments need somewhere to go: a standalone task has no project
            // and therefore nobody to approve one.
            'amendments_available' => $task->project_id !== null,
            // What day it is here. The browser's own answer is the viewer's
            // timezone, which put somebody in Manila a day behind all morning
            // and offered them yesterday's date by default.
            'today' => now()->toDateString(),
        ]);
    }

    /**
     * Remove an entry somebody put there.
     *
     * Only a stated one — a pause figure or an approved addition. A generated
     * entry is not a record of anybody's decision, so deleting it would say
     * nothing and the next recalculation would put it straight back; the way to
     * disagree with the clock is a correction.
     */
    public function destroy(Request $request, TaskTimeLog $timeLog): JsonResponse
    {
        // Your own entries, or anyone's if you can manage the project's tasks —
        // a supervisor correcting a mis-key is the normal case.
        $ownsIt = (int) $timeLog->user_id === (int) $request->user()->id;

        abort_unless($ownsIt || $request->user()->can('update', $timeLog->task), 403);

        abort_if(
            $timeLog->isGenerated(),
            422,
            'This entry comes from the task clock. Ask for a correction instead of deleting it.',
        );

        $task = $timeLog->task;
        $owner = $timeLog->user;
        $day = $timeLog->logged_on;
        $timeLog->delete();

        // That day had a statement in it that is now gone, so what the clock is
        // allowed to infer about the rest of the day has changed.
        if ($owner && $day) {
            MotionEffortGenerator::forDay($owner, $day);
        }

        return response()->json(['total_minutes' => $task?->loggedMinutes() ?? 0]);
    }

    private function payload(TaskTimeLog $log): array
    {
        $pending = $log->relationLoaded('amendments')
            ? $log->amendments->firstWhere('status', TimeLogAmendment::PENDING)
            : null;

        return [
            'id' => $log->id,
            'task_id' => $log->task_id,
            'task_title' => $log->relationLoaded('task') ? $log->task?->title : null,
            // Carried so the header indicator can link straight to the task.
            'project_id' => $log->relationLoaded('task') ? $log->task?->project_id : null,
            'user' => $log->relationLoaded('user') ? $log->user?->name : null,
            'user_id' => $log->user_id,
            'minutes' => $log->minutes,
            // "none" rather than a dash: somebody said this day was worth
            // nothing on this task, which is different from having no figure.
            'duration' => $log->minutes === 0 ? 'none' : TimeTracker::formatMinutes($log->minutes),
            'logged_on' => $log->logged_on?->toDateString(),
            'note' => $log->note,
            // Where the figure came from, so a reader can tell a number the
            // clock worked out from one a person stood behind.
            'source' => $log->source,
            'generated' => $log->isGenerated(),
            // The correction waiting on a decision, and whether this entry has
            // ever been corrected — an amended figure should not pass for an
            // untouched one.
            'pending_amendment' => $pending ? TimeLogAmendmentController::payload($pending) : null,
            'amended' => $log->relationLoaded('amendments')
                && $log->amendments->contains('status', TimeLogAmendment::APPROVED),
        ];
    }
}
