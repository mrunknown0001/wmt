import { usePage } from '@inertiajs/react';
import GuestLayout from '../../Layouts/GuestLayout';

export default function PublicFormSuccess() {
    const { form } = usePage().props;

    return (
        <GuestLayout title="Submitted">
            <div className="w-full max-w-lg mx-auto text-center py-8">
                <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </div>

                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                    Submitted Successfully
                </h1>

                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                    {form.success_message || 'Thank you! Your response has been recorded.'}
                </p>

                <p className="text-xs text-gray-400 dark:text-gray-500">
                    {form.project_name}
                </p>
            </div>
        </GuestLayout>
    );
}
