import { Link } from '@inertiajs/react';
import Avatar from '../../../Components/Avatar';
import CompletionRateRing from './CompletionRateRing';

export default function OrgUnitCard({ unit, href, stats = [] }) {
    const head = unit.head || unit.leader;

    return (
        <Link
            href={href}
            className="block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-md transition-all group"
        >
            <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 group-hover:text-primary-600 dark:group-hover:text-primary-400 truncate">
                        {unit.name}
                    </h3>
                    {head && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                            <Avatar name={head.name} size="xs" />
                            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{head.name}</span>
                        </div>
                    )}
                </div>
                <CompletionRateRing rate={unit.completion_rate ?? 0} size={44} />
            </div>

            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                {stats.map((stat) => (
                    <div key={stat.label} className="flex items-center gap-1">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">{stat.value}</span>
                        <span>{stat.label}</span>
                    </div>
                ))}
            </div>

            <div className="flex items-center justify-end mt-3">
                <svg className="h-4 w-4 text-gray-400 group-hover:text-primary-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
            </div>
        </Link>
    );
}
