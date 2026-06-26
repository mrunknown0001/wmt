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
    });

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
