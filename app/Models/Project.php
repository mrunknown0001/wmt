<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Project extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'description',
        'status',
        'owner_id',
        'folder_id',
        'due_date',
        'is_pinned',
        'position',
    ];

    protected function casts(): array
    {
        return [
            'due_date' => 'date',
            'is_pinned' => 'boolean',
        ];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function folder(): BelongsTo
    {
        return $this->belongsTo(Folder::class);
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    public function sections(): HasMany
    {
        return $this->hasMany(TaskSection::class);
    }

    public function automationRules(): HasMany
    {
        return $this->hasMany(ProjectAutomationRule::class);
    }

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'project_members')
            ->withPivot('role')
            ->withTimestamps();
    }

    public function isProjectAdmin(User $user): bool
    {
        return $this->members()->where('user_id', $user->id)->where('role', 'admin')->exists();
    }

    public function customFields(): HasMany
    {
        return $this->hasMany(CustomField::class)->orderBy('position');
    }

    public function forms(): HasMany
    {
        return $this->hasMany(Form::class);
    }

    public function charts(): HasMany
    {
        return $this->hasMany(ProjectChart::class)->orderBy('position')->orderBy('id');
    }
}
