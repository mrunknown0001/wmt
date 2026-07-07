<?php

namespace App\Notifications;

use App\Models\Task;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class CommentDeletedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public Task $task,
        public User $deletedBy,
        public string $commentPreview,
    ) {}

    public function via(object $notifiable): array
    {
        $channels = ['database', 'broadcast'];
        if ($notifiable->wantsEmail('comment_deleted')) {
            $channels[] = 'mail';
        }
        return $channels;
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("Comment Deleted on: {$this->task->title}")
            ->greeting("Hello {$notifiable->name},")
            ->line("{$this->deletedBy->name} deleted a comment that mentioned you.")
            ->line("**{$this->task->title}** in project {$this->task->project?->name}")
            ->line("\"{$this->commentPreview}\"")
            ->action('View Task', url($this->task->getEditUrl()))
            ->line('Thank you for using ' . config('app.name') . '!');
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
