<?php

namespace App\Notifications\Concerns;

use App\Models\Setting;
use App\Models\User;

/**
 * Channel selection for the notifications a person can opt out of by email.
 *
 * Two gates, and mail needs both: the administrator decides which types the
 * system may send at all (Setting), and the recipient decides which of those
 * they personally want (User). A person can therefore turn off an email the
 * administrator allows, but cannot turn on one the administrator has disabled.
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

        if (Setting::current()->wantsEmail($type) && $this->recipientWantsEmail($notifiable, $type)) {
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
