import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
    horizontalListSortingStrategy,
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
import CustomFieldManager from '../../Components/CustomFieldManager';
import StatusPicker from '../../Components/StatusPicker';
import PriorityPicker from '../../Components/PriorityPicker';
import AssigneePicker from '../../Components/AssigneePicker';
import InlineDatePicker from '../../Components/InlineDatePicker';
import CelebrationEffect from '../../Components/CelebrationEffect';
import InlineCustomFieldEditor from '../../Components/InlineCustomFieldEditor';
import TaskContextMenu from '../../Components/TaskContextMenu';
import TaskDetailPanel from '../../Components/TaskDetailPanel';
import ProjectContextMenu from '../../Components/ProjectContextMenu';
import DuplicateProjectModal from '../../Components/DuplicateProjectModal';
import Tooltip from '../../Components/Tooltip';
import { formatLabel, formatDate, apiFetch } from '../../utils';
import { computeAllFormulas, formatFormulaResult } from '../../formulaEngine';
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

const DashboardIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
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

// Render a custom field value for a task row
function renderCustomFieldValue(task, customField) {
    if (customField.type === 'formula') {
        const val = customField._formulaValue;
        if (val == null) return <span className="text-gray-300 dark:text-gray-600">—</span>;
        return <span>{formatFormulaResult(val, customField.config)}</span>;
    }

    const cfValues = task.custom_field_values || [];
    const cfv = cfValues.find(v => v.custom_field_id === customField.id);
    if (!cfv) return <span className="text-gray-300 dark:text-gray-600">—</span>;

    switch (customField.type) {
        case 'text':
        case 'textarea':
            return cfv.value_text || '—';
        case 'number':
            if (cfv.value_number == null) return '—';
            return customField.config?.decimal_places != null
                ? Number(cfv.value_number).toFixed(customField.config.decimal_places)
                : cfv.value_number;
        case 'date':
            return cfv.value_date ? formatDate(cfv.value_date) : '—';
        case 'single_select': {
            const opt = cfv.selected_option;
            if (!opt) return '—';
            return (
                <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    style={opt.color ? { backgroundColor: opt.color + '20', color: opt.color } : undefined}
                >
                    {opt.color && <span className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: opt.color }} />}
                    {opt.label}
                </span>
            );
        }
        case 'multi_select': {
            const selectedIds = cfv.value_json || [];
            if (!selectedIds.length) return '—';
            const options = (customField.options || []).filter(o => selectedIds.map(String).includes(String(o.id)));
            return (
                <div className="flex flex-wrap gap-1">
                    {options.map(opt => (
                        <span
                            key={opt.id}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                            style={opt.color ? { backgroundColor: opt.color + '20', color: opt.color } : undefined}
                        >
                            {opt.color && <span className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: opt.color }} />}
                            {opt.label}
                        </span>
                    ))}
                </div>
            );
        }
        default:
            return '—';
    }
}

