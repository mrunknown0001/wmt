<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Broadcast through the queue rather than inline.
 *
 * Safe to queue because the payload is a notice that a rule ran:
 * arriving late, or out of order against another event, cannot leave a
 * client showing stale state. Events that carry a whole task for other
 * clients to reconcile against are deliberately still sent inline.
 */
class AutomationRuleExecuted implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public int $projectId,
        public string $ruleName,
        public array $task,
        public array $actionsExecuted,
    ) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel("project.{$this->projectId}")];
    }

    public function broadcastAs(): string
    {
        return 'automation.executed';
    }

    public function broadcastWith(): array
    {
        return [
            'rule_name' => $this->ruleName,
            'task' => $this->task,
            'actions' => $this->actionsExecuted,
        ];
    }
}
