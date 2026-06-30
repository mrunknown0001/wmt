import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Link, router, usePage } from '@inertiajs/react';
import {
    DndContext,
    DragOverlay,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
    arrayMove,
    sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import StatusBadge from '../../Components/StatusBadge';
import PriorityBadge from '../../Components/PriorityBadge';
import Avatar from '../../Components/Avatar';
import LinkButton from '../../Components/LinkButton';
import Button from '../../Components/Button';
import EmptyState from '../../Components/EmptyState';
import KanbanColumn from '../../Components/KanbanColumn';
import { ConfirmModal } from '../../Components/Modal';
import AutomationRuleBuilder from '../../Components/AutomationRuleBuilder';
import StatusPicker from '../../Components/StatusPicker';
import PriorityPicker from '../../Components/PriorityPicker';
import AssigneePicker from '../../Components/AssigneePicker';
import InlineDatePicker from '../../Components/InlineDatePicker';
import { formatLabel, formatDate, apiFetch } from '../../utils';
import echo from '../../echo';

const TASK_STATUSES = ['backlog', 'to_do', 'in_progress', 'in_review', 'done', 'cancelled'];

const ListIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
);

const BoardIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
    </svg>
);

const CalendarIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
);

const GanttIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h10M4 12h16M4 18h7" />
    </svg>
);

const AutomationIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
);

const EditIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
);

const ArchiveIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
);

const TrashIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

