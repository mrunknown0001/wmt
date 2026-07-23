<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Link extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'title',
        'description',
        'url',
        'user_id',
        'created_by',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(LinkAssignment::class);
    }

    /**
     * Limit to links visible to a user: assigned to them directly, to one of their
     * org units (team / department / division), to a role they hold, or to a custom
     * group they belong to. `user_id` is still honoured for pre-grouping links.
     */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        // A user with only a team still belongs to that team's department.
        $departmentIds = array_filter([
            $user->department_id,
            $user->team_id ? Team::where('id', $user->team_id)->value('department_id') : null,
        ]);

        // Guard the empty case: an unconstrained query would match every
        // department and hand the user every division.
        $divisionIds = $departmentIds
            ? Department::whereIn('id', $departmentIds)->pluck('division_id')->filter()->all()
            : [];

        $targets = [
            User::class => [$user->id],
            Team::class => array_filter([$user->team_id]),
            Department::class => $departmentIds,
            Division::class => $divisionIds,
            \Spatie\Permission\Models\Role::class => $user->roles->pluck('id')->all(),
            LinkGroup::class => $user->linkGroups()->pluck('link_groups.id')->all(),
        ];

        return $query->where(function ($q) use ($user, $targets) {
            $q->where('links.user_id', $user->id); // legacy single-assignee links

            foreach ($targets as $type => $ids) {
                if (empty($ids)) {
                    continue;
                }
                $q->orWhereHas('assignments', function ($a) use ($type, $ids) {
                    $a->where('assignable_type', $type)->whereIn('assignable_id', $ids);
                });
            }
        });
    }
}
