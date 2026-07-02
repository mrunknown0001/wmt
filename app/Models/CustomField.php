<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CustomField extends Model
{
    public const TYPES = ['text', 'number', 'date', 'single_select', 'multi_select'];

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
