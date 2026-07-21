<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateApprovalChainRequest extends FormRequest
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
            'is_default' => 'nullable|boolean',
            'is_active' => 'nullable|boolean',
            'priority' => 'nullable|integer|min:0',
            'selector_conditions' => 'nullable|array',
            'on_reject_behavior' => 'nullable|string|in:reject_item,return_to_previous_step,return_to_requester',
            'steps' => 'required|array|min:1',
            'steps.*.id' => 'nullable|exists:approval_steps,id',
            'steps.*.step_number' => 'nullable|integer|min:1',
            'steps.*.name' => 'required|string|max:255',
            'steps.*.approver_type' => 'required|string|in:specific_user,role,requester_manager,department_head,division_head,team_leader,group,project_owner',
            'steps.*.approver_config' => 'nullable|array',
            'steps.*.quorum_mode' => 'nullable|string|in:any,all,majority,count',
            'steps.*.quorum_count' => 'nullable|integer|min:1',
            'steps.*.skip_conditions' => 'nullable|array',
            'steps.*.on_reject_override' => 'nullable|string|in:reject_item,return_to_previous_step,return_to_requester',
            'steps.*.fallback_user_id' => 'nullable|exists:users,id',
        ];
    }
}
