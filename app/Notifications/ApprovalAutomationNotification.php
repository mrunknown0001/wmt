<?php

namespace App\Notifications;

use App\Models\ApprovalItem;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class ApprovalAutomationNotification extends Notification implements ShouldQueue
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
