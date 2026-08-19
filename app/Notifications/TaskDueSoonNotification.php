<?php

namespace App\Notifications;

use App\Models\Task;
use App\Notifications\Concerns\ChecksEmailPreference;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class TaskDueSoonNotification extends Notification implements ShouldQueue
{
    use ChecksEmailPreference;
    use Queueable;

    public function __construct(
        public Task $task,
    ) {}

    public function via(object $notifiable): array
    {
        return $this->channelsFor($notifiable, 'task_due_soon');
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("Task Due Tomorrow: {$this->task->title}")
            ->greeting("Hello {$notifiable->name},")
            ->line("Your task is due tomorrow.")
            ->line("**{$this->task->title}** in project {$this->task->project?->name}")
            ->line("Due date: {$this->task->due_date->toFormattedDateString()}")
            ->action('View Task', url($this->task->getEditUrl()))
            ->line('Thank you for using ' . config('app.name') . '!');
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'task_due_soon',
            'task_id' => $this->task->id,
            'task_title' => $this->task->title,
            'project_id' => $this->task->project_id,
            'project_name' => $this->task->project?->name,
            'due_date' => $this->task->due_date->toDateString(),
        ];
    }
}
