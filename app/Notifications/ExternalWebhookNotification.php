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
