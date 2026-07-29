import { Link } from '@inertiajs/react';

const variants = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500 dark:bg-primary-500 dark:hover:bg-primary-600',
    secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-gray-500 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600',
    danger: 'bg-white text-red-600 border border-red-300 hover:bg-red-50 focus:ring-red-500 dark:bg-gray-700 dark:text-red-400 dark:border-red-500/50 dark:hover:bg-red-900/30',
    ghost: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:ring-gray-500 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700',
    // Distinct hues so the three "add" actions on a project page are told apart
    // at a glance. Fixed colours rather than the themeable primary, which each
    // would otherwise collide with.
    violet: 'bg-violet-600 text-white hover:bg-violet-700 focus:ring-violet-500 dark:bg-violet-500 dark:hover:bg-violet-600',
    amber: 'bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-500 dark:bg-amber-500 dark:hover:bg-amber-600',
};

const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
};

export default function LinkButton({
    href,
    variant = 'primary',
    size = 'md',
    className = '',
    children,
    ...props
}) {
    return (
        <Link
            href={href}
            className={`inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 active:scale-[0.97] ${variants[variant]} ${sizes[size]} ${className}`}
            {...props}
        >
            {children}
        </Link>
    );
}
