import { Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Pagination from '../../Components/Pagination';
import EmptyState from '../../Components/EmptyState';
import Button from '../../Components/Button';

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
        default:
            return 'New notification';
    }
}

function notificationIcon(type) {
    switch (type) {
        case 'task_assigned':
            return (
                <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                    <svg className="h-4 w-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                </div>
            );
        case 'task_due_soon':
            return (
                <div className="h-8 w-8 rounded-full bg-yellow-100 dark:bg-yellow-900/40 flex items-center justify-center">
                    <svg className="h-4 w-4 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
            );
        case 'task_overdue':
            return (
                <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                    <svg className="h-4 w-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                </div>
            );
        case 'task_comment_mention':
            return (
                <div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
                    <svg className="h-4 w-4 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                </div>
            );
        case 'task_comment':
        case 'subtask_comment':
            return (
                <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                    <svg className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                </div>
            );
        case 'comment_deleted':
            return (
                <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
                    <svg className="h-4 w-4 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </div>
            );
        default:
            return (
                <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                </div>
            );
    }
}

function handleNotificationClick(notification) {
    const data = notification.data;
    const taskUrl = `/projects/${data.project_id}/tasks/${data.task_id}/edit`;

    if (!notification.read_at) {
        router.patch(`/inbox/${notification.id}/read`, {}, {
            preserveScroll: true,
            onSuccess: () => router.visit(taskUrl),
        });
    } else {
        router.visit(taskUrl);
    }
}

function handleMarkAllAsRead() {
    router.post('/inbox/read-all', {}, { preserveScroll: true });
}

export default function Index({ notifications }) {
    const hasUnread = notifications.data?.some(n => !n.read_at);

    return (
        <AuthenticatedLayout title="Inbox">
            <PageHeader
                title="Inbox"
                actions={
                    hasUnread && (
                        <Button variant="secondary" size="sm" onClick={handleMarkAllAsRead}>
                            Mark all as read
                        </Button>
                    )
                }
            />

            <Card padding={false}>
                {notifications.data?.length > 0 ? (
                    <>
                        <div className="divide-y divide-gray-100 dark:divide-gray-700">
                            {notifications.data.map((notification) => (
                                <button
                                    key={notification.id}
                                    onClick={() => handleNotificationClick(notification)}
                                    className={`w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                                        !notification.read_at ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                                    }`}
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
                                    {!notification.read_at && (
                                        <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0" />
                                    )}
                                </button>
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
                        title="No notifications"
                        description="You're all caught up! Notifications will appear here when tasks are assigned to you or deadlines approach."
                    />
                )}
            </Card>
        </AuthenticatedLayout>
    );
}
