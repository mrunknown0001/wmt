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

    /**
     * Has this rung been reached for the given task?
     *
     * The two units deliberately measure differently, because people mean
     * different things by them:
     *
     *  days  — whole calendar days past the due date, so a task due Monday is
     *          "1 day overdue" from Tuesday morning. This matches the global
     *          tiers exactly, so moving a project off them does not silently
     *          shift when day-based escalations fire.
     *
     *  hours — measured from the due *moment*: the due time when one is set,
     *          the end of the due day when it is not. This is the unit for
     *          "chase it two hours after the 14:00 handover".
     */
    public function isReached(Task $task, ?\Carbon\Carbon $now = null): bool
    {
        $now ??= now();
        $value = max(0, (int) $this->offset_value);

        if ($this->offset_unit === self::UNIT_HOURS) {
            $dueAt = $task->dueAt();

            return $dueAt !== null && $now->greaterThanOrEqualTo($dueAt->copy()->addHours($value));
        }

        if (!$task->due_date) {
            return false;
        }

        // Signed diff: a task not yet due gives a negative number rather than
        // an absolute one, which would make every future task look overdue.
        $daysOverdue = $task->due_date->copy()->startOfDay()
            ->diffInDays($now->copy()->startOfDay(), false);

        return $daysOverdue >= $value;
    }

    /** "2 days overdue", "6 hours overdue" — for the notification body. */
    public function describeOffset(): string
    {
        $value = max(0, (int) $this->offset_value);
        $unit = $this->offset_unit === self::UNIT_HOURS ? 'hour' : 'day';

        return $value . ' ' . $unit . ($value === 1 ? '' : 's') . ' overdue';
    }
}
