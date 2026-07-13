import { Head, usePage } from '@inertiajs/react';
import ThemeToggle from '../Components/ThemeToggle';

export default function GuestLayout({ children, title }) {
    const { settings } = usePage().props;
    const appName = settings?.app_name || 'WMT';
    const logoUrl = settings?.logo_path ? `/storage/${settings.logo_path}` : null;

    return (
        <>
            <Head title={title} />
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 relative">
                <div className="absolute top-4 right-4">
                    <ThemeToggle className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" />
                </div>
                <div className="w-full max-w-md px-4">
                    <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 px-8 py-8">
                        <div className="text-center mb-8">
                            {logoUrl && (
                                <img src={logoUrl} alt={`${appName} logo`} className="mx-auto h-12 w-auto mb-3 object-contain" />
                            )}
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                                {appName}
                            </h1>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Workload Management Tool</p>
                        </div>
                        {children}
                    </div>
                </div>
            </div>
        </>
    );
}
