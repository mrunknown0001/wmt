<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApprovalProject;
use App\Models\ApprovalSection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ApprovalSectionController extends Controller
{
    private function authorizeProject(ApprovalProject $project): void
    {
        if (!auth()->user()->can('manage-approval-projects')
            && $project->owner_id !== auth()->id()
            && !$project->isProjectAdmin(auth()->user())) {
            abort(403);
        }
    }

    public function store(Request $request, ApprovalProject $approvalProject): JsonResponse
    {
        $this->authorizeProject($approvalProject);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'color' => 'nullable|string|max:7',
        ]);

        $maxPosition = $approvalProject->sections()->max('position') ?? -1;

        $section = $approvalProject->sections()->create([
            'name' => $validated['name'],
            'color' => $validated['color'] ?? '#6366f1',
            'position' => $maxPosition + 1,
        ]);

        return response()->json(['section' => $section], 201);
    }

    public function update(Request $request, ApprovalProject $approvalProject, ApprovalSection $section): JsonResponse
    {
        $this->authorizeProject($approvalProject);

        if ($section->approval_project_id !== $approvalProject->id) {
            abort(404);
        }

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'color' => 'nullable|string|max:7',
        ]);

        $section->update($validated);

        return response()->json(['section' => $section]);
    }

    public function destroy(ApprovalProject $approvalProject, ApprovalSection $section): JsonResponse
    {
        $this->authorizeProject($approvalProject);

        if ($section->approval_project_id !== $approvalProject->id) {
            abort(404);
        }

        $section->delete();

        return response()->json(null, 204);
    }
}
