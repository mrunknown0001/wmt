<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;
use App\Observers\ProjectObserver;

#[ObservedBy(ProjectObserver::class)]
class Project extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'name',
        'description',
        'status',
        'owner_id',
        'folder_id',
        'due_date',
        'is_pinned',
        'position',
        'require_comment_attachment_on_close',
        'hide_completed_tasks',
        'task_series_enabled',
        'task_series_prefix',
        'task_series_padding',
        'show_task_series_column',
        'use_global_escalation',
    ];

    protected function casts(): array
    {
        return [
            'due_date' => 'date:Y-m-d',
            'is_pinned' => 'boolean',
            'require_comment_attachment_on_close' => 'boolean',
            'hide_completed_tasks' => 'boolean',
            'task_series_enabled' => 'boolean',
            'task_series_padding' => 'integer',
            'task_series_next' => 'integer',
            'show_task_series_column' => 'boolean',
            'use_global_escalation' => 'boolean',
        ];
    }

    /** Widest sequence the padding setting may be asked to produce. */
    public const SERIES_MIN_PADDING = 1;
    public const SERIES_MAX_PADDING = 10;

    /** True once numbering is switched on for this project's tasks. */
    public function hasTaskSeries(): bool
    {
        return (bool) $this->task_series_enabled;
    }

    /**
     * Whether the task list should carry a Series column.
     *
     * A column of blanks helps nobody, so this is false whenever numbering
     * itself is off, regardless of how the toggle is set.
     */
    public function showsTaskSeriesColumn(): bool
    {
        return $this->hasTaskSeries() && (bool) $this->show_task_series_column;
    }

    /**
     * True once at least one number has been issued.
     *
     * From this point the prefix is fixed — numbers already in circulation would
     * otherwise start referring to a prefix that no longer exists.
     */
    public function taskSeriesStarted(): bool
    {
        return (int) $this->task_series_next > 1;
    }

    /** e.g. "TASK-" + 42 => "TASK-0042". A blank prefix gives bare numbers. */
    public function formatTaskSeries(int $sequence): string
    {
        $padding = max(
            self::SERIES_MIN_PADDING,
            min(self::SERIES_MAX_PADDING, (int) $this->task_series_padding)
        );

        return ($this->task_series_prefix ?? '') . str_pad((string) $sequence, $padding, '0', STR_PAD_LEFT);
    }

    /** What the next number will look like — used for the live preview. */
    public function previewTaskSeries(): ?string
    {
        return $this->hasTaskSeries()
            ? $this->formatTaskSeries(max(1, (int) $this->task_series_next))
            : null;
    }

    /**
     * Claim the next task number for this project.
     *
     * The row is locked for the read-modify-write, so two tasks created at the
     * same moment cannot be handed the same number. That is not hypothetical
     * here: tasks arrive from the UI, the API, public forms and automation
     * rules, and a bulk import creates many in quick succession.
     *
     * Returns null when the project has numbering switched off, in which case
     * the task simply carries no number.
     *
     * @return array{0: string, 1: int}|null [formatted number, sequence]
     */
    public static function claimNextTaskSeries(int $projectId): ?array
    {
        return DB::transaction(function () use ($projectId) {
            $project = static::query()->whereKey($projectId)->lockForUpdate()->first();

            if (!$project || !$project->hasTaskSeries()) {
                return null;
            }

            $sequence = self::nextFreeSequence($projectId, max(1, (int) $project->task_series_next));

            // saveQuietly: advancing the counter is bookkeeping, not a project
            // edit, and must not fire observers or bump the project's timestamps.
            $project->task_series_next = $sequence + 1;
            $project->saveQuietly();

            return [$project->formatTaskSeries($sequence), $sequence];
        });
    }

    /**
     * The first sequence at or after $from that no task is holding.
     *
     * Normally $from is already free and this returns it unchanged. It matters
     * after the counter has been reset: numbering restarts low, and without
     * this the first claim would collide with a task that still holds that
     * number — including one sitting in the trash, whose row still occupies
     * the unique index.
     *
     * One query, then a walk over the contiguous run, rather than a query per
     * candidate.
     */
    public static function nextFreeSequence(int $projectId, int $from): int
    {
        $taken = Task::withTrashed()
            ->where('project_id', $projectId)
            ->whereNotNull('series_sequence')
            ->where('series_sequence', '>=', $from)
            ->orderBy('series_sequence')
            ->pluck('series_sequence');

        $sequence = $from;

        foreach ($taken as $held) {
            if ((int) $held > $sequence) {
                break; // found a gap
            }
            if ((int) $held === $sequence) {
                $sequence++;
            }
        }

        return $sequence;
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function folder(): BelongsTo
    {
        return $this->belongsTo(Folder::class);
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    public function sections(): HasMany
    {
        return $this->hasMany(TaskSection::class);
    }

    public function automationRules(): HasMany
    {
        return $this->hasMany(ProjectAutomationRule::class);
    }

    public function escalationRules(): HasMany
    {
        return $this->hasMany(ProjectEscalationRule::class)->orderBy('position');
    }

    /** True when this project's tasks follow the tiers set in admin settings. */
    public function usesGlobalEscalation(): bool
    {
        return (bool) $this->use_global_escalation;
    }

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'project_members')
            ->withPivot('role')
            ->withTimestamps();
    }

    /**
     * Membership roles, from most to least privileged.
     *
     *  admin  — manage the project itself and everything in it
     *  editor — work on tasks, but cannot change the project's settings,
     *           members, custom fields, forms or automation rules
     *  viewer — read only
     */
    public const MEMBER_ROLES = ['admin', 'editor', 'viewer'];

    /** Roles allowed to create and change tasks. */
    public const TASK_EDITING_ROLES = ['admin', 'editor'];

    public function isProjectAdmin(User $user): bool
    {
        return $this->memberRole($user) === 'admin';
    }

    /** This user's role on the project, or null if they are not a member. */
    public function memberRole(User $user): ?string
    {
        // Resolved from a loaded members collection when one is available, so a
        // page that already eager-loaded members doesn't re-query per check.
        if ($this->relationLoaded('members')) {
            return $this->members->firstWhere('id', $user->id)?->pivot?->role;
        }

        return $this->members()->where('user_id', $user->id)->value('role');
    }

    /**
     * Can this user create and change tasks in the project?
     *
     * The single definition used by every task endpoint — previously each one
     * repeated "global permission or owner or project admin", which left member
     * roles enforcing nothing.
     */
    public function userCanManageTasks(User $user): bool
    {
        return $user->can('manage-tasks')
            || $this->owner_id === $user->id
            || in_array($this->memberRole($user), self::TASK_EDITING_ROLES, true);
    }

    /**
     * Can this user change the project itself — settings, members, custom
     * fields, forms, automation rules? Editors deliberately cannot.
     */
    public function userCanManageProject(User $user): bool
    {
        return $user->can('manage-projects')
            || $this->owner_id === $user->id
            || $this->isProjectAdmin($user);
    }

    /**
     * Who may retire the project — archive/unarchive it or delete it.
     *
     * The owner and global project managers only. A project admin runs the
     * project day to day and can change everything inside it, but taking the
     * whole project out of circulation stays with the person who owns it. This
     * is the one thing that separates a project admin from the owner.
     */
    public function userCanArchiveOrDelete(User $user): bool
    {
        return $user->can('manage-projects')
            || $this->owner_id === $user->id;
    }

    public function customFields(): HasMany
    {
        return $this->hasMany(CustomField::class)->orderBy('position');
    }

    public function forms(): HasMany
    {
        return $this->hasMany(Form::class);
    }

    public function charts(): HasMany
    {
        return $this->hasMany(ProjectChart::class)->orderBy('position')->orderBy('id');
    }
}
