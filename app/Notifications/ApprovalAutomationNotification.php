<?php

namespace App\Notifications;

use App\Models\ApprovalItem;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class ApprovalAutomationNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public ApprovalItem $item,
        public string $message,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database', 'broadcast'];
    }

    public function broadcastType(): string
    {
        return 'approval_automation';
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'approval_automation',
            'approval_item_id' => $this->item->id,
            'approval_project_id' => $this->item->approval_project_id,
            'approval_project_name' => $this->item->approvalProject?->name,
            'item_title' => $this->item->title,
            'message' => $this->message,
        ];
    }
}
