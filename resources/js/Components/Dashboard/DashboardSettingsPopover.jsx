import { useRef, useState } from 'react';
import InlinePopover from '../InlinePopover';
import Tooltip from '../Tooltip';
import { apiFetch } from '../../utils';

const WIDGET_LABELS = {
    showTaskStats: 'Task Statistics',
    showProgressBars: 'Project Progress Bars',
    showActivityFeed: 'Activity Feed',
    showCharts: 'Charts',
    showDueToday: 'Due Today / Overdue',
    showQuickActions: 'Quick Actions',
    showTeamWorkload: 'Team Workload',
};

export default function DashboardSettingsPopover({ preferences, onUpdate, canSeeTeamWorkload }) {
    const [isOpen, setIsOpen] = useState(false);
    const anchorRef = useRef(null);

    const handleToggle = async (key) => {
        const updated = { ...preferences, [key]: !preferences[key] };
        onUpdate(updated);
        await apiFetch('/dashboard/preferences', {
            method: 'PATCH',
            body: JSON.stringify({ preferences: { [key]: !preferences[key] } }),
        });
    };

    // No sense offering a switch for a card this person is never shown.
    const entries = Object.entries(WIDGET_LABELS).filter(
        ([key]) => key !== 'showTeamWorkload' || canSeeTeamWorkload
    );

    return (
        <>
            <Tooltip content="Dashboard settings">
            <button
                ref={anchorRef}
                onClick={() => setIsOpen((prev) => !prev)}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            </button>
            </Tooltip>
            <InlinePopover isOpen={isOpen} onClose={() => setIsOpen(false)} anchorRef={anchorRef} className="p-4 w-64">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Dashboard Widgets</p>
                <div className="space-y-2.5">
                    {entries.map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2.5 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={preferences[key] ?? true}
                                onChange={() => handleToggle(key)}
                                className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-blue-600 focus:ring-blue-500/20"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">
                                {label}
                            </span>
                        </label>
                    ))}
                </div>
            </InlinePopover>
        </>
    );
}
