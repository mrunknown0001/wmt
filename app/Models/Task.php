<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Task extends Model
{
    use HasFactory;

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
            'position' => 'integer',
            'is_recurring' => 'boolean',
            'recurrence_interval' => 'integer',
            'escalation_level' => 'integer',
        ];
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
