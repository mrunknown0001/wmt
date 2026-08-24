<?php

namespace App\Http\Controllers;

use App\Models\Task;
use App\Services\TaskDependencyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskDependencyController extends Controller
{
    /** Add "this task waits on that one". */
    public function store(Request $request, Task $task): JsonResponse
    {
        $this->authorize('update', $task);

        $validated = $request->validate([
            'depends_on_task_id' => ['required', 'integer'],
        ]);

        // The service does the refusing — same project, no self-reference, no
        // cycle — so every caller gets the same rules.
        TaskDependencyService::add($task, (int) $validated['depends_on_task_id'], $request->user()?->id);

        return response()->json([
            'dependencies' => $task->fresh()->dependencies()
                ->get(['tasks.id', 'title', 'status'])
                ->all(),
        ]);
    }

    public function destroy(Task $task, Task $dependency): JsonResponse
    {
        $this->authorize('update', $task);

        TaskDependencyService::remove($task, $dependency->id);

        return response()->json([
            'dependencies' => $task->fresh()->dependencies()
                ->get(['tasks.id', 'title', 'status'])
                ->all(),
        ]);
    }
}
