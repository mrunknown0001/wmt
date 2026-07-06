<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FormField extends Model
{
    public const TYPES = ['text', 'textarea', 'select', 'multi_select', 'date', 'number', 'heading', 'description', 'attachment'];
    public const STATIC_TYPES = ['heading', 'description'];

    protected $fillable = [
        'form_id',
        'type',
        'label',
        'help_text',
        'is_required',
        'position',
        'config',
        'default_value',
        'is_visible',
        'maps_to',
        'custom_field_id',
    ];

    protected function casts(): array
    {
        return [
            'is_required' => 'boolean',
            'is_visible' => 'boolean',
            'position' => 'integer',
            'config' => 'array',
        ];
    }

    public function form(): BelongsTo
    {
        return $this->belongsTo(Form::class);
    }

    public function customField(): BelongsTo
    {
        return $this->belongsTo(CustomField::class);
    }
}
