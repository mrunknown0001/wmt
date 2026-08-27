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

class TaskCommentMentionNotification extends Notification implements ShouldQueue
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
        public User $mentionedBy,
        public TaskComment $comment,
    ) {}

    public function via(object $notifiable): array
    {
        return $this->channelsFor($notifiable, 'task_mention');
    }

    public function toMail(object $notifiable): MailMessage
    {
        $preview = Str::limit(strip_tags($this->comment->body), 200);

        return (new MailMessage)
            ->subject("You were mentioned in: {$this->task->title}")
            ->greeting("Hello {$notifiable->name},")
            ->line("{$this->mentionedBy->name} mentioned you in a comment.")
            ->line("**{$this->task->title}** in project {$this->task->project?->name}")
            ->line("\"{$preview}\"")
            ->action('View Task', url($this->task->getEditUrl()))
            ->line('Thank you for using ' . config('app.name') . '!');
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
            'comment_preview' => Str::limit($this->comment->body, 100),
        ];
    }
}
