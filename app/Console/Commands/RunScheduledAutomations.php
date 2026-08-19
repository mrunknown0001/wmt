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
 * scheduler runs it every minute and it sweeps every task in the project,
 * applying any rule whose configured time matches the current one.
 *
 * Every minute rather than hourly because a rule can now name a minute as well
 * as an hour. The cost of a run that matches nothing is one indexed query and a
 * PHP filter over a small set, so the sweep itself only happens on the minute a
 * rule actually asked for.
 */
class RunScheduledAutomations extends Command
{
    protected $signature = 'automation:run-scheduled
                            {--hour= : Override the hour to match (0-23), for testing}
                            {--minute= : Override the minute to match (0-59), for testing}
                            {--dry-run : Report what would run without executing actions}';

    protected $description = 'Run project automation rules that use the scheduled (time-based) trigger';

    public function handle(): int
    {
        $hour = $this->option('hour') !== null
            ? (int) $this->option('hour')
            : (int) now()->format('G');

        $minute = $this->option('minute') !== null
            ? (int) $this->option('minute')
            : (int) now()->format('i');

        if ($hour < 0 || $hour > 23) {
            $this->error('Hour must be between 0 and 23.');
            return self::FAILURE;
        }

        if ($minute < 0 || $minute > 59) {
            $this->error('Minute must be between 0 and 59.');
            return self::FAILURE;
        }

        $at = sprintf('%02d:%02d', $hour, $minute);

        $dryRun = (bool) $this->option('dry-run');

        $rules = ProjectAutomationRule::query()
            ->where('is_active', true)
            ->where('trigger_type', 'scheduled')
            ->get()
            // Filtered in PHP rather than SQL: trigger_config is a JSON column and
            // this set is small enough that a portable comparison is worth more
            // than an index.
            // A rule saved before minutes existed has no minute, and used to fire
            // on the hour — so absent means :00 rather than "any minute", which
            // would fire it sixty times a day.
            ->filter(fn (ProjectAutomationRule $rule) =>
                (int) ($rule->trigger_config['hour'] ?? -1) === $hour
                && (int) ($rule->trigger_config['minute'] ?? 0) === $minute);

        if ($rules->isEmpty()) {
            $this->info("No scheduled automation rules set for {$at}.");
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

        $this->info("Scheduled automations for {$at} — {$rules->count()} rule(s), {$matched} task(s) actioned.");

        return self::SUCCESS;
    }
}
