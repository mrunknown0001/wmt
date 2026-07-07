import { useRef } from 'react';
import InlinePopover from './InlinePopover';
import PriorityBadge from './PriorityBadge';
import { priorityColors, formatLabel } from '../utils';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export default function PriorityPicker({ currentPriority, isOpen, onToggle, onSelect }) {
    const anchorRef = useRef(null);

    return (
        <>
            <button
                ref={anchorRef}
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="cursor-pointer rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:ring-1 hover:ring-blue-200 dark:hover:ring-blue-700/60 transition-all"
            >
                <PriorityBadge priority={currentPriority} />
            </button>
            <InlinePopover isOpen={isOpen} onClose={() => onToggle(false)} anchorRef={anchorRef} className="p-1.5 min-w-[140px] space-y-0.5">
                {PRIORITIES.map((priority) => (
                    <button
                        key={priority}
                        onClick={() => onSelect(priority)}
                        className={`w-full text-left px-2.5 py-1.5 text-xs font-medium rounded-md flex items-center gap-2 transition-colors ${priorityColors[priority]} ${
                            priority === currentPriority ? 'ring-2 ring-offset-1 ring-gray-400 dark:ring-gray-500 dark:ring-offset-gray-800' : 'opacity-80 hover:opacity-100'
                        }`}
                    >
                        {formatLabel(priority)}
                    </button>
                ))}
            </InlinePopover>
        </>
    );
}
