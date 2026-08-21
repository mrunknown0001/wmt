<?php

namespace App\Notifications\Concerns;

use App\Models\Setting;
use App\Models\User;

/**
 * Channel selection for the notifications a person can opt out of by email.
 *
 * Three gates, and mail needs all of them: the deployment decides whether it
 * sends email at all (config/mail.php), the administrator decides which types
 * the system may send (Setting), and the recipient decides which of those they
 * personally want (User). A person can therefore turn off an email the
 * administrator allows, but cannot turn on one the administrator has disabled,
 * and none of it applies where email is switched off entirely.
 */
trait ChecksEmailPreference
{
    /**
     * Database and broadcast are unconditional. The preference governs email
     * only — someone who has turned off the emails should still find the
     * notification waiting in the app, not lose it entirely.
     */
    protected function channelsFor(object $notifiable, string $type): array
    {
        $channels = ['database', 'broadcast'];

        // Three gates now, and the first is the deployment's own. With email
        // switched off the channel is dropped here rather than left to fail
        // further down, so the message is never rendered at all — which is the
        // whole point, given the previous way of turning email off wrote every
        // message into the log instead of sending it.
        if (config('mail.enabled')
            && Setting::current()->wantsEmail($type)
            && $this->recipientWantsEmail($notifiable, $type)) {
            $channels[] = 'mail';
        }

        return $channels;
    }

    /**
     * A notifiable that is not a user account — an on-demand mail route, for
     * instance — has no preferences to consult. It keeps whatever the
     * administrator allows rather than being silently suppressed.
     */
    private function recipientWantsEmail(object $notifiable, string $type): bool
    {
        return ! $notifiable instanceof User || $notifiable->wantsEmail($type);
    }
}
