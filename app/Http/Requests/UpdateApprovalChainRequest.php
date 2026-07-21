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
            'steps.*.approver_config' => 'required|array',
            'steps.*.quorum_mode' => 'nullable|string|in:any,all,majority,count',
            'steps.*.quorum_count' => 'nullable|integer|min:1',
            'steps.*.skip_conditions' => 'nullable|array',
            'steps.*.on_reject_override' => 'nullable|string|in:reject_item,return_to_previous_step,return_to_requester',
            'steps.*.fallback_user_id' => 'nullable|exists:users,id',
        ];
    }

    public function withValidator($validator)
    {
        $validator->after(function ($validator) {
            $steps = $this->get('steps', []);
            foreach ($steps as $index => $step) {
                $this->validateStepApproverConfig($validator, $index, $step);
            }
        });
    }

    private function validateStepApproverConfig($validator, $index, $step)
    {
        $approverType = $step['approver_type'] ?? null;
        $approverConfig = $step['approver_config'] ?? [];
        $stepNum = $index + 1;

        $path = "steps.{$index}.approver_config";

        switch ($approverType) {
            case 'specific_user':
                if (empty($approverConfig['user_id'])) {
                    $validator->errors()->add($path, "Step {$stepNum}: specific_user type requires user_id in approver_config.");
                }
                break;

            case 'role':
                if (empty($approverConfig['role'])) {
                    $validator->errors()->add($path, "Step {$stepNum}: role type requires role in approver_config.");
                }
                break;

            case 'group':
                if (empty($approverConfig['user_ids']) || !is_array($approverConfig['user_ids']) || count($approverConfig['user_ids']) === 0) {
                    $validator->errors()->add($path, "Step {$stepNum}: group type requires non-empty user_ids array in approver_config.");
                }
                break;

            case 'department_head':
            case 'division_head':
            case 'team_leader':
                if (!isset($approverConfig['of']) || ($approverConfig['of'] === 'fixed' && empty($approverConfig['entity_id']))) {
                    $validator->errors()->add($path, "Step {$stepNum}: {$approverType} type requires 'of' and 'entity_id' (for fixed mode) in approver_config.");
                }
                break;

            case 'requester_manager':
            case 'project_owner':
                // These don't require config - they resolve dynamically
                break;
        }
    }
}
