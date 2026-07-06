<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        if (!$request->user()->hasRole('admin')) {
            abort(403);
        }

        $search = $request->input('search');
        $projectId = $request->input('project_id');

        $query = ActivityLog::with('user:id,name')
            ->orderBy('created_at', 'desc');

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('entity_name', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%")
                  ->orWhere('field', 'like', "%{$search}%");
            });
        }

        if ($projectId) {
            $query->where(function ($q) use ($projectId) {
                $q->where(function ($sub) use ($projectId) {
                    $sub->where('entity_type', 'project')
                        ->where('entity_id', $projectId);
                })->orWhere(function ($sub) use ($projectId) {
                    $sub->where('entity_type', 'task')
                        ->whereIn('entity_id', function ($taskQuery) use ($projectId) {
                            $taskQuery->select('id')
                                ->from('tasks')
                                ->where('project_id', $projectId);
                        });
                });
            });
        }

        $activities = $query->paginate(30)->withQueryString();

        $activities->getCollection()->transform(fn ($entry) => [
            'id' => $entry->id,
            'description' => $entry->description,
            'field' => $entry->field,
            'old_value' => $entry->old_value,
            'new_value' => $entry->new_value,
            'user' => $entry->user ? ['id' => $entry->user->id, 'name' => $entry->user->name] : null,
            'task' => $entry->entity_type === 'task' ? [
                'id' => $entry->entity_id,
                'title' => $entry->entity_name,
                'project_id' => \App\Models\Task::where('id', $entry->entity_id)->value('project_id'),
            ] : null,
            'project_name' => $this->resolveProjectName($entry),
            'created_at' => $entry->created_at->toIso8601String(),
        ]);

        return response()->json($activities);
    }

    private function resolveProjectName(ActivityLog $entry): ?string
    {
        if ($entry->entity_type === 'project') {
            return $entry->entity_name;
        }

        if ($entry->entity_type === 'task') {
            return \App\Models\Task::where('id', $entry->entity_id)
                ->with('project:id,name')
                ->first()
                ?->project
                ?->name;
        }

        return null;
    }
}
