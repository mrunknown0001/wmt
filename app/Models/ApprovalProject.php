<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class ApprovalProject extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'name',
        'description',
        'status',
        'owner_id',
        'due_date',
        'is_pinned',
        'position',
    ];

    protected function casts(): array
    {
        return [
            'due_date' => 'date',
            'is_pinned' => 'boolean',
        ];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'approval_project_members')
            ->withPivot('role')
            ->withTimestamps();
    }

    public function sections(): HasMany
    {
        return $this->hasMany(ApprovalSection::class)->orderBy('position');
    }

    public function customFields(): HasMany
    {
        return $this->hasMany(ApprovalCustomField::class)->orderBy('position');
    }

    public function chains(): HasMany
    {
        return $this->hasMany(ApprovalChain::class)->orderBy('priority');
    }

    public function approvalItems(): HasMany
    {
        return $this->hasMany(ApprovalItem::class)->orderBy('position');
    }

    public function approvalForms(): HasMany
    {
        return $this->hasMany(ApprovalForm::class);
    }

    public function automationRules(): HasMany
    {
        return $this->hasMany(ApprovalAutomationRule::class);
    }

    public function isProjectAdmin(User $user): bool
    {
        return $this->members()->where('user_id', $user->id)
            ->whereIn('role', ['admin', 'co-owner'])
            ->exists();
    }

    public function coOwners(): BelongsToMany
    {
        return $this->members()->wherePivot('role', 'co-owner');
    }
}
