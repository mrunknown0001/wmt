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

    if (groupBy === 'status') {
        return Object.keys(STATUS_HEX)
            .map((s) => ({
                key: s,
                label: formatLabel(s),
                count: tasks.filter((t) => t.status === s).length,
                color: STATUS_HEX[s],
            }))
            .filter((b) => b.count > 0);
    }

    if (groupBy === 'priority') {
        return Object.keys(PRIORITY_HEX)
            .map((p) => ({
                key: p,
                label: formatLabel(p),
                count: tasks.filter((t) => t.priority === p).length,
                color: PRIORITY_HEX[p],
            }))
            .filter((b) => b.count > 0);
    }

    if (groupBy === 'assignee') {
        const map = new Map();
        tasks.forEach((t) => {
            const key = t.assigned_to || 'unassigned';
            const label = t.assignee?.name || 'Unassigned';
            const entry = map.get(key) || { key: String(key), label, count: 0 };
            entry.count++;
            map.set(key, entry);
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
        const unsectioned = tasks.filter((t) => !t.section_id).length;
        if (unsectioned > 0) {
            buckets.push({ key: 'none', label: 'No section', count: unsectioned, color: 'var(--viz-other)' });
        }
        sections.forEach((s, i) => {
            const count = tasks.filter((t) => t.section_id === s.id).length;
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
            const count = tasks.filter((t) =>
                (t.custom_field_values || []).some(
                    (v) => v.custom_field_id === field.id && v.value_option_id === opt.id
                )
            ).length;
            if (count > 0) {
                buckets.push({
                    key: String(opt.id),
                    label: opt.label,
                    count,
                    color: opt.color || `var(${SERIES_VARS[i % SERIES_VARS.length]})`,
                });
            }
        });
        const noValue = tasks.filter((t) =>
            !(t.custom_field_values || []).some(
                (v) => v.custom_field_id === field.id && v.value_option_id
            )
        ).length;
        if (noValue > 0) {
            buckets.push({ key: 'none', label: 'No value', count: noValue, color: 'var(--viz-other)' });
        }
        return buckets;
    }

    return [];
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
    const accessor = {
        completed_over_time: (t) => (t.status === 'done' ? t.completed_at : null),
        created_over_time: (t) => t.created_at,
        due_over_time: (t) => t.due_date,
    }[chart.group_by];
    if (!accessor) return [];

    const dates = allTasks
        .map((t) => accessor(t))
        .filter(Boolean)
        .map((d) => new Date(d))
        .filter((d) => !isNaN(d));
    if (dates.length === 0) return [];

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
        dates.forEach((d) => {
            const i = (d.getFullYear() - min.getFullYear()) * 12 + (d.getMonth() - min.getMonth());
            if (buckets[i]) buckets[i].count++;
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
        dates.forEach((d) => {
            const i = Math.floor((startOfWeek(d) - start) / (7 * DAY_MS));
            if (buckets[i]) buckets[i].count++;
        });
    }
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

function BarChart({ buckets }) {
    const max = Math.max(...buckets.map((b) => b.count), 1);
    return (
        <div className="space-y-2.5">
            {buckets.map((b) => (
                <div key={b.key} className="flex items-center gap-3">
                    <span
                        className="w-28 shrink-0 text-sm text-gray-600 dark:text-gray-300 truncate text-right"
                        title={b.label}
                    >
                        {b.label}
                    </span>
                    <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700/50 rounded-r overflow-hidden">
                        <div
                            className="h-4 rounded-r transition-all duration-500"
                            style={{ width: `${(b.count / max) * 100}%`, backgroundColor: b.color }}
                        />
                    </div>
                    <span className="w-8 shrink-0 text-sm font-medium text-gray-900 dark:text-white tabular-nums">
                        {b.count}
                    </span>
                </div>
            ))}
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

function DonutChart({ buckets }) {
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
                                <title>{`${s.label}: ${s.count} (${Math.round((s.count / total) * 100)}%)`}</title>
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
                            <span className="text-sm font-medium text-gray-900 dark:text-white tabular-nums">{b.count}</span>
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

function LineChart({ buckets }) {
    const [hovered, setHovered] = useState(null);
    const svgRef = useRef(null);

    const W = 600, H = 230;
    const M = { top: 14, right: 16, bottom: 30, left: 36 };
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;

    const yMax = niceMax(Math.max(...buckets.map((b) => b.count), 1));
    const x = (i) => M.left + (buckets.length === 1 ? plotW / 2 : (i / (buckets.length - 1)) * plotW);
    const y = (v) => M.top + plotH - (v / yMax) * plotH;

    const linePath = buckets.map((b, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(b.count)}`).join(' ');
    const areaPath = `${linePath} L ${x(buckets.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`;

    const yTicks = [0, yMax / 4, yMax / 2, (3 * yMax) / 4, yMax].map((v) => Math.round(v));
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
                    {buckets[buckets.length - 1].count}
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
                    <span className="font-medium">{buckets[hovered].count}</span> · {buckets[hovered].label}
                </div>
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

    const data = useMemo(() => {
        if (chart.chart_type === 'line') return computeTimeData(chart, allTasks);
        const buckets = computeCategoryData(chart, allTasks, sections, customFields);
        return foldBuckets(buckets, chart.chart_type === 'donut' ? 8 : 12);
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
                <BarChart buckets={data} />
            ) : chart.chart_type === 'donut' ? (
                <DonutChart buckets={data} />
            ) : (
                <LineChart buckets={data} />
            )}
        </div>
    );
}

/* ----------------------------- Add/edit modal ----------------------------- */

function ChartFormModal({ isOpen, onClose, onSave, chart, customFields, saving, error }) {
    const selectFields = customFields.filter((f) => f.type === 'single_select');

    const [form, setForm] = useState({ title: '', chart_type: 'bar', group_by: 'status', custom_field_id: '', scope: 'all' });

    useEffect(() => {
        if (!isOpen) return;
        setForm(chart ? {
            title: chart.title,
            chart_type: chart.chart_type,
            group_by: chart.group_by,
            custom_field_id: chart.config?.custom_field_id || '',
            scope: chart.config?.scope || 'all',
        } : { title: '', chart_type: 'bar', group_by: 'status', custom_field_id: '', scope: 'all' });
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

    const canSave = form.title.trim().length > 0
        && (form.group_by !== 'custom_field' || form.custom_field_id);

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
