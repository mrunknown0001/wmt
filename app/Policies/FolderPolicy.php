<?php

namespace App\Policies;

use App\Models\Folder;
use App\Models\User;

class FolderPolicy
{
    public function create(User $user): bool
    {
        return true;
    }

    public function update(User $user, Folder $folder): bool
    {
        // System folders are managed through the org structure, never directly
        if ($folder->isSystem()) {
            return false;
        }

        return $user->hasPermissionTo('manage-projects')
            || $folder->created_by === $user->id;
    }

    public function delete(User $user, Folder $folder): bool
    {
        return $this->update($user, $folder);
    }
}
