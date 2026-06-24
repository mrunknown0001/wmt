<?php

namespace App\Http\Controllers;

use App\Http\Requests\PatchTaskRequest;
use App\Http\Requests\StoreTaskRequest;
use App\Http\Requests\UpdateTaskRequest;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Notifications\TaskAssignedNotification;
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

        return Inertia::render('Tasks/Create', [
            'project' => $project,
            'parentTask' => $parentTask,
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'statuses' => ['backlog', 'to_do', 'in_progress', 'in_review', 'done', 'cancelled'],
            'priorities' => ['low', 'medium', 'high', 'urgent'],
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

        return Inertia::render('Tasks/Edit', [
            'project' => $project,
            'task' => $task,
            'timeline' => $timeline,
            'totalComments' => $task->comments()->count(),
            'totalActivities' => $task->activities()->count(),
            'users' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'statuses' => ['backlog', 'to_do', 'in_progress', 'in_review', 'done', 'cancelled'],
            'priorities' => ['low', 'medium', 'high', 'urgent'],
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

        return redirect("/projects/{$project->id}")
            ->with('success', 'Task updated successfully.');
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

        return response()->json([
            'success' => true,
            'task' => $task,
        ]);
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
        ]);

        foreach ($validated['tasks'] as $item) {
            Task::where('id', $item['id'])
                ->where('project_id', $project->id)
                ->update([
                    'status' => $item['status'],
                    'position' => $item['position'],
                ]);
        }

        return response()->json(['success' => true]);
    }
}
