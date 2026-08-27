<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/**
 * The daily "has anything failed?" check.
 *
 * The point is to be quiet when things are fine and specific when they are not:
 * a line every morning saying nothing happened is a line people learn to skip.
 */
class ReportFailedJobsTest extends TestCase
{
    use RefreshDatabase;

    private function failedJob(string $displayName, string $failedAt): void
    {
        DB::table('failed_jobs')->insert([
            'uuid' => (string) \Illuminate\Support\Str::uuid(),
            'connection' => 'database',
            'queue' => 'default',
            'payload' => json_encode(['displayName' => $displayName]),
            'exception' => 'ModelNotFoundException: No query results',
            'failed_at' => $failedAt,
        ]);
    }

    public function test_it_warns_naming_what_failed(): void
    {
        $this->failedJob('App\\Notifications\\TaskAssignedNotification', now()->subHours(2));
        $this->failedJob('App\\Notifications\\TaskAssignedNotification', now()->subHours(3));
        $this->failedJob('App\\Notifications\\TaskOverdueNotification', now()->subHours(4));

        Log::shouldReceive('info')->zeroOrMoreTimes();
        Log::shouldReceive('warning')
            ->once()
            ->withArgs(function ($message) {
                // The count, and which job — a bare number sends someone digging.
                return str_contains($message, '3 job(s) failed')
                    && str_contains($message, 'TaskAssignedNotification ×2')
                    && str_contains($message, 'TaskOverdueNotification ×1');
            });

        $this->artisan('queue:report-failed')->assertExitCode(0);
    }

    public function test_it_stays_quiet_when_nothing_failed_recently(): void
    {
        // Old failures are history, not news. Production has six from weeks ago
        // and a daily warning about them would train everyone to ignore the line.
        $this->failedJob('App\\Notifications\\TaskDelegationNotification', now()->subDays(18));

        Log::shouldReceive('info')->once();
        Log::shouldReceive('warning')->never();

        $this->artisan('queue:report-failed')->assertExitCode(0);
    }

    public function test_the_window_is_adjustable(): void
    {
        $this->failedJob('App\\Notifications\\TaskAssignedNotification', now()->subDays(3));

        Log::shouldReceive('info')->zeroOrMoreTimes();
        Log::shouldReceive('warning')->once();

        $this->artisan('queue:report-failed', ['--hours' => 24 * 7])->assertExitCode(0);
    }
}
