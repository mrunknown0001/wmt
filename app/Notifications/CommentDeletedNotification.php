<?php

namespace App\Notifications;

use App\Models\Task;
use App\Models\User;
use App\Notifications\Concerns\ChecksEmailPreference;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class CommentDeletedNotification extends Notification implements ShouldQueue
{
    use ChecksEmailPreference;
    use Queueable;

    /**
     * Discard rather than fail when the record this is about has been deleted.
     *
     * A queued notification restores its models from the payload when the worker
     * picks it up. If the task, note or request has been removed in between, that
     * lookup throws and the job lands in failed_jobs — for a message that no
     * longer has anything to say. Six of these accumulated from delegations whose
     * subject was deleted before delivery.
     */
    public $deleteWhenMissingModels = true;

    public function __construct(
        public Task $task,
        public User $deletedBy,
        public string $commentPreview,
    ) {}

    public function via(object $notifiable): array
    {
        return $this->channelsFor($notifiable, 'comment_deleted');
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
