import { useState, useEffect } from 'react';
import { router } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Pagination from '../../Components/Pagination';
import EmptyState from '../../Components/EmptyState';
import Button from '../../Components/Button';
import Tooltip from '../../Components/Tooltip';

function timeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function notificationMessage(data) {
    switch (data.type) {
        case 'task_assigned':
            return <><strong>{data.assigned_by}</strong> assigned you to <strong>{data.task_title}</strong> in {data.project_name}</>;
        case 'task_due_soon':
            return <>Task <strong>{data.task_title}</strong> in {data.project_name} is due tomorrow</>;
        case 'task_due_reminder':
            return <>Task <strong>{data.task_title}</strong> in {data.project_name} is due {data.days_before === 1 ? 'tomorrow' : `in ${data.days_before} days`}</>;
        case 'task_overdue':
            return <>Task <strong>{data.task_title}</strong> in {data.project_name} is overdue</>;
        case 'task_comment_mention':
            return <><strong>{data.mentioned_by}</strong> mentioned you in a comment on <strong>{data.task_title}</strong> in {data.project_name}</>;
        case 'task_comment':
            return <><strong>{data.commented_by}</strong> commented on <strong>{data.task_title}</strong> in {data.project_name}</>;
        case 'subtask_comment':
            return <><strong>{data.commented_by}</strong> commented on subtask <strong>{data.task_title}</strong> in {data.project_name}</>;
        case 'comment_deleted':
            return <><strong>{data.deleted_by}</strong> deleted a comment mentioning you in <strong>{data.task_title}</strong> in {data.project_name}</>;
        case 'task_escalated':
            return <>Task <strong>{data.task_title}</strong> in {data.project_name} has been escalated ({data.escalation_label}) — assigned to {data.assigned_to_name}</>;
        case 'approval_requested':
            return <>New approval request: <strong>{data.item_title}</strong>{data.approval_project_name ? <> in {data.approval_project_name}</> : null}{data.requester ? <> — submitted by {data.requester}</> : null}</>;
        case 'approval_approved':
            return <>Your request <strong>{data.item_title}</strong>{data.approval_project_name ? <> in {data.approval_project_name}</> : null} was approved</>;
        case 'approval_rejected':
            return <>Your request <strong>{data.item_title}</strong> was rejected{data.decided_by ? <> by {data.decided_by}</> : null}{data.decision_comment ? <> — “{data.decision_comment}”</> : null}</>;
        case 'approval_changes_requested':
            return <>Changes requested on <strong>{data.item_title}</strong>{data.decided_by ? <> by {data.decided_by}</> : null}{data.decision_comment ? <> — “{data.decision_comment}”</> : null}</>;
        case 'approval_automation':
            return <>{data.message || <>Update on <strong>{data.item_title}</strong></>}</>;
        case 'external_webhook':
            return <>{data.message || <>You have an item to review in <strong>{data.platform}</strong></>}</>;
        default:
            return 'New notification';
    }
}

function notificationIcon(type) {
    switch (type) {
        case 'task_assigned':
            return (
                <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                    <svg className="h-4 w-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                </div>
            );
        case 'task_due_soon':
        case 'task_due_reminder':
            return (
                <div className="h-8 w-8 rounded-full bg-yellow-100 dark:bg-yellow-900/40 flex items-center justify-center shrink-0">
                    <svg className="h-4 w-4 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
            );
        case 'task_overdue':
            return (
                <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                    <svg className="h-4 w-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                </div>
            );
        case 'task_comment_mention':
            return (
                <div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0">
                    <svg className="h-4 w-4 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                </div>
            );
        case 'task_comment':
        case 'subtask_comment':
            return (
                <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0">
                    <svg className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                </div>
            );
        case 'comment_deleted':
            return (
                <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0">
                    <svg className="h-4 w-4 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </div>
            );
        case 'task_escalated':
            return (
                <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                    <svg className="h-4 w-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                </div>
            );
        case 'approval_requested':
            return (
                <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                    <svg className="h-4 w-4 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
            );
        // Outcome icons are colour-coded so the requester can read the result of a
        // request from the inbox list without opening it.
        case 'approval_approved':
            return (
                <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0">
                    <svg className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
            );
        case 'approval_rejected':
            return (
                <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                    <svg className="h-4 w-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </div>
            );
        case 'approval_changes_requested':
            return (
                <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0">
                    <svg className="h-4 w-4 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                </div>
            );
        case 'approval_automation':
            return (
                <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                    <svg className="h-4 w-4 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                </div>
            );
        default:
            return (
                <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                    <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                </div>
            );
    }
}

