<?php

namespace App\Notifications;

use App\Models\TaskTimeLog;
use App\Models\TimeLogAmendment;
use App\Services\TimeTracker;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Notification;

/**
 * Somebody wants a time entry corrected, and you are the one who decides.
 *
 * In-app only. The decision is usually made in the same sitting as the request
 * — the reviewer is looking at the task anyway — and a correction of half an
 * hour does not warrant an email in everyone's inbox.
 */
class TimeLogAmendmentRequestedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    /** The task or the entry may be gone by the time this is delivered. */
    public $deleteWhenMissingModels = true;

    public function __construct(
        public TimeLogAmendment $amendment,
        public TaskTimeLog $timeLog,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database', 'broadcast'];
    }

    /** Same short type live as stored, so the bell reads one name for both. */
    public function broadcastType(): string
    {
        return 'time_log_amendment_requested';
    }

    public function toArray(object $notifiable): array
    {
        $task = $this->timeLog->task;

        return [
            'type' => 'time_log_amendment_requested',
            'amendment_id' => $this->amendment->id,
            'task_id' => $task?->id,
            'task_title' => $task?->title,
            'project_id' => $task?->project_id,
            'project_name' => $task?->project?->name,
            'requested_by' => $this->amendment->requester?->name,
            'logged_on' => $this->timeLog->logged_on?->toDateString(),
            'from_duration' => TimeTracker::formatMinutes($this->amendment->original_minutes),
            'to_duration' => TimeTracker::formatMinutes($this->amendment->requested_minutes),
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }
}
