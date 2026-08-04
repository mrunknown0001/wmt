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
 * Safe to queue because the payload is the removal of one comment by id:
 * arriving late, or out of order against another event, cannot leave a
 * client showing stale state. Events that carry a whole task for other
 * clients to reconcile against are deliberately still sent inline.
 */
class TaskCommentDeleted implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public int $taskId,
        public int $commentId,
        public int $deletedBy,
    ) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel("task.{$this->taskId}")];
    }

    public function broadcastAs(): string
    {
        return 'comment.deleted';
    }

    public function broadcastWith(): array
    {
        return [
            'comment_id' => $this->commentId,
            'deleted_by' => $this->deletedBy,
        ];
    }
}
