<?php

namespace App\Notifications;

use App\Models\Setting;
use App\Models\Task;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class TaskEscalatedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public Task $task,
        public int $escalationLevel,
        public string $escalationLabel,
    ) {}

    public function via(object $notifiable): array
    {
        $channels = ['database', 'broadcast'];
        if (Setting::current()->wantsEmail('task_escalated')) {
            $channels[] = 'mail';
        }
        return $channels;
    }

    public function toMail(object $notifiable): MailMessage
    {
        $daysOverdue = now()->startOfDay()->diffInDays($this->task->due_date);

        return (new MailMessage)
            ->subject("Escalation (Level {$this->escalationLevel}): {$this->task->title}")
            ->greeting("Hello {$notifiable->name},")
            ->line("A task has been overdue for {$daysOverdue} days and has been escalated.")
            ->line("**{$this->task->title}** in project {$this->task->project?->name}")
            ->line("Assigned to: {$this->task->assignee?->name}")
            ->line("Due date: {$this->task->due_date->toFormattedDateString()}")
            ->line("Escalation level: {$this->escalationLabel}")
            ->action('View Task', url($this->task->getEditUrl()))
            ->salutation('Please take action on this overdue task.');
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'task_escalated',
            'task_id' => $this->task->id,
            'task_title' => $this->task->title,
            'project_id' => $this->task->project_id,
            'project_name' => $this->task->project?->name,
            'due_date' => $this->task->due_date->toDateString(),
            'escalation_level' => $this->escalationLevel,
            'escalation_label' => $this->escalationLabel,
            'assigned_to_name' => $this->task->assignee?->name,
        ];
    }
}
