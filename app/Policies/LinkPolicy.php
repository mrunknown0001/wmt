<?php

namespace App\Policies;

use App\Models\Link;
use App\Models\User;

class LinkPolicy
{
    public function viewAny(User $user): bool
    {
        // Links & URLs is open to every authenticated user; the index scopes each
        // user to the links actually assigned to them (directly or via a group).
        return true;
    }

    public function view(User $user, Link $link): bool
    {
        // Managers see everything; everyone else sees a link only if it's assigned
        // to them, matching the same visibility rule used by the index.
        return $user->hasPermissionTo('manage-links')
            || Link::visibleTo($user)->whereKey($link->id)->exists();
    }

    public function create(User $user): bool
    {
        return $user->hasPermissionTo('manage-links');
    }

    public function update(User $user, Link $link): bool
    {
        return $user->hasPermissionTo('manage-links');
    }

    public function delete(User $user, Link $link): bool
    {
        return $user->hasPermissionTo('manage-links');
    }
}
