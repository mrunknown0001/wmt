<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Observers\TaskObserver;

#[ObservedBy(TaskObserver::class)]
class Task extends Model
{
    use HasFactory, SoftDeletes;

    public const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];

    public const ESCALATION_TIERS = [
        1 => ['days' => 1,  'label' => 'Assignee Reminder'],
        2 => ['days' => 3,  'label' => 'Supervisor, Manager & Project Owner'],
        3 => ['days' => 7,  'label' => 'Division Head'],
        4 => ['days' => 14, 'label' => 'Executives'],
    ];

    protected $appends = ['due_time_label'];

    protected $fillable = [
        'project_id',
        'parent_id',
        'title',
        'description',
        'status',
        'priority',
        'assigned_to',
        'created_by',
        'start_date',
        'due_date',
        'due_time',
        'completed_at',
        'position',
        'is_recurring',
        'recurrence_frequency',
        'recurrence_interval',
        'recurrence_config',
        'recurring_source_id',
        'section_id',
        'escalation_level',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'due_date' => 'date',
            'completed_at' => 'datetime',
            'position' => 'integer',
            'is_recurring' => 'boolean',
            'recurrence_interval' => 'integer',
            'recurrence_config' => 'array',
            'escalation_level' => 'integer',
        ];
    }

    protected static function boot(): void
    {
        parent::boot();

        static::saving(function (Task $task) {
            if ($task->isDirty('status')) {
                $newStatus = $task->status;
                $oldStatus = $task->getOriginal('status');

                // Project rule: a task can only be closed once one of its comments
                // carries an attachment. Enforced here rather than per-controller so
                // every path (edit, patch, kanban drag, bulk update) is covered.
                $task->assertClosableUnderProjectRules($newStatus, $oldStatus);

                if ($newStatus === 'done' && $oldStatus !== 'done') {
                    $task->completed_at = now();
                } elseif ($oldStatus === 'done' && $newStatus !== 'done') {
                    $task->completed_at = null;
                }
            }
        });
    }

    /** The statuses that close a task: "completed" and "unable to complete". */
    public const CLOSING_STATUSES = ['done', 'cancelled'];

    /** True when at least one of this task's comments has an attachment. */
    /**
     * Proof-of-work attachment for the close rule. Satisfied by a file on one of
     * the task's comments, or by a file on the task itself — which is how form
     * submissions arrive, so a task raised from a form with an attachment already
     * counts as evidenced.
     */
    public function hasSupportingAttachment(): bool
    {
        if (!$this->exists) {
            return false;
        }

        return $this->comments()->whereHas('attachments')->exists()
            || $this->attachments()->exists();
    }

    /**
     * Block a close transition when the task's project requires a comment
     * attachment as proof of work and none exists yet.
     *
     * @throws \Illuminate\Validation\ValidationException
     */
    public function assertClosableUnderProjectRules(?string $newStatus, ?string $oldStatus): void
    {
        // Only guard the transition *into* a closing status.
        if (!in_array($newStatus, self::CLOSING_STATUSES, true)
            || in_array($oldStatus, self::CLOSING_STATUSES, true)) {
            return;
        }

        if (!$this->project_id) {
            return; // personal tasks have no project rules
        }

        $project = $this->relationLoaded('project') ? $this->project : Project::find($this->project_id);

        if (!$project?->require_comment_attachment_on_close || $this->hasSupportingAttachment()) {
            return;
        }

        $label = $newStatus === 'done' ? 'Done' : 'Cancelled';
        $message = "This task needs at least one attachment — on the task or on a comment — before it can be marked {$label}.";

        // Flash so the user gets a toast on Inertia form/redirect paths. JSON callers
        // are skipped deliberately — nothing would render it there, and it would
        // resurface as a stale toast on their next page load. Those paths read the
        // 422 body and raise the toast client-side instead.
        $request = request();
        if ($request && !$request->expectsJson() && $request->hasSession()) {
            $request->session()->flash('error', $message);
        }

        throw \Illuminate\Validation\ValidationException::withMessages([
            'status' => $message,
        ]);
    }

    /**
     * The due date with its time applied, or null when there is no due date.
     *
     * Use this for "is it late yet?" — due_date alone puts everything at
     * midnight, which would make a task due at 17:00 read as overdue all day.
     * Without a time set this returns the end of the day, so a dateless-time
     * task is only late once the day is out.
     */
    public function dueAt(): ?\Carbon\Carbon
    {
        if (!$this->due_date) {
            return null;
        }

        if (!$this->due_time) {
            return $this->due_date->copy()->endOfDay();
        }

        [$h, $m] = array_pad(explode(':', (string) $this->due_time), 2, 0);

        return $this->due_date->copy()->setTime((int) $h, (int) $m);
    }

    /** "5:00 PM", or null when no time was set. */
    public function getDueTimeLabelAttribute(): ?string
    {
        if (!$this->due_time) {
            return null;
        }

        [$h, $m] = array_pad(explode(':', (string) $this->due_time), 2, 0);

        return \Carbon\Carbon::createFromTime((int) $h, (int) $m)->format('g:i A');
    }

    /** Monthly recurrence variants stored in recurrence_config['mode']. */
    public const MONTHLY_MODES = ['day_of_month', 'last_day', 'nth_weekday'];

    /** "Last" week of the month, stored as the week number. */
    public const LAST_WEEK = -1;

    public function calculateNextDueDate(): ?\Carbon\Carbon
    {
        if (!$this->due_date) {
            return null;
        }

        $interval = max(1, (int) $this->recurrence_interval);
        $config = $this->recurrence_config ?? [];
        $from = $this->due_date->copy();

        return match ($this->recurrence_frequency) {
            'daily' => $from->addDays($interval),
            'weekly' => $this->nextWeeklyDate($from, $interval, $config),
            'monthly' => $this->nextMonthlyDate($from, $interval, $config),
            'yearly' => $from->addYears($interval),
            default => null,
        };
    }

    /**
     * Weekly, optionally restricted to particular weekdays.
     *
     * With days chosen, the next occurrence is the next selected weekday after
     * the current due date. Only once the week is exhausted does it jump forward
     * by the interval — so "every 2 weeks on Mon and Thu" gives Mon, Thu, then a
     * fortnight later, not two separate fortnightly series.
     */
    private function nextWeeklyDate(\Carbon\Carbon $from, int $interval, array $config): \Carbon\Carbon
    {
        $days = collect($config['days'] ?? [])
            ->map(fn ($d) => (int) $d)
            ->filter(fn ($d) => $d >= 1 && $d <= 7)
            ->unique()->sort()->values();

        if ($days->isEmpty()) {
            return $from->addWeeks($interval);
        }

        // A later selected day in the same week?
        $current = (int) $from->isoWeekday();
        $later = $days->first(fn ($d) => $d > $current);

        if ($later !== null) {
            return $from->copy()->addDays($later - $current);
        }

        // Otherwise the earliest selected day, `interval` weeks on.
        return $from->copy()
            ->addWeeks($interval)
            ->startOfWeek(\Carbon\CarbonInterface::MONDAY)
            ->addDays($days->first() - 1);
    }

    /**
     * Monthly, in one of three shapes.
     *
     * Each is anchored to the target month rather than to the previous date, so
     * a short month can't drag the series earlier permanently — the classic bug
     * where the 31st becomes the 28th and then stays there.
     */
    private function nextMonthlyDate(\Carbon\Carbon $from, int $interval, array $config): \Carbon\Carbon
    {
        $mode = $config['mode'] ?? null;

        // startOfMonth first: adding months to the 31st would otherwise overflow
        // into the following month on the way past February.
        $target = $from->copy()->startOfMonth()->addMonthsNoOverflow($interval);

        return match ($mode) {
            'last_day' => $target->endOfMonth()->startOfDay(),

            'day_of_month' => (function () use ($target, $config, $from) {
                $day = (int) ($config['day'] ?? $from->day);
                $day = max(1, min(31, $day));

                // Clamp to the month's length: the 31st in a 30-day month means
                // the 30th, and the following month still gets the 31st.
                return $target->copy()->day(min($day, $target->daysInMonth));
            })(),

            'nth_weekday' => (function () use ($target, $config, $from) {
                $week = (int) ($config['week'] ?? 1);
                $weekday = (int) ($config['weekday'] ?? $from->isoWeekday());
                $weekday = max(1, min(7, $weekday));

                if ($week === self::LAST_WEEK) {
                    $last = $target->copy()->endOfMonth()->startOfDay();

                    return $last->subDays((7 + $last->isoWeekday() - $weekday) % 7);
                }

                $week = max(1, min(5, $week));
                $first = $target->copy()->startOfMonth();
                $offset = (7 + $weekday - $first->isoWeekday()) % 7;
                $candidate = $first->copy()->addDays($offset + ($week - 1) * 7);

                // A 5th occurrence doesn't exist every month — fall back to the
                // last one rather than spilling into the next month.
                if ($candidate->month !== $target->month) {
                    $last = $target->copy()->endOfMonth()->startOfDay();

                    return $last->subDays((7 + $last->isoWeekday() - $weekday) % 7);
                }

                return $candidate;
            })(),

            default => $from->copy()->addMonthsNoOverflow($interval),
        };
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function section(): BelongsTo
    {
        return $this->belongsTo(TaskSection::class, 'section_id');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function subtasks(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('position');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(TaskComment::class);
    }

    public function activities(): HasMany
    {
        return $this->hasMany(TaskActivity::class);
    }

    public function collaborators(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'task_collaborators')
            ->withTimestamps();
    }

    public function recurringSource(): BelongsTo
    {
        return $this->belongsTo(self::class, 'recurring_source_id');
    }

    public function recurringNext(): HasOne
    {
        return $this->hasOne(self::class, 'recurring_source_id');
    }

    public function customFieldValues(): HasMany
    {
        return $this->hasMany(TaskCustomFieldValue::class);
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(TaskAttachment::class);
    }

    public function isStandalone(): bool
    {
        return is_null($this->project_id);
    }

    public function getEditUrl(): string
    {
        if ($this->project_id) {
            return "/projects/{$this->project_id}/tasks/{$this->id}/edit";
        }

        return "/tasks/{$this->id}/edit";
    }
}
