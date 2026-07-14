<?php

namespace App\Events;

use App\Models\Task;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

class TaskMetaUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets;

    public ?int $projectId;

    public int $taskId;

    public ?int $parentId;

    public int $commentsCount;

    public int $attachmentsCount;

    public function __construct(Task $task)
    {
        $this->projectId = $task->project_id;
        $this->taskId = $task->id;
        $this->parentId = $task->parent_id;
        $this->commentsCount = $task->comments()->count();
        $this->attachmentsCount = $task->attachments()->count();
    }

    public function broadcastOn(): array
    {
        if (! $this->projectId) {
            return [];
        }

        return [new PrivateChannel("project.{$this->projectId}")];
    }

    public function broadcastAs(): string
    {
        return 'task.meta';
    }

    public function broadcastWith(): array
    {
        return [
            'task_id' => $this->taskId,
            'parent_id' => $this->parentId,
            'comments_count' => $this->commentsCount,
            'attachments_count' => $this->attachmentsCount,
        ];
    }
}
