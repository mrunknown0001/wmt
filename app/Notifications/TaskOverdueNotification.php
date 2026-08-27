<?php

namespace App\Notifications;

use App\Models\Task;
use App\Notifications\Concerns\ChecksEmailPreference;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class TaskOverdueNotification extends Notification implements ShouldQueue
{
    use ChecksEmailPreference;
    use Queueable;

    /**
     * Discard rather than fail when the record this is about has been deleted.
     *
     * A queued notification restores its models from the payload when the worker
     * picks it up. If the task, note or request has been removed in between, that
     * lookup throws and the job lands in failed_jobs — for a message that no
     * longer has anything to say. Six of these accumulated from delegations whose
     * subject was deleted before delivery.
     */
    public $deleteWhenMissingModels = true;

    public function __construct(
        public Task $task,
    ) {}

    public function via(object $notifiable): array
    {
        return $this->channelsFor($notifiable, 'task_overdue');
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("Task Overdue: {$this->task->title}")
            ->greeting("Hello {$notifiable->name},")
            ->line("Your task is overdue.")
            ->line("**{$this->task->title}** in project {$this->task->project?->name}")
            ->line("Due date: {$this->task->due_date->toFormattedDateString()}")
            ->action('View Task', url($this->task->getEditUrl()))
            ->salutation('Please complete this task as soon as possible.');
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'task_overdue',
            'task_id' => $this->task->id,
            'task_title' => $this->task->title,
            'project_id' => $this->task->project_id,
            'project_name' => $this->task->project?->name,
            'due_date' => $this->task->due_date->toDateString(),
        ];
    }
}
