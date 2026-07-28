<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
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
    ];

    protected function casts(): array
    {
        return [
            'due_date' => 'date',
            'is_pinned' => 'boolean',
            'require_comment_attachment_on_close' => 'boolean',
            'hide_completed_tasks' => 'boolean',
        ];
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
