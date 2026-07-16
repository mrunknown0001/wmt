<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreProjectRequest;
use App\Http\Requests\UpdateProjectRequest;
use App\Models\Department;
use App\Models\Folder;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskCustomFieldValue;
use App\Models\Team;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\FolderService;
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

        $view = $request->input('view') === 'folders' ? 'folders' : 'all';
        $folderId = $request->input('folder');

        $query = Project::with('owner', 'folder:id,name')
            ->where('status', '!=', 'archived')
            ->withCount('tasks')
            ->withCount(['tasks as completed_tasks_count' => fn ($q) => $q->where('status', 'done')]);

        // Non-admin, non-executive users only see projects they own, are members of, have assigned
        // tasks in, or that sit in an org folder they oversee (head/leader)
        if (!$user->can('manage-projects') && !$user->hasRole('executive')) {
            $overseenFolderIds = FolderService::overseenFolderIds($user);
            $query->where(function ($q) use ($userId, $overseenFolderIds) {
                $q->where('owner_id', $userId)
                    ->orWhereHas('members', fn ($m) => $m->where('users.id', $userId))
                    ->orWhereHas('tasks', fn ($t) => $t->where('assigned_to', $userId))
                    ->orWhereIn('folder_id', $overseenFolderIds);
            });
        }

        // Folders view shows the selected folder's whole subtree (root = unfiled),
        // e.g. a division folder includes its departments' and teams' projects
        if ($view === 'folders') {
            $selected = $folderId && $folderId !== 'root' ? Folder::find($folderId) : null;
            if ($selected) {
                $query->whereIn('folder_id', Folder::where('path', 'like', $selected->path . '%')->select('id'));
            } else {
                $query->whereNull('folder_id');
            }
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

        $projects = $query->orderByDesc('is_pinned')
            ->orderBy('position')
            ->orderBy('created_at', 'desc')
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
                'view' => $view,
                'folder' => $folderId ?: '',
            ],
            'owners' => User::whereHas('ownedProjects', fn ($q) => $q->where('status', '!=', 'archived'))
                ->orderBy('name')->get(['id', 'name']),
            'folders' => $this->folderTree($user),
        ]);
    }

    /**
     * Flat folder list for the tree UI, scoped to what the user may see, with
     * per-folder direct counts of visible projects. Recursive totals are
     * summed client-side.
     */
    private function folderTree(User $user): array
    {
        $countQuery = Project::where('status', '!=', 'archived')->whereNotNull('folder_id');

        if (!$user->can('manage-projects') && !$user->hasRole('executive')) {
            $overseenFolderIds = FolderService::overseenFolderIds($user);
            $countQuery->where(function ($q) use ($user, $overseenFolderIds) {
                $q->where('owner_id', $user->id)
                    ->orWhereHas('members', fn ($m) => $m->where('users.id', $user->id))
                    ->orWhereHas('tasks', fn ($t) => $t->where('assigned_to', $user->id))
                    ->orWhereIn('folder_id', $overseenFolderIds);
            });
        }

        $counts = $countQuery->groupBy('folder_id')
            ->selectRaw('folder_id, COUNT(*) as total')
            ->pluck('total', 'folder_id');

        return Folder::whereIn('id', FolderService::visibleFolderIds($user))
            ->orderBy('position')->orderBy('name')
            ->get(['id', 'name', 'parent_id', 'depth', 'user_depth', 'source_type', 'created_by'])
            ->map(fn ($f) => [
                'id' => $f->id,
                'name' => $f->name,
                'parent_id' => $f->parent_id,
                'depth' => $f->depth,
                'user_depth' => $f->user_depth,
                'is_system' => $f->source_type !== null,
                'source_type' => $f->source_type ? class_basename($f->source_type) : null,
                'created_by' => $f->created_by,
                'project_count' => (int) ($counts[$f->id] ?? 0),
            ])
            ->values()
            ->all();
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

        // Non-admin, non-executive users only see projects they own, are members of, have assigned
        // tasks in, or that sit in an org folder they oversee (head/leader)
        if (!$user->can('manage-projects') && !$user->hasRole('executive')) {
            $overseenFolderIds = FolderService::overseenFolderIds($user);
            $query->where(function ($q) use ($userId, $overseenFolderIds) {
                $q->where('owner_id', $userId)
                    ->orWhereHas('members', fn ($m) => $m->where('users.id', $userId))
                    ->orWhereHas('tasks', fn ($t) => $t->where('assigned_to', $userId))
                    ->orWhereIn('folder_id', $overseenFolderIds);
            });
        }

        if ($search = $request->input('search')) {
            $query->where('name', 'like', '%' . $search . '%');
        }

        if ($ownerId = $request->input('owner')) {
            $query->where('owner_id', $ownerId);
        }

        $projects = $query->orderByDesc('is_pinned')
            ->orderBy('position')
            ->orderBy('updated_at', 'desc')
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

    public function create(Request $request): Response
    {
        $this->authorize('create', Project::class);

        $user = $request->user();

        $defaultFolderId = null;

        // Coming from the Folders view: default to the folder being browsed
        $requestedFolderId = (int) $request->input('folder');
        if ($requestedFolderId
            && FolderService::visibleFolderIds($user)->contains($requestedFolderId)) {
            $defaultFolderId = $requestedFolderId;
        }

        if (!$defaultFolderId && $user->team_id) {
            $defaultFolderId = Folder::where('source_type', Team::class)
                ->where('source_id', $user->team_id)->value('id');
        }
        if (!$defaultFolderId && $user->department_id) {
            $defaultFolderId = Folder::where('source_type', Department::class)
                ->where('source_id', $user->department_id)->value('id');
        }

        return Inertia::render('Projects/Create', [
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'statuses' => ['active', 'on_hold', 'completed', 'archived'],
            'memberRoles' => ['viewer', 'editor', 'admin'],
            'folders' => $this->folderTree($user),
            'defaultFolderId' => $defaultFolderId,
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
        $overseesFolder = $project->folder_id
            && FolderService::overseenFolderIds($user)->contains($project->folder_id);
        $hasFullAccess = $user->can('manage-projects') || $user->hasRole('executive')
            || $isOwner || $isMember || $overseesFolder;

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

        // Dashboard charts: admins, executives (all projects), project owner,
        // and project admin members can add/edit/remove charts
        $canManageCharts = $canManageProject
            || $user->hasRole('admin')
            || $user->hasRole('executive');

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
            'canManageCharts' => $canManageCharts,
            'charts' => $project->charts()->get(),
            'automationRules' => $automationRules,
            'customFields' => $customFields,
            'forms' => $project->forms()->orderBy('name')->get(['id', 'name']),
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
            'folders' => $this->folderTree(auth()->user()),
        ]);
    }

    public function update(UpdateProjectRequest $request, Project $project): RedirectResponse
    {
        $validated = $request->validated();

        $oldValues = $project->only(['name', 'description', 'status', 'owner_id', 'folder_id', 'due_date']);
        $oldValues['due_date'] = $project->due_date?->toDateString();

        $project->update(collect($validated)->except('members')->toArray());

        ActivityLogger::logChanges($project, $oldValues, $request->user());

        $members = collect($validated['members'] ?? [])
            ->mapWithKeys(fn ($m) => [$m['user_id'] => ['role' => $m['role'] ?? 'viewer']]);
        $project->members()->sync($members);

        return redirect("/projects/{$project->id}")
            ->with('success', 'Project updated successfully.');
    }

    public function moveToFolder(Request $request, Project $project): RedirectResponse
    {
        $this->authorize('update', $project);

        $validated = $request->validate([
            'folder_id' => 'nullable|exists:folders,id',
        ]);

        $folderId = $validated['folder_id'] ?? null;

        if ($folderId && !FolderService::visibleFolderIds($request->user())->contains((int) $folderId)) {
            return back()->withErrors(['folder_id' => 'You do not have access to that folder.']);
        }

        $oldValues = ['folder_id' => $project->folder_id];

        $project->update(['folder_id' => $folderId]);

        ActivityLogger::logChanges($project, $oldValues, $request->user());

        return back()->with('success', 'Project moved.');
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
            'copy_automation_rules' => 'boolean',
        ]);

        $includeTasks = $request->boolean('include_tasks', true);
        $copyDueDates = $request->boolean('copy_due_dates', true);
        $copyAssignees = $request->boolean('copy_assignees', true);
        $copySubtasks = $request->boolean('copy_subtasks', true);
        $copyAutomationRules = $request->boolean('copy_automation_rules', true);

        $newProject = DB::transaction(function () use ($project, $request, $includeTasks, $copyDueDates, $copyAssignees, $copySubtasks, $copyAutomationRules) {
            $newProject = Project::create([
                'name' => "Copy of {$project->name}",
                'description' => $project->description,
                'status' => 'active',
                'owner_id' => $request->user()->id,
                'folder_id' => $project->folder_id,
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
            $fieldTypeMap = [];
            foreach ($project->customFields()->with('options')->get() as $oldField) {
                $fieldTypeMap[$oldField->id] = $oldField->type;
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

            // Copy automation rules if requested (remap section/custom field/option ids)
            if ($copyAutomationRules) {
                foreach ($project->automationRules()->get() as $oldRule) {
                    $newProject->automationRules()->create([
                        'name' => $oldRule->name,
                        'is_active' => $oldRule->is_active,
                        'trigger_type' => $oldRule->trigger_type,
                        'trigger_config' => $this->remapRuleTriggerConfig($oldRule->trigger_config, $customFieldMap),
                        'conditions' => $this->remapRuleConditions($oldRule->conditions, $sectionMap, $customFieldMap, $optionMap, $fieldTypeMap),
                        'actions' => $this->remapRuleActions($oldRule->actions, $sectionMap, $customFieldMap, $optionMap, $fieldTypeMap),
                        'created_by' => $request->user()->id,
                    ]);
                }
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

    private function remapRuleTriggerConfig(?array $triggerConfig, array $customFieldMap): ?array
    {
        if (empty($triggerConfig)) {
            return $triggerConfig;
        }

        if (isset($triggerConfig['custom_field_id'])) {
            $triggerConfig['custom_field_id'] = $customFieldMap[(int) $triggerConfig['custom_field_id']]
                ?? $triggerConfig['custom_field_id'];
        }

        // form_id is left untouched — forms are not duplicated, so form-scoped
        // rules simply never fire on the copy until re-pointed at a new form

        return $triggerConfig;
    }

    private function remapRuleConditions(?array $conditions, array $sectionMap, array $customFieldMap, array $optionMap, array $fieldTypeMap): ?array
    {
        if (empty($conditions)) {
            return $conditions;
        }

        return array_map(function (array $condition) use ($sectionMap, $customFieldMap, $optionMap, $fieldTypeMap) {
            $field = $condition['field'] ?? null;

            if ($field === 'section_id') {
                $condition['value'] = $this->remapRuleIdValue($condition['value'] ?? null, $sectionMap);
            } elseif ($field === 'custom_field') {
                $oldCfId = $condition['custom_field_id'] ?? null;
                if ($oldCfId !== null && $oldCfId !== '') {
                    $condition['custom_field_id'] = $customFieldMap[(int) $oldCfId] ?? $oldCfId;

                    // Select field values are option ids
                    if (in_array($fieldTypeMap[(int) $oldCfId] ?? null, ['single_select', 'multi_select'], true)) {
                        $condition['value'] = $this->remapRuleIdValue($condition['value'] ?? null, $optionMap);
                    }
                }
            }

            return $condition;
        }, $conditions);
    }

    private function remapRuleActions(array $actions, array $sectionMap, array $customFieldMap, array $optionMap, array $fieldTypeMap): array
    {
        return array_map(function (array $action) use ($sectionMap, $customFieldMap, $optionMap, $fieldTypeMap) {
            $params = $action['params'] ?? [];

            if (($action['type'] ?? null) === 'move_to_section' && isset($params['section_id'])) {
                $params['section_id'] = $this->remapRuleIdValue($params['section_id'], $sectionMap);
            } elseif (($action['type'] ?? null) === 'set_custom_field') {
                $oldCfId = $params['custom_field_id'] ?? null;
                if ($oldCfId !== null && $oldCfId !== '') {
                    $params['custom_field_id'] = $customFieldMap[(int) $oldCfId] ?? $oldCfId;

                    if (in_array($fieldTypeMap[(int) $oldCfId] ?? null, ['single_select', 'multi_select'], true)) {
                        $params['value'] = $this->remapRuleIdValue($params['value'] ?? null, $optionMap);
                    }
                }
            }

            $action['params'] = $params;

            return $action;
        }, $actions);
    }

    /**
     * Remap a scalar or array-of-ids rule value through an old-id → new-id map.
     * Non-numeric values (placeholders like __project_owner__, empty strings) pass through.
     */
    private function remapRuleIdValue($value, array $map)
    {
        if (is_array($value)) {
            return array_map(fn ($v) => $this->remapRuleIdValue($v, $map), $value);
        }

        if ($value === null || $value === '' || !is_numeric($value)) {
            return $value;
        }

        return $map[(int) $value] ?? $value;
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

    public function togglePin(Project $project): JsonResponse
    {
        $this->authorize('update', $project);

        $project->update(['is_pinned' => !$project->is_pinned]);

        ActivityLogger::logChanges($project, ['is_pinned' => !$project->is_pinned], auth()->user());

        return response()->json(['success' => true, 'is_pinned' => $project->is_pinned]);
    }

    public function reorder(Request $request): JsonResponse
    {
        $request->validate([
            'projects' => 'required|array',
            'projects.*.id' => 'required|integer|exists:projects,id',
            'projects.*.position' => 'required|integer|min:0',
        ]);

        DB::transaction(function () use ($request) {
            foreach ($request->input('projects') as $item) {
                $project = Project::find($item['id']);
                if ($project) {
                    $this->authorize('update', $project);
                    $project->update(['position' => $item['position']]);
                }
            }
        });

        return response()->json(['success' => true]);
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
