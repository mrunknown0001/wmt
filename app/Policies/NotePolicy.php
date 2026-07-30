<?php

namespace App\Policies;

use App\Models\Note;
use App\Models\User;

/**
 * Notes are private to their owner and to whoever the owner shares them with.
 *
 * There is deliberately no admin bypass. A note is personal writing, and someone
 * holding manage-users has no more business reading it than anyone else. Trash
 * recovery is the one exception, handled outside this policy.
 */
class NotePolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, Note $note): bool
    {
        return $note->roleFor($user) !== null;
    }

    public function create(User $user): bool
    {
        return true;
    }

    /** Owner, admin and editor may change the content. */
    public function update(User $user, Note $note): bool
    {
        return $note->canBeEditedBy($user);
    }

    /**
     * Owner and admin only.
     *
     * An editor may "edit only", so it stops short of removing the note from
     * everyone else's list.
     */
    public function delete(User $user, Note $note): bool
    {
        return $note->canBeAdministeredBy($user);
    }

    /** Archiving hides the note for everyone, so it sits with deletion. */
    public function archive(User $user, Note $note): bool
    {
        return $note->canBeAdministeredBy($user);
    }

    /**
     * Who else the note reaches is the owner's call, and an admin's.
     *
     * An admin cannot remove the owner or promote anyone above their own level;
     * NoteShareController enforces that — the policy only decides who gets in.
     */
    public function manageShares(User $user, Note $note): bool
    {
        return $note->canBeAdministeredBy($user);
    }

    /** Only the owner may move a note between their own folders. */
    public function file(User $user, Note $note): bool
    {
        return (int) $note->user_id === (int) $user->id;
    }

    public function restore(User $user, Note $note): bool
    {
        return (int) $note->user_id === (int) $user->id;
    }

    public function forceDelete(User $user, Note $note): bool
    {
        return (int) $note->user_id === (int) $user->id;
    }
}
