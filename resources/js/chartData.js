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
import { isoWeekParts, resolveReferenceDate } from './weekOfYear.js';

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
    { value: 'sum_custom_field', label: 'Total of a number field', unit: '', needsField: true, fieldKind: 'numeric' },
    { value: 'avg_custom_field', label: 'Average of a number field', unit: '', needsField: true, fieldKind: 'numeric' },
    // These two take any field at all. A date, a select, a person — none of them
    // can be added up, but "how many tasks have one" and "how many different
    // ones are there" are questions worth putting on an axis.
    { value: 'count_filled', label: 'Tasks with a value in a field', unit: '', needsField: true, fieldKind: 'any' },
    { value: 'count_distinct', label: 'Different values in a field', unit: '', needsField: true, fieldKind: 'any' },
];

export const measureSpec = (value) => MEASURES.find((m) => m.value === value) || MEASURES[0];

/**
 * Fields a measure can be pointed at.
 *
 * Only some fields hold a number, so only some can be totalled — but every
 * field can be counted, and restricting the whole picker to numbers was hiding
 * most of a project's data from the Y axis.
 */
export const numericFields = (customFields) => (customFields || []).filter((f) =>
    f.type === 'number'
    // A formula that returns Yes/No or a date is not something to total.
    || (f.type === 'formula' && (f.config?.result_type || 'number') === 'number'));

export const measureFields = (customFields, measure) =>
    measureSpec(measure).fieldKind === 'any'
        ? (customFields || [])
        : numericFields(customFields);

/**
 * Everything one task holds for one custom field, as comparable entries.
 *
 * An array because a multi-select or a people field holds several at once, and
 * counting how many distinct values exist has to see all of them.
 *
 * Two field types are not stored on the value row at all and would otherwise
 * read as permanently empty: a formula is computed in the browser, and a week
 * of year is derived from whichever date the field follows.
 */
export function fieldEntries(task, field, formulaResults = {}) {
    if (!field) return [];

    if (field.type === 'formula') {
        const raw = formulaResults?.[task.id]?.[field.id];
        if (raw === null || raw === undefined || raw === '') return [];
        const number = typeof raw === 'number' ? raw : null;
        return [{ key: String(raw), label: String(raw), number }];
    }

    if (field.type === 'week_of_year') {
        const parts = isoWeekParts(resolveReferenceDate(task, field.config));
        return parts
            ? [{ key: `${parts.year}-W${parts.week}`, label: `Week ${parts.week}, ${parts.year}`, number: parts.week }]
            : [];
    }

    const cfv = (task.custom_field_values || []).find((v) => v.custom_field_id === field.id);
    if (!cfv) return [];

    if (field.type === 'number') {
        const raw = cfv.value_number;
        if (raw === null || raw === undefined || raw === '') return [];
        return [{ key: String(raw), label: String(raw), number: Number(raw) }];
    }

    if (field.type === 'date') {
        return cfv.value_date ? [{ key: cfv.value_date, label: cfv.value_date, number: null }] : [];
    }

    if (field.type === 'single_select') {
        const option = (field.options || []).find((o) => o.id === cfv.value_option_id);
        if (!cfv.value_option_id) return [];
        return [{
            key: String(cfv.value_option_id),
            label: option?.label || String(cfv.value_option_id),
            number: null,
        }];
    }

    if (field.type === 'multi_select' || field.type === 'people') {
        return (cfv.value_json || [])
            .filter((v) => v !== null && v !== undefined && v !== '')
            .map((v) => {
                const option = (field.options || []).find((o) => String(o.id) === String(v));
                return { key: String(v), label: option?.label || String(v), number: null };
            });
    }

    // text, textarea, and anything added later that lands in value_text.
    const text = String(cfv.value_text ?? '').trim();
    return text === '' ? [] : [{ key: text, label: text, number: null }];
}

const fieldById = (customFields, fieldId) =>
    (customFields || []).find((f) => f.id === fieldId) || null;

