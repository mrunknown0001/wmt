<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateTaskMinutesRequest;
use App\Models\Task;
use App\Models\TaskMinute;
use Illuminate\Http\JsonResponse;

/**
 * Minutes for a meeting task.
 *
 * Keyed on the task alone rather than nested under a project, because a meeting
 * can be a standalone task as easily as a project one and the record is the
 * same either way.
 */
class TaskMinutesController extends Controller
{
    public function update(UpdateTaskMinutesRequest $request, Task $task): JsonResponse
    {
        // Minutes belong to meetings. Refusing here rather than quietly writing
        // them keeps a stray request from leaving an orphan record attached to
        // an ordinary task, where nothing would ever show it again.
        if (!$task->isMeeting()) {
            return response()->json([
                'message' => 'Only a meeting task keeps minutes.',
            ], 422);
        }

        $minutes = $task->minutes()->firstOrNew([]);
        $minutes->fill($request->validated());
        $minutes->updated_by = $request->user()->id;
        $task->minutes()->save($minutes);

        $task->load('minutes.facilitator:id,name', 'minutes.preparedBy:id,name', 'minutes.reviewedBy:id,name', 'minutes.updatedBy:id,name');

        return response()->json([
            'minutes' => $task->minutes,
            'updated_by' => $task->minutes->updatedBy?->name,
            'updated_at' => $task->minutes->updated_at?->toIso8601String(),
        ]);
    }
}
