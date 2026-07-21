<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ApprovalAutomationRuleExecuted implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public int $approvalProjectId,
        public string $ruleName,
        public array $item,
        public array $actionSummaries,
    ) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel("approval-project.{$this->approvalProjectId}"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'approval-automation-rule-executed';
    }
}
