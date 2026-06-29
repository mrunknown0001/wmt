<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskComment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class TaskCommentController extends Controller
{
    public function destroy(Request $request, Project $project, Task $task, TaskComment $comment): JsonResponse
    {
        if ($comment->user_id !== $request->user()->id && !$request->user()->hasRole('admin')) {
            abort(403);
        }

        foreach ($comment->attachments as $attachment) {
            Storage::disk('public')->delete($attachment->file_path);
        }
        Storage::disk('public')->deleteDirectory("comment-attachments/{$comment->id}");

        $comment->delete();

        return response()->json(null, 204);
    }
}
