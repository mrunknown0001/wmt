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
    private const CATEGORY_DIMENSIONS = [
        'status', 'priority', 'assignee', 'section', 'created_by',
        // Derived rather than stored: computed from due_date and status the
        // same way the rest of the app decides what is late.
        'overdue', 'has_due_date',
        'custom_field',
    ];
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
    private const CHART_TYPES = ['bar', 'column', 'donut', 'pie', 'line', 'area', 'metric'];

    /**
     * A card rather than a chart: one computed number.
     *
     * It shares this table because it is the same thing minus an axis — same
     * measure, same scope, same permissions, same ordering. Giving it its own
     * table would have duplicated all of that to save one column.
     */
    private const METRIC_CHARTS = ['metric'];

    /** Bucket widths a time chart's X axis can use. */
    private const TIME_GROUPINGS = ['auto', 'day', 'week', 'week_number', 'month'];

    /** Windows a chart can be limited to, and the date each is measured against. */
    private const DATE_RANGES = ['all', 'last_7', 'last_30', 'last_90', 'this_month', 'this_quarter', 'this_year', 'custom'];
    private const DATE_FIELDS = ['created', 'completed', 'due'];

    /** How the bars are ordered before the tail folds into "Other". */
    private const SORTS = ['natural', 'value_desc', 'value_asc', 'label'];

    /**
     * How a split bar/column draws its series: piled into one bar, or side by
     * side. Same data either way — it changes the drawing, not the numbers.
     */
    private const BAR_MODES = ['stacked', 'grouped'];

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
        'count_filled',     // tasks holding a value in any field
        'count_distinct',   // how many different values that field holds
    ];

    /** Measures that need a number custom field naming. */
    private const NUMBER_FIELD_MEASURES = ['sum_custom_field', 'avg_custom_field'];

    /**
     * Measures that work on any field at all.
     *
     * A date, a select or a person cannot be added up, but counting how many
     * tasks carry one — or how many different ones there are — is a perfectly
     * good Y axis, and restricting the picker to numbers kept most of a
     * project's own data off its charts.
     */
    private const ANY_FIELD_MEASURES = ['count_filled', 'count_distinct'];

    /** Every measure that needs a field naming, whatever its type. */
    private const FIELD_MEASURES = [...self::NUMBER_FIELD_MEASURES, ...self::ANY_FIELD_MEASURES];

    /** Field types that hold something a total or an average can use. */
    private const NUMERIC_FIELD_TYPES = ['number', 'formula'];

    /** Ceilings on hand-entered data, so one chart can't carry a spreadsheet. */
    private const MAX_MANUAL_POINTS = 20;
    private const MAX_REFERENCE_LINES = 3;
    private const MAX_CARD_FILTERS = 5;

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
            // 'none' belongs to cards, which have nothing to group by.
            'group_by' => ['required', Rule::in([...self::CATEGORY_DIMENSIONS, ...self::TIME_DIMENSIONS, 'none'])],
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

            // Stacked or side-by-side, for a split bar/column.
            'bar_mode' => ['nullable', Rule::in(self::BAR_MODES)],

            'measure' => ['nullable', Rule::in(self::MEASURES)],
            'measure_custom_field_id' => [
                'nullable',
                'integer',
                Rule::exists('custom_fields', 'id')->where('project_id', $project->id),
            ],

            // How wide each bucket on a time chart is. Null or 'auto' keeps
            // the original behaviour: weeks, switching to months past twenty.
            'time_grouping' => ['nullable', Rule::in(self::TIME_GROUPINGS)],

            // Category charts only: a legend naming each bar's colour.
            'show_legend' => ['nullable', 'boolean'],

            // A window over the data. Applies to every type; on a time chart
            // the field follows the axis rather than being chosen.
            'date_range' => ['nullable', Rule::in(self::DATE_RANGES)],
            'date_field' => ['nullable', Rule::in(self::DATE_FIELDS)],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],

            // Bar order, and how many before the rest fold into "Other".
            'sort' => ['nullable', Rule::in(self::SORTS)],
            'max_buckets' => ['nullable', 'integer', 'min:2', 'max:30'],

            'x_label' => ['nullable', 'string', 'max:60'],
            'y_label' => ['nullable', 'string', 'max:60'],

            // Figures typed in by hand and shown beside the live data — a
            // budget, last quarter's total, a number that lives in someone
            // else's spreadsheet.
            'manual_points' => ['nullable', 'array', 'max:' . self::MAX_MANUAL_POINTS],
            'manual_points.*.label' => ['required', 'string', 'max:40'],
            'manual_points.*.value' => ['required', 'numeric', 'min:-1000000000', 'max:1000000000'],

            // Narrow the tasks anything is computed from, so a chart can show
            // "urgent tasks by assignee" and not just totals. Every type.
            'filters' => ['nullable', 'array', 'max:' . self::MAX_CARD_FILTERS],
            'filters.*.field' => ['required', Rule::in(self::CATEGORY_DIMENSIONS)],
            'filters.*.custom_field_id' => ['nullable', 'integer'],
            'filters.*.value' => ['required', 'string', 'max:120'],

            // What the number is shown against: nothing, the same measure over
            // the whole scope, or a figure typed in.
            'compare' => ['nullable', Rule::in(['none', 'percent', 'target'])],
            'target' => ['nullable', 'numeric', 'min:-1000000000', 'max:1000000000'],

            // Constant horizontal lines: a target, a threshold, a capacity.
            'reference_lines' => ['nullable', 'array', 'max:' . self::MAX_REFERENCE_LINES],
            'reference_lines.*.label' => ['required', 'string', 'max:40'],
            'reference_lines.*.value' => ['required', 'numeric', 'min:-1000000000', 'max:1000000000'],
        ]);

        $isMetric = in_array($validated['chart_type'], self::METRIC_CHARTS, true);

        // Time charts take a date axis; category charts take a category; a card
        // has no axis at all.
        $allowed = $isMetric
            ? ['none']
            : (in_array($validated['chart_type'], self::TIME_CHARTS, true)
                ? self::TIME_DIMENSIONS
                : self::CATEGORY_DIMENSIONS);

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

            if (!$field) {
                abort(422, 'Measuring a custom field needs the field naming.');
            }

            // Counting works on anything; totalling does not. Summing a text or
            // select field would produce a number that looks real and means
            // nothing.
            if (in_array($measure, self::NUMBER_FIELD_MEASURES, true)) {
                $numeric = in_array($field->type, self::NUMERIC_FIELD_TYPES, true)
                    // A formula answering Yes/No or a date is no more summable
                    // than a checkbox would be.
                    && ($field->type !== 'formula'
                        || ($field->config['result_type'] ?? 'number') === 'number');

                if (!$numeric) {
                    abort(422, 'Totalling a custom field needs a number or a number-returning formula.');
                }
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
        $isMetric = in_array($validated['chart_type'], self::METRIC_CHARTS, true);

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
            // Clustered bars only mean something on a split bar or column. On a
            // circle, a time chart, a card, or an unsplit chart there is nothing
            // to sit side by side, so it is not stored.
            'bar_mode' => (!$circular && !$overTime && !$isMetric && ($validated['stack_by'] ?? null))
                ? ($validated['bar_mode'] ?? 'stacked')
                : null,
            // Only meaningful on a time chart — a category axis has no buckets
            // to widen, so storing one there would be dead config.
            'time_grouping' => $overTime ? ($validated['time_grouping'] ?? 'auto') : null,
            // A time axis has no categories to name, and a circle draws its
            // own legend already.
            'show_legend' => (!$overTime && !$circular && !$isMetric)
                ? (bool) ($validated['show_legend'] ?? false)
                : false,
            'x_label' => $validated['x_label'] ?? null,
            'y_label' => $validated['y_label'] ?? null,
            // A time chart's X axis is dates, so a hand-entered category has
            // nowhere to sit; a circle has no axis to draw a target across; a
            // card has neither, and uses `target` for the same purpose.
            'manual_points' => ($overTime || $isMetric) ? [] : $this->normalisePairs($validated['manual_points'] ?? []),
            'reference_lines' => ($circular || $isMetric) ? [] : $this->normalisePairs($validated['reference_lines'] ?? []),

            // Card-only settings. Kept out of a chart's config entirely rather
            // than stored and ignored, so what is saved describes what is drawn.
            'filters' => $this->normaliseFilters($validated['filters'] ?? []),

            'date_range' => $validated['date_range'] ?? 'all',
            // Only meaningful when a window is set, and a time chart takes its
            // field from the axis, so storing one there would be misleading.
            'date_field' => ($overTime || ($validated['date_range'] ?? 'all') === 'all')
                ? null
                : ($validated['date_field'] ?? 'created'),
            'date_from' => ($validated['date_range'] ?? null) === 'custom' ? ($validated['date_from'] ?? null) : null,
            'date_to' => ($validated['date_range'] ?? null) === 'custom' ? ($validated['date_to'] ?? null) : null,

            // A time axis is already in date order and a card has one value, so
            // neither has bars to arrange.
            'sort' => ($overTime || $isMetric) ? null : ($validated['sort'] ?? 'natural'),
            'max_buckets' => ($overTime || $isMetric) ? null : ($validated['max_buckets'] ?? null),
            'compare' => $isMetric ? ($validated['compare'] ?? 'none') : null,
            'target' => ($isMetric && ($validated['compare'] ?? null) === 'target')
                ? (float) ($validated['target'] ?? 0)
                : null,
        ];
    }

    /**
     * Tidy a card's filter rows.
     *
     * The value is whatever key the browser derives for that dimension — a
     * status, a user id, a section id, a custom field option. It is kept as a
     * string because those keys are not all of one type, and the comparison is
     * done against the same derivation on the way out.
     */
    private function normaliseFilters(array $rows): array
    {
        return collect($rows)
            ->map(fn ($row) => [
                'field' => $row['field'] ?? null,
                'custom_field_id' => isset($row['custom_field_id']) ? (int) $row['custom_field_id'] : null,
                'value' => (string) ($row['value'] ?? ''),
            ])
            ->filter(fn ($row) => $row['field'] !== null && $row['value'] !== '')
            ->values()
            ->all();
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
