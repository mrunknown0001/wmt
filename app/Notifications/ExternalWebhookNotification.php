<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Notification raised by an external platform through the inbound webhook.
 *
 * Carries its own click-through URL, which may point outside this app — the
 * frontend opens absolute URLs directly instead of routing through Inertia.
 */
class ExternalWebhookNotification extends Notification implements ShouldQueue
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
        public string $platform,
        public string $url,
        public ?string $message = null,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database', 'broadcast'];
    }

    public function broadcastType(): string
    {
        return 'external_webhook';
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'external_webhook',
            'platform' => $this->platform,
            'url' => $this->url,
            'message' => $this->message,
        ];
    }
}
