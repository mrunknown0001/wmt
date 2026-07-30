<?php

namespace App\Services;

use App\Models\Note;
use App\Models\NoteFolder;
use App\Models\NoteFolderShare;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Who can reach a note, and with what role.
 *
 * A note is reachable two ways: shared directly, or filed in a folder that is
 * shared (or under one that is). Where both apply the stronger role wins, so
 * adding a broad folder share can only widen access, never quietly narrow
 * someone who already had more.
 */
class NoteAccess
{
    private const RANK = [
        Note::ROLE_VIEWER => 1,
        Note::ROLE_EDITOR => 2,
        Note::ROLE_ADMIN => 3,
        Note::ROLE_OWNER => 4,
    ];

    /**
     * Per-request cache of folder access, keyed by user id.
     *
     * Resolving it walks every folder share and expands each to its subtree —
     * worth doing once for a page that renders a list of notes, not once per
     * note. Flushed whenever a share or a folder's position changes.
     *
     * @var array<int, array<int, string>>
     */
    private static array $folderRoles = [];

    public static function flush(): void
    {
        self::$folderRoles = [];
    }

    /**
     * Folder id => best role this user holds over it, including folders
     * inherited from a shared ancestor.
     *
     * @return array<int, string>
     */
    public static function folderRoles(User $user): array
    {
        if (array_key_exists($user->id, self::$folderRoles)) {
            return self::$folderRoles[$user->id];
        }

        $audience = Note::audienceFor($user);

        if (empty($audience)) {
            return self::$folderRoles[$user->id] = [];
        }

        $shares = NoteFolderShare::query()
            ->where(function (Builder $q) use ($audience) {
                foreach ($audience as [$type, $id]) {
                    $q->orWhere(fn (Builder $p) => $p
                        ->where('shareable_type', $type)
                        ->where('shareable_id', $id));
                }
            })
            ->get();

        if ($shares->isEmpty()) {
            return self::$folderRoles[$user->id] = [];
        }

        $folders = NoteFolder::whereIn('id', $shares->pluck('note_folder_id')->unique())
            ->get(['id', 'path'])
            ->keyBy('id');

        $roles = [];

        foreach ($shares as $share) {
            $folder = $folders[$share->note_folder_id] ?? null;

            if (!$folder) {
                continue;
            }

            // The folder itself, plus everything filed beneath it.
            $ids = array_merge(
                [(int) $folder->id],
                NoteFolder::where('path', 'like', $folder->path . '%')
                    ->where('id', '!=', $folder->id)
                    ->pluck('id')->map(fn ($id) => (int) $id)->all(),
            );

            foreach ($ids as $id) {
                $roles[$id] = self::stronger($roles[$id] ?? null, $share->role);
            }
        }

        return self::$folderRoles[$user->id] = $roles;
    }

    /** The role a user holds over a note: owner/admin/editor/viewer, or null. */
    public static function roleFor(Note $note, ?User $user): ?string
    {
        if (!$user) {
            return null;
        }

        if ((int) $note->user_id === (int) $user->id) {
            return Note::ROLE_OWNER;
        }

        $direct = self::directRole($note, $user);

        $inherited = $note->note_folder_id
            ? (self::folderRoles($user)[(int) $note->note_folder_id] ?? null)
            : null;

        return self::stronger($direct, $inherited);
    }

    /** Only the shares placed on the note itself. */
    private static function directRole(Note $note, User $user): ?string
    {
        $audience = Note::audienceFor($user);

        if (empty($audience)) {
            return null;
        }

        $shares = $note->relationLoaded('shares') ? $note->shares : $note->shares()->get();
        $best = null;

        foreach ($shares as $share) {
            $matches = false;

            foreach ($audience as [$type, $id]) {
                if ($share->shareable_type === $type && (int) $share->shareable_id === $id) {
                    $matches = true;
                    break;
                }
            }

            if ($matches) {
                $best = self::stronger($best, $share->role);
            }
        }

        return $best;
    }

    /** Constrain a note query to what the user owns or has been given. */
    public static function scopeVisible(Builder $query, User $user): Builder
    {
        $audience = Note::audienceFor($user);
        $folderIds = array_keys(self::folderRoles($user));

        return $query->where(function (Builder $q) use ($user, $audience, $folderIds) {
            $q->where('notes.user_id', $user->id)
                ->orWhereHas('shares', function (Builder $s) use ($audience) {
                    $s->where(function (Builder $any) use ($audience) {
                        foreach ($audience as [$type, $id]) {
                            $any->orWhere(fn (Builder $p) => $p
                                ->where('shareable_type', $type)
                                ->where('shareable_id', $id));
                        }
                    });
                });

            if (!empty($folderIds)) {
                $q->orWhereIn('notes.note_folder_id', $folderIds);
            }
        });
    }

    /** The more generous of two roles, either of which may be null. */
    public static function stronger(?string $a, ?string $b): ?string
    {
        if ($a === null) {
            return $b;
        }

        if ($b === null) {
            return $a;
        }

        return (self::RANK[$a] ?? 0) >= (self::RANK[$b] ?? 0) ? $a : $b;
    }
}
