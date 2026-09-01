<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\ProjectViewPreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * How this person wants to look at this project.
 *
 * Gated on viewing rather than editing: choosing a sort order changes nothing
 * for anybody else, and refusing it to a reader would leave them with a list
 * that forgets itself on every visit.
 */
class ProjectViewPreferenceController extends Controller
{
    public function update(Request $request, Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        $validated = $request->validate([
            // Null is a real answer: it means sorting was turned off.
            'sort' => ['present', 'nullable', 'array'],
            'sort.key' => ['required_with:sort', 'string', 'max:64'],
            'sort.direction' => ['required_with:sort', Rule::in(['asc', 'desc'])],
        ]);

        $row = ProjectViewPreference::firstOrNew([
            'user_id' => $request->user()->id,
            'project_id' => $project->id,
        ]);

        // Merged rather than replaced so this endpoint can carry the other view
        // settings later without each one clobbering the rest.
        $row->preferences = array_merge($row->preferences ?? [], [
            'sort' => $validated['sort'] ?? null,
        ]);
        $row->save();

        return response()->json(['sort' => ProjectViewPreference::sortFor($request->user(), $project)]);
    }
}
