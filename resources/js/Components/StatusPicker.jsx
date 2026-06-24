import { useRef } from 'react';
import InlinePopover from './InlinePopover';
import StatusBadge from './StatusBadge';
import { taskStatusColors, formatLabel } from '../utils';

const STATUSES = ['backlog', 'to_do', 'in_progress', 'in_review', 'done', 'cancelled'];

export default function StatusPicker({ currentStatus, isOpen, onToggle, onSelect }) {
    const anchorRef = useRef(null);

    return (
        <>
            <button
                ref={anchorRef}
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="cursor-pointer"
            >
                <StatusBadge status={currentStatus} type="task" />
            </button>
            <InlinePopover isOpen={isOpen} onClose={() => onToggle(false)} anchorRef={anchorRef} className="p-1.5 min-w-[160px] space-y-0.5">
                {STATUSES.map((status) => (
                    <button
                        key={status}
                        onClick={() => onSelect(status)}
                        className={`w-full text-left px-2.5 py-1.5 text-xs font-medium rounded-md flex items-center gap-2 transition-colors ${taskStatusColors[status]} ${
                            status === currentStatus ? 'ring-2 ring-offset-1 ring-gray-400 dark:ring-gray-500 dark:ring-offset-gray-800' : 'opacity-80 hover:opacity-100'
                        }`}
                    >
                        {formatLabel(status)}
                    </button>
                ))}
            </InlinePopover>
        </>
    );
}
