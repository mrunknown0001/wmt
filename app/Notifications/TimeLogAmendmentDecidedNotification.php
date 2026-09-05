<?php

namespace App\Notifications;

use App\Models\TimeLogAmendment;
use App\Models\User;
use App\Services\TimeTracker;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Notification;

/** Your correction was approved or turned down. In-app only, like the request. */
class TimeLogAmendmentDecidedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public $deleteWhenMissingModels = true;

    public function __construct(
        public TimeLogAmendment $amendment,
        public User $decidedBy,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database', 'broadcast'];
    }

    /** Same short type live as stored, so the bell reads one name for both. */
    public function broadcastType(): string
    {
        return 'time_log_amendment_decided';
    }

    public function toArray(object $notifiable): array
    {
        $task = $this->amendment->subjectTask();

        return [
            'type' => 'time_log_amendment_decided',
            'amendment_id' => $this->amendment->id,
            'status' => $this->amendment->status,
            'task_id' => $task?->id,
            'task_title' => $task?->title,
            'project_id' => $task?->project_id,
            'decided_by' => $this->decidedBy->name,
            'kind' => $this->amendment->kind,
            'logged_on' => ($this->amendment->logged_on ?? $this->amendment->timeLog?->logged_on)?->toDateString(),
            'to_duration' => TimeTracker::formatMinutes($this->amendment->requested_minutes),
            'review_note' => $this->amendment->review_note,
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }
}
