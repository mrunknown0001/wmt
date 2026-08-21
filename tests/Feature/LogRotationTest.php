<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * Log retention.
 *
 * The application log was a single file that grew without bound and aged
 * nothing out, which is how it came to hold a month of rendered email. These
 * guard the two properties that stop that recurring: the rotating channel keeps
 * a bounded number of days, and the stack honours what the deployment asks for
 * rather than being pinned to one file.
 */
class LogRotationTest extends TestCase
{
    public function test_the_daily_channel_keeps_a_bounded_number_of_days(): void
    {
        $days = config('logging.channels.daily.days');

        $this->assertIsInt($days);
        $this->assertGreaterThan(0, $days, 'Retention of 0 keeps files forever.');
        $this->assertLessThanOrEqual(90, $days, 'Keeping months of logs is what this was meant to stop.');
    }

    public function test_the_daily_channel_actually_rotates(): void
    {
        $this->assertSame('daily', config('logging.channels.daily.driver'));
    }

    public function test_the_stack_follows_the_deployment(): void
    {
        // Read back the way config/logging.php composes the stack, so pinning it
        // to a non-rotating channel cannot pass unnoticed.
        $original = $_ENV['LOG_STACK'] ?? null;
        $_ENV['LOG_STACK'] = $_SERVER['LOG_STACK'] = 'daily';
        putenv('LOG_STACK=daily');

        try {
            $stack = (require base_path('config/logging.php'))['channels']['stack']['channels'];
            $this->assertSame(['daily'], $stack);
        } finally {
            if ($original === null) {
                unset($_ENV['LOG_STACK'], $_SERVER['LOG_STACK']);
                putenv('LOG_STACK');
            } else {
                $_ENV['LOG_STACK'] = $_SERVER['LOG_STACK'] = $original;
                putenv("LOG_STACK={$original}");
            }
        }
    }
}
