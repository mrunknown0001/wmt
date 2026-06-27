<?php

namespace App\Console\Commands;

use App\Models\Setting;
use App\Models\Task;
use App\Models\User;
use App\Notifications\TaskDueReminderNotification;
use App\Notifications\TaskEscalatedNotification;
use App\Notifications\TaskOverdueNotification;
use Illuminate\Console\Command;
use Illuminate\Notifications\DatabaseNotification;

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

        // Escalation tiers (configurable via admin settings)
        $escalatedCount = 0;
        if ($settings->escalation_enabled && !empty($settings->escalation_tiers)) {
            $escalationTasks = Task::with(['assignee.department.division', 'assignee.team', 'project'])
                ->whereNotNull('assigned_to')
                ->whereNotNull('due_date')
                ->whereDate('due_date', '<', $today)
                ->whereNotIn('status', ['done', 'cancelled'])
                ->get();

            foreach ($escalationTasks as $task) {
                $daysOverdue = $today->diffInDays($task->due_date);
                $newLevel = $this->calculateEscalationLevel($daysOverdue, $settings->escalation_tiers);

                if ($newLevel > 0 && $newLevel > $task->escalation_level) {
                    $label = Setting::ESCALATION_LABELS[$newLevel] ?? "Level {$newLevel}";
                    $recipients = $this->getEscalationRecipients($task, $newLevel);

                    foreach ($recipients as $recipient) {
                        $recipient->notify(new TaskEscalatedNotification($task, $newLevel, $label));
                    }

                    $task->update(['escalation_level' => $newLevel]);
                    $escalatedCount++;
                }
            }
        }

        $this->info("Sent {$reminderCount} reminder(s), {$overdueCount} overdue, and {$escalatedCount} escalation notifications.");

        return self::SUCCESS;
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

        // Deduplicate by user ID
        $seen = [];
        return array_filter($recipients, function ($user) use (&$seen) {
            if (isset($seen[$user->id])) return false;
            $seen[$user->id] = true;
            return true;
        });
    }
}
