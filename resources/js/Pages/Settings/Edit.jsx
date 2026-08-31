import { useState } from 'react';
import { useForm, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Input from '../../Components/Input';
import Button from '../../Components/Button';

const COLOR_LABELS = {
    blue: 'Blue',
    indigo: 'Indigo',
    violet: 'Violet',
    teal: 'Teal',
    green: 'Green',
    red: 'Red',
    orange: 'Orange',
    rose: 'Rose',
};

export default function Edit() {
    const { settings, colorPalettes, notificationChannelDefaults } = usePage().props;

    const [logoPreview, setLogoPreview] = useState(settings.logo_path ? `/storage/${settings.logo_path}` : null);
    const [faviconPreview, setFaviconPreview] = useState(settings.favicon_path ? `/storage/${settings.favicon_path}` : null);

    const { data, setData, post, processing, errors } = useForm({
        _method: 'PUT',
        app_name: settings.app_name || '',
        primary_color: settings.primary_color || 'blue',
        logo: null,
        favicon: null,
        remove_logo: false,
        remove_favicon: false,
        max_upload_size: settings.max_upload_size || 10,
        attachment_retention_enabled: settings.attachment_retention_enabled ?? false,
        attachment_retention_days: settings.attachment_retention_days || 90,
        task_reminders_enabled: settings.task_reminders_enabled ?? true,
        task_reminder_days: settings.task_reminder_days || [7, 3, 1],
        escalation_enabled: settings.escalation_enabled ?? true,
        escalation_tiers: settings.escalation_tiers || [
            { days: 1, enabled: true },
            { days: 3, enabled: true },
            { days: 7, enabled: true },
            { days: 14, enabled: true },
        ],
        notification_channels: settings.notification_channels || notificationChannelDefaults || {},
    });

    const ESCALATION_LABELS = [
        'Assignee Reminder',
        'Supervisor, Manager & Project Owner',
        'Division Head',
        'Executives',
    ];

    const NOTIFICATION_CHANNEL_LABELS = {
        email_task_assigned: 'Task Assigned',
        email_task_due_soon: 'Task Due Soon (tomorrow)',
        email_task_due_reminder: 'Task Due Reminder (configurable days)',
        email_task_overdue: 'Task Overdue',
        email_task_comment: 'New Comment on Task',
        email_task_mention: '@Mention in Comment',
        email_comment_deleted: 'Comment Deleted',
        email_task_escalated: 'Task Escalated',
    };

    const NOTIFICATION_CHANNEL_GROUPS = [
        { label: 'Task Assignments', keys: ['email_task_assigned'] },
        { label: 'Due Dates', keys: ['email_task_due_soon', 'email_task_due_reminder', 'email_task_overdue', 'email_task_escalated'] },
        { label: 'Comments', keys: ['email_task_comment', 'email_task_mention', 'email_comment_deleted'] },
    ];

    const toggleNotificationChannel = (key) => {
        setData('notification_channels', {
            ...data.notification_channels,
            [key]: !data.notification_channels[key],
        });
    };

    const updateEscalationTier = (index, field, value) => {
        const updated = data.escalation_tiers.map((tier, i) =>
            i === index ? { ...tier, [field]: value } : tier
        );
        setData('escalation_tiers', updated);
    };

    const PRESET_DAYS = [1, 2, 3, 5, 7, 14, 21, 30];

    const toggleReminderDay = (day) => {
        const current = data.task_reminder_days || [];
        const updated = current.includes(day)
            ? current.filter(d => d !== day)
            : [...current, day].sort((a, b) => a - b);
        setData('task_reminder_days', updated);
    };

    const applyColorPalette = (colorKey) => {
        const palette = colorPalettes[colorKey];
        if (!palette) return;
        const root = document.documentElement;
        Object.entries(palette).forEach(([shade, value]) => {
            root.style.setProperty(`--primary-${shade}`, value);
        });
    };

    const handleBrandingFile = (key, file, setPreview) => {
        if (!file) return;
        setData((prev) => ({ ...prev, [key]: file, [`remove_${key}`]: false }));
        setPreview(URL.createObjectURL(file));
    };

    const removeBrandingFile = (key, setPreview) => {
        setData((prev) => ({ ...prev, [key]: null, [`remove_${key}`]: true }));
        setPreview(null);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        post('/settings', {
            forceFormData: true,
            onSuccess: () => applyColorPalette(data.primary_color),
        });
    };

    return (
        <AuthenticatedLayout title="Settings">
            <div className="max-w-2xl">
                <PageHeader
                    title="Settings"
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Settings' },
                    ]}
                />

                <Card>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <Input
                            label="Application Name"
                            id="app_name"
                            value={data.app_name}
                            onChange={(e) => setData('app_name', e.target.value)}
                            error={errors.app_name}
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                                    Logo
                                </label>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                    Shown next to the application name in the sidebar and login page.
                                </p>
                                {logoPreview && (
                                    <div className="flex items-center gap-3 mb-3">
                                        <img src={logoPreview} alt="Logo preview" className="h-12 w-12 rounded-lg object-contain border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-1" />
                                        <button
                                            type="button"
                                            onClick={() => removeBrandingFile('logo', setLogoPreview)}
                                            className="text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept=".jpg,.jpeg,.png,.gif,.webp,.svg"
                                    onChange={(e) => handleBrandingFile('logo', e.target.files[0], setLogoPreview)}
                                    className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 dark:file:bg-primary-900/30 dark:file:text-primary-300 hover:file:bg-primary-100 file:cursor-pointer"
                                />
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">PNG, JPG, SVG, WebP or GIF — max 2 MB.</p>
                                {errors.logo && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.logo}</p>}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                                    Favicon
                                </label>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                    Shown in the browser tab. Square images work best.
                                </p>
                                {faviconPreview && (
                                    <div className="flex items-center gap-3 mb-3">
                                        <img src={faviconPreview} alt="Favicon preview" className="h-8 w-8 object-contain border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-900 p-0.5" />
                                        <button
                                            type="button"
                                            onClick={() => removeBrandingFile('favicon', setFaviconPreview)}
                                            className="text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept=".ico,.png,.svg"
                                    onChange={(e) => handleBrandingFile('favicon', e.target.files[0], setFaviconPreview)}
                                    className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 dark:file:bg-primary-900/30 dark:file:text-primary-300 hover:file:bg-primary-100 file:cursor-pointer"
                                />
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">ICO, PNG or SVG — max 1 MB.</p>
                                {errors.favicon && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.favicon}</p>}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                                Primary Color
                            </label>
                            <div className="grid grid-cols-4 gap-3">
                                {Object.entries(colorPalettes).map(([key, palette]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setData('primary_color', key)}
                                        className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                                            data.primary_color === key
                                                ? 'border-gray-900 dark:border-white shadow-sm'
                                                : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                                        }`}
                                    >
                                        <div
                                            className="w-10 h-10 rounded-full shadow-sm"
                                            style={{ backgroundColor: palette['500'] }}
                                        />
                                        <span className={`text-xs font-medium ${
                                            data.primary_color === key
                                                ? 'text-gray-900 dark:text-white'
                                                : 'text-gray-500 dark:text-gray-400'
                                        }`}>
                                            {COLOR_LABELS[key]}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            {errors.primary_color && (
                                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.primary_color}</p>
                            )}
                        </div>

                        <div>
                            <Input
                                label="Max Upload Size (MB)"
                                id="max_upload_size"
                                type="number"
                                min={1}
                                max={100}
                                value={data.max_upload_size}
                                onChange={(e) => setData('max_upload_size', parseInt(e.target.value) || 10)}
                                error={errors.max_upload_size}
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Maximum file size for comment attachments (1-100 MB).
                            </p>
                        </div>

                        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                                        Attachment Retention
                                    </label>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Automatically delete attachments older than a specified number of days.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={data.attachment_retention_enabled}
                                    onClick={() => setData('attachment_retention_enabled', !data.attachment_retention_enabled)}
                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
                                        data.attachment_retention_enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                            data.attachment_retention_enabled ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>

                            {data.attachment_retention_enabled && (
                                <div>
                                    <Input
                                        label="Retention Period (days)"
                                        id="attachment_retention_days"
                                        type="number"
                                        min={1}
                                        max={365}
                                        value={data.attachment_retention_days}
                                        onChange={(e) => setData('attachment_retention_days', parseInt(e.target.value) || 90)}
                                        error={errors.attachment_retention_days}
                                    />
                                    <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                                        Attachments older than {data.attachment_retention_days} {data.attachment_retention_days === 1 ? 'day' : 'days'} will be permanently deleted. This runs daily at 3:00 AM.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                                        Task Due Date Reminders
                                    </label>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Send notifications to assignees before their tasks are due.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={data.task_reminders_enabled}
                                    onClick={() => setData('task_reminders_enabled', !data.task_reminders_enabled)}
                                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
                                        data.task_reminders_enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                            data.task_reminders_enabled ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>

                            {data.task_reminders_enabled && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Remind before (days)
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {PRESET_DAYS.map((day) => {
                                            const selected = (data.task_reminder_days || []).includes(day);
                                            return (
                                                <button
                                                    key={day}
                                                    type="button"
                                                    onClick={() => toggleReminderDay(day)}
                                                    className={`px-3 py-1.5 text-sm font-medium rounded-lg border-2 transition-all ${
                                                        selected
                                                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-400'
                                                            : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'
                                                    }`}
                                                >
                                                    {day} {day === 1 ? 'day' : 'days'}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                        Select when to send reminders. Notifications are sent daily at 8:00 AM.
                                    </p>
                                    {errors.task_reminder_days && (
                                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.task_reminder_days}</p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                                        Overdue Task Escalation
                                    </label>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Automatically escalate overdue tasks up the org hierarchy.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={data.escalation_enabled}
                                    onClick={() => setData('escalation_enabled', !data.escalation_enabled)}
                                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
                                        data.escalation_enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                            data.escalation_enabled ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>

                            {data.escalation_enabled && (
                                <div className="space-y-3">
                                    {data.escalation_tiers.map((tier, index) => (
                                        <div
                                            key={index}
                                            className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${
                                                tier.enabled
                                                    ? 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'
                                                    : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60'
                                            }`}
                                        >
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={tier.enabled}
                                                onClick={() => updateEscalationTier(index, 'enabled', !tier.enabled)}
                                                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                                    tier.enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                                                }`}
                                            >
                                                <span
                                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                        tier.enabled ? 'translate-x-4' : 'translate-x-0'
                                                    }`}
                                                />
                                            </button>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                    Level {index + 1}: {ESCALATION_LABELS[index]}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500 dark:text-gray-400">after</span>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={90}
                                                    value={tier.days}
                                                    onChange={(e) => updateEscalationTier(index, 'days', parseInt(e.target.value) || 1)}
                                                    disabled={!tier.enabled}
                                                    className="w-16 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-sm text-center disabled:opacity-50"
                                                />
                                                <span className="text-xs text-gray-500 dark:text-gray-400">{tier.days === 1 ? 'day' : 'days'}</span>
                                            </div>
                                        </div>
                                    ))}
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Configure how many days after a task is overdue each escalation level triggers. Escalation runs daily at 8:00 AM.
                                    </p>
                                    {errors.escalation_tiers && (
                                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.escalation_tiers}</p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                                    Email Notification Channels
                                </label>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Control which email notifications are sent to all users system-wide.
                                </p>
                            </div>

                            <div className="space-y-4">
                                {NOTIFICATION_CHANNEL_GROUPS.map((group) => (
                                    <div key={group.label}>
                                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                                            {group.label}
                                        </p>
                                        <div className="space-y-2">
                                            {group.keys.map((key) => (
                                                <div
                                                    key={key}
                                                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                                                >
                                                    <span className="text-sm text-gray-900 dark:text-gray-100">
                                                        {NOTIFICATION_CHANNEL_LABELS[key]}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        role="switch"
                                                        aria-checked={data.notification_channels[key] ?? false}
                                                        onClick={() => toggleNotificationChannel(key)}
                                                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                                            data.notification_channels[key] ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                                                        }`}
                                                    >
                                                        <span
                                                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                                data.notification_channels[key] ? 'translate-x-4' : 'translate-x-0'
                                                            }`}
                                                        />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {errors.notification_channels && (
                                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.notification_channels}</p>
                            )}
                        </div>

                        <div className="flex justify-end pt-4">
                            <Button type="submit" processing={processing} processingText="Saving...">
                                Save Settings
                            </Button>
                        </div>
                    </form>
                </Card>
            </div>
        </AuthenticatedLayout>
    );
}
