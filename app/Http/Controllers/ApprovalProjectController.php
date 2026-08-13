<?php

namespace App\Http\Controllers;

use App\Models\ApprovalItem;
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
            ->where('status', '!=', 'archived')
            ->orderBy('position')
            ->paginate(15);

        return Inertia::render('ApprovalProjects/Index', [
            'projects' => $projects,
            'archivedCount' => ApprovalProject::where('status', 'archived')->count(),
            'trashedCount' => ApprovalProject::onlyTrashed()->count(),
        ]);
    }

    /**
     * Soft-deleted approval projects — the recycle bin. From here a project can
     * be restored (its pending items reappear in approvers' queues) or deleted
     * for good, which removes every item under it.
     */
    public function trash()
    {
        $this->authorize('viewAny', ApprovalProject::class);

        $projects = ApprovalProject::onlyTrashed()
            ->with('owner')
            ->withCount('approvalItems')
            ->orderByDesc('deleted_at')
            ->paginate(15);

        return Inertia::render('ApprovalProjects/Trash', [
            'projects' => $projects,
        ]);
    }

    /** Bring a soft-deleted project back; its items return with it. */
    public function restore(ApprovalProject $approvalProject)
    {
        $this->authorize('restore', $approvalProject);

        $approvalProject->restore();

        return redirect()->route('approval-projects.trash')
            ->with('success', 'Approval project restored.');
    }

    /**
     * Permanently delete a project and everything under it.
     *
     * Items are force-deleted first, in their own statement: that clears the two
     * restrictOnDelete guards (items→chain_versions, step_instances→steps) by
     * removing the referencing rows before the project's cascade reaches the
     * steps and versions. Deleting the items cascades to their step instances,
     * approvers, decisions and custom-field values at the database level; the
     * project delete then cascades to chains, versions, steps, sections,
     * members, forms and automation rules. withTrashed() covers items that were
     * already soft-deleted.
     */
    public function forceDestroy(ApprovalProject $approvalProject)
    {
        $this->authorize('forceDelete', $approvalProject);

        DB::transaction(function () use ($approvalProject) {
            ApprovalItem::withTrashed()
                ->where('approval_project_id', $approvalProject->id)
                ->forceDelete();

            $approvalProject->forceDelete();
        });

        return redirect()->route('approval-projects.trash')
            ->with('success', 'Approval project and all its items permanently deleted.');
    }

    public function archived()
    {
        $this->authorize('viewAny', ApprovalProject::class);

        $projects = ApprovalProject::with('owner')
            ->where('status', 'archived')
            ->orderBy('updated_at', 'desc')
            ->paginate(15);

        return Inertia::render('ApprovalProjects/Archived', [
            'projects' => $projects,
        ]);
    }

    /** Toggle a project between archived and active. */
    public function archive(ApprovalProject $approvalProject)
    {
        $this->authorize('update', $approvalProject);

        $newStatus = $approvalProject->status === 'archived' ? 'active' : 'archived';
        $approvalProject->update(['status' => $newStatus]);

        $label = $newStatus === 'archived' ? 'archived' : 'unarchived';

        return back()->with('success', "Approval project {$label} successfully.");
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
            'is_pinned' => $request->is_pinned ?? false,
            // Blank prefix means "no numbering" — stored as null so hasSeries()
            // doesn't treat an empty string as a configured series.
            'series_prefix' => $request->filled('series_prefix') ? $request->series_prefix : null,
            'series_padding' => $request->input('series_padding') ?: 5,
            // Null means "no deadline", which is the behaviour before anyone
            // sets one. integer() would turn a blank into 0 and give every step
            // an instantly-expired deadline.
            'default_sla_hours' => $request->filled('default_sla_hours') ? (int) $request->input('default_sla_hours') : null,
            'sla_reminder_hours' => $request->filled('sla_reminder_hours') ? (int) $request->input('sla_reminder_hours') : null,
            // Escalate-after accepts 0 ("straight away"), so it tests for a
            // present value rather than a truthy one.
            'sla_escalate_after_hours' => $request->input('sla_escalate_after_hours') === null
                ? null : (int) $request->input('sla_escalate_after_hours'),
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

        $data = [
            'name' => $request->name,
            'description' => $request->description,
            'status' => $request->status,
            'owner_id' => $request->owner_id,
            'is_pinned' => $request->is_pinned ?? false,
            'series_padding' => $request->input('series_padding') ?: $approvalProject->series_padding,
            // Null means "no deadline", which is the behaviour before anyone
            // sets one. integer() would turn a blank into 0 and give every step
            // an instantly-expired deadline.
            'default_sla_hours' => $request->filled('default_sla_hours') ? (int) $request->input('default_sla_hours') : null,
            'sla_reminder_hours' => $request->filled('sla_reminder_hours') ? (int) $request->input('sla_reminder_hours') : null,
            // Escalate-after accepts 0 ("straight away"), so it tests for a
            // present value rather than a truthy one.
            'sla_escalate_after_hours' => $request->input('sla_escalate_after_hours') === null
                ? null : (int) $request->input('sla_escalate_after_hours'),
        ];

        // The prefix is write-once: settable while the project has none, ignored
        // afterwards. The request rejects an actual change; this makes sure a
        // resubmitted form can't quietly clear one either.
        if (!$approvalProject->hasSeries() && $request->filled('series_prefix')) {
            $data['series_prefix'] = $request->series_prefix;
        }

        $approvalProject->update($data);

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
            ->with('success', 'Approval project moved to Trash. Its pending items are hidden from approvers; restore it to bring them back.');
    }
}
