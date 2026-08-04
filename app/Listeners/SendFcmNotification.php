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
            'url' => $this->buildUrl($data),
            'notification_id' => $event->response ?? '',
        ]);
    }

    /**
     * Deep link for the push. The service worker prefers data.url and only falls
     * back to its project/task guess, which approval and webhook notifications
     * do not carry — without this they all open the dashboard.
     */
    private function buildUrl(array $data): ?string
    {
        $type = $data['type'] ?? null;

        // Webhooks carry the destination from the calling system.
        if ($type === 'external_webhook') {
            return $data['url'] ?? null;
        }

        // The approver's queue, not the item: they may not be able to view it yet.
        if ($type === 'approval_requested') {
            return '/my-approvals';
        }

        if (is_string($type) && str_starts_with($type, 'approval_')) {
            $projectId = $data['approval_project_id'] ?? null;
            $itemId = $data['approval_item_id'] ?? null;

            if ($projectId && $itemId) {
                return "/approval-projects/{$projectId}/items/{$itemId}";
            }

            return '/my-requests';
        }

        return $data['url'] ?? null;
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
            'approval_automation' => 'Approval Update',
            'approval_due_soon' => 'Approval Due Soon',
            'approval_overdue' => 'Approval Overdue',
            'note_shared' => 'Note Shared With You',
            'note_folder_shared' => 'Notes Folder Shared With You',
            'automation_blocked' => 'Task Could Not Be Completed',
            'external_webhook' => $data['platform'] ?? config('app.name'),
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
            'approval_due_soon' => ($data['item_title'] ?? 'A request') . ' is ' . ($data['timing'] ?? 'due soon'),
            'approval_overdue' => ($data['item_title'] ?? 'A request') . ' is ' . ($data['timing'] ?? 'overdue')
                . (($data['step_name'] ?? null) ? " at {$data['step_name']}" : ''),
            // Notes carry note_title/folder_name, not task_title — without these
            // every notes push would read "Unknown Task".
            'note_shared' => ($data['shared_by'] ?? 'Someone') . ' shared "'
                . ($data['note_title'] ?? 'a note') . '" with you',
            'note_folder_shared' => ($data['shared_by'] ?? 'Someone') . ' shared the folder "'
                . ($data['folder_name'] ?? 'Notes') . '" with you',
            'automation_blocked' => ($data['task_title'] ?? 'A task') . ' could not be completed automatically — it needs an attachment',
            'approval_automation' => ($data['message'] ?? null)
                ?: 'Update on ' . ($data['item_title'] ?? 'an approval request'),
            'external_webhook' => ($data['message'] ?? null)
                ?: 'You have an item to review' . (($data['platform'] ?? null) ? " in {$data['platform']}" : ''),
            default => $taskTitle,
        };
    }
}
