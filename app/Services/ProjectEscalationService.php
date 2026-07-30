<?php

namespace App\Services;

use App\Models\ProjectEscalationRule;
use App\Models\Task;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Escalation for projects that have opted out of the global tiers.
 *
 * The ladder is the project's own list of rules, in the order the project set
 * them. A task only ever climbs it — reaching rung three does not re-fire rungs
 * one and two — which is the same contract the global tiers have and is what
 * `tasks.escalation_level` records.
 */
class ProjectEscalationService
{
    /**
     * The highest rung this task has reached, or null if none.
     *
     * Rules are considered in the order the project arranged them, so the
     * ladder is the user's, not one inferred from the offsets.
     *
     * @param  Collection<int, ProjectEscalationRule>  $rules
     * @return array{level: int, rule: ProjectEscalationRule}|null
     */
    public static function highestReached(Task $task, Collection $rules, ?\Carbon\Carbon $now = null): ?array
    {
        $now ??= now();
        $reached = null;

        foreach ($rules->sortBy('position')->values() as $index => $rule) {
            if (!$rule->is_active) {
                continue;
            }

            if ($rule->isReached($task, $now)) {
                // Levels are 1-based to line up with escalation_level, which
                // uses 0 for "not escalated".
                $reached = ['level' => $index + 1, 'rule' => $rule];
            }
        }

        return $reached;
    }

    /**
     * The people a rule notifies, deduplicated and active only.
     *
     * Org-based audiences are resolved from the assignee, so a single rule
     * reaches the right supervisor whoever happens to hold the task.
     *
     * @return array<int, User>
     */
    public static function recipients(Task $task, ProjectEscalationRule $rule): array
    {
        $assignee = $task->assignee;
        $keys = collect($rule->recipients ?? []);
        $found = collect();

        if ($keys->contains('assignee') && $assignee) {
            $found->push($assignee);
        }

        if ($keys->contains('team_leader') && $assignee?->team?->leader_id) {
            $found->push(User::find($assignee->team->leader_id));
        }

        if ($keys->contains('department_head') && $assignee?->department?->head_id) {
            $found->push(User::find($assignee->department->head_id));
        }

        if ($keys->contains('division_head') && $assignee?->department?->division?->head_id) {
            $found->push(User::find($assignee->department->division->head_id));
        }

        if ($keys->contains('project_owner') && $task->project?->owner_id) {
            $found->push(User::find($task->project->owner_id));
        }

        if ($keys->contains('project_admins') && $task->project) {
            $found = $found->merge(
                $task->project->members()->wherePivot('role', 'admin')->get()
            );
        }

        if ($keys->contains('executives')) {
            $found = $found->merge(User::role('executive')->where('is_active', true)->get());
        }

        return $found
            ->filter()
            // An inactive account cannot act on the escalation, and mailing a
            // departed employee is how an escalation goes unanswered.
            ->filter(fn (User $u) => (bool) $u->is_active)
            ->unique('id')
            ->values()
            ->all();
    }
}
