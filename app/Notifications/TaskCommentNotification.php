<?php

namespace App\Notifications;

use App\Models\Task;
use App\Models\TaskComment;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Str;

class TaskCommentNotification extends Notification
{
    use Queueable;

    public function __construct(
        public Task $task,
        public User $commentedBy,
        public TaskComment $comment,
        public bool $isSubtaskComment = false,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database', 'broadcast'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => $this->isSubtaskComment ? 'subtask_comment' : 'task_comment',
            'task_id' => $this->task->id,
            'task_title' => $this->task->title,
            'project_id' => $this->task->project_id,
            'project_name' => $this->task->project?->name,
            'commented_by' => $this->commentedBy->name,
            'comment_preview' => Str::limit(strip_tags($this->comment->body), 100),
        ];
    }
}
