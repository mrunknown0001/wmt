import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import Modal, { ConfirmModal } from './Modal';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import { formatLabel, apiFetch, isPastDue } from '../utils';
import { isoWeekParts } from '../weekOfYear';

// Categorical palette (validated for CVD safety + contrast on white / gray-800
// surfaces). Slot order is the colorblind-safety mechanism — never reorder.
// Dark values are the same hues re-stepped for the dark surface.
const VIZ_STYLE = `
.wmt-viz {
    --viz-s1: #2a78d6; --viz-s2: #1baf7a; --viz-s3: #eda100; --viz-s4: #008300;
    --viz-s5: #4a3aa7; --viz-s6: #e34948; --viz-s7: #e87ba4; --viz-s8: #eb6834;
    --viz-other: #9ca3af;
    --viz-surface: #ffffff;
    --viz-grid: #e5e7eb;
    --viz-axis: #d1d5db;
    --viz-ink: #111827;
    --viz-ink-muted: #6b7280;
}
.dark .wmt-viz {
    --viz-s1: #3987e5; --viz-s2: #199e70; --viz-s3: #c98500; --viz-s4: #008300;
    --viz-s5: #9085e9; --viz-s6: #e66767; --viz-s7: #d55181; --viz-s8: #d95926;
    --viz-other: #6b7280;
    --viz-surface: #1f2937;
    --viz-grid: #374151;
    --viz-axis: #4b5563;
    --viz-ink: #f9fafb;
    --viz-ink-muted: #9ca3af;
}
`;

const SERIES_VARS = ['--viz-s1', '--viz-s2', '--viz-s3', '--viz-s4', '--viz-s5', '--viz-s6', '--viz-s7', '--viz-s8'];

// Matches the app-wide status/priority color language used across badges
// and the existing dashboard breakdown charts
const STATUS_HEX = {
    backlog: '#9ca3af',
    to_do: '#3b82f6',
    in_progress: '#eab308',
    in_review: '#a855f7',
    done: '#22c55e',
    cancelled: '#f87171',
};
const PRIORITY_HEX = {
    urgent: '#ef4444',
    high: '#f97316',
    medium: '#3b82f6',
    low: '#9ca3af',
};

const CATEGORY_DIMENSIONS = [
    { value: 'status', label: 'Status' },
    { value: 'priority', label: 'Priority' },
    { value: 'assignee', label: 'Assignee' },
    { value: 'section', label: 'Section' },
    { value: 'created_by', label: 'Created by' },
    { value: 'overdue', label: 'Overdue or on track' },
    { value: 'has_due_date', label: 'Has a due date' },
    { value: 'custom_field', label: 'Custom field (single-select)' },
];
const TIME_DIMENSIONS = [
    { value: 'completed_over_time', label: 'Tasks completed over time' },
    { value: 'created_over_time', label: 'Tasks created over time' },
    { value: 'due_over_time', label: 'Tasks due over time' },
];
/**
 * What goes up the Y axis.
 *
 * Counting tasks answers "how many"; totalling hours answers "how much work",
 * which is usually the question being asked of a project dashboard.
 */
const MEASURES = [
    { value: 'count', label: 'Number of tasks', unit: '' },
    { value: 'sum_estimate', label: 'Estimated hours', unit: 'h' },
    { value: 'sum_logged', label: 'Logged hours', unit: 'h' },
    { value: 'sum_custom_field', label: 'Total of a number field', unit: '', needsField: true },
    { value: 'avg_custom_field', label: 'Average of a number field', unit: '', needsField: true },
];

const measureSpec = (value) => MEASURES.find((m) => m.value === value) || MEASURES[0];

/** Number fields a measure can total. Formulas count — they resolve to numbers. */
const numericFields = (customFields) =>
    (customFields || []).filter((f) => f.type === 'number' || f.type === 'formula');

/**
 * The value one task contributes to a bucket.
 *
 * Returns null when the task has nothing to contribute, which is different from
 * zero: a task with no estimate should not drag an average down.
 */
function taskValue(task, measure, fieldId) {
    if (measure === 'sum_estimate') {
        return task.estimated_minutes ? task.estimated_minutes / 60 : null;
    }

    if (measure === 'sum_logged') {
        return task.logged_minutes ? task.logged_minutes / 60 : null;
    }

    if (measure === 'sum_custom_field' || measure === 'avg_custom_field') {
        const cfv = (task.custom_field_values || []).find((v) => v.custom_field_id === fieldId);
        const raw = cfv?.value_number;
        return raw === null || raw === undefined || raw === '' ? null : Number(raw);
    }

    return 1; // count
}

/** Roll a set of tasks up into one number for the chosen measure. */
function aggregate(tasks, measure, fieldId) {
    if (measure === 'count') {
        return tasks.length;
    }

    const values = tasks
        .map((t) => taskValue(t, measure, fieldId))
        .filter((v) => v !== null && !Number.isNaN(v));

    if (values.length === 0) return 0;

    const sum = values.reduce((a, b) => a + b, 0);

    // Averaged over the tasks that actually carry a value, not over every task
    // in the bucket — otherwise adding an unestimated task would lower the mean.
    return measure === 'avg_custom_field' ? sum / values.length : sum;
}

/** Whole numbers stay whole; hours and averages get one decimal at most. */
function formatValue(value, measure) {
    const unit = measureSpec(measure).unit;
    const rounded = Math.abs(value % 1) < 0.05 ? Math.round(value) : Math.round(value * 10) / 10;
    return `${rounded}${unit}`;
}

/**
 * How wide each bucket on a time chart is.
 *
 * Automatic is what every existing chart used before this was configurable, so
 * leaving it alone changes nothing.
 */
const TIME_GROUPINGS = [
    { value: 'auto', label: 'Automatic' },
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week (starting date)' },
    { value: 'week_number', label: 'Week number (W32)' },
    { value: 'month', label: 'Month' },
];

const SCOPES = [
    { value: 'all', label: 'All tasks' },
    { value: 'active', label: 'Active tasks only' },
    { value: 'done', label: 'Completed tasks only' },
];

/**
 * Which family a chart type belongs to.
 *
 * Time charts plot a date axis and take the time dimensions; circular ones
 * divide a single whole and so cannot be split or carry a target line. Every
 * conditional in the form and the renderer asks one of these rather than
 * listing type names again, which is how the old code drifted.
 */
const TIME_CHARTS = ['line', 'area'];
const CIRCULAR_CHARTS = ['donut', 'pie'];
const isTimeChart = (type) => TIME_CHARTS.includes(type);
/** A card, not a chart: one computed number and no axis. */
const isMetricChart = (type) => type === 'metric';
const isCircularChart = (type) => CIRCULAR_CHARTS.includes(type);

const CHART_TYPES = [
    {
        value: 'bar',
        label: 'Bar',
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M3 10h18M3 15h8M3 20h14" />
            </svg>
        ),
    },
    {
        value: 'donut',
        label: 'Donut',
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.05A9 9 0 1020.95 13H13a2 2 0 01-2-2V3.05z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 3.94A9.01 9.01 0 0120.06 9H15V3.94z" />
            </svg>
        ),
    },
    {
        value: 'line',
        label: 'Line',
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8" />
            </svg>
        ),
    },
    {
        value: 'column',
        label: 'Column',
        hint: 'Vertical bars — good for a handful of categories',
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 20V10M10 20V4M15 20v-7M20 20v-12" />
            </svg>
        ),
    },
    {
        value: 'area',
        label: 'Area',
        hint: 'A filled line — emphasises volume over time',
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8v11H3z" />
            </svg>
        ),
    },
    {
        value: 'metric',
        label: 'Card',
        hint: 'One computed number, no axis',
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path strokeLinecap="round" d="M7 10h5M7 14h8" />
            </svg>
        ),
    },
    {
        value: 'pie',
        label: 'Pie',
        hint: 'A donut with no hole',
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v9h9a9 9 0 11-9-9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 3.2A9.01 9.01 0 0120.8 10H14V3.2z" />
            </svg>
        ),
    },
];


/** Preset windows for a chart's date range. */
const DATE_RANGES = [
    { value: 'all', label: 'All time' },
    { value: 'last_7', label: 'Last 7 days' },
    { value: 'last_30', label: 'Last 30 days' },
    { value: 'last_90', label: 'Last 90 days' },
    { value: 'this_month', label: 'This month' },
    { value: 'this_quarter', label: 'This quarter' },
    { value: 'this_year', label: 'This year' },
    { value: 'custom', label: 'Between two dates' },
];

/** Which date the window is measured against on a category chart. */
const DATE_FIELDS = [
    { value: 'created', label: 'Created date' },
    { value: 'completed', label: 'Completed date' },
    { value: 'due', label: 'Due date' },
];

const HOW_TO_SORT = [
    { value: 'natural', label: 'Natural order' },
    { value: 'value_desc', label: 'Largest first' },
    { value: 'value_asc', label: 'Smallest first' },
    { value: 'label', label: 'By name' },
];

/**
 * The tasks a chart draws from: its scope, then its filters, then its date
 * window.
 *
 * One function so every path agrees — the plain category chart, the split one,
 * the time series, and a card. Each of those used to reach for scopeTasks on
 * its own, which is how a filter would end up applying to the bars but not to
 * the series inside them.
 *
 * Applying it twice is harmless, so nested callers need not know whether their
 * caller has already done it.
 */
function chartTasks(chart, allTasks, sections, customFields) {
    const filters = chart.config?.filters || [];

    let tasks = scopeTasks(allTasks, chart.config?.scope);

    if (filters.length > 0) {
        tasks = tasks.filter((task) => filters.every((f) => {
            const opts = { sections, customFields, fieldId: f.custom_field_id };

            return String(categorise(task, f.field, opts).key) === String(f.value);
        }));
    }

    return withinDateWindow(tasks, chart);
}

/** The date a chart's window is measured against. */
function windowDate(task, chart) {
    // A time chart already plots one particular date; windowing on a different
    // one would cut the axis somewhere it does not run.
    const field = {
        completed_over_time: 'completed',
        created_over_time: 'created',
        due_over_time: 'due',
    }[chart.group_by] || chart.config?.date_field || 'created';

    const raw = { created: task.created_at, completed: task.completed_at, due: task.due_date }[field];

    return raw ? new Date(raw) : null;
}

