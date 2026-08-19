<?php

namespace App\Policies;

use App\Models\ApprovalItem;
use App\Models\User;

class ApprovalItemPolicy
{
    public function view(User $user, ApprovalItem $item): bool
    {
        $project = $item->approvalProject;

        // Whoever may open the containing project may read the requests inside
        // it. Delegating rather than restating keeps admin, executive and
        // manage-approval-projects access defined in one place — restating it
        // here is how the two drifted apart, leaving administrators able to list
        // requests but not open any of them.
        //
        // Purely additive: the narrower paths below still stand on their own, so
        // nobody who could read a request before loses access.
        if ($project && $user->can('view', $project)) {
            return true;
        }

        // Project members, owner, requester, or eligible current approver
        if ($project?->members()->where('user_id', $user->id)->exists()) {
            return true;
        }
        if ($project?->owner_id === $user->id) {
            return true;
        }
        if ($item->requested_by === $user->id) {
            return true;
        }

        // Shared with this person after the fact. AttachmentController authorizes
        // attachment reads against this same ability, so the files travel with
        // the grant rather than needing a rule of their own.
        if ($item->shares()->where('user_id', $user->id)->exists()) {
            return true;
        }

        // Check if user is an eligible approver in the current active step
        $activeInstance = $item->stepInstances()->where('status', 'active')->first();
        if ($activeInstance && $activeInstance->approvers()->where('user_id', $user->id)->exists()) {
            return true;
        }
        // Also allow viewing if user has already made a decision on this item (in any step instance)
        $hasDecided = $item->stepInstances()
            ->whereHas('decisions', function ($q) use ($user) {
                $q->where('decided_by', $user->id);
            })
            ->exists();
        if ($hasDecided) {
            return true;
        }
        return false;
    }

    public function create(User $user, ApprovalItem $item = null): bool
    {
        // Members of the approval project can create items
        return true;
    }

    /**
     * May act on this request at all — filing it into a section, archiving it.
     * These do not touch what was approved, so they stay available for the whole
     * life of the request. Editing its *content* is updateContent() below.
     */
    public function update(User $user, ApprovalItem $item): bool
    {
        if ($this->isBackWithRequester($user, $item)) {
            return true;
        }

        return $this->administersProject($user, $item);
    }

    /**
     * May edit the request's title, description and custom field values.
     *
     * The seal is deliberately absolute: it applies to the requester, the
     * project owner and whoever administers the system alike. There is no
     * authority that makes it safe to rewrite something an approver has already
     * put their name to — the way to change a sealed request is to cancel it and
     * raise a new one, or for an approver to send it back for changes.
     */
    public function updateContent(User $user, ApprovalItem $item): bool
    {
        if ($item->isContentFrozen()) {
            return false;
        }

        return $this->update($user, $item);
    }

    public function cancel(User $user, ApprovalItem $item): bool
    {
        if ($this->isBackWithRequester($user, $item)) {
            return true;
        }

        return $this->administersProject($user, $item);
    }

    /**
     * Whether this is the requester at a point where the request is theirs to
     * act on: before anyone has decided on it, or after it came back to them.
     *
     * 'changes_requested' and 'rejected' matter here. An approver sending a
     * request back is asking the requester to change something, and resubmit()
     * lets them push it out again — but until now update() only recognised the
     * requester while the request was 'pending', so there was no point at which
     * they could actually make the change being asked for.
     */
    private function isBackWithRequester(User $user, ApprovalItem $item): bool
    {
        return $item->requested_by === $user->id
            && in_array($item->status, ['pending', 'changes_requested', 'rejected'], true);
    }

    /**
     * Whether this person administers the approval project the request sits in,
     * and so may act on the requests inside it.
     *
     * Delegates to ApprovalProjectPolicy::update rather than restating owner and
     * project-admin here. Those two checks were already a copy of that policy
     * minus its manage-approval-projects branch, which is how a system admin
     * ended up able to delete a whole approval project while being unable to
     * cancel a single request inside it.
     */
    private function administersProject(User $user, ApprovalItem $item): bool
    {
        $project = $item->approvalProject;

        return $project && $user->can('update', $project);
    }

    /**
     * May hand this request to people who were not part of it.
     *
     * Only once it is decided: circulating a request still in flight would put
     * it in front of people while approvers are still forming a view of it.
     *
     * Deliberately not granted to everyone who can view it, and so not to share
     * recipients either — otherwise access would spread on its own, one forward
     * at a time, with nobody able to see where it had reached. Sharing stays
     * with the requester and whoever administers the project.
     */
    public function share(User $user, ApprovalItem $item): bool
    {
        if (!in_array($item->status, ['approved', 'rejected'], true)) {
            return false;
        }

        if ($item->requested_by === $user->id) {
            return true;
        }

        return $this->administersProject($user, $item);
    }

    public function decide(User $user, ApprovalItem $item): bool
    {
        // Note there is deliberately no administrator branch here, unlike
        // view(). A decision is a signature: it is recorded against a named
        // person and stands as the audit trail for the request. Letting someone
        // approve a step purely because they administer the system would put a
        // name on an approval that person was never asked to give. An admin who
        // genuinely needs to decide belongs in the chain as an approver.

        // User must have the approver capability enabled...
        if (!$user->can_approve) {
            return false;
        }
        // ...and be an eligible approver in an active step.
        $activeInstance = $item->stepInstances()->where('status', 'active')->first();
        if (!$activeInstance) {
            return false;
        }
        return $activeInstance->approvers()->where('user_id', $user->id)->exists();
    }

    public function resubmit(User $user, ApprovalItem $item): bool
    {
        // Only the requester, and only for a request that was sent back for
        // changes or rejected.
        return $item->requested_by === $user->id
            && in_array($item->status, ['changes_requested', 'rejected'], true);
    }
}
