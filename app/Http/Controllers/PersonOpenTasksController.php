<?php

namespace App\Http\Controllers;

use App\Models\Task;
use App\Models\User;
use App\Services\OrgScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Everything one person currently has open.
 *
 * Two places count somebody's open tasks and draw a bar: the executive
 * dashboard's workload chart and the dashboard's Team Workload card. Both
 * raise the same question, so both ask it here rather than each carrying a
 * copy — and the answer is one query, which is what keeps a list from
 * disagreeing with the number above it.
 *
 * It does not live on either dashboard's controller for that reason: it belongs
 * to neither of them.
 */
class PersonOpenTasksController extends Controller
{
    public function __invoke(Request $request, User $user): JsonResponse
    {
        $viewer = $request->user();

        // Whether they oversee anybody at all. Whether they oversee this person
        // is the query below — a head asking about somebody in another branch
        // gets a 404 rather than a hint that the person exists.
        abort_unless(OrgScope::hasAnyScope($viewer), 403);

        $visible = OrgScope::seesEverything($viewer)
            || OrgScope::manageablePeopleIds($viewer)->contains($user->id);

        abort_unless($visible && $user->is_active, 404);

        $tasks = Task::query()
            ->where('assigned_to', $user->id)
            ->whereNotIn('status', ['done', 'cancelled'])
            ->with('project:id,name')
            // Overdue first, then what is due soonest; undated work last, since
            // it is the least pressing thing on somebody's plate today.
            ->orderByRaw('due_date IS NULL')
            ->orderBy('due_date')
            ->get(['id', 'title', 'status', 'priority', 'due_date', 'project_id', 'estimated_minutes']);

        return response()->json([
            'user' => ['id' => $user->id, 'name' => $user->name],
            'tasks' => $tasks->map(fn (Task $task) => [
                'id' => $task->id,
                'title' => $task->title,
                'status' => $task->status,
                'priority' => $task->priority,
                'due_date' => $task->due_date?->toDateString(),
                'estimated_minutes' => $task->estimated_minutes ? (int) $task->estimated_minutes : null,
                'project' => $task->project ? ['id' => $task->project->id, 'name' => $task->project->name] : null,
            ])->all(),
        ]);
    }
}
