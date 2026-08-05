<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\TaskSection;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

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
            'color' => 'nullable|string|max:7',
            // A sub-section sits under exactly one section. The model refuses a
            // parent that is itself a sub-section, which is what holds the
            // structure to a single level.
            'parent_id' => [
                'nullable',
                'integer',
                Rule::exists('task_sections', 'id')->where('project_id', $project->id),
            ],
        ]);

        $parentId = $validated['parent_id'] ?? null;

        // Position is per-list: a sub-section is numbered among its siblings,
        // not against the top-level columns.
        $maxPosition = $project->sections()
            ->where('parent_id', $parentId)
            ->max('position') ?? -1;

        $section = $project->sections()->create([
            'name' => $validated['name'],
            'parent_id' => $parentId,
            'color' => $validated['color'] ?? null,
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
            'name' => 'sometimes|required|string|max:255',
            'color' => 'nullable|string|max:7',
            'parent_id' => [
                'sometimes',
                'nullable',
                'integer',
                Rule::exists('task_sections', 'id')->where('project_id', $project->id),
            ],
        ]);

        $oldValues = $section->only(['name', 'color', 'parent_id']);

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

        // Unassign the tasks of this section and of any sub-section under it.
        // The foreign key would null them anyway when the children cascade, but
        // doing it here keeps the outcome the same whichever level is removed.
        $section->tasks()->update(['section_id' => null]);

        foreach ($section->children as $child) {
            $child->tasks()->update(['section_id' => null]);
        }

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
            // Present when a drag moved a sub-section to a different column.
            // Absent leaves the parent alone, so an ordinary reorder is
            // unchanged from before sub-sections existed.
            'sections.*.parent_id' => 'sometimes|nullable|integer',
        ]);

        // Saved through the model rather than with a query-builder update, so
        // the depth rule in TaskSection::saving() actually runs. A drag that
        // would nest two levels deep fails the whole batch instead of leaving
        // the board half-rearranged.
        DB::transaction(function () use ($validated, $project) {
            foreach ($validated['sections'] as $item) {
                $section = TaskSection::where('id', $item['id'])
                    ->where('project_id', $project->id)
                    ->first();

                if (!$section) {
                    continue;
                }

                $section->position = $item['position'];

                if (array_key_exists('parent_id', $item)) {
                    $section->parent_id = $item['parent_id'];
                }

                $section->save();
            }
        });

        return response()->json(['success' => true]);
    }
}
