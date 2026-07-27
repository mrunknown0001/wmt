<?php

namespace App\Listeners;

use App\Models\User;
use App\Services\FcmService;
use Illuminate\Notifications\Events\NotificationSent;

class SendFcmNotification
{
    public function handle(NotificationSent $event): void
    {
        // Only trigger on the database channel to avoid duplicate sends
        if ($event->channel !== 'database') {
            return;
        }

        $notifiable = $event->notifiable;
        if (! $notifiable instanceof User) {
            return;
        }

        $data = $event->notification->toArray($notifiable);

        $title = $this->buildTitle($data);
        $body = $this->buildBody($data);

        FcmService::sendToUser($notifiable, [
            'title' => $title,
            'body' => $body,
            'type' => $data['type'] ?? 'general',
            'task_id' => $data['task_id'] ?? null,
            'project_id' => $data['project_id'] ?? null,
            'notification_id' => $event->response ?? '',
        ]);
    }

    private function buildTitle(array $data): string
    {
        $type = $data['type'] ?? 'general';

        return match ($type) {
            'task_assigned' => 'Task Assigned',
            'task_due_soon' => 'Task Due Tomorrow',
            'task_due_reminder' => 'Task Due Reminder',
            'task_overdue' => 'Task Overdue',
            'task_comment', 'subtask_comment' => 'New Comment',
            'task_comment_mention' => 'You Were Mentioned',
            'comment_deleted' => 'Comment Deleted',
            'task_escalated' => 'Task Escalated',
            'approval_requested' => 'Approval Requested',
            'approval_approved' => 'Request Approved',
            'approval_rejected' => 'Request Rejected',
            'approval_changes_requested' => 'Changes Requested',
            default => config('app.name'),
        };
    }

    private function buildBody(array $data): string
    {
        $taskTitle = $data['task_title'] ?? 'Unknown Task';
        $projectName = $data['project_name'] ?? '';
        $type = $data['type'] ?? 'general';

        return match ($type) {
            'task_assigned' => "{$data['assigned_by']} assigned you: {$taskTitle}",
            'task_due_soon' => "{$taskTitle} is due tomorrow" . ($projectName ? " ({$projectName})" : ''),
            'task_due_reminder' => "{$taskTitle} is due in {$data['days_before']} day(s)",
            'task_overdue' => "{$taskTitle} is overdue" . ($projectName ? " ({$projectName})" : ''),
            'task_comment', 'subtask_comment' => "{$data['commented_by']} commented on {$taskTitle}",
            'task_comment_mention' => "{$data['mentioned_by']} mentioned you in {$taskTitle}",
            'comment_deleted' => "{$data['deleted_by']} deleted a comment on {$taskTitle}",
            'task_escalated' => "{$taskTitle} has been escalated (Level {$data['escalation_level']})",
            // Approval traffic carries item_title, not task_title — without these
            // cases every approval push read "Unknown Task".
            'approval_requested' => ($data['item_title'] ?? 'A request') . ' needs your approval'
                . (($data['requester'] ?? null) ? " — submitted by {$data['requester']}" : ''),
            'approval_approved' => ($data['item_title'] ?? 'Your request') . ' was approved',
            'approval_rejected' => ($data['item_title'] ?? 'Your request') . ' was rejected'
                . (($data['decided_by'] ?? null) ? " by {$data['decided_by']}" : ''),
            'approval_changes_requested' => ($data['item_title'] ?? 'Your request') . ' was returned for changes'
                . (($data['decided_by'] ?? null) ? " by {$data['decided_by']}" : ''),
            default => $taskTitle,
        };
    }
}
