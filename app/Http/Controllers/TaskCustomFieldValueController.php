<?php

namespace App\Http\Controllers;

use App\Models\CustomField;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskCustomFieldValue;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskCustomFieldValueController extends Controller
{
    public function update(Request $request, Project $project, Task $task): JsonResponse
    {
        abort_if($task->project_id !== $project->id, 404);

        $request->validate([
            'values' => ['required', 'array'],
        ]);

        foreach ($request->input('values') as $fieldId => $rawValue) {
            $customField = CustomField::where('id', $fieldId)
                ->where('project_id', $project->id)
                ->first();

            if (!$customField) {
                continue;
            }

            $cfv = TaskCustomFieldValue::updateOrCreate(
                ['task_id' => $task->id, 'custom_field_id' => $fieldId],
            );
            $cfv->setTypedValue($customField->type, $rawValue);
            $cfv->save();
        }

        return response()->json([
            'values' => $task->customFieldValues()->get()->keyBy('custom_field_id'),
        ]);
    }
}
