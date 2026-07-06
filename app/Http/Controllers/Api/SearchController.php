<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SearchController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $q = $request->input('q', '');

        if (strlen($q) < 2) {
            return response()->json(['projects' => [], 'tasks' => []]);
        }

        $user = $request->user();
        $like = '%' . $q . '%';

        $projects = Project::where('name', 'like', $like)
            ->select('id', 'name', 'status')
            ->orderBy('updated_at', 'desc')
            ->take(20)
            ->get()
            ->map(fn ($p) => [
                'id' => $p->id,
                'name' => $p->name,
                'status' => $p->status,
            ]);

        $tasks = Task::where('title', 'like', $like)
            ->with('project:id,name')
            ->select('id', 'title', 'status', 'priority', 'project_id', 'due_date')
            ->orderBy('updated_at', 'desc')
            ->take(20)
            ->get()
            ->map(fn ($t) => [
                'id' => $t->id,
                'title' => $t->title,
                'project_id' => $t->project_id,
                'project_name' => $t->project?->name,
                'status' => $t->status,
                'priority' => $t->priority,
                'due_date' => $t->due_date?->toIso8601String(),
            ]);

        return response()->json([
            'projects' => $projects,
            'tasks' => $tasks,
        ]);
    }
}
