<?php

namespace App\Http\Controllers;

use App\Rules\CommentLength;
use App\Events\TaskCommentCreated;
use App\Events\TaskCommentDeleted;
use App\Events\TaskCommentUpdated;
use App\Http\Requests\StoreTaskCommentRequest;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskComment;
use App\Models\User;
use App\Notifications\CommentDeletedNotification;
use App\Notifications\TaskCommentMentionNotification;
use App\Notifications\TaskCommentNotification;
use App\Models\CommentAttachment;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class TaskCommentController extends Controller
{
    /**
     * Commenting is participation, not viewing — so project viewers are excluded.
     *
     * Assignees and collaborators are allowed even without task-management
     * rights: they are the people doing the work, and being able to respond on
     * their own task is the point of assigning it to them.
     */
    private function assertCanComment(Project $project, Task $task, \App\Models\User $user): void
    {
        $task->loadMissing('collaborators');

        abort_unless(
            $project->userCanManageTasks($user)
                || $task->assigned_to === $user->id
                || $task->collaborators->contains('id', $user->id),
            403,
            'You do not have permission to comment on this task.'
        );
    }

    public function store(StoreTaskCommentRequest $request, Project $project, Task $task): RedirectResponse
    {
        abort_if($task->project_id !== $project->id, 404);
        $this->assertCanComment($project, $task, $request->user());

        $comment = $task->comments()->create([
            'user_id' => $request->user()->id,
            'body' => $request->body ?? '',
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

        $this->notifyMentionedUsers($comment, $task, $request->user());
        $this->notifyAssignees($comment, $task, $request->user());

        $comment->load('user', 'attachments');
        broadcast(new TaskCommentCreated($task->id, [
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
                'download_url' => $a->url,
                'is_image' => str_starts_with($a->file_type, 'image/'),
                'is_video' => str_starts_with($a->file_type, 'video/'),
            ])->toArray(),
            'created_at' => $comment->created_at->toIso8601String(),
        ]))->toOthers();

        return back()->with('success', 'Comment added.');
    }

    private function notifyMentionedUsers(TaskComment $comment, Task $task, User $author): void
    {
        $body = $comment->body;
        $task->loadMissing('project');

        // Extract user IDs from mention spans (data-id attributes)
        $mentionedIds = [];
        if (preg_match_all('/data-id="(\d+)"/', $body, $matches)) {
            $mentionedIds = array_map('intval', $matches[1]);
        }

        // Fallback: also check for plain-text @Name mentions
        $mentionedUsers = User::where('is_active', true)
            ->where('id', '!=', $author->id)
            ->get()
            ->filter(fn (User $user) => in_array($user->id, $mentionedIds) || str_contains($body, '@' . $user->name));

        foreach ($mentionedUsers as $user) {
            $user->notify(new TaskCommentMentionNotification($task, $author, $comment));
        }
    }

    private function notifyAssignees(TaskComment $comment, Task $task, User $author): void
    {
        $task->loadMissing('project', 'parent');

        $notifiedIds = $this->getMentionedUserIds($comment->body, $author);
        $notifiedIds[] = $author->id;

        // Notify the task assignee
        if ($task->assigned_to && ! in_array($task->assigned_to, $notifiedIds)) {
            $assignee = User::find($task->assigned_to);
            if ($assignee && $assignee->is_active) {
                $assignee->notify(new TaskCommentNotification($task, $author, $comment));
                $notifiedIds[] = $assignee->id;
            }
        }

        // Notify the parent task assignee (for subtask comments)
        if ($task->parent && $task->parent->assigned_to && ! in_array($task->parent->assigned_to, $notifiedIds)) {
            $parentAssignee = User::find($task->parent->assigned_to);
            if ($parentAssignee && $parentAssignee->is_active) {
                $parentAssignee->notify(new TaskCommentNotification($task, $author, $comment, isSubtaskComment: true));
            }
        }
    }

    private function getMentionedUserIds(string $body, User $author): array
    {
        $mentionedIds = [];
        if (preg_match_all('/data-id="(\d+)"/', $body, $matches)) {
            $mentionedIds = array_map('intval', $matches[1]);
        }

        return $mentionedIds;
    }

    public function download(Request $request, Project $project, Task $task, TaskComment $comment, CommentAttachment $attachment): StreamedResponse
    {
        if ($attachment->task_comment_id !== $comment->id) {
            abort(404);
        }

        $this->authorize('view', $task);

        return $attachment->toDownloadResponse();
    }

    public function update(Request $request, Project $project, Task $task, TaskComment $comment): RedirectResponse
    {
        if ($comment->task_id !== $task->id) {
            abort(404);
        }

        if ($comment->user_id !== $request->user()->id) {
            abort(403);
        }

        $request->validate([
            'body' => ['required', 'string', new CommentLength],
        ]);

        $comment->update(['body' => $request->body]);

        broadcast(new TaskCommentUpdated(
            $task->id,
            $comment->id,
            $comment->body,
            $comment->updated_at->toIso8601String(),
            $request->user()->id,
        ))->toOthers();

        return back()->with('success', 'Comment updated.');
    }

    public function destroy(Request $request, Project $project, Task $task, TaskComment $comment): RedirectResponse
    {
        if ($comment->task_id !== $task->id) {
            abort(404);
        }

        if ($comment->user_id !== $request->user()->id && ! $request->user()->hasRole('admin')) {
            abort(403);
        }

        $this->notifyMentionedUsersOfDeletion($comment, $task, $request->user());

        // Delete attached files from disk
        foreach ($comment->attachments as $attachment) {
            Storage::disk(CommentAttachment::DISK)->delete($attachment->file_path);
        }
        Storage::disk(CommentAttachment::DISK)->deleteDirectory("comment-attachments/{$comment->id}");

        $commentId = $comment->id;
        $comment->delete();

        broadcast(new TaskCommentDeleted($task->id, $commentId, $request->user()->id))->toOthers();

        return back()->with('success', 'Comment deleted.');
    }

    public function storeStandalone(StoreTaskCommentRequest $request, Task $task): RedirectResponse
    {
        // This route is for standalone tasks. Route binding accepts any task id,
        // so a project task arriving here would have skipped that project's
        // comment rules entirely — the guarded store() above is reached only
        // through the project-nested route.
        abort_unless($task->isStandalone(), 404);

        // Everyone else was let straight through: this endpoint creates a
        // comment, stores whatever files came with it, and notifies the task's
        // assignees, all without asking who was calling. TaskPolicy::view is the
        // matching set for a standalone task — its creator, its assignee, its
        // collaborators, or someone who manages tasks globally.
        $this->authorize('view', $task);

        $comment = $task->comments()->create([
            'user_id' => $request->user()->id,
            'body' => $request->body ?? '',
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

        $this->notifyMentionedUsers($comment, $task, $request->user());
        $this->notifyAssignees($comment, $task, $request->user());

        $comment->load('user', 'attachments');
        broadcast(new TaskCommentCreated($task->id, [
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
                'download_url' => $a->url,
                'is_image' => str_starts_with($a->file_type, 'image/'),
                'is_video' => str_starts_with($a->file_type, 'video/'),
            ])->toArray(),
            'created_at' => $comment->created_at->toIso8601String(),
        ]))->toOthers();

        return back()->with('success', 'Comment added.');
    }

    public function downloadStandalone(Request $request, Task $task, TaskComment $comment, CommentAttachment $attachment): StreamedResponse
    {
        if ($attachment->task_comment_id !== $comment->id) {
            abort(404);
        }

        $this->authorize('view', $task);

        return $attachment->toDownloadResponse();
    }

    public function updateStandalone(Request $request, Task $task, TaskComment $comment): RedirectResponse
    {
        if ($comment->task_id !== $task->id) {
            abort(404);
        }

        if ($comment->user_id !== $request->user()->id) {
            abort(403);
        }

        $request->validate([
            'body' => ['required', 'string', new CommentLength],
        ]);

        $comment->update(['body' => $request->body]);

        broadcast(new TaskCommentUpdated(
            $task->id,
            $comment->id,
            $comment->body,
            $comment->updated_at->toIso8601String(),
            $request->user()->id,
        ))->toOthers();

        return back()->with('success', 'Comment updated.');
    }

    public function destroyStandalone(Request $request, Task $task, TaskComment $comment): RedirectResponse
    {
        if ($comment->task_id !== $task->id) {
            abort(404);
        }

        if ($comment->user_id !== $request->user()->id && ! $request->user()->hasRole('admin')) {
            abort(403);
        }

        $this->notifyMentionedUsersOfDeletion($comment, $task, $request->user());

        foreach ($comment->attachments as $attachment) {
            Storage::disk(CommentAttachment::DISK)->delete($attachment->file_path);
        }
        Storage::disk(CommentAttachment::DISK)->deleteDirectory("comment-attachments/{$comment->id}");

        $commentId = $comment->id;
        $comment->delete();

        broadcast(new TaskCommentDeleted($task->id, $commentId, $request->user()->id))->toOthers();

        return back()->with('success', 'Comment deleted.');
    }

    private function notifyMentionedUsersOfDeletion(TaskComment $comment, Task $task, User $deletedBy): void
    {
        $body = $comment->body;
        $task->loadMissing('project');

        $mentionedIds = [];
        if (preg_match_all('/data-id="(\d+)"/', $body, $matches)) {
            $mentionedIds = array_map('intval', $matches[1]);
        }

        $mentionedUsers = User::where('is_active', true)
            ->where('id', '!=', $deletedBy->id)
            ->get()
            ->filter(fn (User $user) => in_array($user->id, $mentionedIds) || str_contains($body, '@' . $user->name));

        $preview = Str::limit(strip_tags($body), 100);

        foreach ($mentionedUsers as $user) {
            $user->notify(new CommentDeletedNotification($task, $deletedBy, $preview));
        }
    }
}
