<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreProjectRequest;
use App\Http\Requests\UpdateProjectRequest;
use App\Models\Project;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class ProjectController extends Controller
{
    public function index(Request $request): Response
    {
        $this->authorize('viewAny', Project::class);

        $query = Project::with('owner')
            ->withCount('tasks')
            ->withCount(['tasks as completed_tasks_count' => fn ($q) => $q->where('status', 'done')]);

        if ($search = $request->input('search')) {
            $query->where('name', 'like', '%' . $search . '%');
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $projects = $query->orderBy('created_at', 'desc')
            ->paginate(20)
            ->withQueryString();

        // Flag projects where current user is a project admin member
        $adminProjectIds = DB::table('project_members')
            ->where('user_id', auth()->id())
            ->where('role', 'admin')
            ->whereIn('project_id', $projects->pluck('id'))
            ->pluck('project_id')
            ->toArray();

        $projects->getCollection()->transform(function ($project) use ($adminProjectIds) {
            $project->user_is_admin = in_array($project->id, $adminProjectIds);
            return $project;
        });

        return Inertia::render('Projects/Index', [
            'projects' => $projects,
            'filters' => [
                'search' => $request->input('search', ''),
                'status' => $request->input('status', ''),
            ],
        ]);
    }

    public function create(): Response
    {
        $this->authorize('create', Project::class);

        return Inertia::render('Projects/Create', [
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'statuses' => ['active', 'on_hold', 'completed', 'archived'],
            'memberRoles' => ['viewer', 'editor', 'admin'],
        ]);
    }

    public function store(StoreProjectRequest $request): RedirectResponse
    {
        $data = $request->validated();

        if (empty($data['owner_id'])) {
            $data['owner_id'] = $request->user()->id;
        }

        $project = Project::create(collect($data)->except('members')->toArray());

        if (!empty($data['members'])) {
            $members = collect($data['members'])
                ->mapWithKeys(fn ($m) => [$m['user_id'] => ['role' => $m['role'] ?? 'viewer']]);
            $project->members()->sync($members);
        }

        return redirect("/projects/{$project->id}")
            ->with('success', 'Project created successfully.');
    }

    public function show(Project $project): Response
    {
        $this->authorize('view', $project);

        $project->load('owner', 'members');

        $sections = $project->sections()->orderBy('position')->get();

        $tasks = $project->tasks()
            ->whereNull('parent_id')
            ->with(['assignee', 'creator', 'collaborators', 'subtasks.assignee', 'subtasks.collaborators'])
            ->withCount('subtasks')
            ->withCount(['subtasks as completed_subtasks_count' => fn ($q) => $q->where('status', 'done')])
            ->orderBy('position')
            ->orderBy('created_at', 'desc')
            ->get();

        $isProjectAdmin = $project->isProjectAdmin(auth()->user());

        $canManageProject = auth()->user()->can('manage-projects')
            || $project->owner_id === auth()->id()
            || $isProjectAdmin;

        $canManageTasks = auth()->user()->can('manage-tasks')
            || $project->owner_id === auth()->id()
            || $isProjectAdmin;

        return Inertia::render('Projects/Show', [
            'project' => $project,
            'tasks' => $tasks,
            'sections' => $sections,
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'canManageProject' => $canManageProject,
            'canManageTasks' => $canManageTasks,
            'statuses' => ['backlog', 'to_do', 'in_progress', 'in_review', 'done', 'cancelled'],
            'priorities' => ['low', 'medium', 'high', 'urgent'],
        ]);
    }

    public function edit(Project $project): Response
    {
        $this->authorize('update', $project);

        $project->load('owner', 'members');

        return Inertia::render('Projects/Edit', [
            'project' => $project,
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'statuses' => ['active', 'on_hold', 'completed', 'archived'],
            'memberRoles' => ['viewer', 'editor', 'admin'],
        ]);
    }

    public function update(UpdateProjectRequest $request, Project $project): RedirectResponse
    {
        $validated = $request->validated();

        $project->update(collect($validated)->except('members')->toArray());

        $members = collect($validated['members'] ?? [])
            ->mapWithKeys(fn ($m) => [$m['user_id'] => ['role' => $m['role'] ?? 'viewer']]);
        $project->members()->sync($members);

        return redirect("/projects/{$project->id}")
            ->with('success', 'Project updated successfully.');
    }

    public function destroy(Project $project): RedirectResponse
    {
        $this->authorize('delete', $project);

        $project->delete();

        return redirect('/projects')
            ->with('success', 'Project deleted successfully.');
    }
}
