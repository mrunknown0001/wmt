<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable, HasRoles;

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
        'email_task_assigned'    => true,
        'email_task_due_soon'    => true,
        'email_task_overdue'     => true,
        'email_task_comment'     => true,
        'email_task_mention'     => true,
        'email_comment_deleted'  => false,
        'email_task_escalated'   => true,
    ];

    protected $fillable = [
        'name',
        'email',
        'password',
        'position',
        'department_id',
        'team_id',
        'is_active',
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

    public function wantsEmail(string $type): bool
    {
        $prefs = $this->getNotificationPreferences();
        return $prefs["email_{$type}"] ?? false;
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
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
}
