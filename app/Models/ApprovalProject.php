<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;

class ApprovalProject extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'name',
        'description',
        'status',
        'owner_id',
        'due_date',
        'is_pinned',
        'position',
        'series_prefix',
        'series_padding',
    ];

    protected function casts(): array
    {
        return [
            'due_date' => 'date:Y-m-d',
            'is_pinned' => 'boolean',
            'series_padding' => 'integer',
            'series_next' => 'integer',
        ];
    }

    /** Widest sequence the padding setting may be asked to produce. */
    public const SERIES_MIN_PADDING = 1;
    public const SERIES_MAX_PADDING = 10;

    /** True once a prefix has been set — from then on it is fixed. */
    public function hasSeries(): bool
    {
        return filled($this->series_prefix);
    }

    /** e.g. "SP-OPS-" + 42 => "SP-OPS-00042" */
    public function formatSeries(int $sequence): string
    {
        $padding = max(self::SERIES_MIN_PADDING, min(self::SERIES_MAX_PADDING, (int) $this->series_padding));

        return $this->series_prefix . str_pad((string) $sequence, $padding, '0', STR_PAD_LEFT);
    }

    /** What the next number will look like — used for the live preview. */
    public function previewSeries(): ?string
    {
        return $this->hasSeries() ? $this->formatSeries((int) ($this->series_next ?: 1)) : null;
    }

    /**
     * Claim the next sequence for this project.
     *
     * The row is locked for the read-modify-write so two submissions arriving at
     * once cannot be handed the same number — a real risk here, since approval
     * items are created by public forms as well as by users in the app.
     *
     * Returns null when the project has no prefix configured, in which case items
     * simply carry no series.
     *
     * @return array{0: string, 1: int}|null [formatted number, sequence]
     */
    public static function claimNextSeries(int $projectId): ?array
    {
        return DB::transaction(function () use ($projectId) {
            $project = static::query()->whereKey($projectId)->lockForUpdate()->first();

            if (!$project || !$project->hasSeries()) {
                return null;
            }

            $sequence = max(1, (int) $project->series_next);

            // saveQuietly: bumping the counter is bookkeeping, not a project edit,
            // and must not fire observers or touch timestamps.
            $project->series_next = $sequence + 1;
            $project->saveQuietly();

            return [$project->formatSeries($sequence), $sequence];
        });
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'approval_project_members')
            ->withPivot('role')
            ->withTimestamps();
    }

    public function sections(): HasMany
    {
        return $this->hasMany(ApprovalSection::class)->orderBy('position');
    }

    public function customFields(): HasMany
    {
        return $this->hasMany(ApprovalCustomField::class)->orderBy('position');
    }

    public function chains(): HasMany
    {
        return $this->hasMany(ApprovalChain::class)->orderBy('priority');
    }

    public function approvalItems(): HasMany
    {
        return $this->hasMany(ApprovalItem::class)->orderBy('position');
    }

    public function approvalForms(): HasMany
    {
        return $this->hasMany(ApprovalForm::class);
    }

    public function automationRules(): HasMany
    {
        return $this->hasMany(ApprovalAutomationRule::class);
    }

    public function isProjectAdmin(User $user): bool
    {
        return $this->members()->where('user_id', $user->id)
            ->whereIn('role', ['admin', 'co-owner'])
            ->exists();
    }

    public function coOwners(): BelongsToMany
    {
        return $this->members()->wherePivot('role', 'co-owner');
    }
}
