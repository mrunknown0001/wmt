import { Head, Link } from '@inertiajs/react';
import ThemeToggle from '../Components/ThemeToggle';

const STATUS_CONFIG = {
    403: {
        title: 'Access Denied',
        description: "You don't have permission to access this resource. Contact your administrator if you believe this is an error.",
        icon: (
            <svg className="w-20 h-20" fill="none" viewBox="0 0 80 80" stroke="currentColor" strokeWidth="1.5">
                <rect x="20" y="32" width="40" height="32" rx="4" />
                <path d="M28 32V24a12 12 0 0 1 24 0v8" />
                <circle cx="40" cy="48" r="4" fill="currentColor" />
                <line x1="40" y1="52" x2="40" y2="56" strokeWidth="3" strokeLinecap="round" />
            </svg>
        ),
        gradient: 'from-amber-500 to-orange-600',
        bgAccent: 'bg-amber-50 dark:bg-amber-950/30',
        textAccent: 'text-amber-600 dark:text-amber-400',
    },
    404: {
        title: 'Page Not Found',
        description: "The page you're looking for doesn't exist or has been moved. Check the URL or head back to the dashboard.",
        icon: (
            <svg className="w-20 h-20" fill="none" viewBox="0 0 80 80" stroke="currentColor" strokeWidth="1.5">
                <circle cx="34" cy="34" r="18" />
                <line x1="47" y1="47" x2="62" y2="62" strokeWidth="3" strokeLinecap="round" />
                <line x1="28" y1="30" x2="40" y2="30" strokeLinecap="round" />
                <line x1="28" y1="36" x2="36" y2="36" strokeLinecap="round" />
            </svg>
        ),
        gradient: 'from-blue-500 to-indigo-600',
        bgAccent: 'bg-blue-50 dark:bg-blue-950/30',
        textAccent: 'text-blue-600 dark:text-blue-400',
    },
    419: {
        title: 'Page Expired',
        description: 'Your session has expired. Please refresh the page and try again.',
        icon: (
            <svg className="w-20 h-20" fill="none" viewBox="0 0 80 80" stroke="currentColor" strokeWidth="1.5">
                <circle cx="40" cy="40" r="24" />
                <polyline points="40,24 40,40 52,46" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M16 16 L24 24" strokeWidth="2" strokeLinecap="round" />
            </svg>
        ),
        gradient: 'from-violet-500 to-purple-600',
        bgAccent: 'bg-violet-50 dark:bg-violet-950/30',
        textAccent: 'text-violet-600 dark:text-violet-400',
    },
    429: {
        title: 'Too Many Requests',
        description: "You've sent too many requests in a short period. Please wait a moment before trying again.",
        icon: (
            <svg className="w-20 h-20" fill="none" viewBox="0 0 80 80" stroke="currentColor" strokeWidth="1.5">
                <path d="M40 16 L40 28" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M40 52 L40 64" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="40" cy="40" r="6" fill="currentColor" />
                <path d="M20 28 Q40 20 60 28" strokeWidth="2" />
                <path d="M20 52 Q40 60 60 52" strokeWidth="2" />
                <path d="M16 40 L28 40" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M52 40 L64 40" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
        ),
        gradient: 'from-rose-500 to-red-600',
        bgAccent: 'bg-rose-50 dark:bg-rose-950/30',
        textAccent: 'text-rose-600 dark:text-rose-400',
    },
    500: {
        title: 'Server Error',
        description: 'Something went wrong on our end. Please try again later or contact support if the issue persists.',
        icon: (
            <svg className="w-20 h-20" fill="none" viewBox="0 0 80 80" stroke="currentColor" strokeWidth="1.5">
                <polygon points="40,12 68,64 12,64" strokeWidth="2" strokeLinejoin="round" />
                <line x1="40" y1="32" x2="40" y2="48" strokeWidth="3" strokeLinecap="round" />
                <circle cx="40" cy="56" r="2.5" fill="currentColor" />
            </svg>
        ),
        gradient: 'from-red-500 to-rose-600',
        bgAccent: 'bg-red-50 dark:bg-red-950/30',
        textAccent: 'text-red-600 dark:text-red-400',
    },
    503: {
        title: 'Service Unavailable',
        description: "We're performing maintenance. The application will be back shortly.",
        icon: (
            <svg className="w-20 h-20" fill="none" viewBox="0 0 80 80" stroke="currentColor" strokeWidth="1.5">
                <path d="M40 16 C40 16 48 24 48 36 C48 48 40 48 40 48 C40 48 32 48 32 36 C32 24 40 16 40 16Z" strokeWidth="2" />
                <path d="M36 48 L32 64 L40 60 L48 64 L44 48" strokeWidth="2" strokeLinejoin="round" />
                <circle cx="26" cy="28" r="3" strokeWidth="1.5" />
                <circle cx="54" cy="28" r="3" strokeWidth="1.5" />
                <path d="M22 32 L18 36" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M58 32 L62 36" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
        ),
        gradient: 'from-teal-500 to-emerald-600',
        bgAccent: 'bg-teal-50 dark:bg-teal-950/30',
        textAccent: 'text-teal-600 dark:text-teal-400',
    },
};

const DEFAULT_CONFIG = {
    title: 'Something Went Wrong',
    description: 'An unexpected error occurred. Please try again.',
    icon: (
        <svg className="w-20 h-20" fill="none" viewBox="0 0 80 80" stroke="currentColor" strokeWidth="1.5">
            <circle cx="40" cy="40" r="24" strokeWidth="2" />
            <line x1="30" y1="30" x2="50" y2="50" strokeWidth="3" strokeLinecap="round" />
            <line x1="50" y1="30" x2="30" y2="50" strokeWidth="3" strokeLinecap="round" />
        </svg>
    ),
    gradient: 'from-gray-500 to-gray-600',
    bgAccent: 'bg-gray-50 dark:bg-gray-800',
    textAccent: 'text-gray-600 dark:text-gray-400',
};

export default function Error({ status }) {
    const config = STATUS_CONFIG[status] || DEFAULT_CONFIG;

    return (
        <>
            <Head title={`${status} — ${config.title}`} />
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 relative overflow-hidden">
                {/* Background decoration */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className={`absolute -top-40 -right-40 w-96 h-96 rounded-full bg-gradient-to-br ${config.gradient} opacity-[0.07] blur-3xl`} />
                    <div className={`absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-gradient-to-tr ${config.gradient} opacity-[0.05] blur-3xl`} />
                </div>

                {/* Theme toggle */}
                <div className="absolute top-4 right-4 z-10">
                    <ThemeToggle className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" />
                </div>

                <div className="relative z-10 text-center px-6 max-w-lg">
                    {/* Status code */}
                    <div className={`inline-flex items-center justify-center w-32 h-32 rounded-2xl ${config.bgAccent} mb-8`}>
                        <div className={config.textAccent}>
                            {config.icon}
                        </div>
                    </div>

                    {/* Error code badge */}
                    <div className="mb-4">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase bg-gradient-to-r ${config.gradient} text-white`}>
                            Error {status}
                        </span>
                    </div>

                    {/* Title */}
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">
                        {config.title}
                    </h1>

                    {/* Description */}
                    <p className="text-gray-500 dark:text-gray-400 mb-8 leading-relaxed">
                        {config.description}
                    </p>

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link
                            href="/"
                            className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r ${config.gradient} hover:opacity-90 transition-opacity shadow-lg`}
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
                            </svg>
                            Go to Dashboard
                        </Link>
                        <button
                            onClick={() => window.history.back()}
                            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Go Back
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
