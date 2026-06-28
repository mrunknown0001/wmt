<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\User;
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
        ]);
    }
}
