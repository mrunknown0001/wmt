<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiMessageAttachment extends Model
{
    protected $fillable = [
        'ai_message_id',
        'file_name',
        'file_path',
        'file_type',
        'file_size',
        'kind',
        'extracted_text',
    ];

    protected function casts(): array
    {
        return ['file_size' => 'integer'];
    }

    public function message(): BelongsTo
    {
        return $this->belongsTo(AiMessage::class, 'ai_message_id');
    }
}
