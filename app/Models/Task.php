<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
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

    public const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'semi_annual', 'yearly'];

    /** Semi-annual is monthly recurrence on a six-month stride. */
    public const MONTHS_PER_SEMI_ANNUAL = 6;

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
        'is_milestone',
        'close_rule_exempt',
        'close_rule_exempt_reason',
        'assigned_to',
        'created_by',
        'start_date',
        'due_date',
        'due_time',
        'estimated_minutes',
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
            'is_milestone' => 'boolean',
            'close_rule_exempt' => 'boolean',
            'close_rule_exempt_at' => 'datetime',
            // Date-only columns, serialised as a plain calendar date.
            //
            // Plain 'date' serialises through Carbon::toJSON(), which converts
            // to UTC: with app.timezone at Asia/Manila a due date of 3 Aug went
            // over the wire as "2026-08-02T16:00:00Z", and every consumer that
            // read the date part of that string was a day behind.
            'start_date' => 'date:Y-m-d',
            'due_date' => 'date:Y-m-d',
            'completed_at' => 'datetime',
            'position' => 'integer',
            'is_recurring' => 'boolean',
            'recurrence_interval' => 'integer',
            'recurrence_config' => 'array',
            'escalation_level' => 'integer',
            'estimated_minutes' => 'integer',
        ];
    }

    protected static function boot(): void
    {
        parent::boot();

        // Assign the project's task number.
        //
        // Done on the model rather than in the controllers because tasks are
        // created from nine places — the UI, the API, public forms, duplication,
        // project duplication, recurrence and automation — and a number issued
        // by only some of them would leave gaps in the sequence.
        static::creating(function (Task $task) {
            if ($task->series_number || !$task->project_id) {
                return; // already numbered, or a standalone task with no project
            }

            $claim = Project::claimNextTaskSeries((int) $task->project_id);

            if ($claim !== null) {
                [$task->series_number, $task->series_sequence] = $claim;
            }
        });

        // Coming back out of the trash.
        //
        // While a task sits in the trash its number can be handed to someone
        // else — either because the counter was reset, or because the sequence
        // it held was released. Restoring it must not resurrect a number that
        // now means something else, and must not fail on the unique index.
        //
        // The number itself is kept, marked, because it is what people quoted
        // while the task was alive. The sequence is given up: two tasks cannot
        // both hold it, and the live one has the better claim.
        static::restoring(function (Task $task) {
            if (!$task->project_id || !$task->series_number) {
                return;
            }

            // Read the sequence from the database rather than trusting the
            // instance: a reset releases it with a query-builder update, so an
            // object loaded before that still believes it holds a number.
            $task->series_sequence = static::withTrashed()
                ->whereKey($task->getKey())
                ->value('series_sequence');

            if ($task->series_sequence !== null && !$task->sequenceTakenByAnother()) {
                return; // nothing happened while it was away
            }

            $task->series_sequence = null;
            $task->series_number = self::markRestored($task->series_number);
        });

        static::saving(function (Task $task) {
            // A milestone marks a moment, not a span, so its dates are held
            // equal. Collapsing here rather than validating means a caller can
            // simply tick the box: every write path lands on the same rule, and
            // the UI has nothing to keep in sync.
            if ($task->is_milestone) {
                $task->start_date = $task->due_date;
            }

            // Stamp who granted the exemption and when, at the same choke point
            // that enforces the rule. Any path that can set the flag — form,
            // patch, API — records the decision without having to remember to.
            if ($task->isDirty('close_rule_exempt')) {
                if ($task->close_rule_exempt) {
                    $task->close_rule_exempt_by = $task->close_rule_exempt_by ?: auth()->id();
                    $task->close_rule_exempt_at = now();
                } else {
                    // Withdrawn: clear the record rather than leave a stale
                    // grantor attached to a task that is no longer exempt.
                    $task->close_rule_exempt_reason = null;
                    $task->close_rule_exempt_by = null;
                    $task->close_rule_exempt_at = null;
                }
            }

            if ($task->isDirty('status')) {
                $newStatus = $task->status;
                $oldStatus = $task->getOriginal('status');

                // Project rule: a task can only be closed once one of its comments
                // carries an attachment. Enforced here rather than per-controller so
                // every path (edit, patch, kanban drag, bulk update) is covered.
                $task->assertClosableUnderProjectRules($newStatus, $oldStatus);

                // Same reasoning for dependencies: a task waiting on unfinished
                // work cannot be closed, whichever path is trying to close it.
                $task->assertDependenciesSatisfied($newStatus, $oldStatus);

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

    /**
     * Past its due date — the one definition of "overdue" in the application.
     *
     * Date-only, matching utils.js isPastDue: a task due today is not late
     * until the day is out, whatever the hour. This exists because the obvious
     * spelling is wrong in a way nobody notices. due_date is a date column, so
     * where('due_date', '<', now()) compares '2026-08-12' against
     * '2026-08-12 15:00:00' — the date sorts first, and everything due today
     * reads as overdue from midnight. That was live in a dozen places, each
     * over-reporting by a day's work.
     *
     * Callers add their own status filter where they need one; several count
     * over relations that already exclude finished work.
     */
    public function scopePastDue(Builder $query, ?Carbon $on = null): Builder
    {
        return $query->whereNotNull('due_date')
            ->whereDate('due_date', '<', ($on ?? now())->toDateString());
    }

    /** Past due and still open — the usual pairing. */
    public function scopeOverdue(Builder $query, ?Carbon $on = null): Builder
    {
        return $query->pastDue($on)->whereNotIn('status', self::CLOSING_STATUSES);
    }

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

        // An exemption is granted per task by whoever runs the project, and is
        // checked last: it only matters once the rule would otherwise bite, so
        // an exempt task that does have an attachment never needs to lean on it.
        if ($this->close_rule_exempt) {
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

    /** Appended to a restored task's number when its sequence has been reissued. */
    public const RESTORED_SUFFIX = ' (restored)';

    /** Idempotent: restoring twice must not read "(restored) (restored)". */
    public static function markRestored(string $number): string
    {
        return str_ends_with($number, self::RESTORED_SUFFIX)
            ? $number
            : $number . self::RESTORED_SUFFIX;
    }

    /** True when another task in this project already holds this sequence. */
    public function sequenceTakenByAnother(): bool
    {
        if ($this->series_sequence === null || !$this->project_id) {
            return false;
        }

        return static::withTrashed()
            ->where('project_id', $this->project_id)
            ->where('series_sequence', $this->series_sequence)
            ->whereKeyNot($this->getKey())
            ->exists();
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
            // Six months at a time, but otherwise monthly: "the last day of the
            // month" and "the second Tuesday" are exactly as useful twice a year
            // as they are every month, so the same variants apply.
            'semi_annual' => $this->nextMonthlyDate($from, $interval * self::MONTHS_PER_SEMI_ANNUAL, $config),
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

    /** Who waived this task's project close rules. */
    public function closeRuleExemptBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'close_rule_exempt_by');
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

    public function timeLogs(): HasMany
    {
        return $this->hasMany(TaskTimeLog::class);
    }

    /**
     * Work recorded against this task.
     *
     * Only finished entries count — a running timer has no duration yet, and
     * including a half-finished one would make the total move on its own.
     */
    public function loggedMinutes(): int
    {
        return (int) $this->timeLogs()->completed()->sum('minutes');
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

    /**
     * Tasks this one waits on. It cannot be closed until all of them are done.
     */
    public function dependencies(): BelongsToMany
    {
        return $this->belongsToMany(self::class, 'task_dependencies', 'task_id', 'depends_on_task_id')
            ->withTimestamps();
    }

    /**
     * Tasks waiting on this one — the other side of the same edge. Used to draw
     * the arrows, and to warn before deleting something others depend on.
     */
    public function dependents(): BelongsToMany
    {
        return $this->belongsToMany(self::class, 'task_dependencies', 'depends_on_task_id', 'task_id')
            ->withTimestamps();
    }

    /** Dependencies that are not finished yet, and so are blocking this task. */
    public function blockingDependencies()
    {
        return $this->dependencies()->whereNotIn('status', ['done', 'cancelled']);
    }

    /**
     * Refuse to close a task while something it depends on is unfinished.
     *
     * Deliberately mirrors assertClosableUnderProjectRules: same trigger (the
     * transition *into* a closing status), same hard refusal, same choke point
     * in saving(). That is what makes the kanban drag, the API, bulk update and
     * automation all obey it without each having to remember to ask.
     *
     * 'cancelled' counts as satisfied. A dependency that was called off is not
     * going to complete, and leaving it to block everything downstream forever
     * would make cancelling a task a way to deadlock a project.
     *
     * @throws \Illuminate\Validation\ValidationException
     */
    public function assertDependenciesSatisfied(?string $newStatus, ?string $oldStatus): void
    {
        if (!in_array($newStatus, self::CLOSING_STATUSES, true)
            || in_array($oldStatus, self::CLOSING_STATUSES, true)) {
            return;
        }

        if (!$this->exists) {
            return; // nothing can depend on a task that is not saved yet
        }

        $blocking = $this->blockingDependencies()->pluck('title')->all();

        if (empty($blocking)) {
            return;
        }

        $list = count($blocking) === 1
            ? '"' . $blocking[0] . '"'
            : '"' . implode('", "', array_slice($blocking, 0, 3)) . '"'
                . (count($blocking) > 3 ? ' and ' . (count($blocking) - 3) . ' more' : '');

        $message = count($blocking) === 1
            ? "This task is waiting on {$list}, which is not done yet."
            : "This task is waiting on {$list}, which are not done yet.";

        // Flash for Inertia callers so they get a toast; JSON callers read the
        // 422 body instead. Same split as the attachment rule, for the same
        // reason — a flash a JSON caller never renders resurfaces later as a
        // stale toast on an unrelated page.
        $request = request();
        if ($request && !$request->expectsJson() && $request->hasSession()) {
            $request->session()->flash('error', $message);
        }

        throw \Illuminate\Validation\ValidationException::withMessages([
            'status' => $message,
        ]);
    }
}
