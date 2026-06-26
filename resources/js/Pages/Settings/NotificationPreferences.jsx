import { useForm, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Button from '../../Components/Button';

const NOTIFICATION_GROUPS = [
    {
        label: 'Task Assignments',
        items: [
            { key: 'email_task_assigned', label: 'Task assigned to me', description: 'Get notified when someone assigns a task to you' },
        ],
    },
    {
        label: 'Due Dates',
        items: [
            { key: 'email_task_due_soon', label: 'Task due soon', description: 'Reminder when a task is due tomorrow' },
            { key: 'email_task_overdue', label: 'Task overdue', description: 'Alert when a task passes its due date' },
            { key: 'email_task_escalated', label: 'Escalated overdue tasks', description: 'Notifications when overdue tasks are escalated up the org hierarchy' },
        ],
    },
    {
        label: 'Comments',
        items: [
            { key: 'email_task_comment', label: 'Comment on my task', description: 'When someone comments on a task assigned to you' },
            { key: 'email_task_mention', label: 'Mentioned in comment', description: 'When someone @mentions you in a comment' },
            { key: 'email_comment_deleted', label: 'Comment deleted', description: 'When a comment mentioning you is deleted' },
        ],
    },
];

function ToggleSwitch({ checked, onChange }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
                checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
            }`}
        >
            <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    checked ? 'translate-x-5' : 'translate-x-0'
                }`}
            />
        </button>
    );
}

export default function NotificationPreferences() {
    const { preferences } = usePage().props;

    const { data, setData, put, processing } = useForm({ ...preferences });

    const handleSubmit = (e) => {
        e.preventDefault();
        put('/settings/notifications');
    };

    return (
        <AuthenticatedLayout title="Notification Preferences">
            <div className="max-w-2xl">
                <PageHeader
                    title="Notification Preferences"
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Notification Preferences' },
                    ]}
                />

                <form onSubmit={handleSubmit}>
                    <div className="space-y-6">
                        {NOTIFICATION_GROUPS.map((group) => (
                            <Card key={group.label}>
                                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                                    <div className="flex items-center gap-2">
                                        <EnvelopeIcon />
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{group.label}</h3>
                                    </div>
                                </div>
                                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {group.items.map((item) => (
                                        <div key={item.key} className="flex items-center justify-between px-6 py-4">
                                            <div className="flex-1 pr-4">
                                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.label}</p>
                                                <p className="text-sm text-gray-500 dark:text-gray-400">{item.description}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-400 dark:text-gray-500">Email</span>
                                                <ToggleSwitch
                                                    checked={!!data[item.key]}
                                                    onChange={(val) => setData(item.key, val)}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        ))}

                        <div className="flex justify-end">
                            <Button type="submit" processing={processing} processingText="Saving...">
                                Save Preferences
                            </Button>
                        </div>
                    </div>
                </form>
            </div>
        </AuthenticatedLayout>
    );
}

function EnvelopeIcon() {
    return (
        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
    );
}