function withinDateWindow(tasks, chart) {
    const range = chart.config?.date_range || 'all';

    if (range === 'all') return tasks;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let from = null;
    let to = null;

    if (range === 'custom') {
        from = chart.config?.date_from ? new Date(chart.config.date_from + 'T00:00:00') : null;
        to = chart.config?.date_to ? new Date(chart.config.date_to + 'T23:59:59') : null;
    } else if (range.startsWith('last_')) {
        const days = Number(range.slice(5));
        from = new Date(startOfToday);
        from.setDate(from.getDate() - (days - 1));
    } else if (range === 'this_month') {
        from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (range === 'this_quarter') {
        from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    } else if (range === 'this_year') {
        from = new Date(now.getFullYear(), 0, 1);
    }

    return tasks.filter((task) => {
        const date = windowDate(task, chart);

        // A task with no date of that kind cannot be placed in the window, so
        // it is left out rather than silently counted as inside it.
        if (!date || Number.isNaN(date.getTime())) return false;
        if (from && date < from) return false;
        if (to && date > to) return false;

        return true;
    });
}

/** Order the bars, and fold everything past the cut into "Other". */
function arrangeBuckets(buckets, chart, fallbackMax) {
    const sort = chart.config?.sort || 'natural';

    const sorted = sort === 'value_desc' ? [...buckets].sort((a, b) => b.count - a.count)
        : sort === 'value_asc' ? [...buckets].sort((a, b) => a.count - b.count)
        : sort === 'label' ? [...buckets].sort((a, b) => a.label.localeCompare(b.label))
        : buckets;

    const max = Number(chart.config?.max_buckets) || fallbackMax;

    return foldBuckets(sorted, max);
}

function scopeTasks(tasks, scope) {
    if (scope === 'active') return tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
    if (scope === 'done') return tasks.filter((t) => t.status === 'done');
    return tasks;
}

// Buckets for bar/donut charts: [{ key, label, count, color }]
function computeCategoryData(chart, allTasks, sections, customFields) {
    const tasks = chartTasks(chart, allTasks, sections, customFields);
    const groupBy = chart.group_by;
    const measure = chart.config?.measure || 'count';
    const fieldId = chart.config?.measure_custom_field_id || null;

    // One helper so every branch below measures the same way.
    const roll = (subset) => aggregate(subset, measure, fieldId);

    if (groupBy === 'status') {
        return Object.keys(STATUS_HEX)
            .map((s) => ({
                key: s,
                label: formatLabel(s),
                count: roll(tasks.filter((t) => t.status === s)),
                color: STATUS_HEX[s],
            }))
            .filter((b) => b.count > 0);
    }

    if (groupBy === 'priority') {
        return Object.keys(PRIORITY_HEX)
            .map((p) => ({
                key: p,
                label: formatLabel(p),
                count: roll(tasks.filter((t) => t.priority === p)),
                color: PRIORITY_HEX[p],
            }))
            .filter((b) => b.count > 0);
    }

    if (groupBy === 'assignee') {
        const map = new Map();
        tasks.forEach((t) => {
            const key = t.assigned_to || 'unassigned';
            const label = t.assignee?.name || 'Unassigned';
            const entry = map.get(key) || { key: String(key), label, tasks: [] };
            entry.tasks.push(t);
            map.set(key, entry);
        });
        map.forEach((entry) => {
            entry.count = roll(entry.tasks);
            delete entry.tasks;
        });
        // Color follows the entity: slots assigned by stable alphabetical
        // order so a scope change never repaints an assignee
        const buckets = [...map.values()];
        [...buckets]
            .sort((a, b) => a.label.localeCompare(b.label))
            .forEach((b, i) => {
                b.color = b.key === 'unassigned'
                    ? 'var(--viz-other)'
                    : `var(${SERIES_VARS[i % SERIES_VARS.length]})`;
            });
        return buckets.sort((a, b) => b.count - a.count);
    }

    if (groupBy === 'section') {
        const buckets = [];
        const unsectioned = roll(tasks.filter((t) => !t.section_id));
        if (unsectioned > 0) {
            buckets.push({ key: 'none', label: 'No section', count: unsectioned, color: 'var(--viz-other)' });
        }
        sections.forEach((s, i) => {
            const count = roll(tasks.filter((t) => t.section_id === s.id));
            if (count > 0) {
                buckets.push({
                    key: String(s.id),
                    label: s.name,
                    count,
                    color: s.color || `var(${SERIES_VARS[i % SERIES_VARS.length]})`,
                });
            }
        });
        return buckets;
    }

    if (groupBy === 'custom_field') {
        const field = customFields.find((f) => f.id === chart.config?.custom_field_id);
        if (!field) return [];
        const buckets = [];
        (field.options || []).forEach((opt, i) => {
            const count = roll(tasks.filter((t) =>
                (t.custom_field_values || []).some(
                    (v) => v.custom_field_id === field.id && v.value_option_id === opt.id
                )
            ));
            if (count > 0) {
                buckets.push({
                    key: String(opt.id),
                    label: opt.label,
                    count,
                    color: opt.color || `var(${SERIES_VARS[i % SERIES_VARS.length]})`,
                });
            }
        });
        const noValue = roll(tasks.filter((t) =>
            !(t.custom_field_values || []).some(
                (v) => v.custom_field_id === field.id && v.value_option_id
            )
        ));
        if (noValue > 0) {
            buckets.push({ key: 'none', label: 'No value', count: noValue, color: 'var(--viz-other)' });
        }
        return buckets;
    }

    return [];
}

/**
 * Figures typed in by hand, shown beside the live data.
 *
 * Marked so the renderers can distinguish them — a budget or last quarter's
 * total sitting in the same chart as measured work should not be mistaken for
 * measured work.
 */
function manualBuckets(chart) {
    return (chart.config?.manual_points || [])
        .filter((p) => p && p.label)
        .map((p, i) => ({
            key: `manual-${i}`,
            label: p.label,
            count: Number(p.value) || 0,
            color: 'var(--viz-other)',
            manual: true,
        }));
}

/** Constant horizontal lines: a target, a threshold, a capacity. */
function referenceLines(chart) {
    return (chart.config?.reference_lines || [])
        .filter((r) => r && r.label)
        .map((r) => ({ label: r.label, value: Number(r.value) || 0 }));
}

/** Most series a stack can carry before the colours stop meaning anything. */
const MAX_SERIES = 8;

/**
 * Which slice of a category dimension a task belongs to.
 *
 * Shared by the X axis and the split, so "by assignee" means the same thing
 * whichever axis it is on — and a dimension added here works on both at once.
 */
function categorise(task, dimension, { sections, customFields, fieldId }) {
    if (dimension === 'status') {
        return { key: task.status, label: formatLabel(task.status), color: STATUS_HEX[task.status] };
    }

    if (dimension === 'priority') {
        return { key: task.priority, label: formatLabel(task.priority), color: PRIORITY_HEX[task.priority] };
    }

    if (dimension === 'assignee') {
        return task.assigned_to
            ? { key: String(task.assigned_to), label: task.assignee?.name || 'Unknown' }
            : { key: 'unassigned', label: 'Unassigned', color: 'var(--viz-other)' };
    }

    if (dimension === 'section') {
        const section = (sections || []).find((sec) => sec.id === task.section_id);
        return section
            ? { key: String(section.id), label: section.name, color: section.color || undefined }
            : { key: 'none', label: 'No section', color: 'var(--viz-other)' };
    }

    if (dimension === 'created_by') {
        return task.created_by
            ? { key: String(task.created_by), label: task.creator?.name || 'Unknown' }
            : { key: 'none', label: 'Unknown', color: 'var(--viz-other)' };
    }

    if (dimension === 'overdue') {
        // Same date-only rule as everywhere else: due today is not late yet.
        const late = task.due_date
            && !['done', 'cancelled'].includes(task.status)
            && isPastDue(task.due_date);

        return late
            ? { key: 'overdue', label: 'Overdue', color: '#ef4444' }
            : { key: 'on_track', label: 'On track', color: '#22c55e' };
    }

    if (dimension === 'has_due_date') {
        return task.due_date
            ? { key: 'yes', label: 'Has a due date', color: '#3b82f6' }
            : { key: 'no', label: 'No due date', color: 'var(--viz-other)' };
    }

    if (dimension === 'custom_field') {
        const field = (customFields || []).find((f) => f.id === fieldId);
        const value = (task.custom_field_values || []).find((v) => v.custom_field_id === fieldId);
        const option = field?.options?.find((o) => o.id === value?.value_option_id);

        return option
            ? { key: String(option.id), label: option.label, color: option.color || undefined }
            : { key: 'none', label: 'No value', color: 'var(--viz-other)' };
    }

    return { key: 'all', label: 'All', color: 'var(--viz-other)' };
}

/**
 * Buckets along the X axis, each split into series.
 *
 * Colour belongs to the series, not the bucket: a given assignee has to be the
 * same colour in every bar, or the legend is a lie.
 */
function computeStackedData(chart, allTasks, sections, customFields) {
    const measure = chart.config?.measure || 'count';
    const measureFieldId = chart.config?.measure_custom_field_id || null;
    const groupBy = chart.group_by;
    const stackBy = chart.config?.stack_by;

    const tasks = chartTasks(chart, allTasks, sections, customFields);

    const xOpts = { sections, customFields, fieldId: chart.config?.custom_field_id };
    const sOpts = { sections, customFields, fieldId: chart.config?.stack_custom_field_id };

    // bucketKey -> { label, series: Map(seriesKey -> tasks[]) }
    const buckets = new Map();
    const seriesMeta = new Map();

    tasks.forEach((task) => {
        const x = categorise(task, groupBy, xOpts);
        const sSlice = categorise(task, stackBy, sOpts);

        if (!buckets.has(x.key)) {
            buckets.set(x.key, { key: x.key, label: x.label, series: new Map() });
        }
        if (!seriesMeta.has(sSlice.key)) {
            seriesMeta.set(sSlice.key, { key: sSlice.key, label: sSlice.label, color: sSlice.color });
        }

        const bucket = buckets.get(x.key);
        if (!bucket.series.has(sSlice.key)) bucket.series.set(sSlice.key, []);
        bucket.series.get(sSlice.key).push(task);
    });

    // Rank series by their overall size, then keep the biggest and fold the
    // tail — eight colours is about as many as anyone can tell apart.
    const seriesTotals = new Map();
    buckets.forEach((b) => {
        b.series.forEach((group, key) => {
            seriesTotals.set(key, (seriesTotals.get(key) || 0) + aggregate(group, measure, measureFieldId));
        });
    });

    const ranked = [...seriesMeta.values()].sort(
        (a, b) => (seriesTotals.get(b.key) || 0) - (seriesTotals.get(a.key) || 0)
    );
    const kept = ranked.slice(0, MAX_SERIES);
    const folded = ranked.slice(MAX_SERIES);
    const foldedKeys = new Set(folded.map((s) => s.key));

    // Colours are handed out in a stable order so a scope change never
    // repaints the legend.
    const series = kept
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((s, i) => ({ ...s, color: s.color || `var(${SERIES_VARS[i % SERIES_VARS.length]})` }));

    if (folded.length > 0) {
        series.push({ key: '__other', label: `Other (${folded.length})`, color: 'var(--viz-other)' });
    }

    const rows = [...buckets.values()].map((b) => {
        const segments = series.map((s) => {
            const group = s.key === '__other'
                ? [...b.series.entries()].filter(([k]) => foldedKeys.has(k)).flatMap(([, g]) => g)
                : (b.series.get(s.key) || []);

            return { key: s.key, label: s.label, color: s.color, value: aggregate(group, measure, measureFieldId) };
        }).filter((seg) => seg.value !== 0);

        return {
            key: b.key,
            label: b.label,
            segments,
            count: segments.reduce((sum, seg) => sum + seg.value, 0),
        };
    });

    return { rows: arrangeStackedRows(rows, series, chart), series };
}

/**
 * Order and cap the bars of a split chart.
 *
 * Kept separate from arrangeBuckets because a split row is not just a number:
 * folding two rows into "Other" has to add up their segments series by series,
 * or the stack would be a total with nothing inside it.
 *
 * A chart saved before ordering existed has no sort, and split charts have
 * always come back largest-first — so that, not 'natural', is the fallback.
 */
function arrangeStackedRows(rows, series, chart, fallbackMax = 12) {
    const sort = chart.config?.sort || 'value_desc';

    const sorted = sort === 'value_asc' ? [...rows].sort((a, b) => a.count - b.count)
        : sort === 'label' ? [...rows].sort((a, b) => a.label.localeCompare(b.label))
        : sort === 'natural' ? rows
        : [...rows].sort((a, b) => b.count - a.count);

    const max = Number(chart.config?.max_buckets) || fallbackMax;

    if (sorted.length <= max) return sorted;

    const kept = sorted.slice(0, max);
    const tail = sorted.slice(max);

    // One row standing for the rest, with each series summed across it.
    const segments = series
        .map((s) => ({
            key: s.key,
            label: s.label,
            color: s.color,
            value: tail.reduce(
                (sum, row) => sum + (row.segments.find((seg) => seg.key === s.key)?.value || 0),
                0
            ),
        }))
        .filter((seg) => seg.value !== 0);

    kept.push({
        key: '__other',
        label: `Other (${tail.length})`,
        segments,
        count: tail.reduce((sum, row) => sum + row.count, 0),
    });

    return kept;
}

// Fold anything past maxBuckets - 1 into a single "Other" bucket
function foldBuckets(buckets, maxBuckets) {
    if (buckets.length <= maxBuckets) return buckets;
    const kept = buckets.slice(0, maxBuckets - 1);
    const rest = buckets.slice(maxBuckets - 1);
    kept.push({
        key: 'other',
        label: `Other (${rest.length})`,
        count: rest.reduce((sum, b) => sum + b.count, 0),
        color: 'var(--viz-other)',
    });
    return kept;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
    return d;
}

// Buckets for line charts: [{ label, count, date }], weekly, or monthly when
// the range would exceed ~20 weekly points
function computeTimeData(chart, allTasks, sections, customFields) {
    const measure = chart.config?.measure || 'count';
    const fieldId = chart.config?.measure_custom_field_id || null;

    const accessor = {
        completed_over_time: (t) => (t.status === 'done' ? t.completed_at : null),
        created_over_time: (t) => t.created_at,
        due_over_time: (t) => t.due_date,
    }[chart.group_by];
    if (!accessor) return [];

    // Carry the task alongside its date: a bucket has to be measured, and the
    // date alone cannot tell us how many hours it represents.
    const points = chartTasks(chart, allTasks, sections, customFields)
        .map((t) => ({ task: t, date: new Date(accessor(t)) }))
        .filter((p) => p.date instanceof Date && !isNaN(p.date));
    if (points.length === 0) return [];

    const dates = points.map((p) => p.date);

    const min = new Date(Math.min(...dates));
    const max = new Date(Math.max(...dates, Date.now()));

    const grouping = resolveTimeGrouping(chart.config?.time_grouping, min, max);

    const buckets = [];

    if (grouping === 'month') {
        const cursor = new Date(min.getFullYear(), min.getMonth(), 1);
        while (cursor <= max) {
            buckets.push({
                date: new Date(cursor),
                label: cursor.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
                tasks: [],
            });
            cursor.setMonth(cursor.getMonth() + 1);
        }
        points.forEach(({ task, date: d }) => {
            const i = (d.getFullYear() - min.getFullYear()) * 12 + (d.getMonth() - min.getMonth());
            if (buckets[i]) buckets[i].tasks.push(task);
        });
    } else if (grouping === 'day') {
        const start = startOfDay(min);
        const cursor = new Date(start);
        while (cursor <= max) {
            buckets.push({
                date: new Date(cursor),
                label: cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                tasks: [],
            });
            cursor.setDate(cursor.getDate() + 1);
        }
        points.forEach(({ task, date: d }) => {
            const i = Math.round((startOfDay(d) - start) / DAY_MS);
            if (buckets[i]) buckets[i].tasks.push(task);
        });
    } else {
        // Both week groupings share the same Monday-aligned buckets; only the
        // label differs, which is what keeps "week 32" and the bar starting
        // 3 Aug describing the same seven days.
        const start = startOfWeek(min);
        const cursor = new Date(start);
        while (cursor <= max) {
            buckets.push({
                date: new Date(cursor),
                label: cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                tasks: [],
            });
            cursor.setDate(cursor.getDate() + 7);
        }
        points.forEach(({ task, date: d }) => {
            const i = Math.floor((startOfWeek(d) - start) / (7 * DAY_MS));
            if (buckets[i]) buckets[i].tasks.push(task);
        });

        if (grouping === 'week_number') {
            labelByWeekNumber(buckets);
        }
    }

    buckets.forEach((b) => {
        b.count = aggregate(b.tasks || [], measure, fieldId);
        delete b.tasks;
    });

    return buckets;
}

function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Which bucket width to use.
 *
 * 'auto' keeps the original behaviour — weeks until there are too many to read,
 * then months. Anything else is the author's explicit choice and is honoured
 * even when it produces a crowded axis; they asked for it.
 */
function resolveTimeGrouping(setting, min, max) {
    if (['day', 'week', 'week_number', 'month'].includes(setting)) {
        return setting;
    }

    const weeks = Math.ceil((max - min) / (7 * DAY_MS)) + 1;

    return weeks > 20 ? 'month' : 'week';
}

/**
 * Relabel weekly buckets as ISO week numbers.
 *
 * Uses the same isoWeekParts as the Week of Year custom field, so a chart and a
 * task field never disagree about which week a date falls in — they differ at
 * year boundaries under any hand-rolled version.
 *
 * The year is only shown when the range crosses one, which is the only time
 * "W1" after "W52" would otherwise be ambiguous.
 */
function labelByWeekNumber(buckets) {
    const parts = buckets.map((b) => isoWeekParts(b.date.toISOString().slice(0, 10)));
    const years = new Set(parts.filter(Boolean).map((p) => p.year));
    const spansYears = years.size > 1;

    buckets.forEach((b, i) => {
        const part = parts[i];
        if (!part) return;

        b.label = spansYears ? `${part.year}-W${part.week}` : `W${part.week}`;
    });
}

/**
 * A line per series, over the same time buckets.
 *
 * Built on top of computeTimeData so the bucketing — weekly, or monthly once
 * the range gets long — stays in one place and both paths agree.
 */
function computeStackedTimeData(chart, allTasks, sections, customFields) {
    const stackBy = chart.config?.stack_by;
    const sOpts = { sections, customFields, fieldId: chart.config?.stack_custom_field_id };

    // The shape of the axis, measured across everything.
    const skeleton = computeTimeData(chart, allTasks, sections, customFields);
    if (skeleton.length === 0) return { rows: [], series: [] };

    const groups = new Map();
    const meta = new Map();

    chartTasks(chart, allTasks, sections, customFields).forEach((task) => {
        const slice = categorise(task, stackBy, sOpts);
        if (!meta.has(slice.key)) meta.set(slice.key, { key: slice.key, label: slice.label, color: slice.color });
        if (!groups.has(slice.key)) groups.set(slice.key, []);
        groups.get(slice.key).push(task);
    });

    const ranked = [...meta.values()].sort(
        (a, b) => (groups.get(b.key)?.length || 0) - (groups.get(a.key)?.length || 0)
    );
    const kept = ranked.slice(0, MAX_SERIES);
    const folded = ranked.slice(MAX_SERIES);

    const series = kept
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((sSeries, i) => ({
            ...sSeries,
            color: sSeries.color || `var(${SERIES_VARS[i % SERIES_VARS.length]})`,
        }));

    if (folded.length > 0) {
        series.push({ key: '__other', label: `Other (${folded.length})`, color: 'var(--viz-other)' });
    }

    // Each series is bucketed over the same axis, so the points line up.
    const valuesByKey = new Map();
    series.forEach((sSeries) => {
        const subset = sSeries.key === '__other'
            ? folded.flatMap((f) => groups.get(f.key) || [])
            : (groups.get(sSeries.key) || []);

        const bucketed = computeTimeData(chart, subset, sections, customFields);
        const byLabel = new Map(bucketed.map((b) => [b.label, b.count]));

        valuesByKey.set(sSeries.key, skeleton.map((b) => byLabel.get(b.label) || 0));
    });

    const rows = skeleton.map((b, i) => ({
        label: b.label,
        date: b.date,
        values: series.map((sSeries) => valuesByKey.get(sSeries.key)[i]),
        count: series.reduce((sum, sSeries) => sum + valuesByKey.get(sSeries.key)[i], 0),
    }));

    return { rows, series };
}

function niceMax(value) {
    if (value <= 5) return 5;
    const mag = Math.pow(10, Math.floor(Math.log10(value)));
    for (const m of [1, 2, 2.5, 5, 10]) {
        if (value <= m * mag) return m * mag;
    }
    return 10 * mag;
}

/* ------------------------------- Renderers ------------------------------- */

/** Shared legend for any split chart. */
function SeriesLegend({ series }) {
    return (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {series.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="truncate max-w-32" title={s.label}>{s.label}</span>
                </span>
            ))}
        </div>
    );
}

