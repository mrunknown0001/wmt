<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\ProjectAutomationRule;
use App\Services\SectionRouter;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class ProjectAutomationRuleController extends Controller
{
    private function authorizeProject(Project $project): void
    {
        $user = auth()->user();
        if (!$user->can('manage-tasks') && $project->owner_id !== $user->id && !$project->isProjectAdmin($user)) {
            abort(403);
        }
    }

    private function authorizeRuleManagement(): void
    {
        $user = auth()->user();
        // Allowed if the user has the per-user capability, or can manage projects
        // (admins) — consistent with how the rest of the app gates project management.
        if (!$user->can_create_rules && !$user->hasPermissionTo('manage-projects')) {
            abort(403, 'You do not have permission to manage automation rules.');
        }
    }

    /**
     * Validate and return JSON errors.
     *
     * The app only renders exceptions as JSON for api/* paths
     * (see bootstrap/app.php), so a plain $request->validate() here answers a
     * failed rule save with a redirect. The fetch that made the call then chases
     * that redirect instead of reading an error, which surfaces in the browser as
     * ERR_TOO_MANY_REDIRECTS rather than "trigger type is invalid".
     *
     * @throws \Illuminate\Http\Exceptions\HttpResponseException
     */
    private function validateRule(Request $request): array
    {
        $validator = Validator::make($request->all(), $this->ruleValidationRules());

        if ($validator->fails()) {
            throw new HttpResponseException(response()->json([
                'message' => $validator->errors()->first(),
                'errors' => $validator->errors()->toArray(),
            ], 422));
        }

        return $validator->validated();
    }

    private function ruleValidationRules(): array
    {
        return [
            'name' => 'required|string|max:255',
            'trigger_type' => 'required|string|in:task_created,task_status_changed,task_priority_changed,task_assigned,task_completed,custom_field_changed,form_submitted,scheduled',
            'trigger_config.hour' => 'nullable|integer|min:0|max:23',
            'trigger_config' => 'nullable|array',
            'trigger_config.custom_field_id' => 'nullable|integer',
            'trigger_config.form_id' => 'nullable|integer',
            'conditions' => 'nullable|array',
            // due_date / start_date are built-in date columns; the *_today
            // operators compare against today and carry no value of their own.
            'conditions.*.field' => 'required|string|in:status,priority,assigned_to,section_id,due_date,start_date,custom_field',
            'conditions.*.operator' => 'required|string|in:equals,not_equals,in,not_in,contains,not_contains,is_empty,is_not_empty,greater_than,less_than,before,after,before_today,after_today,is_today',
            'conditions.*.value' => 'present',
            'conditions.*.custom_field_id' => 'nullable|integer',
            'actions' => 'required|array|min:1',
            'actions.*.type' => 'required|string|in:change_status,change_priority,assign_user,move_to_section,send_notification,add_comment,set_custom_field',
            'actions.*.params' => 'required|array',

            // Where a move_to_section action files the task. 'none' drops it in
            // the section itself; 'fixed' names a sub-section; 'period' picks
            // the sub-section for the task's month, quarter or year, making it
            // the first time one is needed. See SectionRouter.
            'actions.*.params.subsection_mode' => 'nullable|string|in:none,fixed,period',
            'actions.*.params.subsection_id' => 'nullable|integer',
            'actions.*.params.period_format' => [
                'nullable',
                'string',
                Rule::in(array_keys(SectionRouter::PERIOD_FORMATS)),
            ],
            'actions.*.params.period_source' => ['nullable', 'string', Rule::in(SectionRouter::PERIOD_SOURCES)],
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
        $this->authorizeRuleManagement();

        $validated = $this->validateRule($request);

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
        $this->authorizeRuleManagement();
        abort_if($rule->project_id !== $project->id, 404);

        $validated = $this->validateRule($request);

        $rule->update($validated);
        $rule->load('creator:id,name');

        return response()->json(['rule' => $rule]);
    }

    public function destroy(Project $project, ProjectAutomationRule $rule): JsonResponse
    {
        $this->authorizeProject($project);
        $this->authorizeRuleManagement();
        abort_if($rule->project_id !== $project->id, 404);

        $rule->delete();

        return response()->json(['success' => true]);
    }

    public function toggle(Project $project, ProjectAutomationRule $rule): JsonResponse
    {
        $this->authorizeProject($project);
        $this->authorizeRuleManagement();
        abort_if($rule->project_id !== $project->id, 404);

        $rule->update(['is_active' => !$rule->is_active]);

        return response()->json(['rule' => $rule]);
    }

    public function duplicate(Project $project, ProjectAutomationRule $rule): JsonResponse
    {
        $this->authorizeProject($project);
        $this->authorizeRuleManagement();
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
