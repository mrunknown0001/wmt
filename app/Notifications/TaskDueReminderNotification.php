<?php

namespace App\Notifications;

use App\Models\Task;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class TaskDueReminderNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public Task $task,
        public int $daysBefore,
    ) {}

    public function via(object $notifiable): array
    {
        $channels = ['database', 'broadcast'];
        if ($notifiable->wantsEmail('task_due_reminder')) {
            $channels[] = 'mail';
        }
        return $channels;
    }

    public function toMail(object $notifiable): MailMessage
    {
        $subject = $this->daysBefore === 1
            ? "Task Due Tomorrow: {$this->task->title}"
            : "Task Due in {$this->daysBefore} Days: {$this->task->title}";

        $line = $this->daysBefore === 1
            ? 'Your task is due tomorrow.'
            : "Your task is due in {$this->daysBefore} days.";

        return (new MailMessage)
            ->subject($subject)
            ->greeting("Hello {$notifiable->name},")
            ->line($line)
            ->line("**{$this->task->title}** in project {$this->task->project?->name}")
            ->line("Due date: {$this->task->due_date->toFormattedDateString()}")
            ->action('View Task', url("/projects/{$this->task->project_id}/tasks/{$this->task->id}/edit"))
            ->line('Thank you for using ' . config('app.name') . '!');
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'task_due_reminder',
            'task_id' => $this->task->id,
            'task_title' => $this->task->title,
            'project_id' => $this->task->project_id,
            'project_name' => $this->task->project?->name,
            'due_date' => $this->task->due_date->toDateString(),
            'days_before' => $this->daysBefore,
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }
}
