<?php

namespace App\Http\Controllers;

use App\Models\ApprovalItem;
use App\Models\ApprovalStepDecision;
use App\Models\ApprovalStepInstanceApprover;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;

class MyApprovalsController extends Controller
{
    public function index(Request $request)
    {
        $user = Auth::user();

        // Only users with the approver capability can access their approvals queue.
        abort_unless($user->can_approve, 403);

        // Find all approval step instances where the current user is an eligible approver
        $activeApprovals = ApprovalStepInstanceApprover::where('user_id', $user->id)
            ->with([
                'instance' => function ($q) {
                    $q->with([
                        'item' => function ($q) {
                            $q->with([
                                'approvalProject',
                                'requester' => function ($q) {
                                    $q->select('id', 'name');
                                }
                            ])->select('id', 'approval_project_id', 'title', 'description', 'status', 'current_step_number', 'submitted_at', 'requested_by');
                        },
                        'step' => function ($q) {
                            $q->select('id', 'name');
                        }
                    ])->where('status', 'active')
                    ->select('id', 'approval_item_id', 'approval_step_id', 'step_number', 'status', 'activated_at');
                }
            ])
            ->whereHas('instance', function ($q) {
                $q->where('status', 'active');
            })
            ->get()
            ->pluck('instance.item')
            ->filter() // drop nulls (e.g. soft-deleted items with a lingering active instance)
            ->unique('id')
            ->values();

        // Find items in changes_requested status that belong to the requester
        $changesRequested = ApprovalStepInstanceApprover::where('user_id', $user->id)
            ->with([
                'instance' => function ($q) {
                    $q->with([
                        'item' => function ($q) {
                            $q->with([
                                'approvalProject',
                                'requester' => function ($q) {
                                    $q->select('id', 'name');
                                }
                            ])->whereIn('status', ['changes_requested'])
                            ->select('id', 'approval_project_id', 'title', 'description', 'status', 'current_step_number', 'submitted_at', 'requested_by');
                        }
                    ]);
                }
            ])
            ->get()
            ->pluck('instance.item')
            ->filter(fn ($item) => $item && $item->requested_by === $user->id)
            ->unique('id')
            ->values();

        // Items this user decided (approved/rejected) since the start of the week.
        $decidedThisWeek = ApprovalItem::whereHas('stepInstances.decisions', function ($q) use ($user) {
            $q->where('decided_by', $user->id)
                ->where('decided_at', '>=', now()->startOfWeek());
        })
            ->with(['approvalProject', 'requester:id,name'])
            ->get()
            ->unique('id')
            ->values();

        // Card-driven filter: '' (all) | pending | changes_requested | decided
        $status = $request->input('status', '');
        $search = trim((string) $request->input('search', ''));

        $collection = match ($status) {
            'pending' => $activeApprovals,
            'changes_requested' => $changesRequested,
            'decided' => $decidedThisWeek,
            default => $activeApprovals->merge($changesRequested)->values(),
        };

        // Search across the request title, description and requester name.
        if ($search !== '') {
            $needle = mb_strtolower($search);
            $collection = $collection->filter(function ($item) use ($needle) {
                return str_contains(mb_strtolower((string) $item->title), $needle)
                    || str_contains(mb_strtolower((string) $item->description), $needle)
                    || str_contains(mb_strtolower((string) ($item->requester?->name ?? '')), $needle);
            })->values();
        }

        // These come from two merged sources, so paginate the resulting collection.
        $perPage = 15;
        $page = LengthAwarePaginator::resolveCurrentPage();
        $pendingApprovals = new LengthAwarePaginator(
            $collection->forPage($page, $perPage)->values(),
            $collection->count(),
            $perPage,
            $page,
            ['path' => $request->url(), 'query' => $request->query()]
        );

        $stats = [
            'pending' => $activeApprovals->count(),
            'changes_requested' => $changesRequested->count(),
            'decided_this_week' => $decidedThisWeek->count(),
        ];

        // --- Approval trail -------------------------------------------------
        // Every decision this user has recorded, most recent first. Uses its own
        // query params (trail_*) so its filters and pages don't collide with the
        // pending queue above.
        $trailDecision = $request->input('trail_decision', '');
        $trailSearch = trim((string) $request->input('trail_search', ''));

        $trailBase = fn () => ApprovalStepDecision::where('decided_by', $user->id)
            ->whereHas('instance.item'); // skip decisions whose request was deleted

        $trailQuery = $trailBase()->with([
            'instance:id,approval_item_id,approval_step_id,step_number',
            'instance.step:id,name',
            'instance.item:id,approval_project_id,title,status,requested_by',
            'instance.item.approvalProject:id,name',
            'instance.item.requester:id,name',
        ]);

        if (in_array($trailDecision, ['approved', 'rejected'], true)) {
            $trailQuery->where('decision', $trailDecision);
        }

        // Search the decision comment plus the request it belongs to.
        if ($trailSearch !== '') {
            $like = '%' . $trailSearch . '%';
            $trailQuery->where(function ($q) use ($like) {
                $q->where('comment', 'like', $like)
                    ->orWhereHas('instance.item', function ($q2) use ($like) {
                        $q2->where('title', 'like', $like)
                            ->orWhere('description', 'like', $like)
                            ->orWhereHas('requester', fn ($q3) => $q3->where('name', 'like', $like))
                            ->orWhereHas('approvalProject', fn ($q3) => $q3->where('name', 'like', $like));
                    });
            });
        }

        $trail = $trailQuery
            ->orderByDesc('decided_at')
            ->orderByDesc('id') // stable tie-break for decisions in the same second
            ->paginate(10, ['*'], 'trail_page')
            ->withQueryString()
            ->through(fn (ApprovalStepDecision $d) => [
                'id' => $d->id,
                'decision' => $d->decision,
                'comment' => $d->comment,
                'decided_at' => $d->decided_at,
                'step_number' => $d->instance?->step_number,
                'step_name' => $d->instance?->step?->name,
                'item_id' => $d->instance?->item?->id,
                'item_title' => $d->instance?->item?->title,
                'item_status' => $d->instance?->item?->status,
                'requester' => $d->instance?->item?->requester?->name,
                'project_id' => $d->instance?->item?->approval_project_id,
                'project_name' => $d->instance?->item?->approvalProject?->name,
            ]);

        // Summary counts are over the whole trail, not the current filter.
        $trailStats = [
            'total' => $trailBase()->count(),
            'approved' => $trailBase()->where('decision', 'approved')->count(),
            'rejected' => $trailBase()->where('decision', 'rejected')->count(),
        ];

        return Inertia::render('MyApprovals/Index', [
            'pendingApprovals' => $pendingApprovals,
            'stats' => $stats,
            'filters' => ['status' => $status, 'search' => $search],
            'trail' => $trail,
            'trailStats' => $trailStats,
            'trailFilters' => ['decision' => $trailDecision, 'search' => $trailSearch],
        ]);
    }
}
