<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class ApprovalForm extends Model
{
    use HasFactory;

    protected $fillable = [
        'approval_project_id',
        'name',
        'description',
        'uuid',
        'is_active',
        'submit_button_text',
        'success_message',
        'item_defaults',
        'created_by',
        'logo_path',
        'logo_position',
        'banner_path',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'item_defaults' => 'array',
        ];
    }

    protected static function boot()
    {
        parent::boot();

        static::creating(function (self $form) {
            if (!$form->uuid) {
                $form->uuid = Str::uuid();
            }
        });
    }

    public function approvalProject(): BelongsTo
    {
        return $this->belongsTo(ApprovalProject::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function fields(): HasMany
    {
        return $this->hasMany(ApprovalFormField::class)->orderBy('position');
    }

    public function getPublicUrlAttribute(): string
    {
        return url("/forms-approval/{$this->uuid}");
    }
}
