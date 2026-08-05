<?php

namespace App\Console\Commands;

use App\Mail\GoogleDriveTokenAlert;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Weekly check that the Google Drive refresh token still works.
 *
 * Separate from backup:verify-drive, which is an interactive diagnostic: it
 * writes a probe file, prints a report and is run by a person when something
 * looks wrong. This one is for the scheduler — it touches nothing, says nothing
 * when all is well, and emails when the token has died.
 *
 * It exists because that failure is silent. config/backup.php drops the google
 * disk from its destinations when the credentials are missing, and a revoked
 * token throws inside the disk rather than at boot, so `backup:run` keeps
 * reporting success while writing local copies only. Nobody finds out until
 * they need the off-site copy.
 *
 * Tokens die for ordinary reasons: an OAuth consent screen still in Testing
 * mode expires them after 7 days, Google drops tokens unused for 6 months, and
 * a password change or a revoke at myaccount.google.com/permissions kills them
 * immediately.
 */
class CheckGoogleDriveToken extends Command
{
    protected $signature = 'backup:check-token {--alert : Send the failure email even when run by hand}';

    protected $description = 'Verify the Google Drive refresh token is still valid, and alert if it is not';

    public function handle(): int
    {
        $config = config('filesystems.disks.google');

        $credentials = [
            'GOOGLE_DRIVE_CLIENT_ID' => $config['clientId'] ?? null,
            'GOOGLE_DRIVE_CLIENT_SECRET' => $config['clientSecret'] ?? null,
            'GOOGLE_DRIVE_REFRESH_TOKEN' => $config['refreshToken'] ?? null,
        ];

        $missing = array_keys(array_filter($credentials, fn ($v) => empty($v)));

        // Nothing set at all is a deliberate state — a dev machine, or an
        // install not using Drive. Alerting weekly about it would train people
        // to ignore the alert that matters.
        if (count($missing) === count($credentials)) {
            $this->info('Google Drive is not configured; nothing to check.');

            return self::SUCCESS;
        }

        // Some but not all is a broken configuration, and worth shouting about:
        // backups are silently local-only.
        if ($missing) {
            return $this->reportFailure(
                'Google Drive is half-configured, so backups are being written locally only. '
                . 'Missing: ' . implode(', ', $missing)
            );
        }

        try {
            $client = new \Google\Client();
            $client->setClientId($config['clientId']);
            $client->setClientSecret($config['clientSecret']);
            $client->addScope(\Google\Service\Drive::DRIVE);

            $token = $client->fetchAccessTokenWithRefreshToken($config['refreshToken']);
        } catch (\Throwable $e) {
            return $this->reportFailure('Could not reach Google to check the token: ' . $e->getMessage());
        }

        if (isset($token['error'])) {
            return $this->reportFailure(
                'The Google Drive refresh token is no longer valid: '
                . ($token['error_description'] ?? $token['error'])
            );
        }

        $this->info('Google Drive token is valid.');
        Log::info('[backup] Google Drive token check passed.');

        return self::SUCCESS;
    }

    /** Report, log and email one failure. */
    private function reportFailure(string $message): int
    {
        $this->error($message);
        Log::error('[backup] ' . $message);

        $this->sendAlert($message);

        return self::FAILURE;
    }

    /**
     * Email whoever gets backup notifications.
     *
     * Sent unconditionally when the scheduler runs this; a person running it by
     * hand is already reading the output, so they have to ask for the email
     * with --alert rather than surprising the mailing list while debugging.
     */
    private function sendAlert(string $message): void
    {
        if ($this->input->isInteractive() && ! $this->option('alert')) {
            $this->line('');
            $this->warn('No email sent — run with --alert to send one.');

            return;
        }

        $to = config('backup.notifications.mail.to');

        if (empty($to)) {
            Log::warning('[backup] No backup.notifications.mail.to configured, so no alert was sent.');

            return;
        }

        try {
            Mail::to($to)->send(new GoogleDriveTokenAlert($message));
        } catch (\Throwable $e) {
            // A broken mailer must not turn a warning into a crashed scheduler.
            Log::error('[backup] Could not send the Drive token alert: ' . $e->getMessage());
        }
    }
}
