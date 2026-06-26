<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\TaskSection;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskSectionController extends Controller
{
    private function authorizeSectionAccess(Project $project): void
    {
        if (!auth()->user()->can('manage-tasks') && $project->owner_id !== auth()->id()) {
            abort(403);
        }
    }

    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorizeSectionAccess($project);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
        ]);

        $maxPosition = $project->sections()->max('position') ?? -1;

        $section = $project->sections()->create([
            'name' => $validated['name'],
            'position' => $maxPosition + 1,
        ]);

        ActivityLogger::logCreated($section, auth()->user());

        return response()->json($section, 201);
    }

    public function update(Request $request, Project $project, TaskSection $section): JsonResponse
    {
        $this->authorizeSectionAccess($project);

        if ($section->project_id !== $project->id) {
            abort(404);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
        ]);

        $oldValues = $section->only(['name']);

        $section->update($validated);

        ActivityLogger::logChanges($section, $oldValues, auth()->user());

        return response()->json($section);
    }

    public function destroy(Project $project, TaskSection $section): JsonResponse
    {
        $this->authorizeSectionAccess($project);

        if ($section->project_id !== $project->id) {
            abort(404);
        }

        // Unassign tasks from this section
        $section->tasks()->update(['section_id' => null]);

        ActivityLogger::logDeleted($section, auth()->user());

        $section->delete();

        return response()->json(['success' => true]);
    }

    public function reorder(Request $request, Project $project): JsonResponse
    {
        $this->authorizeSectionAccess($project);

        $validated = $request->validate([
            'sections' => 'required|array',
            'sections.*.id' => 'required|integer',
            'sections.*.position' => 'required|integer|min:0',
        ]);

        foreach ($validated['sections'] as $item) {
            TaskSection::where('id', $item['id'])
                ->where('project_id', $project->id)
                ->update(['position' => $item['position']]);
        }

        return response()->json(['success' => true]);
    }
}
