import { Link } from '@inertiajs/react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import PriorityBadge from './PriorityBadge';
import Avatar from './Avatar';
import { formatDate } from '../utils';

export default function TaskCard({ task, projectId, canEdit, canDelete, onDelete, onToggleComplete, isSelected, onToggleSelect, onContextMenu }) {
    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done' && task.status !== 'cancelled';
    const isDone = task.status === 'done';

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: task.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={(e) => { if ((e.ctrlKey || e.metaKey) && onToggleSelect) { e.preventDefault(); onToggleSelect(task.id); } }}
            onContextMenu={(e) => onContextMenu?.(e, task)}
            className={`bg-white dark:bg-gray-800 rounded-lg border p-3 shadow-sm card-hover cursor-grab active:cursor-grabbing touch-none ${isDragging ? 'z-50 shadow-lg transform-none!' : ''} ${isSelected ? 'border-primary-500 dark:border-primary-400 ring-2 ring-primary-300 dark:ring-primary-700 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
        >
            <div className="flex items-start gap-2 mb-2">
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleComplete?.(task.id, e); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className={`mt-0.5 shrink-0 h-4.5 w-4.5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                        isDone
                            ? 'bg-green-500 border-green-500 text-white scale-110'
                            : 'border-gray-300 dark:border-gray-500 text-transparent hover:border-green-400 hover:text-green-400 hover:scale-110'
                    }`}
                    title={isDone ? 'Mark incomplete' : 'Mark complete'}
                >
                    <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </button>
                <div className="flex-1 flex items-start justify-between gap-2">
                    <PriorityBadge priority={task.priority} />
                    {(canEdit || canDelete) && (
                        <div className="flex items-center gap-1">
                            {canEdit && (
                                <Link
                                    href={`/projects/${projectId}/tasks/${task.id}/edit`}
                                    className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                    title="Edit"
                                >
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                </Link>
                            )}
                            {canDelete && (
                                <button
                                    onClick={() => onDelete(task.id, task.title)}
                                    className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                    title="Delete"
                                >
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <div className={`flex items-start gap-1 mb-2 ${isDone ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                <p className="text-sm font-medium line-clamp-2">{task.title}</p>
                {task.is_recurring && (
                    <svg className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} title="Recurring task">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                )}
            </div>
            {task.subtasks_count > 0 && (
                <div className="flex items-center gap-1.5 mb-2 text-xs text-gray-400 dark:text-gray-500">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{task.completed_subtasks_count}/{task.subtasks_count}</span>
                </div>
            )}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    {task.assignee && (
                        <Avatar name={task.assignee.name} size="sm" />
                    )}
                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[100px]">
                        {task.assignee?.name || 'Unassigned'}
                    </span>
                    {task.collaborators?.length > 0 && (
                        <div className="flex -space-x-1.5 ml-1" title={task.collaborators.map((c) => c.name).join(', ')}>
                            {task.collaborators.slice(0, 2).map((c) => (
                                <Avatar key={c.id} name={c.name} size="sm" className="ring-1 ring-white dark:ring-gray-800" />
                            ))}
                            {task.collaborators.length > 2 && (
                                <span className="text-xs text-gray-400 ml-1">+{task.collaborators.length - 2}</span>
                            )}
                        </div>
                    )}
                </div>
                {(task.start_date || task.due_date) && (
                    <span className={`text-xs ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                        {task.start_date && task.due_date ? `${formatDate(task.start_date)} → ${formatDate(task.due_date)}` : formatDate(task.due_date) || formatDate(task.start_date)}
                    </span>
                )}
            </div>
        </div>
    );
}
