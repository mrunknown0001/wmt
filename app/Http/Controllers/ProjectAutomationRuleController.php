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

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'trigger_type' => 'required|string|in:task_created,task_status_changed,task_priority_changed,task_assigned,task_completed',
            'conditions' => 'nullable|array',
            'conditions.*.field' => 'required|string|in:status,priority,assigned_to,section_id',
            'conditions.*.operator' => 'required|string|in:equals,not_equals,in,not_in',
            'conditions.*.value' => 'present',
            'actions' => 'required|array|min:1',
            'actions.*.type' => 'required|string|in:change_status,change_priority,assign_user,move_to_section,send_notification',
            'actions.*.params' => 'required|array',
        ]);

        $rule = $project->automationRules()->create([
            ...$validated,
            'created_by' => $request->user()->id,
        ]);

        $rule->load('creator:id,name');

        return response()->json(['rule' => $rule], 201);
    }

    public function update(Request $request, Project $project, ProjectAutomationRule $rule): JsonResponse
    {
        $this->authorizeProject($project);
        abort_if($rule->project_id !== $project->id, 404);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'trigger_type' => 'required|string|in:task_created,task_status_changed,task_priority_changed,task_assigned,task_completed',
            'conditions' => 'nullable|array',
            'conditions.*.field' => 'required|string|in:status,priority,assigned_to,section_id',
            'conditions.*.operator' => 'required|string|in:equals,not_equals,in,not_in',
            'conditions.*.value' => 'present',
            'actions' => 'required|array|min:1',
            'actions.*.type' => 'required|string|in:change_status,change_priority,assign_user,move_to_section,send_notification',
            'actions.*.params' => 'required|array',
        ]);

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
}
