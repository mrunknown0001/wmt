import Badge from './Badge';
import { formatLabel, projectStatusColors, taskStatusColors } from '../utils';

export default function StatusBadge({ status, type = 'task' }) {
    const colorMap = type === 'project' ? projectStatusColors : taskStatusColors;

    return (
        <Badge colorClasses={colorMap[status]}>
            {formatLabel(status)}
        </Badge>
    );
}
