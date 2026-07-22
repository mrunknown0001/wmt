<?php

namespace App\Http\Controllers;

use App\Models\ApprovalProject;
use App\Models\User;
use App\Http\Requests\StoreApprovalProjectRequest;
use App\Http\Requests\UpdateApprovalProjectRequest;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class ApprovalProjectController extends Controller
{
    public function index()
    {
        $this->authorize('viewAny', ApprovalProject::class);

        $projects = ApprovalProject::with('owner')
            ->orderBy('position')
            ->paginate(15);

        return Inertia::render('ApprovalProjects/Index', [
            'projects' => $projects,
        ]);
    }

    public function create()
    {
        $this->authorize('create', ApprovalProject::class);

        return Inertia::render('ApprovalProjects/Create', [
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function store(StoreApprovalProjectRequest $request)
    {
        $this->authorize('create', ApprovalProject::class);

        $project = ApprovalProject::create([
            'name' => $request->name,
            'description' => $request->description,
            'status' => $request->status ?? 'active',
            'owner_id' => $request->owner_id,
            'due_date' => $request->due_date,
            'is_pinned' => $request->is_pinned ?? false,
        ]);

        $this->syncCoOwners($project, $request->input('co_owner_ids', []), $request->owner_id);

        return redirect()->route('approval-projects.show', $project)
            ->with('success', 'Approval project created successfully.');
    }

    public function show(ApprovalProject $approvalProject)
    {
        $this->authorize('view', $approvalProject);

        return Inertia::render('ApprovalProjects/Show', [
            'project' => $approvalProject->load('owner', 'sections', 'customFields.options', 'members'),
        ]);
    }

    public function edit(ApprovalProject $approvalProject)
    {
        $this->authorize('update', $approvalProject);

        return Inertia::render('ApprovalProjects/Edit', [
            'project' => $approvalProject->load('owner', 'members'),
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function update(UpdateApprovalProjectRequest $request, ApprovalProject $approvalProject)
    {
        $this->authorize('update', $approvalProject);

        $approvalProject->update([
            'name' => $request->name,
            'description' => $request->description,
            'status' => $request->status,
            'owner_id' => $request->owner_id,
            'due_date' => $request->due_date,
            'is_pinned' => $request->is_pinned ?? false,
        ]);

        $this->syncCoOwners($approvalProject, $request->input('co_owner_ids', []), $request->owner_id);

        return redirect()->route('approval-projects.show', $approvalProject)
            ->with('success', 'Approval project updated successfully.');
    }

    /**
     * Replace the project's co-owners (stored as members with the "co-owner" role).
     * The owner is never also recorded as a co-owner.
     */
    private function syncCoOwners(ApprovalProject $project, array $coOwnerIds, $ownerId): void
    {
        $ids = collect($coOwnerIds)
            ->map(fn ($id) => (int) $id)
            ->reject(fn ($id) => $id === (int) $ownerId)
            ->unique()
            ->values();

        $project->members()->sync(
            $ids->mapWithKeys(fn ($id) => [$id => ['role' => 'co-owner']])->all()
        );
    }

    public function destroy(ApprovalProject $approvalProject)
    {
        $this->authorize('delete', $approvalProject);

        $approvalProject->delete();

        return redirect()->route('approval-projects.index')
            ->with('success', 'Approval project deleted successfully.');
    }
}
