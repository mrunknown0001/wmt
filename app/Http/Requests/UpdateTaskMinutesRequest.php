<?php

namespace App\Http\Requests;

use App\Models\TaskMinute;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Minutes are a free-form record, so this validates shape rather than content:
 * dates are dates, people are people who exist, and the repeating sections are
 * lists of the right kind of row. Every field is optional — minutes get written
 * over the course of a meeting and half-finished is a normal state to save in.
 */
class UpdateTaskMinutesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('task')) ?? false;
    }

    public function rules(): array
    {
        $person = ['nullable', 'integer', Rule::exists('users', 'id')];

        return [
            // 1. Meeting information
            'meeting_title' => ['nullable', 'string', 'max:255'],
            'meeting_date' => ['nullable', 'date'],
            'start_time' => ['nullable', 'string', 'max:40'],
            'end_time' => ['nullable', 'string', 'max:40'],
            'venue' => ['nullable', 'string', 'max:255'],
            'facilitator_user_id' => $person,
            'prepared_by_user_id' => $person,
            'meeting_type' => ['nullable', Rule::in(TaskMinute::MEETING_TYPES)],

            // 2. Attendees
            'attendees' => ['nullable', 'array', 'max:200'],
            'attendees.*.user_id' => $person,
            'attendees.*.name' => ['nullable', 'string', 'max:255'],
            'attendees.*.position' => ['nullable', 'string', 'max:255'],
            'attendees.*.attendance' => ['nullable', Rule::in(TaskMinute::ATTENDANCE)],
            'absent_notes' => ['nullable', 'string', 'max:2000'],

            // 3. Objectives / agenda
            'agenda' => ['nullable', 'array', 'max:100'],
            'agenda.*' => ['nullable', 'string', 'max:1000'],

            // 4. Discussion and deliberations
            'discussions' => ['nullable', 'array', 'max:100'],
            'discussions.*.topic' => ['nullable', 'string', 'max:255'],
            'discussions.*.key_points' => ['nullable', 'string', 'max:5000'],
            'discussions.*.decision' => ['nullable', 'string', 'max:5000'],

            // 5. Action items
            'action_items' => ['nullable', 'array', 'max:100'],
            'action_items.*.action' => ['nullable', 'string', 'max:1000'],
            'action_items.*.user_id' => $person,
            'action_items.*.name' => ['nullable', 'string', 'max:255'],
            'action_items.*.target_date' => ['nullable', 'date'],
            'action_items.*.status' => ['nullable', Rule::in(TaskMinute::ACTION_STATUSES)],

            // 6. Key decisions / resolutions
            'decisions' => ['nullable', 'array', 'max:100'],
            'decisions.*.title' => ['nullable', 'string', 'max:255'],
            'decisions.*.description' => ['nullable', 'string', 'max:5000'],

            // 7. Issues / concerns / risks
            'issues' => ['nullable', 'array', 'max:100'],
            'issues.*.issue' => ['nullable', 'string', 'max:1000'],
            'issues.*.impact' => ['nullable', 'string', 'max:1000'],
            'issues.*.recommended_action' => ['nullable', 'string', 'max:1000'],
            'issues.*.user_id' => $person,
            'issues.*.name' => ['nullable', 'string', 'max:255'],

            // 8. Other matters
            'other_matters' => ['nullable', 'string', 'max:5000'],

            // 9. Next meeting
            'next_meeting_date' => ['nullable', 'date'],
            'next_meeting_time' => ['nullable', 'string', 'max:40'],
            'next_meeting_venue' => ['nullable', 'string', 'max:255'],
            'next_meeting_agenda' => ['nullable', 'string', 'max:2000'],

            // 10. Adjournment
            'adjourned_at' => ['nullable', 'string', 'max:40'],

            // 11. Confirmation / acknowledgment
            'prepared_by_position' => ['nullable', 'string', 'max:255'],
            'prepared_by_date' => ['nullable', 'date'],
            'reviewed_by_user_id' => $person,
            'reviewed_by_position' => ['nullable', 'string', 'max:255'],
            'reviewed_by_date' => ['nullable', 'date'],
        ];
    }
}
