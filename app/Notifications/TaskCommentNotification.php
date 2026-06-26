<?php

namespace App\Notifications;

use App\Models\Task;
use App\Models\TaskComment;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Str;

class TaskCommentNotification extends Notification implements ShouldQueue
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
        $channels = ['database', 'broadcast'];
        if ($notifiable->wantsEmail('task_comment')) {
            $channels[] = 'mail';
        }
        return $channels;
    }

    public function toMail(object $notifiable): MailMessage
    {
        $preview = Str::limit(strip_tags($this->comment->body), 200);

        return (new MailMessage)
            ->subject("New Comment on: {$this->task->title}")
            ->greeting("Hello {$notifiable->name},")
            ->line("{$this->commentedBy->name} commented on a task you're assigned to.")
            ->line("**{$this->task->title}** in project {$this->task->project?->name}")
            ->line("\"{$preview}\"")
            ->action('View Task', url("/projects/{$this->task->project_id}/tasks/{$this->task->id}/edit"))
            ->line('Thank you for using ' . config('app.name') . '!');
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
