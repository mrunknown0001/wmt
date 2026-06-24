<?php

namespace App\Console\Commands;

use App\Models\Task;
use App\Notifications\TaskDueSoonNotification;
use App\Notifications\TaskOverdueNotification;
use Illuminate\Console\Command;
use Illuminate\Notifications\DatabaseNotification;

class SendTaskReminders extends Command
{
    protected $signature = 'tasks:send-reminders';
    protected $description = 'Send notifications for tasks due soon or overdue';

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

        $this->info("Sent {$dueSoonCount} due-soon and {$overdueCount} overdue notifications.");

        return self::SUCCESS;
    }

    private function alreadyNotifiedToday(Task $task, string $type): bool
    {
        return DatabaseNotification::where('notifiable_id', $task->assigned_to)
            ->where('notifiable_type', \App\Models\User::class)
            ->whereDate('created_at', now()->toDateString())
            ->where('data->type', $type)
            ->where('data->task_id', $task->id)
            ->exists();
    }
}