/**
 * One bar per bucket, divided into series.
 *
 * Segments are drawn in legend order, so a given series sits in the same place
 * in every bar. That consistency is what makes two bars comparable at a glance.
 */
function StackedBarChart({ rows, series, measure = 'count', references = [], xLabel, yLabel }) {
    const max = Math.max(...rows.map((r) => r.count), ...references.map((r) => r.value), 1);

    return (
        <div>
            {yLabel && (
                <p className="mb-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {yLabel}
                </p>
            )}

            <div className="space-y-2.5">
                {rows.map((row) => (
                    <div key={row.key} className="flex items-center gap-3">
                        <span
                            className="w-28 shrink-0 text-sm text-gray-600 dark:text-gray-300 truncate text-right"
                            title={row.label}
                        >
                            {row.label}
                        </span>
                        <div className="relative flex-1 h-4 bg-gray-100 dark:bg-gray-700/50 rounded-r overflow-hidden flex">
                            {row.segments.map((seg) => (
                                <div
                                    key={seg.key}
                                    className="h-4 transition-all duration-500"
                                    style={{ width: `${(seg.value / max) * 100}%`, backgroundColor: seg.color }}
                                    title={`${seg.label}: ${formatValue(seg.value, measure)}`}
                                />
                            ))}
                            {references.map((r, i) => (
                                <div
                                    key={i}
                                    className="absolute top-0 bottom-0 border-l-2 border-dashed border-gray-500/70"
                                    style={{ left: `${Math.min(100, (r.value / max) * 100)}%` }}
                                    title={`${r.label}: ${formatValue(r.value, measure)}`}
                                />
                            ))}
                        </div>
                        <span className="w-12 shrink-0 text-sm font-medium text-gray-900 dark:text-white tabular-nums text-right">
                            {formatValue(row.count, measure)}
                        </span>
                    </div>
                ))}
            </div>

            <SeriesLegend series={series} />

            {references.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-3">
                    {references.map((r, i) => (
                        <span key={i} className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                            <span className="inline-block w-4 border-t-2 border-dashed border-gray-500/70" />
                            {r.label} · {formatValue(r.value, measure)}
                        </span>
                    ))}
                </div>
            )}

            {xLabel && <p className="mt-2 text-center text-[11px] text-gray-500 dark:text-gray-400">{xLabel}</p>}
        </div>
    );
}

