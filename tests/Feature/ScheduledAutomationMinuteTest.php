<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\ProjectAutomationRule;
use App\Models\Task;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/**
 * The scheduled trigger fires on an hour *and* a minute.
 *
 * The runner used to sweep hourly and match the hour alone; it now runs every
 * minute, so the minute has to be part of the match or a rule would fire sixty
 * times a day.
 */
class ScheduledAutomationMinuteTest extends TestCase
{
    use RefreshDatabase;

    private function rule(array $triggerConfig): ProjectAutomationRule
    {
        $project = Project::factory()->create();

        // One open task, so a matching rule has something to sweep.
        Task::factory()->create(['project_id' => $project->id, 'status' => 'to_do']);

        return ProjectAutomationRule::create([
            'project_id' => $project->id,
            'name' => 'Nightly sweep',
            'is_active' => true,
            'trigger_type' => 'scheduled',
            'trigger_config' => $triggerConfig,
            'conditions' => ['logic' => 'all', 'rules' => []],
            'actions' => [],
        ]);
    }

    public function test_a_rule_fires_on_its_hour_and_minute(): void
    {
        $this->rule(['hour' => 14, 'minute' => 30]);

        $this->artisan('automation:run-scheduled --hour=14 --minute=30 --dry-run')
            ->expectsOutputToContain('Nightly sweep')
            ->assertSuccessful();
    }

    public function test_the_right_hour_at_the_wrong_minute_does_not_fire(): void
    {
        $this->rule(['hour' => 14, 'minute' => 30]);

        $this->artisan('automation:run-scheduled --hour=14 --minute=31 --dry-run')
            ->expectsOutputToContain('No scheduled automation rules set for 14:31')
            ->assertSuccessful();
    }

    public function test_the_right_minute_at_the_wrong_hour_does_not_fire(): void
    {
        $this->rule(['hour' => 14, 'minute' => 30]);

        $this->artisan('automation:run-scheduled --hour=15 --minute=30 --dry-run')
            ->assertSuccessful();
    }

    public function test_a_rule_saved_before_minutes_existed_fires_on_the_hour(): void
    {
        // Backwards compatibility: no minute stored. It used to fire on the hour,
        // so absent must read as :00 — treating it as "any minute" would fire it
        // sixty times a day.
        $this->rule(['hour' => 9]);

        $this->artisan('automation:run-scheduled --hour=9 --minute=0 --dry-run')
            ->expectsOutputToContain('Nightly sweep')
            ->assertSuccessful();
    }

    public function test_a_rule_without_a_minute_does_not_fire_all_hour(): void
    {
        $this->rule(['hour' => 9]);

        $this->artisan('automation:run-scheduled --hour=9 --minute=37 --dry-run')
            ->expectsOutputToContain('No scheduled automation rules set for 09:37')
            ->assertSuccessful();
    }

    public function test_an_out_of_range_minute_is_refused(): void
    {
        $this->artisan('automation:run-scheduled --hour=9 --minute=60')
            ->expectsOutputToContain('Minute must be between 0 and 59.')
            ->assertFailed();
    }

    public function test_a_rule_with_no_time_set_is_reported_rather_than_silently_skipped(): void
    {
        // The shape the builder used to save when the pickers were left alone:
        // the UI showed 09:00 but nothing was stored, so the rule matched no run
        // and sat enabled and silent.
        $this->rule([]);

        Log::shouldReceive('warning')
            ->once()
            ->withArgs(fn (string $message, array $ctx = []) =>
                str_contains($message, 'no time set'));

        $this->artisan('automation:run-scheduled --hour=9 --minute=0 --dry-run')
            ->assertSuccessful();
    }

    public function test_a_rule_with_a_time_is_not_reported(): void
    {
        $this->rule(['hour' => 9, 'minute' => 0]);

        Log::shouldReceive('warning')->never();

        $this->artisan('automation:run-scheduled --hour=9 --minute=0 --dry-run')
            ->assertSuccessful();
    }
}
