<?php

namespace App\Http\Controllers;

use App\Models\ApprovalForm;
use App\Services\ApprovalWorkflowEngine;
use Illuminate\Http\Request;
use Inertia\Inertia;

class PublicApprovalFormController extends Controller
{
    public function show(string $uuid)
    {
        $form = ApprovalForm::where('uuid', $uuid)
            ->where('is_active', true)
            ->first();

        abort_if(!$form, 404);

        $fields = $form->fields()
            ->where('is_visible', true)
            ->get()
            ->map(function ($field) {
                $data = $field->toArray();
                if ($field->custom_field_id && $field->customField) {
                    $data['options'] = $field->customField->options;
                } elseif ($field->config['options'] ?? null) {
                    $data['options'] = $field->config['options'];
                }
                return $data;
            });

        return Inertia::render('ApprovalForms/PublicForm', [
            'form' => $form,
            'fields' => $fields,
            'csrf_token' => csrf_token(),
            'turnstile' => [
                'enabled' => config('services.turnstile.enabled', false),
                'siteKey' => config('services.turnstile.site_key'),
            ],
        ]);
    }

    public function submit(Request $request, string $uuid)
    {
        $form = ApprovalForm::where('uuid', $uuid)
            ->where('is_active', true)
            ->first();

        abort_if(!$form, 404);

        // Validate Turnstile if enabled
        if (config('services.turnstile.enabled')) {
            $request->validate([
                'cf_turnstile_response' => ['required', new \App\Rules\Turnstile()],
            ]);
        }

        // Build dynamic validation rules
        $rules = [];
        $allFields = $form->fields()->get();

        foreach ($allFields as $field) {
            if (in_array($field->type, \App\Models\ApprovalFormField::STATIC_TYPES)) {
                continue;
            }

            if (!$field->is_visible || !$this->fieldConditionsMet($field, $request->all(), $allFields)) {
                continue;
            }

            $fieldRuleStr = '';

            if ($field->is_required) {
                $fieldRuleStr = 'required';
            } else {
                $fieldRuleStr = 'nullable';
            }

            $typeRules = match ($field->type) {
                'text', 'email' => 'string|max:255',
                'textarea' => 'string|max:10000',
                'number' => 'numeric',
                'date' => 'date',
                'select' => 'string',
                'multi_select' => 'array',
                'attachment' => 'file|max:52428800|mimes:pdf,doc,docx,xls,xlsx,zip',
                'capture_photo' => 'file|max:52428800|mimes:jpeg,jpg,png',
                'capture_video' => 'file|max:104857600|mimes:mp4,webm,mov',
                default => '',
            };

            if ($typeRules) {
                $fieldRuleStr .= '|' . $typeRules;
            }

            if ($fieldRuleStr) {
                $rules["field_{$field->id}"] = $fieldRuleStr;
            }
        }

        $validated = $request->validate($rules);

        // Merge defaults for hidden fields
        foreach ($allFields as $field) {
            if ($field->is_visible && $field->default_value !== null) {
                if (!isset($validated["field_{$field->id}"])) {
                    $validated["field_{$field->id}"] = $field->default_value;
                }
            }
        }

        // Build item data and custom field mappings
        $itemData = [];
        $itemDefaults = $form->item_defaults ?? [];
        $itemData['status'] = $itemDefaults['status'] ?? 'pending';
        $itemData['title'] = "{$form->name} - " . now()->format('Y-m-d H:i');

        $customFieldMappings = [];
        $titleFieldValues = [];
        $submitterEmail = null;

        foreach ($allFields as $field) {
            $fieldKey = "field_{$field->id}";
            $value = $validated[$fieldKey] ?? null;

            if (!$field->is_visible || !$this->fieldConditionsMet($field, $validated, $allFields)) {
                continue;
            }

            if ($field->type === 'heading' || $field->type === 'description') {
                continue;
            }

            // Capture email for requester detection
            if ($field->type === 'email' && !$submitterEmail) {
                $submitterEmail = $value;
            }

            // Map to item description
            if ($field->maps_to === 'description') {
                $itemData['description'] = $value;
            }

            // Map to custom field
            if ($field->maps_to === 'custom_field' && $field->custom_field_id) {
                $customFieldMappings[$field->custom_field_id] = $value;
            }

            // Collect for title building
            if (in_array((int) $field->position, $itemDefaults['title_field_ids'] ?? [])) {
                $titleFieldValues[] = $this->resolveOptionLabel($field, $value);
            }
        }

        // Auto-detect requester from email field
        if ($submitterEmail) {
            $requester = \App\Models\User::where('email', $submitterEmail)->first();
            if ($requester) {
                $itemData['requested_by'] = $requester->id;
            }
        }

        // Build final title from title fields
        if (!empty($titleFieldValues)) {
            $itemData['title'] = implode(' - ', array_filter($titleFieldValues));
        }

        // Create the approval item
        $item = $form->approvalProject->approvalItems()->create($itemData);

        // Store custom field values
        foreach ($customFieldMappings as $customFieldId => $value) {
            $customField = $form->approvalProject->customFields()->find($customFieldId);
            if ($customField && $customField->type !== 'formula') {
                $cfv = $item->customFieldValues()->create([
                    'approval_custom_field_id' => $customFieldId,
                ]);
                $cfv->setTypedValue($customField->type, $value);
                $cfv->save();
            }
        }

        // Handle file uploads (attachments, photos, videos)
        foreach ($allFields as $field) {
            if (!in_array($field->type, \App\Models\ApprovalFormField::FILE_TYPES)) {
                continue;
            }

            $fieldKey = "field_{$field->id}";
            if ($request->hasFile($fieldKey)) {
                foreach ($request->file($fieldKey) as $file) {
                    $path = $file->store("approval-form-submissions/{$item->id}", 'public');
                    $item->attachments()->create([
                        'file_name' => $file->getClientOriginalName(),
                        'file_path' => $path,
                        'file_type' => $file->getClientMimeType(),
                        'file_size' => $file->getSize(),
                    ]);
                }
            }
        }

        // Start the approval workflow
        ApprovalWorkflowEngine::submit($item);

        return Inertia::render('ApprovalForms/PublicFormSuccess', [
            'form' => $form,
            'message' => $form->success_message ?? 'Your submission has been received and is now in review.',
        ]);
    }