/** One line per series, over shared time buckets. */
function MultiLineChart({ rows, series, measure = 'count', references = [], xLabel, yLabel, filled = false }) {
    const W = 600, H = 230;
    const M = { top: 14, right: 16, bottom: 30, left: 36 };
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;

    const peak = Math.max(...rows.flatMap((r) => r.values), ...references.map((r) => r.value), 1);
    const yMax = niceMax(peak);

    const x = (i) => M.left + (rows.length === 1 ? plotW / 2 : (i / (rows.length - 1)) * plotW);
    const y = (v) => M.top + plotH - (v / yMax) * plotH;

    const yTicks = [0, yMax / 4, yMax / 2, (3 * yMax) / 4, yMax].map((v) => Math.round(v * 10) / 10);
    const xLabelEvery = Math.max(1, Math.ceil(rows.length / 6));

    return (
        <div>
            {yLabel && (
                <p className="mb-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {yLabel}
                </p>
            )}

            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
                {yTicks.map((t, i) => (
                    <g key={i}>
                        <line
                            x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)}
                            stroke="currentColor" strokeWidth="1" className="text-gray-200 dark:text-gray-700"
                        />
                        <text
                            x={M.left - 6} y={y(t) + 3} textAnchor="end" fontSize="9"
                            fill="currentColor" className="text-gray-400"
                        >
                            {t}
                        </text>
                    </g>
                ))}

                {references.map((r, i) => (
                    r.value <= yMax ? (
                        <line
                            key={`ref-${i}`}
                            x1={M.left} x2={W - M.right} y1={y(r.value)} y2={y(r.value)}
                            stroke="var(--viz-other)" strokeWidth="1.5" strokeDasharray="5 4"
                        />
                    ) : null
                ))}

                {/* Bands first so every line still reads on top of them. Left
                    translucent rather than stacked: these series are compared
                    against each other, not summed. */}
                {filled && series.map((s, si) => (
                    <path
                        key={`area-${s.key}`}
                        d={
                            rows.map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(r.values[si])}`).join(' ')
                            + ` L ${x(rows.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`
                        }
                        fill={s.color}
                        opacity={0.16}
                    />
                ))}

                {series.map((s, si) => (
                    <path
                        key={s.key}
                        d={rows.map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(r.values[si])}`).join(' ')}
                        fill="none" stroke={s.color} strokeWidth="2"
                        strokeLinejoin="round" strokeLinecap="round"
                    />
                ))}

                {rows.map((r, i) => (
                    i % xLabelEvery === 0 ? (
                        <text
                            key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9"
                            fill="currentColor" className="text-gray-400"
                        >
                            {r.label}
                        </text>
                    ) : null
                ))}
            </svg>

            <SeriesLegend series={series} />

            {xLabel && <p className="mt-1 text-center text-[11px] text-gray-500 dark:text-gray-400">{xLabel}</p>}
        </div>
    );
}

function BarChart({ buckets, legend = null, measure = 'count', references = [], xLabel, yLabel }) {
    // Reference lines are part of the scale: a target above every bar would sit
    // off the end of the chart and tell you nothing.
    const max = Math.max(...buckets.map((b) => b.count), ...references.map((r) => r.value), 1);

    return (
        <div>
            {yLabel && (
                <p className="mb-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {yLabel}
                </p>
            )}

            <div className="space-y-2.5">
                {buckets.map((b) => (
                    <div key={b.key} className="flex items-center gap-3">
                        <span
                            className={`w-28 shrink-0 text-sm truncate text-right ${
                                b.manual ? 'text-gray-400 italic' : 'text-gray-600 dark:text-gray-300'
                            }`}
                            title={b.manual ? `${b.label} (entered by hand)` : b.label}
                        >
                            {b.label}
                        </span>
                        <div className="relative flex-1 h-4 bg-gray-100 dark:bg-gray-700/50 rounded-r overflow-hidden">
                            <div
                                className={`h-4 rounded-r transition-all duration-500 ${b.manual ? 'opacity-60' : ''}`}
                                style={{
                                    width: `${Math.max(0, (b.count / max) * 100)}%`,
                                    backgroundColor: b.color,
                                    // Hatched, so a hand-entered figure never reads
                                    // as something the system measured.
                                    backgroundImage: b.manual
                                        ? 'repeating-linear-gradient(45deg, rgba(255,255,255,.45) 0 4px, transparent 4px 8px)'
                                        : undefined,
                                }}
                            />
                            {references.map((r, i) => (
                                <div
                                    key={i}
                                    className="absolute top-0 bottom-0 border-l-2 border-dashed border-gray-500/70"
                                    style={{ left: `${Math.min(100, (r.value / max) * 100)}%` }}
                                    title={`${r.label}: ${formatValue(r.value, measure)}`}
                                />
                            ))}
                        </div>
                        <span className="w-12 shrink-0 text-sm font-medium text-gray-900 dark:text-white tabular-nums text-right">
                            {formatValue(b.count, measure)}
                        </span>
                    </div>
                ))}
            </div>

            {legend && <SeriesLegend series={legend} />}

            {references.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-3">
                    {references.map((r, i) => (
                        <span key={i} className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                            <span className="inline-block w-4 border-t-2 border-dashed border-gray-500/70" />
                            {r.label} · {formatValue(r.value, measure)}
                        </span>
                    ))}
                </div>
            )}

            {xLabel && (
                <p className="mt-2 text-center text-[11px] text-gray-500 dark:text-gray-400">{xLabel}</p>
            )}
        </div>
    );
}

/**
 * Vertical bars.
 *
 * The existing "bar" chart runs horizontally, which suits long labels like
 * assignee names; this is the other orientation, which reads better for a few
 * short categories and is what most people picture when they say bar chart.
 *
 * Takes the same rows as either the plain or the split renderer: when a row
 * carries segments they stack up the column, otherwise it is drawn solid.
 */
/**
 * Round tick values up a chart's Y axis, including zero for the baseline.
 *
 * Five gridlines is enough to read a value off without the chart becoming
 * graph paper.
 */
function axisTicks(top, count = 4) {
    if (!(top > 0)) return [0];

    // Prefer a divisor that lands on whole numbers. Counting tasks and reading
    // "2.5" off the axis invites the question of what half a task is.
    if (Number.isInteger(top)) {
        const divisor = [4, 5, 3, 2].find((d) => top % d === 0);

        if (divisor) {
            return Array.from({ length: divisor + 1 }, (_, i) => (top / divisor) * i);
        }
    }

    return Array.from({ length: count + 1 }, (_, i) => (top / count) * i);
}

