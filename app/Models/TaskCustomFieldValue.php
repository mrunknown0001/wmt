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
            'value_date' => 'date:Y-m-d',
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
    /**
     * Human-readable value for people fields, so the UI doesn't have to resolve
     * user ids itself. Appended so it reaches the front end.
     */
    protected $appends = ['people_names'];

    public function getPeopleNamesAttribute(): ?string
    {
        if (!$this->relationLoaded('customField')) {
            $this->load('customField');
        }
        if (($this->customField?->type) !== 'people') {
            return null;
        }

        $ids = array_values(array_filter((array) ($this->value_json ?? [])));
        if (empty($ids)) {
            return null;
        }

        $names = User::whereIn('id', $ids)->orderBy('name')->pluck('name')->all();

        return $names ? implode(', ', $names) : null;
    }

    public function getValueAttribute(): mixed
    {
        return match ($this->customField?->type) {
            'text', 'textarea' => $this->value_text,
            'number' => $this->value_number,
            'date', 'week_of_year' => $this->value_date,
            'single_select' => $this->value_option_id,
            'multi_select', 'people' => $this->value_json,
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
            'text' => $this->value_text = mb_substr((string) $rawValue, 0, CustomField::TEXT_MAX_LENGTH),
            'textarea' => $this->value_text = mb_substr((string) $rawValue, 0, CustomField::TEXTAREA_MAX_LENGTH),
            'number' => $this->value_number = max(CustomField::NUMBER_MIN, min(CustomField::NUMBER_MAX, (float) $rawValue)),
            // Week of year stores the reference date; the week is derived on read.
            'date', 'week_of_year' => $this->value_date = $rawValue,
            'single_select' => $this->value_option_id = (int) $rawValue,
            'multi_select' => $this->value_json = is_array($rawValue) ? $rawValue : [$rawValue],
            // People: a list of user ids, normalised to ints so lookups are exact.
            'people' => $this->value_json = collect(is_array($rawValue) ? $rawValue : [$rawValue])
                ->filter(fn ($id) => $id !== null && $id !== '')
                ->map(fn ($id) => (int) $id)
                ->unique()->values()->all(),
            default => null,
        };
    }
}
