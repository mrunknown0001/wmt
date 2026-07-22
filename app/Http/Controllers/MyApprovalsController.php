<?php

namespace App\Http\Controllers;

use App\Models\ApprovalItem;
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

        return Inertia::render('MyApprovals/Index', [
            'pendingApprovals' => $pendingApprovals,
            'stats' => $stats,
            'filters' => ['status' => $status, 'search' => $search],
        ]);
    }
}
