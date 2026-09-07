import { useState } from 'react';
import { Link } from '@inertiajs/react';
import Tooltip from './Tooltip';

/**
 * Unread notifications from one project, gathered under it.
 *
 * Sixty-three near-identical lines about one project is not sixty-three things
 * to read, it is one thing with sixty-three parts — and spread over five pages
 * of an inbox it buries everything else. Gathered, the project is one line, the
 * work is one click, and the rest of the inbox is legible again.
 *
 * Four entries are shown because four is enough to recognise what the pile is
 * without becoming the pile again.
 */
export default function NotificationGroup({
    group,
    collapsedEntries = 4,
    renderMessage,
    renderIcon,
    timeAgo,
    onEntryClick,
    onMarkAllRead,
    onArchiveAll,
}) {
    const [expanded, setExpanded] = useState(false);

    const entries = group.entries || [];
    const shown = expanded ? entries : entries.slice(0, collapsedEntries);
    const hidden = entries.length - shown.length;

    return (
        <div className="bg-blue-50/50 dark:bg-blue-900/10">
            {/* The heading: whose pile this is, how big, and the two ways to
                deal with the whole of it. */}
            <div className="flex items-center gap-3 px-6 py-3 border-b border-blue-100 dark:border-blue-900/40">
                <div className="h-8 w-8 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center shrink-0">
                    <svg className="h-4 w-4 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                </div>

                <div className="flex-1 min-w-0">
                    <Link
                        href={`/projects/${group.project_id}`}
                        className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400 truncate block"
                    >
                        {group.project_name}
                    </Link>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {group.unread_count} unread {group.unread_count === 1 ? 'notification' : 'notifications'}
                    </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    <Tooltip content={`Mark all ${group.unread_count} as read`}>
                        <button
                            type="button"
                            onClick={() => onMarkAllRead(group)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-800 transition-colors"
                        >
                            Mark all read
                        </button>
                    </Tooltip>
                    <Tooltip content={`Archive all ${group.unread_count}`}>
                        <button
                            type="button"
                            onClick={() => onArchiveAll(group)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-800 transition-colors"
                        >
                            Archive all
                        </button>
                    </Tooltip>
                </div>
            </div>

            {/* The entries themselves, each still its own notification: clicking
                one opens that task and marks that one read, so the pile shrinks
                as it is worked rather than all at once. */}
            <div className="divide-y divide-blue-100/70 dark:divide-blue-900/30">
                {shown.map((entry) => (
                    <div
                        key={entry.id}
                        onClick={() => onEntryClick(entry)}
                        className="flex items-center gap-3 pl-14 pr-6 py-3 hover:bg-white/70 dark:hover:bg-gray-700/40 transition-colors cursor-pointer"
                    >
                        {renderIcon(entry.data.type)}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {renderMessage(entry.data)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {timeAgo(entry.created_at)}
                            </p>
                        </div>
                        <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0" />
                    </div>
                ))}
            </div>

            {entries.length > collapsedEntries && (
                <div className="pl-14 pr-6 py-2 border-t border-blue-100 dark:border-blue-900/40">
                    <button
                        type="button"
                        onClick={() => setExpanded((prev) => !prev)}
                        className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                    >
                        {expanded ? 'Show less' : `Show ${hidden} more`}
                    </button>
                </div>
            )}
        </div>
    );
}
