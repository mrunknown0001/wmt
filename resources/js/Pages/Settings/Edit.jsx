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
    const { settings, colorPalettes } = usePage().props;

    const { data, setData, put, processing, errors } = useForm({
        app_name: settings.app_name || '',
        primary_color: settings.primary_color || 'blue',
        max_upload_size: settings.max_upload_size || 10,
        task_reminders_enabled: settings.task_reminders_enabled ?? true,
        task_reminder_days: settings.task_reminder_days || [7, 3, 1],
    });

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

    const handleSubmit = (e) => {
        e.preventDefault();
        put('/settings', {
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
