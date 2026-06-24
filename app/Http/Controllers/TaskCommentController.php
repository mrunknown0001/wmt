<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use App\Models\TaskComment;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class TaskCommentController extends Controller
{
    public function store(Request $request, Project $project, Task $task): RedirectResponse
    {
        $request->validate([
            'body' => 'required|string|max:2000',
        ]);

        $task->comments()->create([
            'user_id' => $request->user()->id,
            'body' => $request->body,
        ]);

        return back()->with('success', 'Comment added.');
    }

    public function destroy(Request $request, Project $project, Task $task, TaskComment $comment): RedirectResponse
    {
        if ($comment->user_id !== $request->user()->id && ! $request->user()->hasRole('admin')) {
            abort(403);
        }

        $comment->delete();

        return back()->with('success', 'Comment deleted.');
    }
}
