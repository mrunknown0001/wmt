<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One person's view settings for one project.
 *
 * Only the task sort lives here so far. It was kept in localStorage first,
 * which meant a sort chosen at a desk was gone on a laptop; the rest of the
 * view settings are still per browser.
 */
class ProjectViewPreference extends Model
{
    protected $fillable = [
        'user_id',
        'project_id',
        'preferences',
    ];

    protected function casts(): array
    {
        return [
            'preferences' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /**
     * The saved sort, or null.
     *
     * Read defensively: a key can outlive the custom field it names, and a row
     * written by an older shape should be ignored rather than handed to the UI.
     */
    public static function sortFor(?User $user, Project $project): ?array
    {
        if (! $user) {
            return null;
        }

        // The model rather than value(): the cast to array lives on the model,
        // and value() would hand back the raw JSON string.
        $row = static::query()
            ->where('user_id', $user->id)
            ->where('project_id', $project->id)
            ->first();

        $sort = $row?->preferences['sort'] ?? null;

        if (! is_array($sort)) {
            return null;
        }

        $key = $sort['key'] ?? null;
        $direction = $sort['direction'] ?? null;

        if (! is_string($key) || ! in_array($direction, ['asc', 'desc'], true)) {
            return null;
        }

        return ['key' => $key, 'direction' => $direction];
    }
}
