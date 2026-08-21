<?php

namespace App\Http\Requests\Concerns;

use Illuminate\Validation\Rule;

/**
 * The rule a submitted section_id has to satisfy.
 *
 * A section belongs to exactly one project, so `exists:task_sections,id` is not
 * enough on its own: it proves the section exists somewhere, not that it exists
 * *here*. Without the project in the comparison a task can be filed into another
 * project's section, which breaks the assumption every piece of grouping code
 * makes — that a task and its section share a project.
 *
 * Shared by the three task requests because all three are used by both the
 * project-scoped and the standalone controllers, and each of them applies the
 * validated data straight to the model.
 */
trait ScopesSectionToProject
{
    /**
     * The project a section must belong to for this request.
     *
     * Three ways in, because the same request classes serve several routes:
     *   - /projects/{project}/tasks/...  the route carries the project
     *   - /tasks/{task}                  no project in the path, so use the task's
     *   - creation with no project route the body may name one
     */
    protected function sectionProjectId(): ?int
    {
        $project = $this->route('project');
        if ($project) {
            return (int) (is_object($project) ? $project->getKey() : $project);
        }

        $task = $this->route('task');
        if (is_object($task) && $task->project_id) {
            return (int) $task->project_id;
        }

        return $this->filled('project_id') ? (int) $this->input('project_id') : null;
    }

    /**
     * Null is always allowed — ungrouping a task is legitimate.
     *
     * When there is no project, the comparison runs against a null project_id,
     * which matches no row and so rejects every id. That is the wanted outcome:
     * a task outside any project has no sections it could belong to.
     */
    protected function sectionIdRule()
    {
        return Rule::exists('task_sections', 'id')
            ->where('project_id', $this->sectionProjectId());
    }
}
