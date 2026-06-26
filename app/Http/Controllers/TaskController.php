<?php

namespace App\Http\Controllers;

use App\Http\Requests\PatchTaskRequest;
use App\Http\Requests\StoreTaskRequest;
use App\Http\Requests\UpdateTaskRequest;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Notifications\TaskAssignedNotification;
use App\Services\RecurringTaskService;
use App\Services\TaskActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class TaskController extends Controller
{
    public function create(Request $request, Project $project): Response
    {
        if (!auth()->user()->can('manage-tasks') && $project->owner_id !== auth()->id()) {
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

        if ($task->assigned_to && $task->assigned_to !== $request->user()->id) {
            $task->load('project');
            $task->assignee->notify(new TaskAssignedNotification($task, $request->user()));
        }

        return redirect("/projects/{$project->id}")
            ->with('success', 'Task created successfully.');
    }

    public function edit(Project $project, Task $task): Response
    {
        $this->authorize('update', $task);

        $task->load('assignee', 'creator', 'collaborators', 'parent:id,title');
        $task->loadCount('subtasks');

        $comments = $task->comments()->with('user')->latest()->take(10)->get()->map(fn ($c) => [
            'id' => $c->id,
            'type' => 'comment',
            'body' => $c->body,
            'user' => $c->user ? ['id' => $c->user->id, 'name' => $c->user->name] : null,
            'created_at' => $c->created_at->toIso8601String(),
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
                $current = Task::select('id', 'title', 'status', 'due_date', 'recurring_source_id', 'project_id')
                    ->find($current->recurring_source_id);
                if (!$current) break;
                array_unshift($ancestors, $current);
                if (count($ancestors) > 10) break;
            }

            $descendants = [];
            $next = Task::select('id', 'title', 'status', 'due_date', 'recurring_source_id', 'project_id')
                ->where('recurring_source_id', $task->id)->first();
            while ($next) {
                $descendants[] = $next;
                $next = Task::select('id', 'title', 'status', 'due_date', 'recurring_source_id', 'project_id')
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
                    'due_date' => $t->due_date?->toDateString(),
                    'is_current' => $t->id === $task->id,
                    'project_id' => $t->project_id,
                ])
                ->values()
                ->toArray();
        }

        return Inertia::render('Tasks/Edit', [
            'project' => $project,
            'task' => $task,
            'timeline' => $timeline,
            'totalComments' => $task->comments()->count(),
            'totalActivities' => $task->activities()->count(),
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'statuses' => ['backlog', 'to_do', 'in_progress', 'in_review', 'done', 'cancelled'],
            'priorities' => ['low', 'medium', 'high', 'urgent'],
            'recurrenceFrequencies' => Task::RECURRENCE_FREQUENCIES,
            'recurrenceChain' => $recurrenceChain,
        ]);
    }

    public function update(UpdateTaskRequest $request, Project $project, Task $task): RedirectResponse
    {
        $oldValues = $task->only(['title', 'description', 'status', 'priority', 'assigned_to', 'due_date']);
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

        if ($task->assigned_to && $task->assigned_to !== $oldAssignee && $task->assigned_to !== $request->user()->id) {
            $task->load('project');
            $task->assignee->notify(new TaskAssignedNotification($task, $request->user()));
        }

        $newTask = RecurringTaskService::generateNextIfCompleted($task, $oldValues['status'] ?? null, $request->user());

        return redirect("/projects/{$project->id}")
            ->with('success', $newTask ? 'Task completed. Next recurring occurrence created.' : 'Task updated successfully.');
    }

    public function destroy(Project $project, Task $task): RedirectResponse
    {
        $this->authorize('delete', $task);

        $task->delete();

        return redirect("/projects/{$project->id}")
            ->with('success', 'Task deleted successfully.');
    }

    public function patchField(PatchTaskRequest $request, Project $project, Task $task): JsonResponse
    {
        $oldValues = $task->only(['title', 'description', 'status', 'priority', 'assigned_to', 'due_date']);
        $oldValues['due_date'] = $task->due_date?->toDateString();
        $oldAssignee = $task->assigned_to;

        $task->update($request->validated());
        $task->load('assignee');

        TaskActivityLogger::logChanges($task, $oldValues, $request->user());

        if (
            $request->has('assigned_to')
            && $task->assigned_to
            && $task->assigned_to !== $oldAssignee
            && $task->assigned_to !== $request->user()->id
        ) {
            $task->load('project');
            $task->assignee->notify(new TaskAssignedNotification($task, $request->user()));
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

        return response()->json($response);
    }

    public function timeline(Request $request, Project $project, Task $task): JsonResponse
    {
        $type = $request->query('type'); // 'comment' or 'activity'
        $offset = (int) $request->query('offset', 0);
        $limit = 10;

        if ($type === 'comment') {
            $items = $task->comments()->with('user')->latest()->skip($offset)->take($limit)->get()->map(fn ($c) => [
                'id' => $c->id,
                'type' => 'comment',
                'body' => $c->body,
                'user' => $c->user ? ['id' => $c->user->id, 'name' => $c->user->name] : null,
                'created_at' => $c->created_at->toIso8601String(),
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
        if (!auth()->user()->can('manage-tasks') && $project->owner_id !== auth()->id()) {
            abort(403);
        }

        $validated = $request->validate([
            'task_ids' => 'required|array|min:1',
            'task_ids.*' => 'required|integer',
            'action' => 'required|string|in:update_status,update_priority,assign,delete',
            'value' => 'nullable',
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
                foreach ($tasks as $task) {
                    $oldStatus = $task->status;
                    if ($oldStatus === $status) continue;
                    $oldValues = $task->only(['title', 'description', 'status', 'priority', 'assigned_to', 'due_date']);
                    $oldValues['due_date'] = $task->due_date?->toDateString();
                    $task->update(['status' => $status]);
                    TaskActivityLogger::logChanges($task, $oldValues, $user);
                    $newTask = RecurringTaskService::generateNextIfCompleted($task, $oldStatus, $user);
                    if ($newTask) {
                        $newTask->load('assignee', 'collaborators');
                        $newTasks[] = $newTask;
                    }
                }
                break;

            case 'update_priority':
                $priority = $validated['value'];
                if (!in_array($priority, ['low', 'medium', 'high', 'urgent'])) {
                    return response()->json(['success' => false, 'message' => 'Invalid priority.'], 422);
                }
                foreach ($tasks as $task) {
                    if ($task->priority === $priority) continue;
                    $oldValues = $task->only(['title', 'description', 'status', 'priority', 'assigned_to', 'due_date']);
                    $oldValues['due_date'] = $task->due_date?->toDateString();
                    $task->update(['priority' => $priority]);
                    TaskActivityLogger::logChanges($task, $oldValues, $user);
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
                    $oldValues = $task->only(['title', 'description', 'status', 'priority', 'assigned_to', 'due_date']);
                    $oldValues['due_date'] = $task->due_date?->toDateString();
                    $task->update(['assigned_to' => $assigneeId]);
                    $task->load('assignee');
                    TaskActivityLogger::logChanges($task, $oldValues, $user);
                    if ($assigneeId && $assigneeId !== $user->id) {
                        $task->load('project');
                        $task->assignee->notify(new TaskAssignedNotification($task, $user));
                    }
                }
                break;

            case 'delete':
                foreach ($tasks as $task) {
                    $task->delete();
                }
                break;
        }

        return response()->json([
            'success' => true,
            'new_tasks' => $newTasks,
            'affected_count' => $tasks->count(),
        ]);
    }

    public function reorder(Request $request, Project $project): JsonResponse
    {
        // Authorize: must be able to manage tasks or be the project owner
        if (!auth()->user()->can('manage-tasks') && $project->owner_id !== auth()->id()) {
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

        foreach ($validated['tasks'] as $item) {
            $updateData = [
                'status' => $item['status'],
                'position' => $item['position'],
            ];
            if (array_key_exists('section_id', $item)) {
                $updateData['section_id'] = $item['section_id'];
            }
            Task::where('id', $item['id'])
                ->where('project_id', $project->id)
                ->update($updateData);
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

        return response()->json([
            'success' => true,
            'new_tasks' => $newTasks,
        ]);
    }
}
