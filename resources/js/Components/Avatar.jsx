import { getInitials } from '../utils';

const gradients = [
    'from-blue-500 to-indigo-600',
    'from-emerald-500 to-teal-600',
    'from-purple-500 to-violet-600',
    'from-orange-500 to-amber-600',
    'from-pink-500 to-rose-600',
    'from-teal-500 to-cyan-600',
    'from-indigo-500 to-blue-600',
    'from-rose-500 to-pink-600',
    'from-violet-500 to-purple-600',
    'from-cyan-500 to-sky-600',
];

const sizes = {
    sm: 'h-6 w-6 text-[10px]',
    md: 'h-8 w-8 text-xs',
    lg: 'h-10 w-10 text-sm',
};

function hashName(name) {
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % gradients.length;
}

export default function Avatar({ name, size = 'md', className = '' }) {
    const gradientClass = gradients[hashName(name)];

    return (
        <span
            className={`inline-flex items-center justify-center rounded-full text-white font-medium shrink-0 bg-linear-to-br ${gradientClass} shadow-sm ${sizes[size]} ${className}`}
            title={name || 'Unknown'}
        >
            {getInitials(name)}
        </span>
    );
}
