<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\ProjectAutomationRule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProjectAutomationRuleController extends Controller
{
    private function authorizeProject(Project $project): void
    {
        $user = auth()->user();
        if (!$user->can('manage-tasks') && $project->owner_id !== $user->id && !$project->isProjectAdmin($user)) {
            abort(403);
        }
    }

    private function ruleValidationRules(): array
    {
        return [
            'name' => 'required|string|max:255',
            'trigger_type' => 'required|string|in:task_created,task_status_changed,task_priority_changed,task_assigned,task_completed,custom_field_changed',
            'trigger_config' => 'nullable|array',
            'trigger_config.custom_field_id' => 'nullable|integer',
            'conditions' => 'nullable|array',
            'conditions.*.field' => 'required|string|in:status,priority,assigned_to,section_id,custom_field',
            'conditions.*.operator' => 'required|string|in:equals,not_equals,in,not_in,contains,not_contains,is_empty,is_not_empty,greater_than,less_than,before,after',
            'conditions.*.value' => 'present',
            'conditions.*.custom_field_id' => 'nullable|integer',
            'actions' => 'required|array|min:1',
            'actions.*.type' => 'required|string|in:change_status,change_priority,assign_user,move_to_section,send_notification,add_comment,set_custom_field',
            'actions.*.params' => 'required|array',
        ];
    }

    public function index(Project $project): JsonResponse
    {
        $this->authorizeProject($project);

        $rules = $project->automationRules()
            ->with('creator:id,name')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['rules' => $rules]);
    }

    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorizeProject($project);

        $validated = $request->validate($this->ruleValidationRules());

        $rule = $project->automationRules()->create([
            ...$validated,
            'is_active' => true,
            'created_by' => $request->user()->id,
        ]);

        $rule->load('creator:id,name');

        return response()->json(['rule' => $rule], 201);
    }

    public function update(Request $request, Project $project, ProjectAutomationRule $rule): JsonResponse
    {
        $this->authorizeProject($project);
        abort_if($rule->project_id !== $project->id, 404);

        $validated = $request->validate($this->ruleValidationRules());

        $rule->update($validated);
        $rule->load('creator:id,name');

        return response()->json(['rule' => $rule]);
    }

    public function destroy(Project $project, ProjectAutomationRule $rule): JsonResponse
    {
        $this->authorizeProject($project);
        abort_if($rule->project_id !== $project->id, 404);

        $rule->delete();

        return response()->json(['success' => true]);
    }

    public function toggle(Project $project, ProjectAutomationRule $rule): JsonResponse
    {
        $this->authorizeProject($project);
        abort_if($rule->project_id !== $project->id, 404);

        $rule->update(['is_active' => !$rule->is_active]);

        return response()->json(['rule' => $rule]);
    }

    public function duplicate(Project $project, ProjectAutomationRule $rule): JsonResponse
    {
        $this->authorizeProject($project);
        abort_if($rule->project_id !== $project->id, 404);

        $newRule = $project->automationRules()->create([
            'name' => "Copy of {$rule->name}",
            'is_active' => false,
            'trigger_type' => $rule->trigger_type,
            'trigger_config' => $rule->trigger_config,
            'conditions' => $rule->conditions,
            'actions' => $rule->actions,
            'created_by' => auth()->id(),
        ]);

        $newRule->load('creator:id,name');

        return response()->json(['rule' => $newRule], 201);
    }
}
