<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TaskUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public ?int $projectId,
        public array $task,
        public string $changeType,
        public int $changedBy,
    ) {}

    public function broadcastOn(): array
    {
        if (! $this->projectId) {
            return [];
        }

        return [new PrivateChannel("project.{$this->projectId}")];
    }

    public function broadcastAs(): string
    {
        return 'task.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'task' => $this->task,
            'change_type' => $this->changeType,
            'changed_by' => $this->changedBy,
        ];
    }
}
