<?php

namespace App\Http\Controllers;

use App\Models\CustomField;
use App\Models\Project;
use App\Models\ProjectChart;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProjectChartController extends Controller
{
    /** What goes along the X axis. */
    private const CATEGORY_DIMENSIONS = ['status', 'priority', 'assignee', 'section', 'custom_field'];
    private const TIME_DIMENSIONS = ['completed_over_time', 'created_over_time', 'due_over_time'];

    /**
     * What goes up the Y axis.
     *
     * Until now every chart counted tasks. Being able to plot hours — estimated
     * against logged, or a numeric custom field — is what turns these from a
     * task tally into something you can read a project from.
     */
    private const MEASURES = [
        'count',            // number of tasks
        'sum_estimate',     // estimated hours
        'sum_logged',       // hours actually recorded
        'sum_custom_field', // total of a number field
        'avg_custom_field', // its average
    ];

    /** Measures that need a number custom field naming. */
    private const FIELD_MEASURES = ['sum_custom_field', 'avg_custom_field'];

    /** Ceilings on hand-entered data, so one chart can't carry a spreadsheet. */
    private const MAX_MANUAL_POINTS = 20;
    private const MAX_REFERENCE_LINES = 3;

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

            'measure' => ['nullable', Rule::in(self::MEASURES)],
            'measure_custom_field_id' => [
                'nullable',
                'integer',
                Rule::exists('custom_fields', 'id')->where('project_id', $project->id),
            ],

            'x_label' => ['nullable', 'string', 'max:60'],
            'y_label' => ['nullable', 'string', 'max:60'],

            // Figures typed in by hand and shown beside the live data — a
            // budget, last quarter's total, a number that lives in someone
            // else's spreadsheet.
            'manual_points' => ['nullable', 'array', 'max:' . self::MAX_MANUAL_POINTS],
            'manual_points.*.label' => ['required', 'string', 'max:40'],
            'manual_points.*.value' => ['required', 'numeric', 'min:-1000000000', 'max:1000000000'],

            // Constant horizontal lines: a target, a threshold, a capacity.
            'reference_lines' => ['nullable', 'array', 'max:' . self::MAX_REFERENCE_LINES],
            'reference_lines.*.label' => ['required', 'string', 'max:40'],
            'reference_lines.*.value' => ['required', 'numeric', 'min:-1000000000', 'max:1000000000'],
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

        $measure = $validated['measure'] ?? 'count';

        if (in_array($measure, self::FIELD_MEASURES, true)) {
            $field = $project->customFields()->find($validated['measure_custom_field_id'] ?? null);

            // Summing a text or select field would produce a number that looks
            // real and means nothing.
            if (!$field || !in_array($field->type, ['number', 'formula'], true)) {
                abort(422, 'Totalling a custom field needs a number or formula field.');
            }
        }

        // A donut divides a whole into parts. An average is not a whole, so the
        // segments would not add up to anything.
        if ($validated['chart_type'] === 'donut' && $measure === 'avg_custom_field') {
            abort(422, 'A donut cannot show an average — its segments have to sum to the total.');
        }

        return $validated;
    }

    /** The stored shape, built the same way for create and update. */
    private function configFrom(array $validated): array
    {
        $measure = $validated['measure'] ?? 'count';

        return [
            'custom_field_id' => $validated['group_by'] === 'custom_field'
                ? (int) $validated['custom_field_id']
                : null,
            'scope' => $validated['scope'] ?? 'all',
            'measure' => $measure,
            'measure_custom_field_id' => in_array($measure, self::FIELD_MEASURES, true)
                ? (int) $validated['measure_custom_field_id']
                : null,
            'x_label' => $validated['x_label'] ?? null,
            'y_label' => $validated['y_label'] ?? null,
            'manual_points' => $this->normalisePairs($validated['manual_points'] ?? []),
            'reference_lines' => $this->normalisePairs($validated['reference_lines'] ?? []),
        ];
    }

    /** Trim and cast hand-entered rows, dropping anything left blank. */
    private function normalisePairs(array $rows): array
    {
        return collect($rows)
            ->map(fn ($row) => [
                'label' => trim((string) ($row['label'] ?? '')),
                'value' => (float) ($row['value'] ?? 0),
            ])
            ->filter(fn ($row) => $row['label'] !== '')
            ->values()
            ->all();
    }

    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorizeCharts($project);

        $validated = $this->validateChart($request, $project);

        $chart = $project->charts()->create([
            'title' => $validated['title'],
            'chart_type' => $validated['chart_type'],
            'group_by' => $validated['group_by'],
            'config' => $this->configFrom($validated),
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
            'config' => $this->configFrom($validated),
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
