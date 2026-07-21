<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApprovalSection extends Model
{
    use HasFactory;

    protected $fillable = [
        'approval_project_id',
        'name',
        'color',
        'position',
    ];

    public function approvalProject(): BelongsTo
    {
        return $this->belongsTo(ApprovalProject::class);
    }
}
