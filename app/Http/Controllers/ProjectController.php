<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreProjectRequest;
use App\Http\Requests\UpdateProjectRequest;
use App\Models\Department;
use App\Models\Folder;
use App\Models\Project;
use App\Models\ProjectEscalationRule;
use App\Models\Setting;
use App\Models\Task;
use App\Models\TaskCustomFieldValue;
use App\Models\Team;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\FolderService;
use App\Services\TaskSeriesService;
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

    /** Reset the task-number counter and free the numbers held in the trash. */
    public function resetTaskSeries(Request $request, Project $project): RedirectResponse
    {
        $this->authorize('update', $project);

        $result = TaskSeriesService::resetCounter($project);

        $message = 'Numbering counter reset — the next task will be '
            . $project->formatTaskSeries($result['next']) . '.';

        if ($result['released'] > 0) {
            $message .= ' ' . $result['released'] . ' '
                . str('number')->plural($result['released'])
                . ' held by deleted tasks were freed for reuse.';
        }

        return back()->with('success', $message);
    }

    /**
     * The global tiers in plain terms, so the settings page can show what
     * "use the global rules" actually means without the reader having to open
     * admin settings in another tab.
     */
    private function globalEscalationSummary(): array
    {
        $settings = Setting::current();

        return [
            'enabled' => (bool) $settings->escalation_enabled,
            'tiers' => collect($settings->escalation_tiers ?? [])
                ->map(fn ($tier, $i) => [
                    'label' => Setting::ESCALATION_LABELS[$i + 1] ?? 'Level ' . ($i + 1),
                    'days' => $tier['days'] ?? null,
                    'enabled' => (bool) ($tier['enabled'] ?? false),
                ])
                ->values()
                ->all(),
        ];
    }

    /**
     * Replace the project's escalation ladder with what the form sent.
     *
     * Replaced wholesale rather than diffed: it is a short ordered list edited
     * as a unit, and position is what defines the ladder, so matching rows up
     * by id would buy nothing but a chance to get the order wrong.
     */
    private function syncEscalationRules(Project $project, ?array $rules): void
    {
        $project->escalationRules()->delete();

        foreach (array_values($rules ?? []) as $index => $rule) {
            $project->escalationRules()->create([
                'name' => $rule['name'],
                'offset_unit' => $rule['offset_unit'],
                'offset_value' => (int) $rule['offset_value'],
                'recipients' => array_values(array_unique($rule['recipients'])),
                'is_active' => $rule['is_active'] ?? true,
                'position' => $index,
            ]);
        }
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
            'escalationRecipients' => ProjectEscalationRule::RECIPIENTS,
            'globalEscalation' => $this->globalEscalationSummary(),
        ]);
    }

    public function store(StoreProjectRequest $request): RedirectResponse
    {
        $data = $request->validated();

        if (empty($data['owner_id'])) {
            $data['owner_id'] = $request->user()->id;
        }

        $project = Project::create(collect($data)->except(['members', 'escalation_rules'])->toArray());

        $this->syncEscalationRules($project, $data['escalation_rules'] ?? null);

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
                    'subtasks' => fn ($q) => $q->withCount(['comments', 'attachments'])
                        ->withSum(['timeLogs as logged_minutes' => fn ($t) => $t->whereNotNull('minutes')], 'minutes'),
                    'subtasks.assignee', 'subtasks.collaborators',
                    // customField is eager loaded because the value model appends
                    // people_names, whose accessor otherwise lazy-loads it once per
                    // value — an N+1 across every task on the page.
                    'customFieldValues.selectedOption', 'customFieldValues.customField',
                    'subtasks.customFieldValues.selectedOption', 'subtasks.customFieldValues.customField',
                ])
                ->withCount('subtasks')
                ->withCount(['subtasks as completed_subtasks_count' => fn ($q) => $q->where('status', 'done')])
                ->withCount(['comments', 'attachments'])
                // One aggregate rather than a loggedMinutes() call per row.
                // Only finished entries: a running timer has no duration.
                ->withSum(['timeLogs as logged_minutes' => fn ($q) => $q->whereNotNull('minutes')], 'minutes')
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
                    'subtasks' => fn ($q) => $q->where('assigned_to', $userId)->withCount(['comments', 'attachments'])
                        ->withSum(['timeLogs as logged_minutes' => fn ($t) => $t->whereNotNull('minutes')], 'minutes'),
                    'subtasks.assignee', 'subtasks.collaborators',
                    'customFieldValues.selectedOption', 'customFieldValues.customField',
                    'subtasks.customFieldValues.selectedOption', 'subtasks.customFieldValues.customField',
                ])
                ->withCount(['subtasks' => fn ($q) => $q->where('assigned_to', $userId)])
                ->withCount(['subtasks as completed_subtasks_count' => fn ($q) => $q->where('assigned_to', $userId)->where('status', 'done')])
                ->withCount(['comments', 'attachments'])
                // One aggregate rather than a loggedMinutes() call per row.
                // Only finished entries: a running timer has no duration.
                ->withSum(['timeLogs as logged_minutes' => fn ($q) => $q->whereNotNull('minutes')], 'minutes')
                ->orderBy('position')
                ->orderBy('created_at', 'desc')
                ->get();
        }

        // Editors work on tasks but must not reach project settings, members,
        // custom fields, forms or automation rules — hence two separate checks.
        $canManageProject = $project->userCanManageProject(auth()->user());
        $canManageTasks = $project->userCanManageTasks(auth()->user());

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
            'project' => array_merge($project->toArray(), [
                // Drives the write-once lock on the prefix, and the "n existing
                // tasks will be numbered" note shown before numbering is on.
                'task_series_started' => $project->taskSeriesStarted(),
                'unnumbered_task_count' => $project->tasks()->whereNull('series_sequence')->count(),
                // Drives the "n numbers are held by deleted tasks" note on the
                // reset control.
                'trashed_series_count' => TaskSeriesService::heldByTrashed($project),
                'escalation_rules' => $project->escalationRules()->get()
                    ->map(fn ($r) => [
                        'name' => $r->name,
                        'offset_unit' => $r->offset_unit,
                        'offset_value' => $r->offset_value,
                        'recipients' => $r->recipients,
                        'is_active' => $r->is_active,
                    ])->values(),
            ]),
            'escalationRecipients' => ProjectEscalationRule::RECIPIENTS,
            'globalEscalation' => $this->globalEscalationSummary(),
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

        $seriesWasOff = !$project->hasTaskSeries();
        $escalationWasGlobal = $project->usesGlobalEscalation();

        $project->update(collect($validated)->except(['members', 'escalation_rules'])->toArray());

        if (array_key_exists('escalation_rules', $validated)) {
            $this->syncEscalationRules($project, $validated['escalation_rules']);
        }

        // Switching ladders resets how far each task has climbed. Without this
        // a task already at global level 4 would sit above every rung of the
        // project's new ladder and never escalate again — the rules would look
        // broken. Rule edits within the same mode deliberately do not reset:
        // renaming a rung should not re-notify every overdue task in the
        // project.
        if ($escalationWasGlobal !== $project->usesGlobalEscalation()) {
            $project->tasks()->where('escalation_level', '>', 0)->update(['escalation_level' => 0]);
        }

        // Turning numbering on gives the tasks that are already here a number
        // too — the ones people refer to most are the ones already in flight.
        $backfilled = 0;
        if ($seriesWasOff && $project->hasTaskSeries()) {
            $backfilled = TaskSeriesService::backfill($project);
        }

        ActivityLogger::logChanges($project, $oldValues, $request->user());

        $members = collect($validated['members'] ?? [])
            ->mapWithKeys(fn ($m) => [$m['user_id'] => ['role' => $m['role'] ?? 'viewer']]);
        $project->members()->sync($members);

        $message = $backfilled > 0
            ? "Project updated. {$backfilled} existing " . str('task')->plural($backfilled) . ' numbered.'
            : 'Project updated successfully.';

        return redirect("/projects/{$project->id}")->with('success', $message);
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
            'copy_forms' => 'boolean',
        ]);

        $includeTasks = $request->boolean('include_tasks', true);
        $copyDueDates = $request->boolean('copy_due_dates', true);
        $copyAssignees = $request->boolean('copy_assignees', true);
        $copySubtasks = $request->boolean('copy_subtasks', true);
        $copyAutomationRules = $request->boolean('copy_automation_rules', true);
        $copyForms = $request->boolean('copy_forms', true);

        $newProject = DB::transaction(function () use ($project, $request, $includeTasks, $copyDueDates, $copyAssignees, $copySubtasks, $copyAutomationRules, $copyForms) {
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

            // Copy sections (build mapping).
            //
            // Columns first, then their sub-sections, so a child's parent has
            // already been copied and can be remapped. Ordering by parent_id
            // with nulls first is not portable, hence the two passes — and a
            // child pointed at the *original* project's section would be
            // rejected by TaskSection, which is the failure this avoids.
            $sectionMap = [];
            $allSections = $project->sections()->orderBy('position')->get();

            foreach ($allSections->whereNull('parent_id') as $oldSection) {
                $newSection = $newProject->sections()->create([
                    'name' => $oldSection->name,
                    'color' => $oldSection->color,
                    'position' => $oldSection->position,
                ]);
                $sectionMap[$oldSection->id] = $newSection->id;
            }

            foreach ($allSections->whereNotNull('parent_id') as $oldSection) {
                // A sub-section whose parent was not copied has nowhere to go.
                if (!isset($sectionMap[$oldSection->parent_id])) {
                    continue;
                }

                $newSection = $newProject->sections()->create([
                    'name' => $oldSection->name,
                    'color' => $oldSection->color,
                    'position' => $oldSection->position,
                    'parent_id' => $sectionMap[$oldSection->parent_id],
                ]);
                $sectionMap[$oldSection->id] = $newSection->id;
            }

            // Copy forms if requested (remap custom field ids)
            if ($copyForms) {
                foreach ($project->forms()->get() as $oldForm) {
                    $newForm = $newProject->forms()->create([
                        'name' => $oldForm->name,
                        'description' => $oldForm->description,
                        'is_active' => $oldForm->is_active,
                        'submit_button_text' => $oldForm->submit_button_text,
                        'success_message' => $oldForm->success_message,
                        'task_defaults' => $oldForm->task_defaults,
                        'created_by' => $request->user()->id,
                        'logo_path' => $oldForm->logo_path,
                        'logo_position' => $oldForm->logo_position,
                        'banner_path' => $oldForm->banner_path,
                    ]);

                    foreach ($oldForm->fields()->orderBy('position')->get() as $oldField) {
                        $newField = $newForm->fields()->create([
                            'type' => $oldField->type,
                            'label' => $oldField->label,
                            'help_text' => $oldField->help_text,
                            'is_required' => $oldField->is_required,
                            'position' => $oldField->position,
                            'config' => $oldField->config,
                            'default_value' => $oldField->default_value,
                            'is_visible' => $oldField->is_visible,
                            'conditions' => $oldField->conditions,
                            'maps_to' => $oldField->maps_to,
                            'custom_field_id' => isset($oldField->custom_field_id) && isset($customFieldMap[$oldField->custom_field_id])
                                ? $customFieldMap[$oldField->custom_field_id]
                                : $oldField->custom_field_id,
                        ]);
                    }
                }
            }

            // Copy automation rules if requested (remap section/custom field/option ids)
            if ($copyAutomationRules) {
                $formMap = [];
                if ($copyForms) {
                    $oldForms = $project->forms()->get();
                    $newForms = $newProject->forms()->get();
                    foreach ($oldForms as $index => $oldForm) {
                        if (isset($newForms[$index])) {
                            $formMap[$oldForm->id] = $newForms[$index]->id;
                        }
                    }
                }

                foreach ($project->automationRules()->get() as $oldRule) {
                    $newProject->automationRules()->create([
                        'name' => $oldRule->name,
                        'is_active' => $oldRule->is_active,
                        'trigger_type' => $oldRule->trigger_type,
                        'trigger_config' => $this->remapRuleTriggerConfig($oldRule->trigger_config, $customFieldMap, $formMap),
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

    private function remapRuleTriggerConfig(?array $triggerConfig, array $customFieldMap, array $formMap = []): ?array
    {
        if (empty($triggerConfig)) {
            return $triggerConfig;
        }

        if (isset($triggerConfig['custom_field_id'])) {
            $triggerConfig['custom_field_id'] = $customFieldMap[(int) $triggerConfig['custom_field_id']]
                ?? $triggerConfig['custom_field_id'];
        }

        if (isset($triggerConfig['form_id']) && !empty($formMap)) {
            $triggerConfig['form_id'] = $formMap[(int) $triggerConfig['form_id']]
                ?? $triggerConfig['form_id'];
        }

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
