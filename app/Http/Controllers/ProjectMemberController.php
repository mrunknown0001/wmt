<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProjectMemberController extends Controller
{
    private function authorizeMemberAccess(Project $project): void
    {
        $user = auth()->user();
        if (!$user->can('manage-projects') && $project->owner_id !== $user->id && !$project->isProjectAdmin($user)) {
            abort(403);
        }
    }

    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorizeMemberAccess($project);

        $validated = $request->validate([
            'members' => 'required|array|min:1',
            'members.*.user_id' => 'required|integer|exists:users,id',
            'members.*.role' => 'required|string|in:viewer,editor,admin',
        ]);

        foreach ($validated['members'] as $member) {
            $project->members()->syncWithoutDetaching([
                $member['user_id'] => ['role' => $member['role']],
            ]);
        }

        return response()->json([
            'success' => true,
            'members' => $project->load('members')->members,
        ], 201);
    }

    public function update(Request $request, Project $project, User $user): JsonResponse
    {
        $this->authorizeMemberAccess($project);

        if ($project->owner_id === $user->id) {
            return response()->json(['message' => 'Cannot change the owner\'s role.'], 422);
        }

        $validated = $request->validate([
            'role' => 'required|string|in:viewer,editor,admin',
        ]);

        $project->members()->updateExistingPivot($user->id, [
            'role' => $validated['role'],
        ]);

        return response()->json(['success' => true]);
    }

    public function destroy(Project $project, User $user): JsonResponse
    {
        $this->authorizeMemberAccess($project);

        if ($project->owner_id === $user->id) {
            return response()->json(['message' => 'Cannot remove the project owner.'], 422);
        }

        $project->members()->detach($user->id);

        return response()->json(['success' => true]);
    }
}