// Sortable subtask row
function SortableSubtaskRow({ task, project, canEditTask, canManageTasks, canManageTaskDetails, handleDeleteTask, onToggleComplete, users, onTaskUpdate }) {
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

    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done' && task.status !== 'cancelled';
    const isDone = task.status === 'done';

    const [openPopover, setOpenPopover] = useState(null);

    const togglePopover = (name) => (forceClose) => {
        if (forceClose === false) { setOpenPopover(null); return; }
        setOpenPopover((prev) => prev === name ? null : name);
    };

    const handleFieldUpdate = (field, value) => {
        setOpenPopover(null);
        onTaskUpdate(task.id, field, value);
    };

    return (
        <tr ref={setNodeRef} style={style} {...attributes} {...listeners} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors bg-gray-50/50 dark:bg-gray-800/30 cursor-grab active:cursor-grabbing touch-none ${isDragging ? 'z-50 shadow-md' : ''}`}>
            <td className="pl-10 pr-2 py-3 w-10">
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleComplete(task.id); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className={`h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isDone
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-gray-300 dark:border-gray-500 text-transparent hover:border-green-400 hover:text-green-400'
                    }`}
                    title={isDone ? 'Mark incomplete' : 'Mark complete'}
                >
                    <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </button>
            </td>
            <td className={`px-6 py-3 text-sm ${isDone ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-700 dark:text-gray-300'}`}>
                <div className="flex items-center gap-1.5">
                    <svg className="h-3 w-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    {task.title}
                </div>
            </td>
            <td className="px-6 py-3 text-sm">
                {canEditTask ? (
                    <StatusPicker
                        currentStatus={task.status}
                        isOpen={openPopover === 'status'}
                        onToggle={togglePopover('status')}
                        onSelect={(status) => handleFieldUpdate('status', status)}
                    />
                ) : (
                    <StatusBadge status={task.status} type="task" />
                )}
            </td>
            <td className="px-6 py-3 text-sm">
                {canEditTask ? (
                    <PriorityPicker
                        currentPriority={task.priority}
                        isOpen={openPopover === 'priority'}
                        onToggle={togglePopover('priority')}
                        onSelect={(priority) => handleFieldUpdate('priority', priority)}
                    />
                ) : (
                    <PriorityBadge priority={task.priority} />
                )}
            </td>
            <td className="px-6 py-3 text-sm">
                {canManageTaskDetails ? (
                    <AssigneePicker
                        currentAssignee={task.assignee}
                        users={users}
                        isOpen={openPopover === 'assignee'}
                        onToggle={togglePopover('assignee')}
                        onSelect={(user) => handleFieldUpdate('assigned_to', user ? user.id : null)}
                    />
                ) : (
                    <div className="flex items-center gap-2">
                        {task.assignee ? (
                            <>
                                <Avatar name={task.assignee.name} size="sm" />
                                <span className="text-gray-700 dark:text-gray-300 text-xs">{task.assignee.name}</span>
                            </>
                        ) : (
                            <span className="text-gray-400 text-xs">Unassigned</span>
                        )}
                    </div>
                )}
            </td>
            <td className="px-6 py-3 text-sm">
                <div className="flex items-center gap-1">
                    {canManageTaskDetails ? (
                        <>
                            {task.start_date && (
                                <>
                                    <InlineDatePicker
                                        currentDate={task.start_date}
                                        isOpen={openPopover === 'start_date'}
                                        onToggle={togglePopover('start_date')}
                                        onSelect={(date) => handleFieldUpdate('start_date', date)}
                                        onClear={() => handleFieldUpdate('start_date', null)}
                                    />
                                    <span className="text-gray-300 dark:text-gray-600">→</span>
                                </>
                            )}
                            <InlineDatePicker
                                currentDate={task.due_date}
                                isOpen={openPopover === 'due_date'}
                                onToggle={togglePopover('due_date')}
                                onSelect={(date) => handleFieldUpdate('due_date', date)}
                                isOverdue={isOverdue}
                            />
                            {!task.start_date && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); togglePopover('start_date')(); }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="ml-1 text-gray-300 dark:text-gray-600 hover:text-primary-500 dark:hover:text-primary-400 transition-colors"
                                    title="Add start date"
                                >
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                    </svg>
                                </button>
                            )}
                            {!task.start_date && openPopover === 'start_date' && (
                                <InlineDatePicker
                                    currentDate={null}
                                    isOpen={true}
                                    onToggle={togglePopover('start_date')}
                                    onSelect={(date) => handleFieldUpdate('start_date', date)}
                                    hidden
                                />
                            )}
                        </>
                    ) : (
                        <span className={`text-xs ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                            {task.start_date && task.due_date ? `${formatDate(task.start_date)} → ${formatDate(task.due_date)}` : formatDate(task.due_date) || formatDate(task.start_date) || '—'}
                        </span>
                    )}
                </div>
            </td>
            <td className="px-6 py-3 text-sm text-right">
                <div className="flex items-center justify-end gap-1">
                    {canEditTask && (
                        <Link
                            href={`/projects/${project.id}/tasks/${task.id}/edit`}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                            title="Edit"
                        >
                            <EditIcon />
                        </Link>
                    )}
                    {canManageTasks && (
                        <button
                            onClick={() => handleDeleteTask(task.id, task.title)}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                            title="Delete"
                        >
                            <TrashIcon />
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
}

// Sortable table row for list view drag-and-drop
function SortableRow({ task, project, canEditTask, canManageTasks, canManageTaskDetails, handleDeleteTask, users, onTaskUpdate, onToggleComplete, isExpanded, onToggleExpand, isSelected, onToggleSelect }) {
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

    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done' && task.status !== 'cancelled';
    const isDone = task.status === 'done';

    const [openPopover, setOpenPopover] = useState(null);

    const togglePopover = (name) => (forceClose) => {
        if (forceClose === false) { setOpenPopover(null); return; }
        setOpenPopover((prev) => prev === name ? null : name);
    };

    const handleFieldUpdate = (field, value) => {
        setOpenPopover(null);
        onTaskUpdate(task.id, field, value);
    };

    return (
        <tr
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={(e) => { if ((e.ctrlKey || e.metaKey) && onToggleSelect) { e.preventDefault(); onToggleSelect(task.id); } }}
            className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-grab active:cursor-grabbing touch-none ${isDragging ? 'bg-blue-50 dark:bg-blue-900/30' : ''} ${isSelected ? 'bg-primary-100 dark:bg-primary-900/30' : ''}`}
        >
            <td className="pl-6 pr-2 py-4 w-10">
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleComplete(task.id); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isDone
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-gray-300 dark:border-gray-500 text-transparent hover:border-green-400 hover:text-green-400'
                    }`}
                    title={isDone ? 'Mark incomplete' : 'Mark complete'}
                >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </button>
            </td>
            <td className={`px-6 py-4 text-sm font-medium ${isDone ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                <div className="flex items-center gap-2">
                    {(task.subtasks_count > 0 || canManageTasks) && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleExpand(task.id); }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            title={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
                        >
                            <svg className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    )}
                    <span>{task.title}</span>
                    {task.is_recurring && (
                        <svg className="h-3.5 w-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} title="Recurring task">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    )}
                    {task.subtasks_count > 0 && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">
                            {task.completed_subtasks_count}/{task.subtasks_count}
                        </span>
                    )}
                </div>
            </td>
            <td className="px-6 py-4 text-sm">
                {canEditTask ? (
                    <StatusPicker
                        currentStatus={task.status}
                        isOpen={openPopover === 'status'}
                        onToggle={togglePopover('status')}
                        onSelect={(status) => handleFieldUpdate('status', status)}
                    />
                ) : (
                    <StatusBadge status={task.status} type="task" />
                )}
            </td>
            <td className="px-6 py-4 text-sm">
                {canEditTask ? (
                    <PriorityPicker
                        currentPriority={task.priority}
                        isOpen={openPopover === 'priority'}
                        onToggle={togglePopover('priority')}
                        onSelect={(priority) => handleFieldUpdate('priority', priority)}
                    />
                ) : (
                    <PriorityBadge priority={task.priority} />
                )}
            </td>
            <td className="px-6 py-4 text-sm">
                <div className="flex items-center gap-2">
                    {canManageTaskDetails ? (
                        <AssigneePicker
                            currentAssignee={task.assignee}
                            users={users}
                            isOpen={openPopover === 'assignee'}
                            onToggle={togglePopover('assignee')}
                            onSelect={(user) => handleFieldUpdate('assigned_to', user ? user.id : null)}
                        />
                    ) : (
                        task.assignee ? (
                            <div className="flex items-center gap-2">
                                <Avatar name={task.assignee.name} size="sm" />
                                <span className="text-gray-700 dark:text-gray-300">{task.assignee.name}</span>
                            </div>
                        ) : (
                            <span className="text-gray-400">Unassigned</span>
                        )
                    )}
                    {task.collaborators?.length > 0 && (
                        <div className="flex -space-x-1.5" title={task.collaborators.map((c) => c.name).join(', ')}>
                            {task.collaborators.slice(0, 3).map((c) => (
                                <Avatar key={c.id} name={c.name} size="sm" className="ring-1 ring-white dark:ring-gray-800" />
                            ))}
                            {task.collaborators.length > 3 && (
                                <span className="text-xs text-gray-400 ml-1">+{task.collaborators.length - 3}</span>
                            )}
                        </div>
                    )}
                </div>
            </td>
            <td className="px-6 py-4 text-sm">
                <div className="flex items-center gap-1">
                    {canManageTaskDetails ? (
                        <>
                            {task.start_date && (
                                <>
                                    <InlineDatePicker
                                        currentDate={task.start_date}
                                        isOpen={openPopover === 'start_date'}
                                        onToggle={togglePopover('start_date')}
                                        onSelect={(date) => handleFieldUpdate('start_date', date)}
                                        onClear={() => handleFieldUpdate('start_date', null)}
                                    />
                                    <span className="text-gray-300 dark:text-gray-600">→</span>
                                </>
                            )}
                            <InlineDatePicker
                                currentDate={task.due_date}
                                isOpen={openPopover === 'due_date'}
                                onToggle={togglePopover('due_date')}
                                onSelect={(date) => handleFieldUpdate('due_date', date)}
                                isOverdue={isOverdue}
                            />
                            {!task.start_date && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); togglePopover('start_date')(); }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="ml-1 text-gray-300 dark:text-gray-600 hover:text-primary-500 dark:hover:text-primary-400 transition-colors"
                                    title="Add start date"
                                >
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                    </svg>
                                </button>
                            )}
                            {!task.start_date && openPopover === 'start_date' && (
                                <InlineDatePicker
                                    currentDate={null}
                                    isOpen={true}
                                    onToggle={togglePopover('start_date')}
                                    onSelect={(date) => handleFieldUpdate('start_date', date)}
                                    hidden
                                />
                            )}
                        </>
                    ) : (
                        <span className={`text-sm ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                            {task.start_date && task.due_date ? `${formatDate(task.start_date)} → ${formatDate(task.due_date)}` : formatDate(task.due_date) || formatDate(task.start_date) || '—'}
                        </span>
                    )}
                </div>
            </td>
            <td className="px-6 py-4 text-sm text-right">
                <div className="flex items-center justify-end gap-1">
                    {canEditTask && (
                        <Link
                            href={`/projects/${project.id}/tasks/${task.id}/edit`}
                            className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                            title="Edit"
                        >
                            <EditIcon />
                        </Link>
                    )}
                    {canManageTasks && (
                        <button
                            onClick={() => handleDeleteTask(task.id, task.title)}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                            title="Delete"
                        >
                            <TrashIcon />
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
}

// Board view wrapper with custom horizontal slider
function BoardScrollWrapper({ children }) {
    const scrollRef = useRef(null);
    const trackRef = useRef(null);
    const draggingRef = useRef(false);
    const [thumb, setThumb] = useState({ width: 0, left: 0, visible: false });

    const updateThumb = useCallback(() => {
        const el = scrollRef.current;
        const track = trackRef.current;
        if (!el || !track) return;
        const { scrollWidth, clientWidth, scrollLeft } = el;
        if (scrollWidth <= clientWidth) {
            setThumb({ width: 0, left: 0, visible: false });
            return;
        }
        const trackW = track.clientWidth;
        const tw = Math.max((clientWidth / scrollWidth) * trackW, 40);
        const maxLeft = trackW - tw;
        const ratio = scrollLeft / (scrollWidth - clientWidth);
        setThumb({ width: tw, left: ratio * maxLeft, visible: true });
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        updateThumb();
        el.addEventListener('scroll', updateThumb, { passive: true });
        const ro = new ResizeObserver(updateThumb);
        ro.observe(el);
        // Also observe the inner content for size changes
        if (el.firstElementChild) ro.observe(el.firstElementChild);
        return () => { el.removeEventListener('scroll', updateThumb); ro.disconnect(); };
    }, [updateThumb]);

    const handleThumbPointerDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const track = trackRef.current;
        const el = scrollRef.current;
        if (!track || !el) return;
        draggingRef.current = true;
        const startX = e.clientX;
        const startLeft = thumb.left;
        const trackW = track.clientWidth;
        const maxThumbLeft = trackW - thumb.width;
        const maxScroll = el.scrollWidth - el.clientWidth;

        const onMove = (ev) => {
            const dx = ev.clientX - startX;
            const newLeft = Math.max(0, Math.min(maxThumbLeft, startLeft + dx));
            el.scrollLeft = maxThumbLeft > 0 ? (newLeft / maxThumbLeft) * maxScroll : 0;
        };
        const onUp = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            setTimeout(() => { draggingRef.current = false; }, 0);
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    };

    const handleTrackClick = (e) => {
        if (draggingRef.current) return;
        const track = trackRef.current;
        const el = scrollRef.current;
        if (!track || !el) return;
        const rect = track.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const maxThumbLeft = track.clientWidth - thumb.width;
        const targetCenter = clickX - thumb.width / 2;
        const ratio = Math.max(0, Math.min(1, targetCenter / maxThumbLeft));
        el.scrollTo({ left: ratio * (el.scrollWidth - el.clientWidth), behavior: 'smooth' });
    };

    return (
        <div>
            <style>{`.board-no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
            {children(scrollRef)}
            {thumb.visible && (
                <div className="mt-2 px-1">
                    <div
                        ref={trackRef}
                        onClick={handleTrackClick}
                        className="relative h-2 rounded-full bg-gray-200 dark:bg-gray-700 cursor-pointer"
                    >
                        <div
                            onPointerDown={handleThumbPointerDown}
                            className="absolute top-0 h-2 rounded-full bg-gray-400 dark:bg-gray-500 hover:bg-gray-500 dark:hover:bg-gray-400 active:bg-blue-500 dark:active:bg-blue-400 transition-colors cursor-grab active:cursor-grabbing"
                            style={{ width: `${thumb.width}px`, left: `${thumb.left}px` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

// Droppable zone for sections (allows dropping tasks into/between sections)
function SectionDropZone({ sectionId }) {
    const { setNodeRef, isOver } = useDroppable({ id: `section-${sectionId ?? 'null'}` });
    return (
        <tr ref={setNodeRef}>
            <td colSpan={7} className={`transition-colors ${isOver ? 'py-2' : 'py-0'}`}>
                {isOver && (
                    <div className="mx-4 border-2 border-dashed border-primary-300 dark:border-primary-600 rounded py-2 text-center text-xs text-primary-500 font-medium">
                        Drop here
                    </div>
                )}
            </td>
        </tr>
    );
}

// Draggable section header row
function SortableSectionHeader({ section, isCollapsed, onToggleCollapse, isEditing, editingName, onEditName, onStartEditing, onRename, onCancelEditing, onAddTask, onDelete, canManage, projectId, taskCount }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: `section-header-${section.id}` });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
    };

    return (
        <tr ref={setNodeRef} style={style} className="bg-gray-100 dark:bg-gray-800/80">
            <td colSpan={7} className="px-4 py-2">
                <div className="flex items-center gap-2">
                    {canManage && (
                        <button
                            {...attributes}
                            {...listeners}
                            className="cursor-grab active:cursor-grabbing p-0.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                            title="Drag to reorder section"
                        >
                            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm8-16a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
                            </svg>
                        </button>
                    )}
                    <button
                        onClick={onToggleCollapse}
                        className="p-0.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                    >
                        <svg className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                    {isEditing ? (
                        <input
                            autoFocus
                            className="text-sm font-semibold bg-white dark:bg-gray-700 border border-primary-300 dark:border-primary-600 rounded px-2 py-0.5 text-gray-900 dark:text-gray-100 outline-none"
                            value={editingName}
                            onChange={(e) => onEditName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') onRename();
                                if (e.key === 'Escape') onCancelEditing();
                            }}
                            onBlur={onRename}
                        />
                    ) : (
                        <span
                            className="text-sm font-semibold text-gray-700 dark:text-gray-200 cursor-pointer hover:text-primary-600 dark:hover:text-primary-400"
                            onClick={onStartEditing}
                        >
                            {section.name}
                        </span>
                    )}
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{taskCount}</span>
                    {canManage && (
                        <>
                            <Link
                                href={`/projects/${projectId}/tasks/create?section_id=${section.id}`}
                                className="ml-auto text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                title="Add task to section"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                            </Link>
                            <button
                                onClick={onDelete}
                                className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                title="Delete section"
                            >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </>
                    )}
                </div>
            </td>
        </tr>
    );
}

export default function Show() {
    const { project, tasks: serverTasks, sections: serverSections = [], canManageProject, canManageTasks, automationRules, auth, users } = usePage().props;

    const [showDetails, setShowDetails] = useState(false);
    const [view, setView] = useState('list');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterPriority, setFilterPriority] = useState('');
    const [filterAssignee, setFilterAssignee] = useState('');
    const [filterSearch, setFilterSearch] = useState('');
    const [filterDueDate, setFilterDueDate] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [localTasks, setLocalTasks] = useState(serverTasks);
    const [activeId, setActiveId] = useState(null);
    const [expandedTasks, setExpandedTasks] = useState(new Set());
    const [calendarMonth, setCalendarMonth] = useState(() => {
        const now = new Date();
        return { month: now.getMonth() + 1, year: now.getFullYear() };
    });
    const [selectedTasks, setSelectedTasks] = useState(new Set());
    const [bulkDropdown, setBulkDropdown] = useState(null); // 'status' | 'priority' | 'assign' | null
    const [localSections, setLocalSections] = useState(serverSections);
    const [collapsedSections, setCollapsedSections] = useState(new Set());
    const [editingSectionId, setEditingSectionId] = useState(null);
    const [editingSectionName, setEditingSectionName] = useState('');
    const [addingSectionName, setAddingSectionName] = useState(null); // null = not adding, string = input value
    const [showAutomation, setShowAutomation] = useState(false);

    // Sync local state when server data changes (after Inertia navigation)
    useMemo(() => {
        setLocalTasks(serverTasks);
        setLocalSections(serverSections);
    }, [serverTasks, serverSections]);

    // Real-time task updates via Echo
    useEffect(() => {
        const channel = echo.private(`project.${project.id}`);

        channel.listen('.task.updated', (e) => {
            switch (e.change_type) {
                case 'created':
                    setLocalTasks((prev) => {
                        if (prev.some((t) => t.id === e.task.id)) return prev;
                        return [...prev, e.task];
                    });
                    break;
                case 'updated':
                    setLocalTasks((prev) =>
                        prev.map((t) => (t.id === e.task.id ? { ...t, ...e.task } : t))
                    );
                    break;
                case 'deleted':
                    setLocalTasks((prev) => prev.filter((t) => t.id !== e.task.id));
                    break;
                case 'reordered':
                case 'bulk':
                    router.reload({ only: ['tasks'], preserveScroll: true });
                    break;
            }
        });

        return () => echo.leave(`project.${project.id}`);
    }, [project.id]);

    const canEditTask = (task) =>
        canManageTasks || task.assigned_to === auth.user?.id;

    // Get unique assignees for filter
    const assignees = useMemo(() => {
        const map = new Map();
        localTasks.forEach((t) => {
            if (t.assignee) map.set(t.assignee.id, t.assignee.name);
        });
        return Array.from(map, ([id, name]) => ({ id, name }));
    }, [localTasks]);

    // Filter tasks
    const matchesFilters = useCallback((t) => {
        if (filterStatus && t.status !== filterStatus) return false;
        if (filterPriority && t.priority !== filterPriority) return false;
        if (filterAssignee && String(t.assigned_to) !== filterAssignee) return false;
        if (filterSearch && !t.title.toLowerCase().includes(filterSearch.toLowerCase())) return false;
        if (filterDueDate) {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const dueDate = t.due_date ? new Date(t.due_date) : null;
            if (dueDate) dueDate.setHours(0, 0, 0, 0);
            switch (filterDueDate) {
                case 'overdue': if (!dueDate || dueDate >= today) return false; break;
                case 'today': if (!dueDate || dueDate.getTime() !== today.getTime()) return false; break;
                case 'this_week': { const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7); if (!dueDate || dueDate < today || dueDate > weekEnd) return false; break; }
                case 'no_date': if (dueDate) return false; break;
            }
        }
        return true;
    }, [filterStatus, filterPriority, filterAssignee, filterSearch, filterDueDate]);

    const filteredTasks = useMemo(() => {
        return localTasks.filter(matchesFilters);
    }, [localTasks, matchesFilters]);

    // Group filtered tasks by status for board view
    const tasksByStatus = useMemo(() => {
        const grouped = {};
        TASK_STATUSES.forEach((s) => (grouped[s] = []));
        filteredTasks.forEach((t) => {
            if (grouped[t.status]) grouped[t.status].push(t);
        });
        return grouped;
    }, [filteredTasks]);

    // Group filtered tasks by section for list view
    const tasksBySection = useMemo(() => {
        if (localSections.length === 0) return null; // No sections — render flat list
        const groups = [];
        // Unsectioned tasks first
        const unsectioned = filteredTasks.filter((t) => !t.section_id);
        groups.push({ id: null, name: 'Unsectioned', tasks: unsectioned });
        // Then each section in order
        localSections.forEach((s) => {
            const sectionTasks = filteredTasks.filter((t) => t.section_id === s.id);
            groups.push({ id: s.id, name: s.name, tasks: sectionTasks });
        });
        return groups;
    }, [filteredTasks, localSections]);

    // Section management handlers
    const handleCreateSection = useCallback(async (name) => {
        if (!name.trim()) return;
        try {
            const res = await apiFetch(`/projects/${project.id}/sections`, {
                method: 'POST',
                body: JSON.stringify({ name: name.trim() }),
            });
            if (res.ok) {
                const section = await res.json();
                setLocalSections((prev) => [...prev, section]);
            }
        } catch {}
        setAddingSectionName(null);
    }, [project.id]);

    const handleRenameSection = useCallback(async (sectionId, name) => {
        if (!name.trim()) { setEditingSectionId(null); return; }
        setLocalSections((prev) => prev.map((s) => s.id === sectionId ? { ...s, name: name.trim() } : s));
        setEditingSectionId(null);
        try {
            await apiFetch(`/projects/${project.id}/sections/${sectionId}`, {
                method: 'PATCH',
                body: JSON.stringify({ name: name.trim() }),
            });
        } catch {
            setLocalSections(serverSections);
        }
    }, [project.id, serverSections]);

    const handleDeleteSection = useCallback((sectionId, sectionName) => {
        setConfirmDelete({
            type: 'section',
            sectionId,
            title: 'Delete Section',
            message: `Delete section "${sectionName}"? Tasks in this section will become unsectioned.`,
        });
    }, []);

    const handleConfirmDeleteSection = useCallback(async (sectionId) => {
        setLocalSections((prev) => prev.filter((s) => s.id !== sectionId));
        setLocalTasks((prev) => prev.map((t) => t.section_id === sectionId ? { ...t, section_id: null } : t));
        try {
            await apiFetch(`/projects/${project.id}/sections/${sectionId}`, { method: 'DELETE' });
        } catch {
            setLocalSections(serverSections);
            setLocalTasks(serverTasks);
        }
    }, [project.id, serverSections, serverTasks]);

    const toggleSectionCollapse = useCallback((sectionId) => {
        setCollapsedSections((prev) => {
            const next = new Set(prev);
            if (next.has(sectionId)) next.delete(sectionId);
            else next.add(sectionId);
            return next;
        });
    }, []);

    // DnD sensors with activation distance to allow clicks
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    // Find which status column a task belongs to
    const findTaskStatus = useCallback((taskId) => {
        const task = localTasks.find((t) => t.id === taskId);
        return task?.status;
    }, [localTasks]);

    // Persist reorder to backend
    const persistReorder = useCallback((updatedTasks) => {
        const payload = updatedTasks.map((t, index) => ({
            id: t.id,
            status: t.status,
            position: index,
            section_id: t.section_id ?? null,
        }));

        apiFetch(`/projects/${project.id}/tasks/reorder`, {
            method: 'POST',
            body: JSON.stringify({ tasks: payload }),
        }).then(async (res) => {
            if (!res.ok) return;
            const data = await res.json();
            if (data.new_tasks?.length > 0) {
                setLocalTasks((prev) => [...prev, ...data.new_tasks]);
            }
        }).catch(() => {});
    }, [project.id]);

    // Persist section reorder to backend
    const persistSectionReorder = useCallback((reorderedSections) => {
        const payload = reorderedSections.map((s, index) => ({
            id: s.id,
            position: index,
        }));

        apiFetch(`/projects/${project.id}/sections/reorder`, {
            method: 'POST',
            body: JSON.stringify({ sections: payload }),
        }).catch(() => {
            setLocalSections(serverSections);
        });
    }, [project.id, serverSections]);

    // Inline field update (optimistic)
    const handleInlineUpdate = useCallback((taskId, field, value) => {
        setLocalTasks((prev) => prev.map((t) => {
            if (t.id !== taskId) return t;
            const updated = { ...t, [field]: value };
            if (field === 'assigned_to') {
                updated.assignee = value ? users.find((u) => u.id === value) || null : null;
            }
            return updated;
        }));

        apiFetch(`/projects/${project.id}/tasks/${taskId}/patch`, {
            method: 'PATCH',
            body: JSON.stringify({ [field]: value }),
        }).then(async (res) => {
            if (!res.ok) { setLocalTasks(serverTasks); return; }
            const data = await res.json();
            if (data.recurring_task_created && data.new_task) {
                setLocalTasks((prev) => [...prev, data.new_task]);
            }
        }).catch(() => {
            setLocalTasks(serverTasks);
        });
    }, [project.id, users, serverTasks]);

    // Inline update that also handles subtasks nested inside parent tasks
    const handleSubtaskInlineUpdate = useCallback((taskId, field, value) => {
        // Check if it's a parent task
        const isParent = localTasks.some((t) => t.id === taskId);
        if (isParent) {
            handleInlineUpdate(taskId, field, value);
            return;
        }

        // It's a subtask — update it inside its parent
        setLocalTasks((prev) => prev.map((t) => {
            const subIdx = t.subtasks?.findIndex((s) => s.id === taskId);
            if (subIdx === undefined || subIdx === -1) return t;
            const updatedSubs = [...t.subtasks];
            updatedSubs[subIdx] = { ...updatedSubs[subIdx], [field]: value };
            const completedCount = updatedSubs.filter((s) => s.status === 'done').length;
            return { ...t, subtasks: updatedSubs, completed_subtasks_count: completedCount };
        }));

        apiFetch(`/projects/${project.id}/tasks/${taskId}/patch`, {
            method: 'PATCH',
            body: JSON.stringify({ [field]: value }),
        }).then(async (res) => {
            if (!res.ok) { setLocalTasks(serverTasks); return; }
            const data = await res.json();
            if (data.recurring_task_created && data.new_task) {
                setLocalTasks((prev) => [...prev, data.new_task]);
            }
        }).catch(() => {
            setLocalTasks(serverTasks);
        });
    }, [localTasks, project.id, serverTasks, handleInlineUpdate]);

    // --- List view drag over (cross-section movement) ---
    const handleListDragOver = useCallback((event) => {
        const { active, over } = event;
        if (!over || !tasksBySection) return;

        // Ignore section header drags — those only reorder sections
        if (String(active.id).startsWith('section-header-')) return;

        const activeId = active.id;
        const overId = String(over.id);

        if (activeId === over.id) return;

        let targetSectionId;
        if (overId.startsWith('section-')) {
            const part = overId.replace('section-', '');
            targetSectionId = part === 'null' ? null : parseInt(part);
        } else {
            const overTask = localTasks.find((t) => t.id === over.id);
            if (!overTask) return;
            targetSectionId = overTask.section_id;
        }

        const activeTask = localTasks.find((t) => t.id === activeId);
        if (!activeTask || activeTask.section_id === targetSectionId) return;

        setLocalTasks((prev) =>
            prev.map((t) => (t.id === activeId ? { ...t, section_id: targetSectionId } : t))
        );
    }, [localTasks, tasksBySection]);

    // --- List view drag handlers ---
    const handleListDragEnd = useCallback((event) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over || active.id === over.id) return;

        const activeIdStr = String(active.id);
        const overIdStr = String(over.id);

        // Section header drag — reorder sections
        if (activeIdStr.startsWith('section-header-') && overIdStr.startsWith('section-header-')) {
            const activeSecId = parseInt(activeIdStr.replace('section-header-', ''));
            const overSecId = parseInt(overIdStr.replace('section-header-', ''));
            const oldIndex = localSections.findIndex((s) => s.id === activeSecId);
            const newIndex = localSections.findIndex((s) => s.id === overSecId);
            if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
                const reordered = arrayMove(localSections, oldIndex, newIndex);
                setLocalSections(reordered);
                persistSectionReorder(reordered);
            }
            return;
        }

        if (tasksBySection) {
            // Section-aware drag end
            const activeTask = localTasks.find((t) => t.id === active.id);
            if (!activeTask) return;

            const sectionId = activeTask.section_id;
            const sectionTasks = localTasks.filter((t) => t.section_id === sectionId && matchesFilters(t));

            const overIdStr = String(over.id);
            const isOverSection = overIdStr.startsWith('section-');
            const overTask = !isOverSection ? localTasks.find((t) => t.id === over.id) : null;

            if (!isOverSection && overTask && overTask.section_id === sectionId) {
                // Reorder within the same section
                const oldIndex = sectionTasks.findIndex((t) => t.id === active.id);
                const newIndex = sectionTasks.findIndex((t) => t.id === over.id);

                if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
                    const reordered = arrayMove(sectionTasks, oldIndex, newIndex);
                    setLocalTasks((prev) => {
                        const updated = prev.map((t) => ({ ...t }));
                        reordered.forEach((t, i) => {
                            const idx = updated.findIndex((u) => u.id === t.id);
                            if (idx !== -1) updated[idx].position = i;
                        });
                        return updated;
                    });
                    persistReorder(reordered);
                    return;
                }
            }

            // Cross-section move — persist new section assignment with positions
            persistReorder(sectionTasks);
        } else {
            // Flat list mode (no sections)
            setLocalTasks((prev) => {
                const filtered = prev.filter(matchesFilters);
                const unfilteredIds = new Set(filtered.map((t) => t.id));

                const oldIndex = filtered.findIndex((t) => t.id === active.id);
                const newIndex = filtered.findIndex((t) => t.id === over.id);
                if (oldIndex === -1 || newIndex === -1) return prev;

                const reordered = arrayMove(filtered, oldIndex, newIndex);

                const result = [];
                let filteredIdx = 0;
                for (const t of prev) {
                    if (unfilteredIds.has(t.id)) {
                        result.push({ ...reordered[filteredIdx], position: filteredIdx });
                        filteredIdx++;
                    } else {
                        result.push(t);
                    }
                }

                persistReorder(reordered);
                return result;
            });
        }
    }, [tasksBySection, localTasks, localSections, matchesFilters, persistReorder, persistSectionReorder]);

    // --- Subtask drag handler (within a parent) ---
    const handleSubtaskDragEnd = useCallback((parentId, event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        setLocalTasks((prev) => prev.map((t) => {
            if (t.id !== parentId || !t.subtasks) return t;
            const oldIndex = t.subtasks.findIndex((s) => s.id === active.id);
            const newIndex = t.subtasks.findIndex((s) => s.id === over.id);
            if (oldIndex === -1 || newIndex === -1) return t;
            const reordered = arrayMove(t.subtasks, oldIndex, newIndex);

            // Persist subtask order
            const payload = reordered.map((s, i) => ({ id: s.id, status: s.status, position: i }));
            apiFetch(`/projects/${project.id}/tasks/reorder`, {
                method: 'POST',
                body: JSON.stringify({ tasks: payload }),
            });

            return { ...t, subtasks: reordered };
        }));
    }, [project.id]);

    // --- Board view drag handlers ---
    const handleBoardDragEnd = useCallback((event) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        const activeTask = localTasks.find((t) => t.id === active.id);
        if (!activeTask) return;

        // Determine target status: could be dropping on a column or on a task
        let targetStatus;
        const overId = String(over.id);
        if (overId.startsWith('column-')) {
            targetStatus = overId.replace('column-', '');
        } else {
            // Dropping on a task — find that task's status
            const overTask = localTasks.find((t) => t.id === over.id);
            targetStatus = overTask?.status || activeTask.status;
        }

        const sameColumn = activeTask.status === targetStatus;

        setLocalTasks((prev) => {
            const updated = prev.map((t) => ({ ...t }));
            const activeIdx = updated.findIndex((t) => t.id === active.id);

            if (sameColumn) {
                // Reorder within column
                const columnTasks = updated.filter((t) => t.status === targetStatus);
                const oldIdx = columnTasks.findIndex((t) => t.id === active.id);
                const newIdx = columnTasks.findIndex((t) => t.id === over.id);
                if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return prev;

                const reordered = arrayMove(columnTasks, oldIdx, newIdx);
                reordered.forEach((t, i) => {
                    const idx = updated.findIndex((u) => u.id === t.id);
                    updated[idx].position = i;
                });

                persistReorder(reordered);
                return updated;
            } else {
                // Move to different column
                updated[activeIdx].status = targetStatus;

                // Recalculate positions in the target column
                const targetTasks = updated.filter((t) => t.status === targetStatus);

                // If dropping on a specific task, insert before/after it
                if (!overId.startsWith('column-')) {
                    const overIdx = targetTasks.findIndex((t) => t.id === over.id);
                    const movedTask = targetTasks.find((t) => t.id === active.id);
                    const withoutMoved = targetTasks.filter((t) => t.id !== active.id);
                    withoutMoved.splice(overIdx, 0, movedTask);
                    withoutMoved.forEach((t, i) => {
                        const idx = updated.findIndex((u) => u.id === t.id);
                        updated[idx].position = i;
                    });
                    persistReorder(withoutMoved);
                } else {
                    // Dropped on empty column area — append to end
                    targetTasks.forEach((t, i) => {
                        const idx = updated.findIndex((u) => u.id === t.id);
                        updated[idx].position = i;
                    });
                    persistReorder(targetTasks);
                }

                // Reindex the source column
                const sourceTasks = updated.filter((t) => t.status === activeTask.status);
                sourceTasks.forEach((t, i) => {
                    const idx = updated.findIndex((u) => u.id === t.id);
                    updated[idx].position = i;
                });

                return updated;
            }
        });
    }, [localTasks, persistReorder]);

    const handleDragStart = useCallback((event) => {
        setActiveId(event.active.id);
    }, []);

    const handleDeleteProject = () => {
        setConfirmDelete({
            type: 'project',
            title: 'Delete Project',
            message: `Delete project "${project.name}"? This will also delete all its tasks.`,
        });
    };

    const handleDeleteTask = (taskId, title) => {
        setConfirmDelete({
            type: 'task',
            taskId,
            title: 'Delete Task',
            message: `Delete task "${title}"?`,
        });
    };

    const handleToggleComplete = useCallback((taskId) => {
        // Check parent tasks first, then subtasks
        let task = localTasks.find((t) => t.id === taskId);
        if (!task) {
            for (const parent of localTasks) {
                const sub = parent.subtasks?.find((s) => s.id === taskId);
                if (sub) { task = sub; break; }
            }
        }
        if (!task) return;
        const newStatus = task.status === 'done' ? 'to_do' : 'done';
        handleSubtaskInlineUpdate(taskId, 'status', newStatus);
    }, [localTasks, handleSubtaskInlineUpdate]);

    const handleToggleExpand = useCallback((taskId) => {
        setExpandedTasks((prev) => {
            const next = new Set(prev);
            if (next.has(taskId)) next.delete(taskId);
            else next.add(taskId);
            return next;
        });
    }, []);

    // --- Selection helpers ---
    const toggleTaskSelection = useCallback((taskId) => {
        setSelectedTasks((prev) => {
            const next = new Set(prev);
            if (next.has(taskId)) next.delete(taskId);
            else next.add(taskId);
            return next;
        });
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedTasks(new Set());
        setBulkDropdown(null);
    }, []);

    // Clear selection when filters change
    useEffect(() => {
        setSelectedTasks(new Set());
    }, [filterStatus, filterPriority, filterAssignee, filterSearch, filterDueDate]);

    // Close bulk dropdown on outside click
    useEffect(() => {
        if (!bulkDropdown) return;
        const handleClick = () => setBulkDropdown(null);
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, [bulkDropdown]);

    // --- Bulk action handler ---
    const handleBulkAction = useCallback(async (action, value) => {
        if (selectedTasks.size === 0) return;
        const taskIds = Array.from(selectedTasks);
        setBulkDropdown(null);

        if (action === 'delete') {
            setConfirmDelete({
                type: 'bulk',
                taskIds,
                title: 'Delete Tasks',
                message: `Delete ${taskIds.length} selected task${taskIds.length !== 1 ? 's' : ''}? This cannot be undone.`,
            });
            return;
        }

        // Optimistic update
        setLocalTasks((prev) => prev.map((t) => {
            if (!taskIds.includes(t.id)) return t;
            if (action === 'update_status') return { ...t, status: value };
            if (action === 'update_priority') return { ...t, priority: value };
            if (action === 'assign') {
                const assignee = value ? users.find((u) => u.id === value) : null;
                return { ...t, assigned_to: value, assignee: assignee ? { id: assignee.id, name: assignee.name } : null };
            }
            return t;
        }));

        clearSelection();

        try {
            const res = await apiFetch(`/projects/${project.id}/tasks/bulk`, {
                method: 'POST',
                body: JSON.stringify({ task_ids: taskIds, action, value }),
            });
            if (!res.ok) throw new Error('Bulk action failed');
            const data = await res.json();
            if (data.new_tasks?.length > 0) {
                setLocalTasks((prev) => [...prev, ...data.new_tasks]);
            }
        } catch {
            // Revert on failure — reload from server
            router.reload({ only: ['tasks'] });
        }
    }, [selectedTasks, project.id, users, clearSelection]);

    // Handle bulk delete confirmation
    const handleConfirmDelete = () => {
        if (confirmDelete?.type === 'bulk') {
            const taskIds = confirmDelete.taskIds;
            setLocalTasks((prev) => prev.filter((t) => !taskIds.includes(t.id)));
            clearSelection();
            setConfirmDelete(null);
            apiFetch(`/projects/${project.id}/tasks/bulk`, {
                method: 'POST',
                body: JSON.stringify({ task_ids: taskIds, action: 'delete', value: null }),
            }).catch(() => router.reload({ only: ['tasks'] }));
            return;
        }
        if (confirmDelete?.type === 'section') {
            handleConfirmDeleteSection(confirmDelete.sectionId);
            setConfirmDelete(null);
            return;
        }
        if (confirmDelete?.type === 'project') {
            router.delete(`/projects/${project.id}`);
        } else {
            router.delete(`/projects/${project.id}/tasks/${confirmDelete.taskId}`);
        }
        setConfirmDelete(null);
    };

    const hasActiveFilters = filterStatus || filterPriority || filterAssignee || filterSearch || filterDueDate;
    const activeFilterCount = [filterStatus, filterPriority, filterAssignee, filterSearch, filterDueDate].filter(Boolean).length;

    const activeTask = activeId ? localTasks.find((t) => t.id === activeId) : null;

    return (
        <AuthenticatedLayout title={project.name}>
            <PageHeader
                title={project.name}
                breadcrumbs={[
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'Projects', href: '/projects' },
                    { label: project.name },
                ]}
                actions={
                    canManageProject && (
                        <div className="flex items-center gap-2">
                            {canManageTasks && (
                                <Button variant="secondary" size="sm" onClick={() => setShowAutomation(v => !v)}>
                                    <AutomationIcon /> Automation
                                </Button>
                            )}
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => router.patch(`/projects/${project.id}/archive`, {}, { preserveScroll: true })}
                            >
                                <ArchiveIcon /> {project.status === 'archived' ? 'Unarchive' : 'Archive'}
                            </Button>
                            <LinkButton href={`/projects/${project.id}/edit`} variant="secondary" size="sm">
                                <EditIcon /> Edit
                            </LinkButton>
                            <Button variant="danger" size="sm" onClick={handleDeleteProject}>
                                <TrashIcon /> Delete
                            </Button>
                        </div>
                    )
                }
            />

            {/* Automation Rules Panel */}
            {showAutomation && canManageTasks && (
                <Card className="mb-6">
                    <AutomationRuleBuilder
                        projectId={project.id}
                        rules={automationRules || []}
                        users={users}
                        sections={localSections}
                    />
                </Card>
            )}

            {/* Project Info Toggle */}
            <Card className="mb-6">
                <button
                    type="button"
                    onClick={() => setShowDetails((v) => !v)}
                    className="flex w-full items-center justify-between text-left"
                >
                    <div className="flex items-center gap-3">
                        <StatusBadge status={project.status} type="project" />
                        {project.due_date && (
                            <span className="text-sm text-gray-500 dark:text-gray-400">Due {formatDate(project.due_date)}</span>
                        )}
                        {project.owner && !showDetails && (
                            <span className="text-sm text-gray-400 dark:text-gray-500">· {project.owner.name}</span>
                        )}
                    </div>
                    <svg className={`h-4 w-4 text-gray-400 transition-transform ${showDetails ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {showDetails && (
                    <div className="mt-4 flex flex-wrap items-start gap-6 border-t border-gray-100 dark:border-gray-700 pt-4">
                        <div className="flex-1 min-w-0">
                            {project.description && (
                                <div className="text-sm text-gray-600 dark:text-gray-300 rich-text" dangerouslySetInnerHTML={{ __html: project.description }} />
                            )}
                        </div>
                        <div className="flex flex-col items-end gap-2 text-sm text-gray-500 dark:text-gray-400">
                            <div className="flex items-center gap-2">
                                {project.owner ? (
                                    <>
                                        <Avatar name={project.owner.name} size="sm" />
                                        <span>{project.owner.name}</span>
                                        <span className="text-xs bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 rounded">Owner</span>
                                    </>
                                ) : (
                                    <span className="text-gray-400">No owner</span>
                                )}
                            </div>
                            {project.members?.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2">
                                    {project.members.map((member) => (
                                        <div key={member.id} className="flex items-center gap-1.5">
                                            <Avatar name={member.name} size="sm" />
                                            <span className="text-xs text-gray-600 dark:text-gray-400">{member.name}</span>
                                            <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded capitalize">{member.pivot.role}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Card>

            {/* View Toggle + Filters + Add Task */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex flex-wrap items-center gap-3">
                    {/* View Toggle */}
                    <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-0.5">
                        <button
                            onClick={() => setView('list')}
                            className={`inline-flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                view === 'list'
                                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                            }`}
                        >
                            <ListIcon /> <span className="hidden sm:inline">List</span>
                        </button>
                        <button
                            onClick={() => setView('board')}
                            className={`inline-flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                view === 'board'
                                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                            }`}
                        >
                            <BoardIcon /> <span className="hidden sm:inline">Board</span>
                        </button>
                        <button
                            onClick={() => setView('calendar')}
                            className={`inline-flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                view === 'calendar'
                                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                            }`}
                        >
                            <CalendarIcon /> <span className="hidden sm:inline">Calendar</span>
                        </button>
                        <button
                            onClick={() => setView('gantt')}
                            className={`inline-flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                view === 'gantt'
                                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                            }`}
                        >
                            <GanttIcon /> <span className="hidden sm:inline">Gantt</span>
                        </button>
                    </div>

                    {/* Filters */}
                    <div className="relative">
                        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            value={filterSearch}
                            onChange={(e) => setFilterSearch(e.target.value)}
                            placeholder="Search tasks..."
                            className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-36 sm:w-44"
                        />
                    </div>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                        <option value="">All Statuses</option>
                        {TASK_STATUSES.map((s) => (
                            <option key={s} value={s}>{formatLabel(s)}</option>
                        ))}
                    </select>
                    <select
                        value={filterPriority}
                        onChange={(e) => setFilterPriority(e.target.value)}
                        className="hidden sm:block rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                        <option value="">All Priorities</option>
                        {['low', 'medium', 'high', 'urgent'].map((p) => (
                            <option key={p} value={p}>{formatLabel(p)}</option>
                        ))}
                    </select>
                    <select
                        value={filterAssignee}
                        onChange={(e) => setFilterAssignee(e.target.value)}
                        className="hidden md:block rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                        <option value="">All Assignees</option>
                        {assignees.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                    <select
                        value={filterDueDate}
                        onChange={(e) => setFilterDueDate(e.target.value)}
                        className="hidden md:block rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                        <option value="">All Dates</option>
                        <option value="overdue">Overdue</option>
                        <option value="today">Due Today</option>
                        <option value="this_week">This Week</option>
                        <option value="no_date">No Due Date</option>
                    </select>
                    {hasActiveFilters && (
                        <button
                            onClick={() => { setFilterStatus(''); setFilterPriority(''); setFilterAssignee(''); setFilterSearch(''); setFilterDueDate(''); }}
                            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
                        >
                            Clear ({activeFilterCount})
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400">{filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}</span>
                    {canManageTasks && (
                        <LinkButton href={`/projects/${project.id}/tasks/create`} size="sm">
                            + Add Task
                        </LinkButton>
                    )}
                </div>
            </div>

            {/* List View */}
            {view === 'list' && (
                <Card padding={false}>
                    {filteredTasks.length > 0 ? (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCorners}
                            onDragStart={handleDragStart}
                            onDragOver={handleListDragOver}
                            onDragEnd={handleListDragEnd}
                        >
                            <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-800/50">
                                    <tr>
                                        <th className="pl-6 pr-2 py-3 w-10"></th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Title</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Priority</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Assignee</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dates</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {tasksBySection ? (
                                        <SortableContext items={localSections.map((s) => `section-header-${s.id}`)} strategy={verticalListSortingStrategy}>
                                            {tasksBySection.map((group) => (
                                                <React.Fragment key={group.id ?? '__unsectioned'}>
                                                    {/* Section header — skip for unsectioned */}
                                                    {group.id !== null && (
                                                        <SortableSectionHeader
                                                            section={{ id: group.id, name: group.name }}
                                                            isCollapsed={collapsedSections.has(group.id)}
                                                            onToggleCollapse={() => toggleSectionCollapse(group.id)}
                                                            isEditing={editingSectionId === group.id}
                                                            editingName={editingSectionName}
                                                            onEditName={setEditingSectionName}
                                                            onStartEditing={() => { setEditingSectionId(group.id); setEditingSectionName(group.name); }}
                                                            onRename={() => handleRenameSection(group.id, editingSectionName)}
                                                            onCancelEditing={() => setEditingSectionId(null)}
                                                            onAddTask={() => {}}
                                                            onDelete={() => handleDeleteSection(group.id, group.name)}
                                                            canManage={canManageTasks}
                                                            projectId={project.id}
                                                            taskCount={group.tasks.length}
                                                        />
                                                    )}
                                                    {/* Collapsed section drop zone */}
                                                    {group.id !== null && collapsedSections.has(group.id) && (
                                                        <SectionDropZone sectionId={group.id} />
                                                    )}
                                                    {/* Tasks in this section */}
                                                    {!(group.id !== null && collapsedSections.has(group.id)) && (
                                                        <>
                                                        <SortableContext items={group.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                                                            {group.tasks.map((task) => (
                                                                <React.Fragment key={task.id}>
                                                                    <SortableRow
                                                                        task={task}
                                                                        project={project}
                                                                        canEditTask={canEditTask(task)}
                                                                        canManageTasks={canManageTasks}
                                                                        canManageTaskDetails={canManageTasks}
                                                                        handleDeleteTask={handleDeleteTask}
                                                                        users={users}
                                                                        onTaskUpdate={handleInlineUpdate}
                                                                        onToggleComplete={handleToggleComplete}
                                                                        isExpanded={expandedTasks.has(task.id)}
                                                                        onToggleExpand={handleToggleExpand}
                                                                        isSelected={selectedTasks.has(task.id)}
                                                                        onToggleSelect={canManageTasks ? toggleTaskSelection : undefined}
                                                                    />
                                                                    {expandedTasks.has(task.id) && task.subtasks?.length > 0 && (
                                                                        <DndContext
                                                                            sensors={sensors}
                                                                            collisionDetection={closestCorners}
                                                                            onDragEnd={(event) => handleSubtaskDragEnd(task.id, event)}
                                                                        >
                                                                            <SortableContext items={task.subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                                                                                {task.subtasks.map((sub) => (
                                                                                    <SortableSubtaskRow
                                                                                        key={sub.id}
                                                                                        task={sub}
                                                                                        project={project}
                                                                                        canEditTask={canEditTask(sub)}
                                                                                        canManageTasks={canManageTasks}
                                                                                        canManageTaskDetails={canManageTasks}
                                                                                        handleDeleteTask={handleDeleteTask}
                                                                                        onToggleComplete={handleToggleComplete}
                                                                                        users={users}
                                                                                        onTaskUpdate={handleSubtaskInlineUpdate}
                                                                                    />
                                                                                ))}
                                                                            </SortableContext>
                                                                        </DndContext>
                                                                    )}
                                                                    {expandedTasks.has(task.id) && canManageTasks && (
                                                                        <tr className="bg-gray-50/50 dark:bg-gray-800/30">
                                                                            <td colSpan={7} className="pl-14 py-2">
                                                                                <Link
                                                                                    href={`/projects/${project.id}/tasks/create?parent_id=${task.id}`}
                                                                                    className="text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                                                                >
                                                                                    + Add subtask
                                                                                </Link>
                                                                            </td>
                                                                        </tr>
                                                                    )}
                                                                </React.Fragment>
                                                            ))}
                                                        </SortableContext>
                                                        <SectionDropZone sectionId={group.id} />
                                                        </>
                                                    )}
                                                </React.Fragment>
                                            ))}
                                            {/* Add section button */}
                                            {canManageTasks && (
                                                <tr>
                                                    <td colSpan={7} className="px-6 py-2">
                                                        {addingSectionName !== null ? (
                                                            <input
                                                                autoFocus
                                                                className="text-sm bg-white dark:bg-gray-700 border border-primary-300 dark:border-primary-600 rounded px-2 py-1 text-gray-900 dark:text-gray-100 outline-none w-64"
                                                                placeholder="Section name..."
                                                                value={addingSectionName}
                                                                onChange={(e) => setAddingSectionName(e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') handleCreateSection(addingSectionName);
                                                                    if (e.key === 'Escape') setAddingSectionName(null);
                                                                }}
                                                                onBlur={() => { if (addingSectionName?.trim()) handleCreateSection(addingSectionName); else setAddingSectionName(null); }}
                                                            />
                                                        ) : (
                                                            <button
                                                                onClick={() => setAddingSectionName('')}
                                                                className="text-sm text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                                            >
                                                                + Add section
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                        </SortableContext>
                                    ) : (
                                        <>
                                            <SortableContext items={filteredTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                                                {filteredTasks.map((task) => (
                                                    <React.Fragment key={task.id}>
                                                        <SortableRow
                                                            task={task}
                                                            project={project}
                                                            canEditTask={canEditTask(task)}
                                                            canManageTasks={canManageTasks}
                                                            canManageTaskDetails={canManageTasks}
                                                            handleDeleteTask={handleDeleteTask}
                                                            users={users}
                                                            onTaskUpdate={handleInlineUpdate}
                                                            onToggleComplete={handleToggleComplete}
                                                            isExpanded={expandedTasks.has(task.id)}
                                                            onToggleExpand={handleToggleExpand}
                                                            isSelected={selectedTasks.has(task.id)}
                                                            onToggleSelect={canManageTasks ? toggleTaskSelection : undefined}
                                                        />
                                                        {expandedTasks.has(task.id) && task.subtasks?.length > 0 && (
                                                            <DndContext
                                                                sensors={sensors}
                                                                collisionDetection={closestCorners}
                                                                onDragEnd={(event) => handleSubtaskDragEnd(task.id, event)}
                                                            >
                                                                <SortableContext items={task.subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                                                                    {task.subtasks.map((sub) => (
                                                                        <SortableSubtaskRow
                                                                            key={sub.id}
                                                                            task={sub}
                                                                            project={project}
                                                                            canEditTask={canEditTask(sub)}
                                                                            canManageTasks={canManageTasks}
                                                                            canManageTaskDetails={canManageTasks}
                                                                            handleDeleteTask={handleDeleteTask}
                                                                            onToggleComplete={handleToggleComplete}
                                                                            users={users}
                                                                            onTaskUpdate={handleSubtaskInlineUpdate}
                                                                        />
                                                                    ))}
                                                                </SortableContext>
                                                            </DndContext>
                                                        )}
                                                        {expandedTasks.has(task.id) && canManageTasks && (
                                                            <tr className="bg-gray-50/50 dark:bg-gray-800/30">
                                                                <td colSpan={7} className="pl-14 py-2">
                                                                    <Link
                                                                        href={`/projects/${project.id}/tasks/create?parent_id=${task.id}`}
                                                                        className="text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                                                    >
                                                                        + Add subtask
                                                                    </Link>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                ))}
                                            </SortableContext>
                                            {/* Add section button when no sections exist yet */}
                                            {canManageTasks && (
                                                <tr>
                                                    <td colSpan={7} className="px-6 py-2">
                                                        {addingSectionName !== null ? (
                                                            <input
                                                                autoFocus
                                                                className="text-sm bg-white dark:bg-gray-700 border border-primary-300 dark:border-primary-600 rounded px-2 py-1 text-gray-900 dark:text-gray-100 outline-none w-64"
                                                                placeholder="Section name..."
                                                                value={addingSectionName}
                                                                onChange={(e) => setAddingSectionName(e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') handleCreateSection(addingSectionName);
                                                                    if (e.key === 'Escape') setAddingSectionName(null);
                                                                }}
                                                                onBlur={() => { if (addingSectionName?.trim()) handleCreateSection(addingSectionName); else setAddingSectionName(null); }}
                                                            />
                                                        ) : (
                                                            <button
                                                                onClick={() => setAddingSectionName('')}
                                                                className="text-sm text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                                            >
                                                                + Add section
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    )}
                                </tbody>
                            </table>
                            </div>
                            <DragOverlay>
                                {activeTask ? (
                                    <table className="min-w-full">
                                        <tbody>
                                            <tr className="bg-white dark:bg-gray-800 shadow-lg rounded-lg">
                                                <td className="pl-6 pr-2 py-4 w-10"></td>
                                                <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">{activeTask.title}</td>
                                                <td className="px-6 py-4 text-sm">
                                                    <StatusBadge status={activeTask.status} type="task" />
                                                </td>
                                                <td className="px-6 py-4 text-sm">
                                                    <PriorityBadge priority={activeTask.priority} />
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                                                    {activeTask.assignee ? activeTask.assignee.name : 'Unassigned'}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                                    {activeTask.start_date && activeTask.due_date ? `${formatDate(activeTask.start_date)} → ${formatDate(activeTask.due_date)}` : formatDate(activeTask.due_date) || formatDate(activeTask.start_date) || '—'}
                                                </td>
                                                <td className="px-6 py-4"></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                ) : null}
                            </DragOverlay>
                        </DndContext>
                    ) : (
                        <EmptyState
                            title={hasActiveFilters ? 'No matching tasks' : 'No tasks yet'}
                            description={hasActiveFilters ? 'Try adjusting your filters.' : 'Get started by adding the first task to this project.'}
                            action={
                                !hasActiveFilters && canManageTasks && (
                                    <LinkButton href={`/projects/${project.id}/tasks/create`} size="sm">
                                        + Add Task
                                    </LinkButton>
                                )
                            }
                        />
                    )}
                </Card>
            )}

            {/* Board View */}
            {view === 'board' && (
                <BoardScrollWrapper>
                    {(boardScrollRef) => (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCorners}
                            onDragStart={handleDragStart}
                            onDragEnd={handleBoardDragEnd}
                        >
                            <div ref={boardScrollRef} className="overflow-x-auto pb-2 board-no-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
                                <div className="inline-flex gap-4 min-w-full">
                                    {TASK_STATUSES.map((status) => (
                                        <KanbanColumn
                                            key={status}
                                            status={status}
                                            tasks={tasksByStatus[status]}
                                            projectId={project.id}
                                            canManageTasks={canManageTasks}
                                            auth={auth}
                                            onDeleteTask={handleDeleteTask}
                                            onToggleComplete={handleToggleComplete}
                                            selectedTasks={selectedTasks}
                                            onToggleSelect={canManageTasks ? toggleTaskSelection : undefined}
                                        />
                                    ))}
                                </div>
                            </div>
                            <DragOverlay>
                                {activeTask ? (
                                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-lg w-65 rotate-2">
                                        <div className="flex items-center gap-1.5 mb-2">
                                            <PriorityBadge priority={activeTask.priority} />
                                        </div>
                                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2 line-clamp-2">{activeTask.title}</p>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                                {activeTask.assignee && <Avatar name={activeTask.assignee.name} size="sm" />}
                                                <span className="text-xs text-gray-500 dark:text-gray-400">{activeTask.assignee?.name || 'Unassigned'}</span>
                                            </div>
                                            {(activeTask.start_date || activeTask.due_date) && (
                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                    {activeTask.start_date && activeTask.due_date ? `${formatDate(activeTask.start_date)} → ${formatDate(activeTask.due_date)}` : formatDate(activeTask.due_date) || formatDate(activeTask.start_date)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ) : null}
                            </DragOverlay>
                        </DndContext>
                    )}
                </BoardScrollWrapper>
            )}

            {/* Calendar View */}
            {view === 'calendar' && (() => {
                const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                const PRIORITY_PILL = {
                    urgent: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
                    high: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
                    medium: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
                    low: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-700/40 dark:text-gray-300 dark:border-gray-600',
                };
                const PRIORITY_DOT = { urgent: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-blue-500', low: 'bg-gray-400' };
                const { month, year } = calendarMonth;
                const today = new Date();
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

                // Flatten all tasks (parents + subtasks) with due dates
                const allTasks = [];
                filteredTasks.forEach((t) => {
                    allTasks.push(t);
                    if (t.subtasks) t.subtasks.forEach((s) => allTasks.push(s));
                });

                // Group by date
                const tasksByDate = new Map();
                allTasks.forEach((t) => {
                    const key = t.due_date?.split('T')[0];
                    if (!key) return;
                    if (!tasksByDate.has(key)) tasksByDate.set(key, []);
                    tasksByDate.get(key).push(t);
                });

                // Build calendar grid
                const first = new Date(year, month - 1, 1);
                const startDay = first.getDay();
                const daysInMonth = new Date(year, month, 0).getDate();
                const daysInPrevMonth = new Date(year, month - 1, 0).getDate();
                const cells = [];
                for (let i = startDay - 1; i >= 0; i--) {
                    const d = daysInPrevMonth - i;
                    const m = month === 1 ? 12 : month - 1;
                    const y = month === 1 ? year - 1 : year;
                    cells.push({ date: new Date(y, m - 1, d), dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, outside: true });
                }
                for (let d = 1; d <= daysInMonth; d++) {
                    cells.push({ date: new Date(year, month - 1, d), dateStr: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`, outside: false });
                }
                const remaining = 7 - (cells.length % 7);
                if (remaining < 7) {
                    const nm = month === 12 ? 1 : month + 1;
                    const ny = month === 12 ? year + 1 : year;
                    for (let d = 1; d <= remaining; d++) {
                        cells.push({ date: new Date(ny, nm - 1, d), dateStr: `${ny}-${String(nm).padStart(2, '0')}-${String(d).padStart(2, '0')}`, outside: true });
                    }
                }
                const weeks = [];
                for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

                return (
                    <div>
                        {/* Month navigation */}
                        <div className="flex items-center gap-2 mb-4">
                            <button
                                onClick={() => setCalendarMonth((p) => p.month === 1 ? { month: 12, year: p.year - 1 } : { month: p.month - 1, year: p.year })}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 min-w-[180px] text-center">
                                {MONTHS[month - 1]} {year}
                            </h3>
                            <button
                                onClick={() => setCalendarMonth((p) => p.month === 12 ? { month: 1, year: p.year + 1 } : { month: p.month + 1, year: p.year })}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                            </button>
                            <button
                                onClick={() => { const now = new Date(); setCalendarMonth({ month: now.getMonth() + 1, year: now.getFullYear() }); }}
                                className="ml-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                                Today
                            </button>
                        </div>

                        {/* Calendar grid */}
                        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
                            <div className="min-w-[640px]">
                            <div className="grid grid-cols-7 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                                {DAYS.map((day) => (
                                    <div key={day} className="px-2 py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{day}</div>
                                ))}
                            </div>
                            {weeks.map((week, wi) => (
                                <div key={wi} className="grid grid-cols-7 divide-x divide-gray-200 dark:divide-gray-700">
                                    {week.map((cell) => {
                                        const dayTasks = tasksByDate.get(cell.dateStr) || [];
                                        const isToday = cell.dateStr === todayStr;
                                        const visible = dayTasks.slice(0, 3);
                                        const overflow = dayTasks.length - 3;
                                        return (
                                            <div
                                                key={cell.dateStr}
                                                className={`min-h-[100px] border-t border-gray-200 dark:border-gray-700 p-1 ${cell.outside ? 'bg-gray-50/50 dark:bg-gray-800/30' : 'bg-white dark:bg-gray-800'}`}
                                            >
                                                <div className="flex items-center justify-between mb-0.5">
                                                    <span className={`text-xs font-medium h-6 w-6 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white' : cell.outside ? 'text-gray-400 dark:text-gray-600' : 'text-gray-700 dark:text-gray-300'}`}>
                                                        {cell.date.getDate()}
                                                    </span>
                                                    {dayTasks.length > 0 && cell.outside && (
                                                        <span className="flex gap-0.5">
                                                            {dayTasks.slice(0, 3).map((t) => (
                                                                <span key={t.id} className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[t.priority] || PRIORITY_DOT.low}`} />
                                                            ))}
                                                        </span>
                                                    )}
                                                </div>
                                                {!cell.outside && (
                                                    <div className="space-y-0.5">
                                                        {visible.map((task) => (
                                                            <Link
                                                                key={task.id}
                                                                href={`/projects/${project.id}/tasks/${task.id}/edit`}
                                                                className={`block w-full text-left text-[11px] leading-tight px-1.5 py-0.5 rounded border truncate hover:opacity-80 transition-opacity ${PRIORITY_PILL[task.priority] || PRIORITY_PILL.low}`}
                                                                title={task.title}
                                                            >
                                                                {task.title}
                                                            </Link>
                                                        ))}
                                                        {overflow > 0 && (
                                                            <p className="text-[10px] text-gray-500 dark:text-gray-400 px-1">+{overflow} more</p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                        </div>

                        {/* Legend */}
                        <div className="flex items-center gap-4 mt-3 px-1">
                            <span className="text-xs text-gray-500 dark:text-gray-400">Priority:</span>
                            {Object.entries(PRIORITY_DOT).map(([key, cls]) => (
                                <span key={key} className="flex items-center gap-1">
                                    <span className={`h-2 w-2 rounded-full ${cls}`} />
                                    <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">{key}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* Gantt View */}
            {view === 'gantt' && (() => {
                const PRIORITY_BAR = {
                    urgent: 'bg-red-500',
                    high: 'bg-orange-500',
                    medium: 'bg-blue-500',
                    low: 'bg-gray-400',
                };
                const STATUS_OPACITY = { done: 'opacity-50', cancelled: 'opacity-30' };

                // Flatten all tasks with due dates for range calculation
                const allTasks = [];
                filteredTasks.forEach((t) => {
                    allTasks.push({ ...t, isSubtask: false });
                    if (t.subtasks) t.subtasks.forEach((s) => allTasks.push({ ...s, isSubtask: true, parentTitle: t.title }));
                });

                const tasksWithDate = allTasks.filter((t) => t.due_date || t.start_date);
                const tasksNoDate = allTasks.filter((t) => !t.due_date && !t.start_date);

                // Calculate date range
                let rangeStart, rangeEnd;
                if (tasksWithDate.length > 0) {
                    const dates = tasksWithDate.flatMap((t) => [t.start_date, t.due_date].filter(Boolean).map((d) => new Date(d.split('T')[0])));
                    const minDate = new Date(Math.min(...dates));
                    const maxDate = new Date(Math.max(...dates));
                    // Pad range by 3 days on each side
                    rangeStart = new Date(minDate);
                    rangeStart.setDate(rangeStart.getDate() - 3);
                    rangeEnd = new Date(maxDate);
                    rangeEnd.setDate(rangeEnd.getDate() + 3);
                    // Minimum 14 days range
                    const diffDays = Math.ceil((rangeEnd - rangeStart) / (1000 * 60 * 60 * 24));
                    if (diffDays < 14) {
                        rangeEnd = new Date(rangeStart);
                        rangeEnd.setDate(rangeEnd.getDate() + 14);
                    }
                } else {
                    const now = new Date();
                    rangeStart = new Date(now);
                    rangeStart.setDate(rangeStart.getDate() - 3);
                    rangeEnd = new Date(now);
                    rangeEnd.setDate(rangeEnd.getDate() + 14);
                }

                // Generate day columns
                const days = [];
                const d = new Date(rangeStart);
                while (d <= rangeEnd) {
                    days.push(new Date(d));
                    d.setDate(d.getDate() + 1);
                }

                const todayStr = (() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; })();
                const COL_WIDTH = 40; // px per day column
                const totalWidth = days.length * COL_WIDTH;

                // Group days by month for header
                const monthGroups = [];
                let current = null;
                days.forEach((day, idx) => {
                    const key = `${day.getFullYear()}-${day.getMonth()}`;
                    if (!current || current.key !== key) {
                        current = { key, label: day.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), start: idx, span: 1 };
                        monthGroups.push(current);
                    } else {
                        current.span++;
                    }
                });

                const getDayOffset = (dateStr) => {
                    const target = new Date(dateStr.split('T')[0]);
                    return Math.round((target - rangeStart) / (1000 * 60 * 60 * 24));
                };

                return (
                    <div>
                        {tasksWithDate.length === 0 && tasksNoDate.length === 0 ? (
                            <EmptyState
                                title="No tasks to display"
                                description="Add tasks with due dates to see them on the Gantt chart."
                            />
                        ) : (
                            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <div style={{ minWidth: `${240 + totalWidth}px` }}>
                                        {/* Header: month row */}
                                        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                                            <div className="w-60 shrink-0 px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase border-r border-gray-200 dark:border-gray-700">Task</div>
                                            <div className="flex">
                                                {monthGroups.map((mg) => (
                                                    <div key={mg.key} style={{ width: `${mg.span * COL_WIDTH}px` }} className="text-center text-[10px] font-semibold text-gray-500 dark:text-gray-400 py-1.5 border-r border-gray-100 dark:border-gray-700/50">{mg.label}</div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Header: day row */}
                                        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                                            <div className="w-60 shrink-0 border-r border-gray-200 dark:border-gray-700" />
                                            <div className="flex">
                                                {days.map((day) => {
                                                    const ds = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                                                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                                    return (
                                                        <div
                                                            key={ds}
                                                            style={{ width: `${COL_WIDTH}px` }}
                                                            className={`text-center text-[10px] py-1 border-r border-gray-100 dark:border-gray-700/50 ${ds === todayStr ? 'bg-blue-50 dark:bg-blue-900/20 font-bold text-blue-600 dark:text-blue-400' : isWeekend ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'}`}
                                                        >
                                                            <div>{day.getDate()}</div>
                                                            <div className="text-[9px]">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][day.getDay()]}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Task rows */}
                                        {tasksWithDate.map((task) => {
                                            const startOffset = task.start_date ? getDayOffset(task.start_date) : null;
                                            const endOffset = task.due_date ? getDayOffset(task.due_date) : null;
                                            const hasRange = startOffset !== null && endOffset !== null;
                                            const barOffset = hasRange ? startOffset : (endOffset ?? startOffset);
                                            const barSpan = hasRange ? Math.max(endOffset - startOffset + 1, 1) : 1;
                                            const barWidth = hasRange ? barSpan * COL_WIDTH : 96; // 96px = w-24 for single-date pill
                                            const isDone = task.status === 'done';
                                            const barColor = PRIORITY_BAR[task.priority] || PRIORITY_BAR.low;
                                            const opacityCls = STATUS_OPACITY[task.status] || '';
                                            const tooltipDate = hasRange ? `${formatDate(task.start_date)} → ${formatDate(task.due_date)}` : task.due_date ? `Due: ${formatDate(task.due_date)}` : `Start: ${formatDate(task.start_date)}`;
                                            return (
                                                <div key={task.id} className={`flex border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${opacityCls}`}>
                                                    <div className={`w-60 shrink-0 px-3 py-2 border-r border-gray-200 dark:border-gray-700 ${task.isSubtask ? 'pl-8' : ''}`}>
                                                        <Link
                                                            href={`/projects/${project.id}/tasks/${task.id}/edit`}
                                                            className={`text-sm truncate block max-w-full hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${isDone ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}
                                                            title={task.title}
                                                        >
                                                            {task.isSubtask && (
                                                                <svg className="inline h-3 w-3 mr-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                                            )}
                                                            {task.title}
                                                        </Link>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            {task.assignee && <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{task.assignee.name}</span>}
                                                        </div>
                                                    </div>
                                                    <div className="relative flex-1" style={{ width: `${totalWidth}px` }}>
                                                        {/* Grid lines */}
                                                        <div className="absolute inset-0 flex">
                                                            {days.map((day) => {
                                                                const ds = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                                                                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                                                return (
                                                                    <div
                                                                        key={ds}
                                                                        style={{ width: `${COL_WIDTH}px` }}
                                                                        className={`border-r border-gray-100 dark:border-gray-700/30 ${ds === todayStr ? 'bg-blue-50/50 dark:bg-blue-900/10' : isWeekend ? 'bg-gray-50/30 dark:bg-gray-800/20' : ''}`}
                                                                    />
                                                                );
                                                            })}
                                                        </div>
                                                        {/* Task bar */}
                                                        {barOffset >= 0 && barOffset < days.length && (
                                                            <Link
                                                                href={`/projects/${project.id}/tasks/${task.id}/edit`}
                                                                className="absolute top-1/2 -translate-y-1/2 group z-10"
                                                                style={{ left: `${barOffset * COL_WIDTH + (hasRange ? 0 : COL_WIDTH / 2 - 12)}px` }}
                                                                title={`${task.title} — ${tooltipDate} — ${formatLabel(task.status)}`}
                                                            >
                                                                <div
                                                                    className={`h-5 rounded-full ${barColor} shadow-sm group-hover:shadow-md transition-shadow flex items-center justify-center`}
                                                                    style={{ width: `${barWidth}px` }}
                                                                >
                                                                    <span className="text-[9px] text-white font-medium truncate px-1.5">{task.title}</span>
                                                                </div>
                                                            </Link>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* Tasks without due date */}
                                        {tasksNoDate.length > 0 && (
                                            <>
                                                <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
                                                    <div className="w-60 shrink-0 px-3 py-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">No Dates</div>
                                                    <div className="flex-1" />
                                                </div>
                                                {tasksNoDate.map((task) => (
                                                    <div key={task.id} className="flex border-b border-gray-100 dark:border-gray-700/50">
                                                        <div className={`w-60 shrink-0 px-3 py-2 border-r border-gray-200 dark:border-gray-700 ${task.isSubtask ? 'pl-8' : ''}`}>
                                                            <Link
                                                                href={`/projects/${project.id}/tasks/${task.id}/edit`}
                                                                className="text-sm text-gray-500 dark:text-gray-400 truncate block hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                                            >
                                                                {task.isSubtask && (
                                                                    <svg className="inline h-3 w-3 mr-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                                                )}
                                                                {task.title}
                                                            </Link>
                                                        </div>
                                                        <div className="flex-1 flex items-center px-4">
                                                            <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">No dates set</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Legend */}
                        <div className="flex items-center gap-4 mt-3 px-1">
                            <span className="text-xs text-gray-500 dark:text-gray-400">Priority:</span>
                            {Object.entries(PRIORITY_BAR).map(([key, cls]) => (
                                <span key={key} className="flex items-center gap-1">
                                    <span className={`h-2 w-6 rounded-full ${cls}`} />
                                    <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">{key}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* Bulk Actions Toolbar */}
            {selectedTasks.size > 0 && canManageTasks && (
                <div onClick={(e) => e.stopPropagation()} className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 dark:bg-gray-700 text-white rounded-xl shadow-2xl px-4 py-3 flex flex-wrap items-center gap-3 max-w-[calc(100vw-2rem)]">
                    <span className="text-sm font-medium whitespace-nowrap">{selectedTasks.size} task{selectedTasks.size !== 1 ? 's' : ''} selected</span>
                    <div className="w-px h-5 bg-gray-600" />

                    {/* Status dropdown */}
                    <div className="relative">
                        <button onClick={() => setBulkDropdown(bulkDropdown === 'status' ? null : 'status')} className="text-sm px-3 py-1.5 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors">Status</button>
                        {bulkDropdown === 'status' && (
                            <div className="absolute bottom-full mb-2 left-0 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 py-1 min-w-[140px]">
                                {TASK_STATUSES.map((s) => (
                                    <button key={s} onClick={() => handleBulkAction('update_status', s)} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                                        {formatLabel(s)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Priority dropdown */}
                    <div className="relative">
                        <button onClick={() => setBulkDropdown(bulkDropdown === 'priority' ? null : 'priority')} className="text-sm px-3 py-1.5 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors">Priority</button>
                        {bulkDropdown === 'priority' && (
                            <div className="absolute bottom-full mb-2 left-0 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 py-1 min-w-[120px]">
                                {['low', 'medium', 'high', 'urgent'].map((p) => (
                                    <button key={p} onClick={() => handleBulkAction('update_priority', p)} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 capitalize">
                                        {formatLabel(p)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Assign dropdown */}
                    <div className="relative">
                        <button onClick={() => setBulkDropdown(bulkDropdown === 'assign' ? null : 'assign')} className="text-sm px-3 py-1.5 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors">Assign</button>
                        {bulkDropdown === 'assign' && (
                            <div className="absolute bottom-full mb-2 left-0 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 py-1 min-w-[160px] max-h-48 overflow-y-auto">
                                <button onClick={() => handleBulkAction('assign', null)} className="w-full text-left px-3 py-1.5 text-sm text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 italic">
                                    Unassign
                                </button>
                                {users.map((u) => (
                                    <button key={u.id} onClick={() => handleBulkAction('assign', u.id)} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                                        {u.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="w-px h-5 bg-gray-600" />

                    {/* Delete */}
                    <button onClick={() => handleBulkAction('delete')} className="text-sm px-3 py-1.5 rounded-lg text-red-400 hover:bg-red-900/30 transition-colors">Delete</button>

                    {/* Close */}
                    <button onClick={clearSelection} className="p-1 rounded hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors ml-1" title="Clear selection">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            {/* Confirm Delete Modal */}
            <ConfirmModal
                isOpen={!!confirmDelete}
                onClose={() => setConfirmDelete(null)}
                onConfirm={handleConfirmDelete}
                title={confirmDelete?.title}
                message={confirmDelete?.message}
            />
        </AuthenticatedLayout>
    );
}
