<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreApprovalProjectRequest;
use App\Http\Requests\UpdateApprovalProjectRequest;
use App\Models\ApprovalProject;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Mobile API for approval projects. Mirrors the web controller's behavior and
 * reuses the same policies and form requests, returning JSON instead of Inertia.
 */
class ApprovalProjectController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', ApprovalProject::class);

        $query = ApprovalProject::with('owner:id,name')
            ->withCount(['approvalItems as pending_items_count' => fn ($q) => $q->where('status', 'pending')]);

        // Default to non-archived, same as the web list.
        $request->boolean('archived')
            ? $query->where('status', 'archived')
            : $query->where('status', '!=', 'archived');

        if ($search = $request->input('search')) {
            $query->where('name', 'like', '%' . $search . '%');
        }

        return response()->json(
            $query->orderByDesc('updated_at')->paginate(20)
        );
    }

    public function store(StoreApprovalProjectRequest $request): JsonResponse
    {
        $this->authorize('create', ApprovalProject::class);

        $project = ApprovalProject::create([
            'name' => $request->name,
            'description' => $request->description,
            'status' => $request->status ?? 'active',
            'owner_id' => $request->owner_id ?? $request->user()->id,
            'is_pinned' => $request->is_pinned ?? false,
        ]);

        return response()->json(['project' => $project->load('owner:id,name')], 201);
    }

    public function show(Request $request, ApprovalProject $approvalProject): JsonResponse
    {
        $this->authorize('view', $approvalProject);

        $approvalProject->load([
            'owner:id,name',
            'members:id,name',
            'sections:id,approval_project_id,name,color,position',
            'customFields.options',
            'chains:id,approval_project_id,name,is_active,is_default',
        ]);

        return response()->json(['project' => $approvalProject]);
    }

    public function update(UpdateApprovalProjectRequest $request, ApprovalProject $approvalProject): JsonResponse
    {
        $this->authorize('update', $approvalProject);

        $approvalProject->update($request->only(['name', 'description', 'status', 'owner_id', 'is_pinned']));

        return response()->json(['project' => $approvalProject->fresh()->load('owner:id,name')]);
    }

    public function destroy(Request $request, ApprovalProject $approvalProject): JsonResponse
    {
        $this->authorize('delete', $approvalProject);

        $approvalProject->delete();

        return response()->json(['success' => true]);
    }

    /** Toggle archived <-> active, mirroring the web archive action. */
    public function archive(Request $request, ApprovalProject $approvalProject): JsonResponse
    {
        $this->authorize('update', $approvalProject);

        $approvalProject->update([
            'status' => $approvalProject->status === 'archived' ? 'active' : 'archived',
        ]);

        return response()->json(['project' => $approvalProject->fresh()]);
    }
}
