<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use App\Models\TaskComment;
use App\Models\User;
use App\Notifications\CommentDeletedNotification;
use App\Notifications\TaskCommentMentionNotification;
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

        return back()->with('success', 'Comment added.');
    }

    private function notifyMentionedUsers(TaskComment $comment, Task $task, User $author): void
    {
        $body = $comment->body;

        // Find mentioned users by checking if their name appears after @ in the body
        $task->loadMissing('project');

        $mentionedUsers = User::where('is_active', true)
            ->where('id', '!=', $author->id)
            ->get()
            ->filter(fn (User $user) => str_contains($body, '@' . $user->name));

        foreach ($mentionedUsers as $user) {
            $user->notify(new TaskCommentMentionNotification($task, $author, $comment));
        }
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

        $mentionedUsers = User::where('is_active', true)
            ->where('id', '!=', $deletedBy->id)
            ->get()
            ->filter(fn (User $user) => str_contains($body, '@' . $user->name));

        $preview = Str::limit($body, 100);

        foreach ($mentionedUsers as $user) {
            $user->notify(new CommentDeletedNotification($task, $deletedBy, $preview));
        }
    }
}
