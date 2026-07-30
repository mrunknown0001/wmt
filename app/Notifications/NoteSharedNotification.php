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
