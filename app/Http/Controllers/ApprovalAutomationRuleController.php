<?php

namespace App\Http\Controllers;

use App\Models\ApprovalProject;
use App\Models\Team;
use App\Models\User;
use App\Models\ApprovalAutomationRule;
use App\Http\Requests\StoreApprovalAutomationRuleRequest;
use App\Http\Requests\UpdateApprovalAutomationRuleRequest;
use Inertia\Inertia;

class ApprovalAutomationRuleController extends Controller
{
    /**
     * Users and teams selectable as "Send Notification" targets. Teams carry a
     * member count so an empty team is obvious before it's picked.
     */
    private static function notifyTargetOptions(): array
    {
        return [
            'notifyUsers' => User::where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'name', 'email']),
            'notifyTeams' => Team::withCount(['members' => fn ($q) => $q->where('is_active', true)])
                ->orderBy('name')
                ->get(['id', 'name']),
        ];
    }

    private function authorizeProject(ApprovalProject $project): void
    {
        if (!auth()->user()->can('manage-approval-projects')
            && $project->owner_id !== auth()->id()
            && !$project->isProjectAdmin(auth()->user())) {
            abort(403);
        }
    }

    public function index(ApprovalProject $approvalProject)
    {
        $this->authorizeProject($approvalProject);

        $rules = $approvalProject->automationRules()
            ->with('creator')
            ->orderBy('created_at', 'desc')
            ->get();

        return Inertia::render('ApprovalAutomationRules/Index', [
            'project' => $approvalProject,
            'rules' => $rules,
        ]);
    }

    public function create(ApprovalProject $approvalProject)
    {
        $this->authorizeProject($approvalProject);

        return Inertia::render('ApprovalAutomationRules/Create', [
            'project' => $approvalProject->load('customFields.options'),
            ...self::notifyTargetOptions(),
        ]);
    }

    public function store(StoreApprovalAutomationRuleRequest $request, ApprovalProject $approvalProject)
    {
        $this->authorizeProject($approvalProject);

        $approvalProject->automationRules()->create([
            'name' => $request->name,
            'is_active' => $request->is_active ?? true,
            'trigger_type' => $request->trigger_type,
            'trigger_config' => $request->trigger_config,
            'conditions' => $request->conditions,
            'actions' => $request->actions,
            'created_by' => auth()->id(),
        ]);

        return redirect()->route('approval-projects.automation-rules.index', $approvalProject)
            ->with('success', 'Automation rule created successfully.');
    }

    public function edit(ApprovalProject $approvalProject, ApprovalAutomationRule $rule)
    {
        $this->authorizeProject($approvalProject);
        abort_if($rule->approval_project_id !== $approvalProject->id, 404);

        return Inertia::render('ApprovalAutomationRules/Edit', [
            'project' => $approvalProject->load('customFields.options'),
            'rule' => $rule,
            ...self::notifyTargetOptions(),
        ]);
    }

    public function update(UpdateApprovalAutomationRuleRequest $request, ApprovalProject $approvalProject, ApprovalAutomationRule $rule)
    {
        $this->authorizeProject($approvalProject);
        abort_if($rule->approval_project_id !== $approvalProject->id, 404);

        $rule->update([
            'name' => $request->name,
            'is_active' => $request->is_active ?? true,
            'trigger_type' => $request->trigger_type,
            'trigger_config' => $request->trigger_config,
            'conditions' => $request->conditions,
            'actions' => $request->actions,
        ]);

        return redirect()->route('approval-projects.automation-rules.index', $approvalProject)
            ->with('success', 'Automation rule updated successfully.');
    }

    public function destroy(ApprovalProject $approvalProject, ApprovalAutomationRule $rule)
    {
        $this->authorizeProject($approvalProject);
        abort_if($rule->approval_project_id !== $approvalProject->id, 404);

        $rule->delete();

        return redirect()->route('approval-projects.automation-rules.index', $approvalProject)
            ->with('success', 'Automation rule deleted successfully.');
    }

    public function toggle(ApprovalProject $approvalProject, ApprovalAutomationRule $rule)
    {
        $this->authorizeProject($approvalProject);
        abort_if($rule->approval_project_id !== $approvalProject->id, 404);

        $rule->update(['is_active' => !$rule->is_active]);

        return back()->with('success', 'Automation rule ' . ($rule->is_active ? 'activated' : 'deactivated') . '.');
    }
}
