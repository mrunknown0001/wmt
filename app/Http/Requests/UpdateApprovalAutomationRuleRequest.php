<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateApprovalAutomationRuleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:255',
            'is_active' => 'nullable|boolean',
            'trigger_type' => 'required|string|in:item_submitted,approval_requested,approval_step_decided,approval_completed,approval_rejected,approval_changes_requested,approval_cancelled',
            'trigger_config' => 'nullable|array',
            'conditions' => 'nullable|array',
            'actions' => 'required|array|min:1',
            'actions.*.type' => 'required|string|in:send_notification,add_comment,set_custom_field',
            'actions.*.params' => 'required|array',
        ];
    }
}
