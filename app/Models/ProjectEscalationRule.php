<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One rung of a project's own escalation ladder.
 *
 * Used only when the project has opted out of the global tiers.
 */
class ProjectEscalationRule extends Model
{
    use HasFactory;

    public const UNIT_DAYS = 'days';
    public const UNIT_HOURS = 'hours';
    public const UNITS = [self::UNIT_DAYS, self::UNIT_HOURS];

    /**
     * Who a rung notifies.
     *
     * Everything except the project audiences is resolved from the assignee's
     * place in the org, so one rule reaches the right supervisor for whoever
     * happens to hold the task.
     */
    public const RECIPIENTS = [
        'assignee' => 'Assignee',
        'team_leader' => 'Team leader (supervisor)',
        'department_head' => 'Department head (manager)',
        'division_head' => 'Division head',
        'project_owner' => 'Project owner',
        'project_admins' => 'Project admins',
        'executives' => 'Executives',
    ];

    /** Guard rails on the offset, so a typo can't schedule something absurd. */
    public const MAX_DAYS = 365;
    public const MAX_HOURS = 8760; // a year, in hours

    protected $fillable = [
        'project_id',
        'name',
        'offset_unit',
        'offset_value',
        'recipients',
        'is_active',
        'position',
    ];

    protected function casts(): array
    {
        return [
            'recipients' => 'array',
            'is_active' => 'boolean',
            'offset_value' => 'integer',
            'position' => 'integer',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** Hours past the due moment before this rung fires. */
    public function thresholdHours(): int
    {
        return $this->offset_unit === self::UNIT_HOURS
            ? max(0, (int) $this->offset_value)
            : max(0, (int) $this->offset_value) * 24;
    }

    /** "2 days overdue", "6 hours overdue" — for the notification body. */
    public function describeOffset(): string
    {
        $value = max(0, (int) $this->offset_value);
        $unit = $this->offset_unit === self::UNIT_HOURS ? 'hour' : 'day';

        return $value . ' ' . $unit . ($value === 1 ? '' : 's') . ' overdue';
    }
}
