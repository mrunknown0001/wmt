<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskCommentPaginationController extends Controller
{
    public function comments(Request $request, Project $project, Task $task): JsonResponse
    {
        $request->validate([
            'before_id' => ['nullable', 'integer'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $limit = $request->integer('limit', 20);
        $beforeId = $request->input('before_id');

        $query = $task->comments()
            ->with('user:id,name', 'attachments')
            ->orderBy('id', 'desc')
            ->limit($limit + 1);

        if ($beforeId) {
            $query->where('id', '<', $beforeId);
        }

        $comments = $query->get();
        $hasMore = $comments->count() > $limit;
        $comments = $comments->take($limit);

        return response()->json([
            'comments' => $comments->map(fn ($c) => [
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
                    'is_video' => $a->isVideo(),
                ]),
            ]),
            'has_more' => $hasMore,
        ]);
    }

    public function standaloneComments(Request $request, Task $task): JsonResponse
    {
        $request->validate([
            'before_id' => ['nullable', 'integer'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $limit = $request->integer('limit', 20);
        $beforeId = $request->input('before_id');

        $query = $task->comments()
            ->with('user:id,name', 'attachments')
            ->orderBy('id', 'desc')
            ->limit($limit + 1);

        if ($beforeId) {
            $query->where('id', '<', $beforeId);
        }

        $comments = $query->get();
        $hasMore = $comments->count() > $limit;
        $comments = $comments->take($limit);

        return response()->json([
            'comments' => $comments->map(fn ($c) => [
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
                    'download_url' => url("/api/tasks/{$task->id}/comments/{$c->id}/attachments/{$a->id}/download"),
                    'is_image' => $a->isImage(),
                    'is_video' => $a->isVideo(),
                ]),
            ]),
            'has_more' => $hasMore,
        ]);
    }

    public function standaloneActivities(Request $request, Task $task): JsonResponse
    {
        $request->validate([
            'before_id' => ['nullable', 'integer'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $limit = $request->integer('limit', 20);
        $beforeId = $request->input('before_id');

        $query = $task->activities()
            ->with('user:id,name')
            ->orderBy('id', 'desc')
            ->limit($limit + 1);

        if ($beforeId) {
            $query->where('id', '<', $beforeId);
        }

        $activities = $query->get();
        $hasMore = $activities->count() > $limit;
        $activities = $activities->take($limit);

        return response()->json([
            'activities' => $activities->map(fn ($a) => [
                'id' => $a->id,
                'field' => $a->field,
                'old_value' => $a->old_value,
                'new_value' => $a->new_value,
                'description' => $a->description,
                'user' => $a->user ? ['id' => $a->user->id, 'name' => $a->user->name] : null,
                'created_at' => $a->created_at->toIso8601String(),
            ]),
            'has_more' => $hasMore,
        ]);
    }

    public function activities(Request $request, Project $project, Task $task): JsonResponse
    {
        $request->validate([
            'before_id' => ['nullable', 'integer'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $limit = $request->integer('limit', 20);
        $beforeId = $request->input('before_id');

        $query = $task->activities()
            ->with('user:id,name')
            ->orderBy('id', 'desc')
            ->limit($limit + 1);

        if ($beforeId) {
            $query->where('id', '<', $beforeId);
        }

        $activities = $query->get();
        $hasMore = $activities->count() > $limit;
        $activities = $activities->take($limit);

        return response()->json([
            'activities' => $activities->map(fn ($a) => [
                'id' => $a->id,
                'field' => $a->field,
                'old_value' => $a->old_value,
                'new_value' => $a->new_value,
                'description' => $a->description,
                'user' => $a->user ? ['id' => $a->user->id, 'name' => $a->user->name] : null,
                'created_at' => $a->created_at->toIso8601String(),
            ]),
            'has_more' => $hasMore,
        ]);
    }
}
