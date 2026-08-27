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

    /**
     * Discard rather than fail when the record this is about has been deleted.
     *
     * A queued notification restores its models from the payload when the worker
     * picks it up. If the task, note or request has been removed in between, that
     * lookup throws and the job lands in failed_jobs — for a message that no
     * longer has anything to say. Six of these accumulated from delegations whose
     * subject was deleted before delivery.
     */
    public $deleteWhenMissingModels = true;

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
