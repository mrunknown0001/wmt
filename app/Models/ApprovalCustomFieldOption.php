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
        return $this->belongsTo(ApprovalCustomField::class);
    }
}
