import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, router, usePage } from '@inertiajs/react';
import InlinePopover from './InlinePopover';
import echo from '../echo';
import { apiFetch, timeAgo } from '../utils';

function notificationMessage(data) {
    switch (data.type) {
        case 'task_assigned':
            return <><strong>{data.assigned_by}</strong> assigned you to <strong>{data.task_title}</strong></>;
        case 'task_due_soon':
            return <>Task <strong>{data.task_title}</strong> is due tomorrow</>;
        case 'task_due_reminder':
            return <>Task <strong>{data.task_title}</strong> is due {data.days_before === 1 ? 'tomorrow' : `in ${data.days_before} days`}</>;
        case 'task_overdue':
            return <>Task <strong>{data.task_title}</strong> is overdue</>;
        case 'task_comment_mention':
            return <><strong>{data.mentioned_by}</strong> mentioned you in <strong>{data.task_title}</strong></>;
        case 'task_comment':
            return <><strong>{data.commented_by}</strong> commented on <strong>{data.task_title}</strong></>;
        case 'subtask_comment':
            return <><strong>{data.commented_by}</strong> commented on subtask <strong>{data.task_title}</strong></>;
        case 'comment_deleted':
            return <><strong>{data.deleted_by}</strong> deleted a comment mentioning you in <strong>{data.task_title}</strong></>;
        case 'task_escalated':
            return <>Task <strong>{data.task_title}</strong> escalated — {data.escalation_label}</>;
        default:
            return 'New notification';
    }
}

// Module-level flag to prevent duplicate Echo subscriptions across re-renders
let subscribedUserId = null;

// Shared AudioContext — reused across calls, resumed on first user interaction
let audioCtx = null;

function ensureAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume if suspended (browser autoplay policy)
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

// Resume audio context on first user interaction so future notifications can play
if (typeof window !== 'undefined') {
    const resumeOnInteraction = () => {
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    };
    window.addEventListener('click', resumeOnInteraction, { once: false, passive: true });
    window.addEventListener('keydown', resumeOnInteraction, { once: false, passive: true });
}

// Play a short two-tone chime using Web Audio API (no external file needed)
function playNotificationSound() {
    try {
        const ctx = ensureAudioContext();
        if (ctx.state === 'suspended') return; // Can't play yet — no user interaction
        const playTone = (freq, start, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.15, ctx.currentTime + start);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
            osc.connect(gain).connect(ctx.destination);
            osc.start(ctx.currentTime + start);
            osc.stop(ctx.currentTime + start + duration);
        };
        playTone(880, 0, 0.15);
        playTone(1174.66, 0.12, 0.2);
    } catch { /* audio not available */ }
}

export default function NotificationBell({ onToast }) {
    const { auth, unreadNotificationsCount } = usePage().props;
    const [isOpen, setIsOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(unreadNotificationsCount || 0);
    const [notifications, setNotifications] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const anchorRef = useRef(null);

    // Sync server-provided count on each Inertia page visit
    useEffect(() => {
        setUnreadCount(unreadNotificationsCount || 0);
    }, [unreadNotificationsCount]);

    // Listen for real-time notifications via custom DOM event.
    // This works across Inertia unmount/remount cycles because each mount
    // creates a fresh event listener with the current state setters.
    useEffect(() => {
        const handler = (e) => {
            const notification = e.detail;
            setUnreadCount((prev) => prev + 1);
            setNotifications((prev) => [
                { id: notification.id, data: notification, read_at: null, created_at: new Date().toISOString() },
                ...prev,
            ].slice(0, 5));
            onToast?.(notification);
        };
        window.addEventListener('wmt:notification', handler);
        return () => window.removeEventListener('wmt:notification', handler);
    }, [onToast]);

    // Subscribe to private Echo channel (once per user, persists across navigations).
    // The callback dispatches a DOM event so all mounted NotificationBell instances update.
    useEffect(() => {
        const userId = auth?.user?.id;
        if (!userId || subscribedUserId === userId) return;

        subscribedUserId = userId;
        const channel = echo.private(`App.Models.User.${userId}`);

        channel.notification((notification) => {
            playNotificationSound();
            window.dispatchEvent(new CustomEvent('wmt:notification', { detail: notification }));
        });
    }, [auth?.user?.id]);

    // Lazy-load recent notifications on first dropdown open
    const handleOpen = useCallback(async () => {
        setIsOpen(true);
        if (loaded) return;
        try {
            const res = await apiFetch('/api/notifications/recent');
            const data = await res.json();
            setNotifications(data.notifications);
            setLoaded(true);
        } catch (e) {
            console.error('Failed to load notifications', e);
        }
    }, [loaded]);

    const handleClick = (notification) => {
        const data = notification.data;
        const taskUrl = data.project_id
            ? `/projects/${data.project_id}/tasks/${data.task_id}/edit`
            : `/tasks/${data.task_id}/edit`;

        if (!notification.read_at) {
            // Mark as read optimistically
            setUnreadCount((prev) => Math.max(0, prev - 1));
            setNotifications((prev) =>
                prev.map((n) => n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n)
            );
            apiFetch(`/inbox/${notification.id}/read`, { method: 'PATCH' });
        }

        setIsOpen(false);
        router.visit(taskUrl);
    };

    return (
        <>
            <button
                ref={anchorRef}
                onClick={() => isOpen ? setIsOpen(false) : handleOpen()}
                className="relative p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700/50 transition-colors"
                title="Notifications"
            >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>
            <InlinePopover isOpen={isOpen} onClose={() => setIsOpen(false)} anchorRef={anchorRef} className="w-80">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Notifications</p>
                    {unreadCount > 0 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">{unreadCount} unread</span>
                    )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                    {notifications.length > 0 ? (
                        notifications.map((notification) => (
                            <button
                                key={notification.id}
                                onClick={() => handleClick(notification)}
                                className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                                    !notification.read_at ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                                }`}
                            >
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm ${!notification.read_at ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}>
                                        {notificationMessage(notification.data)}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                        {timeAgo(notification.created_at)}
                                    </p>
                                </div>
                                {!notification.read_at && (
                                    <span className="h-2 w-2 mt-1.5 rounded-full bg-blue-500 shrink-0" />
                                )}
                            </button>
                        ))
                    ) : (
                        <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                            No notifications yet
                        </div>
                    )}
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2">
                    <Link
                        href="/inbox"
                        className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                        onClick={() => setIsOpen(false)}
                    >
                        View all notifications
                    </Link>
                </div>
            </InlinePopover>
        </>
    );
}
