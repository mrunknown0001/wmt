<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreTaskRequest;
use App\Http\Requests\UpdateTaskRequest;
use App\Models\Project;
use App\Models\Task;
use App\Notifications\TaskAssignedNotification;
use App\Services\ActivityLogger;
use App\Services\AutomationRuleEngine;
use App\Services\RecurringTaskService;
use App\Services\TaskActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskController extends Controller
{
    public function show(Project $project, Task $task): JsonResponse
    {
        $task->load('assignee:id,name', 'creator:id,name', 'collaborators:id,name', 'parent:id,title', 'project:id,name');
        $task->loadCount('subtasks');
        $task->loadCount(['subtasks as completed_subtasks_count' => fn ($q) => $q->where('status', 'done')]);

        $comments = $task->comments()
            ->with('user:id,name')
            ->latest()
            ->take(20)
            ->get()
            ->map(fn ($c) => [
                'id' => $c->id,
                'body' => $c->body,
                'user' => $c->user ? ['id' => $c->user->id, 'name' => $c->user->name] : null,
                'created_at' => $c->created_at->toIso8601String(),
            ]);

        $activities = $task->activities()
            ->with('user:id,name')
            ->latest()
            ->take(20)
            ->get()
            ->map(fn ($a) => [
                'id' => $a->id,
                'field' => $a->field,
                'old_value' => $a->old_value,
                'new_value' => $a->new_value,
                'description' => $a->description,
                'user' => $a->user ? ['id' => $a->user->id, 'name' => $a->user->name] : null,
                'created_at' => $a->created_at->toIso8601String(),
            ]);

        return response()->json([
            'task' => $task,
            'comments' => $comments,
            'activities' => $activities,
        ]);
    }

    public function patchField(Request $request, Project $project, Task $task): JsonResponse
    {
        $this->authorize('update', $task);

        $request->validate([
            'field' => 'required|string|in:status,priority,assigned_to,due_date,start_date',
            'value' => 'nullable',
        ]);

        $field = $request->input('field');
        $value = $request->input('value');

        $oldValues = $task->only(['title', 'description', 'status', 'priority', 'assigned_to', 'start_date', 'due_date']);
        $oldValues['start_date'] = $task->start_date?->toDateString();
        $oldValues['due_date'] = $task->due_date?->toDateString();
        $oldAssignee = $task->assigned_to;

        $task->update([$field => $value]);
        $task->load('assignee:id,name');

        TaskActivityLogger::logChanges($task, $oldValues, $request->user());
        ActivityLogger::logChanges($task, $oldValues, $request->user());

        if (
            $field === 'assigned_to'
            && $task->assigned_to
            && $task->assigned_to !== $oldAssignee
            && $task->assigned_to !== $request->user()->id
        ) {
            $task->load('project');
            $task->assignee->notify(new TaskAssignedNotification($task, $request->user()));
        }

        if ($field === 'status' && in_array($task->status, ['done', 'cancelled']) && $task->escalation_level > 0) {
            $task->update(['escalation_level' => 0]);
        }

        $response = ['success' => true, 'task' => $task];

        if ($field === 'status') {
            if (($oldValues['status'] ?? null) !== $task->status) {
                AutomationRuleEngine::evaluate($task, 'task_status_changed', $oldValues);
                if ($task->status === 'done') {
                    AutomationRuleEngine::evaluate($task, 'task_completed', $oldValues);
                }
            }
            $newTask = RecurringTaskService::generateNextIfCompleted($task, $oldValues['status'] ?? null, $request->user());
            if ($newTask) {
                $newTask->load('assignee', 'collaborators');
                $response['recurring_task_created'] = true;
                $response['new_task'] = $newTask;
            }
        }

        return response()->json($response);
    }

    public function storeComment(Request $request, Project $project, Task $task): JsonResponse
    {
        $request->validate([
            'body' => 'required|string|max:5000',
        ]);

        $comment = $task->comments()->create([
            'user_id' => $request->user()->id,
            'body' => $request->input('body'),
        ]);

        $comment->load('user:id,name');

        return response()->json([
            'comment' => [
                'id' => $comment->id,
                'body' => $comment->body,
                'user' => ['id' => $comment->user->id, 'name' => $comment->user->name],
                'created_at' => $comment->created_at->toIso8601String(),
            ],
        ], 201);
    }

    public function store(StoreTaskRequest $request, Project $project): JsonResponse
    {
        $validated = $request->validated();

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
        unset($validated['collaborator_ids']);

        $task = $project->tasks()->create([
            ...$validated,
            'created_by' => $request->user()->id,
            'position' => $maxPosition + 1,
        ]);

        if (!empty($collaboratorIds)) {
            $task->collaborators()->sync($collaboratorIds);
        }

        TaskActivityLogger::logCreated($task, $request->user());
        ActivityLogger::logCreated($task, $request->user());

        if ($task->assigned_to && $task->assigned_to !== $request->user()->id) {
            $task->load('project');
            $task->assignee->notify(new TaskAssignedNotification($task, $request->user()));
        }

        AutomationRuleEngine::evaluate($task, 'task_created');

        $task->load('assignee:id,name', 'creator:id,name', 'collaborators:id,name');

        return response()->json(['task' => $task], 201);
    }

    public function update(UpdateTaskRequest $request, Project $project, Task $task): JsonResponse
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

        $response = ['task' => $task->load('assignee:id,name', 'creator:id,name', 'collaborators:id,name')];

        $newTask = RecurringTaskService::generateNextIfCompleted($task, $oldValues['status'] ?? null, $request->user());
        if ($newTask) {
            $newTask->load('assignee:id,name', 'collaborators:id,name');
            $response['recurring_task_created'] = true;
            $response['new_task'] = $newTask;
        }

        return response()->json($response);
    }

    public function destroy(Request $request, Project $project, Task $task): JsonResponse
    {
        $this->authorize('delete', $task);

        ActivityLogger::logDeleted($task, $request->user());

        $task->delete();

        return response()->json(null, 204);
    }
}
