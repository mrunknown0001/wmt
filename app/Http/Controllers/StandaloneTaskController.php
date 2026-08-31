<?php

namespace App\Http\Controllers;

use App\Events\TaskUpdated;
use App\Http\Requests\PatchTaskRequest;
use App\Http\Requests\StoreTaskRequest;
use App\Http\Requests\UpdateTaskRequest;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskAttachment;
use App\Models\User;
use App\Notifications\TaskAssignedNotification;
use App\Services\ActivityLogger;
use App\Services\AutomationRuleEngine;
use App\Services\RecurringTaskService;
use App\Services\TaskActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class StandaloneTaskController extends Controller
{
    public function store(StoreTaskRequest $request): RedirectResponse|JsonResponse
    {
        $validated = $request->validated();
        $user = $request->user();

        if (empty($validated['assigned_to'])) {
            $validated['assigned_to'] = $user->id;
        }

        $collaboratorIds = $validated['collaborator_ids'] ?? [];
        unset($validated['collaborator_ids']);

        $maxPosition = Task::whereNull('project_id')
            ->whereNull('parent_id')
            ->where('status', $validated['status'] ?? 'to_do')
            ->max('position') ?? -1;

        $task = Task::create([
            ...$validated,
            'created_by' => $user->id,
            'position' => $maxPosition + 1,
        ]);

        if (! empty($collaboratorIds)) {
            $task->collaborators()->sync($collaboratorIds);
        }

        TaskActivityLogger::logCreated($task, $user);
        ActivityLogger::logCreated($task, $user);

        if ($task->assigned_to && $task->assigned_to !== $user->id) {
            $task->load('project');
            $task->assignee->notify(new TaskAssignedNotification($task, $user));
        }

        if ($request->wantsJson()) {
            $task->load('assignee:id,name', 'project:id,name');

            return response()->json(['task' => $task], 201);
        }

        return redirect()->route('my-tasks')
            ->with('success', 'Task created successfully.');
    }

    public function edit(Task $task): Response
    {
        $this->authorize('update', $task);

        $task->load('assignee', 'creator', 'collaborators', 'parent:id,title', 'project', 'attachments');
        $task->loadCount('subtasks');

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

        $recurrenceChain = [];
        if ($task->is_recurring || $task->recurring_source_id) {
            $current = $task;
            $ancestors = [];
            while ($current->recurring_source_id) {
                $current = Task::select('id', 'title', 'status', 'start_date', 'due_date', 'recurring_source_id', 'project_id')
                    ->find($current->recurring_source_id);
                if (! $current) break;
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

        $canManageTaskDetails = auth()->user()->can('manage-tasks')
            || $task->created_by === auth()->id();

        return Inertia::render('Tasks/Edit', [
            'project' => $task->project,
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
            'isStandalone' => true,

            // Same minutes contract as the project-nested edit page: they share
            // the one Inertia component, so they must share its props.
            'minutes' => $task->minutes()->with('updatedBy:id,name')->first(),
            'minutesUpdatedBy' => $task->minutes?->updatedBy?->name,
            'minutesUpdatedAt' => $task->minutes?->updated_at?->toIso8601String(),
            'taskTypes' => Task::TASK_TYPES,
            'projects' => Project::where('status', '!=', 'archived')
                ->orderBy('name')
                ->get(['id', 'name']),
        ]);
    }

    public function update(UpdateTaskRequest $request, Task $task): RedirectResponse
    {
        $oldValues = $task->only(['title', 'description', 'status', 'priority', 'assigned_to', 'start_date', 'due_date']);
        $oldValues['start_date'] = $task->start_date?->toDateString();
        $oldValues['due_date'] = $task->due_date?->toDateString();
        $oldAssignee = $task->assigned_to;

        $validated = $request->validated();
        $collaboratorIds = $validated['collaborator_ids'] ?? null;
        unset($validated['collaborator_ids']);

        $task->update($validated);

        if ($collaboratorIds !== null) {
            $task->collaborators()->sync($collaboratorIds);
        }

        TaskActivityLogger::logChanges($task, $oldValues, $request->user());
        ActivityLogger::logChanges($task, $oldValues, $request->user());

        if ($task->assigned_to && $task->assigned_to !== $oldAssignee && $task->assigned_to !== $request->user()->id) {
            $task->load('project');
            $task->assignee->notify(new TaskAssignedNotification($task, $request->user()));
        }

        if (in_array($task->status, ['done', 'cancelled']) && $task->escalation_level > 0) {
            $task->update(['escalation_level' => 0]);
        }

        AutomationRuleEngine::evaluate($task, 'task_status_changed', $oldValues);
        AutomationRuleEngine::evaluate($task, 'task_completed', $oldValues);

        $newTask = RecurringTaskService::generateNextIfCompleted($task, $oldValues['status'] ?? null, $request->user());

        return redirect()->route('my-tasks')
            ->with('success', $newTask ? 'Task completed. Next recurring occurrence created.' : 'Task updated successfully.');
    }

    public function destroy(Task $task): RedirectResponse
    {
        $this->authorize('delete', $task);

        ActivityLogger::logDeleted($task, auth()->user());
        $task->delete();

        return redirect()->route('my-tasks')
            ->with('success', 'Task deleted successfully.');
    }

    public function patchField(PatchTaskRequest $request, Task $task): JsonResponse
    {
        $oldValues = $task->only(['title', 'description', 'status', 'priority', 'assigned_to', 'start_date', 'due_date']);
        $oldValues['start_date'] = $task->start_date?->toDateString();
        $oldValues['due_date'] = $task->due_date?->toDateString();
        $oldAssignee = $task->assigned_to;

        $task->update($request->validated());
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

        if ($request->has('status') && in_array($task->status, ['done', 'cancelled']) && $task->escalation_level > 0) {
            $task->update(['escalation_level' => 0]);
        }

        AutomationRuleEngine::evaluate($task, 'task_status_changed', $oldValues);
        AutomationRuleEngine::evaluate($task, 'task_completed', $oldValues);

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

        return response()->json($response);
    }

    public function timeline(Request $request, Task $task): JsonResponse
    {
        abort_unless($task->isStandalone(), 404);
        $this->authorize('view', $task);

        $type = $request->query('type');
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

    public function downloadAttachment(Task $task, TaskAttachment $attachment): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        if ($attachment->task_id !== $task->id) {
            abort(404);
        }

        $this->authorize('view', $task);

        return $attachment->toDownloadResponse();
    }
}
