<?php

namespace App\Notifications;

use App\Models\Note;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class NoteSharedNotification extends Notification implements ShouldQueue
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
        public Note $note,
        public User $sharedBy,
        public string $role,
        /** How they were reached: 'Person', 'Team', 'Department', 'Division'. */
        public string $audienceLabel,
    ) {}

    public function via(object $notifiable): array
    {
        // No mail channel. A shared note is a quiet event — it appears in the
        // recipient's list either way — and a division-wide share would put a
        // few hundred emails on the queue for something nobody asked to be
        // told about by email.
        return ['database', 'broadcast'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'note_shared',
            'note_id' => $this->note->id,
            'note_title' => $this->note->title,
            'shared_by' => $this->sharedBy->name,
            'role' => $this->role,
            'audience' => $this->audienceLabel,
            // Read by SendFcmNotification for the push deep link.
            'url' => "/notes/{$this->note->id}",
        ];
    }
}
