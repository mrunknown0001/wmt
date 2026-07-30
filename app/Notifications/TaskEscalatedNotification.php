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
        /**
         * How late the task is, in the words of the rule that fired — "6 hours
         * overdue". Null for the global tiers, which are always whole days and
         * can say so from the due date alone.
         */
        public ?string $overdueLabel = null,
    ) {}

    /** "3 days overdue" — the rule's own wording where there is one. */
    private function overdueText(): string
    {
        if ($this->overdueLabel) {
            return $this->overdueLabel;
        }

        // From the due date forward — the other way round gives a negative
        // number, which is how the tier comparison used to fail.
        $days = (int) $this->task->due_date->copy()->startOfDay()->diffInDays(now()->startOfDay());

        return $days . ' day' . ($days === 1 ? '' : 's') . ' overdue';
    }

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
        return (new MailMessage)
            ->subject("Escalation (Level {$this->escalationLevel}): {$this->task->title}")
            ->greeting("Hello {$notifiable->name},")
            ->line("A task is {$this->overdueText()} and has been escalated.")
            ->line("**{$this->task->title}** in project {$this->task->project?->name}")
            ->line("Assigned to: {$this->task->assignee?->name}")
            ->line('Due: ' . $this->task->due_date->toFormattedDateString()
                . ($this->task->due_time_label ? " at {$this->task->due_time_label}" : ''))
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
            'overdue_label' => $this->overdueText(),
            'due_time' => $this->task->due_time_label,
            'assigned_to_name' => $this->task->assignee?->name,
        ];
    }
}
