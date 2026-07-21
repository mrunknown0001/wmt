<?php

namespace App\Http\Controllers;

use App\Models\ApprovalStepInstanceApprover;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;

class MyApprovalsController extends Controller
{
    public function index()
    {
        $user = Auth::user();

        // Find all approval step instances where the current user is an eligible approver
        $activeApprovals = ApprovalStepInstanceApprover::where('user_id', $user->id)
            ->with([
                'instance' => function ($q) {
                    $q->with([
                        'item' => function ($q) {
                            $q->with([
                                'approvalProject',
                                'requested_by_user' => function ($q) {
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
                                'requested_by_user' => function ($q) {
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

        $pendingApprovals = $activeApprovals->merge($changesRequested)->values();

        // Calculate stats
        $stats = [
            'pending' => $activeApprovals->count(),
            'changes_requested' => $changesRequested->count(),
            'decided_this_week' => 0, // TODO: count decisions from this week
        ];

        return Inertia::render('MyApprovals/Index', [
            'pendingApprovals' => $pendingApprovals,
            'stats' => $stats,
        ]);
    }
}
