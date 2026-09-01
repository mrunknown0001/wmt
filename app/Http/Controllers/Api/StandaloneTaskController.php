<?php

namespace App\Http\Controllers\Api;

use App\Rules\CommentLength;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreTaskRequest;
use App\Http\Requests\UpdateTaskRequest;
use App\Models\CommentAttachment;
use App\Models\Task;
use App\Models\TaskComment;
use App\Models\User;
use App\Notifications\TaskAssignedNotification;
use App\Services\ActivityLogger;
use App\Services\AutomationRuleEngine;
use App\Services\RecurringTaskService;
use App\Services\TaskActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class StandaloneTaskController extends Controller
{
    public function store(StoreTaskRequest $request): JsonResponse
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

        $task->load('assignee:id,name', 'creator:id,name', 'collaborators:id,name');

        return response()->json(['task' => $task], 201);
    }

    public function show(Task $task): JsonResponse
    {
        abort_unless($task->isStandalone(), 404);
        $this->authorize('view', $task);

        $task->load('assignee:id,name', 'creator:id,name', 'collaborators:id,name', 'parent:id,title', 'project:id,name', 'subtasks.assignee:id,name');
        $task->loadCount('subtasks');
        $task->loadCount(['subtasks as completed_subtasks_count' => fn ($q) => $q->where('status', 'done')]);

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
                    'download_url' => $a->url,
                    'is_image' => $a->isImage(),
                    'is_video' => $a->isVideo(),
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

    public function update(UpdateTaskRequest $request, Task $task): JsonResponse
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

        $response = ['task' => $task->load('assignee:id,name', 'creator:id,name', 'collaborators:id,name')];

        $newTask = RecurringTaskService::generateNextIfCompleted($task, $oldValues['status'] ?? null, $request->user());
        if ($newTask) {
            $newTask->load('assignee:id,name', 'collaborators:id,name');
            $response['recurring_task_created'] = true;
            $response['new_task'] = $newTask;
        }

        return response()->json($response);
    }

    public function destroy(Request $request, Task $task): JsonResponse
    {
        $this->authorize('delete', $task);

        ActivityLogger::logDeleted($task, $request->user());
        $task->delete();

        return response()->json(null, 204);
    }

    public function patchField(Request $request, Task $task): JsonResponse
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
            AutomationRuleEngine::evaluate($task, 'task_status_changed', $oldValues);
            if ($task->status === 'done') {
                AutomationRuleEngine::evaluate($task, 'task_completed', $oldValues);
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

    public function storeComment(Request $request, Task $task): JsonResponse
    {
        // Route binding accepts any task id, so without these a project task
        // could be commented on through the standalone route, skipping that
        // project's rules entirely.
        abort_unless($task->isStandalone(), 404);
        $this->authorize('view', $task);

        $request->validate([
            'body' => ['required_without:attachments', 'nullable', 'string', new CommentLength],
            'attachments' => ['nullable', 'array', 'max:5'],
            'attachments.*' => ['file', new \App\Rules\CommentAttachmentFile],
        ]);

        $comment = $task->comments()->create([
            'user_id' => $request->user()->id,
            'body' => $request->input('body') ?? '',
        ]);

        if ($request->hasFile('attachments')) {
            foreach ($request->file('attachments') as $file) {
                $path = $file->store("comment-attachments/{$comment->id}", CommentAttachment::DISK);
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
                'url' => $a->url,
                'is_image' => str_starts_with($a->file_type, 'image/'),
                'is_video' => str_starts_with($a->file_type, 'video/'),
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
                'download_url' => $a->url,
                'is_image' => $a->isImage(),
                'is_video' => $a->isVideo(),
            ]),
        ]], 201);
    }

    public function destroyComment(Request $request, Task $task, TaskComment $comment): JsonResponse
    {
        if ($comment->user_id !== $request->user()->id && !$request->user()->hasRole('admin')) {
            abort(403);
        }

        foreach ($comment->attachments as $attachment) {
            Storage::disk(CommentAttachment::DISK)->delete($attachment->file_path);
        }
        Storage::disk(CommentAttachment::DISK)->deleteDirectory("comment-attachments/{$comment->id}");

        $comment->delete();

        return response()->json(null, 204);
    }

    public function downloadAttachment(Request $request, Task $task, TaskComment $comment, CommentAttachment $attachment): StreamedResponse
    {
        if ($attachment->task_comment_id !== $comment->id) {
            abort(404);
        }

        $this->authorize('view', $task);

        return $attachment->toDownloadResponse();
    }

    private function notifyCommentMentions(TaskComment $comment, Task $task, User $author): void
    {
        $task->loadMissing('project');
        $body = $comment->body;

        $mentionedIds = [];
        if (preg_match_all('/data-id="(\d+)"/', $body, $m)) {
            $mentionedIds = array_map('intval', $m[1]);
        }

        User::where('is_active', true)
            ->where('id', '!=', $author->id)
            ->get()
            ->filter(fn ($u) => in_array($u->id, $mentionedIds) || str_contains($body, '@'.$u->name))
            ->each(fn ($u) => $u->notify(new \App\Notifications\TaskCommentMentionNotification($task, $author, $comment)));
    }
}
