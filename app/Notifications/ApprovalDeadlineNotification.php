<?php

namespace App\Notifications;

use App\Models\ApprovalItem;
use App\Models\ApprovalStepInstance;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * A step is nearly due, or has gone past due.
 *
 * One class for both because the recipient's question is the same — "what am I
 * holding up?" — and only the urgency differs.
 */
class ApprovalDeadlineNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public const DUE_SOON = 'approval_due_soon';
    public const OVERDUE = 'approval_overdue';

    public function __construct(
        public ApprovalItem $item,
        public ApprovalStepInstance $instance,
        /** self::DUE_SOON or self::OVERDUE */
        public string $kind,
        /** "3 hours overdue", or the deadline in words when it is still ahead. */
        public string $timing,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database', 'broadcast'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => $this->kind,
            'approval_item_id' => $this->item->id,
            'approval_project_id' => $this->item->approval_project_id,
            'item_title' => $this->item->title,
            'series_number' => $this->item->series_number,
            'step_name' => $this->instance->step?->name,
            'step_number' => $this->instance->step_number,
            'timing' => $this->timing,
            'due_at' => $this->instance->due_at?->toIso8601String(),
            'requester' => $this->item->requester?->name,
            // SendFcmNotification builds the deep link from the project/item
            // pair, so no explicit url is needed here.
        ];
    }
}
