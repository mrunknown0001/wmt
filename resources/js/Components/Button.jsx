const variants = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500 dark:bg-primary-500 dark:hover:bg-primary-600',
    secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-gray-500 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600',
    danger: 'bg-white text-red-600 border border-red-300 hover:bg-red-50 focus:ring-red-500 dark:bg-gray-700 dark:text-red-400 dark:border-red-500/50 dark:hover:bg-red-900/30',
    ghost: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:ring-gray-500 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700',
};

const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
};

export default function Button({
    variant = 'primary',
    size = 'md',
    processing = false,
    processingText,
    type = 'button',
    className = '',
    children,
    ...props
}) {
    return (
        <button
            type={type}
            disabled={processing || props.disabled}
            className={`inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
            {...props}
        >
            {processing ? (processingText || 'Processing...') : children}
        </button>
    );
}
