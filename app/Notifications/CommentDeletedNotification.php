<?php

namespace App\Notifications;

use App\Models\Task;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class CommentDeletedNotification extends Notification
{
    use Queueable;

    public function __construct(
        public Task $task,
        public User $deletedBy,
        public string $commentPreview,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database', 'broadcast'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'comment_deleted',
            'task_id' => $this->task->id,
            'task_title' => $this->task->title,
            'project_id' => $this->task->project_id,
            'project_name' => $this->task->project?->name,
            'deleted_by' => $this->deletedBy->name,
            'comment_preview' => $this->commentPreview,
        ];
    }
}
