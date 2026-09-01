import CharacterCounter from './CharacterCounter';

/**
 * @param help       a line under the field explaining what it wants
 * @param showCount  with maxLength, adds "N characters left" beside that line
 */
export default function Input({ label, id, error, className = '', disabled, help = null, showCount = false, value, ...props }) {
    return (
        <div className={className}>
            {label && (
                <label htmlFor={id} className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                    {label}
                </label>
            )}
            <input
                id={id}
                disabled={disabled}
                value={value}
                className={`block w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:shadow-md focus:shadow-primary-500/5 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 ${
                    error ? 'border-red-300 dark:border-red-500 focus:border-red-500 focus:ring-red-500/20 focus:shadow-red-500/5' : 'border-gray-300 dark:border-gray-600'
                } ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-800' : ''}`}
                {...props}
            />
            {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
            {(help || (showCount && props.maxLength)) && (
                <CharacterCounter
                    used={String(value ?? '').length}
                    limit={showCount ? props.maxLength : null}
                    help={help}
                />
            )}
        </div>
    );
}
