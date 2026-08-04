<?php

namespace App\Http\Controllers;

use App\Models\Task;
use App\Models\TaskTimeLog;
use App\Services\TimeTracker;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class TaskTimeLogController extends Controller
{
    /** Entries on a task, newest first, with the running one flagged. */
    public function index(Request $request, Task $task): JsonResponse
    {
        $this->authorize('view', $task);

        $logs = $task->timeLogs()->with('user:id,name')->latest('logged_on')->latest('id')->get();

        return response()->json([
            'logs' => $logs->map(fn (TaskTimeLog $log) => $this->payload($log)),
            'total_minutes' => $task->loggedMinutes(),
            'estimated_minutes' => $task->estimated_minutes,
        ]);
    }

    public function store(Request $request, Task $task): JsonResponse
    {
        // Logging work is part of doing the task, so anyone who can update it
        // can record time against it.
        $this->authorize('update', $task);

        $data = $request->validate([
            'duration' => ['required', 'string', 'max:20'],
            'logged_on' => ['nullable', 'date'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $minutes = TimeTracker::parseMinutes($data['duration']);

        if ($minutes === null) {
            throw ValidationException::withMessages([
                'duration' => 'Enter a duration like 1.5, 1:30 or 90m.',
            ]);
        }

        $log = TimeTracker::log(
            $task,
            $request->user(),
            $minutes,
            $data['logged_on'] ?? null,
            $data['note'] ?? null,
        );

        return response()->json([
            'log' => $this->payload($log->load('user:id,name')),
            'total_minutes' => $task->loggedMinutes(),
        ], 201);
    }

    public function startTimer(Request $request, Task $task): JsonResponse
    {
        $this->authorize('update', $task);

        $result = TimeTracker::start($task, $request->user());

        return response()->json([
            'running' => $this->payload($result['started']->load('user:id,name', 'task:id,title,project_id')),
            'stopped' => $result['stopped']
                ? $this->payload($result['stopped']->load('task:id,title,project_id'))
                : null,
        ]);
    }

    public function stopTimer(Request $request): JsonResponse
    {
        $stopped = TimeTracker::stop($request->user());

        return response()->json([
            'stopped' => $stopped ? $this->payload($stopped->load('task:id,title,project_id')) : null,
            'total_minutes' => $stopped?->task?->loggedMinutes(),
        ]);
    }

    /** What the header timer polls for on page load. */
    public function current(Request $request): JsonResponse
    {
        $running = TimeTracker::running($request->user());

        return response()->json([
            'running' => $running ? $this->payload($running->load('task:id,title,project_id')) : null,
        ]);
    }

    public function destroy(Request $request, TaskTimeLog $timeLog): JsonResponse
    {
        // Your own entries, or anyone's if you can manage the project's tasks —
        // a supervisor correcting a mis-key is the normal case.
        $ownsIt = (int) $timeLog->user_id === (int) $request->user()->id;

        abort_unless($ownsIt || $request->user()->can('update', $timeLog->task), 403);

        $task = $timeLog->task;
        $timeLog->delete();

        return response()->json(['total_minutes' => $task?->loggedMinutes() ?? 0]);
    }

    private function payload(TaskTimeLog $log): array
    {
        return [
            'id' => $log->id,
            'task_id' => $log->task_id,
            'task_title' => $log->relationLoaded('task') ? $log->task?->title : null,
            // Carried so the header indicator can link straight to the task.
            'project_id' => $log->relationLoaded('task') ? $log->task?->project_id : null,
            'user' => $log->relationLoaded('user') ? $log->user?->name : null,
            'user_id' => $log->user_id,
            'minutes' => $log->minutes,
            'duration' => TimeTracker::formatMinutes($log->minutes),
            'running' => $log->isRunning(),
            'started_at' => $log->started_at?->toIso8601String(),
            'logged_on' => $log->logged_on?->toDateString(),
            'note' => $log->note,
        ];
    }
}
