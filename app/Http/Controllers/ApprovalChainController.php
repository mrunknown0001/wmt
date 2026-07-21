<?php

namespace App\Http\Controllers;

use App\Models\ApprovalProject;
use App\Models\ApprovalChain;
use App\Models\User;
use App\Http\Requests\StoreApprovalChainRequest;
use App\Http\Requests\UpdateApprovalChainRequest;
use App\Services\ApprovalChainVersioningService;
use Inertia\Inertia;
use Spatie\Permission\Models\Role;

class ApprovalChainController extends Controller
{
    private function authorizeProject(ApprovalProject $project): void
    {
        if (!auth()->user()->can('manage-approval-projects')
            && $project->owner_id !== auth()->id()
            && !$project->isProjectAdmin(auth()->user())) {
            abort(403);
        }
    }

    public function index(ApprovalProject $approvalProject)
    {
        $this->authorizeProject($approvalProject);

        $chains = $approvalProject->chains()
            ->with('versions.steps')
            ->orderBy('priority')
            ->get();

        return Inertia::render('ApprovalChains/Index', [
            'project' => $approvalProject,
            'chains' => $chains,
        ]);
    }

    public function create(ApprovalProject $approvalProject)
    {
        $this->authorizeProject($approvalProject);

        $users = User::where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'email']);

        $roles = Role::orderBy('name')->get(['id', 'name']);

        return Inertia::render('ApprovalChains/Create', [
            'project' => $approvalProject,
            'users' => $users,
            'roles' => $roles,
        ]);
    }

    public function store(StoreApprovalChainRequest $request, ApprovalProject $approvalProject)
    {
        $this->authorizeProject($approvalProject);

        $chain = $approvalProject->chains()->create([
            'name' => $request->name,
            'description' => $request->description,
            'is_default' => $request->is_default ?? false,
            'is_active' => $request->is_active ?? true,
            'priority' => $request->priority ?? 0,
            'selector_conditions' => $request->selector_conditions,
            'on_reject_behavior' => $request->on_reject_behavior ?? 'reject_item',
            'created_by' => auth()->id(),
        ]);

        // Create initial version with steps
        ApprovalChainVersioningService::saveSteps($chain, $request->steps ?? [], auth()->user());

        return redirect()->route('approval-projects.chains.show', [$approvalProject, $chain])
            ->with('success', 'Approval chain created successfully.');
    }

    public function show(ApprovalProject $approvalProject, ApprovalChain $chain)
    {
        $this->authorizeProject($approvalProject);
        abort_if($chain->approval_project_id !== $approvalProject->id, 404);

        // Load current version with steps
        $currentVersion = $chain->versions()->where('is_current', true)->with('steps')->first();

        return Inertia::render('ApprovalChains/Show', [
            'project' => $approvalProject,
            'chain' => $chain,
            'currentVersion' => $currentVersion,
        ]);
    }

    public function edit(ApprovalProject $approvalProject, ApprovalChain $chain)
    {
        $this->authorizeProject($approvalProject);
        abort_if($chain->approval_project_id !== $approvalProject->id, 404);

        $users = User::where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'email']);

        $roles = Role::orderBy('name')->get(['id', 'name']);

        // Load current version with steps
        $currentVersion = $chain->versions()->where('is_current', true)->with('steps')->first();

        return Inertia::render('ApprovalChains/Edit', [
            'project' => $approvalProject,
            'chain' => $chain,
            'currentVersion' => $currentVersion,
            'users' => $users,
            'roles' => $roles,
        ]);
    }

    public function update(UpdateApprovalChainRequest $request, ApprovalProject $approvalProject, ApprovalChain $chain)
    {
        $this->authorizeProject($approvalProject);
        abort_if($chain->approval_project_id !== $approvalProject->id, 404);

        $chain->update([
            'name' => $request->name,
            'description' => $request->description,
            'is_default' => $request->is_default ?? false,
            'is_active' => $request->is_active ?? true,
            'priority' => $request->priority ?? 0,
            'selector_conditions' => $request->selector_conditions,
            'on_reject_behavior' => $request->on_reject_behavior ?? 'reject_item',
        ]);

        // Update steps via versioning service (handles new version if items in flight)
        ApprovalChainVersioningService::saveSteps($chain, $request->steps ?? [], auth()->user());

        return redirect()->route('approval-projects.chains.show', [$approvalProject, $chain])
            ->with('success', 'Approval chain updated successfully.');
    }

    public function destroy(ApprovalProject $approvalProject, ApprovalChain $chain)
    {
        $this->authorizeProject($approvalProject);
        abort_if($chain->approval_project_id !== $approvalProject->id, 404);

        $chain->delete();

        return redirect()->route('approval-projects.chains.index', $approvalProject)
            ->with('success', 'Approval chain deleted successfully.');
    }
}
