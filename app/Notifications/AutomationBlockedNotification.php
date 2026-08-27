<?php

namespace App\Notifications;

use App\Models\Task;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * An automation rule tried to close a task but a project rule refused it —
 * almost always the "attachment required before completing" rule.
 *
 * Sent because the task silently stays open otherwise: the person waiting on it
 * has no way to know the automation didn't fire, and the scheduled trigger runs
 * from the CLI where no toast can reach anyone.
 */
class AutomationBlockedNotification extends Notification implements ShouldQueue
{
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
        public string $ruleName,
        public string $reason,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database', 'broadcast'];
    }

    public function broadcastType(): string
    {
        return 'automation_blocked';
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'automation_blocked',
            'task_id' => $this->task->id,
            'task_title' => $this->task->title,
            'project_id' => $this->task->project_id,
            'project_name' => $this->task->project?->name,
            'rule_name' => $this->ruleName,
            'reason' => $this->reason,
        ];
    }
}
