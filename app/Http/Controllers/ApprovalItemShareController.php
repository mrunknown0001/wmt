<?php

namespace App\Http\Controllers;

use App\Models\ApprovalItem;
use App\Models\ApprovalItemShare;
use App\Models\ApprovalProject;
use App\Models\User;
use App\Notifications\ApprovalItemSharedNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;

/**
 * Handing a decided approval request to people who were not part of it.
 *
 * The share is the entire grant: ApprovalItemPolicy::view honours it, and
 * because AttachmentController authorizes attachment reads against that same
 * ability, recipients get the files along with the detail.
 */
class ApprovalItemShareController extends Controller
{
    public function store(Request $request, ApprovalProject $approvalProject, ApprovalItem $item)
    {
        $this->authorize('share', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);

        $validated = $request->validate([
            'user_ids' => ['required', 'array', 'min:1', 'max:50'],
            'user_ids.*' => ['integer', 'distinct', 'exists:users,id'],
        ]);

        // Inactive accounts are dropped rather than rejected: picking a leaver
        // from a stale list should not fail the whole share.
        $recipients = User::whereIn('id', $validated['user_ids'])
            ->where('is_active', true)
            // Nobody needs telling about a request they raised, and the person
            // sharing plainly knows about it.
            ->where('id', '!=', $item->requested_by)
            ->where('id', '!=', $request->user()->id)
            ->get();

        $newlyShared = $recipients->filter(function (User $user) use ($item, $request) {
            // firstOrCreate, so re-sharing with somebody who already has it is a
            // no-op rather than a duplicate row or a second notification.
            return ApprovalItemShare::firstOrCreate(
                ['approval_item_id' => $item->id, 'user_id' => $user->id],
                ['shared_by' => $request->user()->id],
            )->wasRecentlyCreated;
        });

        if ($newlyShared->isNotEmpty()) {
            Notification::send($newlyShared, new ApprovalItemSharedNotification($item, $request->user()));
        }

        $count = $newlyShared->count();

        return back()->with('success', $count > 0
            ? 'Request shared — ' . $count . ' ' . str('person')->plural($count) . ' notified.'
            : 'No new people to share with.');
    }

    public function destroy(ApprovalProject $approvalProject, ApprovalItem $item, User $user)
    {
        $this->authorize('share', $item);
        abort_if($item->approval_project_id !== $approvalProject->id, 404);

        $item->shares()->where('user_id', $user->id)->delete();

        return back()->with('success', 'Access removed.');
    }
}
