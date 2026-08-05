<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use ZipArchive;

/**
 * Work out why zipping a backup fails on this machine.
 *
 * "ZipArchive::close(): Invalid argument" is unhelpful because libzip does all
 * its real work in close(): it opens every added file, applies the configured
 * compression and encryption, and writes the archive. open() succeeding proves
 * nothing — it does not touch the filesystem at all.
 *
 * So this reproduces the same steps Spatie takes, one at a time, with the
 * settings this install actually has, and reports which one fails. It writes
 * only to the system temp directory and cleans up after itself.
 */
class VerifyBackupZip extends Command
{
    protected $signature = 'backup:verify-zip';

    protected $description = 'Diagnose zip creation failures during backup:run';

    public function handle(): int
    {
        $this->line('');
        $this->line('<comment>Environment</comment>');
        $this->line('  PHP            ' . PHP_VERSION);
        $this->line('  ext-zip        ' . (phpversion('zip') ?: 'not loaded'));
        $this->line('  libzip         ' . (defined('ZipArchive::LIBZIP_VERSION') ? ZipArchive::LIBZIP_VERSION : (constant('ZipArchive::LIBZIP_VERSION') ?? 'unknown')));

        $method = config('backup.backup.destination.compression_method');
        $level = config('backup.backup.destination.compression_level');
        $password = config('backup.backup.password');
        $temp = config('backup.backup.temporary_directory');

        $this->line('');
        $this->line('<comment>Configured</comment>');
        $this->line('  compression    method=' . var_export($method, true) . ' level=' . var_export($level, true));
        $this->line('  encryption     ' . ($password ? 'on (BACKUP_ARCHIVE_PASSWORD is set)' : 'off'));
        $this->line('  temp directory ' . $temp);

        // The parent has to exist and be writable: Spatie deletes and recreates
        // the temp directory itself on every run.
        $parent = dirname($temp);
        $this->line('  parent exists  ' . (is_dir($parent) ? 'yes' : 'NO — ' . $parent));
        $this->line('  parent writable ' . (is_writable($parent) ? 'yes' : 'NO'));

        $free = @disk_free_space($parent);
        $this->line('  free space     ' . ($free === false ? 'unknown' : round($free / 1048576) . ' MB'));

        $this->line('');
        $this->line('<comment>Zip round trip, with this install\'s settings</comment>');

        $dir = sys_get_temp_dir() . '/wmt-zip-check-' . bin2hex(random_bytes(4));

        if (! @mkdir($dir, 0755, true)) {
            $this->error('  could not create a scratch directory in ' . sys_get_temp_dir());

            return self::FAILURE;
        }

        $source = $dir . '/probe.sql';
        file_put_contents($source, str_repeat("-- probe\n", 512));

        $ok = $this->roundTrip($dir, $source, $method, $level, $password);

        // Narrow it down when the configured settings fail.
        if (! $ok) {
            $this->line('');
            $this->line('<comment>Narrowing it down</comment>');

            $plain = $this->roundTrip($dir, $source, null, null, null, 'no compression, no encryption');

            if ($plain) {
                if ($password) {
                    $this->roundTrip($dir, $source, $method, $level, null, 'compression only');
                    $this->roundTrip($dir, $source, null, null, $password, 'encryption only');
                } else {
                    $this->line('  a plain archive works, so the compression settings are the problem');
                }
            } else {
                $this->line('  even a plain archive fails, so this is the filesystem, not the settings');
            }
        }

        array_map('unlink', glob($dir . '/*') ?: []);
        @rmdir($dir);

        $this->line('');

        return $ok ? self::SUCCESS : self::FAILURE;
    }

    /** One open → add → compress → encrypt → close cycle, reporting where it broke. */
    private function roundTrip(
        string $dir,
        string $source,
        ?int $method,
        ?int $level,
        ?string $password,
        ?string $label = null,
    ): bool {
        $label ??= 'as configured';
        $path = $dir . '/probe-' . bin2hex(random_bytes(3)) . '.zip';

        $zip = new ZipArchive;
        $opened = $zip->open($path, ZipArchive::CREATE);

        if ($opened !== true) {
            $this->error(sprintf('  %-28s open failed, code %s', $label, $opened));

            return false;
        }

        if ($password !== null) {
            $zip->setPassword($password);
        }

        $zip->addFile($source, 'probe.sql');

        if ($method !== null) {
            // Spatie does not check this result, so a method this libzip does
            // not support is accepted here and only fails later, in close().
            if ($zip->setCompressionName('probe.sql', $method, $level ?? 0) !== true) {
                $this->warn(sprintf('  %-28s setCompressionName rejected method %s level %s', $label, $method, $level));
            }
        }

        if ($password !== null) {
            if ($zip->setEncryptionName('probe.sql', ZipArchive::EM_AES_256) !== true) {
                $this->warn(sprintf('  %-28s setEncryptionName rejected AES-256', $label));
            }
        }

        $error = null;
        set_error_handler(function ($number, $message) use (&$error) {
            $error = $message;

            return true;
        });
        $closed = $zip->close();
        restore_error_handler();

        if ($closed && is_file($path) && filesize($path) > 0) {
            $this->info(sprintf('  %-28s ok (%d bytes)', $label, filesize($path)));

            return true;
        }

        $this->error(sprintf('  %-28s %s', $label, $error ?: 'close() failed with no message'));

        return false;
    }
}
