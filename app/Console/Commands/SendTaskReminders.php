<?php

namespace App\Console\Commands;

use App\Models\Setting;
use App\Models\Task;
use App\Models\User;
use App\Notifications\TaskDueReminderNotification;
use App\Notifications\TaskEscalatedNotification;
use App\Notifications\TaskOverdueNotification;
use App\Services\ProjectEscalationService;
use Illuminate\Console\Command;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\Log;

class SendTaskReminders extends Command
{
    protected $signature = 'tasks:send-reminders';
    protected $description = 'Send notifications for tasks due soon, overdue, and escalated';

    public function handle(): int
    {
        $today = now()->startOfDay();
        $settings = Setting::current();

        // Configurable due-date reminders
        $reminderCount = 0;
        if ($settings->task_reminders_enabled && !empty($settings->task_reminder_days)) {
            foreach ($settings->task_reminder_days as $daysBefore) {
                $targetDate = $today->copy()->addDays($daysBefore);

                $tasks = Task::with(['assignee', 'project'])
                    ->whereNotNull('assigned_to')
                    ->whereNotNull('due_date')
                    ->whereDate('due_date', $targetDate)
                    ->whereNotIn('status', ['done', 'cancelled'])
                    ->get();

                foreach ($tasks as $task) {
                    if ($this->alreadyNotifiedToday($task, 'task_due_reminder', $daysBefore)) {
                        continue;
                    }
                    $task->assignee->notify(new TaskDueReminderNotification($task, $daysBefore));
                    $reminderCount++;
                }
            }
        }

        // Overdue tasks
        $overdueTasks = Task::with(['assignee', 'project'])
            ->whereNotNull('assigned_to')
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<', $today)
            ->whereNotIn('status', ['done', 'cancelled'])
            ->get();

        $overdueCount = 0;
        foreach ($overdueTasks as $task) {
            if ($this->alreadyNotifiedToday($task, 'task_overdue')) {
                continue;
            }
            $task->assignee->notify(new TaskOverdueNotification($task));
            $overdueCount++;
        }

        // Escalation.
        //
        // Two ladders: the tiers in admin settings, and per-project rules for
        // projects that have opted out. A task uses one or the other, never
        // both — being escalated twice for the same lateness, by two systems
        // with different labels, is worse than not being escalated at all.
        //
        // Tasks due today are included here, unlike the day-based query above:
        // an hours-based project rule can fire the same afternoon a task was
        // due, so filtering to due_date < today would never let it run.
        $escalationTasks = Task::with([
                'assignee.department.division', 'assignee.team',
                'project.escalationRules',
            ])
            ->whereNotNull('assigned_to')
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<=', $today)
            ->whereNotIn('status', ['done', 'cancelled'])
            ->get();

        $escalatedCount = 0;

        foreach ($escalationTasks as $task) {
            // No project means no project rules, so those tasks stay on the
            // global tiers.
            $useProjectRules = $task->project && !$task->project->usesGlobalEscalation();

            $escalatedCount += $useProjectRules
                ? $this->escalateByProjectRules($task)
                : $this->escalateByGlobalTiers($task, $settings, $today);
        }

        $this->info("Sent {$reminderCount} reminder(s), {$overdueCount} overdue, and {$escalatedCount} escalation notifications.");

        return self::SUCCESS;
    }

    /** The global tiers, unchanged: whole days overdue against admin settings. */
    private function escalateByGlobalTiers(Task $task, Setting $settings, \Carbon\Carbon $today): int
    {
        if (!$settings->escalation_enabled || empty($settings->escalation_tiers)) {
            return 0;
        }

        // The global ladder is day-based, so a task due today is not yet late.
        if (!$task->due_date || $task->due_date->copy()->startOfDay() >= $today) {
            return 0;
        }

        // Operand order matters: Carbon returns a signed difference, so
        // $today->diffInDays($dueDate) is *negative* for an overdue task and no
        // tier ever matched. Counting forward from the due date is what the
        // tiers are expressed in anyway.
        $daysOverdue = (int) $task->due_date->copy()->startOfDay()->diffInDays($today);
        $newLevel = $this->calculateEscalationLevel($daysOverdue, $settings->escalation_tiers);

        if ($newLevel <= 0 || $newLevel <= $task->escalation_level) {
            return 0;
        }

        $label = Setting::ESCALATION_LABELS[$newLevel] ?? "Level {$newLevel}";
        $recipients = $this->getEscalationRecipients($task, $newLevel);

        foreach ($recipients as $recipient) {
            $recipient->notify(new TaskEscalatedNotification($task, $newLevel, $label));
        }

        // Recorded even when the rung resolved to nobody, matching the project
        // ladder below: retrying it every run would pin the task to this rung
        // and stop it ever reaching the ones above.
        $task->update(['escalation_level' => $newLevel]);

        if ($recipients === []) {
            $this->warnEscalationReachedNobody($task, $newLevel, $label);

            return 0;
        }

        return 1;
    }

