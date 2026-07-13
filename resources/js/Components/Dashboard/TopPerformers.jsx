import Card from '../Card';
import Tooltip from '../Tooltip';

const RANK_STYLES = {
    1: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 ring-1 ring-amber-400/50',
    2: 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300 ring-1 ring-gray-400/50',
    3: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400 ring-1 ring-orange-400/50',
};

function ScoreRing({ score }) {
    const radius = 16;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - Math.min(score, 100) / 100);

    return (
        <div className="relative h-11 w-11 shrink-0">
            <svg className="h-11 w-11 -rotate-90" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r={radius} fill="none" strokeWidth="4" className="stroke-gray-200 dark:stroke-gray-700" />
                <circle
                    cx="20"
                    cy="20"
                    r={radius}
                    fill="none"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    className="stroke-blue-500 transition-all"
                />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-gray-900 dark:text-gray-100">
                {Math.round(score)}
            </span>
        </div>
    );
}

export default function TopPerformers({ title, units, contextKey }) {
    if (!units?.length) return null;

    return (
        <Card padding={false}>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
                    </svg>
                    {title}
                </h2>
                <Tooltip content="Score = 40% completion rate + 30% on-time delivery + 30% tasks completed per member (vs. best unit)">
                    <span className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </span>
                </Tooltip>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {units.map((unit, index) => {
                    const rank = index + 1;
                    return (
                        <div key={unit.id} className="flex items-center gap-3 px-6 py-3">
                            <span
                                className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                                    RANK_STYLES[rank] || 'bg-gray-50 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400'
                                }`}
                            >
                                {rank}
                            </span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{unit.name}</p>
                                    {unit[contextKey] && (
                                        <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{unit[contextKey]}</span>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    {unit.completed_tasks}/{unit.total_tasks} tasks done
                                    <span className="mx-1.5 text-gray-300 dark:text-gray-600">·</span>
                                    {unit.on_time_rate}% on time
                                    <span className="mx-1.5 text-gray-300 dark:text-gray-600">·</span>
                                    {unit.members_count} {unit.members_count === 1 ? 'member' : 'members'}
                                </p>
                            </div>
                            <ScoreRing score={unit.score} />
                        </div>
                    );
                })}
            </div>
            <div className="px-6 py-2.5 border-t border-gray-100 dark:border-gray-700">
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    Ranked by composite score: 40% completion rate, 30% on-time delivery, 30% output per member.
                </p>
            </div>
        </Card>
    );
}
