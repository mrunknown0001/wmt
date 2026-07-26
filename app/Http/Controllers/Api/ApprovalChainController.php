<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreApprovalChainRequest;
use App\Http\Requests\UpdateApprovalChainRequest;
use App\Models\ApprovalChain;
use App\Models\ApprovalProject;
use App\Services\ApprovalChainVersioningService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Mobile API for approval chains (workflow definitions).
 */
class ApprovalChainController extends Controller
{
    private function authorizeManage(ApprovalProject $project): void
    {
        $user = auth()->user();
        abort_unless(
            $user->can('manage-approval-projects')
                || $project->owner_id === $user->id
                || $project->isProjectAdmin($user),
            403
        );
    }

    public function index(Request $request, ApprovalProject $approvalProject): JsonResponse
    {
        $this->authorize('view', $approvalProject);

        $chains = $approvalProject->chains()
            ->with(['versions' => fn ($q) => $q->where('is_current', true)->with('steps')])
            ->orderByDesc('is_default')
            ->orderBy('name')
            ->get();

        return response()->json(['chains' => $chains]);
    }

    public function show(Request $request, ApprovalProject $approvalProject, ApprovalChain $chain): JsonResponse
    {
        $this->authorize('view', $approvalProject);
        abort_if($chain->approval_project_id !== $approvalProject->id, 404);

        $chain->load(['versions' => fn ($q) => $q->where('is_current', true)->with('steps')]);

        return response()->json(['chain' => $chain]);
    }

    public function store(StoreApprovalChainRequest $request, ApprovalProject $approvalProject): JsonResponse
    {
        $this->authorizeManage($approvalProject);

        $chain = $approvalProject->chains()->create($request->only([
            'name', 'description', 'is_default', 'is_active', 'priority',
            'selector_conditions', 'on_reject_behavior',
        ]));

        ApprovalChainVersioningService::saveSteps($chain, $request->steps ?? [], $request->user());

        return response()->json([
            'chain' => $chain->load(['versions' => fn ($q) => $q->where('is_current', true)->with('steps')]),
        ], 201);
    }

    public function update(UpdateApprovalChainRequest $request, ApprovalProject $approvalProject, ApprovalChain $chain): JsonResponse
    {
        $this->authorizeManage($approvalProject);
        abort_if($chain->approval_project_id !== $approvalProject->id, 404);

        $chain->update($request->only([
            'name', 'description', 'is_default', 'is_active', 'priority',
            'selector_conditions', 'on_reject_behavior',
        ]));

        ApprovalChainVersioningService::saveSteps($chain, $request->steps ?? [], $request->user());

        return response()->json([
            'chain' => $chain->fresh()->load(['versions' => fn ($q) => $q->where('is_current', true)->with('steps')]),
        ]);
    }

    public function destroy(Request $request, ApprovalProject $approvalProject, ApprovalChain $chain): JsonResponse
    {
        $this->authorizeManage($approvalProject);
        abort_if($chain->approval_project_id !== $approvalProject->id, 404);

        $chain->delete();

        return response()->json(['success' => true]);
    }
}
