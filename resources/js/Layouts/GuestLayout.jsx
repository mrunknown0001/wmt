import { Head } from '@inertiajs/react';

export default function GuestLayout({ children, title }) {
    return (
        <>
            <Head title={title} />
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="w-full max-w-md">
                    <div className="bg-white shadow-md rounded-lg px-8 py-6">
                        <h1 className="text-2xl font-semibold text-center text-gray-800 mb-6">
                            WMT
                        </h1>
                        {children}
                    </div>
                </div>
            </div>
        </>
    );
}
