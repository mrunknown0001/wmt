<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FormField extends Model
{
    public const TYPES = ['text', 'textarea', 'select', 'multi_select', 'date', 'number', 'email', 'heading', 'description', 'attachment', 'capture_photo', 'capture_video'];
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
        'conditions',
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
            'conditions' => 'array',
        ];
    }

    /**
     * How this field should actually behave, which is not always the stored type.
     *
     * A field mapped to a People custom field renders and validates as a
     * single-select over the scoped users. The stored type is whatever the field
     * was created as — fields added before People was supported were saved as
     * 'text', and would otherwise keep rendering as a free-text box forever.
     */
    public function effectiveType(): string
    {
        if ($this->customField?->type === 'people') {
            return 'people';
        }

        return $this->type;
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
