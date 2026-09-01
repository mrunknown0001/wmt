<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Cache;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable, HasRoles, SoftDeletes;

    public const DASHBOARD_DEFAULTS = [
        'showTaskStats'    => true,
        'showProgressBars' => true,
        'showActivityFeed' => true,
        'showCharts'       => true,
        'showDueToday'     => true,
        'showQuickActions' => true,
        'showTeamWorkload' => true,
    ];

    /**
     * Per-user email notification preferences.
     *
     * Deliberately the same key set as Setting::NOTIFICATION_CHANNEL_DEFAULTS
     * rather than a list of its own: the two are the same question asked at two
     * levels — the administrator decides which emails the system may send at
     * all, and each person decides which of those they personally want. Deriving
     * it means a type added to one cannot go missing from the other.
     *
     * This replaced an earlier five-key set (task_assigned, task_comments,
     * mentions, due_reminders, task_escalated) that nothing ever read or wrote;
     * getNotificationPreferences() filters those stale keys out of stored data.
     */
    public const NOTIFICATION_DEFAULTS = Setting::NOTIFICATION_CHANNEL_DEFAULTS;

    protected $fillable = [
        'name',
        'email',
        'password',
        'position',
        'department_id',
        'team_id',
        'is_active',
        'can_create_rules',
        'can_approve',
        'can_create_project',
        'daily_capacity_minutes',
        'working_days',
        'can_request',
        'dashboard_preferences',
        'notification_preferences',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'can_create_rules' => 'boolean',
            'can_approve' => 'boolean',
            'can_create_project' => 'boolean',
            'daily_capacity_minutes' => 'integer',
            'working_days' => 'array',
            'can_request' => 'boolean',
            'dashboard_preferences' => 'array',
            'notification_preferences' => 'array',
        ];
    }

    public function getDashboardPreferences(): array
    {
        return array_merge(self::DASHBOARD_DEFAULTS, $this->dashboard_preferences ?? []);
    }

    /**
     * This person's preferences, with anything they have not expressed an
     * opinion on falling back to the default.
     *
     * Stored values are intersected with the known keys first, so preferences
     * written under the previous schema — or a type since retired — cannot leak
     * into the API response as phantom settings.
     */
    public function getNotificationPreferences(): array
    {
        return array_merge(
            self::NOTIFICATION_DEFAULTS,
            array_intersect_key($this->notification_preferences ?? [], self::NOTIFICATION_DEFAULTS)
        );
    }

    /**
     * Whether this person wants the email for a given notification type.
     * Mirrors Setting::wantsEmail(), which asks the same of the whole system.
     *
     * Consulted when sending, via ChecksEmailPreference::channelsFor(): the
     * administrator's setting decides which types the system may send, and this
     * decides which of those the person actually receives. A preference can
     * therefore turn an email off, but cannot turn on one the administrator has
     * disabled — and neither applies where email is switched off entirely.
     */
    public function wantsEmail(string $type): bool
    {
        return $this->getNotificationPreferences()["email_{$type}"] ?? false;
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function linkGroups(): BelongsToMany
    {
        return $this->belongsToMany(LinkGroup::class, 'link_group_user');
    }

    /**
     * Whether the user may reach the Approvals area. Admins and executives always
     * can (so they're never locked out), independent of the can_approve flag which
     * governs ordinary approvers.
     */
    public function canAccessApprovals(): bool
    {
        return $this->can_approve || $this->hasRole('admin') || $this->hasRole('executive');
    }

    /**
     * Whether this user may start a new project.
     *
     * Anyone who administers projects can, without needing the flag set —
     * mirroring how canAccessApprovals() treats admins, so nobody who is
     * supposed to be running the place can be locked out by a checkbox.
     */
    public function canCreateProjects(): bool
    {
        return (bool) $this->can_create_project || $this->can('manage-projects');
    }

    /** True if this user heads a division/department or leads a team. */
    /**
     * Cached: this is read from the shared Inertia props on every request, and
     * uncached it costs three EXISTS queries each time. Org headship changes when
     * someone is appointed, so a short TTL is ample.
     */
    public function headsAnyOrgUnit(): bool
    {
        return Cache::remember(
            "user:{$this->id}:heads-org-unit",
            now()->addMinutes(30),
            fn () => Division::where('head_id', $this->id)->exists()
                || Department::where('head_id', $this->id)->exists()
                || Team::where('leader_id', $this->id)->exists()
        );
    }

    /**
     * Heads a division or a department, rather than any unit at all.
     *
     * Its own question because Workload answers to it: a head is shown the
     * branch they run, which is a different thing from the whole organisation
     * the admin permission opens. Team leaders are not included — a team's load
     * is visible to whoever runs the department above it.
     */
    public function headsDivisionOrDepartment(): bool
    {
        return Cache::remember(
            "user:{$this->id}:heads-div-or-dept",
            now()->addMinutes(30),
            fn () => Division::where('head_id', $this->id)->exists()
                || Department::where('head_id', $this->id)->exists()
        );
    }

    /** May look at the Workload page, over the whole org or their own branch. */
    public function canViewWorkload(): bool
    {
        return $this->can('view-workload') || $this->headsDivisionOrDepartment();
    }

    /** Drop the cached headship flags — call after changing an org unit's head. */
    public static function forgetOrgHeadCache(?int $userId): void
    {
        if ($userId) {
            Cache::forget("user:{$userId}:heads-org-unit");
            Cache::forget("user:{$userId}:heads-div-or-dept");
        }
    }

    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }

    public function ownedProjects(): HasMany
    {
        return $this->hasMany(Project::class, 'owner_id');
    }

    public function assignedTasks(): HasMany
    {
        return $this->hasMany(Task::class, 'assigned_to');
    }

    public function memberProjects(): BelongsToMany
    {
        return $this->belongsToMany(Project::class, 'project_members')
            ->withPivot('role')
            ->withTimestamps();
    }

    public function collaboratedTasks(): BelongsToMany
    {
        return $this->belongsToMany(Task::class, 'task_collaborators')
            ->withTimestamps();
    }

    public function aiConversations(): HasMany
    {
        return $this->hasMany(AiConversation::class);
    }

    public function deviceTokens(): HasMany
    {
        return $this->hasMany(DeviceToken::class);
    }

    public function personalTodos(): HasMany
    {
        return $this->hasMany(PersonalTodo::class);
    }

    public function notifications(): \Illuminate\Database\Eloquent\Relations\MorphMany
    {
        return $this->morphMany(DatabaseNotification::class, 'notifiable')
            ->latest();
    }
}
