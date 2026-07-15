<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\ProjectChart;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProjectChartController extends Controller
{
    private const CATEGORY_DIMENSIONS = ['status', 'priority', 'assignee', 'section', 'custom_field'];
    private const TIME_DIMENSIONS = ['completed_over_time', 'created_over_time', 'due_over_time'];

    /**
     * Charts can be managed by admins (manage-projects), executives (all
     * projects), the project owner, or project admin members.
     */
    private function authorizeCharts(Project $project): void
    {
        $user = auth()->user();

        if ($user->can('manage-projects')
            || $user->hasRole('admin')
            || $user->hasRole('executive')
            || $project->owner_id === $user->id
            || $project->isProjectAdmin($user)) {
            return;
        }

        abort(403);
    }

    private function validateChart(Request $request, Project $project): array
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'chart_type' => ['required', Rule::in(['bar', 'donut', 'line'])],
            'group_by' => ['required', Rule::in([...self::CATEGORY_DIMENSIONS, ...self::TIME_DIMENSIONS])],
            'custom_field_id' => [
                'nullable',
                'integer',
                Rule::exists('custom_fields', 'id')->where('project_id', $project->id),
            ],
            'scope' => ['nullable', Rule::in(['all', 'active', 'done'])],
        ]);

        // Line charts take time dimensions; bar/donut take category dimensions
        $allowed = $validated['chart_type'] === 'line'
            ? self::TIME_DIMENSIONS
            : self::CATEGORY_DIMENSIONS;

        if (!in_array($validated['group_by'], $allowed)) {
            abort(422, 'The selected dimension is not valid for this chart type.');
        }

        if ($validated['group_by'] === 'custom_field') {
            $field = $project->customFields()->find($validated['custom_field_id'] ?? null);
            if (!$field || $field->type !== 'single_select') {
                abort(422, 'Charts require a single-select custom field.');
            }
        }

        return $validated;
    }

    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorizeCharts($project);

        $validated = $this->validateChart($request, $project);

        $chart = $project->charts()->create([
            'title' => $validated['title'],
            'chart_type' => $validated['chart_type'],
            'group_by' => $validated['group_by'],
            'config' => [
                'custom_field_id' => $validated['group_by'] === 'custom_field'
                    ? (int) $validated['custom_field_id']
                    : null,
                'scope' => $validated['scope'] ?? 'all',
            ],
            'position' => ((int) $project->charts()->max('position')) + 1,
            'created_by' => $request->user()->id,
        ]);

        return response()->json(['chart' => $chart], 201);
    }

    public function update(Request $request, Project $project, ProjectChart $chart): JsonResponse
    {
        $this->authorizeCharts($project);
        abort_if($chart->project_id !== $project->id, 404);

        $validated = $this->validateChart($request, $project);

        $chart->update([
            'title' => $validated['title'],
            'chart_type' => $validated['chart_type'],
            'group_by' => $validated['group_by'],
            'config' => [
                'custom_field_id' => $validated['group_by'] === 'custom_field'
                    ? (int) $validated['custom_field_id']
                    : null,
                'scope' => $validated['scope'] ?? 'all',
            ],
        ]);

        return response()->json(['chart' => $chart->fresh()]);
    }

    public function destroy(Project $project, ProjectChart $chart): JsonResponse
    {
        $this->authorizeCharts($project);
        abort_if($chart->project_id !== $project->id, 404);

        $chart->delete();

        return response()->json(['success' => true]);
    }
}
