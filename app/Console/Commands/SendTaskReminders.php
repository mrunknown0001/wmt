<?php

namespace App\Console\Commands;

use App\Models\Task;
use App\Models\User;
use App\Notifications\TaskDueSoonNotification;
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
        $tomorrow = $today->copy()->addDay();

        // Tasks due tomorrow
        $dueSoonTasks = Task::with(['assignee', 'project'])
            ->whereNotNull('assigned_to')
            ->whereNotNull('due_date')
            ->whereDate('due_date', $tomorrow)
            ->whereNotIn('status', ['done', 'cancelled'])
            ->get();

        $dueSoonCount = 0;
        foreach ($dueSoonTasks as $task) {
            if ($this->alreadyNotifiedToday($task, 'task_due_soon')) {
                continue;
            }
            $task->assignee->notify(new TaskDueSoonNotification($task));
            $dueSoonCount++;
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

        // Escalation tiers
        $escalatedCount = 0;
        $escalationTasks = Task::with(['assignee.department.division', 'assignee.team', 'project'])
            ->whereNotNull('assigned_to')
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<', $today)
            ->whereNotIn('status', ['done', 'cancelled'])
            ->get();

        foreach ($escalationTasks as $task) {
            $daysOverdue = $today->diffInDays($task->due_date);
            $newLevel = $this->calculateEscalationLevel($daysOverdue);

            if ($newLevel > 0 && $newLevel > $task->escalation_level) {
                $tier = Task::ESCALATION_TIERS[$newLevel];
                $recipients = $this->getEscalationRecipients($task, $newLevel);

                foreach ($recipients as $recipient) {
                    $recipient->notify(new TaskEscalatedNotification($task, $newLevel, $tier['label']));
                }

                $task->update(['escalation_level' => $newLevel]);
                $escalatedCount++;
            }
        }

        $this->info("Sent {$dueSoonCount} due-soon, {$overdueCount} overdue, and {$escalatedCount} escalation notifications.");

        return self::SUCCESS;
    }

    private function alreadyNotifiedToday(Task $task, string $type): bool
    {
        return DatabaseNotification::where('notifiable_id', $task->assigned_to)
            ->where('notifiable_type', User::class)
            ->whereDate('created_at', now()->toDateString())
            ->where('data->type', $type)
            ->where('data->task_id', $task->id)
            ->exists();
    }

    private function calculateEscalationLevel(int $daysOverdue): int
    {
        $level = 0;
        foreach (Task::ESCALATION_TIERS as $tierLevel => $tier) {
            if ($daysOverdue >= $tier['days']) {
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
            case 1: // 1 day — re-remind assignee
                $recipients[] = $assignee;
                break;

            case 2: // 3 days — team leader + project owner
                if ($assignee->team && $assignee->team->leader_id) {
                    $leader = User::find($assignee->team->leader_id);
                    if ($leader) $recipients[] = $leader;
                }
                if ($task->project && $task->project->owner_id && $task->project->owner_id !== $assignee->id) {
                    $owner = User::find($task->project->owner_id);
                    if ($owner) $recipients[] = $owner;
                }
                break;

            case 3: // 7 days — department head
                if ($assignee->department && $assignee->department->head_id) {
                    $head = User::find($assignee->department->head_id);
                    if ($head) $recipients[] = $head;
                }
                break;

            case 4: // 14 days — division head + executives
                $division = $assignee->department?->division;
                if ($division && $division->head_id) {
                    $divHead = User::find($division->head_id);
                    if ($divHead) $recipients[] = $divHead;
                }
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
