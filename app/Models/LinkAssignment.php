<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class LinkAssignment extends Model
{
    protected $fillable = [
        'link_id',
        'assignable_type',
        'assignable_id',
    ];

    /** Assignable target types, keyed by the short name used in the UI payload. */
    public const TYPES = [
        'user' => User::class,
        'team' => Team::class,
        'department' => Department::class,
        'division' => Division::class,
        'role' => \Spatie\Permission\Models\Role::class,
        'group' => LinkGroup::class,
    ];

    public function link(): BelongsTo
    {
        return $this->belongsTo(Link::class);
    }

    public function assignable(): MorphTo
    {
        return $this->morphTo();
    }

    /** Short key for the UI, e.g. App\Models\Team => 'team'. */
    public function getTypeKeyAttribute(): ?string
    {
        return array_search($this->assignable_type, self::TYPES, true) ?: null;
    }
}
