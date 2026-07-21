<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ApprovalItemUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public int $approvalProjectId,
        public array $item,
        public string $action,
        public int $actorId,
    ) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel("approval-project.{$this->approvalProjectId}"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'approval-item-updated';
    }
}
