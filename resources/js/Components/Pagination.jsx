import { Link } from '@inertiajs/react';

export default function Pagination({ links }) {
    if (!links || links.length <= 3) return null;

    return (
        <nav className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 px-4 py-3 sm:px-6">
            <div className="flex flex-1 justify-center">
                <div className="flex items-center gap-1">
                    {links.map((link, i) => (
                        <span key={i}>
                            {link.url ? (
                                <Link
                                    href={link.url}
                                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                                        link.active
                                            ? 'bg-blue-600 text-white font-medium'
                                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                    }`}
                                    dangerouslySetInnerHTML={{ __html: link.label }}
                                />
                            ) : (
                                <span
                                    className="px-3 py-1.5 text-sm text-gray-400 cursor-not-allowed"
                                    dangerouslySetInnerHTML={{ __html: link.label }}
                                />
                            )}
                        </span>
                    ))}
                </div>
            </div>
        </nav>
    );
}
