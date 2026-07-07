<?php

namespace App\Notifications;

use App\Models\Task;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class TaskOverdueNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public Task $task,
    ) {}

    public function via(object $notifiable): array
    {
        $channels = ['database', 'broadcast'];
        if ($notifiable->wantsEmail('task_overdue')) {
            $channels[] = 'mail';
        }
        return $channels;
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
