<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TaskCustomFieldValue extends Model
{
    protected $fillable = [
        'task_id',
        'custom_field_id',
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

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function customField(): BelongsTo
    {
        return $this->belongsTo(CustomField::class);
    }

    public function selectedOption(): BelongsTo
    {
        return $this->belongsTo(CustomFieldOption::class, 'value_option_id');
    }

    /**
     * Get the typed value based on the custom field type.
     */
    public function getValueAttribute(): mixed
    {
        return match ($this->customField?->type) {
            'text' => $this->value_text,
            'number' => $this->value_number,
            'date' => $this->value_date,
            'single_select' => $this->value_option_id,
            'multi_select' => $this->value_json,
            default => null,
        };
    }

    /**
     * Set the appropriate typed column based on field type.
     */
    public function setTypedValue(string $type, mixed $rawValue): void
    {
        // Clear all value columns first
        $this->value_text = null;
        $this->value_number = null;
        $this->value_date = null;
        $this->value_json = null;
        $this->value_option_id = null;

        if ($rawValue === null || $rawValue === '') {
            return;
        }

        match ($type) {
            'text' => $this->value_text = (string) $rawValue,
            'number' => $this->value_number = (float) $rawValue,
            'date' => $this->value_date = $rawValue,
            'single_select' => $this->value_option_id = (int) $rawValue,
            'multi_select' => $this->value_json = is_array($rawValue) ? $rawValue : [$rawValue],
            default => null,
        };
    }
}
