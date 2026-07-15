<?php

namespace App\Services;

use App\Models\CustomField;
use App\Models\Task;
use App\Models\TaskCustomFieldValue;

class CustomFieldDefaults
{
    /**
     * Fill the project's custom field defaults on a newly created task.
     *
     * Fields that already have a value record on the task are skipped, as are
     * fields whose IDs are in $providedFieldIds (fields the user explicitly
     * submitted — even with an empty value — e.g. a cleared prefill).
     */
    public static function apply(Task $task, array $providedFieldIds = []): void
    {
        if (!$task->project_id) {
            return;
        }

        $fields = CustomField::where('project_id', $task->project_id)
            ->where('type', '!=', 'formula')
            ->whereNotNull('config')
            ->with('options:id,custom_field_id')
            ->get()
            ->filter(function ($field) {
                $default = $field->config['default_value'] ?? null;

                return $default !== null && $default !== '' && !(is_array($default) && empty($default));
            });

        if ($fields->isEmpty()) {
            return;
        }

        $existingFieldIds = TaskCustomFieldValue::where('task_id', $task->id)
            ->pluck('custom_field_id')
            ->all();

        foreach ($fields as $field) {
            if (in_array($field->id, $existingFieldIds) || in_array($field->id, array_map('intval', $providedFieldIds))) {
                continue;
            }

            $default = $field->config['default_value'];

            // Skip defaults pointing at options that no longer exist
            if ($field->type === 'single_select') {
                if (!$field->options->contains('id', (int) $default)) {
                    continue;
                }
            } elseif ($field->type === 'multi_select') {
                $optionIds = $field->options->pluck('id')->all();
                $default = array_values(array_intersect(array_map('intval', (array) $default), $optionIds));
                if (empty($default)) {
                    continue;
                }
            }

            $cfv = new TaskCustomFieldValue([
                'task_id' => $task->id,
                'custom_field_id' => $field->id,
            ]);
            $cfv->setTypedValue($field->type, $default);
            $cfv->save();
        }
    }
}
