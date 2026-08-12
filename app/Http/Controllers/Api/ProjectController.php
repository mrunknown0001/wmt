<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProjectRequest;
use App\Http\Requests\UpdateProjectRequest;
use App\Models\Project;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProjectController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Project::with('owner:id,name')
            ->where('status', '!=', 'archived')
            ->withCount('tasks')
            ->withCount(['tasks as completed_tasks_count' => fn ($q) => $q->where('status', 'done')]);

        if ($search = $request->input('search')) {
            $query->where('name', 'like', '%' . $search . '%');
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $projects = $query->orderBy('created_at', 'desc')
            ->paginate(20);

        return response()->json($projects);
    }

    public function show(Request $request, Project $project): JsonResponse
    {
        $project->load('owner:id,name', 'members:id,name');

        $sections = $project->sections()->orderBy('position')->get(['id', 'name', 'position']);

        $tasks = $project->tasks()
            ->whereNull('parent_id')
            ->with(['assignee:id,name', 'creator:id,name', 'subtasks.assignee:id,name'])
            ->withCount('subtasks')
            ->withCount(['subtasks as completed_subtasks_count' => fn ($q) => $q->where('status', 'done')])
            ->orderBy('position')
            ->orderBy('created_at', 'desc')
            ->get();

        $isProjectAdmin = $project->isProjectAdmin($request->user());

        return response()->json([
            'project' => $project,
            'tasks' => $tasks,
            'sections' => $sections,
            'canManageProject' => $request->user()->can('manage-projects')
                || $project->owner_id === $request->user()->id
                || $isProjectAdmin,
            'canManageTasks' => $request->user()->can('manage-tasks')
                || $project->owner_id === $request->user()->id
                || $isProjectAdmin,
            // Archive and delete are the owner's (or a global manager's), not a
            // project admin's — so this deliberately omits isProjectAdmin.
            'canArchiveProject' => $project->userCanArchiveOrDelete($request->user()),
        ]);
    }

    public function store(StoreProjectRequest $request): JsonResponse
    {
        $data = $request->validated();

        if (empty($data['owner_id'])) {
            $data['owner_id'] = $request->user()->id;
        }

        $project = Project::create(collect($data)->except('members')->toArray());

        ActivityLogger::logCreated($project, $request->user());

        if (!empty($data['members'])) {
            $members = collect($data['members'])
                ->mapWithKeys(fn ($m) => [$m['user_id'] => ['role' => $m['role'] ?? 'viewer']]);
            $project->members()->sync($members);
        }

        $project->load('owner:id,name', 'members:id,name');

        return response()->json(['project' => $project], 201);
    }

    public function update(UpdateProjectRequest $request, Project $project): JsonResponse
    {
        $validated = $request->validated();

        $oldValues = $project->only(['name', 'description', 'status', 'owner_id', 'due_date']);
        $oldValues['due_date'] = $project->due_date?->toDateString();

        $project->update(collect($validated)->except('members')->toArray());

        ActivityLogger::logChanges($project, $oldValues, $request->user());

        $members = collect($validated['members'] ?? [])
            ->mapWithKeys(fn ($m) => [$m['user_id'] => ['role' => $m['role'] ?? 'viewer']]);
        $project->members()->sync($members);

        $project->load('owner:id,name', 'members:id,name');

        return response()->json(['project' => $project]);
    }

    public function destroy(Request $request, Project $project): JsonResponse
    {
        $this->authorize('delete', $project);

        ActivityLogger::logDeleted($project, $request->user());

        $project->delete();

        return response()->json(null, 204);
    }
}
