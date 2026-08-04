<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateApprovalProjectRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:1000',
            'status' => 'required|string|in:active,on_hold,completed,archived',
            'owner_id' => 'nullable|exists:users,id',
            'co_owner_ids' => 'nullable|array',
            'co_owner_ids.*' => 'integer|exists:users,id',
            'is_pinned' => 'nullable|boolean',
            // Padding may change; the prefix may not once it has been set, so it
            // is only accepted while the project still has none.
            'series_padding' => 'nullable|integer|min:1|max:10',
            'default_sla_hours' => ['nullable', 'integer', 'min:1', 'max:8760'],
            'sla_reminder_hours' => ['nullable', 'integer', 'min:1', 'max:8760'],
            'sla_escalate_after_hours' => ['nullable', 'integer', 'min:0', 'max:8760'],
            'series_prefix' => [
                'nullable', 'string', 'max:20',
                'regex:/^[A-Za-z0-9][A-Za-z0-9\-_\/]*$/',
                function ($attribute, $value, $fail) {
                    $project = $this->route('approvalProject');

                    if ($project && $project->hasSeries() && $value !== $project->series_prefix) {
                        $fail('The series prefix cannot be changed once numbers have been issued under it.');
                    }
                },
            ],
        ];
    }
}
