<?php

namespace Tests\Feature;

use Tests\TestCase;
use ZipArchive;

/**
 * The zip settings backup:run depends on.
 *
 * These exist because the failure they guard against is invisible until a
 * backup actually runs, and then only on some machines. libzip accepts a
 * compression level for DEFLATE only; with CM_DEFAULT the level must be 0.
 * Spatie does not check the result of setCompressionName(), so a bad pairing is
 * assembled without complaint and dies at close() with "Invalid argument" —
 * which names neither compression nor the setting that caused it.
 *
 * It cost an afternoon once. A second time would be nobody's fault but ours.
 */
class BackupZipConfigTest extends TestCase
{
    public function test_a_compression_level_is_only_paired_with_deflate(): void
    {
        $method = config('backup.backup.destination.compression_method');
        $level = (int) config('backup.backup.destination.compression_level');

        if ($level === 0) {
            $this->addToAssertionCount(1); // any method is fine with no level

            return;
        }

        $this->assertSame(
            ZipArchive::CM_DEFLATE,
            $method,
            'A non-zero compression level is only valid with CM_DEFLATE. '
            . 'Set compression_level to 0, or set compression_method to CM_DEFLATE.'
        );
    }

    public function test_the_configured_pairing_actually_produces_an_archive(): void
    {
        $method = config('backup.backup.destination.compression_method');
        $level = (int) config('backup.backup.destination.compression_level');

        $dir = sys_get_temp_dir() . '/wmt-zip-config-' . bin2hex(random_bytes(4));
        mkdir($dir, 0755, true);

        $source = $dir . '/probe.sql';
        file_put_contents($source, str_repeat("-- probe\n", 256));
        $path = $dir . '/probe.zip';

        $zip = new ZipArchive;
        $this->assertTrue($zip->open($path, ZipArchive::CREATE) === true);
        $zip->addFile($source, 'probe.sql');

        $accepted = $zip->setCompressionName('probe.sql', $method, $level);

        $error = null;
        set_error_handler(function ($number, $message) use (&$error) {
            $error = $message;

            return true;
        });
        $closed = $zip->close();
        restore_error_handler();

        $size = is_file($path) ? filesize($path) : 0;

        array_map('unlink', glob($dir . '/*') ?: []);
        @rmdir($dir);

        $this->assertTrue(
            $accepted,
            "This libzip rejects compression method {$method} at level {$level}."
        );
        $this->assertTrue($closed, 'Writing the archive failed: ' . ($error ?: 'no message'));
        $this->assertGreaterThan(0, $size, 'The archive was written but is empty.');
    }
}
