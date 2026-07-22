<?php

namespace App\Http\Controllers;

use App\Models\ApprovalItem;
use App\Models\ApprovalProject;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;

/**
 * Requestor-facing view: lets a user track the approval requests they submitted.
 */
class MyRequestsController extends Controller
{
    public function index(Request $request)
    {
        $user = Auth::user();

        // Only users with the requestor capability can access their requests queue.
        abort_unless($user->can_request, 403);

        $query = ApprovalItem::where('requested_by', $user->id)
            ->with([
                'approvalProject:id,name',
                'chainVersion.chain:id,name',
                'stepInstances' => function ($q) {
                    $q->where('status', 'active')->with('step:id,name');
                },
            ]);

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', '%' . $search . '%')
                    ->orWhere('description', 'like', '%' . $search . '%');
            });
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        if ($projectId = $request->input('approval_project_id')) {
            $query->where('approval_project_id', $projectId);
        }

        $items = $query->orderBy('created_at', 'desc')->paginate(15)->withQueryString();

        // Status tallies across all of the user's requests (not just the filtered page).
        $base = ApprovalItem::where('requested_by', $user->id);
        $stats = [
            'total' => (clone $base)->count(),
            'pending' => (clone $base)->where('status', 'pending')->count(),
            'approved' => (clone $base)->where('status', 'approved')->count(),
            'rejected' => (clone $base)->where('status', 'rejected')->count(),
            'changes_requested' => (clone $base)->where('status', 'changes_requested')->count(),
        ];

        // Projects the user has already requested in — used for the filter dropdown.
        $requestedProjectIds = ApprovalItem::where('requested_by', $user->id)
            ->distinct()
            ->pluck('approval_project_id')
            ->filter();

        return Inertia::render('MyRequests/Index', [
            'items' => $items,
            'stats' => $stats,
            'projects' => ApprovalProject::whereIn('id', $requestedProjectIds)
                ->orderBy('name')
                ->get(['id', 'name']),
            // Active projects the user can raise a new request against.
            'availableProjects' => ApprovalProject::where('status', 'active')
                ->orderBy('name')
                ->get(['id', 'name']),
            'filters' => [
                'search' => $request->input('search', ''),
                'status' => $request->input('status', ''),
                'approval_project_id' => $request->input('approval_project_id', ''),
            ],
        ]);
    }
}
