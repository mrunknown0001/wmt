<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class ApprovalChain extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'approval_project_id',
        'name',
        'description',
        'is_default',
        'is_active',
        'priority',
        'selector_conditions',
        'on_reject_behavior',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
            'is_active' => 'boolean',
            'selector_conditions' => 'array',
        ];
    }

    public function approvalProject(): BelongsTo
    {
        return $this->belongsTo(ApprovalProject::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function versions(): HasMany
    {
        return $this->hasMany(ApprovalChainVersion::class)->orderBy('version_number');
    }

    public function currentVersion()
    {
        return $this->versions()->where('is_current', true)->first();
    }
}
