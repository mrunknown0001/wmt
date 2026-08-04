<?php

namespace App\Services;

use App\Models\Project;
use App\Models\Task;
use App\Models\TaskActivity;
use App\Models\User;

class AiContextBuilder
{
    public static function build(User $user): string
    {
        $user->load('department.division', 'team');

        $sections = array_filter([
            self::buildUserProfile($user),
            self::buildActiveTasks($user),
            self::buildOverdueTasks($user),
            self::buildProjects($user),
            self::buildAllProjects($user),
            self::buildTeamWorkload($user),
            self::buildOrgMetrics($user),
            self::buildRecentActivity($user),
        ]);

        return implode("\n\n", $sections);
    }

    private static function buildUserProfile(User $user): string
    {
        $roles = $user->getRoleNames()->implode(', ');
        $dept = $user->department;
        $team = $user->team;
        $division = $dept?->division;

        $lines = ["## Your Profile"];
        $lines[] = "- Name: {$user->name}";
        $lines[] = "- Role: {$roles}";
        if ($user->position) {
            $lines[] = "- Position: {$user->position}";
        }
        if ($division) {
            $lines[] = "- Division: {$division->name}";
        }
        if ($dept) {
            $lines[] = "- Department: {$dept->name}";
        }
        if ($team) {
            $leader = $team->leader;
            $lines[] = "- Team: {$team->name}" . ($leader ? " (Leader: {$leader->name})" : '');
        }

        return implode("\n", $lines);
    }

    private static function buildActiveTasks(User $user): string
    {
        $tasks = Task::with('project')
            ->where('assigned_to', $user->id)
            ->whereNotIn('status', ['done', 'cancelled'])
            ->orderBy('due_date')
            ->take(50)
            ->get();

        if ($tasks->isEmpty()) {
            return "## Your Active Tasks\nNo active tasks.";
        }

        $lines = ["## Your Active Tasks ({$tasks->count()} total)"];
        $lines[] = "| Task | Project | Status | Priority | Due Date |";
        $lines[] = "|------|---------|--------|----------|----------|";

        foreach ($tasks as $task) {
            $due = $task->due_date ? $task->due_date->toDateString() : '—';
            $project = $task->project?->name ?? '—';
            $lines[] = "| {$task->title} | {$project} | {$task->status} | {$task->priority} | {$due} |";
        }

        return implode("\n", $lines);
    }

    private static function buildOverdueTasks(User $user): string
    {
        $tasks = Task::with('project')
            ->where('assigned_to', $user->id)
            ->whereNotIn('status', ['done', 'cancelled'])
            ->pastDue()
            ->orderBy('due_date')
            ->get();

        if ($tasks->isEmpty()) {
            return "## Overdue Tasks\nNo overdue tasks.";
        }

        $lines = ["## Overdue Tasks ({$tasks->count()})"];
        $lines[] = "| Task | Project | Priority | Due Date | Days Overdue |";
        $lines[] = "|------|---------|----------|----------|--------------|";

        foreach ($tasks as $task) {
            $daysOverdue = now()->startOfDay()->diffInDays($task->due_date);
            $lines[] = "| {$task->title} | {$task->project?->name} | {$task->priority} | {$task->due_date->toDateString()} | {$daysOverdue} |";
        }

        return implode("\n", $lines);
    }

    private static function buildProjects(User $user): string
    {
        $ownedProjects = Project::where('owner_id', $user->id)
            ->withCount('tasks')
            ->withCount(['tasks as completed_tasks_count' => fn ($q) => $q->where('status', 'done')])
            ->get();

        $memberProjects = $user->memberProjects()
            ->withCount('tasks')
            ->withCount(['tasks as completed_tasks_count' => fn ($q) => $q->where('status', 'done')])
            ->get();

        $projects = $ownedProjects->merge($memberProjects)->unique('id');

        if ($projects->isEmpty()) {
            return "## Your Projects\nNo projects.";
        }

        $lines = ["## Your Projects ({$projects->count()})"];
        $lines[] = "| Project | Role | Status | Tasks | Completed | Rate |";
        $lines[] = "|---------|------|--------|-------|-----------|------|";

        foreach ($projects as $project) {
            $role = $project->owner_id === $user->id ? 'Owner' : 'Member';
            $rate = $project->tasks_count > 0
                ? round(($project->completed_tasks_count / $project->tasks_count) * 100) . '%'
                : '—';
            $lines[] = "| {$project->name} | {$role} | {$project->status} | {$project->tasks_count} | {$project->completed_tasks_count} | {$rate} |";
        }

        return implode("\n", $lines);
    }

