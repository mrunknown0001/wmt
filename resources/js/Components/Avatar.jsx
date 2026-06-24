import { getInitials } from '../utils';

const palette = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-orange-500',
    'bg-pink-500',
    'bg-teal-500',
    'bg-indigo-500',
    'bg-rose-500',
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
    return Math.abs(hash) % palette.length;
}

export default function Avatar({ name, size = 'md', className = '' }) {
    const colorClass = palette[hashName(name)];

    return (
        <span
            className={`inline-flex items-center justify-center rounded-full text-white font-medium shrink-0 ${colorClass} ${sizes[size]} ${className}`}
            title={name || 'Unknown'}
        >
            {getInitials(name)}
        </span>
    );
}
