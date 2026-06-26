<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use App\Models\TaskComment;
use App\Models\User;
use App\Notifications\CommentDeletedNotification;
use App\Notifications\TaskCommentMentionNotification;
use App\Notifications\TaskCommentNotification;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class TaskCommentController extends Controller
{
    public function store(Request $request, Project $project, Task $task): RedirectResponse
    {
        $request->validate([
            'body' => 'required|string|max:2000',
        ]);

        $comment = $task->comments()->create([
            'user_id' => $request->user()->id,
            'body' => $request->body,
        ]);

        $this->notifyMentionedUsers($comment, $task, $request->user());
        $this->notifyAssignees($comment, $task, $request->user());

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

    public function destroy(Request $request, Project $project, Task $task, TaskComment $comment): RedirectResponse
    {
        if ($comment->user_id !== $request->user()->id && ! $request->user()->hasRole('admin')) {
            abort(403);
        }

        $this->notifyMentionedUsersOfDeletion($comment, $task, $request->user());

        $comment->delete();

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
