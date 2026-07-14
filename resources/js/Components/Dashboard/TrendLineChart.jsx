import { useRef, useState } from 'react';
import Card from '../Card';

// Series colors validated for CVD separation + contrast (light & dark surfaces)
const SERIES = [
    {
        key: 'created',
        label: 'Created',
        line: 'stroke-blue-500',
        dot: 'fill-blue-500',
        swatch: 'bg-blue-500',
    },
    {
        key: 'completed',
        label: 'Completed',
        line: 'stroke-emerald-500 dark:stroke-emerald-600',
        dot: 'fill-emerald-500 dark:fill-emerald-600',
        swatch: 'bg-emerald-500 dark:bg-emerald-600',
    },
];

const W = 600;
const H = 220;
const PAD = { top: 16, right: 52, bottom: 26, left: 36 };

function niceStep(rawStep) {
    const magnitude = 10 ** Math.floor(Math.log10(Math.max(rawStep, 1)));
    for (const m of [1, 2, 2.5, 5, 10]) {
        if (m * magnitude >= rawStep) return m * magnitude;
    }
    return 10 * magnitude;
}

export default function TrendLineChart({ data, title = 'Task Trend' }) {
    const svgRef = useRef(null);
    const [hovered, setHovered] = useState(null);

    const points = data || [];
    const total = points.reduce((sum, p) => sum + p.created + p.completed, 0);

    if (points.length === 0 || total === 0) {
        return (
            <Card>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{title}</h3>
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No data</p>
            </Card>
        );
    }

    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    const maxVal = Math.max(...points.flatMap((p) => [p.created, p.completed]), 1);
    const step = niceStep(maxVal / 4);
    const yMax = step * Math.ceil(maxVal / step);
    const ticks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);

    const x = (i) => PAD.left + (points.length > 1 ? (i * innerW) / (points.length - 1) : innerW / 2);
    const y = (v) => PAD.top + innerH - (v / yMax) * innerH;

    const linePath = (key) => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p[key])}`).join(' ');

    // Direct end labels — nudge apart if the two line ends converge
    const last = points[points.length - 1];
    let endYs = SERIES.map((s) => y(last[s.key]));
    if (Math.abs(endYs[0] - endYs[1]) < 14) {
        const mid = (endYs[0] + endYs[1]) / 2;
        endYs = endYs[0] <= endYs[1] ? [mid - 7, mid + 7] : [mid + 7, mid - 7];
    }

    const handleMouseMove = (e) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const svgX = ((e.clientX - rect.left) / rect.width) * W;
        const ratio = Math.min(Math.max((svgX - PAD.left) / innerW, 0), 1);
        setHovered(Math.round(ratio * (points.length - 1)));
    };

    const hoveredPoint = hovered !== null ? points[hovered] : null;

    return (
        <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
                <div className="flex items-center gap-4">
                    {SERIES.map((s) => (
                        <div key={s.key} className="flex items-center gap-1.5">
                            <span className={`h-2.5 w-2.5 rounded-full ${s.swatch}`} />
                            <span className="text-xs text-gray-600 dark:text-gray-400">{s.label}</span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="relative">
                <svg
                    ref={svgRef}
                    viewBox={`0 0 ${W} ${H}`}
                    className="w-full h-auto"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => setHovered(null)}
                >
                    {/* Gridlines + y ticks */}
                    {ticks.map((t) => (
                        <g key={t}>
                            <line
                                x1={PAD.left}
                                x2={W - PAD.right}
                                y1={y(t)}
                                y2={y(t)}
                                strokeWidth={1}
                                className="stroke-gray-100 dark:stroke-gray-700"
                            />
                            <text
                                x={PAD.left - 8}
                                y={y(t) + 3}
                                textAnchor="end"
                                fontSize="10"
                                className="fill-gray-400 dark:fill-gray-500"
                                style={{ fontVariantNumeric: 'tabular-nums' }}
                            >
                                {t.toLocaleString()}
                            </text>
                        </g>
                    ))}

                    {/* X labels */}
                    {points.map((p, i) => (
                        <text
                            key={p.label}
                            x={x(i)}
                            y={H - 6}
                            textAnchor="middle"
                            fontSize="10"
                            className="fill-gray-400 dark:fill-gray-500"
                        >
                            {p.label}
                        </text>
                    ))}

                    {/* Crosshair */}
                    {hovered !== null && (
                        <line
                            x1={x(hovered)}
                            x2={x(hovered)}
                            y1={PAD.top}
                            y2={PAD.top + innerH}
                            strokeWidth={1}
                            className="stroke-gray-300 dark:stroke-gray-600"
                        />
                    )}

                    {/* Lines */}
                    {SERIES.map((s) => (
                        <path
                            key={s.key}
                            d={linePath(s.key)}
                            fill="none"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={s.line}
                        />
                    ))}

                    {/* Hovered markers — 2px surface ring */}
                    {hovered !== null &&
                        SERIES.map((s) => (
                            <circle
                                key={s.key}
                                cx={x(hovered)}
                                cy={y(points[hovered][s.key])}
                                r={4}
                                strokeWidth={2}
                                className={`${s.dot} stroke-white dark:stroke-gray-800`}
                            />
                        ))}

                    {/* End markers + direct end labels */}
                    {SERIES.map((s, si) => (
                        <g key={s.key}>
                            <circle
                                cx={x(points.length - 1)}
                                cy={y(last[s.key])}
                                r={4}
                                strokeWidth={2}
                                className={`${s.dot} stroke-white dark:stroke-gray-800`}
                            />
                            <text
                                x={x(points.length - 1) + 10}
                                y={endYs[si] + 3.5}
                                fontSize="11"
                                fontWeight="600"
                                className="fill-gray-700 dark:fill-gray-300"
                                style={{ fontVariantNumeric: 'tabular-nums' }}
                            >
                                {last[s.key].toLocaleString()}
                            </text>
                        </g>
                    ))}
                </svg>

                {/* Tooltip */}
                {hoveredPoint && (
                    <div
                        className="pointer-events-none absolute top-2 z-10 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 shadow-lg"
                        style={{
                            left: `${(x(hovered) / W) * 100}%`,
                            transform: `translateX(${hovered > points.length / 2 ? 'calc(-100% - 10px)' : '10px'})`,
                        }}
                    >
                        <p className="text-xs font-medium text-gray-900 dark:text-gray-100 mb-1">
                            Week of {hoveredPoint.label}
                        </p>
                        {SERIES.map((s) => (
                            <div key={s.key} className="flex items-center gap-1.5">
                                <span className={`h-2 w-2 rounded-full ${s.swatch}`} />
                                <span className="text-xs text-gray-500 dark:text-gray-400">{s.label}</span>
                                <span className="text-xs font-medium text-gray-900 dark:text-gray-100 ml-1">
                                    {s.key in hoveredPoint ? hoveredPoint[s.key].toLocaleString() : 0}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Card>
    );
}
