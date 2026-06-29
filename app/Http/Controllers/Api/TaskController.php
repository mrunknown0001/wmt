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
        $task->load('assignee:id,name', 'creator:id,name', 'collaborators:id,name', 'parent:id,title', 'project:id,name', 'subtasks.assignee:id,name');
        $task->loadMissing('project.owner:id,name', 'project.members:id,name');
        $task->loadCount('subtasks');
        $task->loadCount(['subtasks as completed_subtasks_count' => fn ($q) => $q->where('status', 'done')]);

        $members = collect();
        if ($task->project) {
            $members = collect([$task->project->owner])
                ->merge($task->project->members)
                ->filter()
                ->unique('id')
                ->map(fn ($u) => ['id' => $u->id, 'name' => $u->name])
                ->values();
        }

        $comments = $task->comments()
            ->with('user:id,name', 'attachments')
            ->latest()
            ->take(20)
            ->get()
            ->map(fn ($c) => [
                'id' => $c->id,
                'body' => $c->body,
                'user' => $c->user ? ['id' => $c->user->id, 'name' => $c->user->name] : null,
                'created_at' => $c->created_at->toIso8601String(),
                'attachments' => $c->attachments->map(fn ($a) => [
                    'id' => $a->id,
                    'file_name' => $a->file_name,
                    'file_type' => $a->file_type,
                    'file_size' => $a->file_size,
                    'url' => $a->url,
                    'download_url' => url("/api/projects/{$project->id}/tasks/{$task->id}/comments/{$c->id}/attachments/{$a->id}/download"),
                    'is_image' => $a->isImage(),
                ]),
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
            'members' => $members,
            'subtasks' => $task->subtasks->map(fn ($s) => [
                'id' => $s->id,
                'project_id' => $s->project_id,
                'title' => $s->title,
                'status' => $s->status,
                'priority' => $s->priority,
                'due_date' => $s->due_date,
                'assignee' => $s->assignee ? ['id' => $s->assignee->id, 'name' => $s->assignee->name] : null,
            ]),
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
        $maxKb = \App\Models\Setting::current()->max_upload_size * 1024;

        $request->validate([
            'body' => ['required_without:attachments', 'nullable', 'string', 'max:2000'],
            'attachments' => ['nullable', 'array', 'max:5'],
            'attachments.*' => ['file', 'mimes:jpg,jpeg,png,webp,pdf', "max:{$maxKb}"],
        ]);

        $comment = $task->comments()->create([
            'user_id' => $request->user()->id,
            'body' => $request->input('body') ?? '',
        ]);

        if ($request->hasFile('attachments')) {
            foreach ($request->file('attachments') as $file) {
                $path = $file->store("comment-attachments/{$comment->id}", 'public');
                $comment->attachments()->create([
                    'file_name' => $file->getClientOriginalName(),
                    'file_path' => $path,
                    'file_type' => $file->getMimeType(),
                    'file_size' => $file->getSize(),
                ]);
            }
        }

        $comment->load('user:id,name', 'attachments');

        $this->notifyCommentMentions($comment, $task, $request->user());

        broadcast(new \App\Events\TaskCommentCreated($task->id, [
            'id' => $comment->id,
            'type' => 'comment',
            'body' => $comment->body,
            'user' => $comment->user ? ['id' => $comment->user->id, 'name' => $comment->user->name] : null,
            'attachments' => $comment->attachments->map(fn ($a) => [
                'id' => $a->id,
                'file_name' => $a->file_name,
                'file_type' => $a->file_type,
                'file_size' => $a->file_size,
                'url' => asset('storage/'.$a->file_path),
                'is_image' => str_starts_with($a->file_type, 'image/'),
            ])->toArray(),
            'created_at' => $comment->created_at->toIso8601String(),
        ]))->toOthers();

        return response()->json(['comment' => [
            'id' => $comment->id,
            'body' => $comment->body,
            'user' => ['id' => $comment->user->id, 'name' => $comment->user->name],
            'created_at' => $comment->created_at->toIso8601String(),
            'attachments' => $comment->attachments->map(fn ($a) => [
                'id' => $a->id,
                'file_name' => $a->file_name,
                'file_type' => $a->file_type,
                'file_size' => $a->file_size,
                'url' => $a->url,
                'download_url' => url("/api/projects/{$project->id}/tasks/{$task->id}/comments/{$comment->id}/attachments/{$a->id}/download"),
                'is_image' => $a->isImage(),
            ]),
        ]], 201);
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

    private function notifyCommentMentions(\App\Models\TaskComment $comment, Task $task, \App\Models\User $author): void
    {
        $task->loadMissing('project');
        $body = $comment->body;

        $mentionedIds = [];
        if (preg_match_all('/data-id="(\d+)"/', $body, $m)) {
            $mentionedIds = array_map('intval', $m[1]);
        }

        \App\Models\User::where('is_active', true)
            ->where('id', '!=', $author->id)
            ->get()
            ->filter(fn ($u) => in_array($u->id, $mentionedIds) || str_contains($body, '@' . $u->name))
            ->each(fn ($u) => $u->notify(new \App\Notifications\TaskCommentMentionNotification($task, $author, $comment)));
    }
}
