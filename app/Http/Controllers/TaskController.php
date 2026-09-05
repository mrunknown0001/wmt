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
use App\Services\TimeTracker;
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
        if (!$project->userCanManageTasks(auth()->user())) {
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

        $task->load('assignee', 'collaborators', 'customFieldValues.selectedOption', 'customFieldValues.customField');
        broadcast(new TaskUpdated($project->id, $task->toArray(), 'created', $request->user()->id))->toOthers();

        return redirect("/projects/{$project->id}")
            ->with('success', 'Task created successfully.');
    }

    /**
     * Quick inline store — returns JSON (used for adding subtasks inline).
     */
    public function quickStore(Request $request, Project $project): JsonResponse
    {
        if (!$project->userCanManageTasks($request->user())) {
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
        if (!$project->userCanManageTasks($request->user())) {
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
            'due_time' => $task->due_time,
            'section_id' => $task->section_id,
            'parent_id' => $task->parent_id,
            'position' => $maxPosition + 1,
            // Recurrence is part of the task's configuration, so a copy of a
            // recurring task recurs too. recurring_source_id is deliberately not
            // copied: the duplicate starts its own series rather than joining the
            // original's chain.
            'is_recurring' => $task->is_recurring,
            'recurrence_frequency' => $task->recurrence_frequency,
            'recurrence_interval' => $task->recurrence_interval,
            'recurrence_config' => $task->recurrence_config,
        ]);

        if ($task->collaborators()->count() > 0) {
            $newTask->collaborators()->sync($task->collaborators->pluck('id'));
        }

        // Every value column is copied, not a hand-picked subset. The previous
        // list omitted value_json and named value_option_id as
        // "selected_option_id" — a key that isn't a column and isn't fillable, so
        // it was silently dropped. Between them, single-select, multi-select and
        // People values were all lost on duplicate.
        $task->loadMissing('customFieldValues');

        foreach ($task->customFieldValues as $cfv) {
            $newTask->customFieldValues()->create([
                'custom_field_id' => $cfv->custom_field_id,
                'value_text' => $cfv->value_text,
                'value_number' => $cfv->value_number,
                'value_date' => $cfv->value_date,
                'value_json' => $cfv->value_json,
                'value_option_id' => $cfv->value_option_id,
            ]);
        }

        TaskActivityLogger::logCreated($newTask, $request->user());
        ActivityLogger::logCreated($newTask, $request->user());

        $newTask->load('assignee', 'collaborators', 'customFieldValues.selectedOption', 'customFieldValues.customField');
        $newTask->loadCount(['subtasks', 'subtasks as completed_subtasks_count' => fn ($q) => $q->where('status', 'done')]);

        broadcast(new TaskUpdated($project->id, $newTask->toArray(), 'created', $request->user()->id))->toOthers();

        return response()->json(['success' => true, 'task' => $newTask]);
    }

    public function edit(Project $project, Task $task): Response
    {
        $this->authorize('update', $task);

        $task->load('assignee', 'creator', 'collaborators', 'parent:id,title', 'attachments', 'closeRuleExemptBy:id,name', 'minutes.updatedBy:id,name', 'tags:id,name,slug', 'minutes.tags:id,name,slug');
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
                'url' => $a->url,
                'download_url' => $a->url,
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

        $canManageTaskDetails = $project->userCanManageTasks(auth()->user());

        $taskAttachments = $task->attachments->map(fn ($a) => [
            'id' => $a->id,
            'file_name' => $a->file_name,
            'file_type' => $a->file_type,
            'file_size' => $a->file_size,
            'url' => $a->url,
            'download_url' => $a->url,
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

            // Milestones and dependencies. The flag is gated more tightly than
            // the rest of the form — see TaskPolicy::flagMilestone.
            'canFlagMilestone' => auth()->user()->can('flagMilestone', $task),

            // The project close rule and the per-task waiver against it. The
            // rule is sent so the waiver only appears where it could bite.
            'requiresAttachmentOnClose' => (bool) $project->require_comment_attachment_on_close,
            'canExemptFromCloseRules' => auth()->user()->can('exemptFromCloseRules', $task),

            // Minutes for a meeting task. Sent whatever the type so switching a
            // task to a meeting reveals the tab without a round trip.
            'minutes' => $task->minutes,
            'minutesUpdatedBy' => $task->minutes?->updatedBy?->name,
            'minutesUpdatedAt' => $task->minutes?->updated_at?->toIso8601String(),
            'taskTypes' => Task::TASK_TYPES,
            'dependencies' => $task->dependencies()->get(['tasks.id', 'title', 'status'])->all(),
            'dependencyOptions' => $task->project_id
                ? Task::where('project_id', $task->project_id)
                    ->where('id', '!=', $task->id)
                    ->orderBy('title')
                    ->get(['id', 'title', 'status'])
                    ->all()
                : [],
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

        $task->load('assignee', 'collaborators', 'customFieldValues.selectedOption', 'customFieldValues.customField');
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

    public function show(Request $request, Project $project, Task $task): JsonResponse
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
                'url' => $a->url,
                'download_url' => $a->url,
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
            'url' => $a->url,
            'download_url' => $a->url,
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
            // The quick view shows the same time-in-motion panel as the task
            // page, and needs the project's setting to know whether to.
            'showTimeInMotion' => (bool) $project->show_time_in_motion,
            // The panel reads this to decide whether to offer the buttons that
            // change something. Only the full editor sent it before, so the
            // quick view treated everybody as a viewer and hid its Start timer
            // and Start now buttons from people who could use them.
            'canManageTaskDetails' => $project->userCanManageTasks($request->user()),
            // A finished project invites nobody to start work on it.
            'projectIsClosed' => $project->isClosed(),
        ]);
    }

    /**
     * Record that work on this task has begun, now.
     *
     * The status hook stamps this on the way into progress, which covers the
     * usual path. This is the button for the other one: somebody who has picked
     * a task up without moving it yet, and wants the clock to start from the
     * truth rather than from whenever they remember to drag it.
     *
     * Idempotent on purpose — a second press does not reset the clock, because
     * the first press was when the work actually started.
     */
    public function start(Request $request, Project $project, Task $task): JsonResponse
    {
        abort_if($task->project_id !== $project->id, 404);
        $this->authorize('update', $task);

        // The button is hidden on a completed or archived project; this is the
        // same rule for anybody who reaches the endpoint another way.
        abort_if($project->isClosed(), 422, 'This project is closed, so work cannot be started on its tasks.');

        // Nor on a task that is already finished with. Cancelled counts even
        // though it carries no completion time — only 'done' is stamped.
        abort_if(
            $task->completed_at !== null || in_array($task->status, ['done', 'cancelled'], true),
            422,
            'This task is already finished, so work cannot be started on it.'
        );

        $changed = false;

        if (! $task->started_at) {
            $task->started_at = now();
            $changed = true;
        }

        // Pressing Start is somebody saying they have picked the work up, so
        // the board should say so too rather than leaving it sitting in To Do
        // with a running clock. Saved through the model, not forced onto the
        // row, so the status change is logged and announced like any other.
        if ($task->status !== 'in_progress') {
            $task->status = 'in_progress';
            $changed = true;
        }

        // A second press changes nothing — the clock already started and the
        // task is already in progress — so it writes nothing either.
        if ($changed) {
            $task->save();
        }

        return response()->json([
            'started_at' => $task->started_at?->toIso8601String(),
            'status' => $task->status,
            'time_in_motion_minutes' => $task->timeInMotionMinutes(),
        ]);
    }

    /**
     * What the Pause box should offer for today, before anybody presses it.
     *
     * Asked of the server rather than worked out in the browser: the cap is the
     * person's own working day, which the page does not carry, and the rule for
     * where the day's stretch begins belongs in one place.
     */
    public function pausePreview(Request $request, Project $project, Task $task): JsonResponse
    {
        abort_if($task->project_id !== $project->id, 404);
        $this->authorize('update', $task);

        $suggestion = TimeTracker::suggestedDayMinutes($task, $request->user());

        return response()->json([
            'suggested_minutes' => $suggestion['minutes'],
            'from' => $suggestion['from']->toIso8601String(),
            'already_logged_today' => (int) $task->timeLogs()
                ->completed()
                ->where('user_id', $request->user()->id)
                ->whereDate('logged_on', now()->toDateString())
                ->sum('minutes'),
        ]);
    }

    /**
     * Stop the clock for the day, recording what was actually worked.
     *
     * The elapsed figure counts wall-clock, so a task left in motion over a
     * fortnight claims a fortnight of work. This is the button that says what
     * of it was real: today's hours become a time log, and the clock stops
     * until somebody picks the task up again.
     */
    public function pause(Request $request, Project $project, Task $task): JsonResponse
    {
        abort_if($task->project_id !== $project->id, 404);
        $this->authorize('update', $task);

        abort_if($project->isClosed(), 422, 'This project is closed, so its tasks cannot be paused.');

        $data = $request->validate([
            'minutes' => ['required', 'integer', 'min:0', 'max:1440'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        try {
            $result = TimeTracker::pauseDay($task, $request->user(), (int) $data['minutes'], $data['note'] ?? null);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['message' => $e->getMessage(), 'errors' => $e->errors()], 422);
        }

        return response()->json($this->motionPayload($result['task'], $result['log']));
    }

    /** Pick the clock back up after a pause. */
    public function resume(Request $request, Project $project, Task $task): JsonResponse
    {
        abort_if($task->project_id !== $project->id, 404);
        $this->authorize('update', $task);

        abort_if($project->isClosed(), 422, 'This project is closed, so work cannot be resumed on its tasks.');

        return response()->json($this->motionPayload(TimeTracker::resumeMotion($task)));
    }

    /** The motion state both buttons hand back, so the strip can redraw. */
    private function motionPayload(Task $task, $log = null): array
    {
        return [
            'started_at' => $task->started_at?->toIso8601String(),
            'motion_paused_at' => $task->motion_paused_at?->toIso8601String(),
            'motion_resumed_at' => $task->motion_resumed_at?->toIso8601String(),
            'motion_paused_minutes' => (int) $task->motion_paused_minutes,
            'time_in_motion_minutes' => $task->timeInMotionMinutes(),
            'logged_minutes' => $log?->minutes,
        ];
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
                // The generated occurrence is inserted straight into the list, so it
                    // needs the same relations a server-rendered row has. Without
                    // customFieldValues its carried-over values render blank until a
                    // page refresh fetches the real record.
                    $newTask->load('assignee', 'collaborators', 'customFieldValues.selectedOption', 'customFieldValues.customField');
                    $newTask->loadCount(['subtasks', 'comments', 'attachments']);
                $response['recurring_task_created'] = true;
                $response['new_task'] = $newTask;
            }
        }

        $task->loadMissing('assignee', 'collaborators', 'customFieldValues.selectedOption', 'customFieldValues.customField');
        broadcast(new TaskUpdated($project->id, $task->toArray(), 'updated', $request->user()->id))->toOthers();

        return response()->json($response);
    }

    public function timeline(Request $request, Project $project, Task $task): JsonResponse
    {
        abort_if($task->project_id !== $project->id, 404);
        $this->authorize('view', $task);

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
                    'url' => $a->url,
                    'download_url' => $a->url,
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
        if (!$project->userCanManageTasks(auth()->user())) {
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
                                // The generated occurrence is inserted straight into the list, so it
                    // needs the same relations a server-rendered row has. Without
                    // customFieldValues its carried-over values render blank until a
                    // page refresh fetches the real record.
                    $newTask->load('assignee', 'collaborators', 'customFieldValues.selectedOption', 'customFieldValues.customField');
                    $newTask->loadCount(['subtasks', 'comments', 'attachments']);
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
        if (!$project->userCanManageTasks(auth()->user())) {
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
                // The generated occurrence is inserted straight into the list, so it
                    // needs the same relations a server-rendered row has. Without
                    // customFieldValues its carried-over values render blank until a
                    // page refresh fetches the real record.
                    $newTask->load('assignee', 'collaborators', 'customFieldValues.selectedOption', 'customFieldValues.customField');
                    $newTask->loadCount(['subtasks', 'comments', 'attachments']);
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

        $this->authorize('view', $task);

        return $attachment->toDownloadResponse();
    }
}