function ColumnChart({ rows, series = null, legend = null, measure = 'count', references = [], xLabel, yLabel }) {
    const max = Math.max(...rows.map((r) => r.count), ...references.map((r) => r.value), 1);
    const top = niceMax(max);

    return (
        <div>
            {yLabel && (
                <p className="mb-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {yLabel}
                </p>
            )}

            <div className="relative">
                {/* Targets sit behind the columns and share their scale. */}
                {references.map((r, i) => (
                    <div
                        key={i}
                        className="absolute left-9 right-0 border-t-2 border-dashed border-gray-500/70 pointer-events-none"
                        style={{ bottom: `${Math.min(100, (r.value / top) * 100)}%`, marginBottom: '1.75rem' }}
                        title={`${r.label}: ${formatValue(r.value, measure)}`}
                    />
                ))}

                {/* The scale, drawn behind everything: without it a column
                    chart shows relative heights but no readable quantity. */}
                {axisTicks(top).map((tick) => (
                    <div
                        key={`tick-${tick}`}
                        className="absolute left-0 right-0 pointer-events-none"
                        style={{ bottom: `${(tick / top) * 100}%`, marginBottom: '1.75rem' }}
                    >
                        <span className="absolute left-0 -translate-y-1/2 text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
                            {formatValue(tick, measure)}
                        </span>
                        <div className="ml-9 border-t border-gray-100 dark:border-gray-700/60" />
                    </div>
                ))}

                <div className="flex items-end gap-2 h-52 overflow-x-auto pb-0.5 pl-9">
                    {rows.map((row) => (
                        // Positioned rather than stacked in flow: a value label
                        // taking part of the column's height would leave the
                        // bars a few pixels short of the gridline they meet.
                        <div key={row.key} className="relative flex-1 min-w-[2.5rem] h-full">
                            <span
                                className="absolute left-1/2 -translate-x-1/2 text-[11px] font-medium text-gray-900 dark:text-white tabular-nums whitespace-nowrap"
                                style={{ bottom: `calc(${Math.max(1, (row.count / top) * 100)}% + 3px)` }}
                            >
                                {formatValue(row.count, measure)}
                            </span>

                            <div
                                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[3.5rem] rounded-t overflow-hidden flex flex-col-reverse transition-all duration-500"
                                style={{ height: `${Math.max(1, (row.count / top) * 100)}%` }}
                                title={`${row.label}: ${formatValue(row.count, measure)}`}
                            >
                                {row.segments ? (
                                    row.segments.map((seg) => (
                                        <div
                                            key={seg.key}
                                            style={{
                                                height: `${row.count > 0 ? (seg.value / row.count) * 100 : 0}%`,
                                                backgroundColor: seg.color,
                                            }}
                                            title={`${seg.label}: ${formatValue(seg.value, measure)}`}
                                        />
                                    ))
                                ) : (
                                    <div
                                        className={`h-full ${row.manual ? 'opacity-60' : ''}`}
                                        style={{
                                            backgroundColor: row.color,
                                            backgroundImage: row.manual
                                                ? 'repeating-linear-gradient(45deg, rgba(255,255,255,.45) 0 4px, transparent 4px 8px)'
                                                : undefined,
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex gap-2 mt-1.5 ml-9 border-t border-gray-200 dark:border-gray-700 pt-1.5">
                    {rows.map((row) => (
                        <span
                            key={row.key}
                            className={`flex-1 min-w-[2.5rem] text-center text-[11px] truncate ${
                                row.manual ? 'text-gray-400 italic' : 'text-gray-500 dark:text-gray-400'
                            }`}
                            title={row.label}
                        >
                            {row.label}
                        </span>
                    ))}
                </div>
            </div>

            {(series || legend) && <SeriesLegend series={series || legend} />}

            {references.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-3">
                    {references.map((r, i) => (
                        <span key={i} className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                            <span className="inline-block w-4 border-t-2 border-dashed border-gray-500/70" />
                            {r.label} · {formatValue(r.value, measure)}
                        </span>
                    ))}
                </div>
            )}

            {xLabel && <p className="mt-2 text-center text-[11px] text-gray-500 dark:text-gray-400">{xLabel}</p>}
        </div>
    );
}

/**
 * "Urgent · Ana" — a card's filters in words, shown under the number.
 *
 * Without it a card reading 7 gives no clue which 7, and two cards can look
 * identical on the same dashboard while counting different things. The label
 * comes from categorise() rather than the stored key, so a filter reads as the
 * name the board shows rather than an id.
 */
function describeFilters(chart, allTasks, sections, customFields) {
    const filters = chart.config?.filters || [];

    if (filters.length === 0) return null;

    return filters.map((f) => {
        const opts = { sections, customFields, fieldId: f.custom_field_id };
        const match = allTasks.find(
            (t) => String(categorise(t, f.field, opts).key) === String(f.value)
        );

        return match ? categorise(match, f.field, opts).label : String(f.value);
    }).join(' · ');
}

/**
 * The tasks a card counts: the scope, narrowed by its filters.
 *
 * Filters compare against the same categorise() the charts group by, so
 * "assignee is Ana" means precisely what an assignee-grouped bar means. Writing
 * a second matcher here is how the two would drift.
 */
function metricTasks(chart, allTasks, sections, customFields) {
    return chartTasks(chart, allTasks, sections, customFields);
}

/** What a card computes, and what it is measured against. */
function computeMetric(chart, allTasks, sections, customFields) {
    const measure = chart.config?.measure || 'count';
    const fieldId = chart.config?.measure_custom_field_id || null;

    const matched = metricTasks(chart, allTasks, sections, customFields);
    const value = aggregate(matched, measure, fieldId);

    const compare = chart.config?.compare || 'none';

    if (compare === 'percent') {
        // Against the same measure over the unfiltered scope, so the figure
        // answers "how much of the work this card is about".
        const whole = aggregate(scopeTasks(allTasks, chart.config?.scope), measure, fieldId);

        return {
            value,
            measure,
            matched: matched.length,
            percent: whole > 0 ? (value / whole) * 100 : null,
            whole,
        };
    }

    if (compare === 'target') {
        const target = Number(chart.config?.target) || 0;

        return {
            value,
            measure,
            matched: matched.length,
            target,
            progress: target > 0 ? Math.min(100, (value / target) * 100) : null,
        };
    }

    return { value, measure, matched: matched.length };
}

/** A single computed number, with whatever it is measured against. */
function MetricCard({ result, filterSummary }) {
    const { value, measure, percent, whole, target, progress } = result;

    return (
        <div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
                {formatValue(value, measure)}
            </p>

            {filterSummary && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate" title={filterSummary}>
                    {filterSummary}
                </p>
            )}

            {percent != null && (
                <div className="mt-3">
                    <div className="flex items-baseline justify-between text-xs text-gray-500 dark:text-gray-400">
                        <span>{Math.round(percent)}% of {formatValue(whole, measure)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <div
                            className="h-full rounded-full bg-primary-500 transition-all duration-500"
                            style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
                        />
                    </div>
                </div>
            )}

            {target != null && (
                <div className="mt-3">
                    <div className="flex items-baseline justify-between text-xs">
                        <span className="text-gray-500 dark:text-gray-400">
                            Target {formatValue(target, measure)}
                        </span>
                        <span className={value >= target
                            ? 'text-green-600 dark:text-green-400 font-medium'
                            : 'text-amber-600 dark:text-amber-400 font-medium'}>
                            {value >= target ? 'met' : `${formatValue(target - value, measure)} to go`}
                        </span>
                    </div>
                    {progress != null && (
                        <div className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                    value >= target ? 'bg-green-500' : 'bg-primary-500'
                                }`}
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function donutArcPath(cx, cy, rOuter, rInner, startAngle, endAngle) {
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x1, y1] = p(rOuter, startAngle);
    const [x2, y2] = p(rOuter, endAngle);
    const [x3, y3] = p(rInner, endAngle);
    const [x4, y4] = p(rInner, startAngle);
    return [
        `M ${x1} ${y1}`,
        `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2}`,
        `L ${x3} ${y3}`,
        `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4}`,
        'Z',
    ].join(' ');
}

/**
 * @param hollow  false draws a pie — the same geometry with no hole. The total
 *                then moves out of the centre and sits above the legend, since
 *                a pie has nowhere to put it.
 */
function DonutChart({ buckets, measure = 'count', hollow = true }) {
    const [hovered, setHovered] = useState(null);
    const total = buckets.reduce((sum, b) => sum + b.count, 0);

    const cx = 90, cy = 90, rOuter = 80, rInner = hollow ? 52 : 0;
    const padAngle = buckets.length > 1 ? 0.035 : 0; // ~2px surface gap at mid-radius
    let angle = -Math.PI / 2;
    const slices = buckets.map((b) => {
        const sweep = (b.count / total) * Math.PI * 2;
        const slice = { ...b, start: angle + padAngle / 2, end: angle + sweep - padAngle / 2 };
        angle += sweep;
        return slice;
    });

    return (
        <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="relative shrink-0">
                <svg viewBox="0 0 180 180" className="w-40 h-40" role="img">
                    {buckets.length === 1 ? (
                        hollow ? (
                            <circle
                                cx={cx} cy={cy} r={(rOuter + rInner) / 2}
                                fill="none" stroke={buckets[0].color} strokeWidth={rOuter - rInner}
                            />
                        ) : (
                            <circle cx={cx} cy={cy} r={rOuter} fill={buckets[0].color} />
                        )
                    ) : (
                        slices.map((s) => (
                            <path
                                key={s.key}
                                d={donutArcPath(cx, cy, rOuter, rInner, s.start, Math.max(s.end, s.start + 0.005))}
                                fill={s.color}
                                opacity={hovered === null || hovered === s.key ? 1 : 0.35}
                                onMouseEnter={() => setHovered(s.key)}
                                onMouseLeave={() => setHovered(null)}
                            >
                                <title>{`${s.label}: ${formatValue(s.count, measure)} (${Math.round((s.count / total) * 100)}%)`}</title>
                            </path>
                        ))
                    )}
                </svg>
                {hollow && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-2xl font-bold text-gray-900 dark:text-white">{total}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">tasks</span>
                    </div>
                )}
            </div>
            {/* Legend doubles as the readable value channel for every slice */}
            <div className="min-w-0 flex-1 space-y-1.5 self-center w-full">
                {!hollow && (
                    <div className="flex items-baseline gap-1.5 pb-1 mb-1 border-b border-gray-100 dark:border-gray-700">
                        <span className="text-lg font-bold text-gray-900 dark:text-white">{total}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">total</span>
                    </div>
                )}
                {buckets.map((b) => (
                    <div
                        key={b.key}
                        className={`flex items-center justify-between gap-2 rounded px-1 transition-opacity ${hovered !== null && hovered !== b.key ? 'opacity-40' : ''}`}
                        onMouseEnter={() => setHovered(b.key)}
                        onMouseLeave={() => setHovered(null)}
                    >
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                            <span className="text-sm text-gray-600 dark:text-gray-300 truncate" title={b.label}>{b.label}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-medium text-gray-900 dark:text-white tabular-nums">{formatValue(b.count, measure)}</span>
                            <span className="text-xs text-gray-400 w-9 text-right tabular-nums">
                                {Math.round((b.count / total) * 100)}%
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** @param filled  draws the area chart � the same line with the fill turned up. */
function LineChart({ buckets, measure = 'count', references = [], xLabel, yLabel, filled = false }) {
    const [hovered, setHovered] = useState(null);
    const svgRef = useRef(null);

    const W = 600, H = 230;
    const M = { top: 14, right: 16, bottom: 30, left: 36 };
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;

    // A target above the data still has to fit on the axis.
    const yMax = niceMax(Math.max(...buckets.map((b) => b.count), ...references.map((r) => r.value), 1));
    const x = (i) => M.left + (buckets.length === 1 ? plotW / 2 : (i / (buckets.length - 1)) * plotW);
    const y = (v) => M.top + plotH - (v / yMax) * plotH;

    const linePath = buckets.map((b, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(b.count)}`).join(' ');
    const areaPath = `${linePath} L ${x(buckets.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`;

    const yTicks = [0, yMax / 4, yMax / 2, (3 * yMax) / 4, yMax].map((v) => Math.round(v * 10) / 10);
    const xLabelEvery = Math.max(1, Math.ceil(buckets.length / 6));
    const showMarkers = buckets.length <= 30;

    const handleMove = useCallback((e) => {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * W;
        const i = buckets.length === 1
            ? 0
            : Math.round(((px - M.left) / plotW) * (buckets.length - 1));
        setHovered(Math.max(0, Math.min(buckets.length - 1, i)));
    }, [buckets.length, plotW, M.left]);

    return (
        <div className="relative">
            {yLabel && (
                <p className="mb-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {yLabel}
                </p>
            )}
            <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                className="w-full h-auto"
                role="img"
                onMouseMove={handleMove}
                onMouseLeave={() => setHovered(null)}
            >
                {/* Hairline gridlines + y ticks */}
                {[...new Set(yTicks)].map((v) => (
                    <g key={v}>
                        <line
                            x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)}
                            stroke={v === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'} strokeWidth="1"
                        />
                        <text
                            x={M.left - 8} y={y(v) + 3.5} textAnchor="end"
                            fontSize="11" fill="var(--viz-ink-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                            {v}
                        </text>
                    </g>
                ))}

                {/* x labels (sparse) */}
                {buckets.map((b, i) =>
                    i % xLabelEvery === 0 ? (
                        <text
                            key={i} x={x(i)} y={H - 8} textAnchor="middle"
                            fontSize="11" fill="var(--viz-ink-muted)"
                        >
                            {b.label}
                        </text>
                    ) : null
                )}

                <path d={areaPath} fill="var(--viz-s1)" opacity={filled ? 0.3 : 0.1} />
                {/* Targets sit behind the data, so the measured line reads first. */}
                {references.map((r, i) => (
                    r.value <= yMax ? (
                        <g key={`ref-${i}`}>
                            <line
                                x1={M.left} x2={W - M.right} y1={y(r.value)} y2={y(r.value)}
                                stroke="var(--viz-other)" strokeWidth="1.5" strokeDasharray="5 4"
                            />
                            <text
                                x={W - M.right} y={y(r.value) - 4}
                                textAnchor="end" fontSize="9" fill="currentColor"
                                className="text-gray-500 dark:text-gray-400"
                            >
                                {r.label}
                            </text>
                        </g>
                    ) : null
                ))}

                <path d={linePath} fill="none" stroke="var(--viz-s1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

                {/* Hover crosshair */}
                {hovered !== null && (
                    <line
                        x1={x(hovered)} x2={x(hovered)} y1={M.top} y2={M.top + plotH}
                        stroke="var(--viz-axis)" strokeWidth="1"
                    />
                )}

                {/* Markers with a surface ring so they stay legible on the line */}
                {buckets.map((b, i) => {
                    const visible = showMarkers || hovered === i || i === buckets.length - 1;
                    if (!visible) return null;
                    return (
                        <circle
                            key={i} cx={x(i)} cy={y(b.count)} r={hovered === i ? 5 : 4}
                            fill="var(--viz-s1)" stroke="var(--viz-surface)" strokeWidth="2"
                        />
                    );
                })}

                {/* Direct label on the latest point only */}
                <text
                    x={Math.min(x(buckets.length - 1), W - M.right)}
                    y={y(buckets[buckets.length - 1].count) - 10}
                    textAnchor="end" fontSize="11" fontWeight="600" fill="var(--viz-ink)"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                    {formatValue(buckets[buckets.length - 1].count, measure)}
                </text>
            </svg>

            {hovered !== null && (
                <div
                    className="absolute -top-1 pointer-events-none bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap"
                    style={{
                        left: `${(x(hovered) / W) * 100}%`,
                        transform: `translateX(${hovered > buckets.length / 2 ? '-100%' : '0'})`,
                    }}
                >
                    <span className="font-medium">{formatValue(buckets[hovered].count, measure)}</span> · {buckets[hovered].label}
                </div>
            )}

            {xLabel && (
                <p className="mt-1 text-center text-[11px] text-gray-500 dark:text-gray-400">{xLabel}</p>
            )}
        </div>
    );
}

/* ----------------------------- Chart card ----------------------------- */

function chartSubtitle(chart, customFields) {
    const dim = [...CATEGORY_DIMENSIONS, ...TIME_DIMENSIONS].find((d) => d.value === chart.group_by);
    let label = dim ? dim.label : formatLabel(chart.group_by);
    if (chart.group_by === 'custom_field') {
        const field = customFields.find((f) => f.id === chart.config?.custom_field_id);
        label = field ? field.name : 'Custom field';
    }
    const scope = chart.config?.scope;
    const scopeLabel = scope && scope !== 'all'
        ? ` · ${SCOPES.find((s) => s.value === scope)?.label}`
        : '';
    return chart.chart_type === 'line' ? label : `By ${label.toLowerCase()}${scopeLabel}`;
}

function ChartCard({ chart, allTasks, sections, customFields, canManage, onEdit, onDelete }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        if (!menuOpen) return;
        const close = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [menuOpen]);

    const measure = chart.config?.measure || 'count';
    const references = useMemo(() => referenceLines(chart), [chart]);

    const type = chart.chart_type;
    const overTime = isTimeChart(type);
    const circular = isCircularChart(type);
    const metric = isMetricChart(type);

    // A donut or pie is already a breakdown of one whole, so it never splits.
    const stackBy = circular ? null : chart.config?.stack_by;

    const split = useMemo(() => {
        if (!stackBy) return null;

        return overTime
            ? computeStackedTimeData(chart, allTasks, sections, customFields)
            : computeStackedData(chart, allTasks, sections, customFields);
    }, [stackBy, overTime, chart, allTasks, sections, customFields]);

    const data = useMemo(() => {
        if (stackBy) return [];
        if (overTime) return computeTimeData(chart, allTasks, sections, customFields);

        const buckets = computeCategoryData(chart, allTasks, sections, customFields);
        // A circle can only carry so many slices before the labels collide;
        // a column chart runs out of horizontal room sooner than a bar. Those
        // are the defaults the chart can override.
        const folded = arrangeBuckets(buckets, chart, circular ? 8 : type === 'column' ? 10 : 12);

        // Hand-entered figures are appended after folding, so an "Other" bucket
        // can never swallow one — they were typed in precisely to be seen.
        return [...folded, ...manualBuckets(chart)];
    }, [stackBy, chart, allTasks, sections, customFields]);

    // A single-series chart already names each bar on its axis, so a legend
    // is only drawn when asked for — it repeats the labels otherwise.
    const categoryLegend = (!stackBy && chart.config?.show_legend && !overTime && !metric)
        ? data.filter((d) => !d.manual).map((d) => ({ key: d.key, label: d.label, color: d.color }))
        : null;

    const isEmpty = metric ? false : stackBy
        ? !split || split.rows.length === 0 || split.rows.every((r) => r.count === 0)
        : data.length === 0 || (chart.chart_type !== 'line' && data.every((b) => b.count === 0));

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-start justify-between mb-4 gap-2">
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate" title={chart.title}>
                        {chart.title}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {chartSubtitle(chart, customFields)}
                    </p>
                </div>
                {canManage && (
                    <div className="relative shrink-0" ref={menuRef}>
                        <button
                            onClick={() => setMenuOpen((v) => !v)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            aria-label="Chart options"
                        >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                        </button>
                        {menuOpen && (
                            <div className="absolute right-0 mt-1 z-20 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 py-1 min-w-[130px]">
                                <button
                                    onClick={() => { setMenuOpen(false); onEdit(chart); }}
                                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                    Edit chart
                                </button>
                                <button
                                    onClick={() => { setMenuOpen(false); onDelete(chart); }}
                                    className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                    Delete chart
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {isEmpty ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">No matching tasks yet</p>
            ) : stackBy ? (
                overTime ? (
                    <MultiLineChart
                        rows={split.rows} series={split.series} measure={measure} references={references}
                        xLabel={chart.config?.x_label} yLabel={chart.config?.y_label}
                        filled={type === 'area'}
                    />
                ) : type === 'column' ? (
                    <ColumnChart
                        rows={split.rows} series={split.series} measure={measure} references={references}
                        xLabel={chart.config?.x_label} yLabel={chart.config?.y_label}
                    />
                ) : (
                    <StackedBarChart
                        rows={split.rows} series={split.series} measure={measure} references={references}
                        xLabel={chart.config?.x_label} yLabel={chart.config?.y_label}
                    />
                )
            ) : metric ? (
                <MetricCard
                    result={computeMetric(chart, allTasks, sections, customFields)}
                    filterSummary={describeFilters(chart, allTasks, sections, customFields)}
                />
            ) : type === 'bar' ? (
                <BarChart
                    buckets={data} legend={categoryLegend} measure={measure} references={references}
                    xLabel={chart.config?.x_label} yLabel={chart.config?.y_label}
                />
            ) : type === 'column' ? (
                <ColumnChart
                    rows={data} legend={categoryLegend} measure={measure} references={references}
                    xLabel={chart.config?.x_label} yLabel={chart.config?.y_label}
                />
            ) : circular ? (
                <DonutChart buckets={data} measure={measure} hollow={type === 'donut'} />
            ) : (
                <LineChart
                    buckets={data} measure={measure} references={references}
                    xLabel={chart.config?.x_label} yLabel={chart.config?.y_label}
                    filled={type === 'area'}
                />
            )}
        </div>
    );
}

/* ----------------------------- Add/edit modal ----------------------------- */

function ChartFormModal({ isOpen, onClose, onSave, chart, customFields, allTasks = [], sections = [], newType = 'bar', saving, error }) {
    const selectFields = customFields.filter((f) => f.type === 'single_select');

    const numberFields = numericFields(customFields);

    const [form, setForm] = useState({ title: '', chart_type: 'bar', group_by: 'status', custom_field_id: '', scope: 'all', measure: 'count', measure_custom_field_id: '', x_label: '', y_label: '', manual_points: [], reference_lines: [], stack_by: '', stack_custom_field_id: '', time_grouping: 'auto', filters: [], compare: 'none', target: '', show_legend: false, date_range: 'all', date_field: 'created', date_from: '', date_to: '', sort: 'natural', max_buckets: '' });

    useEffect(() => {
        if (!isOpen) return;
        // Always opens on Setup, whichever tab was left showing last time.
        setTab('setup');
        setForm(chart ? {
            title: chart.title,
            chart_type: chart.chart_type,
            group_by: chart.group_by,
            custom_field_id: chart.config?.custom_field_id || '',
            scope: chart.config?.scope || 'all',
            measure: chart.config?.measure || 'count',
            measure_custom_field_id: chart.config?.measure_custom_field_id || '',
            x_label: chart.config?.x_label || '',
            y_label: chart.config?.y_label || '',
            manual_points: chart.config?.manual_points || [],
            reference_lines: chart.config?.reference_lines || [],
            stack_by: chart.config?.stack_by || '',
            stack_custom_field_id: chart.config?.stack_custom_field_id || '',
            time_grouping: chart.config?.time_grouping || 'auto',
            show_legend: !!chart.config?.show_legend,
            date_range: chart.config?.date_range || 'all',
            date_field: chart.config?.date_field || 'created',
            date_from: chart.config?.date_from || '',
            date_to: chart.config?.date_to || '',
            sort: chart.config?.sort || 'natural',
            max_buckets: chart.config?.max_buckets ?? '',
            filters: chart.config?.filters || [],
            compare: chart.config?.compare || 'none',
            target: chart.config?.target ?? '',
        } : { title: '', chart_type: newType, group_by: isMetricChart(newType) ? 'none' : 'status', custom_field_id: '', scope: 'all', measure: 'count', measure_custom_field_id: '', x_label: '', y_label: '', manual_points: [], reference_lines: [], stack_by: '', stack_custom_field_id: '', time_grouping: 'auto', filters: [], compare: 'none', target: '', show_legend: false, date_range: 'all', date_field: 'created', date_from: '', date_to: '', sort: 'natural', max_buckets: '' });
    }, [isOpen, chart, newType]);

    const [tab, setTab] = useState('setup');

    const isLine = isTimeChart(form.chart_type);
    const circular = isCircularChart(form.chart_type);
    const metric = isMetricChart(form.chart_type);
    const dimensions = isLine ? TIME_DIMENSIONS : CATEGORY_DIMENSIONS;

    const setType = (type) => {
        setForm((f) => {
            const next = { ...f, chart_type: type };
            if (isMetricChart(type)) {
                // Stored as 'none' rather than left stale: the server
                // rejects any real dimension on a card.
                next.group_by = 'none';
            } else {
                const allowed = (isTimeChart(type) ? TIME_DIMENSIONS : CATEGORY_DIMENSIONS).map((d) => d.value);
                if (!allowed.includes(next.group_by) || next.group_by === 'none') next.group_by = allowed[0];
            }

            // A donut cannot be split, and a dimension cannot split itself —
            // leaving a stale value here would be rejected on save.
            if (isCircularChart(type) || next.stack_by === next.group_by) {
                next.stack_by = '';
                next.stack_custom_field_id = '';
            }

            return next;
        });
    };

    const needsNumberField = measureSpec(form.measure).needsField;

    // A donut is already a breakdown of one whole, so there is nothing left to
    // split; and a dimension cannot be split by itself.
    const canSplit = !circular;
    const splitOptions = CATEGORY_DIMENSIONS.filter((d) => d.value !== form.group_by);
    const needsSplitField = form.stack_by === 'custom_field';

    const canSave = form.title.trim().length > 0
        && (form.group_by !== 'custom_field' || form.custom_field_id)
        && (!needsNumberField || form.measure_custom_field_id)
        && (!canSplit || !needsSplitField || form.stack_custom_field_id);

    // Rows the user is part-way through typing are dropped rather than saved
    // as a blank label with a number nobody can read.
    const cleanPairs = (rows) => rows
        .map((r) => ({ label: String(r.label || '').trim(), value: Number(r.value) || 0 }))
        .filter((r) => r.label !== '');

    const setPairs = (key, rows) => setForm((f) => ({ ...f, [key]: rows }));

    const setFilter = (index, patch) => setForm((f) => ({
        ...f,
        filters: f.filters.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));

    /**
     * The values a filter can take, read off the tasks that exist.
     *
     * Derived through categorise() rather than from a fixed list, so a card can
     * filter on exactly what a chart can group by — including custom field
     * options — and can never offer a value no task has.
     */
    const filterValues = (row) => {
        const opts = { sections, customFields, fieldId: row.custom_field_id };
        const seen = new Map();

        allTasks.forEach((task) => {
            const slice = categorise(task, row.field, opts);
            if (!seen.has(String(slice.key))) {
                seen.set(String(slice.key), { key: String(slice.key), label: slice.label });
            }
        });

        return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
    };

    // How much is set on the second tab, so its badge can say so. Counted from
    // what is actually in force — a split that the current chart type forbids
    // is not advertised as configured.
    const advancedCount = [
        form.measure !== 'count',
        canSplit && !!form.stack_by,
        !!form.x_label.trim() || !!form.y_label.trim(),
        !circular && cleanPairs(form.reference_lines).length > 0,
        !isLine && cleanPairs(form.manual_points).length > 0,
    ].filter(Boolean).length;

    const pairEditor = (key, heading, hint, addLabel) => (
        <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{heading}</label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{hint}</p>

            {form[key].map((row, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                    <input
                        type="text" value={row.label} maxLength={40}
                        placeholder="Label"
                        onChange={(e) => setPairs(key, form[key].map((r, j) => j === i ? { ...r, label: e.target.value } : r))}
                        className="flex-1 min-w-0 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1.5 text-sm"
                    />
                    <input
                        type="number" value={row.value} step="any"
                        placeholder="0"
                        onChange={(e) => setPairs(key, form[key].map((r, j) => j === i ? { ...r, value: e.target.value } : r))}
                        className="w-28 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1.5 text-sm"
                    />
                    <button
                        type="button"
                        onClick={() => setPairs(key, form[key].filter((_, j) => j !== i))}
                        className="text-gray-400 hover:text-red-500 shrink-0"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            ))}

            <button
                type="button"
                onClick={() => setPairs(key, [...form[key], { label: '', value: 0 }])}
                className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
                + {addLabel}
            </button>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={chart ? 'Edit Chart' : 'Add Chart'}
            actions={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button
                        onClick={() => onSave({
                            title: form.title.trim(),
                            chart_type: form.chart_type,
                            group_by: metric ? 'none' : form.group_by,
                            // Filters now apply to every type, not just cards.
                            filters: form.filters,
                            date_range: form.date_range,
                            date_field: form.date_field,
                            date_from: form.date_range === 'custom' ? (form.date_from || null) : null,
                            date_to: form.date_range === 'custom' ? (form.date_to || null) : null,
                            sort: (metric || isLine) ? null : form.sort,
                            max_buckets: (metric || isLine) ? null : (Number(form.max_buckets) || null),
                            compare: metric ? form.compare : null,
                            target: metric && form.compare === 'target' ? Number(form.target) || 0 : null,
                            custom_field_id: form.group_by === 'custom_field' ? form.custom_field_id : null,
                            scope: isLine ? 'all' : form.scope,
                            measure: form.measure,
                            measure_custom_field_id: needsNumberField ? form.measure_custom_field_id : null,
                            x_label: form.x_label.trim() || null,
                            y_label: form.y_label.trim() || null,
                            stack_by: canSplit && form.stack_by ? form.stack_by : null,
                            stack_custom_field_id: canSplit && form.stack_by === 'custom_field'
                                ? form.stack_custom_field_id : null,
                            time_grouping: isLine ? form.time_grouping : null,
                            show_legend: (!isLine && !metric && !circular) ? form.show_legend : false,
                            manual_points: isLine ? [] : cleanPairs(form.manual_points),
                            reference_lines: circular ? [] : cleanPairs(form.reference_lines),
                        })}
                        disabled={!canSave || saving}
                    >
                        {saving ? 'Saving…' : chart ? 'Save Changes' : 'Add Chart'}
                    </Button>
                </>
            }
        >
            <div className="space-y-4 text-left">
                {error && (
                    <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
                )}

                {/*
                    Two tabs rather than one long scroll. Nearly every chart is
                    made from the four fields on the first one; measures, splits,
                    axis labels, targets and hand-entered figures are real
                    capabilities but wanted rarely, and showing all eleven at once
                    made a simple chart look like a configuration exercise.
                    The dot marks the second tab when something there is set, so
                    nothing is hidden without a trace.
                */}
                <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 -mt-1">
                    {[
                        { key: 'setup', label: 'Setup' },
                        { key: 'advanced', label: 'Advanced' },
                    ].map((t) => (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setTab(t.key)}
                            className={`relative px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                                tab === t.key
                                    ? 'border-primary-500 text-primary-700 dark:text-primary-300'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                            }`}
                        >
                            {t.label}
                            {t.key === 'advanced' && advancedCount > 0 && (
                                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 text-[10px] font-semibold px-1.5">
                                    {advancedCount}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                <div className={tab === 'setup' ? 'space-y-4' : 'hidden'}>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                    <Input
                        value={form.title}
                        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="e.g. Tasks by assignee"
                        autoFocus
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Chart type</label>
                    <div className="grid grid-cols-3 gap-2">
                        {CHART_TYPES.map((t) => (
                            <button
                                key={t.value}
                                type="button"
                                onClick={() => setType(t.value)}
                                title={t.hint || t.label}
                                className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                                    form.chart_type === t.value
                                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                                        : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                            >
                                {t.icon}
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {metric && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">
                        A card shows one number. Choose what to measure on the
                        Advanced tab, and narrow it down with filters there.
                    </p>
                )}

                {!metric && (
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {isLine ? 'Data' : 'Group by'}
                    </label>
                    <Select
                        value={form.group_by}
                        onChange={(e) => setForm((f) => ({
                            ...f,
                            group_by: e.target.value,
                            // Cannot split a dimension by itself.
                            stack_by: f.stack_by === e.target.value ? '' : f.stack_by,
                        }))}
                    >
                        {dimensions.map((d) => (
                            <option
                                key={d.value}
                                value={d.value}
                                disabled={d.value === 'custom_field' && selectFields.length === 0}
                            >
                                {d.label}{d.value === 'custom_field' && selectFields.length === 0 ? ' — none available' : ''}
                            </option>
                        ))}
                    </Select>
                </div>
                )}

                {!isLine && !metric && form.group_by === 'custom_field' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Custom field</label>
                        <Select
                            value={form.custom_field_id}
                            onChange={(e) => setForm((f) => ({ ...f, custom_field_id: e.target.value }))}
                        >
                            <option value="">Select a field…</option>
                            {selectFields.map((f) => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </Select>
                    </div>
                )}

                {isLine && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            X axis — group time by
                        </label>
                        <Select
                            value={form.time_grouping}
                            onChange={(e) => setForm((f) => ({ ...f, time_grouping: e.target.value }))}
                        >
                            {TIME_GROUPINGS.map((g) => (
                                <option key={g.value} value={g.value}>{g.label}</option>
                            ))}
                        </Select>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Automatic uses weeks, switching to months once there are more than
                            twenty to show.
                        </p>
                    </div>
                )}

                {!isLine && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tasks included</label>
                        <Select
                            value={form.scope}
                            onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
                        >
                            {SCOPES.map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                        </Select>
                    </div>
                )}

                </div>

                <div className={tab === 'advanced' ? 'space-y-4' : 'hidden'}>

                {/* Y axis — what is being measured, not just how many rows. */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Y axis — what to measure
                    </label>
                    <Select
                        value={form.measure}
                        onChange={(e) => setForm((f) => ({ ...f, measure: e.target.value }))}
                    >
                        {MEASURES
                            // A donut divides a whole into parts, so an average
                            // has nothing to divide.
                            .filter((m) => !(circular && m.value === 'avg_custom_field'))
                            .map((m) => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                    </Select>
                    {needsNumberField && numberFields.length === 0 && (
                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                            This project has no number or formula custom field to total.
                        </p>
                    )}
                </div>

                {needsNumberField && numberFields.length > 0 && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Number field
                        </label>
                        <Select
                            value={form.measure_custom_field_id}
                            onChange={(e) => setForm((f) => ({ ...f, measure_custom_field_id: e.target.value }))}
                        >
                            <option value="">Choose a field…</option>
                            {numberFields.map((f) => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </Select>
                    </div>
                )}

                {!metric && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            X axis label <span className="font-normal text-gray-400">(optional)</span>
                        </label>
                        <input
                            type="text" value={form.x_label} maxLength={60}
                            onChange={(e) => setForm((f) => ({ ...f, x_label: e.target.value }))}
                            placeholder={isLine ? 'e.g. Week' : 'e.g. Assignee'}
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Y axis label <span className="font-normal text-gray-400">(optional)</span>
                        </label>
                        <input
                            type="text" value={form.y_label} maxLength={60}
                            onChange={(e) => setForm((f) => ({ ...f, y_label: e.target.value }))}
                            placeholder="e.g. Hours"
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2 text-sm"
                        />
                    </div>
                </div>
                )}

                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Date range
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Select
                            value={form.date_range}
                            onChange={(e) => setForm((f) => ({ ...f, date_range: e.target.value }))}
                        >
                            {DATE_RANGES.map((r) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </Select>

                        {/* A time chart already plots one date; windowing on a
                            different one would cut the axis somewhere it does
                            not run, so the field is fixed there. */}
                        {form.date_range !== 'all' && !isLine && (
                            <Select
                                value={form.date_field}
                                onChange={(e) => setForm((f) => ({ ...f, date_field: e.target.value }))}
                            >
                                {DATE_FIELDS.map((d) => (
                                    <option key={d.value} value={d.value}>{d.label}</option>
                                ))}
                            </Select>
                        )}
                    </div>

                    {form.date_range === 'custom' && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <input
                                type="date" value={form.date_from}
                                onChange={(e) => setForm((f) => ({ ...f, date_from: e.target.value }))}
                                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2 text-sm"
                            />
                            <input
                                type="date" value={form.date_to}
                                onChange={(e) => setForm((f) => ({ ...f, date_to: e.target.value }))}
                                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2 text-sm"
                            />
                        </div>
                    )}

                    {form.date_range !== 'all' && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Tasks without that date are left out — they cannot be placed in the window.
                        </p>
                    )}
                </div>

                {!metric && !isLine && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Order
                            </label>
                            <Select
                                value={form.sort}
                                onChange={(e) => setForm((f) => ({ ...f, sort: e.target.value }))}
                            >
                                {HOW_TO_SORT.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </Select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                How many <span className="font-normal text-gray-400">(optional)</span>
                            </label>
                            <input
                                type="number" min="2" max="30" value={form.max_buckets}
                                onChange={(e) => setForm((f) => ({ ...f, max_buckets: e.target.value }))}
                                placeholder="Default"
                                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2 text-sm"
                            />
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                The rest fold into &ldquo;Other&rdquo;. Pair with
                                &ldquo;Largest first&rdquo; for a top-N chart.
                            </p>
                        </div>
                    </div>
                )}

                {(
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Filters <span className="font-normal text-gray-400">(optional)</span>
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                            Narrow what this counts — &ldquo;urgent tasks&rdquo;, &ldquo;Ana&rsquo;s tasks&rdquo;.
                            Several filters all have to match.
                        </p>

                        {form.filters.map((row, i) => (
                            <div key={i} className="flex items-center gap-2 mb-2">
                                <Select
                                    value={row.field}
                                    onChange={(e) => setFilter(i, { field: e.target.value, value: '' })}
                                    className="w-40"
                                >
                                    {CATEGORY_DIMENSIONS.map((d) => (
                                        <option key={d.value} value={d.value}>{d.label}</option>
                                    ))}
                                </Select>

                                <Select
                                    value={row.value}
                                    onChange={(e) => setFilter(i, { value: e.target.value })}
                                    className="flex-1"
                                >
                                    <option value="">Choose a value…</option>
                                    {filterValues(row).map((o) => (
                                        <option key={o.key} value={o.key}>{o.label}</option>
                                    ))}
                                </Select>

                                <button
                                    type="button"
                                    onClick={() => setForm((f) => ({
                                        ...f, filters: f.filters.filter((_, j) => j !== i),
                                    }))}
                                    className="text-gray-400 hover:text-red-500 shrink-0"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ))}

                        {form.filters.length < 5 && (
                            <button
                                type="button"
                                onClick={() => setForm((f) => ({
                                    ...f, filters: [...f.filters, { field: 'status', value: '' }],
                                }))}
                                className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                            >
                                + Add a filter
                            </button>
                        )}
                    </div>
                )}

                {metric && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Compare against <span className="font-normal text-gray-400">(optional)</span>
                        </label>
                        <Select
                            value={form.compare}
                            onChange={(e) => setForm((f) => ({ ...f, compare: e.target.value }))}
                        >
                            <option value="none">Nothing — just the number</option>
                            <option value="percent">The same measure without the filters</option>
                            <option value="target">A target I type in</option>
                        </Select>

                        {form.compare === 'target' && (
                            <input
                                type="number" step="any" value={form.target}
                                onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
                                placeholder="Target value"
                                className="mt-2 w-40 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2 text-sm"
                            />
                        )}
                    </div>
                )}

                {!metric && !isLine && !circular && (
                    <label className="flex items-start gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={form.show_legend}
                            onChange={(e) => setForm((f) => ({ ...f, show_legend: e.target.checked }))}
                            className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
                        />
                        <span>
                            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Show a legend
                            </span>
                            <span className="block text-xs text-gray-500 dark:text-gray-400">
                                Lists each colour and what it stands for. A split chart always has
                                one; on a single-series chart it repeats the axis labels, so it is
                                off unless you want it.
                            </span>
                        </span>
                    </label>
                )}

                {canSplit && !metric && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Split by <span className="font-normal text-gray-400">(optional)</span>
                        </label>
                        <Select
                            value={form.stack_by}
                            onChange={(e) => setForm((f) => ({ ...f, stack_by: e.target.value }))}
                        >
                            <option value="">Don&rsquo;t split</option>
                            {splitOptions.map((d) => (
                                <option key={d.value} value={d.value}>{d.label}</option>
                            ))}
                        </Select>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {isLine
                                ? 'Draws one line per value — "completed over time, one line per assignee".'
                                : 'Divides each bar — "by status, split by assignee". The largest ' + MAX_SERIES + ' are kept and the rest folded into Other.'}
                        </p>
                    </div>
                )}

                {canSplit && !metric && needsSplitField && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Split field
                        </label>
                        <Select
                            value={form.stack_custom_field_id}
                            onChange={(e) => setForm((f) => ({ ...f, stack_custom_field_id: e.target.value }))}
                        >
                            <option value="">Choose a field…</option>
                            {selectFields.map((f) => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </Select>
                        {selectFields.length === 0 && (
                            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                                This project has no single-select custom field to split by.
                            </p>
                        )}
                    </div>
                )}

                {!circular && !metric && pairEditor(
                    'reference_lines',
                    'Target lines',
                    'A constant drawn across the chart — a target, a threshold, a capacity.',
                    'Add a target line',
                )}

                {!isLine && !metric && pairEditor(
                    'manual_points',
                    'Manual figures',
                    'Values you type in yourself, shown beside the measured data and hatched so the two are never confused.',
                    'Add a figure',
                )}

                </div>
            </div>
        </Modal>
    );
}

/* ------------------------------- Section ------------------------------- */

export default function ProjectCharts({ projectId, charts: initialCharts, tasks, sections, customFields, canManage }) {
    const [charts, setCharts] = useState(initialCharts || []);
    const [modalOpen, setModalOpen] = useState(false);
    const [newType, setNewType] = useState('bar');
    const [editingChart, setEditingChart] = useState(null);
    const [deletingChart, setDeletingChart] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        setCharts(initialCharts || []);
    }, [initialCharts]);

    // Flatten parent tasks + subtasks, mirroring the built-in dashboard stats
    const allTasks = useMemo(() => {
        const flat = [];
        tasks.forEach((t) => {
            flat.push(t);
            (t.subtasks || []).forEach((st) => flat.push(st));
        });
        return flat;
    }, [tasks]);

    const handleSave = async (payload) => {
        setSaving(true);
        setError(null);
        try {
            const url = editingChart
                ? `/projects/${projectId}/charts/${editingChart.id}`
                : `/projects/${projectId}/charts`;
            const res = await apiFetch(url, {
                method: editingChart ? 'PUT' : 'POST',
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                const { chart } = await res.json();
                setCharts((prev) => editingChart
                    ? prev.map((c) => (c.id === chart.id ? chart : c))
                    : [...prev, chart]);
                setModalOpen(false);
                setEditingChart(null);
            } else {
                const body = await res.json().catch(() => ({}));
                setError(body.message || 'Could not save the chart. Please check the form and try again.');
            }
        } catch {
            setError('Could not save the chart. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        const chart = deletingChart;
        setDeletingChart(null);
        if (!chart) return;
        setCharts((prev) => prev.filter((c) => c.id !== chart.id));
        try {
            const res = await apiFetch(`/projects/${projectId}/charts/${chart.id}`, { method: 'DELETE' });
            if (!res.ok) setCharts((prev) => [...prev, chart]);
        } catch {
            setCharts((prev) => [...prev, chart]);
        }
    };

    const metricCharts = charts.filter((c) => isMetricChart(c.chart_type));
    const plottedCharts = charts.filter((c) => !isMetricChart(c.chart_type));

    if (charts.length === 0 && !canManage) return null;

    return (
        <div className="wmt-viz">
            <style>{VIZ_STYLE}</style>

            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Charts &amp; Cards</h3>
                {canManage && (
                    <div className="flex items-center gap-4">
                        {/* Two buttons onto one modal: the type is just
                            pre-selected, so switching a card into a chart later
                            is an ordinary edit rather than a delete and redo. */}
                        <button
                            onClick={() => { setEditingChart(null); setNewType('metric'); setError(null); setModalOpen(true); }}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                            Add Card
                        </button>
                        <button
                            onClick={() => { setEditingChart(null); setNewType('bar'); setError(null); setModalOpen(true); }}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                            Add Chart
                        </button>
                    </div>
                )}
            </div>

            {charts.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-8 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Nothing here yet. Add a card for a single figure, or a chart to
                        visualise this project&rsquo;s tasks.
                    </p>
                </div>
            ) : (
                <>
                {/* Cards are one number each, so they sit four across rather
                    than taking half the width a chart needs. */}
                {metricCharts.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
                        {metricCharts.map((chart) => (
                            <ChartCard
                                key={chart.id}
                                chart={chart}
                                allTasks={allTasks}
                                sections={sections}
                                customFields={customFields}
                                canManage={canManage}
                                onEdit={(c) => { setEditingChart(c); setError(null); setModalOpen(true); }}
                                onDelete={(c) => setDeletingChart(c)}
                            />
                        ))}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {plottedCharts.map((chart) => (
                        <ChartCard
                            key={chart.id}
                            chart={chart}
                            allTasks={allTasks}
                            sections={sections}
                            customFields={customFields}
                            canManage={canManage}
                            onEdit={(c) => { setEditingChart(c); setError(null); setModalOpen(true); }}
                            onDelete={(c) => setDeletingChart(c)}
                        />
                    ))}
                </div>
                </>
            )}

            <ChartFormModal
                isOpen={modalOpen}
                onClose={() => { setModalOpen(false); setEditingChart(null); }}
                onSave={handleSave}
                chart={editingChart}
                customFields={customFields}
                allTasks={allTasks}
                sections={sections}
                newType={newType}
                saving={saving}
                error={error}
            />

            <ConfirmModal
                isOpen={deletingChart !== null}
                onClose={() => setDeletingChart(null)}
                onConfirm={handleDelete}
                title="Delete Chart"
                message={`Delete "${deletingChart?.title}"? This cannot be undone.`}
            />
        </div>
    );
}
