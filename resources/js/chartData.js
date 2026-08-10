/**
 * Everything a project chart computes, with nothing it draws.
 *
 * Split out of ProjectCharts.jsx so it can be tested. Node cannot import a
 * .jsx file, so while this lived alongside the components the only way to
 * check it was to copy the logic into a test and check the copy — which is
 * exactly how a filter came to be applied on the plain path and not the split
 * one. The copies were right; the caller was not, and nothing could see that.
 *
 * The pipeline, in order: pick the tasks (scope, filters, date window), put
 * each into a bucket, measure the bucket, then arrange the buckets.
 */
// Extensions spelled out so plain Node can import this too, not only Vite.
import { formatLabel, isPastDue } from './utils.js';
import { isoWeekParts } from './weekOfYear.js';

export const SERIES_VARS = ['--viz-s1', '--viz-s2', '--viz-s3', '--viz-s4', '--viz-s5', '--viz-s6', '--viz-s7', '--viz-s8'];

// Matches the app-wide status/priority color language used across badges
// and the existing dashboard breakdown charts
export const STATUS_HEX = {
    backlog: '#9ca3af',
    to_do: '#3b82f6',
    in_progress: '#eab308',
    in_review: '#a855f7',
    done: '#22c55e',
    cancelled: '#f87171',
};
export const PRIORITY_HEX = {
    urgent: '#ef4444',
    high: '#f97316',
    medium: '#3b82f6',
    low: '#9ca3af',
};

export const CATEGORY_DIMENSIONS = [
    { value: 'status', label: 'Status' },
    { value: 'priority', label: 'Priority' },
    { value: 'assignee', label: 'Assignee' },
    { value: 'section', label: 'Section' },
    { value: 'created_by', label: 'Created by' },
    { value: 'overdue', label: 'Overdue or on track' },
    { value: 'has_due_date', label: 'Has a due date' },
    { value: 'custom_field', label: 'Custom field (single-select)' },
];
export const TIME_DIMENSIONS = [
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
export const MEASURES = [
    { value: 'count', label: 'Number of tasks', unit: '' },
    { value: 'sum_estimate', label: 'Estimated hours', unit: 'h' },
    { value: 'sum_logged', label: 'Logged hours', unit: 'h' },
    { value: 'sum_custom_field', label: 'Total of a number field', unit: '', needsField: true },
    { value: 'avg_custom_field', label: 'Average of a number field', unit: '', needsField: true },
];

export const measureSpec = (value) => MEASURES.find((m) => m.value === value) || MEASURES[0];

/** Number fields a measure can total. Formulas count — they resolve to numbers. */
export const numericFields = (customFields) =>
    (customFields || []).filter((f) => f.type === 'number' || f.type === 'formula');

/**
 * The value one task contributes to a bucket.
 *
 * Returns null when the task has nothing to contribute, which is different from
 * zero: a task with no estimate should not drag an average down.
 */
export function taskValue(task, measure, fieldId) {
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
export function aggregate(tasks, measure, fieldId) {
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
export function formatValue(value, measure) {
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
export const TIME_GROUPINGS = [
    { value: 'auto', label: 'Automatic' },
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week (starting date)' },
    { value: 'week_number', label: 'Week number (W32)' },
    { value: 'month', label: 'Month' },
];

export const SCOPES = [
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
export const TIME_CHARTS = ['line', 'area'];
export const CIRCULAR_CHARTS = ['donut', 'pie'];
export const isTimeChart = (type) => TIME_CHARTS.includes(type);
/** A card, not a chart: one computed number and no axis. */
export const isMetricChart = (type) => type === 'metric';
export const isCircularChart = (type) => CIRCULAR_CHARTS.includes(type);

/** Preset windows for a chart's date range. */
export const DATE_RANGES = [
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
export const DATE_FIELDS = [
    { value: 'created', label: 'Created date' },
    { value: 'completed', label: 'Completed date' },
    { value: 'due', label: 'Due date' },
];

export const HOW_TO_SORT = [
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
export function chartTasks(chart, allTasks, sections, customFields) {
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
export function windowDate(task, chart) {
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

export function withinDateWindow(tasks, chart) {
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
export function arrangeBuckets(buckets, chart, fallbackMax) {
    const sort = chart.config?.sort || 'natural';

    const sorted = sort === 'value_desc' ? [...buckets].sort((a, b) => b.count - a.count)
        : sort === 'value_asc' ? [...buckets].sort((a, b) => a.count - b.count)
        : sort === 'label' ? [...buckets].sort((a, b) => a.label.localeCompare(b.label))
        : buckets;

    const max = Number(chart.config?.max_buckets) || fallbackMax;

    return foldBuckets(sorted, max);
}

export function scopeTasks(tasks, scope) {
    if (scope === 'active') return tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
    if (scope === 'done') return tasks.filter((t) => t.status === 'done');
    return tasks;
}

// Buckets for bar/donut charts: [{ key, label, count, color }]
export function computeCategoryData(chart, allTasks, sections, customFields) {
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
export function manualBuckets(chart) {
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
export function referenceLines(chart) {
    return (chart.config?.reference_lines || [])
        .filter((r) => r && r.label)
        .map((r) => ({ label: r.label, value: Number(r.value) || 0 }));
}

/** Most series a stack can carry before the colours stop meaning anything. */
export const MAX_SERIES = 8;

/**
 * Which slice of a category dimension a task belongs to.
 *
 * Shared by the X axis and the split, so "by assignee" means the same thing
 * whichever axis it is on — and a dimension added here works on both at once.
 */
export function categorise(task, dimension, { sections, customFields, fieldId }) {
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
export function computeStackedData(chart, allTasks, sections, customFields) {
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
export function arrangeStackedRows(rows, series, chart, fallbackMax = 12) {
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

/**
 * Keep the first maxBuckets and gather everything after them into one "Other".
 *
 * maxBuckets counts real buckets, not slots: "Top 3" draws three bars and then
 * Other, never two and Other. Split charts already worked that way, so a chart
 * and the same chart split by status would otherwise disagree about what 3 meant.
 */
export function foldBuckets(buckets, maxBuckets) {
    if (buckets.length <= maxBuckets) return buckets;
    const kept = buckets.slice(0, maxBuckets);
    const rest = buckets.slice(maxBuckets);
    kept.push({
        key: 'other',
        label: `Other (${rest.length})`,
        count: rest.reduce((sum, b) => sum + b.count, 0),
        color: 'var(--viz-other)',
    });
    return kept;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
    return d;
}

// Buckets for line charts: [{ label, count, date }], weekly, or monthly when
// the range would exceed ~20 weekly points
export function computeTimeData(chart, allTasks, sections, customFields) {
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

export function startOfDay(date) {
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
export function resolveTimeGrouping(setting, min, max) {
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
export function labelByWeekNumber(buckets) {
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
export function computeStackedTimeData(chart, allTasks, sections, customFields) {
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

/**
 * "Urgent · Ana" — a card's filters in words, shown under the number.
 *
 * Without it a card reading 7 gives no clue which 7, and two cards can look
 * identical on the same dashboard while counting different things. The label
 * comes from categorise() rather than the stored key, so a filter reads as the
 * name the board shows rather than an id.
 */
export function describeFilters(chart, allTasks, sections, customFields) {
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
export function metricTasks(chart, allTasks, sections, customFields) {
    return chartTasks(chart, allTasks, sections, customFields);
}

/** What a card computes, and what it is measured against. */
export function computeMetric(chart, allTasks, sections, customFields) {
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
