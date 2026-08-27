<?php

namespace App\Notifications;

use App\Models\Task;
use App\Models\TaskComment;
use App\Models\User;
use App\Notifications\Concerns\ChecksEmailPreference;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Str;

class TaskCommentNotification extends Notification implements ShouldQueue
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
        public User $commentedBy,
        public TaskComment $comment,
        public bool $isSubtaskComment = false,
    ) {}

    public function via(object $notifiable): array
    {
        return $this->channelsFor($notifiable, 'task_comment');
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
            ->action('View Task', url($this->task->getEditUrl()))
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
