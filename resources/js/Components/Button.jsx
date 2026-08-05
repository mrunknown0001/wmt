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

/**
 * How a toggle button looks while whatever it opens is showing.
 *
 * A separate map rather than extra classes tacked onto `className`: Tailwind
 * resolves a conflict like border-gray-300 vs border-primary-500 by stylesheet
 * order, not by the order classes appear on the element, so appending one is
 * not reliably an override. Swapping the whole variant string is.
 */
const activeVariants = {
    secondary: 'bg-primary-50 text-primary-700 border border-primary-500 ring-1 ring-primary-500/30 hover:bg-primary-100 focus:ring-primary-500 dark:bg-primary-900/30 dark:text-primary-200 dark:border-primary-400 dark:hover:bg-primary-900/50',
    ghost: 'text-primary-700 bg-primary-50 border border-primary-500 hover:bg-primary-100 focus:ring-primary-500 dark:text-primary-200 dark:bg-primary-900/30 dark:border-primary-400',
};

const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
};

/**
 * @param active  For a button that toggles a panel: true while that panel is
 *                open. Gives the button a coloured border so it is obvious
 *                which one is showing, and marks it aria-pressed so the state
 *                is not carried by colour alone.
 */
export default function Button({
    variant = 'primary',
    size = 'md',
    active = false,
    processing = false,
    processingText,
    type = 'button',
    className = '',
    children,
    ...props
}) {
    const tone = (active && activeVariants[variant]) || variants[variant];

    return (
        <button
            type={type}
            disabled={processing || props.disabled}
            aria-pressed={active || undefined}
            className={`inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${tone} ${sizes[size]} ${className}`}
            {...props}
        >
            {processing ? (processingText || 'Processing...') : children}
        </button>
    );
}
