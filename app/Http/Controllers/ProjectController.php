<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreProjectRequest;
use App\Http\Requests\UpdateProjectRequest;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskCustomFieldValue;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
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
            ->where('status', '!=', 'archived')
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

        if ($ownerId = $request->input('owner')) {
            $query->where('owner_id', $ownerId);
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
                'owner' => $request->input('owner', ''),
            ],
            'owners' => User::whereHas('ownedProjects', fn ($q) => $q->where('status', '!=', 'archived'))
                ->orderBy('name')->get(['id', 'name']),
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

        if ($ownerId = $request->input('owner')) {
            $query->where('owner_id', $ownerId);
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
                'owner' => $request->input('owner', ''),
            ],
            'owners' => User::whereHas('ownedProjects', fn ($q) => $q->where('status', 'archived'))
                ->orderBy('name')->get(['id', 'name']),
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
                ->with([
                    'assignee', 'creator', 'collaborators',
                    'subtasks' => fn ($q) => $q->withCount(['comments', 'attachments']),
                    'subtasks.assignee', 'subtasks.collaborators',
                    'customFieldValues.selectedOption', 'subtasks.customFieldValues.selectedOption',
                ])
                ->withCount('subtasks')
                ->withCount(['subtasks as completed_subtasks_count' => fn ($q) => $q->where('status', 'done')])
                ->withCount(['comments', 'attachments'])
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
                    'subtasks' => fn ($q) => $q->where('assigned_to', $userId)->withCount(['comments', 'attachments']),
                    'subtasks.assignee', 'subtasks.collaborators',
                    'customFieldValues.selectedOption',
                    'subtasks.customFieldValues.selectedOption',
                ])
                ->withCount(['subtasks' => fn ($q) => $q->where('assigned_to', $userId)])
                ->withCount(['subtasks as completed_subtasks_count' => fn ($q) => $q->where('assigned_to', $userId)->where('status', 'done')])
                ->withCount(['comments', 'attachments'])
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

        $customFields = $project->customFields()->with('options')->get();

        return Inertia::render('Projects/Show', [
            'project' => $project,
            'tasks' => $tasks,
            'sections' => $sections,
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name', 'email']),
            'canManageProject' => $canManageProject,
            'canManageTasks' => $canManageTasks,
            'automationRules' => $automationRules,
            'customFields' => $customFields,
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

    public function duplicate(Request $request, Project $project): JsonResponse
    {
        $this->authorize('view', $project);
        $this->authorize('create', Project::class);

        $request->validate([
            'include_tasks' => 'boolean',
            'copy_due_dates' => 'boolean',
            'copy_assignees' => 'boolean',
            'copy_subtasks' => 'boolean',
        ]);

        $includeTasks = $request->boolean('include_tasks', true);
        $copyDueDates = $request->boolean('copy_due_dates', true);
        $copyAssignees = $request->boolean('copy_assignees', true);
        $copySubtasks = $request->boolean('copy_subtasks', true);

        $newProject = DB::transaction(function () use ($project, $request, $includeTasks, $copyDueDates, $copyAssignees, $copySubtasks) {
            $newProject = Project::create([
                'name' => "Copy of {$project->name}",
                'description' => $project->description,
                'status' => 'active',
                'owner_id' => $request->user()->id,
                'due_date' => $copyDueDates ? $project->due_date : null,
            ]);

            // Copy members
            $members = $project->members()->get();
            if ($members->isNotEmpty()) {
                $memberData = $members->mapWithKeys(fn ($m) => [$m->id => ['role' => $m->pivot->role]]);
                $newProject->members()->sync($memberData);
            }

            // Copy custom fields + options (build mapping)
            $customFieldMap = [];
            $optionMap = [];
            foreach ($project->customFields()->with('options')->get() as $oldField) {
                $newField = $newProject->customFields()->create([
                    'name' => $oldField->name,
                    'type' => $oldField->type,
                    'is_required' => $oldField->is_required,
                    'position' => $oldField->position,
                    'config' => $oldField->config,
                ]);
                $customFieldMap[$oldField->id] = $newField->id;
                foreach ($oldField->options as $oldOption) {
                    $newOption = $newField->options()->create([
                        'label' => $oldOption->label,
                        'color' => $oldOption->color,
                        'position' => $oldOption->position,
                    ]);
                    $optionMap[$oldOption->id] = $newOption->id;
                }
            }

            // Copy sections (build mapping)
            $sectionMap = [];
            foreach ($project->sections()->orderBy('position')->get() as $oldSection) {
                $newSection = $newProject->sections()->create([
                    'name' => $oldSection->name,
                    'color' => $oldSection->color,
                    'position' => $oldSection->position,
                ]);
                $sectionMap[$oldSection->id] = $newSection->id;
            }

            // Copy tasks if requested
            if ($includeTasks) {
                $parentTasks = $project->tasks()
                    ->whereNull('parent_id')
                    ->with(['collaborators', 'customFieldValues'])
                    ->orderBy('position')
                    ->get();

                foreach ($parentTasks as $oldTask) {
                    $newTask = $this->duplicateTask(
                        $newProject, $oldTask, null,
                        $copyDueDates, $copyAssignees,
                        $request->user()->id,
                        $sectionMap, $customFieldMap, $optionMap
                    );

                    if ($copySubtasks) {
                        foreach ($oldTask->subtasks()->with(['collaborators', 'customFieldValues'])->orderBy('position')->get() as $oldSubtask) {
                            $this->duplicateTask(
                                $newProject, $oldSubtask, $newTask->id,
                                $copyDueDates, $copyAssignees,
                                $request->user()->id,
                                $sectionMap, $customFieldMap, $optionMap
                            );
                        }
                    }
                }
            }

            return $newProject;
        });

        ActivityLogger::logCreated($newProject, $request->user());

        return response()->json([
            'success' => true,
            'project' => [
                'id' => $newProject->id,
                'name' => $newProject->name,
            ],
        ]);
    }

    private function duplicateTask(
        Project $newProject,
        Task $oldTask,
        ?int $parentId,
        bool $copyDueDates,
        bool $copyAssignees,
        int $createdBy,
        array $sectionMap,
        array $customFieldMap,
        array $optionMap,
    ): Task {
        $newTask = $newProject->tasks()->create([
            'title' => $oldTask->title,
            'description' => $oldTask->description,
            'status' => $oldTask->status,
            'priority' => $oldTask->priority,
            'assigned_to' => $copyAssignees ? $oldTask->assigned_to : null,
            'created_by' => $createdBy,
            'start_date' => $copyDueDates ? $oldTask->start_date : null,
            'due_date' => $copyDueDates ? $oldTask->due_date : null,
            'position' => $oldTask->position,
            'section_id' => isset($oldTask->section_id) ? ($sectionMap[$oldTask->section_id] ?? null) : null,
            'parent_id' => $parentId,
        ]);

        if ($copyAssignees && $oldTask->collaborators->isNotEmpty()) {
            $newTask->collaborators()->sync($oldTask->collaborators->pluck('id'));
        }

        foreach ($oldTask->customFieldValues as $cfv) {
            $newCfId = $customFieldMap[$cfv->custom_field_id] ?? null;
            if (!$newCfId) continue;

            TaskCustomFieldValue::create([
                'task_id' => $newTask->id,
                'custom_field_id' => $newCfId,
                'value_text' => $cfv->value_text,
                'value_number' => $cfv->value_number,
                'value_date' => $cfv->value_date,
                'value_json' => $cfv->value_json
                    ? array_map(fn ($id) => $optionMap[$id] ?? $id, $cfv->value_json)
                    : null,
                'value_option_id' => $cfv->value_option_id
                    ? ($optionMap[$cfv->value_option_id] ?? null)
                    : null,
            ]);
        }

        return $newTask;
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