// Sortable subtask row
function SortableSubtaskRow({ task, project, canEditTask, canManageTasks, canManageTaskDetails, handleDeleteTask, onToggleComplete, users, onTaskUpdate, onCustomFieldUpdate, isSelected, onSelect, isFocused, customFields = [], onContextMenu, onOpenDetail, columnOrder = [], formulaResults = {}, columnWidths = {} }) {
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

    const stickyBg = isDragging
        ? 'bg-blue-50 dark:bg-blue-900/30'
        : 'bg-gray-50 dark:bg-gray-800 group-hover:bg-gray-100 dark:group-hover:bg-gray-700/50';

    const [openPopover, setOpenPopover] = useState(null);

    const togglePopover = (name) => (forceClose) => {
        if (forceClose === false) { setOpenPopover(null); return; }
        setOpenPopover((prev) => prev === name ? null : name);
    };

    const handleFieldUpdate = (field, value) => {
        setOpenPopover(null);
        onTaskUpdate(task.id, field, value);
    };

    const colStyle = (colId) => {
        const w = columnWidths[colId];
        return w ? { width: w, minWidth: w, maxWidth: w } : undefined;
    };

    const renderCell = (colId) => {
        const cStyle = colStyle(colId);
        switch (colId) {
            case 'status':
                return (
                    <td key="status" className="px-6 py-3 text-sm overflow-hidden" style={cStyle}>
                        {canEditTask ? (
                            <StatusPicker currentStatus={task.status} isOpen={openPopover === 'status'} onToggle={togglePopover('status')} onSelect={(status) => handleFieldUpdate('status', status)} />
                        ) : (
                            <StatusBadge status={task.status} type="task" />
                        )}
                    </td>
                );
            case 'priority':
                return (
                    <td key="priority" className="px-6 py-3 text-sm overflow-hidden" style={cStyle}>
                        {canEditTask ? (
                            <PriorityPicker currentPriority={task.priority} isOpen={openPopover === 'priority'} onToggle={togglePopover('priority')} onSelect={(priority) => handleFieldUpdate('priority', priority)} />
                        ) : (
                            <PriorityBadge priority={task.priority} />
                        )}
                    </td>
                );
            case 'assignee':
                return (
                    <td key="assignee" className="px-6 py-3 text-sm overflow-hidden" style={cStyle}>
                        {canManageTaskDetails ? (
                            <AssigneePicker currentAssignee={task.assignee} users={users} isOpen={openPopover === 'assignee'} onToggle={togglePopover('assignee')} onSelect={(user) => handleFieldUpdate('assigned_to', user ? user.id : null)} />
                        ) : (
                            <div className="flex items-center gap-2 overflow-hidden">
                                {task.assignee ? (
                                    <>
                                        <Avatar name={task.assignee.name} size="sm" />
                                        <span className="text-gray-700 dark:text-gray-300 text-xs truncate">{task.assignee.name}</span>
                                    </>
                                ) : (
                                    <span className="text-gray-400 text-xs">Unassigned</span>
                                )}
                            </div>
                        )}
                    </td>
                );
            case 'dates':
                return (
                    <td key="dates" className="px-6 py-3 text-sm overflow-hidden" style={cStyle}>
                        <div className="flex items-center gap-1 overflow-hidden">
                            {canManageTaskDetails ? (
                                <>
                                    {task.start_date && (
                                        <>
                                            <InlineDatePicker currentDate={task.start_date} isOpen={openPopover === 'start_date'} onToggle={togglePopover('start_date')} onSelect={(date) => handleFieldUpdate('start_date', date)} onClear={() => handleFieldUpdate('start_date', null)} />
                                            <span className="text-gray-300 dark:text-gray-600">→</span>
                                        </>
                                    )}
                                    <InlineDatePicker currentDate={task.due_date} isOpen={openPopover === 'due_date'} onToggle={togglePopover('due_date')} onSelect={(date) => handleFieldUpdate('due_date', date)} isOverdue={isOverdue} />
                                    {!task.start_date && (
                                        <Tooltip content="Add start date"><button onClick={(e) => { e.stopPropagation(); togglePopover('start_date')(); }} onPointerDown={(e) => e.stopPropagation()} className="ml-1 text-gray-300 dark:text-gray-600 hover:text-primary-500 dark:hover:text-primary-400 transition-colors">
                                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                            </button></Tooltip>
                                    )}
                                    {!task.start_date && openPopover === 'start_date' && (
                                        <InlineDatePicker currentDate={null} isOpen={true} onToggle={togglePopover('start_date')} onSelect={(date) => handleFieldUpdate('start_date', date)} hidden />
                                    )}
                                </>
                            ) : (
                                <span className={`text-xs truncate ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                                    {task.start_date && task.due_date ? `${formatDate(task.start_date)} → ${formatDate(task.due_date)}` : formatDate(task.due_date) || formatDate(task.start_date) || '—'}
                                </span>
                            )}
                        </div>
                    </td>
                );
            default:
                if (colId.startsWith('cf-')) {
                    const cfId = Number(colId.replace('cf-', ''));
                    const cf = customFields.find(f => f.id === cfId);
                    if (!cf) return null;
                    const cfDisplay = cf.type === 'formula' ? { ...cf, _formulaValue: formulaResults[task.id]?.[cf.id] ?? null } : cf;
                    return (
                        <td key={colId} className="px-6 py-3 text-sm text-gray-700 dark:text-gray-300 overflow-hidden" style={cStyle}>
                            <div className="truncate">
                            {canEditTask && cf.type !== 'formula' ? (
                                <InlineCustomFieldEditor task={task} customField={cfDisplay} isOpen={openPopover === `cf-${cf.id}`} onToggle={togglePopover(`cf-${cf.id}`)} onUpdate={onCustomFieldUpdate} formatDate={formatDate} />
                            ) : (
                                renderCustomFieldValue(task, cfDisplay)
                            )}
                            </div>
                        </td>
                    );
                }
                return null;
        }
    };

    return (
        <tr ref={setNodeRef} style={style} {...attributes} {...listeners} data-task-id={task.id} onClick={(e) => { if (e.target.closest('button, input, select, [role="listbox"], [data-no-select]')) return; if (onSelect) { e.preventDefault(); onSelect(task.id, e); } }} onContextMenu={(e) => onContextMenu?.(e, task)} className={`group hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors bg-gray-50/50 dark:bg-gray-800/30 cursor-grab active:cursor-grabbing touch-none ${isDragging ? 'z-50 shadow-md' : ''} ${isSelected ? 'bg-primary-100 dark:bg-primary-900/30' : ''} ${isFocused ? 'ring-2 ring-inset ring-primary-400' : ''}`}>
            <td className={`sticky left-0 z-10 ${stickyBg} relative pl-6 pr-2 py-3 w-[52px] min-w-[52px]`}>
                <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-primary-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <Tooltip content={isDone ? 'Mark incomplete' : 'Mark complete'}>
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleComplete(task.id, e); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className={`h-4 w-4 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                            isDone
                                ? 'bg-green-500 border-green-500 text-white scale-110'
                                : 'border-gray-300 dark:border-gray-500 text-transparent hover:border-green-400 hover:text-green-400 hover:scale-110'
                        }`}
                    >
                        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </button>
                </Tooltip>
            </td>
            <td className={`sticky left-[52px] z-10 ${stickyBg} shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] pl-10 pr-6 py-3 text-sm overflow-hidden ${isDone ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-700 dark:text-gray-300'}`} style={colStyle('title')}>
                <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                    <svg className="h-3 w-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    <Tooltip content={task.title}>
                        <button
                            className="truncate text-left hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); onOpenDetail?.(task.id); }}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            {task.title}
                        </button>
                    </Tooltip>
                </div>
            </td>
            {columnOrder.map(colId => renderCell(colId))}
            <td className={`sticky right-0 z-10 ${stickyBg} shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.06)] px-6 py-3 text-sm text-right`}>
                <div className="flex items-center justify-end gap-1">
                    {canEditTask && (
                        <Tooltip content="Edit">
                            <Link
                                href={`/projects/${project.id}/tasks/${task.id}/edit`}
                                onPointerDown={(e) => e.stopPropagation()}
                                className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                            >
                                <EditIcon />
                            </Link>
                        </Tooltip>
                    )}
                    {canManageTasks && (
                        <Tooltip content="Delete">
                            <button
                                onClick={() => handleDeleteTask(task.id, task.title)}
                                onPointerDown={(e) => e.stopPropagation()}
                                className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                            >
                                <TrashIcon />
                            </button>
                        </Tooltip>
                    )}
                </div>
            </td>
        </tr>
    );
}

// Default reorderable column IDs (excluding sticky checkbox, title, actions)
const DEFAULT_COLUMN_IDS = ['status', 'priority', 'assignee', 'dates'];

// Resize handle for column headers
function ColumnResizeHandle({ onResize }) {
    const handleMouseDown = useCallback((e) => {
        e.stopPropagation();
        e.preventDefault();
        const th = e.target.closest('th');
        if (!th) return;
        const startX = e.clientX;
        const startWidth = th.getBoundingClientRect().width;
        const onMouseMove = (ev) => {
            const newWidth = Math.max(60, startWidth + (ev.clientX - startX));
            onResize(newWidth);
        };
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }, [onResize]);

    return (
        <div
            onMouseDown={handleMouseDown}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize opacity-0 hover:opacity-100 group-hover/col:opacity-50 hover:!opacity-100 bg-primary-400 transition-opacity z-10"
        />
    );
}

// Column header dropdown menu (sort, hide, edit, delete)
function ColumnHeaderDropdown({ colId, sortConfig, onSort, onHide, onEdit, onDelete, isCustomField }) {
    const [open, setOpen] = useState(false);
    const btnRef = useRef(null);
    const menuRef = useRef(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const handleOpen = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const rect = btnRef.current.getBoundingClientRect();
        setPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 180) });
        setOpen(v => !v);
    };

    const isAsc = sortConfig?.key === colId && sortConfig?.direction === 'asc';
    const isDesc = sortConfig?.key === colId && sortConfig?.direction === 'desc';

    const menuItem = (label, icon, onClick, danger) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs ${danger ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'} transition-colors`}>
            {icon}
            <span>{label}</span>
        </button>
    );

    const sortAscIcon = <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"/></svg>;
    const sortDescIcon = <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4"/></svg>;
    const hideIcon = <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18"/></svg>;
    const editIcon = <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>;
    const deleteIcon = <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>;

    return (
        <>
            <button ref={btnRef} type="button" onClick={handleOpen} onPointerDown={(e) => e.stopPropagation()}
                className={`shrink-0 p-0.5 rounded transition-all ${open ? 'opacity-100 text-primary-600 dark:text-primary-400' : 'opacity-0 group-hover/col:opacity-60 hover:!opacity-100'} hover:text-gray-700 dark:hover:text-gray-300`}>
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </button>
            {open && createPortal(
                <div ref={menuRef} className="fixed z-[9999] py-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 min-w-[160px]"
                    style={{ top: pos.top, left: pos.left }}>
                    {menuItem(`Sort ascending${isAsc ? ' ✓' : ''}`, sortAscIcon, () => onSort(colId, 'asc'))}
                    {menuItem(`Sort descending${isDesc ? ' ✓' : ''}`, sortDescIcon, () => onSort(colId, 'desc'))}
                    {onHide && (
                        <>
                            <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                            {menuItem('Hide column', hideIcon, () => onHide(colId))}
                        </>
                    )}
                    {isCustomField && onEdit && (
                        <>
                            <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                            {menuItem('Edit field', editIcon, () => onEdit(colId))}
                            {menuItem('Delete field', deleteIcon, () => onDelete(colId), true)}
                        </>
                    )}
                </div>,
                document.body
            )}
        </>
    );
}

// Button to reveal hidden columns
function HiddenColumnsMenu({ hiddenColumns, getColumnLabel, onShowColumn }) {
    const [open, setOpen] = useState(false);
    const btnRef = useRef(null);
    const menuRef = useRef(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const handleOpen = (e) => {
        e.stopPropagation();
        const rect = btnRef.current.getBoundingClientRect();
        setPos({ top: rect.bottom + 4, left: Math.max(0, rect.right - 180) });
        setOpen(v => !v);
    };

    const cols = [...hiddenColumns];

    return (
        <>
            <button ref={btnRef} type="button" onClick={handleOpen} title="Show hidden columns"
                className="p-0.5 rounded text-primary-500 hover:text-primary-700 dark:hover:text-primary-300 transition-colors">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
            </button>
            {open && createPortal(
                <div ref={menuRef} className="fixed z-[9999] py-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 min-w-[160px]"
                    style={{ top: pos.top, left: pos.left }}>
                    <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Hidden Columns</div>
                    {cols.map(colId => (
                        <button key={colId} type="button" onClick={() => { onShowColumn(colId); if (hiddenColumns.size <= 1) setOpen(false); }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                            <svg className="h-3.5 w-3.5 shrink-0 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span>{getColumnLabel(colId)}</span>
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </>
    );
}

// Draggable column header for list view
function SortableColumnHeader({ id, children, width, onResize, sortConfig, onSort, onHide, onEditField, onDeleteField }) {
    const { attributes, listeners, setNodeRef, isDragging } = useSortable({ id });
    const isCustomField = id.startsWith('cf-');
    const isSorted = sortConfig?.key === id;
    return (
        <th
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            style={width ? { width, minWidth: width, maxWidth: width } : undefined}
            className={`group/col relative px-6 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap select-none transition-colors overflow-hidden text-ellipsis
                ${isDragging
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 cursor-grabbing opacity-50'
                    : 'text-gray-500 dark:text-gray-400 cursor-grab hover:bg-gray-100 dark:hover:bg-gray-700/50'
                }`}
        >
            <div className="flex items-center gap-1.5 pr-5">
                <svg className="h-3 w-3 shrink-0 opacity-0 group-hover/col:opacity-40 transition-opacity" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
                    <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                    <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
                </svg>
                <span className="truncate">{children}</span>
                {isSorted && (
                    <svg className="h-3 w-3 shrink-0 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sortConfig.direction === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                    </svg>
                )}
            </div>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10">
                <ColumnHeaderDropdown colId={id} sortConfig={sortConfig} onSort={onSort} onHide={onHide}
                    onEdit={onEditField} onDelete={onDeleteField} isCustomField={isCustomField} />
            </div>
            {onResize && <ColumnResizeHandle onResize={onResize} />}
        </th>
    );
}

// Sortable table row for list view drag-and-drop
function SortableRow({ task, project, canEditTask, canManageTasks, canManageTaskDetails, handleDeleteTask, users, onTaskUpdate, onCustomFieldUpdate, onToggleComplete, isExpanded, onToggleExpand, isSelected, onSelect, isFocused, customFields = [], onContextMenu, onOpenDetail, columnOrder = [], formulaResults = {}, columnWidths = {} }) {
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

    const stickyBg = isDragging
        ? 'bg-blue-50 dark:bg-blue-900/30'
        : isSelected
            ? 'bg-primary-100 dark:bg-primary-900/30'
            : 'bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-700/50';

    const [openPopover, setOpenPopover] = useState(null);

    const togglePopover = (name) => (forceClose) => {
        if (forceClose === false) { setOpenPopover(null); return; }
        setOpenPopover((prev) => prev === name ? null : name);
    };

    const handleFieldUpdate = (field, value) => {
        setOpenPopover(null);
        onTaskUpdate(task.id, field, value);
    };

    const colStyle = (colId) => {
        const w = columnWidths[colId];
        return w ? { width: w, minWidth: w, maxWidth: w } : undefined;
    };

    const renderCell = (colId) => {
        const cStyle = colStyle(colId);
        switch (colId) {
            case 'status':
                return (
                    <td key="status" className="px-6 py-4 text-sm overflow-hidden" style={cStyle}>
                        {canEditTask ? (
                            <StatusPicker currentStatus={task.status} isOpen={openPopover === 'status'} onToggle={togglePopover('status')} onSelect={(status) => handleFieldUpdate('status', status)} />
                        ) : (
                            <StatusBadge status={task.status} type="task" />
                        )}
                    </td>
                );
            case 'priority':
                return (
                    <td key="priority" className="px-6 py-4 text-sm overflow-hidden" style={cStyle}>
                        {canEditTask ? (
                            <PriorityPicker currentPriority={task.priority} isOpen={openPopover === 'priority'} onToggle={togglePopover('priority')} onSelect={(priority) => handleFieldUpdate('priority', priority)} />
                        ) : (
                            <PriorityBadge priority={task.priority} />
                        )}
                    </td>
                );
            case 'assignee':
                return (
                    <td key="assignee" className="px-6 py-4 text-sm overflow-hidden" style={cStyle}>
                        <div className="flex items-center gap-2 overflow-hidden">
                            {canManageTaskDetails ? (
                                <AssigneePicker currentAssignee={task.assignee} users={users} isOpen={openPopover === 'assignee'} onToggle={togglePopover('assignee')} onSelect={(user) => handleFieldUpdate('assigned_to', user ? user.id : null)} />
                            ) : (
                                task.assignee ? (
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <Avatar name={task.assignee.name} size="sm" />
                                        <span className="text-gray-700 dark:text-gray-300 truncate">{task.assignee.name}</span>
                                    </div>
                                ) : (
                                    <span className="text-gray-400">Unassigned</span>
                                )
                            )}
                            {task.collaborators?.length > 0 && (
                                <Tooltip content={task.collaborators.map((c) => c.name).join(', ')}>
                                    <div className="flex -space-x-1.5">
                                        {task.collaborators.slice(0, 3).map((c) => (
                                            <Avatar key={c.id} name={c.name} size="sm" className="ring-1 ring-white dark:ring-gray-800" />
                                        ))}
                                        {task.collaborators.length > 3 && (
                                            <span className="text-xs text-gray-400 ml-1">+{task.collaborators.length - 3}</span>
                                        )}
                                    </div>
                                </Tooltip>
                            )}
                        </div>
                    </td>
                );
            case 'dates':
                return (
                    <td key="dates" className="px-6 py-4 text-sm overflow-hidden" style={cStyle}>
                        <div className="flex items-center gap-1 overflow-hidden">
                            {canManageTaskDetails ? (
                                <>
                                    {task.start_date && (
                                        <>
                                            <InlineDatePicker currentDate={task.start_date} isOpen={openPopover === 'start_date'} onToggle={togglePopover('start_date')} onSelect={(date) => handleFieldUpdate('start_date', date)} onClear={() => handleFieldUpdate('start_date', null)} />
                                            <span className="text-gray-300 dark:text-gray-600">→</span>
                                        </>
                                    )}
                                    <InlineDatePicker currentDate={task.due_date} isOpen={openPopover === 'due_date'} onToggle={togglePopover('due_date')} onSelect={(date) => handleFieldUpdate('due_date', date)} isOverdue={isOverdue} />
                                    {!task.start_date && (
                                        <Tooltip content="Add start date"><button onClick={(e) => { e.stopPropagation(); togglePopover('start_date')(); }} onPointerDown={(e) => e.stopPropagation()} className="ml-1 text-gray-300 dark:text-gray-600 hover:text-primary-500 dark:hover:text-primary-400 transition-colors">
                                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                            </button></Tooltip>
                                    )}
                                    {!task.start_date && openPopover === 'start_date' && (
                                        <InlineDatePicker currentDate={null} isOpen={true} onToggle={togglePopover('start_date')} onSelect={(date) => handleFieldUpdate('start_date', date)} hidden />
                                    )}
                                </>
                            ) : (
                                <span className={`text-sm truncate ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                                    {task.start_date && task.due_date ? `${formatDate(task.start_date)} → ${formatDate(task.due_date)}` : formatDate(task.due_date) || formatDate(task.start_date) || '—'}
                                </span>
                            )}
                        </div>
                    </td>
                );
            default:
                if (colId.startsWith('cf-')) {
                    const cfId = Number(colId.replace('cf-', ''));
                    const cf = customFields.find(f => f.id === cfId);
                    if (!cf) return null;
                    const cfDisplay = cf.type === 'formula' ? { ...cf, _formulaValue: formulaResults[task.id]?.[cf.id] ?? null } : cf;
                    return (
                        <td key={colId} className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300 overflow-hidden" style={cStyle}>
                            <div className="truncate">
                            {canEditTask && cf.type !== 'formula' ? (
                                <InlineCustomFieldEditor task={task} customField={cfDisplay} isOpen={openPopover === `cf-${cf.id}`} onToggle={togglePopover(`cf-${cf.id}`)} onUpdate={onCustomFieldUpdate} formatDate={formatDate} />
                            ) : (
                                renderCustomFieldValue(task, cfDisplay)
                            )}
                            </div>
                        </td>
                    );
                }
                return null;
        }
    };

    return (
        <tr
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            data-task-id={task.id}
            onClick={(e) => {
                if (e.target.closest('button, input, select, [role="listbox"], [data-no-select]')) return;
                if (onSelect) { e.preventDefault(); onSelect(task.id, e); }
            }}
            onContextMenu={(e) => onContextMenu?.(e, task)}
            className={`group hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-grab active:cursor-grabbing touch-none ${isDragging ? 'bg-blue-50 dark:bg-blue-900/30' : ''} ${isSelected ? 'bg-primary-100 dark:bg-primary-900/30' : ''} ${isFocused ? 'ring-2 ring-inset ring-primary-400' : ''}`}
        >
            <td className={`sticky left-0 z-10 ${stickyBg} relative pl-6 pr-2 py-4 w-[52px] min-w-[52px]`}>
                <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-primary-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <Tooltip content={isDone ? 'Mark incomplete' : 'Mark complete'}>
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleComplete(task.id, e); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                            isDone
                                ? 'bg-green-500 border-green-500 text-white scale-110'
                                : 'border-gray-300 dark:border-gray-500 text-transparent hover:border-green-400 hover:text-green-400 hover:scale-110'
                        }`}
                    >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </button>
                </Tooltip>
            </td>
            <td className={`sticky left-[52px] z-10 ${stickyBg} shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] px-6 py-4 text-sm font-medium overflow-hidden ${isDone ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'}`} style={colStyle('title')}>
                <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                    {(task.subtasks_count > 0 || canManageTasks) && (
                        <Tooltip content={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}>
                            <button
                                onClick={(e) => { e.stopPropagation(); onToggleExpand(task.id); }}
                                onPointerDown={(e) => e.stopPropagation()}
                                className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            >
                                <svg className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </Tooltip>
                    )}
                    <Tooltip content={task.title}>
                        <button
                            className="truncate min-w-0 text-left hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); onOpenDetail?.(task.id); }}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            {task.title}
                        </button>
                    </Tooltip>
                    {task.is_recurring && (
                        <Tooltip content="Recurring task">
                            <svg className="h-3.5 w-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </Tooltip>
                    )}
                    {task.subtasks_count > 0 && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">
                            {task.completed_subtasks_count}/{task.subtasks_count}
                        </span>
                    )}
                </div>
            </td>
            {columnOrder.map(colId => renderCell(colId))}
            <td className={`sticky right-0 z-10 ${stickyBg} shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.06)] px-6 py-4 text-sm text-right`}>
                <div className="flex items-center justify-end gap-1">
                    {canEditTask && (
                        <Tooltip content="Edit">
                            <Link
                                href={`/projects/${project.id}/tasks/${task.id}/edit`}
                                className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                            >
                                <EditIcon />
                            </Link>
                        </Tooltip>
                    )}
                    {canManageTasks && (
                        <Tooltip content="Delete">
                            <button
                                onClick={() => handleDeleteTask(task.id, task.title)}
                                className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                            >
                                <TrashIcon />
                            </button>
                        </Tooltip>
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
function SectionDropZone({ sectionId, minHeight = false }) {
    const { setNodeRef, isOver } = useDroppable({ id: `section-${sectionId ?? 'null'}` });
    return (
        <tr ref={setNodeRef}>
            <td colSpan={99} className={`transition-colors ${isOver ? 'py-2' : minHeight ? 'py-1' : 'py-0'}`}>
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
const SECTION_COLORS = [
    null, // no color (default)
    '#ef4444', // red
    '#f97316', // orange
    '#f59e0b', // amber
    '#eab308', // yellow
    '#84cc16', // lime
    '#22c55e', // green
    '#14b8a6', // teal
    '#06b6d4', // cyan
    '#3b82f6', // blue
    '#6366f1', // indigo
    '#8b5cf6', // violet
    '#a855f7', // purple
    '#d946ef', // fuchsia
    '#ec4899', // pink
    '#f43f5e', // rose
];

function SortableSectionHeader({ section, isCollapsed, onToggleCollapse, isEditing, editingName, onEditName, onStartEditing, onRename, onCancelEditing, onAddTask, onDelete, onColorChange, canManage, projectId, taskCount }) {
    const [showColorPicker, setShowColorPicker] = useState(false);
    const colorBtnRef = useRef(null);
    const colorPickerRef = useRef(null);
    const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: `section-header-${section.id}` });

    useEffect(() => {
        if (!showColorPicker) return;
        const handler = (e) => {
            if (colorPickerRef.current && !colorPickerRef.current.contains(e.target) &&
                colorBtnRef.current && !colorBtnRef.current.contains(e.target)) {
                setShowColorPicker(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showColorPicker]);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
    };

    const sectionColor = section.color;

    const activeSectionColor = sectionColor || '#6b7280'; // gray-500 default

    return (
        <tr ref={setNodeRef} style={style} className="group/section">
            <td colSpan={99} className="px-0 py-0">
                <div className="sticky left-0 flex items-center gap-2 px-3 py-2 w-fit">
                    {canManage && (
                        <button
                            {...attributes}
                            {...listeners}
                            className="cursor-grab active:cursor-grabbing p-0.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors opacity-0 group-hover/section:opacity-100"
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
                        <svg className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                    {/* Section badge — colored background + white text */}
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
                            ref={colorBtnRef}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold text-white shadow-sm ${canManage ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''}`}
                            style={{ backgroundColor: activeSectionColor }}
                            onClick={canManage ? (e) => {
                                if (e.detail === 2) {
                                    onStartEditing();
                                } else {
                                    if (!showColorPicker && colorBtnRef.current) {
                                        const rect = colorBtnRef.current.getBoundingClientRect();
                                        setPickerPos({ top: rect.bottom + 4, left: rect.left });
                                    }
                                    setShowColorPicker(!showColorPicker);
                                }
                            } : undefined}
                        >
                            {section.name}
                            <span className="text-white/70">{taskCount}</span>
                        </span>
                    )}
                    {/* Color picker portal */}
                    {showColorPicker && createPortal(
                        <div
                            ref={colorPickerRef}
                            className="fixed z-[9999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-3"
                            style={{ top: pickerPos.top, left: pickerPos.left }}
                        >
                            <div className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mb-2 px-0.5">Section color</div>
                            <div className="grid grid-cols-8 gap-1.5">
                                {SECTION_COLORS.map((color) => (
                                    <button
                                        key={color ?? 'none'}
                                        type="button"
                                        onClick={() => { onColorChange(color); setShowColorPicker(false); }}
                                        className={`w-6 h-6 rounded-md transition-all hover:scale-110 ${
                                            sectionColor === color ? 'ring-2 ring-offset-1 ring-primary-500 dark:ring-offset-gray-800' : ''
                                        } ${!color ? 'border border-gray-300 dark:border-gray-500' : ''}`}
                                        style={{ backgroundColor: color || '#e5e7eb' }}
                                        title={color ? color : 'Default'}
                                    >
                                        {!color && (
                                            <svg className="w-full h-full text-gray-400 p-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" d="M4 4l16 16" />
                                            </svg>
                                        )}
                                    </button>
                                ))}
                            </div>
                            {canManage && (
                                <>
                                    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                                        <button
                                            type="button"
                                            onClick={() => { setShowColorPicker(false); onStartEditing(); }}
                                            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                        >
                                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                            Rename section
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>,
                        document.body
                    )}
                    {canManage && (
                        <div className="flex items-center gap-1 opacity-0 group-hover/section:opacity-100 transition-opacity">
                            <Tooltip content="Add task">
                                <Link
                                    href={`/projects/${projectId}/tasks/create?section_id=${section.id}`}
                                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                >
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                    </svg>
                                </Link>
                            </Tooltip>
                            <Tooltip content="Delete section">
                                <button
                                    onClick={onDelete}
                                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                >
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </Tooltip>
                        </div>
                    )}
                </div>
            </td>
        </tr>
    );
}

function AutomationToast({ toast, onDismiss }) {
    const [visible, setVisible] = useState(false);
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        requestAnimationFrame(() => setVisible(true));
        const timer = setTimeout(() => {
            setExiting(true);
            setVisible(false);
            setTimeout(() => onDismiss(toast.id), 300);
        }, 5000);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg transition-all duration-300 ${
                visible
                    ? 'opacity-100 translate-y-0 scale-100'
                    : exiting
                        ? 'opacity-0 translate-y-2 scale-95'
                        : 'opacity-0 translate-y-4 scale-95'
            } border-purple-200 bg-purple-50 dark:bg-purple-900/30 dark:border-purple-800`}
        >
            <div className="shrink-0 mt-0.5 rounded-full bg-purple-100 dark:bg-purple-800/50 p-1.5">
                <svg className="h-4 w-4 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-purple-900 dark:text-purple-100">
                    Rule executed
                </p>
                <p className="text-xs text-purple-700 dark:text-purple-300 mt-0.5 truncate">
                    <span className="font-medium">{toast.ruleName}</span>
                    {toast.taskTitle && <> on &ldquo;{toast.taskTitle}&rdquo;</>}
                </p>
                {toast.actions && (
                    <p className="text-xs text-purple-500 dark:text-purple-400 mt-0.5 capitalize">
                        {toast.actions}
                    </p>
                )}
            </div>
            <button
                onClick={() => onDismiss(toast.id)}
                className="text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 shrink-0"
            >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}

export default function Show() {
    const { project, tasks: serverTasks, sections: serverSections = [], canManageProject, canManageTasks, automationRules, customFields: initialCustomFields = [], auth, users } = usePage().props;

    const [localCustomFields, setLocalCustomFields] = useState(initialCustomFields);
    const [showDetails, setShowDetails] = useState(false);
    const [view, setView] = useState('list');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterPriority, setFilterPriority] = useState('');
    const [filterAssignee, setFilterAssignee] = useState('');
    const [filterSearch, setFilterSearch] = useState('');
    const [filterDueDate, setFilterDueDate] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [duplicateTarget, setDuplicateTarget] = useState(null);
    const [localTasks, setLocalTasks] = useState(serverTasks);
    const [activeId, setActiveId] = useState(null);
    const [expandedTasks, setExpandedTasks] = useState(new Set());
    const [calendarMonth, setCalendarMonth] = useState(() => {
        const now = new Date();
        return { month: now.getMonth() + 1, year: now.getFullYear() };
    });
    const [selectedTasks, setSelectedTasks] = useState(new Set());
    const [focusedTaskId, setFocusedTaskId] = useState(null);
    const [lastClickedTaskId, setLastClickedTaskId] = useState(null);
    const [bulkDropdown, setBulkDropdown] = useState(null); // 'status' | 'priority' | 'assign' | null
    const [localSections, setLocalSections] = useState(serverSections);
    const [collapsedSections, setCollapsedSections] = useState(new Set());
    const [editingSectionId, setEditingSectionId] = useState(null);
    const [editingSectionName, setEditingSectionName] = useState('');
    const [addingSectionName, setAddingSectionName] = useState(null); // null = not adding, string = input value
    const [showAutomation, setShowAutomation] = useState(false);
    const [showCustomFields, setShowCustomFields] = useState(false);
    const [celebration, setCelebration] = useState(null); // { x, y } or null
    const [automationToasts, setAutomationToasts] = useState([]);
    const [contextMenu, setContextMenu] = useState(null); // { task, x, y } or null
    const [detailTaskId, setDetailTaskId] = useState(null); // task ID for detail panel

    // Column order for list view (draggable header reordering)
    const [columnOrder, setColumnOrder] = useState(() => {
        try {
            const saved = localStorage.getItem(`wmt-col-order-${project.id}`);
            if (saved) return JSON.parse(saved);
        } catch {}
        return null;
    });
    const [activeColumnId, setActiveColumnId] = useState(null);

    // Column widths (persisted per project)
    const [columnWidths, setColumnWidths] = useState(() => {
        try {
            const saved = localStorage.getItem(`wmt-col-widths-${project.id}`);
            if (saved) return JSON.parse(saved);
        } catch {}
        return {};
    });

    const getColumnWidth = useCallback((colId) => {
        return columnWidths[colId] || null;
    }, [columnWidths]);

    const handleColumnResize = useCallback((colId, width) => {
        setColumnWidths(prev => {
            const next = { ...prev, [colId]: Math.max(60, width) };
            try { localStorage.setItem(`wmt-col-widths-${project.id}`, JSON.stringify(next)); } catch {}
            return next;
        });
    }, [project.id]);

    // Hidden columns (persisted per project)
    const [hiddenColumns, setHiddenColumns] = useState(() => {
        try {
            const saved = localStorage.getItem(`wmt-col-hidden-${project.id}`);
            if (saved) return new Set(JSON.parse(saved));
        } catch {}
        return new Set();
    });

    // Sort config { key, direction }
    const [sortConfig, setSortConfig] = useState(null);

    // Custom field manager ref for edit/delete from column dropdown
    const cfManagerRef = useRef(null);

    const handleSortColumn = useCallback((colId, direction) => {
        setSortConfig(prev => {
            if (prev?.key === colId && prev?.direction === direction) return null; // toggle off
            return { key: colId, direction };
        });
    }, []);

    const handleHideColumn = useCallback((colId) => {
        setHiddenColumns(prev => {
            const next = new Set(prev);
            next.add(colId);
            try { localStorage.setItem(`wmt-col-hidden-${project.id}`, JSON.stringify([...next])); } catch {}
            return next;
        });
    }, [project.id]);

    const handleShowColumn = useCallback((colId) => {
        setHiddenColumns(prev => {
            const next = new Set(prev);
            next.delete(colId);
            try { localStorage.setItem(`wmt-col-hidden-${project.id}`, JSON.stringify([...next])); } catch {}
            return next;
        });
    }, [project.id]);

    const handleEditColumnField = useCallback((colId) => {
        if (colId.startsWith('cf-')) {
            const cfId = Number(colId.replace('cf-', ''));
            cfManagerRef.current?.editField(cfId);
        }
    }, []);

    const handleDeleteColumnField = useCallback((colId) => {
        if (colId.startsWith('cf-')) {
            const cfId = Number(colId.replace('cf-', ''));
            cfManagerRef.current?.deleteField(cfId);
        }
    }, []);

    const effectiveColumnOrder = useMemo(() => {
        const cfIds = localCustomFields.map(cf => `cf-${cf.id}`);
        const allIds = [...DEFAULT_COLUMN_IDS, ...cfIds];
        if (!columnOrder) return allIds;
        const valid = columnOrder.filter(id => allIds.includes(id));
        const missing = allIds.filter(id => !valid.includes(id));
        return [...valid, ...missing];
    }, [columnOrder, localCustomFields]);

    // Visible column order (filtered by hidden)
    const visibleColumnOrder = useMemo(() => {
        return effectiveColumnOrder.filter(id => !hiddenColumns.has(id));
    }, [effectiveColumnOrder, hiddenColumns]);

    const columnSensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    const getColumnLabel = useCallback((colId) => {
        switch (colId) {
            case 'status': return 'Status';
            case 'priority': return 'Priority';
            case 'assignee': return 'Assignee';
            case 'dates': return 'Dates';
            default:
                if (colId.startsWith('cf-')) {
                    const cfId = Number(colId.replace('cf-', ''));
                    return localCustomFields.find(cf => cf.id === cfId)?.name || colId;
                }
                return colId;
        }
    }, [localCustomFields]);

    // Sort comparator for tasks
    const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };
    const STATUS_ORDER = { backlog: 0, to_do: 1, in_progress: 2, in_review: 3, done: 4, cancelled: 5 };

    const getTaskSortValue = useCallback((task, key) => {
        switch (key) {
            case 'title': return task.title?.toLowerCase() || '';
            case 'status': return STATUS_ORDER[task.status] ?? 99;
            case 'priority': return PRIORITY_ORDER[task.priority] ?? 99;
            case 'assignee': return task.assigned_user?.name?.toLowerCase() || '\uffff';
            case 'dates': return task.due_date || '\uffff';
            default:
                if (key.startsWith('cf-')) {
                    const cfId = Number(key.replace('cf-', ''));
                    const cf = localCustomFields.find(f => f.id === cfId);
                    const cfv = task.custom_field_values?.find(v => v.custom_field_id === cfId);
                    if (!cf || !cfv) return '\uffff';
                    if (cf.type === 'number') return cfv.value_number ?? Infinity;
                    if (cf.type === 'date') return cfv.value_date || '\uffff';
                    if (cf.type === 'single_select') return cfv.selected_option?.label?.toLowerCase() || '\uffff';
                    if (cf.type === 'text' || cf.type === 'textarea') return cfv.value_text?.toLowerCase() || '\uffff';
                    return '\uffff';
                }
                return '\uffff';
        }
    }, [localCustomFields]);

    const sortTasks = useCallback((tasks) => {
        if (!sortConfig) return tasks;
        const { key, direction } = sortConfig;
        const sorted = [...tasks].sort((a, b) => {
            const av = getTaskSortValue(a, key);
            const bv = getTaskSortValue(b, key);
            if (av < bv) return direction === 'asc' ? -1 : 1;
            if (av > bv) return direction === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [sortConfig, getTaskSortValue]);

    // Pre-compute formula field values for all tasks
    const formulaResults = useMemo(() => {
        const formulaFields = localCustomFields.filter(cf => cf.type === 'formula');
        if (formulaFields.length === 0) return {};
        const results = {};
        const allTasks = [];
        for (const task of localTasks) {
            allTasks.push(task);
            if (task.subtasks) {
                for (const sub of task.subtasks) allTasks.push(sub);
            }
        }
        for (const task of allTasks) {
            results[task.id] = computeAllFormulas(task, localCustomFields);
        }
        return results;
    }, [localTasks, localCustomFields]);

    const handleColumnDragEnd = useCallback((event) => {
        const { active, over } = event;
        setActiveColumnId(null);
        if (!over || active.id === over.id) return;
        setColumnOrder(prev => {
            const order = prev ? [...prev] : [...effectiveColumnOrder];
            const oldIdx = order.indexOf(active.id);
            const newIdx = order.indexOf(over.id);
            if (oldIdx === -1 || newIdx === -1) return prev;
            const newOrder = arrayMove(order, oldIdx, newIdx);
            try { localStorage.setItem(`wmt-col-order-${project.id}`, JSON.stringify(newOrder)); } catch {}
            return newOrder;
        });
    }, [effectiveColumnOrder, project.id]);

    // Sync local state when server data changes (after Inertia navigation)
    useMemo(() => {
        setLocalTasks(serverTasks);
        setLocalSections(serverSections);
        setLocalCustomFields(initialCustomFields);
    }, [serverTasks, serverSections, initialCustomFields]);

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

        channel.listen('.automation.executed', (e) => {
            const id = `auto-${Date.now()}-${Math.random()}`;
            const actionLabels = (e.actions || []).map(a => a.replace(/_/g, ' ')).join(', ');
            setAutomationToasts((prev) => [...prev, {
                id,
                ruleName: e.rule_name,
                taskTitle: e.task?.title,
                actions: actionLabels,
            }]);
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
        const filtered = localTasks.filter(matchesFilters);
        return sortTasks(filtered);
    }, [localTasks, matchesFilters, sortTasks]);

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
        groups.push({ id: null, name: 'Unsectioned', tasks: sortTasks(unsectioned) });
        // Then each section in order
        localSections.forEach((s) => {
            const sectionTasks = filteredTasks.filter((t) => t.section_id === s.id);
            groups.push({ id: s.id, name: s.name, color: s.color, tasks: sortTasks(sectionTasks) });
        });
        return groups;
    }, [filteredTasks, localSections, sortTasks]);

    // Flat ordered list of visible task IDs (for shift+click range & arrow key nav)
    const flatVisibleTaskIds = useMemo(() => {
        if (view !== 'list') return [];
        const ids = [];
        const pushTask = (t) => {
            ids.push(t.id);
            if (expandedTasks.has(t.id) && t.subtasks?.length > 0) {
                t.subtasks.forEach(st => ids.push(st.id));
            }
        };
        if (tasksBySection) {
            tasksBySection.forEach(group => {
                if (group.id !== null && collapsedSections.has(group.id)) return;
                group.tasks.forEach(pushTask);
            });
        } else {
            filteredTasks.forEach(pushTask);
        }
        return ids;
    }, [view, tasksBySection, filteredTasks, collapsedSections, expandedTasks]);

    // Dashboard statistics computed from all tasks (unfiltered)
    const dashboardStats = useMemo(() => {
        // Flatten all tasks including subtasks
        const allTasks = [];
        localTasks.forEach((t) => {
            allTasks.push(t);
            if (t.subtasks && t.subtasks.length > 0) {
                t.subtasks.forEach((st) => allTasks.push(st));
            }
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(today);
        endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
        endOfWeek.setHours(23, 59, 59, 999);

        const total = allTasks.length;

        // Status counts
        const byStatus = {};
        TASK_STATUSES.forEach((s) => (byStatus[s] = 0));
        allTasks.forEach((t) => {
            if (byStatus[t.status] !== undefined) byStatus[t.status]++;
        });

        // Active = not done and not cancelled
        const activeTasks = allTasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
        const nonCancelled = allTasks.filter((t) => t.status !== 'cancelled');
        const completionRate = nonCancelled.length > 0 ? Math.round((byStatus.done / nonCancelled.length) * 100) : 0;

        // Due date analysis (only active tasks)
        const overdue = activeTasks.filter((t) => {
            if (!t.due_date) return false;
            const d = new Date(t.due_date);
            d.setHours(0, 0, 0, 0);
            return d < today;
        });
        const dueToday = activeTasks.filter((t) => {
            if (!t.due_date) return false;
            const d = new Date(t.due_date);
            d.setHours(0, 0, 0, 0);
            return d.getTime() === today.getTime();
        });
        const dueThisWeek = activeTasks.filter((t) => {
            if (!t.due_date) return false;
            const d = new Date(t.due_date);
            d.setHours(0, 0, 0, 0);
            return d >= today && d <= endOfWeek;
        });
        const noDueDate = activeTasks.filter((t) => !t.due_date);

        // Priority counts (active only)
        const byPriority = { low: 0, medium: 0, high: 0, urgent: 0 };
        activeTasks.forEach((t) => {
            if (byPriority[t.priority] !== undefined) byPriority[t.priority]++;
        });

        // Assignee workload
        const assigneeMap = {};
        allTasks.forEach((t) => {
            const key = t.assigned_to || 'unassigned';
            if (!assigneeMap[key]) {
                assigneeMap[key] = {
                    user: t.assignee || null,
                    total: 0,
                    done: 0,
                    active: 0,
                    overdue: 0,
                };
            }
            assigneeMap[key].total++;
            if (t.status === 'done') {
                assigneeMap[key].done++;
            } else if (t.status !== 'cancelled') {
                assigneeMap[key].active++;
                if (t.due_date) {
                    const d = new Date(t.due_date);
                    d.setHours(0, 0, 0, 0);
                    if (d < today) assigneeMap[key].overdue++;
                }
            }
        });
        const assignees = Object.entries(assigneeMap)
            .map(([key, val]) => ({ id: key, ...val }))
            .sort((a, b) => b.total - a.total);

        return {
            total,
            byStatus,
            completionRate,
            overdue,
            dueToday,
            dueThisWeek,
            noDueDate,
            byPriority,
            assignees,
            activeTasks: activeTasks.length,
        };
    }, [localTasks]);

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

    const handleUpdateSectionColor = useCallback(async (sectionId, color) => {
        setLocalSections((prev) => prev.map((s) => s.id === sectionId ? { ...s, color } : s));
        try {
            await apiFetch(`/projects/${project.id}/sections/${sectionId}`, {
                method: 'PATCH',
                body: JSON.stringify({ color }),
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
            if (!res.ok) {
                setLocalTasks(serverTasks);
                return;
            }
            const data = await res.json();
            if (data.new_tasks?.length > 0) {
                setLocalTasks((prev) => [...prev, ...data.new_tasks]);
            }
        }).catch(() => {
            setLocalTasks(serverTasks);
        });
    }, [project.id, serverTasks]);

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

    // Inline custom field value update (optimistic)
    const handleCustomFieldUpdate = useCallback((taskId, fieldId, fieldType, value) => {
        // Build optimistic custom_field_values entry
        const buildOptimisticCfv = (existingValues) => {
            const values = [...(existingValues || [])];
            const idx = values.findIndex(v => v.custom_field_id === fieldId);
            const entry = {
                custom_field_id: fieldId,
                value_text: (fieldType === 'text' || fieldType === 'textarea') ? value : null,
                value_number: fieldType === 'number' ? value : null,
                value_date: fieldType === 'date' ? value : null,
                value_option_id: fieldType === 'single_select' ? value : null,
                value_json: fieldType === 'multi_select' ? value : null,
                selected_option: fieldType === 'single_select' && value
                    ? (localCustomFields.find(cf => cf.id === fieldId)?.options || []).find(o => o.id === Number(value)) || null
                    : null,
            };
            if (idx >= 0) { values[idx] = { ...values[idx], ...entry }; }
            else { values.push(entry); }
            return values;
        };

        // Update in localTasks (could be parent or subtask)
        setLocalTasks((prev) => prev.map((t) => {
            if (t.id === taskId) {
                return { ...t, custom_field_values: buildOptimisticCfv(t.custom_field_values) };
            }
            const subIdx = t.subtasks?.findIndex((s) => s.id === taskId);
            if (subIdx !== undefined && subIdx >= 0) {
                const updatedSubs = [...t.subtasks];
                updatedSubs[subIdx] = { ...updatedSubs[subIdx], custom_field_values: buildOptimisticCfv(updatedSubs[subIdx].custom_field_values) };
                return { ...t, subtasks: updatedSubs };
            }
            return t;
        }));

        // Persist
        apiFetch(`/projects/${project.id}/tasks/${taskId}/custom-field-values`, {
            method: 'PATCH',
            body: JSON.stringify({ values: { [fieldId]: value } }),
        }).catch(() => {
            setLocalTasks(serverTasks);
        });
    }, [project.id, localCustomFields, serverTasks]);

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
        if (overId.startsWith('section-header-')) {
            targetSectionId = parseInt(overId.replace('section-header-', ''));
        } else if (overId.startsWith('section-')) {
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
            // Determine target section from the over element directly
            const overIdStr = String(over.id);
            const isOverSectionHeader = overIdStr.startsWith('section-header-');
            const isOverSectionZone = overIdStr.startsWith('section-') && !isOverSectionHeader;
            const isOverSection = isOverSectionHeader || isOverSectionZone;

            let targetSectionId;
            if (isOverSectionHeader) {
                targetSectionId = parseInt(overIdStr.replace('section-header-', ''));
            } else if (isOverSectionZone) {
                const part = overIdStr.replace('section-', '');
                targetSectionId = part === 'null' ? null : parseInt(part);
            } else {
                const overTask = localTasks.find((t) => t.id === over.id);
                if (!overTask) return;
                targetSectionId = overTask.section_id;
            }

            // Compute new state and persist payload separately
            let toPersist = null;
            setLocalTasks((prev) => {
                const activeTask = prev.find((t) => t.id === active.id);
                if (!activeTask) return prev;

                // Ensure the task has the target section_id
                const updated = prev.map((t) =>
                    t.id === active.id ? { ...t, section_id: targetSectionId } : { ...t }
                );

                const targetTasks = updated.filter((t) => t.section_id === targetSectionId && matchesFilters(t));

                if (!isOverSection && over.id !== active.id) {
                    // Dropped on a specific task — reorder relative to it
                    const movedIdx = targetTasks.findIndex((t) => t.id === active.id);
                    const overIdx = targetTasks.findIndex((t) => t.id === over.id);

                    if (movedIdx !== -1 && overIdx !== -1 && movedIdx !== overIdx) {
                        const reordered = arrayMove(targetTasks, movedIdx, overIdx);
                        reordered.forEach((t, i) => {
                            const idx = updated.findIndex((u) => u.id === t.id);
                            if (idx !== -1) updated[idx].position = i;
                        });
                        toPersist = reordered;
                    } else {
                        targetTasks.forEach((t, i) => {
                            const idx = updated.findIndex((u) => u.id === t.id);
                            if (idx !== -1) updated[idx].position = i;
                        });
                        toPersist = targetTasks;
                    }
                } else {
                    // Dropped on section area — persist with current order
                    targetTasks.forEach((t, i) => {
                        const idx = updated.findIndex((u) => u.id === t.id);
                        if (idx !== -1) updated[idx].position = i;
                    });
                    toPersist = targetTasks;
                }

                return updated;
            });
            if (toPersist) persistReorder(toPersist);
        } else {
            // Flat list mode (no sections)
            let toPersist = null;
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

                toPersist = reordered;
                return result;
            });
            if (toPersist) persistReorder(toPersist);
        }
    }, [tasksBySection, localTasks, localSections, matchesFilters, persistReorder, persistSectionReorder]);

    // --- Subtask drag handler (within a parent) ---
    const handleSubtaskDragEnd = useCallback((parentId, event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        let toPersist = null;
        setLocalTasks((prev) => prev.map((t) => {
            if (t.id !== parentId || !t.subtasks) return t;
            const oldIndex = t.subtasks.findIndex((s) => s.id === active.id);
            const newIndex = t.subtasks.findIndex((s) => s.id === over.id);
            if (oldIndex === -1 || newIndex === -1) return t;
            const reordered = arrayMove(t.subtasks, oldIndex, newIndex);
            toPersist = reordered.map((s, i) => ({ id: s.id, status: s.status, position: i, section_id: s.section_id ?? null }));
            return { ...t, subtasks: reordered };
        }));
        if (toPersist) {
            apiFetch(`/projects/${project.id}/tasks/reorder`, {
                method: 'POST',
                body: JSON.stringify({ tasks: toPersist }),
            });
        }
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

        let toPersist = null;
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

                toPersist = reordered;
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
                    toPersist = withoutMoved;
                } else {
                    // Dropped on empty column area — append to end
                    targetTasks.forEach((t, i) => {
                        const idx = updated.findIndex((u) => u.id === t.id);
                        updated[idx].position = i;
                    });
                    toPersist = targetTasks;
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
        if (toPersist) persistReorder(toPersist);
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

    const handleToggleComplete = useCallback((taskId, clickEvent) => {
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

        // Trigger celebration when completing (not uncompleting)
        if (newStatus === 'done' && clickEvent) {
            const rect = clickEvent.currentTarget.getBoundingClientRect();
            setCelebration({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        }

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

    // --- Context menu handlers ---
    const handleContextMenu = useCallback((e, task) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ task, x: e.clientX, y: e.clientY });
    }, []);

    const handleDuplicateTask = useCallback(async (task) => {
        try {
            const res = await apiFetch(`/projects/${project.id}/tasks/${task.id}/duplicate`, { method: 'POST' });
            if (!res.ok) throw new Error('Duplicate failed');
            const data = await res.json();
            if (data.task) {
                setLocalTasks((prev) => [...prev, data.task]);
            }
        } catch {
            router.reload({ only: ['tasks'] });
        }
    }, [project.id]);

    const handleAddSubtask = useCallback((task) => {
        router.visit(`/projects/${project.id}/tasks/create?parent_id=${task.id}`);
    }, [project.id]);

    const handleCopyTaskLink = useCallback((task) => {
        const url = `${window.location.origin}/projects/${project.id}/tasks/${task.id}/edit`;
        navigator.clipboard.writeText(url).catch(() => {});
    }, [project.id]);

    // --- Selection helpers ---
    const handleTaskSelect = useCallback((taskId, event) => {
        if (event?.shiftKey && lastClickedTaskId) {
            // Range select
            const startIdx = flatVisibleTaskIds.indexOf(lastClickedTaskId);
            const endIdx = flatVisibleTaskIds.indexOf(taskId);
            if (startIdx !== -1 && endIdx !== -1) {
                const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
                const rangeIds = flatVisibleTaskIds.slice(from, to + 1);
                setSelectedTasks(prev => {
                    const next = new Set(prev);
                    rangeIds.forEach(id => next.add(id));
                    return next;
                });
            }
        } else if (event?.ctrlKey || event?.metaKey) {
            // Toggle individual
            setSelectedTasks(prev => {
                const next = new Set(prev);
                if (next.has(taskId)) next.delete(taskId);
                else next.add(taskId);
                return next;
            });
            setLastClickedTaskId(taskId);
        } else {
            // Single select
            setSelectedTasks(new Set([taskId]));
            setLastClickedTaskId(taskId);
        }
        setFocusedTaskId(taskId);
    }, [lastClickedTaskId, flatVisibleTaskIds]);

    const clearSelection = useCallback(() => {
        setSelectedTasks(new Set());
        setBulkDropdown(null);
    }, []);

    // Clear selection when filters change
    useEffect(() => {
        setSelectedTasks(new Set());
        setFocusedTaskId(null);
        setLastClickedTaskId(null);
    }, [filterStatus, filterPriority, filterAssignee, filterSearch, filterDueDate]);

    // Keyboard navigation for list view (Arrow keys, Escape, Ctrl+A)
    useEffect(() => {
        if (view !== 'list') return;
        const handleKeyDown = (e) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
            if (e.target.isContentEditable) return;

            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const currentIdx = focusedTaskId ? flatVisibleTaskIds.indexOf(focusedTaskId) : -1;
                let nextIdx;
                if (currentIdx === -1) {
                    nextIdx = e.key === 'ArrowDown' ? 0 : flatVisibleTaskIds.length - 1;
                } else {
                    nextIdx = e.key === 'ArrowDown'
                        ? Math.min(currentIdx + 1, flatVisibleTaskIds.length - 1)
                        : Math.max(currentIdx - 1, 0);
                }
                if (nextIdx < 0 || nextIdx >= flatVisibleTaskIds.length) return;
                const nextId = flatVisibleTaskIds[nextIdx];
                setFocusedTaskId(nextId);
                if (e.shiftKey) {
                    setSelectedTasks(prev => { const next = new Set(prev); next.add(nextId); return next; });
                } else {
                    setSelectedTasks(new Set([nextId]));
                    setLastClickedTaskId(nextId);
                }
                document.querySelector(`[data-task-id="${nextId}"]`)?.scrollIntoView({ block: 'nearest' });
            }
            if (e.key === 'Escape') {
                clearSelection();
                setFocusedTaskId(null);
                setLastClickedTaskId(null);
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'a' && flatVisibleTaskIds.length > 0) {
                e.preventDefault();
                setSelectedTasks(new Set(flatVisibleTaskIds));
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [view, flatVisibleTaskIds, focusedTaskId, clearSelection]);

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
        <AuthenticatedLayout title={project.name} contained>
          <div className="flex flex-col h-full min-h-0">
            {/* Pinned header area */}
            <div className="shrink-0 pt-6">
            <PageHeader
                title={project.name}
                breadcrumbs={[
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'Projects', href: '/projects' },
                    { label: project.name },
                ]}
                actions={
                    <div className="flex items-center gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => window.location.href = `/projects/${project.id}/export`}
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            Export
                        </Button>
                        {canManageProject && (
                            <>
                            <LinkButton href={`/projects/${project.id}/forms`} variant="secondary" size="sm">
                                Forms
                            </LinkButton>
                            <Button variant="secondary" size="sm" onClick={() => setShowCustomFields(v => !v)}>
                                Custom Fields
                            </Button>
                            {canManageTasks && (
                                <Button variant="secondary" size="sm" onClick={() => setShowAutomation(v => !v)}>
                                    <AutomationIcon /> Automation
                                </Button>
                            )}
                            <ProjectContextMenu
                                project={project}
                                isArchived={project.status === 'archived'}
                                onEdit={() => router.visit(`/projects/${project.id}/edit`)}
                                onDuplicate={() => setDuplicateTarget(project)}
                                onArchive={() => router.patch(`/projects/${project.id}/archive`, {}, { preserveScroll: true })}
                                onDelete={handleDeleteProject}
                            />
                            </>
                        )}
                    </div>
                }
            />

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
                        <button
                            onClick={() => setView('dashboard')}
                            className={`inline-flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                view === 'dashboard'
                                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                            }`}
                        >
                            <DashboardIcon /> <span className="hidden sm:inline">Dashboard</span>
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
            </div>

            {/* Scrollable task area */}
            <div className="flex-1 min-h-0 overflow-y-auto pb-6">

            {/* Custom Fields Panel — always mounted so column header edit/delete works via ref */}
            <div className={showCustomFields ? '' : 'hidden'}>
                <Card className="mb-6">
                    <CustomFieldManager
                        ref={cfManagerRef}
                        projectId={project.id}
                        initialFields={localCustomFields}
                        onFieldsChange={setLocalCustomFields}
                    />
                </Card>
            </div>

            {/* Automation Rules Panel */}
            {showAutomation && canManageTasks && (
                <Card className="mb-6">
                    <AutomationRuleBuilder
                        projectId={project.id}
                        rules={automationRules || []}
                        users={users}
                        sections={localSections}
                        customFields={localCustomFields}
                        canCreateRules={!!auth.user?.can_create_rules}
                    />
                </Card>
            )}

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
                            <div className="overflow-x-auto styled-scrollbar-x">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700" style={{ tableLayout: 'fixed' }}>
                                <thead className="bg-gray-50 dark:bg-gray-800/50">
                                    <DndContext
                                        sensors={columnSensors}
                                        collisionDetection={closestCorners}
                                        onDragStart={(e) => setActiveColumnId(e.active.id)}
                                        onDragEnd={handleColumnDragEnd}
                                        onDragCancel={() => setActiveColumnId(null)}
                                    >
                                    <tr>
                                        <th className="sticky left-0 z-20 bg-gray-50 dark:bg-gray-800 pl-6 pr-2 py-3 w-[52px] min-w-[52px]">
                                            {canManageTasks && flatVisibleTaskIds.length > 0 && (
                                                <input
                                                    type="checkbox"
                                                    ref={(el) => { if (el) el.indeterminate = selectedTasks.size > 0 && selectedTasks.size < flatVisibleTaskIds.length; }}
                                                    checked={selectedTasks.size > 0 && selectedTasks.size === flatVisibleTaskIds.length}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedTasks(new Set(flatVisibleTaskIds));
                                                        else clearSelection();
                                                    }}
                                                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 cursor-pointer"
                                                />
                                            )}
                                        </th>
                                        <th
                                            className="group/col sticky left-[52px] z-20 bg-gray-50 dark:bg-gray-800 px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] relative overflow-hidden"
                                            style={columnWidths['title'] ? { width: columnWidths['title'], minWidth: 60, maxWidth: columnWidths['title'] } : { width: 300, minWidth: 60 }}
                                        >
                                            <div className="flex items-center gap-1.5 pr-5">
                                                <span className="truncate">Title</span>
                                                {sortConfig?.key === 'title' && (
                                                    <svg className="h-3 w-3 shrink-0 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sortConfig.direction === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                                                    </svg>
                                                )}
                                            </div>
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10">
                                                <ColumnHeaderDropdown colId="title" sortConfig={sortConfig} onSort={handleSortColumn} />
                                            </div>
                                            <ColumnResizeHandle onResize={(w) => handleColumnResize('title', w)} />
                                        </th>
                                        <SortableContext items={visibleColumnOrder} strategy={horizontalListSortingStrategy}>
                                            {visibleColumnOrder.map(colId => (
                                                <SortableColumnHeader key={colId} id={colId} width={getColumnWidth(colId)} onResize={(w) => handleColumnResize(colId, w)}
                                                    sortConfig={sortConfig} onSort={handleSortColumn} onHide={handleHideColumn}
                                                    onEditField={handleEditColumnField} onDeleteField={handleDeleteColumnField}>
                                                    {getColumnLabel(colId)}
                                                </SortableColumnHeader>
                                            ))}
                                        </SortableContext>
                                        <th className="sticky right-0 z-20 bg-gray-50 dark:bg-gray-800 px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.08)]" style={{ width: 100 }}>
                                            <div className="flex items-center justify-end gap-1">
                                                <span>Actions</span>
                                                {hiddenColumns.size > 0 && (
                                                    <HiddenColumnsMenu hiddenColumns={hiddenColumns} getColumnLabel={getColumnLabel} onShowColumn={handleShowColumn} />
                                                )}
                                            </div>
                                        </th>
                                    </tr>
                                    <DragOverlay>
                                        {activeColumnId ? (
                                            <th className="px-6 py-3 text-left text-xs font-medium text-primary-700 dark:text-primary-300 uppercase tracking-wider bg-primary-50 dark:bg-primary-900/50 rounded shadow-lg whitespace-nowrap">
                                                {getColumnLabel(activeColumnId)}
                                            </th>
                                        ) : null}
                                    </DragOverlay>
                                    </DndContext>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {tasksBySection ? (
                                        <SortableContext items={localSections.map((s) => `section-header-${s.id}`)} strategy={verticalListSortingStrategy}>
                                            {tasksBySection.map((group) => (
                                                <React.Fragment key={group.id ?? '__unsectioned'}>
                                                    {/* Section header — skip for unsectioned */}
                                                    {group.id !== null && (
                                                        <SortableSectionHeader
                                                            section={{ id: group.id, name: group.name, color: group.color }}
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
                                                            onColorChange={(color) => handleUpdateSectionColor(group.id, color)}
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
                                                                        onCustomFieldUpdate={handleCustomFieldUpdate}
                                                                        onToggleComplete={handleToggleComplete}
                                                                        isExpanded={expandedTasks.has(task.id)}
                                                                        onToggleExpand={handleToggleExpand}
                                                                        isSelected={selectedTasks.has(task.id)}
                                                                        onSelect={canManageTasks ? handleTaskSelect : undefined}
                                                                        isFocused={focusedTaskId === task.id}
                                                                        customFields={localCustomFields}
                                                                        columnOrder={visibleColumnOrder}
                                                                        onContextMenu={handleContextMenu}
                                                                        onOpenDetail={setDetailTaskId}
                                                                        formulaResults={formulaResults}
                                                                        columnWidths={columnWidths}
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
                                                                                        onCustomFieldUpdate={handleCustomFieldUpdate}
                                                                                        isSelected={selectedTasks.has(sub.id)}
                                                                                        onSelect={canManageTasks ? handleTaskSelect : undefined}
                                                                                        isFocused={focusedTaskId === sub.id}
                                                                                        customFields={localCustomFields}
                                                                                        columnOrder={visibleColumnOrder}
                                                                                        onContextMenu={handleContextMenu}
                                                                                        onOpenDetail={setDetailTaskId}
                                                                                        formulaResults={formulaResults}
                                                                                    />
                                                                                ))}
                                                                            </SortableContext>
                                                                        </DndContext>
                                                                    )}
                                                                    {expandedTasks.has(task.id) && canManageTasks && (
                                                                        <tr className="bg-gray-50/50 dark:bg-gray-800/30">
                                                                            <td colSpan={99} className="px-0 py-2">
                                                                                <div className="sticky left-0 pl-14 w-fit">
                                                                                    <Link
                                                                                        href={`/projects/${project.id}/tasks/create?parent_id=${task.id}`}
                                                                                        className="text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                                                                    >
                                                                                        + Add subtask
                                                                                    </Link>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    )}
                                                                </React.Fragment>
                                                            ))}
                                                        </SortableContext>
                                                        <SectionDropZone sectionId={group.id} minHeight={group.id === null} />
                                                        </>
                                                    )}
                                                </React.Fragment>
                                            ))}
                                            {/* Add section button */}
                                            {canManageTasks && (
                                                <tr>
                                                    <td colSpan={99} className="px-0 py-2">
                                                        <div className="sticky left-0 px-6 w-fit">
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
                                                        </div>
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
                                                            onCustomFieldUpdate={handleCustomFieldUpdate}
                                                            onToggleComplete={handleToggleComplete}
                                                            isExpanded={expandedTasks.has(task.id)}
                                                            onToggleExpand={handleToggleExpand}
                                                            isSelected={selectedTasks.has(task.id)}
                                                            onSelect={canManageTasks ? handleTaskSelect : undefined}
                                                            isFocused={focusedTaskId === task.id}
                                                            customFields={localCustomFields}
                                                            columnOrder={visibleColumnOrder}
                                                            onContextMenu={handleContextMenu}
                                                            onOpenDetail={setDetailTaskId}
                                                            formulaResults={formulaResults}
                                                            columnWidths={columnWidths}
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
                                                                            onCustomFieldUpdate={handleCustomFieldUpdate}
                                                                            isSelected={selectedTasks.has(sub.id)}
                                                                            onSelect={canManageTasks ? handleTaskSelect : undefined}
                                                                            isFocused={focusedTaskId === sub.id}
                                                                            customFields={localCustomFields}
                                                                            columnOrder={visibleColumnOrder}
                                                                            onContextMenu={handleContextMenu}
                                                                            onOpenDetail={setDetailTaskId}
                                                                            formulaResults={formulaResults}
                                                                            columnWidths={columnWidths}
                                                                        />
                                                                    ))}
                                                                </SortableContext>
                                                            </DndContext>
                                                        )}
                                                        {expandedTasks.has(task.id) && canManageTasks && (
                                                            <tr className="bg-gray-50/50 dark:bg-gray-800/30">
                                                                <td colSpan={99} className="pl-14 py-2">
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
                                                    <td colSpan={99} className="px-0 py-2">
                                                        <div className="sticky left-0 px-6 w-fit">
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
                                                        </div>
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
                                                <td className="pl-6 pr-2 py-4 w-[52px] min-w-[52px]"></td>
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
                            illustration={hasActiveFilters ? 'search' : 'tasks'}
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
                                            onToggleSelect={canManageTasks ? handleTaskSelect : undefined}
                                            onContextMenu={handleContextMenu}
                                            onOpenDetail={setDetailTaskId}
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
                        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto styled-scrollbar-x">
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
                                                            <Tooltip key={task.id} content={task.title}>
                                                                <button
                                                                    onClick={() => setDetailTaskId(task.id)}
                                                                    className={`block w-full text-left text-[11px] leading-tight px-1.5 py-0.5 rounded border truncate hover:opacity-80 transition-opacity cursor-pointer ${PRIORITY_PILL[task.priority] || PRIORITY_PILL.low}`}
                                                                >
                                                                    {task.title}
                                                                </button>
                                                            </Tooltip>
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
                                <div className="overflow-x-auto styled-scrollbar-x">
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
                                                        <Tooltip content={task.title}>
                                                            <button
                                                                onClick={() => setDetailTaskId(task.id)}
                                                                className={`text-sm truncate block max-w-full text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer ${isDone ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}
                                                            >
                                                                {task.isSubtask && (
                                                                    <svg className="inline h-3 w-3 mr-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                                                )}
                                                                {task.title}
                                                            </button>
                                                        </Tooltip>
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
                                                            <Tooltip content={`${task.title} — ${tooltipDate} — ${formatLabel(task.status)}`}>
                                                            <Link
                                                                href={`/projects/${project.id}/tasks/${task.id}/edit`}
                                                                className="absolute top-1/2 -translate-y-1/2 group z-10"
                                                                style={{ left: `${barOffset * COL_WIDTH + (hasRange ? 0 : COL_WIDTH / 2 - 12)}px` }}
                                                            >
                                                                <div
                                                                    className={`h-5 rounded-full ${barColor} shadow-sm group-hover:shadow-md transition-shadow flex items-center justify-center`}
                                                                    style={{ width: `${barWidth}px` }}
                                                                >
                                                                    <span className="text-[9px] text-white font-medium truncate px-1.5">{task.title}</span>
                                                                </div>
                                                            </Link>
                                                            </Tooltip>
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
                                                            <button
                                                                onClick={() => setDetailTaskId(task.id)}
                                                                className="text-sm text-gray-500 dark:text-gray-400 truncate block text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                                                            >
                                                                {task.isSubtask && (
                                                                    <svg className="inline h-3 w-3 mr-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                                                )}
                                                                {task.title}
                                                            </button>
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

            {/* Dashboard View */}
            {view === 'dashboard' && (() => {
                const STATUS_COLORS = {
                    backlog: { bg: 'bg-gray-100 dark:bg-gray-700', bar: 'bg-gray-400', text: 'text-gray-600 dark:text-gray-300' },
                    to_do: { bg: 'bg-blue-50 dark:bg-blue-900/30', bar: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400' },
                    in_progress: { bg: 'bg-yellow-50 dark:bg-yellow-900/30', bar: 'bg-yellow-500', text: 'text-yellow-600 dark:text-yellow-400' },
                    in_review: { bg: 'bg-purple-50 dark:bg-purple-900/30', bar: 'bg-purple-500', text: 'text-purple-600 dark:text-purple-400' },
                    done: { bg: 'bg-green-50 dark:bg-green-900/30', bar: 'bg-green-500', text: 'text-green-600 dark:text-green-400' },
                    cancelled: { bg: 'bg-red-50 dark:bg-red-900/30', bar: 'bg-red-300', text: 'text-red-400 dark:text-red-500' },
                };
                const PRIORITY_COLORS = {
                    urgent: { bg: 'bg-red-50 dark:bg-red-900/30', bar: 'bg-red-500', text: 'text-red-600 dark:text-red-400', border: 'border-red-200 dark:border-red-800' },
                    high: { bg: 'bg-orange-50 dark:bg-orange-900/30', bar: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800' },
                    medium: { bg: 'bg-blue-50 dark:bg-blue-900/30', bar: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800' },
                    low: { bg: 'bg-gray-50 dark:bg-gray-800', bar: 'bg-gray-400', text: 'text-gray-500 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-700' },
                };

                const stats = dashboardStats;

                return (
                    <div className="space-y-6">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Total Tasks */}
                            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Tasks</span>
                                    <span className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                    <div className="bg-green-500 h-2 rounded-full transition-all duration-500" style={{ width: `${stats.completionRate}%` }} />
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">{stats.completionRate}% complete</p>
                            </div>

                            {/* Completed */}
                            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Completed</span>
                                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/40">
                                        <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                    </span>
                                </div>
                                <span className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.byStatus.done}</span>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">of {stats.total - stats.byStatus.cancelled} actionable</p>
                            </div>

                            {/* In Progress */}
                            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">In Progress</span>
                                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-yellow-100 dark:bg-yellow-900/40">
                                        <svg className="w-4 h-4 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    </span>
                                </div>
                                <span className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.activeTasks}</span>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{stats.byStatus.backlog} backlog, {stats.byStatus.to_do} to do, {stats.byStatus.in_progress} active, {stats.byStatus.in_review} in review</p>
                            </div>

                            {/* Overdue */}
                            <div className={`bg-white dark:bg-gray-800 rounded-xl border p-5 ${stats.overdue.length > 0 ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700'}`}>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Overdue</span>
                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${stats.overdue.length > 0 ? 'bg-red-100 dark:bg-red-900/40' : 'bg-gray-100 dark:bg-gray-700'}`}>
                                        <svg className={`w-4 h-4 ${stats.overdue.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </span>
                                </div>
                                <span className={`text-2xl font-bold ${stats.overdue.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>{stats.overdue.length}</span>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">past due date</p>
                            </div>
                        </div>

                        {/* Status Breakdown + Priority Breakdown */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Status Breakdown */}
                            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Status Breakdown</h3>
                                {stats.total === 0 ? (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">No tasks yet</p>
                                ) : (
                                    <div className="space-y-3">
                                        {/* Stacked bar */}
                                        <div className="flex rounded-full h-3 overflow-hidden">
                                            {TASK_STATUSES.map((s) => {
                                                const pct = stats.total > 0 ? (stats.byStatus[s] / stats.total) * 100 : 0;
                                                if (pct === 0) return null;
                                                return <Tooltip key={s} content={`${formatLabel(s)}: ${stats.byStatus[s]}`}><div className={`${STATUS_COLORS[s].bar} transition-all duration-500`} style={{ width: `${pct}%` }} /></Tooltip>;
                                            })}
                                        </div>
                                        {/* Legend */}
                                        <div className="space-y-2">
                                            {TASK_STATUSES.map((s) => (
                                                <div key={s} className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[s].bar}`} />
                                                        <span className="text-sm text-gray-600 dark:text-gray-300">{formatLabel(s)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium text-gray-900 dark:text-white">{stats.byStatus[s]}</span>
                                                        <span className="text-xs text-gray-400 w-10 text-right">{stats.total > 0 ? Math.round((stats.byStatus[s] / stats.total) * 100) : 0}%</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Priority Breakdown */}
                            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Priority Breakdown</h3>
                                {stats.activeTasks === 0 ? (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">No active tasks</p>
                                ) : (
                                    <div className="space-y-3">
                                        {['urgent', 'high', 'medium', 'low'].map((p) => {
                                            const count = stats.byPriority[p];
                                            const pct = stats.activeTasks > 0 ? (count / stats.activeTasks) * 100 : 0;
                                            return (
                                                <div key={p}>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className={`text-sm font-medium ${PRIORITY_COLORS[p].text}`}>{formatLabel(p)}</span>
                                                        <span className="text-sm text-gray-600 dark:text-gray-300">{count}</span>
                                                    </div>
                                                    <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                                                        <div className={`${PRIORITY_COLORS[p].bar} h-2 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Due Date Overview */}
                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Due Date Overview</h3>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className={`rounded-lg p-4 ${stats.overdue.length > 0 ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                                    <p className={`text-2xl font-bold ${stats.overdue.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>{stats.overdue.length}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Overdue</p>
                                </div>
                                <div className={`rounded-lg p-4 ${stats.dueToday.length > 0 ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                                    <p className={`text-2xl font-bold ${stats.dueToday.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'}`}>{stats.dueToday.length}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Due Today</p>
                                </div>
                                <div className={`rounded-lg p-4 ${stats.dueThisWeek.length > 0 ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                                    <p className={`text-2xl font-bold ${stats.dueThisWeek.length > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>{stats.dueThisWeek.length}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Due This Week</p>
                                </div>
                                <div className="rounded-lg p-4 bg-gray-50 dark:bg-gray-700/50">
                                    <p className="text-2xl font-bold text-gray-500 dark:text-gray-400">{stats.noDueDate.length}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">No Due Date</p>
                                </div>
                            </div>
                        </div>

                        {/* Assignee Workload */}
                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Assignee Workload</h3>
                            {stats.assignees.length === 0 ? (
                                <p className="text-sm text-gray-500 dark:text-gray-400">No tasks assigned</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-gray-200 dark:border-gray-700">
                                                <th className="text-left py-2 pr-4 font-medium text-gray-500 dark:text-gray-400">Assignee</th>
                                                <th className="text-center py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Total</th>
                                                <th className="text-center py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Active</th>
                                                <th className="text-center py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Done</th>
                                                <th className="text-center py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Overdue</th>
                                                <th className="text-left py-2 pl-4 font-medium text-gray-500 dark:text-gray-400">Progress</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stats.assignees.map((a) => {
                                                const progressPct = a.total > 0 ? Math.round((a.done / a.total) * 100) : 0;
                                                return (
                                                    <tr key={a.id} className="border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                                                        <td className="py-2.5 pr-4">
                                                            {a.user ? (
                                                                <div className="flex items-center gap-2">
                                                                    <Avatar user={a.user} size="sm" />
                                                                    <span className="text-gray-900 dark:text-white font-medium">{a.user.name}</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-gray-400 dark:text-gray-500 italic">Unassigned</span>
                                                            )}
                                                        </td>
                                                        <td className="text-center py-2.5 px-3 text-gray-900 dark:text-white font-medium">{a.total}</td>
                                                        <td className="text-center py-2.5 px-3 text-blue-600 dark:text-blue-400">{a.active}</td>
                                                        <td className="text-center py-2.5 px-3 text-green-600 dark:text-green-400">{a.done}</td>
                                                        <td className="text-center py-2.5 px-3">
                                                            <span className={a.overdue > 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-400 dark:text-gray-500'}>{a.overdue}</span>
                                                        </td>
                                                        <td className="py-2.5 pl-4">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-20 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                                                                    <div className="bg-green-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
                                                                </div>
                                                                <span className="text-xs text-gray-400 w-8">{progressPct}%</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })()}

            </div>
          </div>

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
                    <Tooltip content="Clear selection"><button onClick={clearSelection} className="p-1 rounded hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors ml-1">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button></Tooltip>
                </div>
            )}

            {/* Task Context Menu */}
            {contextMenu && (
                <TaskContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    task={contextMenu.task}
                    canEdit={canEditTask(contextMenu.task)}
                    canDelete={canManageTasks}
                    onDuplicate={handleDuplicateTask}
                    onToggleComplete={handleToggleComplete}
                    onAddSubtask={handleAddSubtask}
                    onCopyLink={handleCopyTaskLink}
                    onDelete={handleDeleteTask}
                    onClose={() => setContextMenu(null)}
                />
            )}

            {/* Confirm Delete Modal */}
            <ConfirmModal
                isOpen={!!confirmDelete}
                onClose={() => setConfirmDelete(null)}
                onConfirm={handleConfirmDelete}
                title={confirmDelete?.title}
                message={confirmDelete?.message}
            />

            <DuplicateProjectModal
                isOpen={!!duplicateTarget}
                onClose={() => setDuplicateTarget(null)}
                project={duplicateTarget}
            />

            {celebration && (
                <CelebrationEffect
                    x={celebration.x}
                    y={celebration.y}
                    onComplete={() => setCelebration(null)}
                />
            )}

            {/* Automation rule execution toasts */}
            {automationToasts.length > 0 && (
                <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
                    {automationToasts.map((toast) => (
                        <AutomationToast
                            key={toast.id}
                            toast={toast}
                            onDismiss={(id) => setAutomationToasts((prev) => prev.filter((t) => t.id !== id))}
                        />
                    ))}
                </div>
            )}
            {/* Task detail slide-over panel */}
            {detailTaskId && (
                <TaskDetailPanel
                    projectId={project.id}
                    taskId={detailTaskId}
                    onClose={() => setDetailTaskId(null)}
                    onTaskUpdate={(taskId, field, value) => {
                        handleInlineUpdate(taskId, field, value);
                    }}
                    onSubtaskCreated={(parentId, newSubtask) => {
                        setLocalTasks(prev => prev.map(t => {
                            if (t.id !== parentId) return t;
                            const updatedSubs = [...(t.subtasks || []), newSubtask];
                            return {
                                ...t,
                                subtasks: updatedSubs,
                                subtasks_count: updatedSubs.length,
                                completed_subtasks_count: updatedSubs.filter(s => s.status === 'done').length,
                            };
                        }));
                    }}
                    users={users}
                />
            )}
        </AuthenticatedLayout>
    );
}
