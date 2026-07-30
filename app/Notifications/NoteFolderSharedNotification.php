<?php

namespace App\Notifications;

use App\Models\NoteFolder;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class NoteFolderSharedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public NoteFolder $folder,
        public User $sharedBy,
        public string $role,
        public string $audienceLabel,
        /** Notes in the folder and its subfolders at the moment of sharing. */
        public int $noteCount,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database', 'broadcast'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'note_folder_shared',
            'note_folder_id' => $this->folder->id,
            'folder_name' => $this->folder->name,
            'shared_by' => $this->sharedBy->name,
            'role' => $this->role,
            'audience' => $this->audienceLabel,
            'note_count' => $this->noteCount,
            'url' => '/notes?scope=shared',
        ];
    }
}
