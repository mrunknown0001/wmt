<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CustomField extends Model
{
    public const TYPES = ['text', 'textarea', 'number', 'date', 'single_select', 'multi_select', 'formula'];

    public const TEXT_MAX_LENGTH = 255;
    public const TEXTAREA_MAX_LENGTH = 10000;
    public const NUMBER_MAX = 99999999999;
    public const NUMBER_MIN = -99999999999;

    protected $fillable = [
        'project_id',
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
            'position' => 'integer',
            'config' => 'array',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function options(): HasMany
    {
        return $this->hasMany(CustomFieldOption::class)->orderBy('position');
    }

    public function values(): HasMany
    {
        return $this->hasMany(TaskCustomFieldValue::class);
    }
}
