<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * The system-wide email switch.
 *
 * Turning email off used to mean MAIL_MAILER=log, which does not stop anything
 * being sent so much as redirect it onto disk: Laravel renders each message in
 * full and writes recipients, subjects and bodies into laravel.log. These cover
 * the two things that has to mean instead — no delivery, and nothing written.
 */
class MailEnabledFlagTest extends TestCase
{
    use RefreshDatabase;

    /** A notification using the shared channel-selection trait. */
    private function notification(): object
    {
        return new class {
            use \App\Notifications\Concerns\ChecksEmailPreference;

            public function channels(object $notifiable): array
            {
                return $this->channelsFor($notifiable, 'task_assigned');
            }
        };
    }

    private function willingRecipient(): User
    {
        // task_assigned defaults to true for both the administrator gate and
        // the recipient gate, so those are open and the only thing under test
        // is the deployment switch. Asserted rather than assumed, so this stops
        // being a valid fixture loudly if a default ever changes.
        $user = User::factory()->create(['is_active' => true]);

        $this->assertTrue(Setting::current()->wantsEmail('task_assigned'));
        $this->assertTrue($user->wantsEmail('task_assigned'));

        return $user;
    }

    public function test_mail_channel_is_used_when_email_is_enabled(): void
    {
        config(['mail.enabled' => true]);

        $this->assertContains('mail', $this->notification()->channels($this->willingRecipient()));
    }

    public function test_mail_channel_is_dropped_when_email_is_disabled(): void
    {
        config(['mail.enabled' => false]);

        $channels = $this->notification()->channels($this->willingRecipient());

        $this->assertNotContains('mail', $channels);
    }

    public function test_disabling_email_does_not_silence_the_app_itself(): void
    {
        // Someone who cannot be emailed must still find the notification in the
        // app. Turning email off is not the same as turning notifications off.
        config(['mail.enabled' => false]);

        $channels = $this->notification()->channels($this->willingRecipient());

        $this->assertContains('database', $channels);
        $this->assertContains('broadcast', $channels);
    }

    public function test_the_mailer_discards_rather_than_writing_to_the_log(): void
    {
        // The second layer, covering everything that reaches the mail system
        // without going through the notification channels — a package's own
        // notifications, a password reset, a direct Mail::to() call.
        $this->assertSame('array', $this->resolveDefaultMailer(['MAIL_ENABLED' => 'false']));
    }

    public function test_the_configured_mailer_is_used_when_email_is_enabled(): void
    {
        $this->assertSame('smtp', $this->resolveDefaultMailer([
            'MAIL_ENABLED' => 'true',
            'MAIL_MAILER' => 'smtp',
        ]));
    }

    public function test_email_is_on_unless_deliberately_switched_off(): void
    {
        // Absent the variable the behaviour must not change, so an existing
        // deployment that never sets it keeps sending.
        $this->assertSame('smtp', $this->resolveDefaultMailer(['MAIL_MAILER' => 'smtp']));
    }

    /** Re-evaluate config/mail.php under a given environment. */
    private function resolveDefaultMailer(array $env): string
    {
        $original = [];
        foreach ($env as $key => $value) {
            $original[$key] = $_ENV[$key] ?? null;
            $_ENV[$key] = $_SERVER[$key] = $value;
            putenv("{$key}={$value}");
        }

        try {
            return (require base_path('config/mail.php'))['default'];
        } finally {
            foreach ($original as $key => $value) {
                if ($value === null) {
                    unset($_ENV[$key], $_SERVER[$key]);
                    putenv($key);
                } else {
                    $_ENV[$key] = $_SERVER[$key] = $value;
                    putenv("{$key}={$value}");
                }
            }
        }
    }

    public function test_nothing_is_sent_when_email_is_disabled(): void
    {
        Mail::fake();
        config(['mail.enabled' => false]);

        $channels = $this->notification()->channels($this->willingRecipient());

        $this->assertNotContains('mail', $channels);
        Mail::assertNothingSent();
    }
}
