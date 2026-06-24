export default function Checkbox({ label, id, className = '', ...props }) {
    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <input
                id={id}
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-blue-600 focus:ring-blue-500/20"
                {...props}
            />
            {label && (
                <label htmlFor={id} className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {label}
                </label>
            )}
        </div>
    );
}
