<?php

namespace App\Http\Controllers;

use App\Models\CustomField;
use App\Models\Form;
use App\Models\Task;
use App\Models\TaskAttachment;
use App\Models\TaskCustomFieldValue;
use App\Rules\Turnstile;
use App\Services\ActivityLogger;
use App\Services\TaskActivityLogger;
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
                'logo_url' => $form->logo_path ? asset('storage/' . $form->logo_path) : null,
                'logo_position' => $form->logo_position ?? 'left',
                'banner_url' => $form->banner_path ? asset('storage/' . $form->banner_path) : null,
                'fields' => $form->fields->map(function ($field) {
                    $data = [
                        'id' => $field->id,
                        'type' => $field->type,
                        'label' => $field->label,
                        'help_text' => $field->help_text,
                        'is_required' => $field->is_required,
                        'config' => $field->config,
                        'maps_to' => $field->maps_to,
                        'default_value' => $field->default_value,
                        'is_visible' => $field->is_visible,
                        'conditions' => $field->conditions,
                    ];

                    // Include options for mapped select fields
                    if ($field->customField && in_array($field->customField->type, ['single_select', 'multi_select'])) {
                        $data['options'] = $field->customField->options->map(fn ($o) => [
                            'id' => $o->id,
                            'label' => $o->label,
                            'position' => $o->position,
                        ]);
                        $data['sort_mode'] = $field->customField->config['sort_mode'] ?? 'alphabetical';
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
        $submittedFields = $request->input('fields', []);
        $rules = [];
        foreach ($form->fields as $field) {
            if (in_array($field->type, ['heading', 'description'])) {
                continue;
            }

            // Skip validation for hidden fields (they use default values)
            if (!$field->is_visible) {
                continue;
            }

            // Skip validation for fields whose conditions are not met
            if (!$this->fieldConditionsMet($field, $form->fields, $submittedFields)) {
                continue;
            }

            $key = "fields.{$field->id}";

            if ($field->type === 'attachment') {
                if ($field->is_required) {
                    $rules[$key] = ['required', 'array', 'max:5'];
                    $rules["{$key}.*"] = ['file', 'mimes:jpg,jpeg,png,gif,bmp,webp,mp4,mov,avi,webm,xlsx,xls,csv', 'max:51200'];
                } else {
                    $rules[$key] = ['nullable', 'array', 'max:5'];
                    $rules["{$key}.*"] = ['file', 'mimes:jpg,jpeg,png,gif,bmp,webp,mp4,mov,avi,webm,xlsx,xls,csv', 'max:51200'];
                }
                continue;
            }

            $fieldRules = [];

            if ($field->is_required) {
                $fieldRules[] = 'required';
            } else {
                $fieldRules[] = 'nullable';
            }

            if ($field->type === 'email') {
                $fieldRules[] = 'string';
                $fieldRules[] = 'email';
                if (($field->config['email_mode'] ?? 'plain') === 'registered_user') {
                    $fieldRules[] = 'exists:users,email';
                    $fieldRules[] = function ($attribute, $value, $fail) {
                        $user = \App\Models\User::where('email', $value)->first();
                        if ($user && !$user->is_active) {
                            $fail('The selected user is inactive.');
                        }
                    };
                }
            } else {
                match ($field->type) {
                    'text', 'textarea' => $fieldRules[] = 'string',
                    'number' => $fieldRules[] = 'numeric',
                    'date' => $fieldRules[] = 'date',
                    'select' => $fieldRules[] = 'string',
                    'multi_select' => $fieldRules[] = 'array',
                    default => null,
                };
            }

            $rules[$key] = $fieldRules;
        }

        // Build custom error messages for email fields
        $messages = [];
        foreach ($form->fields as $field) {
            if ($field->type === 'email') {
                $messages["fields.{$field->id}.exists"] = 'No registered user found with this email address.';
                $messages["fields.{$field->id}.email"] = 'Please enter a valid email address.';
            }
        }

        $validated = $request->validate($rules, $messages);
        $fieldValues = $validated['fields'] ?? [];

        // Merge default values for hidden fields
        foreach ($form->fields as $field) {
            if (in_array($field->type, ['heading', 'description', 'attachment'])) {
                continue;
            }
            if (!$field->is_visible && $field->default_value !== null) {
                $fieldValues[$field->id] = $field->default_value;
            }
        }

        // Build task data
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

        // Build task title from selected fields
        $titleFieldIds = $defaults['title_field_ids'] ?? [];
        if (!empty($titleFieldIds)) {
            $titleParts = [];
            foreach ($form->fields as $field) {
                if (in_array($field->position, $titleFieldIds)) {
                    $val = $fieldValues[$field->id] ?? null;
                    if ($val === null || $val === '') continue;

                    // Resolve option IDs to labels for select/multi_select fields
                    if (in_array($field->type, ['select', 'multi_select'])) {
                        $val = $this->resolveOptionLabels($field, $val);
                    }

                    $titleParts[] = is_array($val) ? implode(', ', $val) : $val;
                }
            }
            if (!empty($titleParts)) {
                $taskData['title'] = implode(', ', $titleParts);
            }
        }

        // Map form field values to task properties and custom fields
        $customFieldMappings = [];

        foreach ($form->fields as $field) {
            if (in_array($field->type, ['heading', 'description', 'attachment'])) {
                continue;
            }

            // Skip mapping for fields whose conditions are not met
            if (!$this->fieldConditionsMet($field, $form->fields, $submittedFields)) {
                continue;
            }

            $value = $fieldValues[$field->id] ?? null;
            if ($value === null || $value === '') {
                continue;
            }

            if ($field->maps_to === 'description') {
                $taskData['description'] = $value;
            } elseif ($field->maps_to === 'assignee' && $field->type === 'email') {
                $assigneeUser = \App\Models\User::where('email', $value)
                    ->where('is_active', true)
                    ->first();
                if ($assigneeUser) {
                    $taskData['assigned_to'] = $assigneeUser->id;
                }
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

        // Log activity for form submission
        $submittedAt = now()->format('M d, Y h:i A');
        $formDescription = "submitted via form \"{$form->name}\" on {$submittedAt}";
        TaskActivityLogger::logCreated($task, null, $formDescription);
        ActivityLogger::logCreated($task, null, $formDescription);

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

        // Handle file attachments
        foreach ($form->fields as $field) {
            if ($field->type !== 'attachment') {
                continue;
            }

            $files = $request->file("fields.{$field->id}", []);
            if (!is_array($files)) {
                $files = [$files];
            }

            foreach ($files as $file) {
                if (!$file || !$file->isValid()) {
                    continue;
                }

                $path = $file->store('form-attachments', 'public');

                TaskAttachment::create([
                    'task_id' => $task->id,
                    'file_name' => $file->getClientOriginalName(),
                    'file_path' => $path,
                    'file_type' => $file->getMimeType(),
                    'file_size' => $file->getSize(),
                ]);
            }
        }

        return Inertia::render('Forms/PublicFormSuccess', [
            'form' => [
                'name' => $form->name,
                'success_message' => $form->success_message,
                'project_name' => $form->project->name,
            ],
        ]);
    }

    private function fieldConditionsMet($field, $allFields, array $submittedValues, array &$visited = []): bool
    {
        $conditions = $field->conditions;
        if (empty($conditions) || empty($conditions['rules'])) {
            return true;
        }

        // Circular reference protection
        if (in_array($field->id, $visited)) {
            return true;
        }
        $visited[] = $field->id;

        $logic = $conditions['logic'] ?? 'all';
        $results = [];

        foreach ($conditions['rules'] as $rule) {
            $refFieldId = $rule['field_id'] ?? null;
            if (!$refFieldId) {
                $results[] = true;
                continue;
            }

            $refField = $allFields->firstWhere('id', $refFieldId);
            if (!$refField) {
                $results[] = true;
                continue;
            }

            // Check if the referenced field itself is visible (recursive)
            if (!$this->fieldConditionsMet($refField, $allFields, $submittedValues, $visited)) {
                $results[] = false;
                continue;
            }

            $submittedValue = $submittedValues[$refFieldId] ?? null;
            $operator = $rule['operator'] ?? 'equals';
            $expectedValue = $rule['value'] ?? null;

            $met = match ($operator) {
                'equals' => (string) ($submittedValue ?? '') === (string) ($expectedValue ?? ''),
                'not_equals' => (string) ($submittedValue ?? '') !== (string) ($expectedValue ?? ''),
                'contains' => is_string($submittedValue) && str_contains($submittedValue, (string) ($expectedValue ?? '')),
                'is_empty' => $submittedValue === null || $submittedValue === '' || (is_array($submittedValue) && empty($submittedValue)),
                'is_not_empty' => $submittedValue !== null && $submittedValue !== '' && !(is_array($submittedValue) && empty($submittedValue)),
                default => true,
            };

            $results[] = $met;
        }

        if (empty($results)) {
            return true;
        }

        return $logic === 'all' ? !in_array(false, $results, true) : in_array(true, $results, true);
    }

    private function resolveOptionLabels($field, $val): string|array
    {
        // Build option ID → label map
        $optionMap = [];
        if ($field->customField && $field->customField->options) {
            foreach ($field->customField->options as $opt) {
                $optionMap[(string) $opt->id] = $opt->label;
            }
        } elseif (!empty($field->config['options'])) {
            foreach ($field->config['options'] as $opt) {
                $key = (string) ($opt['id'] ?? $opt['value'] ?? '');
                $optionMap[$key] = $opt['label'] ?? $key;
            }
        }

        if (is_array($val)) {
            return array_map(fn ($v) => $optionMap[(string) $v] ?? $v, $val);
        }

        return $optionMap[(string) $val] ?? $val;
    }
}