    /**
     * Org-wide project visibility for admins and executives: they can ask the AI
     * about ANY project, not just ones they own or belong to.
     */
    private static function buildAllProjects(User $user): ?string
    {
        if (!$user->hasAnyRole(['admin', 'executive'])) {
            return null;
        }

        $limit = 50;
        $total = Project::count();

        $projects = Project::with('owner:id,name')
            ->withCount('tasks')
            ->withCount(['tasks as completed_tasks_count' => fn ($q) => $q->where('status', 'done')])
            ->withCount(['tasks as overdue_tasks_count' => fn ($q) => $q
                ->whereNotIn('status', ['done', 'cancelled'])
                ->pastDue()])
            ->orderByDesc('updated_at')
            ->take($limit)
            ->get();

        if ($projects->isEmpty()) {
            return "## All Projects (Organization-wide)\nNo projects.";
        }

        $heading = $total > $limit
            ? "## All Projects (Organization-wide — showing {$limit} most recent of {$total})"
            : "## All Projects (Organization-wide, {$total})";

        $lines = [$heading];
        $lines[] = "You have organization-wide access to every project below, including those you do not own or belong to.";
        $lines[] = "| Project | Owner | Status | Tasks | Completed | Overdue | Rate |";
        $lines[] = "|---------|-------|--------|-------|-----------|---------|------|";

        foreach ($projects as $project) {
            $rate = $project->tasks_count > 0
                ? round(($project->completed_tasks_count / $project->tasks_count) * 100) . '%'
                : '—';
            $owner = $project->owner?->name ?? '—';
            $lines[] = "| {$project->name} | {$owner} | {$project->status} | {$project->tasks_count} | {$project->completed_tasks_count} | {$project->overdue_tasks_count} | {$rate} |";
        }

        return implode("\n", $lines);
    }

    private static function buildTeamWorkload(User $user): ?string
    {
        if (!$user->hasAnyRole(['admin', 'supervisor', 'division_head', 'executive'])) {
            return null;
        }

        $members = User::select('id', 'name')
            ->where('is_active', true)
            ->withCount(['assignedTasks as active_tasks' => fn ($q) => $q->whereNotIn('status', ['done', 'cancelled'])])
            ->withCount(['assignedTasks as overdue_tasks' => fn ($q) => $q->whereNotIn('status', ['done', 'cancelled'])->pastDue()])
            // See DashboardController: HAVING without GROUP BY is MySQL-only.
            ->whereHas('assignedTasks', fn ($q) => $q->whereNotIn('status', ['done', 'cancelled']))
            ->orderByDesc('active_tasks')
            ->take(20)
            ->get();

        if ($members->isEmpty()) {
            return "## Team Workload\nNo active workload.";
        }

        $lines = ["## Team Workload"];
        $lines[] = "| Member | Active Tasks | Overdue |";
        $lines[] = "|--------|-------------|---------|";

        foreach ($members as $member) {
            $lines[] = "| {$member->name} | {$member->active_tasks} | {$member->overdue_tasks} |";
        }

        return implode("\n", $lines);
    }

    private static function buildOrgMetrics(User $user): ?string
    {
        if (!$user->hasAnyRole(['admin', 'executive'])) {
            return null;
        }

        $totalTasks = Task::count();
        $completedTasks = Task::where('status', 'done')->count();
        $overdueTasks = Task::whereNotIn('status', ['done', 'cancelled'])
            ->pastDue()
            ->count();
        $activeProjects = Project::where('status', 'active')->count();
        $totalProjects = Project::count();
        $completionRate = $totalTasks > 0 ? round(($completedTasks / $totalTasks) * 100) : 0;

        $lines = ["## Organization Metrics"];
        $lines[] = "- Total tasks: {$totalTasks}";
        $lines[] = "- Completed tasks: {$completedTasks}";
        $lines[] = "- Completion rate: {$completionRate}%";
        $lines[] = "- Overdue tasks: {$overdueTasks}";
        $lines[] = "- Active projects: {$activeProjects}";
        $lines[] = "- Total projects: {$totalProjects}";

        return implode("\n", $lines);
    }

    private static function buildRecentActivity(User $user): string
    {
        $activities = TaskActivity::with(['task.project', 'user'])
            ->whereHas('task', fn ($q) => $q->where('assigned_to', $user->id))
            ->orderBy('created_at', 'desc')
            ->take(10)
            ->get();

        if ($activities->isEmpty()) {
            return "## Recent Activity\nNo recent activity.";
        }

        $lines = ["## Recent Activity"];

        foreach ($activities as $a) {
            $ago = $a->created_at->diffForHumans();
            $taskTitle = $a->task?->title ?? 'Unknown';
            $desc = $a->description ?: "{$a->field} changed from \"{$a->old_value}\" to \"{$a->new_value}\"";
            $lines[] = "- {$ago}: {$desc} on \"{$taskTitle}\"";
        }

        return implode("\n", $lines);
    }
}
