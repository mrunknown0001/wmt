<?php

namespace App\Services;

use App\Models\Department;
use App\Models\Division;
use App\Models\Note;
use App\Models\NoteFolder;
use App\Models\Team;
use App\Models\User;
use App\Notifications\NoteFolderSharedNotification;
use App\Notifications\NoteSharedNotification;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Notification;

/**
 * Tells people when something has been shared with them.
 *
 * Sharing with a division can mean a few hundred recipients, so the audience is
 * resolved to real users here and the notifications go out in one batched send
 * rather than one save per person.
 */
class NoteShareNotifier
{
    /** Recipients are batched at this size to keep memory flat on a big division. */
    private const CHUNK = 200;

    public static function noteShared(Note $note, string $shareableType, int $shareableId, string $role, User $actor): int
    {
        $recipients = self::recipients($shareableType, $shareableId)
            // Not the person who just did the sharing, and not the owner —
            // neither learns anything from being told.
            ->reject(fn (User $u) => (int) $u->id === (int) $actor->id || (int) $u->id === (int) $note->user_id);

        $label = self::audienceLabel($shareableType);

        $recipients->chunk(self::CHUNK)->each(function (Collection $chunk) use ($note, $actor, $role, $label) {
            Notification::send($chunk, new NoteSharedNotification($note, $actor, $role, $label));
        });

        return $recipients->count();
    }

    public static function folderShared(NoteFolder $folder, string $shareableType, int $shareableId, string $role, User $actor): int
    {
        $recipients = self::recipients($shareableType, $shareableId)
            ->reject(fn (User $u) => (int) $u->id === (int) $actor->id || (int) $u->id === (int) $folder->user_id);

        $label = self::audienceLabel($shareableType);

        // Counted once, not per recipient — it is the same number for everyone.
        $folderIds = array_merge(
            [$folder->id],
            NoteFolder::where('path', 'like', $folder->path . '%')->where('id', '!=', $folder->id)->pluck('id')->all(),
        );
        $noteCount = Note::whereIn('note_folder_id', $folderIds)->notArchived()->count();

        $recipients->chunk(self::CHUNK)->each(function (Collection $chunk) use ($folder, $actor, $role, $label, $noteCount) {
            Notification::send($chunk, new NoteFolderSharedNotification($folder, $actor, $role, $label, $noteCount));
        });

        return $recipients->count();
    }

    /**
     * The active users an audience resolves to.
     *
     * A division has no direct members — its people are reached through its
     * departments, matching how membership works everywhere else.
     *
     * @return Collection<int, User>
     */
    public static function recipients(string $shareableType, int $shareableId): Collection
    {
        $query = User::where('is_active', true);

        return match ($shareableType) {
            User::class => $query->whereKey($shareableId)->get(),
            Team::class => $query->where('team_id', $shareableId)->get(),
            Department::class => $query->where('department_id', $shareableId)->get(),
            Division::class => $query->whereIn(
                'department_id',
                Department::where('division_id', $shareableId)->pluck('id'),
            )->get(),
            default => collect(),
        };
    }

    private static function audienceLabel(string $shareableType): string
    {
        return match ($shareableType) {
            User::class => 'Person',
            Team::class => 'Team',
            Department::class => 'Department',
            Division::class => 'Division',
            default => 'Share',
        };
    }
}
