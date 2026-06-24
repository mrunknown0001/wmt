export default function EmptyState({ icon, title, description, action }) {
    return (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            {icon && <div className="text-gray-400 mb-3">{icon}</div>}
            {!icon && (
                <div className="text-gray-400 mb-3">
                    <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                </div>
            )}
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</h3>
            {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}
