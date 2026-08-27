<?php

namespace App\Notifications;

use App\Models\ApprovalItem;
use App\Models\ApprovalStepDecision;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Tells the requester how their item was decided. Sent on the terminal
 * transitions only — approved, rejected, and returned for changes — so the
 * requester hears about outcomes they need to know about without being copied
 * on every intermediate step approval.
 */
class ApprovalDecisionNotification extends Notification implements ShouldQueue
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

    /** Outcomes reported back to the requester. */
    public const OUTCOMES = ['approved', 'rejected', 'changes_requested'];

    public function __construct(
        public ApprovalItem $item,
        public string $outcome,
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
        return 'approval_' . $this->outcome;
    }

    public function toArray(object $notifiable): array
    {
        $decision = $this->lastDecision();

        return [
            'type' => 'approval_' . $this->outcome,
            'outcome' => $this->outcome,
            'approval_item_id' => $this->item->id,
            'approval_project_id' => $this->item->approval_project_id,
            'approval_project_name' => $this->item->approvalProject?->name,
            'item_title' => $this->item->title,
            // Who acted last. For a rejection or a change request that is the one
            // person the requester needs to talk to; for a full approval it is
            // simply whoever closed out the final step.
            'decided_by' => $decision ? User::find($decision->decided_by)?->name : null,
            // The reason matters most on a rejection — surface it rather than
            // making the requester open the item to find out why.
            'decision_comment' => $decision?->comment,
        ];
    }

    /**
     * The most recent decision across every step instance on this item. Resolved
     * here rather than threaded through the engine, which reaches finalize() from
     * several paths that don't all carry the deciding user.
     */
    private function lastDecision(): ?ApprovalStepDecision
    {
        return ApprovalStepDecision::whereIn(
            'approval_step_instance_id',
            $this->item->stepInstances()->select('id')
        )
            ->orderByDesc('decided_at')
            ->orderByDesc('id')
            ->first();
    }
}
