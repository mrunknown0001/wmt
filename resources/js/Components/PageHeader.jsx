import { Link } from '@inertiajs/react';

/**
 * @param description  One or two sentences saying what this page is for, shown
 *                     under the title. Optional, so pages that have nothing
 *                     useful to add stay exactly as they were — but every page
 *                     now has somewhere to put it, which is what was missing.
 *                     Takes a node as well as a string, so a description can
 *                     carry a link without a second prop.
 */
export default function PageHeader({ title, titleExtra, description, breadcrumbs = [], actions }) {
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
            {description && (
                // max-w-2xl because a sentence running the full width of a wide
                // screen is harder to read than one that wraps.
                <p className="mt-1.5 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
                    {description}
                </p>
            )}
        </div>
    );
}
