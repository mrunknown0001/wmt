import Badge from './Badge';
import { formatLabel, priorityColors } from '../utils';

export default function PriorityBadge({ priority }) {
    return (
        <Badge colorClasses={priorityColors[priority]}>
            {formatLabel(priority)}
        </Badge>
    );
}
