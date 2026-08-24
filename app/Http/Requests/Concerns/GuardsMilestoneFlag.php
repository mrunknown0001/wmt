<?php

namespace App\Http\Requests\Concerns;

use App\Models\Project;
use App\Models\Task;
use Closure;

/**
 * Who may mark a task as a milestone.
 *
 * Lives on the requests rather than in the controllers because the same three
 * requests serve the web, API and standalone task controllers. Putting the
 * check in one controller would leave the other three able to set the flag —
 * the same shape of gap that let a task be filed into another project's section.
 */
trait GuardsMilestoneFlag
{
    /**
     * A rule that refuses the flag unless this person runs the project.
     *
     * Only refuses when the value would actually *change*, so an ordinary edit
     * that submits the whole form unaltered still saves for an assignee.
     */
    protected function milestoneFlagRule(): Closure
    {
        return function (string $attribute, $value, Closure $fail) {
            $task = $this->route('task');
            $wanted = filter_var($value, FILTER_VALIDATE_BOOLEAN);

            if ($task instanceof Task && (bool) $task->is_milestone === $wanted) {
                return; // unchanged — nothing to authorise
            }

            $project = $this->milestoneProject($task);

            if (!$project) {
                $fail('Only tasks in a project can be milestones.');
                return;
            }

            if (!$this->user()?->can('update', $project)) {
                $fail('Only the project owner or an administrator can mark a task as a milestone.');
            }
        };
    }

    /** The project the flag would apply in: the route's, the task's, or the body's. */
    private function milestoneProject($task): ?Project
    {
        $project = $this->route('project');
        if ($project instanceof Project) {
            return $project;
        }
        if ($project) {
            return Project::find($project);
        }
        if ($task instanceof Task && $task->project_id) {
            return Project::find($task->project_id);
        }

        return $this->filled('project_id') ? Project::find($this->input('project_id')) : null;
    }
}
