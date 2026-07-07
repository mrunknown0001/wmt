export default function Skeleton({ className = '', rounded = false }) {
    return (
        <div className={`skeleton ${rounded ? 'rounded-full' : ''} ${className}`} />
    );
}

export function SkeletonCard() {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="skeleton h-4 w-3/4 mb-3" />
            <div className="skeleton h-3 w-1/2 mb-2" />
            <div className="skeleton h-3 w-1/3" />
        </div>
    );
}

export function SkeletonRow() {
    return (
        <div className="flex items-center gap-4 px-6 py-3">
            <div className="skeleton h-8 w-8 rounded-full" />
            <div className="flex-1">
                <div className="skeleton h-4 w-2/3 mb-2" />
                <div className="skeleton h-3 w-1/3" />
            </div>
        </div>
    );
}
