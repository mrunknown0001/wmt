<?php

namespace App\Notifications;

use App\Models\ApprovalItem;
use App\Models\ApprovalStep;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class ApprovalRequestedNotification extends Notification implements ShouldQueue
{
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
        public ApprovalItem $item,
        public ApprovalStep $step,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database', 'broadcast'];
    }

    /**
     * Keep the broadcast payload's `type` aligned with toArray so the frontend
     * reads a stable short type for both stored and real-time notifications.
     */
    public function broadcastType(): string
    {
        return 'approval_requested';
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'approval_requested',
            'approval_item_id' => $this->item->id,
            'approval_project_id' => $this->item->approval_project_id,
            'approval_project_name' => $this->item->approvalProject?->name,
            'item_title' => $this->item->title,
            'step_name' => $this->step->name,
            'requester' => $this->item->requester?->name,
        ];
    }
}
