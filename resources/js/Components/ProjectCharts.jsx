import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import Modal, { ConfirmModal } from './Modal';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import { formatLabel, apiFetch } from '../utils';

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

const SCOPES = [
    { value: 'all', label: 'All tasks' },
    { value: 'active', label: 'Active tasks only' },
    { value: 'done', label: 'Completed tasks only' },
];

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
];

function scopeTasks(tasks, scope) {
    if (scope === 'active') return tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
    if (scope === 'done') return tasks.filter((t) => t.status === 'done');
    return tasks;
}

// Buckets for bar/donut charts: [{ key, label, count, color }]
function computeCategoryData(chart, allTasks, sections, customFields) {
    const scope = chart.config?.scope || 'all';
    const tasks = scopeTasks(allTasks, scope);
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
function computeTimeData(chart, allTasks) {
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
    const points = allTasks
        .map((t) => ({ task: t, date: new Date(accessor(t)) }))
        .filter((p) => p.date instanceof Date && !isNaN(p.date));
    if (points.length === 0) return [];

    const dates = points.map((p) => p.date);

    const min = new Date(Math.min(...dates));
    const max = new Date(Math.max(...dates, Date.now()));
    const weeks = Math.ceil((max - min) / (7 * DAY_MS)) + 1;
    const monthly = weeks > 20;

    const buckets = [];
    if (monthly) {
        const cursor = new Date(min.getFullYear(), min.getMonth(), 1);
        while (cursor <= max) {
            buckets.push({
                date: new Date(cursor),
                label: cursor.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
                count: 0,
            });
            cursor.setMonth(cursor.getMonth() + 1);
        }
        buckets.forEach((b) => { b.tasks = []; });
        points.forEach(({ task, date: d }) => {
            const i = (d.getFullYear() - min.getFullYear()) * 12 + (d.getMonth() - min.getMonth());
            if (buckets[i]) buckets[i].tasks.push(task);
        });
    } else {
        const start = startOfWeek(min);
        const cursor = new Date(start);
        while (cursor <= max) {
            buckets.push({
                date: new Date(cursor),
                label: cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                count: 0,
            });
            cursor.setDate(cursor.getDate() + 7);
        }
        buckets.forEach((b) => { b.tasks = []; });
        points.forEach(({ task, date: d }) => {
            const i = Math.floor((startOfWeek(d) - start) / (7 * DAY_MS));
            if (buckets[i]) buckets[i].tasks.push(task);
        });
    }
    buckets.forEach((b) => {
        b.count = aggregate(b.tasks || [], measure, fieldId);
        delete b.tasks;
    });

    return buckets;
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

function BarChart({ buckets, measure = 'count', references = [], xLabel, yLabel }) {
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

function DonutChart({ buckets, measure = 'count' }) {
    const [hovered, setHovered] = useState(null);
    const total = buckets.reduce((sum, b) => sum + b.count, 0);

    const cx = 90, cy = 90, rOuter = 80, rInner = 52;
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
                        <circle
                            cx={cx} cy={cy} r={(rOuter + rInner) / 2}
                            fill="none" stroke={buckets[0].color} strokeWidth={rOuter - rInner}
                        />
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
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">{total}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">tasks</span>
                </div>
            </div>
            {/* Legend doubles as the readable value channel for every slice */}
            <div className="min-w-0 flex-1 space-y-1.5 self-center w-full">
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

function LineChart({ buckets, measure = 'count', references = [], xLabel, yLabel }) {
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

                <path d={areaPath} fill="var(--viz-s1)" opacity="0.1" />
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

    const data = useMemo(() => {
        if (chart.chart_type === 'line') return computeTimeData(chart, allTasks);

        const buckets = computeCategoryData(chart, allTasks, sections, customFields);
        const folded = foldBuckets(buckets, chart.chart_type === 'donut' ? 8 : 12);

        // Hand-entered figures are appended after folding, so an "Other" bucket
        // can never swallow one — they were typed in precisely to be seen.
        return [...folded, ...manualBuckets(chart)];
    }, [chart, allTasks, sections, customFields]);

    const isEmpty = data.length === 0 || (chart.chart_type !== 'line' && data.every((b) => b.count === 0));

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
            ) : chart.chart_type === 'bar' ? (
                <BarChart
                    buckets={data} measure={measure} references={references}
                    xLabel={chart.config?.x_label} yLabel={chart.config?.y_label}
                />
            ) : chart.chart_type === 'donut' ? (
                <DonutChart buckets={data} measure={measure} />
            ) : (
                <LineChart
                    buckets={data} measure={measure} references={references}
                    xLabel={chart.config?.x_label} yLabel={chart.config?.y_label}
                />
            )}
        </div>
    );
}

/* ----------------------------- Add/edit modal ----------------------------- */

function ChartFormModal({ isOpen, onClose, onSave, chart, customFields, saving, error }) {
    const selectFields = customFields.filter((f) => f.type === 'single_select');

    const numberFields = numericFields(customFields);

    const [form, setForm] = useState({ title: '', chart_type: 'bar', group_by: 'status', custom_field_id: '', scope: 'all', measure: 'count', measure_custom_field_id: '', x_label: '', y_label: '', manual_points: [], reference_lines: [] });

    useEffect(() => {
        if (!isOpen) return;
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
        } : { title: '', chart_type: 'bar', group_by: 'status', custom_field_id: '', scope: 'all', measure: 'count', measure_custom_field_id: '', x_label: '', y_label: '', manual_points: [], reference_lines: [] });
    }, [isOpen, chart]);

    const isLine = form.chart_type === 'line';
    const dimensions = isLine ? TIME_DIMENSIONS : CATEGORY_DIMENSIONS;

    const setType = (type) => {
        setForm((f) => {
            const next = { ...f, chart_type: type };
            const allowed = (type === 'line' ? TIME_DIMENSIONS : CATEGORY_DIMENSIONS).map((d) => d.value);
            if (!allowed.includes(next.group_by)) next.group_by = allowed[0];
            return next;
        });
    };

    const needsNumberField = measureSpec(form.measure).needsField;

    const canSave = form.title.trim().length > 0
        && (form.group_by !== 'custom_field' || form.custom_field_id)
        && (!needsNumberField || form.measure_custom_field_id);

    // Rows the user is part-way through typing are dropped rather than saved
    // as a blank label with a number nobody can read.
    const cleanPairs = (rows) => rows
        .map((r) => ({ label: String(r.label || '').trim(), value: Number(r.value) || 0 }))
        .filter((r) => r.label !== '');

    const setPairs = (key, rows) => setForm((f) => ({ ...f, [key]: rows }));

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
                            group_by: form.group_by,
                            custom_field_id: form.group_by === 'custom_field' ? form.custom_field_id : null,
                            scope: isLine ? 'all' : form.scope,
                            measure: form.measure,
                            measure_custom_field_id: needsNumberField ? form.measure_custom_field_id : null,
                            x_label: form.x_label.trim() || null,
                            y_label: form.y_label.trim() || null,
                            manual_points: isLine ? [] : cleanPairs(form.manual_points),
                            reference_lines: form.chart_type === 'donut' ? [] : cleanPairs(form.reference_lines),
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

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {isLine ? 'Data' : 'Group by'}
                    </label>
                    <Select
                        value={form.group_by}
                        onChange={(e) => setForm((f) => ({ ...f, group_by: e.target.value }))}
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

                {!isLine && form.group_by === 'custom_field' && (
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

                {/* Y axis — what is being measured, not just how many rows. */}
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
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
                            .filter((m) => !(form.chart_type === 'donut' && m.value === 'avg_custom_field'))
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

                {form.chart_type !== 'donut' && pairEditor(
                    'reference_lines',
                    'Target lines',
                    'A constant drawn across the chart — a target, a threshold, a capacity.',
                    'Add a target line',
                )}

                {!isLine && pairEditor(
                    'manual_points',
                    'Manual figures',
                    'Values you type in yourself, shown beside the measured data and hatched so the two are never confused.',
                    'Add a figure',
                )}
            </div>
        </Modal>
    );
}

/* ------------------------------- Section ------------------------------- */

export default function ProjectCharts({ projectId, charts: initialCharts, tasks, sections, customFields, canManage }) {
    const [charts, setCharts] = useState(initialCharts || []);
    const [modalOpen, setModalOpen] = useState(false);
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

    if (charts.length === 0 && !canManage) return null;

    return (
        <div className="wmt-viz">
            <style>{VIZ_STYLE}</style>

            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Charts</h3>
                {canManage && (
                    <button
                        onClick={() => { setEditingChart(null); setError(null); setModalOpen(true); }}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Add Chart
                    </button>
                )}
            </div>

            {charts.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-8 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        No charts yet. Add a chart to visualize this project's tasks.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {charts.map((chart) => (
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

            <ChartFormModal
                isOpen={modalOpen}
                onClose={() => { setModalOpen(false); setEditingChart(null); }}
                onSave={handleSave}
                chart={editingChart}
                customFields={customFields}
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
