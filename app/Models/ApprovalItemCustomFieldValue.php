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

    /**
     * `value` is type-dependent and `display_value` resolves select options to
     * their labels. Both are accessors, so they must be appended to appear in the
     * JSON handed to the front end.
     */
    protected $appends = ['value', 'display_value'];

    protected function casts(): array
    {
        return [
            'value_number' => 'decimal:4',
            'value_date' => 'date:Y-m-d',
            'value_json' => 'array',
        ];
    }

    public function approvalItem(): BelongsTo
    {
        return $this->belongsTo(ApprovalItem::class);
    }

    public function customField(): BelongsTo
    {
        // Explicit FK: the column is approval_custom_field_id, but Eloquent would
        // infer custom_field_id from the method name and always resolve to null.
        return $this->belongsTo(ApprovalCustomField::class, 'approval_custom_field_id');
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
            'date', 'week_of_year' => $this->value_date,
            'single_select' => $this->value_option_id,
            'multi_select', 'people' => $this->value_json,
            default => null,
        };
    }

    /**
     * Human-readable value for display. Select types store option IDs, so those
     * are resolved back to their labels.
     */
    public function getDisplayValueAttribute(): ?string
    {
        if (!$this->customField) {
            $this->load('customField');
        }

        return match ($this->customField?->type) {
            'text', 'textarea' => $this->value_text,
            'number' => $this->value_number === null
                ? null
                : rtrim(rtrim((string) $this->value_number, '0'), '.'),
            'date' => $this->value_date?->format('M j, Y'),
            // ISO week of the stored reference date, e.g. "Week 31, 2026".
            'week_of_year' => $this->value_date
                ? 'Week ' . $this->value_date->isoWeek() . ', ' . $this->value_date->isoWeekYear()
                : null,
            'single_select' => $this->optionLabels([$this->value_option_id]),
            'multi_select' => $this->optionLabels($this->value_json ?? []),
            'people' => $this->peopleNames($this->value_json ?? []),
            default => null,
        };
    }

    /** Resolve stored user ids to names for display. */
    private function peopleNames(array $ids): ?string
    {
        $ids = array_values(array_filter($ids, fn ($id) => $id !== null && $id !== ''));

        if (empty($ids)) {
            return null;
        }

        $names = User::whereIn('id', $ids)->orderBy('name')->pluck('name')->all();

        return $names ? implode(', ', $names) : null;
    }

    /** Map option IDs to labels, falling back to the raw values if they aren't IDs. */
    private function optionLabels(array $ids): ?string
    {
        $ids = array_values(array_filter($ids, fn ($id) => $id !== null && $id !== ''));

        if (empty($ids)) {
            return null;
        }

        $labels = $this->customField?->options
            ->whereIn('id', $ids)
            ->pluck('label')
            ->all() ?? [];

        return implode(', ', !empty($labels) ? $labels : $ids);
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

        return $this;
    }
}