    /** The project's own ladder, which may be measured in days or in hours. */
    private function escalateByProjectRules(Task $task): int
    {
        $rules = $task->project->escalationRules;

        if ($rules->isEmpty()) {
            return 0;
        }

        $reached = ProjectEscalationService::highestReached($task, $rules);

        if ($reached === null || $reached['level'] <= $task->escalation_level) {
            return 0;
        }

        $rule = $reached['rule'];
        $recipients = ProjectEscalationService::recipients($task, $rule);

        foreach ($recipients as $recipient) {
            $recipient->notify(new TaskEscalatedNotification(
                $task, $reached['level'], $rule->name, $rule->describeOffset(),
            ));
        }

        // Recorded even when the rule resolved to nobody — otherwise a rung
        // with a vacant supervisor would be retried on every run, and would
        // block the rungs above it from ever being reached.
        $task->update(['escalation_level' => $reached['level']]);

        if ($recipients === []) {
            $this->warnEscalationReachedNobody($task, $reached['level'], $rule->name);

            return 0;
        }

        return 1;
    }

    /**
     * An escalation that resolves to nobody is otherwise invisible: the rung is
     * recorded like any other, so it is never retried, and the command reports a
     * clean run. That is indistinguishable from success until somebody asks why
     * an overdue task was never chased.
     *
     * Most often the audience is simply vacant — an assignee with no team or
     * department, or a project whose owner is the assignee and so is excluded
     * from their own escalation.
     */
    private function warnEscalationReachedNobody(Task $task, int $level, string $rung): void
    {
        Log::warning('Task escalation reached nobody.', [
            'task_id' => $task->id,
            'project_id' => $task->project_id,
            'assigned_to' => $task->assigned_to,
            'level' => $level,
            'rung' => $rung,
        ]);
    }

    private function alreadyNotifiedToday(Task $task, string $type, ?int $daysBefore = null): bool
    {
        $query = DatabaseNotification::where('notifiable_id', $task->assigned_to)
            ->where('notifiable_type', User::class)
            ->whereDate('created_at', now()->toDateString())
            ->where('data->type', $type)
            ->where('data->task_id', $task->id);

        if ($daysBefore !== null) {
            $query->where('data->days_before', $daysBefore);
        }

        return $query->exists();
    }

    private function calculateEscalationLevel(int $daysOverdue, array $tiers): int
    {
        $level = 0;
        foreach ($tiers as $index => $tier) {
            $tierLevel = $index + 1; // tiers are 0-indexed in settings, 1-indexed for levels
            if (!empty($tier['enabled']) && $daysOverdue >= $tier['days']) {
                $level = $tierLevel;
            }
        }
        return $level;
    }

    private function getEscalationRecipients(Task $task, int $level): array
    {
        $recipients = [];
        $assignee = $task->assignee;

        if (!$assignee) {
            return $recipients;
        }

        switch ($level) {
            case 1: // re-remind assignee
                $recipients[] = $assignee;
                break;

            case 2: // supervisor (team leader), manager (department head) & project owner
                if ($assignee->team && $assignee->team->leader_id) {
                    $leader = User::find($assignee->team->leader_id);
                    if ($leader) $recipients[] = $leader;
                }
                if ($assignee->department && $assignee->department->head_id) {
                    $head = User::find($assignee->department->head_id);
                    if ($head) $recipients[] = $head;
                }
                if ($task->project && $task->project->owner_id && $task->project->owner_id !== $assignee->id) {
                    $owner = User::find($task->project->owner_id);
                    if ($owner) $recipients[] = $owner;
                }
                break;

            case 3: // division head
                $division = $assignee->department?->division;
                if ($division && $division->head_id) {
                    $divHead = User::find($division->head_id);
                    if ($divHead) $recipients[] = $divHead;
                }
                break;

            case 4: // executives
                $executives = User::role('executive')->where('is_active', true)->get();
                foreach ($executives as $exec) {
                    $recipients[] = $exec;
                }
                break;
        }

        // Deduplicate, and drop anyone who has left.
        //
        // Only the executive tier filtered on is_active, so levels 1-3 were
        // escalating to deactivated accounts — a departed team leader or
        // department head still named on an org unit would swallow the
        // escalation, and nobody would know it had gone nowhere.
        $seen = [];

        return array_values(array_filter($recipients, function (User $user) use (&$seen) {
            if (isset($seen[$user->id]) || !$user->is_active) {
                return false;
            }

            $seen[$user->id] = true;

            return true;
        }));
    }
}
