<?php

namespace App\Http\Controllers;

use App\Models\Task;
use App\Models\TaskTimeLog;
use App\Models\TimeLogAmendment;
use App\Models\User;
use App\Notifications\TimeLogAmendmentDecidedNotification;
use App\Notifications\TimeLogAmendmentRequestedNotification;
use App\Services\MotionEffortGenerator;
use App\Services\TimeTracker;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
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

    /**
     * Ask for an entry on a day that has none.
     *
     * The replacement for the manual box: work done away from the clock — a
     * site visit, a call taken at home, a day somebody forgot to press Start —
     * still has to be recordable, and now it goes through the same approval as
     * every other correction rather than round the back of it.
     */
    public function add(Request $request, Task $task): JsonResponse
    {
        $user = $request->user();

        abort_unless($this->canAmendTask($user, $task), 403);

        $data = $request->validate([
            'duration' => ['required', 'string', 'max:20'],
            'logged_on' => ['required', 'date', 'before_or_equal:today'],
            'reason' => ['required', 'string', 'max:1000'],
        ]);

        $minutes = TimeTracker::parseMinutes($data['duration']);

        if ($minutes === null || $minutes < 1 || $minutes > TaskTimeLog::MAX_MINUTES) {
            throw ValidationException::withMessages([
                'duration' => 'Enter a duration between 1 minute and 24 hours, like 1.5, 1:30 or 90m.',
            ]);
        }

        $day = Carbon::parse($data['logged_on'])->toDateString();

        if (TimeLogAmendment::pending()->where('task_id', $task->id)
            ->where('requested_by', $user->id)
            ->whereDate('logged_on', $day)
            ->exists()) {
            throw ValidationException::withMessages([
                'duration' => 'You have already asked for an entry on that date.',
            ]);
        }

        $reviewer = TimeLogAmendmentController::canReviewTask($user, $task) ? $user : null;

        $amendment = DB::transaction(function () use ($task, $user, $minutes, $data, $day, $reviewer) {
            $amendment = TimeLogAmendment::create([
                'kind' => TimeLogAmendment::ADD,
                'task_id' => $task->id,
                'logged_on' => $day,
                'requested_by' => $user->id,
                // Nothing was there before, which is the whole point of the
                // request — and what makes the trail readable afterwards.
                'original_minutes' => 0,
                'requested_minutes' => $minutes,
                'reason' => $data['reason'],
                'status' => $reviewer ? TimeLogAmendment::APPROVED : TimeLogAmendment::PENDING,
                'reviewed_by' => $reviewer?->id,
                'reviewed_at' => $reviewer ? now() : null,
            ]);

            if ($reviewer) {
                $this->writeAddition($amendment);
            }

            return $amendment;
        });

        if (! $reviewer) {
            $this->notifyReviewers(null, $amendment, $task);
        }

        return response()->json([
            'amendment' => $this->payload($amendment->load('requester:id,name', 'reviewer:id,name')),
            'applied' => $reviewer !== null,
            'total_minutes' => $task->loggedMinutes(),
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
        $task = $amendment->subjectTask();

        abort_if($task === null, 404);
        abort_unless(self::canReviewTask($request->user(), $task), 403);
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

            // Rejecting leaves the timesheet exactly as it was, and an addition
            // that is turned down never becomes an entry at all: the record of
            // what was asked for lives in the amendment, not in the timesheet.
            if ($status !== TimeLogAmendment::APPROVED) {
                return;
            }

            if ($amendment->isAddition()) {
                $this->writeAddition($amendment);

                return;
            }

            // Marked as amended so the effort generator leaves it alone: a
            // figure somebody argued for is not the clock's to overwrite.
            $timeLog->update([
                'minutes' => $amendment->requested_minutes,
                'amended_at' => now(),
            ]);
        });

        if ((int) $amendment->requested_by !== (int) $request->user()->id) {
            $amendment->requester?->notify(
                new TimeLogAmendmentDecidedNotification($amendment->fresh(), $request->user())
            );
        }

        $amendment = $amendment->fresh();

        return response()->json([
            'amendment' => $this->payload($amendment->load('requester:id,name', 'reviewer:id,name')),
            'minutes' => (int) ($amendment->timeLog?->minutes ?? 0),
            'total_minutes' => $task->loggedMinutes(),
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
        if (! $timeLog->task || ! $this->canAmendTask($user, $timeLog->task)) {
            return false;
        }

        return (int) $timeLog->user_id === (int) $user->id
            || self::canReview($user, $timeLog);
    }

    /**
     * Who may raise a correction on a task at all.
     *
     * A standalone task answers to nobody, so there is no approval to seek —
     * and it is the requester's own task anyway. Everyone else has to be able
     * to work on the task before they can claim time against it.
     */
    private function canAmendTask(User $user, Task $task): bool
    {
        return $task->project !== null && $user->can('update', $task);
    }

    /**
     * Turn an approved addition into the entry it asked for.
     *
     * Written as a stated figure and marked amended, so the generator neither
     * revises it nor counts the same hours twice when it shares out that day.
     */
    private function writeAddition(TimeLogAmendment $amendment): void
    {
        $task = $amendment->task;
        $requester = $amendment->requester ?? User::find($amendment->requested_by);

        if (! $task || ! $requester) {
            return;
        }

        $log = TimeTracker::declare(
            $task,
            $requester,
            $amendment->requested_minutes,
            $amendment->logged_on?->toDateString(),
            null,
            MotionEffortGenerator::MANUAL,
        );

        $log->update(['amended_at' => now()]);
        $amendment->update(['task_time_log_id' => $log->id]);

        // The day has a new statement in it, so what the clock was allowed to
        // infer about the rest of that day has changed.
        MotionEffortGenerator::forDay($requester, $amendment->logged_on ?? now());
    }

    /**
     * Tell the people who can act on it.
     *
     * The owner and the project's admins, rather than everybody holding
     * manage-projects: a correction on one task is not news for every
     * administrator in the organisation.
     */
    private function notifyReviewers(?TaskTimeLog $timeLog, TimeLogAmendment $amendment, ?Task $task = null): void
    {
        $project = ($task ?? $timeLog?->task)?->project;

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
            $recipient->notify(new TimeLogAmendmentRequestedNotification($amendment));
        }
    }

    public static function payload(TimeLogAmendment $amendment): array
    {
        return [
            'id' => $amendment->id,
            'time_log_id' => $amendment->task_time_log_id,
            'kind' => $amendment->kind,
            'logged_on' => ($amendment->logged_on ?? $amendment->timeLog?->logged_on)?->toDateString(),
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
