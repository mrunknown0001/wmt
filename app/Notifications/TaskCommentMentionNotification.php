<?php

namespace App\Notifications;

use App\Models\Task;
use App\Models\TaskComment;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class TaskCommentMentionNotification extends Notification
{
    use Queueable;

    public function __construct(
        public Task $task,
        public User $mentionedBy,
        public TaskComment $comment,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database', 'broadcast'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'task_comment_mention',
            'task_id' => $this->task->id,
            'task_title' => $this->task->title,
            'project_id' => $this->task->project_id,
            'project_name' => $this->task->project?->name,
            'mentioned_by' => $this->mentionedBy->name,
            'comment_preview' => \Illuminate\Support\Str::limit($this->comment->body, 100),
        ];
    }
}
