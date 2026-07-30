<?php

namespace App\Models;

use App\Services\NoteAccess;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Note extends Model
{
    use HasFactory, SoftDeletes;

    /**
     * What a share grants.
     *
     *  viewer — read only
     *  editor — read and change the content
     *  admin  — read, change, archive, delete, and manage who else it is shared with
     *
     * The owner is above all three and is not stored as a share.
     */
    public const ROLE_VIEWER = 'viewer';
    public const ROLE_EDITOR = 'editor';
    public const ROLE_ADMIN = 'admin';
    public const ROLE_OWNER = 'owner';

    public const ROLES = [self::ROLE_VIEWER, self::ROLE_EDITOR, self::ROLE_ADMIN];

    protected $fillable = [
        'user_id',
        'note_folder_id',
        'title',
        'content',
        'archived_at',
    ];

    protected function casts(): array
    {
        return [
            'archived_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // Keep the searchable plain text in step with the rich text. Done here
        // rather than in the controllers so a note saved from anywhere — the
        // form, an import, a console command — stays searchable.
        static::saving(function (Note $note) {
            if ($note->isDirty('content')) {
                $note->content_text = self::toPlainText($note->content);
            }
        });
    }

    /**
     * Strip markup for search and previews.
     *
     * Block tags become spaces first, otherwise "<p>one</p><p>two</p>" would
     * collapse to "onetwo" and neither word would be findable.
     */
    public static function toPlainText(?string $html): string
    {
        if (!$html) {
            return '';
        }

        $withBreaks = preg_replace('/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/i', ' ', $html);

        return trim(preg_replace('/\s+/', ' ', html_entity_decode(strip_tags($withBreaks), ENT_QUOTES | ENT_HTML5)));
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function folder(): BelongsTo
    {
        return $this->belongsTo(NoteFolder::class, 'note_folder_id');
    }

    public function shares(): HasMany
    {
        return $this->hasMany(NoteShare::class);
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }

    public function scopeArchived(Builder $query): Builder
    {
        return $query->whereNotNull('archived_at');
    }

    public function scopeNotArchived(Builder $query): Builder
    {
        return $query->whereNull('archived_at');
    }

    /**
     * Every audience a user belongs to, as [type, id] pairs.
     *
     * Division is reached through the user's department rather than stored on
     * the user, matching the org hierarchy elsewhere in the app.
     *
     * @return array<int, array{0: class-string, 1: int}>
     */
    public static function audienceFor(?User $user): array
    {
        if (!$user) {
            return [];
        }

        $audience = [[User::class, (int) $user->id]];

        if ($user->team_id) {
            $audience[] = [Team::class, (int) $user->team_id];
        }

        if ($user->department_id) {
            $audience[] = [Department::class, (int) $user->department_id];

            $divisionId = $user->relationLoaded('department')
                ? $user->department?->division_id
                : Department::whereKey($user->department_id)->value('division_id');

            if ($divisionId) {
                $audience[] = [Division::class, (int) $divisionId];
            }
        }

        return $audience;
    }

    /**
     * Notes the user owns, or that reach them through a share — on the note
     * itself, or on a folder it is filed in.
     */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return NoteAccess::scopeVisible($query, $user);
    }

    /**
     * What this user may do with the note: 'owner', 'admin', 'editor', 'viewer',
     * or null when it isn't shared with them at all.
     *
     * Reached more than one way — personally as a viewer, through their team as
     * an editor, through a shared folder as an admin — the most generous wins.
     */
    public function roleFor(?User $user): ?string
    {
        return NoteAccess::roleFor($this, $user);
    }

    public function canBeEditedBy(?User $user): bool
    {
        return in_array($this->roleFor($user), [self::ROLE_OWNER, self::ROLE_ADMIN, self::ROLE_EDITOR], true);
    }

    /** Deleting and archiving sit together: both take the note off everyone's list. */
    public function canBeAdministeredBy(?User $user): bool
    {
        return in_array($this->roleFor($user), [self::ROLE_OWNER, self::ROLE_ADMIN], true);
    }

    /** A short plain-text preview for the note list. */
    public function excerpt(int $length = 160): string
    {
        $text = (string) $this->content_text;

        return mb_strlen($text) > $length ? mb_substr($text, 0, $length) . '…' : $text;
    }
}