/**
 * The value one task contributes to a bucket.
 *
 * Returns null when the task has nothing to contribute, which is different from
 * zero: a task with no estimate should not drag an average down.
 */
export function taskValue(task, measure, fieldId, ctx = {}) {
    if (measure === 'sum_estimate') {
        return task.estimated_minutes ? task.estimated_minutes / 60 : null;
    }

    if (measure === 'sum_logged') {
        return task.logged_minutes ? task.logged_minutes / 60 : null;
    }

    if (measure === 'sum_custom_field' || measure === 'avg_custom_field') {
        const numbers = fieldEntries(task, fieldById(ctx.customFields, fieldId), ctx.formulaResults)
            .map((e) => e.number)
            .filter((n) => n !== null && !Number.isNaN(n));

        // A multi-value field contributes the sum of what it holds, so one task
        // is still one contribution and an average stays an average over tasks.
        return numbers.length ? numbers.reduce((a, b) => a + b, 0) : null;
    }

    return 1; // count
}

/** Roll a set of tasks up into one number for the chosen measure. */
export function aggregate(tasks, measure, fieldId, ctx = {}) {
    if (measure === 'count') {
        return tasks.length;
    }

    // Counting values is not summing per-task numbers, so these two answer
    // before the numeric path below.
    if (measure === 'count_filled' || measure === 'count_distinct') {
        const field = fieldById(ctx.customFields, fieldId);
        if (!field) return 0;

        if (measure === 'count_filled') {
            return tasks.filter((t) => fieldEntries(t, field, ctx.formulaResults).length > 0).length;
        }

        const seen = new Set();
        tasks.forEach((t) => fieldEntries(t, field, ctx.formulaResults).forEach((e) => seen.add(e.key)));
        return seen.size;
    }

    const values = tasks
        .map((t) => taskValue(t, measure, fieldId, ctx))
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
export function computeCategoryData(chart, allTasks, sections, customFields, formulaResults = {}) {
    const tasks = chartTasks(chart, allTasks, sections, customFields);
    const groupBy = chart.group_by;
    const measure = chart.config?.measure || 'count';
    const fieldId = chart.config?.measure_custom_field_id || null;

    // One helper so every branch below measures the same way.
    const roll = (subset) => aggregate(subset, measure, fieldId, { customFields, formulaResults });

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
 * How the series of a split bar/column chart sit against each other.
 *
 * Stacked answers "what is the total, and what is it made of"; grouped answers
 * "how do the parts compare, group by group". Same data either way — only the
 * drawing changes — so this is a display choice, not a second computation.
 */
export const BAR_MODES = [
    { value: 'stacked', label: 'Stacked' },
    { value: 'grouped', label: 'Side by side' },
];

/**
 * The tallest single series value across every group.
 *
 * A stacked chart scales to the row total; a grouped one draws each series as
 * its own bar, so the axis has to reach the largest bar, not the largest pile.
 */
export function maxSegmentValue(rows) {
    return (rows || []).reduce(
        (max, row) => (row.segments || []).reduce((m, seg) => Math.max(m, seg.value || 0), max),
        0,
    );
}

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
export function computeStackedData(chart, allTasks, sections, customFields, formulaResults = {}) {
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
            seriesTotals.set(key, (seriesTotals.get(key) || 0) + aggregate(group, measure, measureFieldId, { customFields, formulaResults }));
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

            return { key: s.key, label: s.label, color: s.color, value: aggregate(group, measure, measureFieldId, { customFields, formulaResults }) };
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
export function computeTimeData(chart, allTasks, sections, customFields, formulaResults = {}) {
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
        b.count = aggregate(b.tasks || [], measure, fieldId, { customFields, formulaResults });
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
export function computeStackedTimeData(chart, allTasks, sections, customFields, formulaResults = {}) {
    const stackBy = chart.config?.stack_by;
    const sOpts = { sections, customFields, fieldId: chart.config?.stack_custom_field_id };

    // The shape of the axis, measured across everything.
    const skeleton = computeTimeData(chart, allTasks, sections, customFields, formulaResults);
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

        const bucketed = computeTimeData(chart, subset, sections, customFields, formulaResults);
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
export function computeMetric(chart, allTasks, sections, customFields, formulaResults = {}) {
    const measure = chart.config?.measure || 'count';
    const fieldId = chart.config?.measure_custom_field_id || null;

    const matched = metricTasks(chart, allTasks, sections, customFields);
    const value = aggregate(matched, measure, fieldId, { customFields, formulaResults });

    const compare = chart.config?.compare || 'none';

    if (compare === 'percent') {
        // Against the same measure over the unfiltered scope, so the figure
        // answers "how much of the work this card is about".
        const whole = aggregate(scopeTasks(allTasks, chart.config?.scope), measure, fieldId, { customFields, formulaResults });

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

/**
 * What is wrong with a chart before it is saved, and what is merely worth
 * knowing.
 *
 * The form used to grey out Save when something was missing, which told the
 * user there was a problem without telling them what it was. Errors block the
 * save and name the thing to fix; warnings let it through but say what the
 * chart will look like — an empty chart drawn from a filter that matches
 * nothing is a valid chart and a wasted afternoon.
 *
 * Takes the payload the form would post, so what is checked is exactly what
 * would be stored. Checking a rephrased copy of the config is how a check
 * drifts away from the thing it is checking.
 */
export function validateChartConfig(payload, { customFields = [], sections = [], tasks = [], formulaResults = {} } = {}) {
    const errors = [];
    const warnings = [];

    const type = payload.chart_type;
    const circular = isCircularChart(type);
    const metric = isMetricChart(type);
    const overTime = isTimeChart(type);
    const field = (id) => (customFields || []).find((f) => f.id === Number(id)) || null;
    const typeName = (f) => String(f.type || '').replace(/_/g, ' ');

    if (!String(payload.title || '').trim()) {
        errors.push('Give the chart a title.');
    }

    // --- the X axis -------------------------------------------------------
    if (metric) {
        if (payload.group_by && payload.group_by !== 'none') {
            errors.push('A card shows one number, so it has nothing to group by.');
        }
    } else if (overTime && !TIME_DIMENSIONS.some((d) => d.value === payload.group_by)) {
        errors.push('A line or area chart plots dates, so pick one of the over-time dimensions.');
    } else if (!overTime && !CATEGORY_DIMENSIONS.some((d) => d.value === payload.group_by)) {
        errors.push('Pick something for the X axis.');
    }

    if (payload.group_by === 'custom_field') {
        const f = field(payload.custom_field_id);

        if (!f) {
            errors.push('Choose the custom field for the X axis.');
        } else if (f.type !== 'single_select') {
            errors.push(`The X axis needs a single-select field — "${f.name}" is a ${typeName(f)} field.`);
        }
    }

    // --- the Y axis -------------------------------------------------------
    const measure = payload.measure || 'count';
    const spec = measureSpec(measure);

    if (spec.needsField) {
        const f = field(payload.measure_custom_field_id);

        if (!f) {
            errors.push(`"${spec.label}" needs a field to measure — choose one.`);
        } else if (spec.fieldKind === 'numeric' && !numericFields(customFields).some((n) => n.id === f.id)) {
            // Totalling a date or a select would produce a number that looks
            // real and means nothing.
            errors.push(`"${spec.label}" needs a number field — "${f.name}" is a ${typeName(f)} field. Counting its values works instead.`);
        }
    }

    if (circular && measure === 'avg_custom_field') {
        errors.push('A donut or pie divides one whole into parts, and averages do not add up to a whole.');
    }

    // --- the split --------------------------------------------------------
    if (payload.stack_by) {
        if (circular) {
            errors.push('A donut or pie is already a breakdown, so it cannot be split again.');
        }

        // The same grouping twice gives one series per bar and says nothing.
        // Two custom fields only collide when they are the same field — "by
        // Client, then by Region" is two groupings, not one.
        const sameField = payload.stack_by === 'custom_field'
            && String(payload.stack_custom_field_id) === String(payload.custom_field_id);
        const sameGrouping = payload.stack_by === payload.group_by
            && (payload.stack_by !== 'custom_field' || sameField);

        if (sameGrouping) {
            const f = sameField ? field(payload.custom_field_id) : null;
            errors.push(f
                ? `"${f.name}" is already the first grouping — choose a different field for the second, or grouping by it twice just splits each bar into itself.`
                : 'Use a different second grouping — grouping by the same thing twice gives one series per bar.');
        }

        if (payload.stack_by === 'custom_field') {
            const f = field(payload.stack_custom_field_id);

            if (!f) {
                errors.push('Choose the custom field for the second grouping.');
            } else if (f.type !== 'single_select') {
                errors.push(`The second grouping needs a single-select field — "${f.name}" is a ${typeName(f)} field.`);
            }
        }
    }

    // --- the window, the ordering, the filters ----------------------------
    if (payload.date_range === 'custom') {
        if (!payload.date_from || !payload.date_to) {
            errors.push('A custom date range needs both a start and an end.');
        } else if (payload.date_from > payload.date_to) {
            errors.push('The date range starts after it ends.');
        }
    }

    const cap = payload.max_buckets;
    if (cap !== null && cap !== undefined && cap !== '' && (Number(cap) < 2 || Number(cap) > 30)) {
        errors.push('Show between 2 and 30 bars before the rest fold into "Other".');
    }

    (payload.filters || []).forEach((f, i) => {
        if (!f.field) {
            errors.push(`Filter ${i + 1} has no field chosen.`);
        } else if (f.value === '' || f.value === null || f.value === undefined) {
            errors.push(`Filter ${i + 1} has no value chosen.`);
        } else if (f.field === 'custom_field' && !f.custom_field_id) {
            errors.push(`Filter ${i + 1} needs a custom field naming.`);
        }
    });

    if (metric && payload.compare === 'target' && !Number.isFinite(Number(payload.target))) {
        errors.push('Set the target this card is measured against.');
    }

    // Everything below reads the real data, which only means anything once the
    // config above makes sense.
    if (errors.length > 0) return { errors, warnings };

    // --- what it will actually draw ---------------------------------------
    const probe = { group_by: payload.group_by, config: payload };
    const matched = chartTasks(probe, tasks, sections, customFields);

    if (tasks.length === 0) {
        warnings.push('This project has no tasks yet, so the chart stays empty until it does.');
    } else if (matched.length === 0) {
        warnings.push('No task matches this scope, these filters and this date range, so the chart will be empty.');
    }

    if (spec.needsField && matched.length > 0) {
        const f = field(payload.measure_custom_field_id);
        const withValue = matched.filter((t) => fieldEntries(t, f, formulaResults).length > 0).length;

        if (withValue === 0) {
            warnings.push(`No matching task has a value in "${f.name}", so every bar comes out zero.`);
        } else if (withValue < matched.length) {
            warnings.push(`${matched.length - withValue} of ${matched.length} matching tasks have no value in "${f.name}".`);
        }
    }

    if (!metric && matched.length > 0) {
        const buckets = overTime
            ? computeTimeData(probe, tasks, sections, customFields, formulaResults)
            : computeCategoryData(probe, tasks, sections, customFields, formulaResults);

        if (buckets.length === 0) {
            warnings.push('Nothing lands on the X axis with these settings, so the chart will be blank.');
        } else if (buckets.every((b) => !b.count)) {
            warnings.push('Every value comes out as zero.');
        }

        if (payload.stack_by) {
            const split = overTime
                ? computeStackedTimeData(probe, tasks, sections, customFields, formulaResults)
                : computeStackedData(probe, tasks, sections, customFields, formulaResults);

            if (split.series.some((s) => s.key === '__other')) {
                warnings.push(`The split has more than ${MAX_SERIES} series, so the rest are grouped as "Other".`);
            }
        }
    }

    return { errors, warnings };
}
