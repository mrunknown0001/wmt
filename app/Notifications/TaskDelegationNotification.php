<?php

namespace App\Notifications;

use App\Models\TaskDelegation;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Told when tasks change hands because of temporary cover.
 *
 * Both ends of the arrangement need saying: the stand-in has work they did not
 * ask for, and the owner needs to know it came back rather than discovering a
 * fortnight of tasks by accident.
 */
class TaskDelegationNotification extends Notification implements ShouldQueue
{
    use Queueable;

    private function __construct(
        public TaskDelegation $delegation,
        public string $event,
        public int $count,
    ) {}

    /** Sent to a stand-in when cover begins. */
    public static function started(TaskDelegation $delegation, int $count): self
    {
        return new self($delegation, 'started', $count);
    }

    /** Sent to the owner when their tasks come back. */
    public static function returned(TaskDelegation $delegation, int $count): self
    {
        return new self($delegation, 'returned', $count);
    }

    public function via(object $notifiable): array
    {
        return ['database', 'broadcast'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $tasks = $this->count . ' ' . str('task')->plural($this->count);

        return $this->event === 'started'
            ? (new MailMessage)
                ->subject('You are covering tasks for ' . $this->delegation->user?->name)
                ->greeting("Hello {$notifiable->name},")
                ->line("{$tasks} from {$this->delegation->user?->name} have been assigned to you for {$this->delegation->periodLabel()}.")
                ->line('They return automatically when the period ends.')
                ->action('View my tasks', url('/my-tasks'))
            : (new MailMessage)
                ->subject('Your tasks are back with you')
                ->greeting("Hello {$notifiable->name},")
                ->line("Temporary cover has ended and {$tasks} have returned to you.")
                ->action('View my tasks', url('/my-tasks'));
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => $this->event === 'started' ? 'task_delegation_started' : 'task_delegation_returned',
            'delegation_id' => $this->delegation->id,
            'owner_id' => $this->delegation->user_id,
            'owner_name' => $this->delegation->user?->name,
            'period' => $this->delegation->periodLabel(),
            'task_count' => $this->count,
            'message' => $this->event === 'started'
                ? "You are covering {$this->count} " . str('task')->plural($this->count) . " for {$this->delegation->user?->name} ({$this->delegation->periodLabel()})."
                : "{$this->count} " . str('task')->plural($this->count) . ' returned to you as temporary cover ended.',
        ];
    }
}
