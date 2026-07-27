<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ApprovalCustomField extends Model
{
    use HasFactory;

    public const TYPES = ['text', 'textarea', 'number', 'date', 'single_select', 'multi_select', 'people', 'week_of_year', 'formula'];
    public const TEXT_MAX_LENGTH = 255;
    public const TEXTAREA_MAX_LENGTH = 10000;
    public const NUMBER_MIN = -99999999999;
    public const NUMBER_MAX = 99999999999;

    protected $fillable = [
        'approval_project_id',
        'name',
        'type',
        'is_required',
        'position',
        'config',
    ];

    protected function casts(): array
    {
        return [
            'is_required' => 'boolean',
            'config' => 'array',
        ];
    }

    public function approvalProject(): BelongsTo
    {
        return $this->belongsTo(ApprovalProject::class);
    }

    public function options(): HasMany
    {
        return $this->hasMany(ApprovalCustomFieldOption::class)->orderBy('position');
    }

    public function values(): HasMany
    {
        return $this->hasMany(ApprovalItemCustomFieldValue::class);
    }
}
