<?php

namespace App\Models;

use App\Observers\DivisionObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;

#[ObservedBy(DivisionObserver::class)]
class Division extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'description',
        'head_id',
    ];

    public function head(): BelongsTo
    {
        return $this->belongsTo(User::class, 'head_id');
    }

    public function departments(): HasMany
    {
        return $this->hasMany(Department::class);
    }

    public function teams(): HasManyThrough
    {
        return $this->hasManyThrough(Team::class, Department::class);
    }
}
