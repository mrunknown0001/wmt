const illustrations = {
    tasks: (
        <svg className="h-24 w-24" viewBox="0 0 120 120" fill="none">
            <rect x="20" y="30" width="80" height="70" rx="8" className="fill-gray-100 dark:fill-gray-700/50" />
            <rect x="30" y="45" width="40" height="4" rx="2" className="fill-gray-300 dark:fill-gray-600" />
            <rect x="30" y="55" width="55" height="4" rx="2" className="fill-gray-200 dark:fill-gray-700" />
            <rect x="30" y="65" width="30" height="4" rx="2" className="fill-gray-200 dark:fill-gray-700" />
            <rect x="30" y="75" width="45" height="4" rx="2" className="fill-gray-200 dark:fill-gray-700" />
            <circle cx="85" cy="35" r="18" className="fill-primary-100 dark:fill-primary-900/40" />
            <path d="M79 35l4 4 8-8" className="stroke-primary-500" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    ),
    projects: (
        <svg className="h-24 w-24" viewBox="0 0 120 120" fill="none">
            <rect x="15" y="35" width="38" height="55" rx="6" className="fill-gray-100 dark:fill-gray-700/50" />
            <rect x="41" y="25" width="38" height="65" rx="6" className="fill-gray-200 dark:fill-gray-700" />
            <rect x="67" y="35" width="38" height="55" rx="6" className="fill-gray-100 dark:fill-gray-700/50" />
            <rect x="49" y="38" width="22" height="3" rx="1.5" className="fill-primary-400 dark:fill-primary-500" />
            <rect x="49" y="45" width="16" height="3" rx="1.5" className="fill-gray-300 dark:fill-gray-600" />
            <rect x="49" y="52" width="20" height="3" rx="1.5" className="fill-gray-300 dark:fill-gray-600" />
            <circle cx="95" cy="30" r="14" className="fill-primary-100 dark:fill-primary-900/40" />
            <path d="M91 30h8m-4-4v8" className="stroke-primary-500" strokeWidth="2" strokeLinecap="round" />
        </svg>
    ),
    search: (
        <svg className="h-24 w-24" viewBox="0 0 120 120" fill="none">
            <circle cx="52" cy="52" r="28" className="fill-gray-100 dark:fill-gray-700/50" />
            <circle cx="52" cy="52" r="28" className="stroke-gray-300 dark:stroke-gray-600" strokeWidth="3" />
            <line x1="72" y1="72" x2="95" y2="95" className="stroke-gray-300 dark:stroke-gray-600" strokeWidth="4" strokeLinecap="round" />
            <path d="M42 52h20m-10-10v20" className="stroke-primary-400 dark:stroke-primary-500" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
        </svg>
    ),
    default: (
        <svg className="h-24 w-24" viewBox="0 0 120 120" fill="none">
            <rect x="25" y="20" width="70" height="80" rx="8" className="fill-gray-100 dark:fill-gray-700/50" />
            <rect x="35" y="35" width="50" height="4" rx="2" className="fill-gray-300 dark:fill-gray-600" />
            <rect x="35" y="45" width="35" height="4" rx="2" className="fill-gray-200 dark:fill-gray-700" />
            <rect x="35" y="55" width="42" height="4" rx="2" className="fill-gray-200 dark:fill-gray-700" />
            <rect x="35" y="65" width="28" height="4" rx="2" className="fill-gray-200 dark:fill-gray-700" />
            <circle cx="60" cy="82" r="6" className="fill-primary-100 dark:fill-primary-900/40" />
            <circle cx="60" cy="82" r="2" className="fill-primary-400 dark:fill-primary-500" />
        </svg>
    ),
};

export default function EmptyState({ icon, illustration, title, description, action }) {
    return (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            {icon && <div className="text-gray-400 mb-3">{icon}</div>}
            {!icon && (
                <div className="mb-4">
                    {illustrations[illustration] || illustrations.default}
                </div>
            )}
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</h3>
            {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-xs">{description}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}
