<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApprovalFormField extends Model
{
    use HasFactory;

    public const TYPES = [
        'text', 'textarea', 'select', 'multi_select', 'date', 'number', 'email',
        'heading', 'description', 'attachment', 'capture_photo', 'capture_video'
    ];

    public const STATIC_TYPES = ['heading', 'description'];
    public const FILE_TYPES = ['attachment', 'capture_photo', 'capture_video'];

    protected $fillable = [
        'approval_form_id',
        'type',
        'label',
        'help_text',
        'is_required',
        'position',
        'config',
        'maps_to',
        'custom_field_id',
        'default_value',
        'is_visible',
        'conditions',
    ];

    protected function casts(): array
    {
        return [
            'is_required' => 'boolean',
            'is_visible' => 'boolean',
            'config' => 'array',
            'conditions' => 'array',
        ];
    }

    public function approvalForm(): BelongsTo
    {
        return $this->belongsTo(ApprovalForm::class);
    }

    public function customField(): BelongsTo
    {
        return $this->belongsTo(ApprovalCustomField::class);
    }
}
