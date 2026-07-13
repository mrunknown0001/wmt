<?php

namespace App\Policies;

use App\Models\Link;
use App\Models\User;

class LinkPolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, Link $link): bool
    {
        return $user->hasPermissionTo('manage-links') || $link->user_id === $user->id;
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
