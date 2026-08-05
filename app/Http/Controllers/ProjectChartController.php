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
     * How it is drawn.
     *
     * Grouped into families rather than checked by name: a time chart plots a
     * date axis, and a circular one divides a single whole so it can be neither
     * split nor given a target line. Adding a type means adding it to a list
     * here, not hunting down every comparison against 'donut'.
     */
    private const TIME_CHARTS = ['line', 'area'];
    private const CIRCULAR_CHARTS = ['donut', 'pie'];
    private const CHART_TYPES = ['bar', 'column', 'donut', 'pie', 'line', 'area'];

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
            'chart_type' => ['required', Rule::in(self::CHART_TYPES)],
            'group_by' => ['required', Rule::in([...self::CATEGORY_DIMENSIONS, ...self::TIME_DIMENSIONS])],
            'custom_field_id' => [
                'nullable',
                'integer',
                Rule::exists('custom_fields', 'id')->where('project_id', $project->id),
            ],
            'scope' => ['nullable', Rule::in(['all', 'active', 'done'])],

            // A second dimension, splitting each bar or line into series —
            // "status, broken down by assignee".
            'stack_by' => ['nullable', Rule::in(self::CATEGORY_DIMENSIONS)],
            'stack_custom_field_id' => [
                'nullable',
                'integer',
                Rule::exists('custom_fields', 'id')->where('project_id', $project->id),
            ],

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

        // Time charts take a date axis; every other type takes a category.
        $allowed = in_array($validated['chart_type'], self::TIME_CHARTS, true)
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

        $stackBy = $validated['stack_by'] ?? null;

        if ($stackBy !== null) {
            // A donut or pie is already a breakdown of one whole; splitting its
            // segments again has nowhere to go.
            if (in_array($validated['chart_type'], self::CIRCULAR_CHARTS, true)) {
                abort(422, 'A donut or pie cannot be split by a second dimension.');
            }

            // Splitting a dimension by itself yields one series per bar and
            // tells you nothing you could not read off the bar.
            if ($stackBy === $validated['group_by']) {
                abort(422, 'Choose a different dimension to split by.');
            }

            if ($stackBy === 'custom_field') {
                $field = $project->customFields()->find($validated['stack_custom_field_id'] ?? null);

                if (!$field || $field->type !== 'single_select') {
                    abort(422, 'Splitting by a custom field needs a single-select field.');
                }
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

        // A donut or pie divides a whole into parts. An average is not a whole,
        // so the segments would not add up to anything.
        if (in_array($validated['chart_type'], self::CIRCULAR_CHARTS, true) && $measure === 'avg_custom_field') {
            abort(422, 'A donut or pie cannot show an average — its segments have to sum to the total.');
        }

        return $validated;
    }

    /** The stored shape, built the same way for create and update. */
    private function configFrom(array $validated): array
    {
        $measure = $validated['measure'] ?? 'count';

        // Options the chosen type cannot draw are dropped here rather than
        // stored and quietly ignored. The browser already does this; doing it
        // on the server too means the stored config always describes something
        // the chart can actually render, whichever client wrote it.
        $circular = in_array($validated['chart_type'], self::CIRCULAR_CHARTS, true);
        $overTime = in_array($validated['chart_type'], self::TIME_CHARTS, true);

        return [
            'custom_field_id' => $validated['group_by'] === 'custom_field'
                ? (int) $validated['custom_field_id']
                : null,
            'scope' => $validated['scope'] ?? 'all',
            'measure' => $measure,
            'measure_custom_field_id' => in_array($measure, self::FIELD_MEASURES, true)
                ? (int) $validated['measure_custom_field_id']
                : null,
            'stack_by' => $validated['stack_by'] ?? null,
            'stack_custom_field_id' => ($validated['stack_by'] ?? null) === 'custom_field'
                ? (int) $validated['stack_custom_field_id']
                : null,
            'x_label' => $validated['x_label'] ?? null,
            'y_label' => $validated['y_label'] ?? null,
            // A time chart's X axis is dates, so a hand-entered category has
            // nowhere to sit; a circle has no axis to draw a target across.
            'manual_points' => $overTime ? [] : $this->normalisePairs($validated['manual_points'] ?? []),
            'reference_lines' => $circular ? [] : $this->normalisePairs($validated['reference_lines'] ?? []),
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
