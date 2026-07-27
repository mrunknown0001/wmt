<?php

namespace App\Console\Commands;

use App\Models\ProjectAutomationRule;
use App\Models\Task;
use App\Services\AutomationRuleEngine;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Drives the "Scheduled" automation trigger.
 *
 * Event triggers fire off a task change; this one has no such event, so the
 * scheduler runs it hourly and it sweeps every task in the project, applying
 * any rule whose configured hour matches the current one.
 */
class RunScheduledAutomations extends Command
{
    protected $signature = 'automation:run-scheduled
                            {--hour= : Override the hour to match (0-23), for testing}
                            {--dry-run : Report what would run without executing actions}';

    protected $description = 'Run project automation rules that use the scheduled (time-based) trigger';

    public function handle(): int
    {
        $hour = $this->option('hour') !== null
            ? (int) $this->option('hour')
            : (int) now()->format('G');

        if ($hour < 0 || $hour > 23) {
            $this->error('Hour must be between 0 and 23.');
            return self::FAILURE;
        }

        $dryRun = (bool) $this->option('dry-run');

        $rules = ProjectAutomationRule::query()
            ->where('is_active', true)
            ->where('trigger_type', 'scheduled')
            ->get()
            // Filtered in PHP rather than SQL: trigger_config is a JSON column and
            // this set is small enough that a portable comparison is worth more
            // than an index.
            ->filter(fn (ProjectAutomationRule $rule) => (int) ($rule->trigger_config['hour'] ?? -1) === $hour);

        if ($rules->isEmpty()) {
            $this->info("No scheduled automation rules set for {$hour}:00.");
            return self::SUCCESS;
        }

        $matched = 0;

        foreach ($rules as $rule) {
            // Closed tasks are excluded: a rule like "due date is before today"
            // would otherwise keep firing on work that is already finished.
            $tasks = Task::query()
                ->where('project_id', $rule->project_id)
                ->whereNotIn('status', Task::CLOSING_STATUSES)
                ->get();

            foreach ($tasks as $task) {
                try {
                    if ($dryRun) {
                        $this->line("  would evaluate: rule \"{$rule->name}\" against task #{$task->id}");
                        continue;
                    }

                    if (AutomationRuleEngine::runRuleForTask($rule, $task)) {
                        $matched++;
                        $this->line("  ran \"{$rule->name}\" on task #{$task->id}");
                    }
                } catch (\Throwable $e) {
                    // One bad task must not stop the sweep.
                    Log::error('Scheduled automation failed', [
                        'rule_id' => $rule->id,
                        'task_id' => $task->id,
                        'error' => $e->getMessage(),
                    ]);
                    $this->warn("  failed on task #{$task->id}: {$e->getMessage()}");
                }
            }
        }

        $this->info("Scheduled automations for {$hour}:00 — {$rules->count()} rule(s), {$matched} task(s) actioned.");

        return self::SUCCESS;
    }
}
