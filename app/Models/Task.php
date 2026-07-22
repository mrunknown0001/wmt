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
        'completed_at',
        'position',
        'is_recurring',
        'recurrence_frequency',
        'recurrence_interval',
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
    public function hasCommentAttachment(): bool
    {
        if (!$this->exists) {
            return false;
        }

        return $this->comments()->whereHas('attachments')->exists();
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

        if (!$project?->require_comment_attachment_on_close || $this->hasCommentAttachment()) {
            return;
        }

        $label = $newStatus === 'done' ? 'Done' : 'Cancelled';
        $message = "This task needs a comment with at least one attachment before it can be marked {$label}.";

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

    public function calculateNextDueDate(): ?\Carbon\Carbon
    {
        if (!$this->due_date) {
            return null;
        }

        return match ($this->recurrence_frequency) {
            'daily' => $this->due_date->copy()->addDays($this->recurrence_interval),
            'weekly' => $this->due_date->copy()->addWeeks($this->recurrence_interval),
            'monthly' => $this->due_date->copy()->addMonths($this->recurrence_interval),
            'yearly' => $this->due_date->copy()->addYears($this->recurrence_interval),
            default => null,
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
