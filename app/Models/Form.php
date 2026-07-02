<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Form extends Model
{
    protected $fillable = [
        'project_id',
        'name',
        'description',
        'uuid',
        'is_active',
        'submit_button_text',
        'success_message',
        'task_defaults',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'task_defaults' => 'array',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (Form $form) {
            $form->uuid = $form->uuid ?: (string) Str::uuid();
        });
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function fields(): HasMany
    {
        return $this->hasMany(FormField::class)->orderBy('position');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function getPublicUrlAttribute(): string
    {
        return url("/forms/{$this->uuid}");
    }
}
