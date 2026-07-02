<?php

namespace App\Http\Controllers;

use App\Models\CustomField;
use App\Models\Form;
use App\Models\Task;
use App\Models\TaskCustomFieldValue;
use App\Rules\Turnstile;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class PublicFormController extends Controller
{
    public function show(string $uuid): Response
    {
        $form = Form::where('uuid', $uuid)
            ->where('is_active', true)
            ->with(['fields' => function ($q) {
                $q->orderBy('position');
            }, 'fields.customField.options', 'project:id,name'])
            ->firstOrFail();

        return Inertia::render('Forms/PublicForm', [
            'form' => [
                'uuid' => $form->uuid,
                'name' => $form->name,
                'description' => $form->description,
                'submit_button_text' => $form->submit_button_text,
                'project_name' => $form->project->name,
                'fields' => $form->fields->map(function ($field) {
                    $data = [
                        'id' => $field->id,
                        'type' => $field->type,
                        'label' => $field->label,
                        'help_text' => $field->help_text,
                        'is_required' => $field->is_required,
                        'config' => $field->config,
                        'maps_to' => $field->maps_to,
                    ];

                    // Include options for mapped select fields
                    if ($field->customField && in_array($field->customField->type, ['single_select', 'multi_select'])) {
                        $data['options'] = $field->customField->options->map(fn ($o) => [
                            'id' => $o->id,
                            'label' => $o->label,
                        ]);
                    } elseif (in_array($field->type, ['select', 'multi_select']) && !empty($field->config['options'])) {
                        $data['options'] = $field->config['options'];
                    }

                    return $data;
                }),
            ],
            'turnstile' => [
                'enabled' => (bool) config('services.turnstile.enabled'),
                'siteKey' => config('services.turnstile.site_key'),
            ],
        ]);
    }

    public function submit(string $uuid, Request $request)
    {
        $form = Form::where('uuid', $uuid)
            ->where('is_active', true)
            ->with(['fields.customField', 'project'])
            ->firstOrFail();

        // Validate Turnstile
        if (config('services.turnstile.enabled')) {
            $request->validate([
                'cf_turnstile_response' => ['required', 'string', new Turnstile],
            ]);
        }

        // Build dynamic validation rules
        $rules = [];
        foreach ($form->fields as $field) {
            if (in_array($field->type, ['heading', 'description'])) {
                continue;
            }

            $fieldRules = [];
            $key = "fields.{$field->id}";

            if ($field->is_required) {
                $fieldRules[] = 'required';
            } else {
                $fieldRules[] = 'nullable';
            }

            match ($field->type) {
                'text', 'textarea' => $fieldRules[] = 'string',
                'number' => $fieldRules[] = 'numeric',
                'date' => $fieldRules[] = 'date',
                'select' => $fieldRules[] = 'string',
                'multi_select' => $fieldRules[] = 'array',
                default => null,
            };

            $rules[$key] = $fieldRules;
        }

        $validated = $request->validate($rules);
        $fieldValues = $validated['fields'] ?? [];

        // Build task data from defaults
        $defaults = $form->task_defaults ?? [];
        $taskData = [
            'project_id' => $form->project_id,
            'title' => $form->name . ' - ' . now()->format('M d, Y H:i'),
            'status' => $defaults['status'] ?? 'to_do',
            'priority' => $defaults['priority'] ?? 'medium',
            'assigned_to' => $defaults['assigned_to'] ?? null,
            'section_id' => $defaults['section_id'] ?? null,
            'created_by' => null,
        ];

        // Map form field values to task properties and custom fields
        $customFieldMappings = [];

        foreach ($form->fields as $field) {
            if (in_array($field->type, ['heading', 'description'])) {
                continue;
            }

            $value = $fieldValues[$field->id] ?? null;
            if ($value === null || $value === '') {
                continue;
            }

            if ($field->maps_to === 'title') {
                $taskData['title'] = $value;
            } elseif ($field->maps_to === 'description') {
                $taskData['description'] = $value;
            } elseif ($field->maps_to === 'custom_field' && $field->custom_field_id) {
                $customFieldMappings[$field->custom_field_id] = $value;
            }
        }

        // Calculate position
        $maxPosition = Task::where('project_id', $form->project_id)
            ->where('status', $taskData['status'])
            ->max('position') ?? -1;
        $taskData['position'] = $maxPosition + 1;

        // Create the task
        $task = Task::create($taskData);

        // Create custom field values
        foreach ($customFieldMappings as $fieldId => $value) {
            $customField = CustomField::where('id', $fieldId)
                ->where('project_id', $form->project_id)
                ->first();

            if (!$customField) {
                continue;
            }

            $cfv = new TaskCustomFieldValue([
                'task_id' => $task->id,
                'custom_field_id' => $fieldId,
            ]);
            $cfv->setTypedValue($customField->type, $value);
            $cfv->save();
        }

        return Inertia::render('Forms/PublicFormSuccess', [
            'form' => [
                'name' => $form->name,
                'success_message' => $form->success_message,
                'project_name' => $form->project->name,
            ],
        ]);
    }
}
