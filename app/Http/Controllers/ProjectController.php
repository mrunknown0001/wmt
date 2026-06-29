<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreProjectRequest;
use App\Http\Requests\UpdateProjectRequest;
use App\Models\Project;
use App\Models\User;
use App\Services\ActivityLogger;
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

        $user = $request->user();
        $userId = $user->id;

        $query = Project::with('owner')
            ->withCount('tasks')
            ->withCount(['tasks as completed_tasks_count' => fn ($q) => $q->where('status', 'done')]);

        // Non-admin users only see projects they own, are members of, or have assigned tasks in
        if (!$user->can('manage-projects')) {
            $query->where(function ($q) use ($userId) {
                $q->where('owner_id', $userId)
                    ->orWhereHas('members', fn ($m) => $m->where('users.id', $userId))
                    ->orWhereHas('tasks', fn ($t) => $t->where('assigned_to', $userId));
            });
        }

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

    public function archived(Request $request): Response
    {
        $this->authorize('viewAny', Project::class);

        $user = $request->user();
        $userId = $user->id;

        $query = Project::with('owner')
            ->where('status', 'archived')
            ->withCount('tasks')
            ->withCount(['tasks as completed_tasks_count' => fn ($q) => $q->where('status', 'done')]);

        // Non-admin users only see projects they own, are members of, or have assigned tasks in
        if (!$user->can('manage-projects')) {
            $query->where(function ($q) use ($userId) {
                $q->where('owner_id', $userId)
                    ->orWhereHas('members', fn ($m) => $m->where('users.id', $userId))
                    ->orWhereHas('tasks', fn ($t) => $t->where('assigned_to', $userId));
            });
        }

        if ($search = $request->input('search')) {
            $query->where('name', 'like', '%' . $search . '%');
        }

        $projects = $query->orderBy('updated_at', 'desc')
            ->paginate(20)
            ->withQueryString();

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

        return Inertia::render('Projects/Archived', [
            'projects' => $projects,
            'filters' => [
                'search' => $request->input('search', ''),
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

        ActivityLogger::logCreated($project, $request->user());

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

        $userId = auth()->id();
        $user = auth()->user();
        $isOwner = $project->owner_id === $userId;
        $isMember = $project->members->contains('id', $userId);
        $isProjectAdmin = $project->isProjectAdmin($user);
        $hasFullAccess = $user->can('manage-projects') || $isOwner || $isMember;

        $sections = $project->sections()->orderBy('position')->get();

        $taskQuery = $project->tasks()->whereNull('parent_id');

        if ($hasFullAccess) {
            $tasks = $taskQuery
                ->with(['assignee', 'creator', 'collaborators', 'subtasks.assignee', 'subtasks.collaborators'])
                ->withCount('subtasks')
                ->withCount(['subtasks as completed_subtasks_count' => fn ($q) => $q->where('status', 'done')])
                ->orderBy('position')
                ->orderBy('created_at', 'desc')
                ->get();
        } else {
            // User only has assigned tasks — show parent tasks assigned to them,
            // or parent tasks that have subtasks assigned to them
            $tasks = $taskQuery
                ->where(function ($q) use ($userId) {
                    $q->where('assigned_to', $userId)
                        ->orWhereHas('subtasks', fn ($s) => $s->where('assigned_to', $userId));
                })
                ->with([
                    'assignee', 'creator', 'collaborators',
                    'subtasks' => fn ($q) => $q->where('assigned_to', $userId),
                    'subtasks.assignee', 'subtasks.collaborators',
                ])
                ->withCount(['subtasks' => fn ($q) => $q->where('assigned_to', $userId)])
                ->withCount(['subtasks as completed_subtasks_count' => fn ($q) => $q->where('assigned_to', $userId)->where('status', 'done')])
                ->orderBy('position')
                ->orderBy('created_at', 'desc')
                ->get();
        }

        $canManageProject = auth()->user()->can('manage-projects')
            || $project->owner_id === auth()->id()
            || $isProjectAdmin;

        $canManageTasks = auth()->user()->can('manage-tasks')
            || $project->owner_id === auth()->id()
            || $isProjectAdmin;

        $automationRules = $canManageTasks
            ? $project->automationRules()->with('creator:id,name')->orderBy('created_at', 'desc')->get()
            : [];

        return Inertia::render('Projects/Show', [
            'project' => $project,
            'tasks' => $tasks,
            'sections' => $sections,
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'canManageProject' => $canManageProject,
            'canManageTasks' => $canManageTasks,
            'automationRules' => $automationRules,
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

        $oldValues = $project->only(['name', 'description', 'status', 'owner_id', 'due_date']);
        $oldValues['due_date'] = $project->due_date?->toDateString();

        $project->update(collect($validated)->except('members')->toArray());

        ActivityLogger::logChanges($project, $oldValues, $request->user());

        $members = collect($validated['members'] ?? [])
            ->mapWithKeys(fn ($m) => [$m['user_id'] => ['role' => $m['role'] ?? 'viewer']]);
        $project->members()->sync($members);

        return redirect("/projects/{$project->id}")
            ->with('success', 'Project updated successfully.');
    }

    public function archive(Project $project): RedirectResponse
    {
        $this->authorize('update', $project);

        $oldStatus = $project->status;
        $newStatus = $oldStatus === 'archived' ? 'active' : 'archived';

        $project->update(['status' => $newStatus]);

        ActivityLogger::logChanges($project, ['status' => $oldStatus], auth()->user());

        $label = $newStatus === 'archived' ? 'archived' : 'unarchived';

        return back()->with('success', "Project {$label} successfully.");
    }

    public function destroy(Project $project): RedirectResponse
    {
        $this->authorize('delete', $project);

        ActivityLogger::logDeleted($project, auth()->user());

        $project->delete();

        return redirect('/projects')
            ->with('success', 'Project deleted successfully.');
    }
}
