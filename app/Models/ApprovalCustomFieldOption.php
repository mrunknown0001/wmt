<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApprovalCustomFieldOption extends Model
{
    use HasFactory;

    protected $fillable = [
        'approval_custom_field_id',
        'label',
        'color',
        'position',
    ];

    public function customField(): BelongsTo
    {
        // Explicit FK — the column is approval_custom_field_id, not the
        // custom_field_id Eloquent would infer from the method name.
        return $this->belongsTo(ApprovalCustomField::class, 'approval_custom_field_id');
    }
}
