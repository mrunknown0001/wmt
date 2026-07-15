import { Link } from '@inertiajs/react';

export default function PageHeader({ title, titleExtra, breadcrumbs = [], actions }) {
    return (
        <div className="mb-6">
            {breadcrumbs.length > 0 && (
                <nav className="flex flex-wrap items-center gap-1.5 text-sm text-gray-500 mb-2">
                    {breadcrumbs.map((crumb, i) => (
                        <span key={i} className="flex items-center gap-1.5">
                            {i > 0 && (
                                <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            )}
                            {crumb.href ? (
                                <Link href={crumb.href} className="hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                                    {crumb.label}
                                </Link>
                            ) : (
                                <span className="text-gray-900 dark:text-gray-100 font-medium">{crumb.label}</span>
                            )}
                        </span>
                    ))}
                </nav>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 min-w-0">
                    <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 truncate">{title}</h1>
                    {titleExtra}
                </div>
                {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
        </div>
    );
}
