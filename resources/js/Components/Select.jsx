export default function Select({ label, id, error, options = [], placeholder, children, className = '', ...props }) {
    return (
        <div className={className}>
            {label && (
                <label htmlFor={id} className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                    {label}
                </label>
            )}
            <select
                id={id}
                className={`block w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:bg-gray-700 dark:text-gray-100 ${
                    error ? 'border-red-300 dark:border-red-500 focus:border-red-500 focus:ring-red-500/20' : 'border-gray-300 dark:border-gray-600'
                }`}
                {...props}
            >
                {placeholder && <option value="">{placeholder}</option>}
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
                {children}
            </select>
            {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
    );
}
