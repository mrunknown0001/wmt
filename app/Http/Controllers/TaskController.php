<?php

namespace App\Http\Controllers;

use App\Events\TaskUpdated;
use App\Http\Requests\PatchTaskRequest;
use App\Http\Requests\StoreTaskRequest;
use App\Http\Requests\UpdateTaskRequest;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskAttachment;
use App\Models\CustomField;
use App\Models\TaskCustomFieldValue;
use App\Models\User;
use App\Notifications\TaskAssignedNotification;
use App\Services\ActivityLogger;
use App\Services\AutomationRuleEngine;
use App\Services\CustomFieldDefaults;
use App\Services\RecurringTaskService;
use App\Services\TaskActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class TaskController extends Controller
{
    public function create(Request $request, Project $project): Response
    {
        if (!auth()->user()->can('manage-tasks') && $project->owner_id !== auth()->id() && !$project->isProjectAdmin(auth()->user())) {
            abort(403);
        }

        $parentTask = null;
        if ($request->query('parent_id')) {
            $parentTask = Task::where('id', $request->query('parent_id'))
                ->where('project_id', $project->id)
                ->whereNull('parent_id')
                ->first(['id', 'title']);
        }

        $sections = $project->sections()->orderBy('position')->get(['id', 'name']);

        return Inertia::render('Tasks/Create', [
            'project' => $project,
            'parentTask' => $parentTask,
            'sections' => $sections,
            'defaultSectionId' => $request->query('section_id'),
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'statuses' => ['backlog', 'to_do', 'in_progress', 'in_review', 'done', 'cancelled'],
            'priorities' => ['low', 'medium', 'high', 'urgent'],
            'recurrenceFrequencies' => Task::RECURRENCE_FREQUENCIES,
            'customFields' => $project->customFields()->with('options')->get(),
        ]);
    }

    public function store(StoreTaskRequest $request, Project $project): RedirectResponse
    {
        $validated = $request->validated();

        // Validate parent_id constraints
        if (!empty($validated['parent_id'])) {
            $parent = Task::where('id', $validated['parent_id'])
                ->where('project_id', $project->id)
                ->whereNull('parent_id')
                ->firstOrFail();

            $maxPosition = Task::where('parent_id', $parent->id)
                ->where('status', $request->status)
                ->max('position') ?? -1;
        } else {
            $maxPosition = $project->tasks()
                ->whereNull('parent_id')
                ->where('status', $request->status)
                ->max('position') ?? -1;
        }

        $collaboratorIds = $validated['collaborator_ids'] ?? [];
        $customFieldValues = $validated['custom_field_values'] ?? [];
        unset($validated['collaborator_ids'], $validated['custom_field_values']);

        $task = $project->tasks()->create([
            ...$validated,
            'created_by' => $request->user()->id,
            'assigned_to' => $request->user()->id,
            'position' => $maxPosition + 1,
        ]);

        if (!empty($collaboratorIds)) {
            $task->collaborators()->sync($collaboratorIds);
        }

        // Save custom field values
        foreach ($customFieldValues as $fieldId => $value) {
            $customField = CustomField::where('id', $fieldId)->where('project_id', $project->id)->first();
            if (!$customField || $customField->type === 'formula' || $value === null || $value === '') continue;
            $cfv = new TaskCustomFieldValue(['task_id' => $task->id, 'custom_field_id' => $fieldId]);
            $cfv->setTypedValue($customField->type, $value);
            $cfv->save();
        }

        // Fields the form submitted (even cleared ones) keep the user's choice;
        // everything else falls back to the field's default value
        CustomFieldDefaults::apply($task, array_keys($customFieldValues));

        TaskActivityLogger::logCreated($task, $request->user());
        ActivityLogger::logCreated($task, $request->user());

        if ($task->assigned_to && $task->assigned_to !== $request->user()->id) {
            $task->load('project');
            $task->assignee->notify(new TaskAssignedNotification($task, $request->user()));
        }

        AutomationRuleEngine::evaluate($task, 'task_created');

        $task->load('assignee', 'collaborators', 'customFieldValues.selectedOption');
        broadcast(new TaskUpdated($project->id, $task->toArray(), 'created', $request->user()->id))->toOthers();

        return redirect("/projects/{$project->id}")
            ->with('success', 'Task created successfully.');
    }

    /**
     * Quick inline store — returns JSON (used for adding subtasks inline).
     */
    public function quickStore(Request $request, Project $project): JsonResponse
    {
        if (!$request->user()->can('manage-tasks') && $project->owner_id !== $request->user()->id && !$project->isProjectAdmin($request->user())) {
            abort(403);
        }

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'parent_id' => ['required', 'exists:tasks,id'],
            'status' => ['sometimes', 'string'],
            'priority' => ['sometimes', 'string'],
            'assigned_to' => ['nullable', 'exists:users,id'],
            'due_date' => ['nullable', 'date'],
        ]);

        $parent = Task::where('id', $validated['parent_id'])
            ->where('project_id', $project->id)
            ->whereNull('parent_id')
            ->firstOrFail();

        $status = $validated['status'] ?? 'to_do';
        $maxPosition = Task::where('parent_id', $parent->id)
            ->where('status', $status)
            ->max('position') ?? -1;

        $task = $project->tasks()->create([
            'title' => $validated['title'],
            'parent_id' => $parent->id,
            'status' => $status,
            'priority' => $validated['priority'] ?? 'medium',
            'assigned_to' => $request->user()->id,
            'due_date' => $validated['due_date'] ?? null,
            'created_by' => $request->user()->id,
            'position' => $maxPosition + 1,
        ]);

        CustomFieldDefaults::apply($task);

        TaskActivityLogger::logCreated($task, $request->user());
        ActivityLogger::logCreated($task, $request->user());
        AutomationRuleEngine::evaluate($task, 'task_created');

        $task->load('assignee');
        $task->loadCount(['subtasks', 'subtasks as completed_subtasks_count' => fn ($q) => $q->where('status', 'done')]);

        broadcast(new TaskUpdated($project->id, $task->toArray(), 'created', $request->user()->id))->toOthers();

        return response()->json(['task' => $task], 201);
    }

    public function duplicate(Request $request, Project $project, Task $task): JsonResponse
    {
        if (!$request->user()->can('manage-tasks') && $project->owner_id !== $request->user()->id && !$project->isProjectAdmin($request->user())) {
            abort(403);
        }

        $maxPosition = $project->tasks()
            ->where('status', $task->status)
            ->when($task->parent_id, fn ($q) => $q->where('parent_id', $task->parent_id), fn ($q) => $q->whereNull('parent_id'))
            ->max('position') ?? -1;

        $newTask = $project->tasks()->create([
            'title' => "Copy of {$task->title}",
            'description' => $task->description,
            'status' => $task->status,
            'priority' => $task->priority,
            'assigned_to' => $task->assigned_to,
            'created_by' => $request->user()->id,
            'start_date' => $task->start_date,
            'due_date' => $task->due_date,
            'section_id' => $task->section_id,
            'parent_id' => $task->parent_id,
            'position' => $maxPosition + 1,
        ]);

        if ($task->collaborators()->count() > 0) {
            $newTask->collaborators()->sync($task->collaborators->pluck('id'));
        }

        foreach ($task->customFieldValues as $cfv) {
            TaskCustomFieldValue::create([
                'task_id' => $newTask->id,
                'custom_field_id' => $cfv->custom_field_id,
                'value_text' => $cfv->value_text,
                'value_number' => $cfv->value_number,
                'value_date' => $cfv->value_date,
                'selected_option_id' => $cfv->selected_option_id,
            ]);
        }

        TaskActivityLogger::logCreated($newTask, $request->user());
        ActivityLogger::logCreated($newTask, $request->user());

        $newTask->load('assignee', 'collaborators', 'customFieldValues.selectedOption');
        $newTask->loadCount(['subtasks', 'subtasks as completed_subtasks_count' => fn ($q) => $q->where('status', 'done')]);

        broadcast(new TaskUpdated($project->id, $newTask->toArray(), 'created', $request->user()->id))->toOthers();

        return response()->json(['success' => true, 'task' => $newTask]);
    }

    public function edit(Project $project, Task $task): Response
    {
        $this->authorize('update', $task);

        $task->load('assignee', 'creator', 'collaborators', 'parent:id,title', 'attachments');
        $task->loadCount(['subtasks', 'subtasks as completed_subtasks_count' => fn ($q) => $q->where('status', 'done')]);

        $comments = $task->comments()->with('user', 'attachments')->latest()->take(10)->get()->map(fn ($c) => [
            'id' => $c->id,
            'type' => 'comment',
            'body' => $c->body,
            'user' => $c->user ? ['id' => $c->user->id, 'name' => $c->user->name] : null,
            'attachments' => $c->attachments->map(fn ($a) => [
                'id' => $a->id,
                'file_name' => $a->file_name,
                'file_type' => $a->file_type,
                'file_size' => $a->file_size,
                'url' => asset('storage/' . $a->file_path),
                'download_url' => url("/projects/{$project->id}/tasks/{$task->id}/comments/{$c->id}/attachments/{$a->id}/download"),
                'is_image' => str_starts_with($a->file_type, 'image/'),
                'is_video' => str_starts_with($a->file_type, 'video/'),
            ]),
            'created_at' => $c->created_at->toIso8601String(),
            'updated_at' => $c->updated_at?->toIso8601String(),
        ]);

        $activities = $task->activities()->with('user')->latest()->take(10)->get()->map(fn ($a) => [
            'id' => $a->id,
            'type' => 'activity',
            'field' => $a->field,
            'old_value' => $a->old_value,
            'new_value' => $a->new_value,
            'description' => $a->description,
            'user' => $a->user ? ['id' => $a->user->id, 'name' => $a->user->name] : null,
            'created_at' => $a->created_at->toIso8601String(),
        ]);

        $timeline = $comments->concat($activities)->sortByDesc('created_at')->values();

        // Build recurrence chain
        $recurrenceChain = [];
        if ($task->is_recurring || $task->recurring_source_id) {
            $current = $task;
            $ancestors = [];
            while ($current->recurring_source_id) {
                $current = Task::select('id', 'title', 'status', 'start_date', 'due_date', 'recurring_source_id', 'project_id')
                    ->find($current->recurring_source_id);
                if (!$current) break;
                array_unshift($ancestors, $current);
                if (count($ancestors) > 10) break;
            }

            $descendants = [];
            $next = Task::select('id', 'title', 'status', 'start_date', 'due_date', 'recurring_source_id', 'project_id')
                ->where('recurring_source_id', $task->id)->first();
            while ($next) {
                $descendants[] = $next;
                $next = Task::select('id', 'title', 'status', 'start_date', 'due_date', 'recurring_source_id', 'project_id')
                    ->where('recurring_source_id', $next->id)->first();
                if (count($descendants) > 10) break;
            }

            $recurrenceChain = collect($ancestors)
                ->push($task)
                ->concat($descendants)
                ->map(fn ($t) => [
                    'id' => $t->id,
                    'title' => $t->title,
                    'status' => $t->status,
                    'start_date' => $t->start_date?->toDateString(),
                    'due_date' => $t->due_date?->toDateString(),
                    'is_current' => $t->id === $task->id,
                    'project_id' => $t->project_id,
                ])
                ->values()
                ->toArray();
        }

        $canManageTaskDetails = auth()->user()->can('manage-tasks')
            || $project->owner_id === auth()->id()
            || $project->isProjectAdmin(auth()->user());

        $taskAttachments = $task->attachments->map(fn ($a) => [
            'id' => $a->id,
            'file_name' => $a->file_name,
            'file_type' => $a->file_type,
            'file_size' => $a->file_size,
            'url' => asset('storage/' . $a->file_path),
            'download_url' => url("/projects/{$project->id}/tasks/{$task->id}/attachments/{$a->id}/download"),
            'is_image' => $a->isImage(),
            'is_video' => $a->isVideo(),
            'is_spreadsheet' => $a->isSpreadsheet(),
        ]);

        $customFields = $project->customFields()->with('options')->get();
        $customFieldValues = $task->customFieldValues()->get()->keyBy('custom_field_id');

        // Load subtasks for parent tasks
        $subtasks = $task->parent_id ? [] : $task->subtasks()
            ->with('assignee')
            ->orderBy('position')
            ->get(['id', 'title', 'status', 'priority', 'assigned_to', 'due_date', 'parent_id', 'project_id']);

        return Inertia::render('Tasks/Edit', [
            'project' => $project,
            'task' => $task,
            'taskAttachments' => $taskAttachments,
            'timeline' => $timeline,
            'totalComments' => $task->comments()->count(),
            'totalActivities' => $task->activities()->count(),
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'statuses' => ['backlog', 'to_do', 'in_progress', 'in_review', 'done', 'cancelled'],
            'priorities' => ['low', 'medium', 'high', 'urgent'],
            'recurrenceFrequencies' => Task::RECURRENCE_FREQUENCIES,
            'recurrenceChain' => $recurrenceChain,
            'canManageTaskDetails' => $canManageTaskDetails,
            'isStandalone' => false,
            'customFields' => $customFields,
            'customFieldValues' => $customFieldValues,
            'subtasks' => $subtasks,
        ]);
    }

    public function update(UpdateTaskRequest $request, Project $project, Task $task): RedirectResponse
    {
        $oldValues = $task->only(['title', 'description', 'status', 'priority', 'assigned_to', 'start_date', 'due_date']);
        $oldValues['start_date'] = $task->start_date?->toDateString();
        $oldValues['due_date'] = $task->due_date?->toDateString();
        $oldAssignee = $task->assigned_to;

        $validated = $request->validated();
        $collaboratorIds = $validated['collaborator_ids'] ?? null;
        $customFieldValues = $validated['custom_field_values'] ?? null;
        unset($validated['collaborator_ids'], $validated['custom_field_values']);

        $task->update($validated);

        if ($collaboratorIds !== null) {
            $task->collaborators()->sync($collaboratorIds);
        }

        // Update custom field values
        if ($customFieldValues !== null) {
            foreach ($customFieldValues as $fieldId => $value) {
                $customField = CustomField::where('id', $fieldId)->where('project_id', $project->id)->first();
                if (!$customField || $customField->type === 'formula') continue;
                $cfv = TaskCustomFieldValue::updateOrCreate(
                    ['task_id' => $task->id, 'custom_field_id' => $fieldId],
                );
                $cfv->setTypedValue($customField->type, $value);
                $cfv->save();
            }
        }

        TaskActivityLogger::logChanges($task, $oldValues, $request->user());
        ActivityLogger::logChanges($task, $oldValues, $request->user());

        if ($task->assigned_to && $task->assigned_to !== $oldAssignee && $task->assigned_to !== $request->user()->id) {
            $task->load('project');
            $task->assignee->notify(new TaskAssignedNotification($task, $request->user()));
        }

        // Reset escalation when task is completed/cancelled
        if (in_array($task->status, ['done', 'cancelled']) && $task->escalation_level > 0) {
            $task->update(['escalation_level' => 0]);
        }

        // Automation rules
        if (($oldValues['status'] ?? null) !== $task->status) {
            AutomationRuleEngine::evaluate($task, 'task_status_changed', $oldValues);
            if ($task->status === 'done') {
                AutomationRuleEngine::evaluate($task, 'task_completed', $oldValues);
            }
        }
        if (($oldValues['priority'] ?? null) !== $task->priority) {
            AutomationRuleEngine::evaluate($task, 'task_priority_changed', $oldValues);
        }
        if (($oldValues['assigned_to'] ?? null) != $task->assigned_to) {
            AutomationRuleEngine::evaluate($task, 'task_assigned', $oldValues);
        }

        $newTask = RecurringTaskService::generateNextIfCompleted($task, $oldValues['status'] ?? null, $request->user());

        $task->load('assignee', 'collaborators', 'customFieldValues.selectedOption');
        broadcast(new TaskUpdated($project->id, $task->toArray(), 'updated', $request->user()->id))->toOthers();

        return redirect("/projects/{$project->id}")
            ->with('success', $newTask ? 'Task completed. Next recurring occurrence created.' : 'Task updated successfully.');
    }

    public function destroy(Project $project, Task $task): RedirectResponse
    {
        $this->authorize('delete', $task);

        ActivityLogger::logDeleted($task, auth()->user());

        $taskId = $task->id;
        $task->delete();

        broadcast(new TaskUpdated($project->id, ['id' => $taskId], 'deleted', auth()->id()))->toOthers();

        return redirect("/projects/{$project->id}")
            ->with('success', 'Task deleted successfully.');
    }

    public function show(Project $project, Task $task): JsonResponse
    {
        $this->authorize('update', $task);

        $task->load('assignee', 'creator', 'collaborators', 'parent:id,title', 'section:id,name', 'attachments');
        $task->loadCount(['subtasks', 'subtasks as completed_subtasks_count' => fn ($q) => $q->where('status', 'done')]);

        $comments = $task->comments()->with('user', 'attachments')->latest()->take(10)->get()->map(fn ($c) => [
            'id' => $c->id,
            'type' => 'comment',
            'body' => $c->body,
            'user' => $c->user ? ['id' => $c->user->id, 'name' => $c->user->name] : null,
            'attachments' => $c->attachments->map(fn ($a) => [
                'id' => $a->id,
                'file_name' => $a->file_name,
                'file_type' => $a->file_type,
                'file_size' => $a->file_size,
                'url' => asset('storage/' . $a->file_path),
                'download_url' => url("/projects/{$project->id}/tasks/{$task->id}/comments/{$c->id}/attachments/{$a->id}/download"),
                'is_image' => str_starts_with($a->file_type, 'image/'),
                'is_video' => str_starts_with($a->file_type, 'video/'),
            ]),
            'created_at' => $c->created_at->toIso8601String(),
            'updated_at' => $c->updated_at?->toIso8601String(),
        ]);

        $activities = $task->activities()->with('user')->latest()->take(10)->get()->map(fn ($a) => [
            'id' => $a->id,
            'type' => 'activity',
            'field' => $a->field,
            'old_value' => $a->old_value,
            'new_value' => $a->new_value,
            'description' => $a->description,
            'user' => $a->user ? ['id' => $a->user->id, 'name' => $a->user->name] : null,
            'created_at' => $a->created_at->toIso8601String(),
        ]);

        $timeline = $comments->concat($activities)->sortByDesc('created_at')->values();

        $taskAttachments = $task->attachments->map(fn ($a) => [
            'id' => $a->id,
            'file_name' => $a->file_name,
            'file_type' => $a->file_type,
            'file_size' => $a->file_size,
            'url' => asset('storage/' . $a->file_path),
            'download_url' => url("/projects/{$project->id}/tasks/{$task->id}/attachments/{$a->id}/download"),
            'is_image' => $a->isImage(),
            'is_video' => $a->isVideo(),
            'is_spreadsheet' => $a->isSpreadsheet(),
        ]);

        $customFields = $project->customFields()->with('options')->get();
        $customFieldValues = $task->customFieldValues()->get()->keyBy('custom_field_id');

        $subtasks = $task->subtasks()->with('assignee')->orderBy('position')->get(['id', 'title', 'status', 'priority', 'assigned_to', 'due_date']);

        return response()->json([
            'task' => $task,
            'taskAttachments' => $taskAttachments,
            'timeline' => $timeline,
            'totalComments' => $task->comments()->count(),
            'totalActivities' => $task->activities()->count(),
            'customFields' => $customFields,
            'customFieldValues' => $customFieldValues,
            'subtasks' => $subtasks,
        ]);
    }

    public function patchField(PatchTaskRequest $request, Project $project, Task $task): JsonResponse
    {
        $oldValues = $task->only(['title', 'description', 'status', 'priority', 'assigned_to', 'start_date', 'due_date']);
        $oldValues['start_date'] = $task->start_date?->toDateString();
        $oldValues['due_date'] = $task->due_date?->toDateString();
        $oldAssignee = $task->assigned_to;

        $validated = $request->validated();
        $collaboratorIds = $validated['collaborator_ids'] ?? null;
        unset($validated['collaborator_ids']);

        // This is a JSON endpoint, but bootstrap/app.php only renders exceptions as
        // JSON for `api/*` paths — so a model-level rule (e.g. the project's
        // comment-attachment rule) would otherwise come back as a 302 the caller
        // can't read. Translate it into the 422 the client expects.
        try {
            $task->update($validated);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'errors' => $e->errors(),
            ], 422);
        }

        if ($collaboratorIds !== null) {
            $task->collaborators()->sync($collaboratorIds);
        }

        $task->load('assignee');

        TaskActivityLogger::logChanges($task, $oldValues, $request->user());
        ActivityLogger::logChanges($task, $oldValues, $request->user());

        if (
            $request->has('assigned_to')
            && $task->assigned_to
            && $task->assigned_to !== $oldAssignee
            && $task->assigned_to !== $request->user()->id
        ) {
            $task->load('project');
            $task->assignee->notify(new TaskAssignedNotification($task, $request->user()));
        }

        // Reset escalation when task is completed/cancelled
        if ($request->has('status') && in_array($task->status, ['done', 'cancelled']) && $task->escalation_level > 0) {
            $task->update(['escalation_level' => 0]);
        }

        // Automation rules
        if ($request->has('status') && ($oldValues['status'] ?? null) !== $task->status) {
            AutomationRuleEngine::evaluate($task, 'task_status_changed', $oldValues);
            if ($task->status === 'done') {
                AutomationRuleEngine::evaluate($task, 'task_completed', $oldValues);
            }
        }
        if ($request->has('priority') && ($oldValues['priority'] ?? null) !== $task->priority) {
            AutomationRuleEngine::evaluate($task, 'task_priority_changed', $oldValues);
        }
        if ($request->has('assigned_to') && ($oldValues['assigned_to'] ?? null) != $task->assigned_to) {
            AutomationRuleEngine::evaluate($task, 'task_assigned', $oldValues);
        }

        $response = [
            'success' => true,
            'task' => $task,
        ];

        if ($request->has('status')) {
            $newTask = RecurringTaskService::generateNextIfCompleted($task, $oldValues['status'] ?? null, $request->user());
            if ($newTask) {
                $newTask->load('assignee', 'collaborators');
                $response['recurring_task_created'] = true;
                $response['new_task'] = $newTask;
            }
        }

        $task->loadMissing('assignee', 'collaborators', 'customFieldValues.selectedOption');
        broadcast(new TaskUpdated($project->id, $task->toArray(), 'updated', $request->user()->id))->toOthers();

        return response()->json($response);
    }

    public function timeline(Request $request, Project $project, Task $task): JsonResponse
    {
        $type = $request->query('type'); // 'comment' or 'activity'
        $offset = (int) $request->query('offset', 0);
        $limit = 10;

        if ($type === 'comment') {
            $items = $task->comments()->with('user', 'attachments')->latest()->skip($offset)->take($limit)->get()->map(fn ($c) => [
                'id' => $c->id,
                'type' => 'comment',
                'body' => $c->body,
                'user' => $c->user ? ['id' => $c->user->id, 'name' => $c->user->name] : null,
                'attachments' => $c->attachments->map(fn ($a) => [
                    'id' => $a->id,
                    'file_name' => $a->file_name,
                    'file_type' => $a->file_type,
                    'file_size' => $a->file_size,
                    'url' => asset('storage/' . $a->file_path),
                    'download_url' => url("/projects/{$project->id}/tasks/{$task->id}/comments/{$c->id}/attachments/{$a->id}/download"),
                    'is_image' => str_starts_with($a->file_type, 'image/'),
                    'is_video' => str_starts_with($a->file_type, 'video/'),
                ]),
                'created_at' => $c->created_at->toIso8601String(),
                'updated_at' => $c->updated_at?->toIso8601String(),
            'updated_at' => $c->updated_at?->toIso8601String(),
            ]);
        } else {
            $items = $task->activities()->with('user')->latest()->skip($offset)->take($limit)->get()->map(fn ($a) => [
                'id' => $a->id,
                'type' => 'activity',
                'field' => $a->field,
                'old_value' => $a->old_value,
                'new_value' => $a->new_value,
                'description' => $a->description,
                'user' => $a->user ? ['id' => $a->user->id, 'name' => $a->user->name] : null,
                'created_at' => $a->created_at->toIso8601String(),
            ]);
        }

        return response()->json(['items' => $items->values()]);
    }

    public function bulkAction(Request $request, Project $project): JsonResponse
    {
        if (!auth()->user()->can('manage-tasks') && $project->owner_id !== auth()->id() && !$project->isProjectAdmin(auth()->user())) {
            abort(403);
        }

        $validated = $request->validate([
            'task_ids' => 'required|array|min:1',
            'task_ids.*' => 'required|integer',
            'action' => 'required|string|in:update_status,update_priority,assign,update_due_date,update_start_date,update_custom_field,delete',
            'value' => 'nullable',
            'field_id' => 'required_if:action,update_custom_field|integer',
        ]);

        $tasks = Task::whereIn('id', $validated['task_ids'])
            ->where('project_id', $project->id)
            ->get();

        if ($tasks->isEmpty()) {
            return response()->json(['success' => false, 'message' => 'No matching tasks found.'], 404);
        }

        $user = $request->user();
        $newTasks = [];

        switch ($validated['action']) {
            case 'update_status':
                $status = $validated['value'];
                if (!in_array($status, ['backlog', 'to_do', 'in_progress', 'in_review', 'done', 'cancelled'])) {
                    return response()->json(['success' => false, 'message' => 'Invalid status.'], 422);
                }
                // All-or-nothing: a project rule can reject a close (e.g. requires a
                // comment attachment). Without a transaction the tasks processed before
                // the rejection would be saved, leaving the batch half-applied.
                try {
                    DB::transaction(function () use ($tasks, $status, $user, &$newTasks) {
                        foreach ($tasks as $task) {
                            $oldStatus = $task->status;
                            if ($oldStatus === $status) continue;
                            $oldValues = $task->only(['title', 'description', 'status', 'priority', 'assigned_to', 'start_date', 'due_date']);
                            $oldValues['start_date'] = $task->start_date?->toDateString();
                            $oldValues['due_date'] = $task->due_date?->toDateString();
                            $task->update(['status' => $status]);
                            TaskActivityLogger::logChanges($task, $oldValues, $user);
                            ActivityLogger::logChanges($task, $oldValues, $user);
                            if (in_array($status, ['done', 'cancelled']) && $task->escalation_level > 0) {
                                $task->update(['escalation_level' => 0]);
                            }
                            AutomationRuleEngine::evaluate($task, 'task_status_changed', $oldValues);
                            if ($status === 'done') {
                                AutomationRuleEngine::evaluate($task, 'task_completed', $oldValues);
                            }
                            $newTask = RecurringTaskService::generateNextIfCompleted($task, $oldStatus, $user);
                            if ($newTask) {
                                $newTask->load('assignee', 'collaborators');
                                $newTasks[] = $newTask;
                            }
                        }
                    });
                } catch (\Illuminate\Validation\ValidationException $e) {
                    return response()->json([
                        'success' => false,
                        'message' => ($e->validator->errors()->first() ?: 'Some tasks could not be updated.')
                            . ' No changes were made.',
                    ], 422);
                }
                break;

            case 'update_priority':
                $priority = $validated['value'];
                if (!in_array($priority, ['low', 'medium', 'high', 'urgent'])) {
                    return response()->json(['success' => false, 'message' => 'Invalid priority.'], 422);
                }
                foreach ($tasks as $task) {
                    if ($task->priority === $priority) continue;
                    $oldValues = $task->only(['title', 'description', 'status', 'priority', 'assigned_to', 'start_date', 'due_date']);
                    $oldValues['start_date'] = $task->start_date?->toDateString();
                    $oldValues['due_date'] = $task->due_date?->toDateString();
                    $task->update(['priority' => $priority]);
                    TaskActivityLogger::logChanges($task, $oldValues, $user);
                    ActivityLogger::logChanges($task, $oldValues, $user);
                }
                break;

            case 'assign':
                $assigneeId = $validated['value'] ?: null;
                if ($assigneeId) {
                    $assignee = User::where('id', $assigneeId)->where('is_active', true)->first();
                    if (!$assignee) {
                        return response()->json(['success' => false, 'message' => 'Invalid assignee.'], 422);
                    }
                }
                foreach ($tasks as $task) {
                    $oldAssignee = $task->assigned_to;
                    if ($oldAssignee == $assigneeId) continue;
                    $oldValues = $task->only(['title', 'description', 'status', 'priority', 'assigned_to', 'start_date', 'due_date']);
                    $oldValues['start_date'] = $task->start_date?->toDateString();
                    $oldValues['due_date'] = $task->due_date?->toDateString();
                    $task->update(['assigned_to' => $assigneeId]);
                    $task->load('assignee');
                    TaskActivityLogger::logChanges($task, $oldValues, $user);
                    ActivityLogger::logChanges($task, $oldValues, $user);
                    if ($assigneeId && $assigneeId !== $user->id) {
                        $task->load('project');
                        $task->assignee->notify(new TaskAssignedNotification($task, $user));
                    }
                }
                break;

            case 'update_due_date':
                $dueDate = $validated['value'] ?: null;
                foreach ($tasks as $task) {
                    $oldValues = $task->only(['title', 'description', 'status', 'priority', 'assigned_to', 'start_date', 'due_date']);
                    $oldValues['start_date'] = $task->start_date?->toDateString();
                    $oldValues['due_date'] = $task->due_date?->toDateString();
                    $task->update(['due_date' => $dueDate]);
                    TaskActivityLogger::logChanges($task, $oldValues, $user);
                    ActivityLogger::logChanges($task, $oldValues, $user);
                }
                break;

            case 'update_start_date':
                $startDate = $validated['value'] ?: null;
                foreach ($tasks as $task) {
                    $oldValues = $task->only(['title', 'description', 'status', 'priority', 'assigned_to', 'start_date', 'due_date']);
                    $oldValues['start_date'] = $task->start_date?->toDateString();
                    $oldValues['due_date'] = $task->due_date?->toDateString();
                    $task->update(['start_date' => $startDate]);
                    TaskActivityLogger::logChanges($task, $oldValues, $user);
                    ActivityLogger::logChanges($task, $oldValues, $user);
                }
                break;

            case 'update_custom_field':
                $customField = CustomField::where('id', $validated['field_id'])
                    ->where('project_id', $project->id)
                    ->first();
                if (!$customField || $customField->type === 'formula') {
                    return response()->json(['success' => false, 'message' => 'Invalid custom field.'], 422);
                }
                foreach ($tasks as $task) {
                    $cfv = TaskCustomFieldValue::updateOrCreate(
                        ['task_id' => $task->id, 'custom_field_id' => $customField->id],
                    );
                    $cfv->setTypedValue($customField->type, $validated['value']);
                    $cfv->save();
                    $task->load('customFieldValues.customField');
                    AutomationRuleEngine::evaluate($task, 'custom_field_changed', [], [$customField->id]);
                }
                break;

            case 'delete':
                foreach ($tasks as $task) {
                    ActivityLogger::logDeleted($task, $user);
                    $task->delete();
                }
                break;
        }

        broadcast(new TaskUpdated($project->id, ['bulk' => true, 'action' => $validated['action']], 'bulk', $request->user()->id))->toOthers();

        return response()->json([
            'success' => true,
            'new_tasks' => $newTasks,
            'affected_count' => $tasks->count(),
        ]);
    }

    public function reorder(Request $request, Project $project): JsonResponse
    {
        // Authorize: must be able to manage tasks, be the project owner, or be a project admin
        if (!auth()->user()->can('manage-tasks') && $project->owner_id !== auth()->id() && !$project->isProjectAdmin(auth()->user())) {
            abort(403);
        }

        $validated = $request->validate([
            'tasks' => 'required|array',
            'tasks.*.id' => 'required|integer|exists:tasks,id',
            'tasks.*.status' => 'required|string|in:backlog,to_do,in_progress,in_review,done,cancelled',
            'tasks.*.position' => 'required|integer|min:0',
            'tasks.*.section_id' => 'sometimes|nullable|integer',
        ]);

        // Pre-fetch recurring tasks that are transitioning to 'done'
        $doneTaskIds = collect($validated['tasks'])->where('status', 'done')->pluck('id')->toArray();
        $recurringDoneCandidates = [];
        if (!empty($doneTaskIds)) {
            $recurringDoneCandidates = Task::whereIn('id', $doneTaskIds)
                ->where('project_id', $project->id)
                ->where('is_recurring', true)
                ->where('status', '!=', 'done')
                ->get()
                ->keyBy('id');
        }

        // Load the models rather than mass-updating. A query-builder update skips
        // Eloquent events entirely, which meant board drags bypassed the project's
        // "attachment required before completing" rule *and* never stamped
        // completed_at — so a task finished on the board looked done but counted
        // as incomplete in every metric.
        $taskIds = collect($validated['tasks'])->pluck('id')->toArray();
        $models = Task::where('project_id', $project->id)
            ->whereIn('id', $taskIds)
            ->get()
            ->keyBy('id');

        // Snapshot before anything is mutated, for the automation pass below.
        $oldStatuses = $models->map(fn (Task $t) => $t->status);

        // Check the whole batch before writing any of it. A single drag carries a
        // column's worth of tasks, so failing midway would leave the rest applied
        // while the UI rolled everything back.
        $blocked = [];
        foreach ($validated['tasks'] as $item) {
            $task = $models->get($item['id']);
            if (!$task) {
                continue;
            }

            try {
                $task->assertClosableUnderProjectRules($item['status'], $task->status);
            } catch (ValidationException $e) {
                $blocked[] = $task->title;
            }
        }

        if (!empty($blocked)) {
            return response()->json([
                'message' => count($blocked) === 1
                    ? "\"{$blocked[0]}\" needs at least one attachment before it can be completed."
                    : count($blocked) . ' tasks need an attachment before they can be completed.',
                'blocked' => $blocked,
            ], 422);
        }

        foreach ($validated['tasks'] as $item) {
            $task = $models->get($item['id']);
            if (!$task) {
                continue;
            }

            $task->status = $item['status'];
            $task->position = $item['position'];
            if (array_key_exists('section_id', $item)) {
                $task->section_id = $item['section_id'];
            }
            $task->save();
        }

        // Fire automation rules for tasks whose status changed
        foreach ($validated['tasks'] as $item) {
            $oldStatus = $oldStatuses[$item['id']] ?? null;
            if ($oldStatus !== null && $oldStatus !== $item['status']) {
                $task = Task::find($item['id']);
                if ($task) {
                    $oldValues = ['status' => $oldStatus];
                    AutomationRuleEngine::evaluate($task, 'task_status_changed', $oldValues);
                    if ($item['status'] === 'done') {
                        AutomationRuleEngine::evaluate($task, 'task_completed', $oldValues);
                    }
                }
            }
        }

        // Generate next occurrences for recurring tasks that just moved to done
        $newTasks = [];
        foreach ($recurringDoneCandidates as $candidate) {
            $oldStatus = $candidate->status;
            $candidate->status = 'done';
            $newTask = RecurringTaskService::generateNextIfCompleted($candidate, $oldStatus, $request->user());
            if ($newTask) {
                $newTask->load('assignee', 'collaborators');
                $newTasks[] = $newTask;
            }
        }

        broadcast(new TaskUpdated($project->id, ['reordered' => true], 'reordered', $request->user()->id))->toOthers();

        return response()->json([
            'success' => true,
            'new_tasks' => $newTasks,
        ]);
    }

    public function downloadAttachment(Project $project, Task $task, TaskAttachment $attachment): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        if ($attachment->task_id !== $task->id) {
            abort(404);
        }

        return \Illuminate\Support\Facades\Storage::disk('public')->download($attachment->file_path, $attachment->file_name);
    }
}