const filterTabs = [
    {
        key: 'inbox',
        label: 'Inbox',
        icon: (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
        ),
    },
    {
        key: 'unread',
        label: 'Unread',
        icon: (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
        ),
    },
    {
        key: 'bookmarked',
        label: 'Bookmarked',
        icon: (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
        ),
    },
    {
        key: 'mentioned',
        label: 'Mentions',
        icon: (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9" />
            </svg>
        ),
    },
    {
        key: 'archived',
        label: 'Archived',
        icon: (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
        ),
    },
];

const emptyMessages = {
    inbox: { title: 'No notifications', description: "You're all caught up! Notifications will appear here when tasks are assigned to you or deadlines approach." },
    unread: { title: 'All caught up', description: 'You have no unread notifications.' },
    bookmarked: { title: 'No bookmarks', description: 'Bookmark important notifications to find them quickly later.' },
    mentioned: { title: 'No mentions', description: "You haven't been mentioned in any comments yet." },
    archived: { title: 'No archived notifications', description: 'Archived notifications will appear here.' },
};

export default function Index({ notifications, filter = 'inbox' }) {
    const [localNotifications, setLocalNotifications] = useState(notifications.data || []);

    useEffect(() => {
        setLocalNotifications(notifications.data || []);
    }, [notifications.data]);

    // Listen for real-time notifications
    useEffect(() => {
        const handler = (e) => {
            if (filter === 'archived') return;
            const notification = e.detail;
            setLocalNotifications((prev) => [
                { id: notification.id, data: notification, read_at: null, bookmarked_at: null, archived_at: null, created_at: new Date().toISOString() },
                ...prev,
            ]);
        };
        window.addEventListener('wmt:notification', handler);
        return () => window.removeEventListener('wmt:notification', handler);
    }, [filter]);

    const hasUnread = localNotifications.some(n => !n.read_at);

    function handleNotificationClick(notification) {
        const data = notification.data;
        // Decision notifications go to the requester, so they belong on the item
        // itself — /my-approvals is the approver's queue and would be empty here.
        const itemTypes = ['approval_automation', 'approval_approved', 'approval_rejected', 'approval_changes_requested'];
        const target = data.type === 'approval_requested'
            ? '/my-approvals'
            : itemTypes.includes(data.type)
                ? `/approval-projects/${data.approval_project_id}/items/${data.approval_item_id}`
                : data.url
                    ? data.url
                    : (data.project_id
                        ? `/projects/${data.project_id}/tasks/${data.task_id}/edit`
                        : `/tasks/${data.task_id}/edit`);

        // Webhook notifications may point at another system — Inertia's router only
        // handles in-app routes, so absolute URLs go through the browser instead.
        const go = /^https?:\/\//i.test(target)
            ? () => window.open(target, '_blank', 'noopener,noreferrer')
            : () => router.visit(target);

        if (!notification.read_at) {
            router.patch(`/inbox/${notification.id}/read`, {}, {
                preserveScroll: true,
                onSuccess: go,
            });
        } else {
            go();
        }
    }

    function handleMarkAllAsRead() {
        router.post('/inbox/read-all', {}, { preserveScroll: true });
    }

    function handleToggleBookmark(e, notification) {
        e.stopPropagation();
        router.patch(`/inbox/${notification.id}/bookmark`, {}, {
            preserveScroll: true,
            preserveState: true,
        });
    }

    function handleArchive(e, notification) {
        e.stopPropagation();
        router.patch(`/inbox/${notification.id}/archive`, {}, {
            preserveScroll: true,
            preserveState: true,
        });
    }

    function handleUnarchive(e, notification) {
        e.stopPropagation();
        router.patch(`/inbox/${notification.id}/unarchive`, {}, {
            preserveScroll: true,
            preserveState: true,
        });
    }

    function switchFilter(key) {
        router.get('/inbox', { filter: key }, { preserveState: false });
    }

    const empty = emptyMessages[filter] || emptyMessages.inbox;

    return (
        <AuthenticatedLayout title="Inbox">
            <PageHeader
                title="Inbox"
                actions={
                    hasUnread && filter !== 'archived' && (
                        <Button variant="secondary" size="sm" onClick={handleMarkAllAsRead}>
                            Mark all as read
                        </Button>
                    )
                }
            />

            {/* Filter tabs */}
            <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
                {filterTabs.map((f) => (
                    <button
                        key={f.key}
                        onClick={() => switchFilter(f.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-150 ${
                            filter === f.key
                                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700/50'
                        }`}
                    >
                        {f.icon}
                        {f.label}
                    </button>
                ))}
            </div>

            <Card padding={false}>
                {localNotifications.length > 0 ? (
                    <>
                        <div className="divide-y divide-gray-100 dark:divide-gray-700">
                            {localNotifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    className={`group flex items-center gap-4 px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer ${
                                        !notification.read_at ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                                    }`}
                                    onClick={() => handleNotificationClick(notification)}
                                >
                                    {notificationIcon(notification.data.type)}
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm ${!notification.read_at ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
                                            {notificationMessage(notification.data)}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                            {timeAgo(notification.created_at)}
                                        </p>
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex items-center gap-1 shrink-0">
                                        {/* Bookmark toggle */}
                                        <Tooltip content={notification.bookmarked_at ? 'Remove bookmark' : 'Bookmark'}>
                                            <button
                                                onClick={(e) => handleToggleBookmark(e, notification)}
                                                className={`p-1.5 rounded-md transition-all duration-150 ${
                                                    notification.bookmarked_at
                                                        ? 'text-amber-500 hover:text-amber-600 dark:text-amber-400'
                                                        : 'text-gray-300 opacity-0 group-hover:opacity-100 hover:text-amber-500 dark:text-gray-600 dark:hover:text-amber-400'
                                                }`}
                                            >
                                                <svg className="h-4 w-4" fill={notification.bookmarked_at ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                                </svg>
                                            </button>
                                        </Tooltip>

                                        {/* Archive / Unarchive */}
                                        {filter === 'archived' ? (
                                            <Tooltip content="Move to inbox">
                                                <button
                                                    onClick={(e) => handleUnarchive(e, notification)}
                                                    className="p-1.5 rounded-md text-gray-300 opacity-0 group-hover:opacity-100 hover:text-blue-500 dark:text-gray-600 dark:hover:text-blue-400 transition-all duration-150"
                                                >
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                                    </svg>
                                                </button>
                                            </Tooltip>
                                        ) : (
                                            <Tooltip content="Archive">
                                                <button
                                                    onClick={(e) => handleArchive(e, notification)}
                                                    className="p-1.5 rounded-md text-gray-300 opacity-0 group-hover:opacity-100 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 transition-all duration-150"
                                                >
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                                    </svg>
                                                </button>
                                            </Tooltip>
                                        )}

                                        {/* Unread dot */}
                                        {!notification.read_at && (
                                            <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0 ml-1" />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <Pagination links={notifications.links} />
                    </>
                ) : (
                    <EmptyState
                        icon={
                            <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                            </svg>
                        }
                        title={empty.title}
                        description={empty.description}
                    />
                )}
            </Card>
        </AuthenticatedLayout>
    );
}
