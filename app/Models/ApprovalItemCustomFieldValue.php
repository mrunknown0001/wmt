<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApprovalItemCustomFieldValue extends Model
{
    use HasFactory;

    protected $fillable = [
        'approval_item_id',
        'approval_custom_field_id',
        'value_text',
        'value_number',
        'value_date',
        'value_json',
        'value_option_id',
    ];

    protected function casts(): array
    {
        return [
            'value_number' => 'decimal:4',
            'value_date' => 'date',
            'value_json' => 'array',
        ];
    }

    public function approvalItem(): BelongsTo
    {
        return $this->belongsTo(ApprovalItem::class);
    }

    public function customField(): BelongsTo
    {
        return $this->belongsTo(ApprovalCustomField::class);
    }

    public function selectedOption(): BelongsTo
    {
        return $this->belongsTo(ApprovalCustomFieldOption::class, 'value_option_id');
    }

    public function getValueAttribute()
    {
        if (!$this->customField) {
            $this->load('customField');
        }

        $type = $this->customField->type;

        return match ($type) {
            'text', 'textarea' => $this->value_text,
            'number' => $this->value_number,
            'date' => $this->value_date,
            'single_select' => $this->value_option_id,
            'multi_select' => $this->value_json,
            default => null,
        };
    }

    public function setTypedValue(string $type, mixed $rawValue): self
    {
        $this->value_text = null;
        $this->value_number = null;
        $this->value_date = null;
        $this->value_json = null;
        $this->value_option_id = null;

        if ($rawValue === null || $rawValue === '') {
            return $this;
        }

        match ($type) {
            'text' => $this->value_text = substr((string) $rawValue, 0, ApprovalCustomField::TEXT_MAX_LENGTH),
            'textarea' => $this->value_text = substr((string) $rawValue, 0, ApprovalCustomField::TEXTAREA_MAX_LENGTH),
            'number' => $this->value_number = max(ApprovalCustomField::NUMBER_MIN, min(ApprovalCustomField::NUMBER_MAX, (float) $rawValue)),
            'date' => $this->value_date = $rawValue,
            'single_select' => $this->value_option_id = (int) $rawValue,
            'multi_select' => $this->value_json = is_array($rawValue) ? $rawValue : [$rawValue],
            default => null,
        };

        return $this;
    }
}
