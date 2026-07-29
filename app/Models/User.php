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

    public const NOTIFICATION_DEFAULTS = [
        'task_assigned'  => true,
        'task_comments'  => true,
        'mentions'       => true,
        'due_reminders'  => true,
        'task_escalated' => true,
    ];

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
            'can_request' => 'boolean',
            'dashboard_preferences' => 'array',
            'notification_preferences' => 'array',
        ];
    }

    public function getDashboardPreferences(): array
    {
        return array_merge(self::DASHBOARD_DEFAULTS, $this->dashboard_preferences ?? []);
    }

    public function getNotificationPreferences(): array
    {
        return array_merge(self::NOTIFICATION_DEFAULTS, $this->notification_preferences ?? []);
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

    /** Drop the cached headship flag — call after changing an org unit's head. */
    public static function forgetOrgHeadCache(?int $userId): void
    {
        if ($userId) {
            Cache::forget("user:{$userId}:heads-org-unit");
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
