<?php

namespace App\Http\Controllers;

use App\Models\Task;
use App\Models\TaskTimeLog;
use App\Models\TimeLogAmendment;
use App\Models\User;
use App\Notifications\TimeLogAmendmentDecidedNotification;
use App\Notifications\TimeLogAmendmentRequestedNotification;
use App\Services\TimeTracker;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Corrections to time already recorded.
 *
 * A timer stopped at lunch and remembered at five, or one left running all
 * night, both leave an entry that is simply wrong — and the effort reports are
 * built on those entries. So the figure can be changed, but not quietly: the
 * person says what it should be and why, and whoever runs the project decides.
 *
 * Somebody who could approve the request anyway does not have to ask themselves
 * for permission — their amendment applies at once, and is recorded as decided
 * by them so the trail reads the same either way.
 */
class TimeLogAmendmentController extends Controller
{
    public function store(Request $request, TaskTimeLog $timeLog): JsonResponse
    {
        $user = $request->user();

        // Your own entry, or anybody's if you run the project — the same rule
        // that governs deleting one.
        abort_unless($this->canAmend($user, $timeLog), 403);

        // Nothing to amend on a timer that has not been stopped: it has no
        // figure yet, and stopping it will write one.
        abort_if($timeLog->isRunning(), 422, 'This timer is still running — stop it first.');

        $data = $request->validate([
            'duration' => ['required', 'string', 'max:20'],
            'reason' => ['required', 'string', 'max:1000'],
        ]);

        $minutes = TimeTracker::parseMinutes($data['duration']);

        if ($minutes === null || $minutes < 1 || $minutes > TaskTimeLog::MAX_MINUTES) {
            throw ValidationException::withMessages([
                'duration' => 'Enter a duration between 1 minute and 24 hours, like 1.5, 1:30 or 90m.',
            ]);
        }

        if ($minutes === (int) $timeLog->minutes) {
            throw ValidationException::withMessages([
                'duration' => 'That is what the entry already says.',
            ]);
        }

        // One request at a time per entry. Two pending amendments would leave
        // the reviewer choosing between figures that were each written without
        // knowledge of the other.
        if ($timeLog->amendments()->pending()->exists()) {
            throw ValidationException::withMessages([
                'duration' => 'This entry already has a correction waiting for a decision.',
            ]);
        }

        $reviewer = $this->canReview($user, $timeLog) ? $user : null;

        $amendment = DB::transaction(function () use ($timeLog, $user, $minutes, $data, $reviewer) {
            $amendment = TimeLogAmendment::create([
                'task_time_log_id' => $timeLog->id,
                'requested_by' => $user->id,
                'original_minutes' => (int) $timeLog->minutes,
                'requested_minutes' => $minutes,
                'reason' => $data['reason'],
                'status' => $reviewer ? TimeLogAmendment::APPROVED : TimeLogAmendment::PENDING,
                'reviewed_by' => $reviewer?->id,
                'reviewed_at' => $reviewer ? now() : null,
            ]);

            if ($reviewer) {
                $timeLog->update(['minutes' => $minutes]);
            }

            return $amendment;
        });

        if (! $reviewer) {
            $this->notifyReviewers($timeLog, $amendment);
        }

        return response()->json([
            'amendment' => $this->payload($amendment->load('requester:id,name', 'reviewer:id,name')),
            'applied' => $reviewer !== null,
            'total_minutes' => $timeLog->task?->loggedMinutes(),
        ], 201);
    }

    public function approve(Request $request, TimeLogAmendment $amendment): JsonResponse
    {
        return $this->decide($request, $amendment, TimeLogAmendment::APPROVED);
    }

    public function reject(Request $request, TimeLogAmendment $amendment): JsonResponse
    {
        return $this->decide($request, $amendment, TimeLogAmendment::REJECTED);
    }

    private function decide(Request $request, TimeLogAmendment $amendment, string $status): JsonResponse
    {
        $timeLog = $amendment->timeLog;

        abort_if($timeLog === null, 404);
        abort_unless($this->canReview($request->user(), $timeLog), 403);
        abort_unless($amendment->isPending(), 422, 'This correction has already been decided.');

        $data = $request->validate([
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        DB::transaction(function () use ($amendment, $timeLog, $status, $data, $request) {
            $amendment->update([
                'status' => $status,
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
                'review_note' => $data['note'] ?? null,
            ]);

            // Rejecting leaves the entry exactly as it was: the record of what
            // was asked for lives in the amendment, not in the timesheet.
            if ($status === TimeLogAmendment::APPROVED) {
                $timeLog->update(['minutes' => $amendment->requested_minutes]);
            }
        });

        if ((int) $amendment->requested_by !== (int) $request->user()->id) {
            $amendment->requester?->notify(
                new TimeLogAmendmentDecidedNotification($amendment->fresh(), $request->user())
            );
        }

        return response()->json([
            'amendment' => $this->payload($amendment->fresh()->load('requester:id,name', 'reviewer:id,name')),
            'minutes' => (int) $timeLog->fresh()->minutes,
            'total_minutes' => $timeLog->task?->loggedMinutes(),
        ]);
    }

    /** Whoever runs the project decides — owner, project admins, managers. */
    public static function canReview(User $user, TaskTimeLog $timeLog): bool
    {
        return $timeLog->task !== null && self::canReviewTask($user, $timeLog->task);
    }

    /** The same question asked of a task, before any entry is in hand. */
    public static function canReviewTask(User $user, Task $task): bool
    {
        $project = $task->project;

        return $project !== null && $user->can('update', $project);
    }

    /** Whose entry may be corrected by whom. */
    private function canAmend(User $user, TaskTimeLog $timeLog): bool
    {
        // A standalone task answers to nobody, so there is no approval to seek
        // — and its owner can already edit their own entries directly.
        if ($timeLog->task?->project === null) {
            return false;
        }

        return (int) $timeLog->user_id === (int) $user->id
            || self::canReview($user, $timeLog);
    }

    /**
     * Tell the people who can act on it.
     *
     * The owner and the project's admins, rather than everybody holding
     * manage-projects: a correction on one task is not news for every
     * administrator in the organisation.
     */
    private function notifyReviewers(TaskTimeLog $timeLog, TimeLogAmendment $amendment): void
    {
        $project = $timeLog->task?->project;

        if (! $project) {
            return;
        }

        $recipients = collect([$project->owner])
            ->merge($project->members()->wherePivot('role', 'admin')->get())
            ->filter()
            ->unique('id')
            // Nobody needs telling about their own request.
            ->reject(fn (User $u) => (int) $u->id === (int) $amendment->requested_by);

        foreach ($recipients as $recipient) {
            $recipient->notify(new TimeLogAmendmentRequestedNotification($amendment, $timeLog));
        }
    }

    public static function payload(TimeLogAmendment $amendment): array
    {
        return [
            'id' => $amendment->id,
            'time_log_id' => $amendment->task_time_log_id,
            'status' => $amendment->status,
            'original_minutes' => $amendment->original_minutes,
            'requested_minutes' => $amendment->requested_minutes,
            'original_duration' => TimeTracker::formatMinutes($amendment->original_minutes),
            'requested_duration' => TimeTracker::formatMinutes($amendment->requested_minutes),
            'reason' => $amendment->reason,
            'requested_by' => $amendment->requested_by,
            'requester' => $amendment->relationLoaded('requester') ? $amendment->requester?->name : null,
            'reviewer' => $amendment->relationLoaded('reviewer') ? $amendment->reviewer?->name : null,
            'reviewed_at' => $amendment->reviewed_at?->toIso8601String(),
            'review_note' => $amendment->review_note,
        ];
    }
}
