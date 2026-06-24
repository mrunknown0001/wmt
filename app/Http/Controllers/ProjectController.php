<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreProjectRequest;
use App\Http\Requests\UpdateProjectRequest;
use App\Models\Project;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class ProjectController extends Controller
{
    public function index(): Response
    {
        $this->authorize('viewAny', Project::class);

        $projects = Project::with('owner')
            ->withCount('tasks')
            ->withCount(['tasks as completed_tasks_count' => fn ($query) => $query->where('status', 'done')])
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        return Inertia::render('Projects/Index', [
            'projects' => $projects,
        ]);
    }

    public function create(): Response
    {
        $this->authorize('create', Project::class);

        return Inertia::render('Projects/Create', [
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'statuses' => ['active', 'on_hold', 'completed', 'archived'],
            'memberRoles' => ['viewer', 'editor'],
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

        $tasks = $project->tasks()
            ->with('assignee', 'creator', 'collaborators')
            ->orderBy('position')
            ->orderBy('created_at', 'desc')
            ->get();

        $canManageProject = auth()->user()->can('manage-projects')
            || $project->owner_id === auth()->id();

        $canManageTasks = auth()->user()->can('manage-tasks')
            || $project->owner_id === auth()->id();

        return Inertia::render('Projects/Show', [
            'project' => $project,
            'tasks' => $tasks,
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
            'memberRoles' => ['viewer', 'editor'],
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
