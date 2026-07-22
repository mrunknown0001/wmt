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
