<?php

namespace App\Models;

use Illuminate\Notifications\DatabaseNotification as BaseDatabaseNotification;

class DatabaseNotification extends BaseDatabaseNotification
{
    protected function casts(): array
    {
        return [
            'data' => 'array',
            'read_at' => 'datetime',
            'bookmarked_at' => 'datetime',
            'archived_at' => 'datetime',
        ];
    }
}
