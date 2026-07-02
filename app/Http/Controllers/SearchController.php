<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SearchController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $q = $request->input('q', '');

        if (strlen($q) < 2) {
            return response()->json(['projects' => [], 'tasks' => [], 'users' => []]);
        }

        $user = $request->user();
        $like = '%' . $q . '%';

        $projects = Project::where('name', 'like', $like)
            ->with('owner:id,name')
            ->select('id', 'name', 'status', 'owner_id')
            ->orderBy('updated_at', 'desc')
            ->take(5)
            ->get()
            ->map(fn ($p) => [
                'id' => $p->id,
                'name' => $p->name,
                'status' => $p->status,
                'owner' => $p->owner?->name,
                'url' => "/projects/{$p->id}",
            ]);

        $tasks = Task::where('title', 'like', $like)
            ->with('project:id,name')
            ->select('id', 'title', 'status', 'priority', 'project_id')
            ->orderBy('updated_at', 'desc')
            ->take(5)
            ->get()
            ->map(fn ($t) => [
                'id' => $t->id,
                'title' => $t->title,
                'status' => $t->status,
                'priority' => $t->priority,
                'project_name' => $t->project?->name,
                'url' => $t->project_id ? "/projects/{$t->project_id}" : "/tasks/{$t->id}/edit",
            ]);

        $users = collect();
        if ($user->can('view-users')) {
            $users = User::where(function ($query) use ($like) {
                $query->where('name', 'like', $like)
                    ->orWhere('email', 'like', $like);
            })
                ->select('id', 'name', 'email', 'position')
                ->where('is_active', true)
                ->orderBy('name')
                ->take(5)
                ->get()
                ->map(fn ($u) => [
                    'id' => $u->id,
                    'name' => $u->name,
                    'email' => $u->email,
                    'position' => $u->position,
                    'url' => "/users",
                ]);
        }

        return response()->json([
            'projects' => $projects,
            'tasks' => $tasks,
            'users' => $users,
        ]);
    }
}
