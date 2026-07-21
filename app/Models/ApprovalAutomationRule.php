<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApprovalAutomationRule extends Model
{
    use HasFactory;

    protected $fillable = [
        'approval_project_id',
        'name',
        'is_active',
        'trigger_type',
        'trigger_config',
        'conditions',
        'actions',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'trigger_config' => 'array',
            'conditions' => 'array',
            'actions' => 'array',
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

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
