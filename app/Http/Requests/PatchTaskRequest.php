<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\GuardsMilestoneFlag;
use App\Http\Requests\Concerns\ScopesSectionToProject;
use Illuminate\Foundation\Http\FormRequest;

class PatchTaskRequest extends FormRequest
{
    use GuardsMilestoneFlag;
    use ScopesSectionToProject;

    public function authorize(): bool
    {
        $task = $this->route('task');

        if ($this->user()->can('manage-tasks')) {
            return true;
        }

        if ($task->isStandalone()) {
            return $task->created_by === $this->user()->id
                || $task->assigned_to === $this->user()->id;
        }

        return $task->project->owner_id === $this->user()->id
            || $task->assigned_to === $this->user()->id;
    }

    public function rules(): array
    {
        return [
            'status' => ['sometimes', 'required', 'string', 'in:backlog,to_do,in_progress,in_review,done,cancelled'],
            'priority' => ['sometimes', 'required', 'string', 'in:low,medium,high,urgent'],
            'assigned_to' => ['sometimes', 'nullable', 'exists:users,id'],
            'start_date' => ['sometimes', 'nullable', 'date'],
            'due_date' => ['sometimes', 'nullable', 'date'],
            // Optional clock time for the due date. H:i from the browser's time
            // input; H:i:s accepted so a value read back from the DB round-trips.
            'due_time' => ['nullable', 'date_format:H:i,H:i:s'],
            'estimated_minutes' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'section_id' => ['sometimes', 'nullable', $this->sectionIdRule()],
            'is_milestone' => ['sometimes', 'boolean', $this->milestoneFlagRule()],
            'collaborator_ids' => ['sometimes', 'array'],
            'collaborator_ids.*' => ['integer', 'exists:users,id'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            $task = $this->route('task');

            $canManage = $this->user()->can('manage-tasks');

            if (! $canManage && ! $task->isStandalone()) {
                $canManage = $task->project->owner_id === $this->user()->id;
            }

            if (! $canManage && $task->isStandalone()) {
                $canManage = $task->created_by === $this->user()->id;
            }

            if (!$canManage) {
                $restricted = array_intersect(['assigned_to', 'start_date', 'due_date'], array_keys($this->all()));
                if (!empty($restricted)) {
                    $validator->errors()->add('authorization', 'You do not have permission to modify assignment or dates.');
                }
            }

            $startDate = $this->has('start_date') ? $this->start_date : $task->start_date?->toDateString();
            $dueDate = $this->has('due_date') ? $this->due_date : $task->due_date?->toDateString();

            if ($startDate && $dueDate && $startDate > $dueDate) {
                $validator->errors()->add('start_date', 'The start date must be before or equal to the due date.');
            }
        });
    }
}
