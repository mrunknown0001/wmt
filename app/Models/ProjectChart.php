<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectChart extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'title',
        'chart_type',
        'group_by',
        'config',
        'position',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'config' => 'array',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