    private function fieldConditionsMet($field, array $submittedData, $allFields = null): bool
    {
        if (!$field->conditions) {
            return true;
        }

        $conditions = $field->conditions;
        $logic = $conditions['logic'] ?? 'all';
        $rules = $conditions['rules'] ?? [];

        if (empty($rules)) {
            return true;
        }

        $metCount = 0;

        foreach ($rules as $rule) {
            $refFieldKey = $rule['field_key'] ?? $rule['field_id'] ?? null;
            if (!$refFieldKey) {
                continue;
            }

            // Resolve field_key if present (during edit, before persisting)
            $refFieldId = null;
            if (str_starts_with((string) $refFieldKey, 'id:')) {
                $refFieldId = (int) str_replace('id:', '', (string) $refFieldKey);
            } elseif (str_starts_with((string) $refFieldKey, 'pos:')) {
                $position = (int) str_replace('pos:', '', (string) $refFieldKey);
                if ($allFields) {
                    $refField = collect($allFields)->firstWhere('position', $position);
                    $refFieldId = $refField?->id;
                }
            } else {
                $refFieldId = (int) $refFieldKey;
            }

            $refValue = $submittedData["field_{$refFieldId}"] ?? null;
            $operator = $rule['operator'] ?? 'equals';
            $expected = $rule['value'] ?? null;

            $ruleMet = false;
            if ($operator === 'is_empty') {
                $ruleMet = $refValue === null || $refValue === '';
            } elseif ($operator === 'is_not_empty') {
                $ruleMet = $refValue !== null && $refValue !== '';
            } elseif ($operator === 'equals') {
                $ruleMet = (string) $refValue === (string) $expected;
            } elseif ($operator === 'not_equals') {
                $ruleMet = (string) $refValue !== (string) $expected;
            } elseif ($operator === 'contains') {
                $ruleMet = str_contains((string) $refValue, (string) $expected);
            } elseif ($operator === 'in') {
                $ruleMet = is_array($rule['value']) && in_array((string) $refValue, array_map('strval', $rule['value']));
            }

            if ($ruleMet) {
                $metCount++;
            }
        }

        if ($logic === 'all') {
            return $metCount === count($rules);
        } else {
            return $metCount > 0;
        }
    }

    private function resolveOptionLabel($field, $value): ?string
    {
        if ($field->type === 'select' && $field->custom_field_id && $field->customField) {
            $option = $field->customField->options()->where('id', $value)->first();
            return $option?->label;
        } elseif ($field->type === 'multi_select' && $field->custom_field_id && $field->customField) {
            $values = is_array($value) ? $value : [];
            $labels = $field->customField->options()
                ->whereIn('id', $values)
                ->pluck('label')
                ->toArray();
            return !empty($labels) ? implode(', ', $labels) : null;
        }

        return (string) $value ?: null;
    }
}
