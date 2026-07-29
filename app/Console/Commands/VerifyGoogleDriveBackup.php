<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * End-to-end check of the Google Drive backup destination.
 *
 * Exists because the failure mode is otherwise silent: with no credentials set,
 * config/backup.php filters the `google` disk out of its destination list, so
 * `backup:run` succeeds having written only to local storage. Everything looks
 * healthy right up until someone needs an off-site copy.
 *
 * This writes a small probe file, reads it back, lists it and deletes it — the
 * same operations a real backup performs.
 */
class VerifyGoogleDriveBackup extends Command
{
    protected $signature = 'backup:verify-drive {--keep : Leave the probe file in place}';

    protected $description = 'Check that backups can actually be written to Google Drive';

    public function handle(): int
    {
        $this->line('');

        // 1. Credentials -------------------------------------------------------
        $required = [
            'GOOGLE_DRIVE_CLIENT_ID' => config('filesystems.disks.google.clientId'),
            'GOOGLE_DRIVE_CLIENT_SECRET' => config('filesystems.disks.google.clientSecret'),
            'GOOGLE_DRIVE_REFRESH_TOKEN' => config('filesystems.disks.google.refreshToken'),
        ];

        $missing = array_keys(array_filter($required, fn ($v) => empty($v)));

        if ($missing) {
            $this->error('Google Drive is not configured.');
            $this->line('  Missing: ' . implode(', ', $missing));
            $this->line('');
            $this->warn('Until these are set, `backup:run` writes to local storage only —');
            $this->warn('it will report success with no off-site copy.');
            return self::FAILURE;
        }

        $this->info('✓ credentials present');

        $folder = config('filesystems.disks.google.folder');
        $this->line('  folder id: ' . ($folder ?: '(Drive root)'));

        // 2. Is the disk reachable? -------------------------------------------
        try {
            $disk = Storage::disk('google');
        } catch (\Throwable $e) {
            $this->error('✗ could not build the Drive disk');
            $this->line('  ' . $e->getMessage());
            return self::FAILURE;
        }

        // 3. Write / read / list / delete --------------------------------------
        $name = 'wmt-backup-probe-' . now()->format('Ymd-His') . '.txt';
        $body = "WMT backup connectivity probe written at " . now()->toDateTimeString();

        try {
            $this->line('');
            $this->line("  writing {$name} …");
            $disk->put($name, $body);
            $this->info('✓ write succeeded');

            $readBack = $disk->get($name);
            if ($readBack !== $body) {
                $this->error('✗ the file read back does not match what was written');
                return self::FAILURE;
            }
            $this->info('✓ read back matches');

            $listed = collect($disk->files())->contains(fn ($f) => str_contains($f, $name));
            $this->info($listed ? '✓ visible in the folder listing' : '! written but not listed (check the folder id)');

            if ($this->option('keep')) {
                $this->line("  left {$name} in place (--keep)");
            } else {
                $disk->delete($name);
                $this->info('✓ cleaned up the probe file');
            }
        } catch (\Throwable $e) {
            $this->error('✗ Drive rejected the operation');
            $this->line('  ' . $e->getMessage());
            $this->line('');
            $this->warn('Common causes: the refresh token has been revoked, the OAuth');
            $this->warn('client lacks the drive.file scope, or the folder id is wrong or');
            $this->warn('not shared with the account that issued the token.');
            return self::FAILURE;
        }

        // 4. Will backups actually target it? ----------------------------------
        $this->line('');
        $destinations = config('backup.backup.destination.disks', []);

        if (in_array('google', $destinations, true)) {
            $this->info('✓ backup destinations include google: ' . implode(', ', $destinations));
        } else {
            $this->error('✗ google is NOT in the backup destinations: ' . implode(', ', $destinations));
            $this->warn('  The disk works, but backups are not being sent to it.');
            return self::FAILURE;
        }

        $monitored = collect(config('backup.monitor_backups', []))
            ->flatMap(fn ($m) => $m['disks'] ?? [])->unique()->all();

        $this->line(in_array('google', $monitored, true)
            ? '  monitored by backup:monitor'
            : '  note: not covered by backup:monitor, so a stale Drive backup will not raise a warning');

        $this->line('');
        $this->info('Google Drive backup destination is working.');

        return self::SUCCESS;
    }
}
