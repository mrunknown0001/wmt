<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use Illuminate\Http\JsonResponse;

class AutomationRuleController extends Controller
{
    public function __invoke(Project $project): JsonResponse
    {
        $user = auth()->user();
        if (!$user->can('manage-tasks') && $project->owner_id !== $user->id && !$project->isProjectAdmin($user)) {
            abort(403);
        }

        $rules = $project->automationRules()
            ->with('creator:id,name')
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(fn ($rule) => [
                'id' => $rule->id,
                'name' => $rule->name,
                'trigger' => $rule->trigger_type,
                'conditions' => $rule->conditions,
                'actions' => $rule->actions,
                'is_active' => $rule->is_active,
            ]);

        return response()->json(['rules' => $rules]);
    }
}
