<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApprovalItem;
use App\Models\ApprovalStepDecision;
use App\Models\ApprovalStepInstanceApprover;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Mobile API for the approver's queue and decision trail — the mobile equivalent
 * of the My Approvals page.
 */
class MyApprovalsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->canAccessApprovals(), 403);

        // Requests awaiting this user's decision on an active step.
        $pendingIds = ApprovalStepInstanceApprover::where('user_id', $user->id)
            ->whereHas('instance', fn ($q) => $q->where('status', 'active'))
            ->with('instance:id,approval_item_id,status')
            ->get()
            ->pluck('instance.approval_item_id')
            ->filter()
            ->unique();

        $query = ApprovalItem::whereIn('id', $pendingIds)
            ->whereNull('archived_at')
            ->with([
                'approvalProject:id,name',
                'requester:id,name',
                'stepInstances' => fn ($q) => $q->where('status', 'active')->with('step:id,name'),
            ]);

        if ($search = trim((string) $request->input('search', ''))) {
            $query->where(fn ($q) => $q
                ->where('title', 'like', "%{$search}%")
                ->orWhere('description', 'like', "%{$search}%"));
        }

        $pending = $query->orderByDesc('submitted_at')->paginate(20);

        $decidedThisWeek = ApprovalItem::whereHas('stepInstances.decisions', fn ($q) => $q
            ->where('decided_by', $user->id)
            ->where('decided_at', '>=', now()->startOfWeek()))->count();

        return response()->json([
            'pending' => $pending,
            'stats' => [
                'pending' => $pendingIds->count(),
                'decided_this_week' => $decidedThisWeek,
            ],
        ]);
    }

    /** Decisions this user has recorded, most recent first (the approval trail). */
    public function trail(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->canAccessApprovals(), 403);

        $query = ApprovalStepDecision::where('decided_by', $user->id)
            ->whereHas('instance.item')
            ->with([
                'instance:id,approval_item_id,approval_step_id,step_number',
                'instance.step:id,name',
                'instance.item:id,approval_project_id,title,status',
                'instance.item.approvalProject:id,name',
                'instance.item.requester:id,name',
            ]);

        if (in_array($request->input('decision'), ['approved', 'rejected'], true)) {
            $query->where('decision', $request->input('decision'));
        }
        if ($projectId = $request->input('project_id')) {
            $query->whereHas('instance.item', fn ($q) => $q->where('approval_project_id', $projectId));
        }
        if ($search = trim((string) $request->input('search', ''))) {
            $like = "%{$search}%";
            $query->where(fn ($q) => $q
                ->where('comment', 'like', $like)
                ->orWhereHas('instance.item', fn ($q2) => $q2->where('title', 'like', $like)));
        }

        $trail = $query->orderByDesc('decided_at')->orderByDesc('id')->paginate(20)
            ->through(fn (ApprovalStepDecision $d) => [
                'id' => $d->id,
                'decision' => $d->decision,
                'comment' => $d->comment,
                'decided_at' => $d->decided_at,
                'step_name' => $d->instance?->step?->name,
                'item_id' => $d->instance?->item?->id,
                'item_title' => $d->instance?->item?->title,
                'project_id' => $d->instance?->item?->approval_project_id,
                'project_name' => $d->instance?->item?->approvalProject?->name,
                'requester' => $d->instance?->item?->requester?->name,
            ]);

        return response()->json(['trail' => $trail]);
    }

    /** The requestor's own submissions — mobile My Requests. */
    public function myRequests(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->can_request || $user->canAccessApprovals(), 403);

        $query = ApprovalItem::where('requested_by', $user->id)
            ->with([
                'approvalProject:id,name',
                'stepInstances' => fn ($q) => $q->where('status', 'active')->with('step:id,name'),
            ]);

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }
        if ($projectId = $request->input('approval_project_id')) {
            $query->where('approval_project_id', $projectId);
        }
        if ($search = trim((string) $request->input('search', ''))) {
            $query->where(fn ($q) => $q
                ->where('title', 'like', "%{$search}%")
                ->orWhere('description', 'like', "%{$search}%"));
        }

        $base = ApprovalItem::where('requested_by', $user->id);

        return response()->json([
            'items' => $query->orderByDesc('created_at')->paginate(20),
            'stats' => [
                'total' => (clone $base)->count(),
                'pending' => (clone $base)->where('status', 'pending')->count(),
                'approved' => (clone $base)->where('status', 'approved')->count(),
                'rejected' => (clone $base)->where('status', 'rejected')->count(),
                'changes_requested' => (clone $base)->where('status', 'changes_requested')->count(),
            ],
        ]);
    }
}
