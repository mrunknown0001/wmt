<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The minutes of a meeting task: one record, filled in by hand by the people
 * who were there.
 *
 * Nothing here is computed. Minutes are a statement about what happened in a
 * room, and the application is not in a position to infer any of it.
 */
class TaskMinute extends Model
{
    use HasFactory;

    protected $fillable = [
        'task_id',
        'meeting_title', 'meeting_date', 'start_time', 'end_time', 'venue',
        'facilitator_user_id', 'prepared_by_user_id', 'meeting_type',
        'attendees', 'absent_notes',
        'agenda',
        'discussions',
        'action_items',
        'decisions',
        'issues',
        'other_matters',
        'next_meeting_date', 'next_meeting_time', 'next_meeting_venue', 'next_meeting_agenda',
        'adjourned_at',
        'prepared_by_position', 'prepared_by_date',
        'reviewed_by_user_id', 'reviewed_by_position', 'reviewed_by_date',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            // Date-only, serialised as a plain calendar date for the same reason
            // as the task dates: 'date' would round-trip through UTC and land a
            // day early for anyone east of Greenwich.
            'meeting_date' => 'date:Y-m-d',
            'next_meeting_date' => 'date:Y-m-d',
            'prepared_by_date' => 'date:Y-m-d',
            'reviewed_by_date' => 'date:Y-m-d',
            'attendees' => 'array',
            'agenda' => 'array',
            'discussions' => 'array',
            'action_items' => 'array',
            'decisions' => 'array',
            'issues' => 'array',
        ];
    }

    /** The choices the printed form offers. */
    public const MEETING_TYPES = ['regular', 'special', 'project', 'management', 'other'];

    public const ATTENDANCE = ['present', 'absent', 'excused'];

    public const ACTION_STATUSES = ['not_started', 'open', 'ongoing', 'delayed', 'completed'];

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function facilitator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'facilitator_user_id');
    }

    public function preparedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'prepared_by_user_id');
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by_user_id');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * True when nobody has written anything yet.
     *
     * Used to tell "no minutes taken" from "minutes taken and empty", which the
     * tab badge needs and a null record cannot express once the row exists.
     */
    public function isBlank(): bool
    {
        foreach (['meeting_title', 'venue', 'absent_notes', 'other_matters', 'next_meeting_agenda'] as $text) {
            if (trim((string) $this->$text) !== '') {
                return false;
            }
        }

        foreach (['attendees', 'agenda', 'discussions', 'action_items', 'decisions', 'issues'] as $list) {
            if (!empty($this->$list)) {
                return false;
            }
        }

        return true;
    }
}
