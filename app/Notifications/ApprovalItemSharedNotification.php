<?php

namespace App\Notifications;

use App\Models\ApprovalItem;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class ApprovalItemSharedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public ApprovalItem $item,
        public User $sharedBy,
    ) {}

    /**
     * In-app only, matching NoteSharedNotification. Being shown a decided
     * request is a quiet event — it is waiting in the recipient's inbox either
     * way — and there is no per-user preference key for it, so a mail channel
     * here would be one nobody could turn off.
     */
    public function via(object $notifiable): array
    {
        return ['database', 'broadcast'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'approval_item_shared',
            'item_id' => $this->item->id,
            'item_title' => $this->item->title,
            'series_number' => $this->item->series_number,
            'status' => $this->item->status,
            'project_id' => $this->item->approval_project_id,
            'shared_by' => $this->sharedBy->name,
            // Read by SendFcmNotification for the push deep link.
            'url' => "/approval-projects/{$this->item->approval_project_id}/items/{$this->item->id}",
        ];
    }

    public function toBroadcast(object $notifiable): \Illuminate\Notifications\Messages\BroadcastMessage
    {
        return new \Illuminate\Notifications\Messages\BroadcastMessage($this->toArray($notifiable));
    }
}
