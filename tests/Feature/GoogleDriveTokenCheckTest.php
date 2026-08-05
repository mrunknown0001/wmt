<?php

namespace Tests\Feature;

use App\Mail\GoogleDriveTokenAlert;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * The weekly Google Drive token check.
 *
 * The network path — actually asking Google whether the token still works —
 * is not exercised here; that needs real credentials and a real request. What
 * is covered is everything around it, which is where the judgement calls are:
 * when it stays quiet, when it shouts, and whether it emails.
 */
class GoogleDriveTokenCheckTest extends TestCase
{
    private function configureDrive(?string $clientId, ?string $secret, ?string $refresh): void
    {
        config([
            'filesystems.disks.google.clientId' => $clientId,
            'filesystems.disks.google.clientSecret' => $secret,
            'filesystems.disks.google.refreshToken' => $refresh,
            'backup.notifications.mail.to' => 'ops@example.test',
        ]);
    }

    public function test_an_install_not_using_drive_passes_quietly(): void
    {
        Mail::fake();
        $this->configureDrive(null, null, null);

        $this->artisan('backup:check-token')
            ->expectsOutputToContain('not configured')
            ->assertExitCode(0);

        // Weekly noise about a deliberate state is how people learn to ignore
        // the alert that matters.
        Mail::assertNotSent(GoogleDriveTokenAlert::class);
    }

    public function test_a_half_configured_install_fails(): void
    {
        Mail::fake();
        // Client id set, refresh token missing: backup:run would succeed while
        // writing local copies only.
        $this->configureDrive('client-id', 'secret', null);

        $this->artisan('backup:check-token')
            ->expectsOutputToContain('GOOGLE_DRIVE_REFRESH_TOKEN')
            ->assertExitCode(1);
    }

    public function test_running_it_by_hand_does_not_email_the_team(): void
    {
        Mail::fake();
        $this->configureDrive('client-id', 'secret', null);

        $this->artisan('backup:check-token')->assertExitCode(1);

        Mail::assertNotSent(GoogleDriveTokenAlert::class);
    }

    public function test_the_alert_flag_sends_the_email(): void
    {
        Mail::fake();
        $this->configureDrive('client-id', 'secret', null);

        $this->artisan('backup:check-token --alert')->assertExitCode(1);

        Mail::assertSent(GoogleDriveTokenAlert::class);
    }

    // No test for "no notification address configured": spatie/laravel-backup
    // validates that setting itself and throws InvalidConfig before the command
    // is reached, so the state cannot be constructed. The guard in sendAlert()
    // stays as cheap insurance, but asserting on it here would only be testing
    // the package's validator.

    public function test_the_failure_is_logged_for_anything_reading_the_log(): void
    {
        Mail::fake();
        Log::spy();
        $this->configureDrive('client-id', 'secret', null);

        $this->artisan('backup:check-token')->assertExitCode(1);

        Log::shouldHaveReceived('error')
            ->withArgs(fn (string $message) => str_contains($message, '[backup]'))
            ->once();
    }

    public function test_it_is_on_the_schedule(): void
    {
        $scheduled = collect(app(\Illuminate\Console\Scheduling\Schedule::class)->events())
            ->contains(fn ($event) => str_contains($event->command ?? '', 'backup:check-token'));

        // A health check nobody runs is not a health check.
        $this->assertTrue($scheduled, 'backup:check-token is not scheduled');
    }
}
