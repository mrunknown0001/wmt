const colorMap = {
    gray: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300',
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    green: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
};

export default function Badge({ color = 'gray', colorClasses, className = '', children }) {
    const classes = colorClasses || colorMap[color] || colorMap.gray;

    return (
        <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${classes} ${className}`}
        >
            {children}
        </span>
    );
}
