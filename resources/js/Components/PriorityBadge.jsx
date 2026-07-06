import Badge from './Badge';
import { formatLabel, priorityColors } from '../utils';

const priorityIcons = {
    low: (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7" />
        </svg>
    ),
    medium: (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
        </svg>
    ),
    high: (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7" />
        </svg>
    ),
    urgent: (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
        </svg>
    ),
};

export default function PriorityBadge({ priority }) {
    return (
        <Badge colorClasses={priorityColors[priority]}>
            <span className="flex items-center gap-1">
                {priorityIcons[priority]}
                {formatLabel(priority)}
            </span>
        </Badge>
    );
}
