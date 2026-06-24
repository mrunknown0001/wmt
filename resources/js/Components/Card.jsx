export default function Card({ children, className = '', padding = true }) {
    return (
        <div
            className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 ${padding ? 'p-6' : ''} ${className}`}
        >
            {children}
        </div>
    );
}
