import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, router, usePage } from '@inertiajs/react';
import {
    DndContext,
    DragOverlay,
    closestCenter,
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
import InlineDatePicker, { CalendarGrid } from '../../Components/InlineDatePicker';
import CelebrationEffect from '../../Components/CelebrationEffect';
import InlineCustomFieldEditor from '../../Components/InlineCustomFieldEditor';
import TaskContextMenu from '../../Components/TaskContextMenu';
import TaskDetailPanel from '../../Components/TaskDetailPanel';
import ProjectContextMenu from '../../Components/ProjectContextMenu';
import DuplicateProjectModal from '../../Components/DuplicateProjectModal';
import ShareProjectModal from '../../Components/ShareProjectModal';
import MemberAvatarStack from '../../Components/MemberAvatarStack';
import Tooltip from '../../Components/Tooltip';
import ProjectCharts from '../../Components/ProjectCharts';
import { formatLabel, formatDate, apiFetch, isPastDue, formatMinutes, formatElapsed, isCompletedLate } from '../../utils';
import { computeAllFormulas, formatFormulaResult } from '../../formulaEngine';
import { weekOfYearLabel } from '../../weekOfYear';
import { orderSections, moveSection } from '../../sectionTree';
import { initialHiddenColumns, DEFAULT_HIDDEN_COLUMN_IDS } from '../../columnPrefs';
import { taskCompletionPercent } from '../../taskCompletion';
import { request } from '../../apiClient';
import InlinePopover from '../../Components/InlinePopover';

// Types whose value is computed from other data rather than entered. They are
// read-only everywhere: no inline editor, no bulk edit, no filtering.
const DERIVED_FIELD_TYPES = ['formula', 'week_of_year'];

// Statuses that count as closed — mirrors Task::CLOSING_STATUSES on the server.
const CLOSING_TASK_STATUSES = ['done', 'cancelled'];
const isDerivedField = (type) => DERIVED_FIELD_TYPES.includes(type);
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

// Inline-editable fields that map to a bulk action (Asana-style multi-select editing)
const BULK_FIELD_ACTIONS = {
    status: 'update_status',
    priority: 'update_priority',
    assigned_to: 'assign',
    due_date: 'update_due_date',
    start_date: 'update_start_date',
};

// Render a custom field value for a task row
// Comment & attachment count indicators shown after the task title in list view
function TaskMetaBadges({ task }) {
    if (!task.comments_count && !task.attachments_count) return null;
    return (
        <span className="flex items-center gap-2 shrink-0 text-xs text-gray-400 dark:text-gray-500 font-normal" data-no-select>
            {task.comments_count > 0 && (
                <Tooltip content={`${task.comments_count} comment${task.comments_count === 1 ? '' : 's'}`}>
                    <span className="flex items-center gap-0.5">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        {task.comments_count}
                    </span>
                </Tooltip>
            )}
            {task.attachments_count > 0 && (
                <Tooltip content={`${task.attachments_count} attachment${task.attachments_count === 1 ? '' : 's'}`}>
                    <span className="flex items-center gap-0.5">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        {task.attachments_count}
                    </span>
                </Tooltip>
            )}
        </span>
    );
}

/**
 * One task's custom field values with `fieldId` set to `value`, in the shape the
 * server sends back.
 *
 * Shared because the two places that change a value optimistically — editing a
 * cell and dragging a card between Board columns — have to agree on that shape.
 * They did not: the Board wrote `value_option_id` alone, and every reader that
 * shows a label reads `selected_option`, so a dragged card showed its new column
 * while the List view showed a dash until the page was reloaded.
 *
 * @param options  the field's options, for resolving a select to its label
 * @param meta     extras the server would have derived (people_names)
 */
function mergeCustomFieldValue(existingValues, { fieldId, fieldType, value, options = [], meta = null }) {
    const values = [...(existingValues || [])];
    const idx = values.findIndex((v) => v.custom_field_id === fieldId);

    const entry = {
        custom_field_id: fieldId,
        value_text: (fieldType === 'text' || fieldType === 'textarea') ? value : null,
        value_number: fieldType === 'number' ? value : null,
        value_date: fieldType === 'date' ? value : null,
        value_option_id: fieldType === 'single_select' ? value : null,
        value_json: (fieldType === 'multi_select' || fieldType === 'people') ? value : null,
        selected_option: fieldType === 'single_select' && value
            ? (options || []).find((o) => String(o.id) === String(value)) || null
            : null,
    };

    // people_names is a server-side accessor and the PATCH response is not
    // merged back, so it has to be carried from the editor or the cell blanks out.
    if (fieldType === 'people') {
        entry.people_names = meta?.people_names ?? null;
    }

    if (idx >= 0) {
        values[idx] = { ...values[idx], ...entry };
    } else {
        values.push(entry);
    }

    return values;
}

function renderCustomFieldValue(task, customField) {
    if (customField.type === 'formula') {
        const val = customField._formulaValue;
        if (val == null) return <span className="text-gray-300 dark:text-gray-600">—</span>;
        return <span>{formatFormulaResult(val, customField.config)}</span>;
    }

    // Derived from whichever date the field was configured to follow, so it reads
    // from the task rather than from a stored value of its own.
    if (customField.type === 'week_of_year') {
        const label = weekOfYearLabel(task, customField.config);
        if (!label) return <span className="text-gray-300 dark:text-gray-600">—</span>;
        return <span>{label}</span>;
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
                <div className="flex flex-wrap justify-center gap-1">
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

// Value editor for bulk-applying a custom field to all selected tasks
function BulkCustomFieldEditor({ field, onApply }) {
    const [draft, setDraft] = useState('');
    const [multiDraft, setMultiDraft] = useState([]);

    const sortedOptions = [...(field.options || [])].sort((a, b) =>
        field.config?.sort_mode === 'manual' ? (a.position ?? 0) - (b.position ?? 0) : a.label.localeCompare(b.label)
    );

    if (field.type === 'date') {
        return (
            <div className="p-3">
                <CalendarGrid selectedDate={null} onSelect={(date) => onApply(date)} />
                <button onClick={() => onApply(null)} className="mt-2 w-full text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors text-center">
                    Clear value
                </button>
            </div>
        );
    }

    if (field.type === 'single_select') {
        return (
            <div className="py-1 max-h-60 overflow-y-auto scrollbar-thin">
                <button onClick={() => onApply(null)} className="w-full text-left px-3 py-1.5 text-sm text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors italic">
                    Clear value
                </button>
                {sortedOptions.map((opt) => (
                    <button key={opt.id} onClick={() => onApply(opt.id)} className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        {opt.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />}
                        {opt.label}
                    </button>
                ))}
            </div>
        );
    }

    if (field.type === 'multi_select') {
        const toggle = (id) => {
            const idStr = String(id);
            setMultiDraft((prev) => (prev.includes(idStr) ? prev.filter((x) => x !== idStr) : [...prev, idStr]));
        };
        return (
            <div className="py-1">
                <div className="max-h-52 overflow-y-auto scrollbar-thin">
                    {sortedOptions.map((opt) => {
                        const checked = multiDraft.includes(String(opt.id));
                        return (
                            <button key={opt.id} onClick={() => toggle(opt.id)} className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 dark:border-gray-600'}`}>
                                    {checked && (
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                    )}
                                </span>
                                {opt.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />}
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-2 flex justify-between">
                    <button onClick={() => onApply(null)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Clear value</button>
                    <button onClick={() => onApply(multiDraft.length > 0 ? multiDraft.map(Number) : null)} className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors">Apply</button>
                </div>
            </div>
        );
    }

    // text / textarea / number
    const inputClass = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500';
    const apply = () => onApply(draft === '' ? null : draft);
    return (
        <div className={`p-2 ${field.type === 'textarea' ? 'min-w-[260px]' : ''}`}>
            {field.type === 'textarea' ? (
                <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={10000} rows={3} className={`${inputClass} resize-y min-h-20`} placeholder="Enter text..." />
            ) : (
                <input
                    autoFocus
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') apply(); }}
                    className={inputClass}
                    placeholder={field.type === 'number' ? 'Enter number...' : 'Enter text...'}
                    {...(field.type === 'number' ? { max: 99999999999, min: -99999999999 } : { maxLength: 255 })}
                />
            )}
            <div className="flex justify-between gap-2 mt-2">
                <button onClick={() => onApply(null)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Clear value</button>
                <button onClick={apply} className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors">Apply</button>
            </div>
        </div>
    );
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

    const isOverdue = isPastDue(task.due_date) && task.status !== 'done' && task.status !== 'cancelled';
    const isDone = task.status === 'done';

    // Hovering Delete turns the row's outline red, the way it does on a form's
    // questions. Declared before stickyBg, which reads it.
    const [deleteHovered, setDeleteHovered] = useState(false);

    const stickyBg = isDragging
        ? 'bg-blue-50 dark:bg-blue-900/30'
        : deleteHovered
            ? 'bg-red-50 dark:bg-red-900/20'
            : 'bg-gray-50 dark:bg-gray-800 group-hover:bg-primary-50/40 dark:group-hover:bg-primary-900/10';

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
            case 'estimate':
                return (
                    <td key="estimate" className="px-6 py-3 text-sm text-center overflow-hidden tabular-nums text-gray-600 dark:text-gray-300" style={cStyle}>
                        {task.estimated_minutes ? formatMinutes(task.estimated_minutes) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                );
            case 'logged': {
                // Over the estimate is the number worth noticing, so it is the
                // only one that changes colour.
                const over = task.estimated_minutes > 0 && task.logged_minutes > task.estimated_minutes;
                return (
                    <td key="logged" className={`px-6 py-3 text-sm text-center overflow-hidden tabular-nums ${over ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-600 dark:text-gray-300'}`} style={cStyle}>
                        {task.logged_minutes ? formatMinutes(task.logged_minutes) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                );
            }
            case 'series':
                return (
                    <td key="series" className="px-6 py-3 text-sm text-center overflow-hidden" style={cStyle}>
                        {task.series_number ? (
                            <span className="font-mono text-xs text-gray-600 dark:text-gray-300 truncate">{task.series_number}</span>
                        ) : (
                            <span className="text-gray-300 dark:text-gray-600">—</span>
                        )}
                    </td>
                );
            case 'status':
                return (
                    <td key="status" className="px-6 py-3 text-sm text-center overflow-hidden" style={cStyle}>
                        {canEditTask ? (
                            <StatusPicker currentStatus={task.status} isOpen={openPopover === 'status'} onToggle={togglePopover('status')} onSelect={(status) => handleFieldUpdate('status', status)} />
                        ) : (
                            <StatusBadge status={task.status} type="task" />
                        )}
                    </td>
                );
            case 'priority':
                return (
                    <td key="priority" className="px-6 py-3 text-sm text-center overflow-hidden" style={cStyle}>
                        {canEditTask ? (
                            <PriorityPicker currentPriority={task.priority} isOpen={openPopover === 'priority'} onToggle={togglePopover('priority')} onSelect={(priority) => handleFieldUpdate('priority', priority)} />
                        ) : (
                            <PriorityBadge priority={task.priority} />
                        )}
                    </td>
                );
            case 'assignee':
                return (
                    <td key="assignee" className="px-6 py-3 text-sm text-center overflow-hidden" style={cStyle}>
                        {canManageTaskDetails ? (
                            <AssigneePicker currentAssignee={task.assignee} users={users} isOpen={openPopover === 'assignee'} onToggle={togglePopover('assignee')} onSelect={(user) => handleFieldUpdate('assigned_to', user ? user.id : null)} />
                        ) : (
                            <div className="flex items-center justify-center gap-2 overflow-hidden">
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
                    <td key="dates" className="px-6 py-3 text-sm text-center overflow-hidden" style={cStyle}>
                        <div className="flex items-center justify-center gap-1 overflow-hidden">
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
                                    {task.due_time_label && (
                                        <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">{task.due_time_label}</span>
                                    )}
                                </span>
                            )}
                        </div>
                    </td>
                );
            case 'completed':
                return (
                    <td key="completed" className="px-6 py-3 text-sm text-center overflow-hidden text-gray-600 dark:text-gray-300" style={cStyle}>
                        {task.completed_at
                            ? <span className="text-xs truncate">{formatDate(task.completed_at)}</span>
                            : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                );
            case 'started':
                return (
                    <td key="started" className="px-6 py-3 text-sm text-center overflow-hidden text-gray-600 dark:text-gray-300" style={cStyle}>
                        {task.started_at
                            ? <span className="text-xs truncate">{formatDate(task.started_at)}</span>
                            : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                );
            case 'motion': {
                const inMotion = timeInMotion(task);
                return (
                    <td key="motion" className="px-6 py-3 text-sm text-center overflow-hidden tabular-nums" style={cStyle}>
                        {inMotion === null
                            ? <span className="text-gray-300 dark:text-gray-600">—</span>
                            : (
                                // Still open, so the number is still moving —
                                // coloured to say so rather than reading as final.
                                <span className={task.completed_at
                                    ? 'text-xs text-gray-600 dark:text-gray-300'
                                    : 'text-xs text-primary-600 dark:text-primary-400'}>
                                    {formatElapsed(inMotion)}
                                </span>
                            )}
                    </td>
                );
            }
            case 'completion': {
                // Derived, never entered: subtasks if there are any, otherwise
                // the task's own status. The bar makes a column of numbers
                // scannable without reading each one.
                const pct = taskCompletionPercent(task);
                return (
                    <td key="completion" className="px-6 py-3 text-sm overflow-hidden" style={cStyle}>
                        <div className="flex items-center gap-2" title={`${pct}% complete`}>
                            <div className="flex-1 min-w-[2.5rem] h-1.5 rounded-full bg-gray-200 dark:bg-gray-700">
                                <div
                                    className={`h-1.5 rounded-full transition-all duration-300 ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                            <span className="tabular-nums text-xs text-gray-600 dark:text-gray-300 w-9 text-right">{pct}%</span>
                        </div>
                    </td>
                );
            }
            default:
                if (colId.startsWith('cf-')) {
                    const cfId = Number(colId.replace('cf-', ''));
                    const cf = customFields.find(f => f.id === cfId);
                    if (!cf) return null;
                    const cfDisplay = cf.type === 'formula' ? { ...cf, _formulaValue: formulaResults[task.id]?.[cf.id] ?? null } : cf;
                    return (
                        <td key={colId} className="px-6 py-3 text-sm text-center text-gray-700 dark:text-gray-300 overflow-hidden" style={cStyle}>
                            <div className="truncate">
                            {canEditTask && !isDerivedField(cf.type) ? (
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
        <tr ref={setNodeRef} style={style} {...attributes} {...listeners} data-task-id={task.id} onClick={(e) => { if (e.target.closest('button, input, select, [role="listbox"], [data-no-select]')) return; if (onSelect) { e.preventDefault(); onSelect(task.id, e); } }} onContextMenu={(e) => onContextMenu?.(e, task)} className={`group transition-colors bg-gray-50/50 dark:bg-gray-800/30 cursor-grab active:cursor-grabbing touch-none ${isDragging ? 'z-50 shadow-md' : ''} ${isSelected ? 'bg-primary-100 dark:bg-primary-900/30' : ''} ${
                isFocused
                    ? 'ring-2 ring-inset ring-primary-400'
                    : deleteHovered
                        ? 'ring-1 ring-inset ring-red-400 dark:ring-red-500 bg-red-50 dark:bg-red-900/20'
                        : 'hover:ring-1 hover:ring-inset hover:ring-primary-300 dark:hover:ring-primary-600 hover:bg-primary-50/40 dark:hover:bg-primary-900/10'
            }`}>
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
            <td className={`sticky left-[52px] z-10 ${stickyBg} shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] pl-6 pr-6 py-3 text-sm overflow-hidden ${isDone ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-700 dark:text-gray-300'}`} style={colStyle('title')}>
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
                    <TaskMetaBadges task={task} />
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
                                onMouseEnter={() => setDeleteHovered(true)}
                                onMouseLeave={() => setDeleteHovered(false)}
                                onFocus={() => setDeleteHovered(true)}
                                onBlur={() => setDeleteHovered(false)}
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
/**
 * How long a task has been in motion: wall-clock from the moment work started
 * to the moment it finished, or to now while it is still open.
 *
 * Deliberately not the logged time, which measures effort rather than elapsed
 * time and is normally the smaller number.
 */
function timeInMotion(task) {
    if (!task.started_at) return null;

    const started = new Date(task.started_at);
    const ended = task.completed_at ? new Date(task.completed_at) : new Date();
    const minutes = Math.round((ended - started) / 60000);

    // A completion recorded before the start is somebody fixing data by hand.
    return minutes < 0 ? null : minutes;
}

const DEFAULT_COLUMN_IDS = ['status', 'priority', 'assignee', 'dates', 'completed', 'completion', 'estimate', 'logged'];

// What each built-in column means, shown on hover. Worth having because several
// of these are not self-evident from a one-word heading: two are derived rather
// than entered, and two are easily read as each other.
const COLUMN_DESCRIPTIONS = {
    title: 'The task name. Click a row to open it.',
    series: "The task's number in this project's series.",
    status: 'Where the task has reached, from Backlog to Done.',
    priority: 'How urgent the task is, from Low to Urgent.',
    assignee: 'The person responsible for the task.',
    dates: 'When the task is due. Overdue dates are shown in red.',
    completed: 'When the task was closed. Empty until it is.',
    started: 'When work actually began — stamped on the way into In Progress, or by the Start button.',
    motion: 'Elapsed time from starting to finishing, still counting while the task is open. Not the same as logged effort.',
    completion: 'Progress. Taken from subtasks when there are any, otherwise from status.',
    estimate: 'How long the task was expected to take.',
    logged: 'Time actually tracked. Turns red once it passes the estimate.',
};

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
function SortableColumnHeader({ id, children, description, width, onResize, sortConfig, onSort, onHide, onEditField, onDeleteField }) {
    const { attributes, listeners, setNodeRef, isDragging } = useSortable({ id });
    const isCustomField = id.startsWith('cf-');
    const isSorted = sortConfig?.key === id;
    return (
        <th
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            style={width ? { width, minWidth: width, maxWidth: width } : undefined}
            className={`group/col relative px-6 py-3 text-center text-xs font-medium uppercase tracking-wider whitespace-nowrap select-none transition-colors overflow-hidden text-ellipsis
                ${isDragging
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 cursor-grabbing opacity-50'
                    : 'text-gray-500 dark:text-gray-400 cursor-grab hover:bg-gray-100 dark:hover:bg-gray-700/50'
                }`}
        >
            <div className="flex items-center justify-center gap-1.5 pr-5">
                <svg className="h-3 w-3 shrink-0 opacity-0 group-hover/col:opacity-40 transition-opacity" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
                    <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                    <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
                </svg>
                {/* On the label rather than the whole cell: the <th> carries the
                    drag listeners, and a tooltip that followed a drag would trail
                    the column across the header. */}
                <Tooltip content={description}>
                    <span className="truncate">{children}</span>
                </Tooltip>
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

    const isOverdue = isPastDue(task.due_date) && task.status !== 'done' && task.status !== 'cancelled';
    const isDone = task.status === 'done';

    // The frozen first column paints its own background; without this it stays
    // white while the rest of the row lights up.
    // Hovering Delete turns the row's outline red, the way it does on a form's
    // questions. Declared before stickyBg, which reads it.
    const [deleteHovered, setDeleteHovered] = useState(false);

    const stickyBg = isDragging
        ? 'bg-blue-50 dark:bg-blue-900/30'
        : isSelected
            ? 'bg-primary-100 dark:bg-primary-900/30'
            : deleteHovered
                ? 'bg-red-50 dark:bg-red-900/20'
                : 'bg-white dark:bg-gray-800 group-hover:bg-primary-50/40 dark:group-hover:bg-primary-900/10';

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
            case 'estimate':
                return (
                    <td key="estimate" className="px-6 py-3 text-sm text-center overflow-hidden tabular-nums text-gray-600 dark:text-gray-300" style={cStyle}>
                        {task.estimated_minutes ? formatMinutes(task.estimated_minutes) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                );
            case 'logged': {
                // Over the estimate is the number worth noticing, so it is the
                // only one that changes colour.
                const over = task.estimated_minutes > 0 && task.logged_minutes > task.estimated_minutes;
                return (
                    <td key="logged" className={`px-6 py-3 text-sm text-center overflow-hidden tabular-nums ${over ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-600 dark:text-gray-300'}`} style={cStyle}>
                        {task.logged_minutes ? formatMinutes(task.logged_minutes) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                );
            }
            case 'series':
                return (
                    <td key="series" className="px-6 py-3 text-sm text-center overflow-hidden" style={cStyle}>
                        {task.series_number ? (
                            <span className="font-mono text-xs text-gray-600 dark:text-gray-300 truncate">{task.series_number}</span>
                        ) : (
                            <span className="text-gray-300 dark:text-gray-600">—</span>
                        )}
                    </td>
                );
            case 'status':
                return (
                    <td key="status" className="px-6 py-4 text-sm text-center overflow-hidden" style={cStyle}>
                        {canEditTask ? (
                            <StatusPicker currentStatus={task.status} isOpen={openPopover === 'status'} onToggle={togglePopover('status')} onSelect={(status) => handleFieldUpdate('status', status)} />
                        ) : (
                            <StatusBadge status={task.status} type="task" />
                        )}
                    </td>
                );
            case 'priority':
                return (
                    <td key="priority" className="px-6 py-4 text-sm text-center overflow-hidden" style={cStyle}>
                        {canEditTask ? (
                            <PriorityPicker currentPriority={task.priority} isOpen={openPopover === 'priority'} onToggle={togglePopover('priority')} onSelect={(priority) => handleFieldUpdate('priority', priority)} />
                        ) : (
                            <PriorityBadge priority={task.priority} />
                        )}
                    </td>
                );
            case 'assignee':
                return (
                    <td key="assignee" className="px-6 py-4 text-sm text-center overflow-hidden" style={cStyle}>
                        <div className="flex items-center justify-center gap-2 overflow-hidden">
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
                    <td key="dates" className="px-6 py-4 text-sm text-center overflow-hidden" style={cStyle}>
                        <div className="flex items-center justify-center gap-1 overflow-hidden">
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
                                    {task.due_time_label && (
                                        <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">{task.due_time_label}</span>
                                    )}
                                </span>
                            )}
                        </div>
                    </td>
                );
            case 'completed':
                return (
                    <td key="completed" className="px-6 py-4 text-sm text-center overflow-hidden text-gray-600 dark:text-gray-300" style={cStyle}>
                        {task.completed_at
                            ? <span className="truncate">{formatDate(task.completed_at)}</span>
                            : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                );
            case 'started':
                return (
                    <td key="started" className="px-6 py-4 text-sm text-center overflow-hidden text-gray-600 dark:text-gray-300" style={cStyle}>
                        {task.started_at
                            ? <span className="truncate">{formatDate(task.started_at)}</span>
                            : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                );
            case 'motion': {
                const inMotion = timeInMotion(task);
                return (
                    <td key="motion" className="px-6 py-4 text-sm text-center overflow-hidden tabular-nums" style={cStyle}>
                        {inMotion === null
                            ? <span className="text-gray-300 dark:text-gray-600">—</span>
                            : (
                                // Still open, so the number is still moving —
                                // coloured to say so rather than reading as final.
                                <span className={task.completed_at
                                    ? 'text-xs text-gray-600 dark:text-gray-300'
                                    : 'text-xs text-primary-600 dark:text-primary-400'}>
                                    {formatElapsed(inMotion)}
                                </span>
                            )}
                    </td>
                );
            }
            case 'completion': {
                // Derived, never entered: subtasks if there are any, otherwise
                // the task's own status. The bar makes a column of numbers
                // scannable without reading each one.
                const pct = taskCompletionPercent(task);
                return (
                    <td key="completion" className="px-6 py-4 text-sm overflow-hidden" style={cStyle}>
                        <div className="flex items-center gap-2" title={`${pct}% complete`}>
                            <div className="flex-1 min-w-[2.5rem] h-1.5 rounded-full bg-gray-200 dark:bg-gray-700">
                                <div
                                    className={`h-1.5 rounded-full transition-all duration-300 ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                            <span className="tabular-nums text-xs text-gray-600 dark:text-gray-300 w-9 text-right">{pct}%</span>
                        </div>
                    </td>
                );
            }
            default:
                if (colId.startsWith('cf-')) {
                    const cfId = Number(colId.replace('cf-', ''));
                    const cf = customFields.find(f => f.id === cfId);
                    if (!cf) return null;
                    const cfDisplay = cf.type === 'formula' ? { ...cf, _formulaValue: formulaResults[task.id]?.[cf.id] ?? null } : cf;
                    return (
                        <td key={colId} className="px-6 py-4 text-sm text-center text-gray-700 dark:text-gray-300 overflow-hidden" style={cStyle}>
                            <div className="truncate">
                            {canEditTask && !isDerivedField(cf.type) ? (
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
            // The outline matches the form builder's questions — ring-inset
            // rather than a border, because a border on a table row shifts the
            // grid. The keyboard-focused row keeps its heavier ring: being
            // focused outranks being hovered.
            className={`group transition-colors cursor-grab active:cursor-grabbing touch-none ${
                isDragging ? 'bg-blue-50 dark:bg-blue-900/30' : ''
            } ${isSelected ? 'bg-primary-100 dark:bg-primary-900/30' : ''} ${
                isFocused
                    ? 'ring-2 ring-inset ring-primary-400'
                    : deleteHovered
                        ? 'ring-1 ring-inset ring-red-400 dark:ring-red-500 bg-red-50 dark:bg-red-900/20'
                        : 'hover:ring-1 hover:ring-inset hover:ring-primary-300 dark:hover:ring-primary-600 hover:bg-primary-50/40 dark:hover:bg-primary-900/10'
            }`}
        >
            <td className={`sticky left-0 z-10 ${stickyBg} relative pl-4 pr-2 py-4 w-[52px] min-w-[52px]`}>
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
            <td className={`sticky left-[52px] z-10 ${stickyBg} shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] pl-2 pr-6 py-4 text-sm font-medium overflow-hidden ${isDone ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'}`} style={colStyle('title')}>
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
                    <TaskMetaBadges task={task} />
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
                                onMouseEnter={() => setDeleteHovered(true)}
                                onMouseLeave={() => setDeleteHovered(false)}
                                onFocus={() => setDeleteHovered(true)}
                                onBlur={() => setDeleteHovered(false)}
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

// Droppable zone for sections (allows dropping tasks into/between sections)
/**
 * Reveal control for a section's completed tasks.
 *
 * A plain "show all" isn't enough once a project has recurring work: a weekly
 * task accumulates an occurrence every week, and revealing everything buries the
 * handful of one-off tasks someone actually wanted to look back at. So the
 * recurring series are offered individually, by title, with their counts.
 */
function CompletedToggleRow({ hiddenCount, closedCount, reveal, recurringTitles, onSelect }) {
    const [open, setOpen] = useState(false);
    const anchorRef = useRef(null);

    // Nothing completed in this section at all — no control to show.
    if (!closedCount) return null;

    const label = reveal === 'all'
        ? `Hide ${closedCount} completed`
        : reveal !== null
            ? `Showing “${reveal}” — ${hiddenCount} still hidden`
            : `Show ${hiddenCount} completed ${hiddenCount === 1 ? 'task' : 'tasks'}`;

    const choose = (value) => { onSelect(value); setOpen(false); };

    const itemClass = 'w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between gap-3';

    return (
        <tr>
            <td colSpan={99} className="px-0 py-1">
                <div className="sticky left-0 pl-14 w-fit">
                    <button
                        ref={anchorRef}
                        type="button"
                        onClick={() => (recurringTitles.length === 0 && reveal === null
                            ? choose('all')
                            : setOpen((o) => !o))}
                        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                    >
                        <svg
                            className={`h-3 w-3 transition-transform ${reveal !== null ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                        {label}
                    </button>

                    <InlinePopover isOpen={open} onClose={() => setOpen(false)} anchorRef={anchorRef}>
                        <div className="py-1 min-w-[220px] max-w-xs">
                            <button type="button" onClick={() => choose('all')} className={itemClass}>
                                <span>Show all completed</span>
                                <span className="text-xs text-gray-400">{closedCount}</span>
                            </button>

                            {recurringTitles.length > 0 && (
                                <>
                                    <div className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500 border-t border-gray-200 dark:border-gray-700 mt-1">
                                        Completed recurring tasks
                                    </div>
                                    <div className="max-h-56 overflow-y-auto scrollbar-thin">
                                        {recurringTitles.map(({ title, count }) => (
                                            <button
                                                key={title}
                                                type="button"
                                                onClick={() => choose(title)}
                                                className={`${itemClass} ${reveal === title ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}
                                            >
                                                <span className="truncate">{title}</span>
                                                <span className="text-xs text-gray-400 shrink-0">{count}</span>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}

                            {reveal !== null && (
                                <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1">
                                    <button type="button" onClick={() => choose(null)} className={itemClass}>
                                        <span>Hide completed again</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </InlinePopover>
                </div>
            </td>
        </tr>
    );
}

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

function SortableSectionHeader({ section, isCollapsed, onToggleCollapse, isEditing, editingName, onEditName, onStartEditing, onRename, onCancelEditing, onAddTask, onAddSubsection, onDelete, onColorChange, canManage, projectId, taskCount }) {
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
                {/* Sub-sections are indented under their column, with a rule
                    down the left so the grouping reads at a glance. */}
                <div
                    className={`sticky left-0 flex items-center gap-2 px-3 py-2 w-fit ${
                        section.depth === 1 ? 'ml-4 border-l-2 border-gray-200 dark:border-gray-700 pl-2' : ''
                    }`}
                >
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
                            {/* Only offered on a column — sub-sections do not
                                nest further. */}
                            {onAddSubsection && (
                                <Tooltip content="Add sub-section">
                                    <button
                                        onClick={onAddSubsection}
                                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                    >
                                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h6M4 5v10a2 2 0 002 2h4m4-4h6m-3-3v6" />
                                        </svg>
                                    </button>
                                </Tooltip>
                            )}
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
    const { project, tasks: serverTasks, sections: serverSections = [], canManageProject, canManageTasks, canManageCharts = false, canArchiveProject = false, charts = [], automationRules, customFields: initialCustomFields = [], forms = [], savedSort = null, auth, users } = usePage().props;

    const [localCustomFields, setLocalCustomFields] = useState(initialCustomFields);
    const [showDetails, setShowDetails] = useState(false);
    const [view, setView] = useState('list');

    // Gantt time scale. A day grid at 40px per day makes a two-year project a
    // 29,000px canvas, so anything longer than a few weeks needs coarser units.
    // Remembered per project, the same way column preferences are.
    // What the Board's columns stand for: task status, or the options of one of
    // the project's single-select custom fields. Only single-select qualifies —
    // a column has to be one value, and text, numbers, dates and multi-select
    // give either an unbounded set of columns or a task belonging in several.
    // Date custom fields overlaid on the Gantt — an actual start and finish
    // against the planned bar, a permit expiry, a follow-up. Stored as a list of
    // field ids so several can be shown at once, each with its own legend entry.
    const [ganttDateFields, setGanttDateFields] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem(`gantt-dates-${project?.id}`) || '[]');
        } catch {
            return [];
        }
    });
    // Whether two shown date fields should be joined into a range bar rather
    // than left as two separate pins. Only meaningful with exactly two on.
    const [ganttLinkDates, setGanttLinkDates] = useState(() => {
        try {
            return localStorage.getItem(`gantt-link-dates-${project?.id}`) === '1';
        } catch {
            return false;
        }
    });
    const toggleGanttLinkDates = () => {
        setGanttLinkDates((prev) => {
            const next = !prev;
            try { localStorage.setItem(`gantt-link-dates-${project?.id}`, next ? '1' : '0'); } catch { /* private mode */ }
            return next;
        });
    };

    const toggleGanttDateField = (id) => {
        setGanttDateFields((prev) => {
            const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
            try { localStorage.setItem(`gantt-dates-${project?.id}`, JSON.stringify(next)); } catch { /* private mode */ }
            return next;
        });
    };

    const [boardGroupBy, setBoardGroupBy] = useState(() => {
        try {
            return localStorage.getItem(`board-group-${project?.id}`) || 'status';
        } catch {
            return 'status';
        }
    });
    const changeBoardGroupBy = (next) => {
        setBoardGroupBy(next);
        try { localStorage.setItem(`board-group-${project?.id}`, next); } catch { /* private mode */ }
    };

    const [ganttScale, setGanttScale] = useState(() => {
        try {
            return localStorage.getItem(`gantt-scale-${project?.id}`) || 'day';
        } catch {
            return 'day';
        }
    });
    const changeGanttScale = (next) => {
        setGanttScale(next);
        try { localStorage.setItem(`gantt-scale-${project?.id}`, next); } catch { /* private mode */ }
    };

    const [filterSearch, setFilterSearch] = useState('');
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [dynamicFilters, setDynamicFilters] = useState([]); // [{id, fieldId, operator, value}]
    const nextFilterIdRef = useRef(1);

    const getOperatorsForType = (fieldType) => {
        switch (fieldType) {
            case 'select': case 'single_select':
                return [{ value: 'is', label: 'is' }, { value: 'is_not', label: 'is not' }, { value: 'is_empty', label: 'is empty' }, { value: 'is_not_empty', label: 'is not empty' }];
            case 'multi_select':
                return [{ value: 'includes_any', label: 'has any of' }, { value: 'includes_all', label: 'has all of' }, { value: 'is_empty', label: 'is empty' }, { value: 'is_not_empty', label: 'is not empty' }];
            case 'text': case 'textarea':
                return [{ value: 'contains', label: 'contains' }, { value: 'not_contains', label: 'does not contain' }, { value: 'equals', label: 'is' }, { value: 'is_empty', label: 'is empty' }, { value: 'is_not_empty', label: 'is not empty' }];
            case 'number':
                return [{ value: 'eq', label: '=' }, { value: 'neq', label: '\u2260' }, { value: 'gt', label: '>' }, { value: 'gte', label: '\u2265' }, { value: 'lt', label: '<' }, { value: 'lte', label: '\u2264' }, { value: 'between', label: 'between' }];
            case 'date':
                return [{ value: 'is', label: 'is' }, { value: 'before', label: 'before' }, { value: 'after', label: 'after' }, { value: 'between', label: 'between' }, { value: 'is_empty', label: 'is empty' }, { value: 'is_not_empty', label: 'is not empty' }];
            default:
                return [{ value: 'is', label: 'is' }];
        }
    };

    /**
     * Jump from a dashboard figure to the tasks behind it.
     *
     * Replaces the filters rather than adding to them: a number on the
     * dashboard counts *all* matching tasks, so carrying an existing filter
     * across would land on a list that doesn't add up to what was clicked.
     * The search box is cleared for the same reason.
     *
     * The advanced panel is opened so the applied filters are visible and can
     * be adjusted — a list that silently narrowed itself is worse than no
     * drill-down at all.
     */
    const drillDown = useCallback((filters) => {
        setDynamicFilters(
            filters.map((f) => ({
                id: nextFilterIdRef.current++,
                operator: 'is',
                ...f,
            }))
        );
        setFilterSearch('');
        setShowAdvancedFilters(true);
        setView('list');
        // Same reason the view tabs do this: those panels sit above the list, so
        // drilling down with one open lands on a list the panel is covering.
        setShowCustomFields(false);
        setShowAutomation(false);
    }, []);

    /**
     * A local calendar date, offset by days, as YYYY-MM-DD.
     *
     * Built from the local parts rather than toISOString(), which converts to
     * UTC and would hand back yesterday for anyone ahead of Greenwich.
     */
    const isoDate = useCallback((offsetDays = 0) => {
        const d = new Date();
        d.setDate(d.getDate() + offsetDays);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }, []);

    /**
     * The end of the dashboard's week window.
     *
     * Deliberately the same arithmetic the "Due This Week" panel uses —
     * today + (7 - dayOfWeek) — so the drill-down covers exactly the days the
     * tile counted. On a Sunday that is a week out, not today.
     */
    const isoEndOfWeek = useCallback(() => isoDate(7 - new Date().getDay()), [isoDate]);

    /**
     * The dashboard counts active tasks in most panels, so a drill-down has to
     * exclude both closing statuses or the list will not match the figure that
     * was clicked.
     */
    const activeOnly = useMemo(() => ([
        { fieldId: 'status', operator: 'is_not', value: 'done' },
        { fieldId: 'status', operator: 'is_not', value: 'cancelled' },
    ]), []);

    /** Overdue, expressed in the filter language the list view already speaks. */
    const overdueFilters = useCallback(() => ([
        { fieldId: 'due_date', operator: 'before', value: isoDate(0) },
        ...activeOnly,
    ]), [isoDate, activeOnly]);

    const addDynamicFilter = () => {
        setDynamicFilters(prev => [...prev, { id: nextFilterIdRef.current++, fieldId: '', operator: 'is', value: '' }]);
        setShowAdvancedFilters(true);
    };

    const updateDynamicFilter = (filterId, updates) => {
        setDynamicFilters(prev => prev.map(f => f.id === filterId ? { ...f, ...updates } : f));
    };

    const removeDynamicFilter = (filterId) => {
        setDynamicFilters(prev => {
            const next = prev.filter(f => f.id !== filterId);
            if (next.length === 0) setShowAdvancedFilters(false);
            return next;
        });
    };
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [duplicateTarget, setDuplicateTarget] = useState(null);
    const [showShareModal, setShowShareModal] = useState(false);
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
    const [bulkDropdown, setBulkDropdown] = useState(null); // 'status' | 'priority' | 'assign' | 'due_date' | 'start_date' | 'custom_field' | null
    const [bulkAssignSearch, setBulkAssignSearch] = useState('');
    const [bulkCustomField, setBulkCustomField] = useState(null); // custom field object being bulk-edited
    const [localSections, setLocalSections] = useState(serverSections);
    const [collapsedSections, setCollapsedSections] = useState(new Set());
    const [editingSectionId, setEditingSectionId] = useState(null);
    const [editingSectionName, setEditingSectionName] = useState('');
    const [addingSectionName, setAddingSectionName] = useState(null); // null = not adding, string = input value
    // Which section is having a sub-section added under it, if any.
    const [addingSubsectionFor, setAddingSubsectionFor] = useState(null);
    const [addingSubsectionName, setAddingSubsectionName] = useState('');
    const [showAutomation, setShowAutomation] = useState(false);
    const [showCustomFields, setShowCustomFields] = useState(false);

    /**
     * Switch the main view, closing the Custom Fields and Automation panels.
     *
     * Those panels render above the view content rather than in place of it, so
     * setting the view alone left the tab highlighted and the content below
     * genuinely changed while the panel went on filling the screen — which reads
     * as the click having done nothing, and needed a page reload to clear.
     *
     * showCustomFields only hides its panel; CustomFieldManager stays mounted so
     * the column header's edit and delete still reach it through cfManagerRef.
     */
    const selectView = useCallback((next) => {
        setView(next);
        setShowCustomFields(false);
        setShowAutomation(false);
    }, []);
    const [celebration, setCelebration] = useState(null); // { x, y } or null
    const [automationToasts, setAutomationToasts] = useState([]);
    // Why a status change was refused (project close rule), shown as a toast.
    // Also carries export failures — see handleExport.
    const [blockedMessage, setBlockedMessage] = useState(null);
    const [exporting, setExporting] = useState(false);

    /**
     * Download the project's tasks as a spreadsheet.
     *
     * Fetched rather than navigated to. Assigning window.location.href hands the
     * request to the browser, which gives the app no callback and no status — so
     * a server error produced a button that looked like it did nothing at all,
     * leaving the user unable to tell a failure from an empty export or a
     * missing permission. Going through fetch means a failure can be seen and
     * said out loud.
     */
    const handleExport = useCallback(async () => {
        if (exporting) return;
        setExporting(true);

        try {
            const response = await fetch(`/projects/${project.id}/export`, {
                headers: { Accept: 'application/octet-stream' },
                credentials: 'same-origin',
            });

            if (!response.ok) {
                // 419 is a stale CSRF/session, which reads as "you are logged out"
                // rather than as a broken export.
                setBlockedMessage(
                    response.status === 419
                        ? 'Your session has expired. Reload the page and try the export again.'
                        : `Export failed (HTTP ${response.status}). Please try again, and tell an administrator if it keeps happening.`
                );
                return;
            }

            const blob = await response.blob();

            // Prefer the filename the server chose, so the export keeps its name.
            const disposition = response.headers.get('Content-Disposition') || '';
            const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
            const filename = match ? decodeURIComponent(match[1]) : `project-${project.id}-tasks.xlsx`;

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            // Offline, DNS, a dropped connection — fetch rejects rather than
            // returning a response, and this is the only place it can surface.
            setBlockedMessage(`Export could not start: ${e.message}. Check your connection and try again.`);
        } finally {
            setExporting(false);
        }
    }, [project.id, exporting]);

    // Auto-dismiss so it doesn't linger over the board.
    useEffect(() => {
        if (!blockedMessage) return;
        const t = setTimeout(() => setBlockedMessage(null), 6000);
        return () => clearTimeout(t);
    }, [blockedMessage]);
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

    // Hidden columns (persisted per project). Default-hidden columns are folded
    // in once via initialHiddenColumns; the decision lives in columnPrefs.js so
    // it can be tested, the localStorage writes stay here.
    const [hiddenColumns, setHiddenColumns] = useState(() => {
        try {
            const saved = localStorage.getItem(`wmt-col-hidden-${project.id}`);
            // Which defaults have already been folded in. Stored as a list so a
            // newly added default-hidden column is still hidden once for people
            // whose saved preference predates it; the old boolean '1' is read as
            // "completed only", which is what it meant when it was written.
            const rawApplied = localStorage.getItem(`wmt-col-hidden-init-${project.id}`);
            let applied = null;
            try { applied = rawApplied && rawApplied !== '1' ? JSON.parse(rawApplied) : rawApplied; } catch { applied = rawApplied; }

            const { hidden, persist, applied: nowApplied } =
                initialHiddenColumns(saved ? JSON.parse(saved) : null, applied);

            if (persist) {
                try {
                    localStorage.setItem(`wmt-col-hidden-${project.id}`, JSON.stringify(hidden));
                    localStorage.setItem(`wmt-col-hidden-init-${project.id}`, JSON.stringify(nowApplied));
                } catch {}
            }
            return new Set(hidden);
        } catch {}
        return new Set(DEFAULT_HIDDEN_COLUMN_IDS);
    });

    // Project rule: collapse closed tasks out of the list, with a per-section
    // reveal. Deliberately list-view only — the board has a Done column, and
    // emptying it would hide the tasks in the one place they belong.
    const hideCompleted = !!project.hide_completed_tasks;

    // groupKey -> reveal selection: 'all', a recurring task title, or absent for
    // "still hidden". A title is stored rather than an id because a recurring
    // series is a chain of separate tasks that share a name.
    const [revealedGroups, setRevealedGroups] = useState(() => new Map());

    const groupKey = (id) => (id === null || id === undefined ? '__unsectioned' : String(id));

    const setGroupReveal = useCallback((id, value) => {
        setRevealedGroups((prev) => {
            const next = new Map(prev);
            const key = groupKey(id);
            if (value === null) {
                next.delete(key);
            } else {
                next.set(key, value);
            }
            return next;
        });
    }, []);

    // Sort config { key, direction }, saved against the person rather than the
    // browser, so a sort chosen at a desk is still there on a laptop. The column
    // widths, order and hidden set are still per browser — they describe a
    // screen more than a preference.
    const LEGACY_SORT_KEY = `wmt-sort-${project.id}`;

    const readLegacySort = () => {
        try {
            const saved = JSON.parse(localStorage.getItem(LEGACY_SORT_KEY) || 'null');
            if (saved && typeof saved.key === 'string'
                && (saved.direction === 'asc' || saved.direction === 'desc')) {
                return saved;
            }
        } catch { /* private mode, or unparseable */ }
        return null;
    };

    const [sortConfig, setSortConfigState] = useState(() => savedSort || readLegacySort());

    // Wrapped rather than written at each call site: the toolbar, the arrow
    // button and the two column menus all set the sort, and one of them
    // forgetting to save is the bug this is fixing.
    const persistSort = useCallback((value) => {
        apiFetch(`/projects/${project.id}/view-preferences`, {
            method: 'PATCH',
            body: JSON.stringify({ sort: value }),
        }).catch(() => { /* the sort is a preference; a failed save is not worth a dialog */ });
    }, [project.id]);

    const setSortConfig = useCallback((next) => {
        setSortConfigState((prev) => {
            const value = typeof next === 'function' ? next(prev) : next;
            persistSort(value);
            return value;
        });
    }, [persistSort]);

    // A sort chosen before this moved server-side lives in localStorage on
    // whichever machine chose it. Adopt it once, then drop it, so nobody loses
    // the sort they set yesterday and no stale copy is left to disagree later.
    useEffect(() => {
        const legacy = readLegacySort();
        if (!legacy) return;
        try { localStorage.removeItem(LEGACY_SORT_KEY); } catch { /* private mode */ }
        if (savedSort) return;              // the server already has an opinion
        persistSort(legacy);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project.id]);

    // Custom field manager ref for edit/delete from column dropdown
    const cfManagerRef = useRef(null);


    /**
     * What the toolbar's Sort control offers.
     *
     * Built from the same keys getTaskSortValue understands, so the control and
     * the column-header menus cannot disagree about what is sortable. Date
     * custom fields come along on their own, which is the point — a project that
     * tracks an actual start can order by it without anyone wiring it up.
     */
    const sortOptions = useMemo(() => {
        const base = [
            { key: 'title', label: 'Title' },
            { key: 'status', label: 'Status' },
            { key: 'priority', label: 'Priority' },
            { key: 'assignee', label: 'Assignee' },
            { key: 'dates', label: 'Due date' },
            { key: 'completion', label: 'Completion' },
        ];
        const fields = (localCustomFields || [])
            .filter((f) => ['date', 'number', 'single_select', 'text', 'textarea'].includes(f.type))
            .map((f) => ({ key: `cf-${f.id}`, label: f.name }));
        return [...base, ...fields];
    }, [localCustomFields]);

    // A custom field the sort was saved against can be deleted while nobody is
    // looking, leaving a key that sorts everything equal and a Sort control
    // showing nothing. Drop it rather than leave the list in a state the UI
    // cannot explain.
    useEffect(() => {
        if (!sortConfig?.key?.startsWith('cf-')) return;
        if (sortOptions.some((o) => o.key === sortConfig.key)) return;
        setSortConfig(null);
    }, [sortConfig, sortOptions, setSortConfig]);

    const handleSortColumn = useCallback((colId, direction) => {
        setSortConfig(prev => {
            if (prev?.key === colId && prev?.direction === direction) return null; // toggle off
            return { key: colId, direction };
        });
    }, [setSortConfig]);

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

    // The Series column exists only where the project both numbers its tasks and
    // has the column switched on — a decision for the owner or a project admin,
    // made on the project's edit page. Leaving it out of the id list entirely
    // means nothing downstream has to know about the setting.
    const showSeriesColumn = !!project.task_series_enabled && project.show_task_series_column !== false;

    const effectiveColumnOrder = useMemo(() => {
        const cfIds = localCustomFields.map(cf => `cf-${cf.id}`);
        // Started and In Motion only exist for projects that track when work
        // begins. Inserted beside Date Completed rather than appended, because
        // started, finished and elapsed are one thought and belong together.
        const motionIds = project.show_time_in_motion ? ['started', 'motion'] : [];
        const base = motionIds.length
            ? DEFAULT_COLUMN_IDS.flatMap((id) => (id === 'completed' ? ['started', id, 'motion'] : [id]))
            : DEFAULT_COLUMN_IDS;
        const allIds = [...(showSeriesColumn ? ['series'] : []), ...base, ...cfIds];
        if (!columnOrder) return allIds;
        const valid = columnOrder.filter(id => allIds.includes(id));
        const missing = allIds.filter(id => !valid.includes(id));
        // Anything new normally lands at the end, which is where a fresh custom
        // field belongs. The motion columns do not: somebody who arranged their
        // columns months ago should still find them framing Date Completed
        // rather than stranded past Actions.
        if (motionIds.length && missing.some(id => motionIds.includes(id)) && valid.includes('completed')) {
            const rest = missing.filter(id => !motionIds.includes(id));
            const placed = valid.flatMap(id => (id === 'completed'
                ? [...(missing.includes('started') ? ['started'] : []), id, ...(missing.includes('motion') ? ['motion'] : [])]
                : [id]));
            return [...placed, ...rest];
        }
        return [...valid, ...missing];
    }, [columnOrder, localCustomFields, showSeriesColumn, project.show_time_in_motion]);

    // Visible column order (filtered by hidden)
    const visibleColumnOrder = useMemo(() => {
        return effectiveColumnOrder.filter(id => !hiddenColumns.has(id));
    }, [effectiveColumnOrder, hiddenColumns]);

    const columnSensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    const getColumnLabel = useCallback((colId) => {
        switch (colId) {
            case 'series': return 'Series';
            case 'estimate': return 'Estimate';
            case 'logged': return 'Logged';
            case 'status': return 'Status';
            case 'priority': return 'Priority';
            case 'assignee': return 'Assignee';
            case 'dates': return 'Due date';
            case 'completed': return 'Date Completed';
            case 'started': return 'Date Started';
            case 'motion': return 'In Motion';
            case 'completion': return 'Completion %';
            default:
                if (colId.startsWith('cf-')) {
                    const cfId = Number(colId.replace('cf-', ''));
                    return localCustomFields.find(cf => cf.id === cfId)?.name || colId;
                }
                return colId;
        }
    }, [localCustomFields]);

    /**
     * Hover text for a column heading. A custom field describes itself by type —
     * its name is already the heading, so repeating it would say nothing.
     */
    const getColumnDescription = useCallback((colId) => {
        if (colId.startsWith('cf-')) {
            const cfId = Number(colId.replace('cf-', ''));
            const cf = localCustomFields.find((f) => f.id === cfId);
            return cf ? `Custom field (${formatLabel(cf.type)}).` : null;
        }

        return COLUMN_DESCRIPTIONS[colId] ?? null;
    }, [localCustomFields]);

    // Sort comparator for tasks
    const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };
    const STATUS_ORDER = { backlog: 0, to_do: 1, in_progress: 2, in_review: 3, done: 4, cancelled: 5 };

    const getTaskSortValue = useCallback((task, key) => {
        switch (key) {
            // Sort on the sequence, not the formatted string: TASK-9 must come
            // before TASK-10, which a text sort would reverse. Unnumbered tasks
            // sort last, as every other column here treats "missing" as last.
            case 'series': return task.series_sequence ?? Infinity;
            // Unset sorts last, as every other column here treats missing.
            case 'estimate': return task.estimated_minutes ?? Infinity;
            case 'logged': return task.logged_minutes ?? Infinity;
            case 'title': return task.title?.toLowerCase() || '';
            case 'status': return STATUS_ORDER[task.status] ?? 99;
            case 'priority': return PRIORITY_ORDER[task.priority] ?? 99;
            case 'assignee': return task.assigned_user?.name?.toLowerCase() || '\uffff';
            case 'dates': return task.due_date || '\uffff';
            // ISO timestamps sort lexically; unfinished tasks have none and
            // sort last, as every other column here treats "missing".
            case 'completed': return task.completed_at || '\uffff';
            case 'completion': return taskCompletionPercent(task);
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

    // Drag indices are taken from what the user sees, and the list is displayed in
    // position order. Filtering the raw array would use insertion order instead,
    // which drifts from position order after the first reorder and would make the
    // next drag land in the wrong slot.
    const inDisplayOrder = useCallback(
        (tasks) => [...tasks].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
        []
    );

    const sortTasks = useCallback((tasks) => {
        // No column sort chosen: order by position, mirroring the server's
        // `orderBy('position')->orderBy('created_at', 'desc')`.
        //
        // Returning the array untouched here is why a reorder inside a section
        // needed a refresh: dragging rewrites each task's `position`, but the
        // array itself keeps its old order, so nothing moved on screen until the
        // server re-sent the rows already sorted.
        if (!sortConfig) {
            return [...tasks].sort((a, b) => {
                const ap = a.position ?? 0;
                const bp = b.position ?? 0;
                if (ap !== bp) return ap - bp;
                // Same position — fall back to the server's tiebreak.
                return new Date(b.created_at) - new Date(a.created_at);
            });
        }

        const { key, direction } = sortConfig;

        // "No value" is represented by a sentinel that sorts after everything —
        // which put blanks last ascending and, by the same token, *first*
        // descending. Sorting a date column newest-first then opened with every
        // task that has no date at all. Missing stays at the bottom either way;
        // only the tasks that actually have a value get reversed.
        const isMissing = (v) => v === '\uffff' || v === Infinity || v === null || v === undefined;

        return [...tasks].sort((a, b) => {
            const av = getTaskSortValue(a, key);
            const bv = getTaskSortValue(b, key);

            const am = isMissing(av);
            const bm = isMissing(bv);
            if (am && bm) return 0;
            if (am) return 1;
            if (bm) return -1;

            if (av < bv) return direction === 'asc' ? -1 : 1;
            if (av > bv) return direction === 'asc' ? 1 : -1;
            return 0;
        });
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
        // Reorder against effectiveColumnOrder rather than the persisted order.
        // The saved order only contains the columns that existed the last time one
        // was dragged; fields added since live in effectiveColumnOrder's appended
        // tail. Indexing into the stale saved array returned -1 for those, so the
        // drag was silently dropped and the column appeared undraggable.
        const order = [...effectiveColumnOrder];
        const oldIdx = order.indexOf(active.id);
        const newIdx = order.indexOf(over.id);
        if (oldIdx === -1 || newIdx === -1) return;

        const newOrder = arrayMove(order, oldIdx, newIdx);
        try { localStorage.setItem(`wmt-col-order-${project.id}`, JSON.stringify(newOrder)); } catch {}
        setColumnOrder(newOrder);
    }, [effectiveColumnOrder, project.id]);

    // Sync local state when server data changes (Inertia navigation, and the
    // partial reloads triggered by real-time events).
    //
    // This must be an effect, not a useMemo. useMemo is a caching hint — React
    // gives no guarantee it runs, and setting state from it is a render-phase
    // side effect. When it didn't fire, localTasks kept whatever it was seeded
    // with at mount, so another user's reorder only appeared after a full page
    // refresh remounted the component.
    useEffect(() => {
        setLocalTasks(serverTasks);
    }, [serverTasks]);

    useEffect(() => {
        setLocalSections(serverSections);
    }, [serverSections]);

    useEffect(() => {
        setLocalCustomFields(initialCustomFields);
    }, [initialCustomFields]);

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

        // Comment/attachment count updates for the list indicators
        channel.listen('.task.meta', (e) => {
            const counts = { comments_count: e.comments_count, attachments_count: e.attachments_count };
            setLocalTasks((prev) => prev.map((t) => {
                if (t.id === e.task_id) return { ...t, ...counts };
                if (e.parent_id && t.id === e.parent_id && t.subtasks?.some((s) => s.id === e.task_id)) {
                    return { ...t, subtasks: t.subtasks.map((s) => (s.id === e.task_id ? { ...s, ...counts } : s)) };
                }
                return t;
            }));
        });

        channel.listen('.section.updated', (e) => {
            switch (e.change_type) {
                case 'created':
                    setLocalSections((prev) =>
                        prev.some((s) => s.id === e.section.id) ? prev : [...prev, e.section]
                    );
                    break;
                case 'updated':
                    setLocalSections((prev) =>
                        prev.map((s) => (s.id === e.section.id ? { ...s, ...e.section } : s))
                    );
                    break;
                case 'deleted': {
                    // Sub-sections cascade with their parent, so both go.
                    const gone = new Set([e.section.id, ...(e.section.child_ids || [])]);
                    setLocalSections((prev) => prev.filter((s) => !gone.has(s.id)));
                    // The server unassigns their tasks rather than deleting them;
                    // without this they would vanish from the board instead of
                    // falling back to the unsectioned group.
                    setLocalTasks((prev) =>
                        prev.map((t) => (gone.has(t.section_id) ? { ...t, section_id: null } : t))
                    );
                    break;
                }
                case 'reordered':
                    if (Array.isArray(e.sections)) setLocalSections(e.sections);
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

    const filterableFields = useMemo(() => {
        const builtIn = [
            { id: 'status', name: 'Status', fieldType: 'select', options: TASK_STATUSES.map(s => ({ id: s, label: formatLabel(s) })) },
            { id: 'priority', name: 'Priority', fieldType: 'select', options: ['urgent', 'high', 'medium', 'low'].map(p => ({ id: p, label: formatLabel(p) })) },
            { id: 'assignee', name: 'Assignee', fieldType: 'select', options: assignees.map(a => ({ id: String(a.id), label: a.name })) },
            { id: 'due_date', name: 'Due Date', fieldType: 'date' },
            {
                id: 'completed_late',
                name: 'Finished Late',
                fieldType: 'select',
                options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
            },
        ];
        const custom = localCustomFields.filter(cf => !isDerivedField(cf.type)).map(cf => ({
            id: `cf_${cf.id}`, name: cf.name, fieldType: cf.type, options: cf.options, config: cf.config, cfId: cf.id,
        }));
        return [...builtIn, ...custom];
    }, [localCustomFields, assignees]);

    // Filter tasks
    const matchesFilters = useCallback((t) => {
        // Search the reference number as well as the title — a number nobody can
        // look up is not much of a reference.
        if (filterSearch) {
            const needle = filterSearch.toLowerCase();
            const haystack = `${t.title} ${t.series_number || ''}`.toLowerCase();
            if (!haystack.includes(needle)) return false;
        }

        // Dynamic filters
        for (const filter of dynamicFilters) {
            if (!filter.fieldId) continue;
            const { operator, value } = filter;
            const noValueNeeded = ['is_empty', 'is_not_empty'].includes(operator);
            if (!noValueNeeded && (value === '' || value === null || value === undefined)) continue;
            if (!noValueNeeded && Array.isArray(value) && value.length === 0) continue;

            const fieldDef = filterableFields.find(f => f.id === filter.fieldId);
            if (!fieldDef) continue;

            // Built-in fields
            if (filter.fieldId === 'status') {
                if (operator === 'is' && t.status !== value) return false;
                if (operator === 'is_not' && t.status === value) return false;
                if (operator === 'is_empty' && t.status) return false;
                if (operator === 'is_not_empty' && !t.status) return false;
                continue;
            }
            if (filter.fieldId === 'priority') {
                if (operator === 'is' && t.priority !== value) return false;
                if (operator === 'is_not' && t.priority === value) return false;
                if (operator === 'is_empty' && t.priority) return false;
                if (operator === 'is_not_empty' && !t.priority) return false;
                continue;
            }
            if (filter.fieldId === 'assignee') {
                if (operator === 'is' && String(t.assigned_to || '') !== value) return false;
                if (operator === 'is_not' && String(t.assigned_to || '') === value) return false;
                if (operator === 'is_empty' && t.assigned_to) return false;
                if (operator === 'is_not_empty' && !t.assigned_to) return false;
                continue;
            }
            if (filter.fieldId === 'completed_late') {
                // Only finished work can be finished late; anything still open
                // is "overdue", which is a different filter.
                const late = t.status === 'done' && isCompletedLate(t);
                const wanted = value === 'yes';
                if (operator === 'is' && late !== wanted) return false;
                if (operator === 'is_not' && late === wanted) return false;
                continue;
            }
            if (filter.fieldId === 'due_date') {
                const dateVal = t.due_date || '';
                if (operator === 'is' && dateVal !== value) return false;
                if (operator === 'before' && (!dateVal || dateVal >= value)) return false;
                if (operator === 'after' && (!dateVal || dateVal <= value)) return false;
                if (operator === 'between') {
                    if (!dateVal) return false;
                    if (value?.from && dateVal < value.from) return false;
                    if (value?.to && dateVal > value.to) return false;
                }
                if (operator === 'is_empty' && dateVal) return false;
                if (operator === 'is_not_empty' && !dateVal) return false;
                continue;
            }

            // Custom fields
            const cfId = fieldDef.cfId;
            if (!cfId) continue;
            const cfvs = t.custom_field_values || [];
            const cfv = cfvs.find(v => v.custom_field_id === cfId);

            if (fieldDef.fieldType === 'single_select') {
                if (operator === 'is') { if (!cfv || String(cfv.value_option_id) !== String(value)) return false; }
                else if (operator === 'is_not') { if (cfv && String(cfv.value_option_id) === String(value)) return false; }
                else if (operator === 'is_empty') { if (cfv && cfv.value_option_id) return false; }
                else if (operator === 'is_not_empty') { if (!cfv || !cfv.value_option_id) return false; }
            } else if (fieldDef.fieldType === 'multi_select') {
                const taskVals = (cfv?.value_json || []).map(String);
                if (operator === 'is_empty') { if (taskVals.length > 0) return false; }
                else if (operator === 'is_not_empty') { if (taskVals.length === 0) return false; }
                else {
                    const filterArr = Array.isArray(value) ? value : [value];
                    if (filterArr.length === 0) continue;
                    if (operator === 'includes_all') { if (!filterArr.every(fv => taskVals.includes(String(fv)))) return false; }
                    else { if (!filterArr.some(fv => taskVals.includes(String(fv)))) return false; }
                }
            } else if (fieldDef.fieldType === 'text' || fieldDef.fieldType === 'textarea') {
                const textVal = cfv?.value_text || '';
                if (operator === 'contains') { if (!textVal.toLowerCase().includes(String(value).toLowerCase())) return false; }
                else if (operator === 'not_contains') { if (textVal.toLowerCase().includes(String(value).toLowerCase())) return false; }
                else if (operator === 'equals') { if (textVal !== value) return false; }
                else if (operator === 'is_empty') { if (textVal !== '') return false; }
                else if (operator === 'is_not_empty') { if (textVal === '') return false; }
            } else if (fieldDef.fieldType === 'number') {
                const numVal = cfv?.value_number;
                if (operator === 'between') {
                    if (numVal === null || numVal === undefined) return false;
                    if (value?.min !== '' && value?.min !== undefined && Number(numVal) < Number(value.min)) return false;
                    if (value?.max !== '' && value?.max !== undefined && Number(numVal) > Number(value.max)) return false;
                } else {
                    if (numVal === null || numVal === undefined) return false;
                    const n = Number(numVal), target = Number(value);
                    if (operator === 'eq' && n !== target) return false;
                    if (operator === 'neq' && n === target) return false;
                    if (operator === 'gt' && n <= target) return false;
                    if (operator === 'gte' && n < target) return false;
                    if (operator === 'lt' && n >= target) return false;
                    if (operator === 'lte' && n > target) return false;
                }
            } else if (fieldDef.fieldType === 'date') {
                const dateVal = cfv?.value_date || '';
                if (operator === 'is' && dateVal !== value) return false;
                if (operator === 'before' && (!dateVal || dateVal >= value)) return false;
                if (operator === 'after' && (!dateVal || dateVal <= value)) return false;
                if (operator === 'between') {
                    if (!dateVal) return false;
                    if (value?.from && dateVal < value.from) return false;
                    if (value?.to && dateVal > value.to) return false;
                }
                if (operator === 'is_empty' && dateVal) return false;
                if (operator === 'is_not_empty' && !dateVal) return false;
            }
        }
        return true;
    }, [filterSearch, dynamicFilters, filterableFields]);

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

    /** The single-select fields this project offers as a Board grouping. */
    const boardGroupableFields = useMemo(
        () => (localCustomFields || []).filter((f) => f.type === 'single_select'),
        [localCustomFields]
    );

    /** The field currently grouping the Board, or null when grouping by status. */
    const boardField = useMemo(
        () => boardGroupableFields.find((f) => String(f.id) === String(boardGroupBy)) || null,
        [boardGroupableFields, boardGroupBy]
    );

    // Palette for option columns. Status columns keep their own semantic colours;
    // an arbitrary field has no inherent meaning, so options are coloured by
    // position purely to tell the columns apart.
    //
    // Each entry carries the pill as well as the dot. A status column gets its
    // colours from taskStatusColors; an option column has no equivalent, and
    // leaving the pill unstyled left the label taking whatever colour it
    // inherited — which on a dark ground was dark grey on near-black.
    const OPTION_STYLES = [
        { dot: 'bg-blue-500',   pill: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
        { dot: 'bg-purple-500', pill: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300' },
        { dot: 'bg-teal-500',   pill: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300' },
        { dot: 'bg-amber-500',  pill: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
        { dot: 'bg-rose-500',   pill: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
        { dot: 'bg-lime-500',   pill: 'bg-lime-50 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300' },
    ];
    const NOT_SET_STYLE = { dot: 'bg-gray-400', pill: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' };

    /**
     * The Board's columns, and the tasks in each.
     *
     * A task with no value for the field lands in a trailing "not set" column
     * rather than being dropped — otherwise switching grouping would silently
     * hide work, which is the one thing a board must never do.
     */
    const boardColumns = useMemo(() => {
        if (!boardField) {
            return TASK_STATUSES.map((st) => ({
                id: st,
                label: formatLabel(st),
                isStatus: true,
                tasks: tasksByStatus[st] || [],
            }));
        }

        const valueOf = (t) => (t.custom_field_values || [])
            .find((v) => v.custom_field_id === boardField.id)?.value_option_id ?? null;

        const cols = (boardField.options || []).map((o, i) => {
            const style = OPTION_STYLES[i % OPTION_STYLES.length];
            return {
                id: `opt-${o.id}`,
                optionId: o.id,
                label: o.label,
                dotClass: style.dot,
                badgeClass: style.pill,
                tasks: filteredTasks.filter((t) => String(valueOf(t)) === String(o.id)),
            };
        });

        cols.push({
            id: 'opt-none',
            optionId: null,
            label: 'Not set',
            dotClass: NOT_SET_STYLE.dot,
            badgeClass: NOT_SET_STYLE.pill,
            tasks: filteredTasks.filter((t) => !valueOf(t)),
        });

        return cols;
    }, [boardField, filteredTasks, tasksByStatus]);

    /**
     * Split a group's tasks into what to show and how many were held back.
     * Revealing a section is per-section and resets on reload — it's a peek at
     * finished work, not a change to the project's setting.
     */
    const splitCompleted = useCallback((tasks, groupId) => {
        if (!hideCompleted) {
            return { tasks, hiddenCount: 0, reveal: null, recurringTitles: [] };
        }

        const reveal = revealedGroups.get(groupKey(groupId)) ?? null;
        const closed = tasks.filter((t) => CLOSING_TASK_STATUSES.includes(t.status));

        // Filtered in place rather than concatenated so revealed tasks keep their
        // position in the section's sort order instead of jumping to the end.
        const visible = reveal === 'all'
            ? tasks
            : tasks.filter((t) => !CLOSING_TASK_STATUSES.includes(t.status)
                || (reveal !== null && t.title === reveal));

        // Recurring occurrences among the closed tasks, grouped by title — a
        // finished weekly task can otherwise bury everything else in the section.
        const counts = new Map();
        closed.forEach((t) => {
            if (!t.is_recurring && !t.recurring_source_id) return;
            counts.set(t.title, (counts.get(t.title) ?? 0) + 1);
        });
        const recurringTitles = [...counts.entries()]
            .map(([title, count]) => ({ title, count }))
            .sort((a, b) => a.title.localeCompare(b.title));

        return {
            tasks: visible,
            hiddenCount: closed.length - visible.filter((t) => CLOSING_TASK_STATUSES.includes(t.status)).length,
            closedCount: closed.length,
            reveal,
            recurringTitles,
        };
    }, [hideCompleted, revealedGroups]);

    const orderedSections = useMemo(() => orderSections(localSections), [localSections]);

    // Group filtered tasks by section for list view
    const tasksBySection = useMemo(() => {
        if (localSections.length === 0) return null; // No sections — render flat list
        const groups = [];
        // Unsectioned tasks first
        const unsectioned = sortTasks(filteredTasks.filter((t) => !t.section_id));
        groups.push({ id: null, name: 'Unsectioned', depth: 0, ...splitCompleted(unsectioned, null) });
        // Then each section in order, sub-sections under their own parent
        orderedSections.forEach((s) => {
            const sectionTasks = sortTasks(filteredTasks.filter((t) => t.section_id === s.id));
            groups.push({
                id: s.id,
                name: s.name,
                color: s.color,
                depth: s.depth,
                ...splitCompleted(sectionTasks, s.id),
            });
        });
        return groups;
    }, [filteredTasks, localSections, orderedSections, sortTasks, splitCompleted]);

    // Flat list (no sections) gets the same treatment as a single group.
    const flatList = useMemo(
        () => splitCompleted(filteredTasks, '__flat'),
        [filteredTasks, splitCompleted]
    );

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
                    doneLate: 0,
                    active: 0,
                    overdue: 0,
                };
            }
            assigneeMap[key].total++;
            if (t.status === 'done') {
                assigneeMap[key].done++;
                // Finished, but after the deadline. Counted separately from
                // "overdue", which is work still outstanding — these two answer
                // different questions and must not be conflated.
                if (isCompletedLate(t)) assigneeMap[key].doneLate++;
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
    const handleCreateSection = useCallback(async (name, parentId = null) => {
        if (!name.trim()) return;
        try {
            const res = await apiFetch(`/projects/${project.id}/sections`, {
                method: 'POST',
                body: JSON.stringify({ name: name.trim(), parent_id: parentId }),
            });
            if (res.ok) {
                const section = await res.json();
                setLocalSections((prev) => [...prev, section]);
            }
        } catch {}
        setAddingSectionName(null);
        setAddingSubsectionFor(null);
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
                // A 422 here is the project's close rule refusing the move. Without
                // a message the card just springs back and looks like a broken drag.
                if (res.status === 422) {
                    const body = await res.json().catch(() => null);
                    setBlockedMessage(body?.message || 'That task needs an attachment before it can be completed.');
                }
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
    /**
     * Save a rearranged list of sections.
     *
     * Positions are numbered within the list passed in — columns among columns,
     * a column's sub-sections among themselves — because the server keeps a
     * sequence per list, not one across the whole board.
     */
    const persistSectionReorder = useCallback((reorderedSections) => {
        const payload = reorderedSections.map((s, index) => ({
            id: s.id,
            position: index,
            parent_id: s.parent_id ?? null,
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
            if (!res.ok) {
                setLocalTasks(serverTasks);
                // Same close rule, reached from the list view's inline status edit.
                if (res.status === 422) {
                    const body = await res.json().catch(() => null);
                    const msg = body?.errors?.status?.[0] || body?.message;
                    if (msg) setBlockedMessage(msg);
                }
                return;
            }
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
    const handleCustomFieldUpdate = useCallback((taskId, fieldId, fieldType, value, meta) => {
        const buildOptimisticCfv = (existingValues) => mergeCustomFieldValue(existingValues, {
            fieldId,
            fieldType,
            value,
            options: localCustomFields.find((cf) => cf.id === fieldId)?.options || [],
            meta,
        });

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
        }).then(async (res) => {
            // fetch doesn't reject on 4xx, so without this a rejected save left the
            // optimistic value on screen as though it had been stored.
            if (!res.ok) {
                setLocalTasks(serverTasks);
                const body = await res.json().catch(() => null);
                const msg = body?.errors?.status?.[0] || body?.message;
                if (msg) setBlockedMessage(msg);
                return;
            }
            // The value saved, but an automation rule may have been refused.
            const body = await res.json().catch(() => null);
            if (body?.automation_warning) {
                setBlockedMessage(`Automation could not complete: ${body.automation_warning}`);
            }
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

        // Section header drag — reorder sections, respecting the hierarchy
        if (activeIdStr.startsWith('section-header-') && overIdStr.startsWith('section-header-')) {
            const activeSecId = parseInt(activeIdStr.replace('section-header-', ''));
            const overSecId = parseInt(overIdStr.replace('section-header-', ''));

            const move = moveSection(localSections, activeSecId, overSecId);

            if (move) {
                setLocalSections(move.sections);
                persistSectionReorder(move.changed);
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

            // Computed from localTasks, not inside a setLocalTasks updater: React
            // defers the updater when another update is already queued (setActiveId
            // above), so toPersist stayed null and the reorder was never saved.
            const activeTask = localTasks.find((t) => t.id === active.id);
            if (!activeTask) return;

            let toPersist = null;
            {
                // Ensure the task has the target section_id
                const updated = localTasks.map((t) =>
                    t.id === active.id ? { ...t, section_id: targetSectionId } : { ...t }
                );

                const targetTasks = inDisplayOrder(updated.filter((t) => t.section_id === targetSectionId && matchesFilters(t)));

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

                setLocalTasks(updated);
            }
            if (toPersist) persistReorder(toPersist);
        } else {
            // Flat list mode (no sections) — same synchronous computation.
            const filtered = inDisplayOrder(localTasks.filter(matchesFilters));
            const unfilteredIds = new Set(filtered.map((t) => t.id));

            const oldIndex = filtered.findIndex((t) => t.id === active.id);
            const newIndex = filtered.findIndex((t) => t.id === over.id);
            if (oldIndex === -1 || newIndex === -1) return;

            const reordered = arrayMove(filtered, oldIndex, newIndex);

            const result = [];
            let filteredIdx = 0;
            for (const t of localTasks) {
                if (unfilteredIds.has(t.id)) {
                    result.push({ ...reordered[filteredIdx], position: filteredIdx });
                    filteredIdx++;
                } else {
                    result.push(t);
                }
            }

            setLocalTasks(result);
            persistReorder(reordered);
        }
    }, [tasksBySection, localTasks, localSections, matchesFilters, persistReorder, persistSectionReorder]);

    // --- Subtask drag handler (within a parent) ---
    const handleSubtaskDragEnd = useCallback(async (parentId, event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        let toPersist = null;
        let previousSubtasks = null;
        setLocalTasks((prev) => prev.map((t) => {
            if (t.id !== parentId || !t.subtasks) return t;
            const oldIndex = t.subtasks.findIndex((s) => s.id === active.id);
            const newIndex = t.subtasks.findIndex((s) => s.id === over.id);
            if (oldIndex === -1 || newIndex === -1) return t;
            previousSubtasks = t.subtasks;
            const reordered = arrayMove(t.subtasks, oldIndex, newIndex);
            toPersist = reordered.map((s, i) => ({ id: s.id, status: s.status, position: i, section_id: s.section_id ?? null }));
            return { ...t, subtasks: reordered };
        }));

        if (!toPersist) return;

        // Was fire-and-forget: a failed persist left the screen showing an order
        // the server never accepted, with no error and no way back. Now it
        // reports and restores the order the server still holds.
        const { ok } = await request(`/projects/${project.id}/tasks/reorder`, {
            method: 'POST',
            body: JSON.stringify({ tasks: toPersist }),
        });
        if (!ok && previousSubtasks) {
            setLocalTasks((prev) => prev.map((t) => (t.id === parentId ? { ...t, subtasks: previousSubtasks } : t)));
        }
    }, [project.id]);

    // --- Board view drag handlers ---
    /**
     * Move a task between columns when the Board is grouped by a custom field.
     *
     * A separate path from the status drag on purpose: this writes one field
     * value and nothing else. Status ordering is persisted as a position within
     * a status, which has no meaning here, so a drop only changes which column
     * the task belongs to.
     */
    const persistBoardFieldMove = useCallback((task, optionId) => {
        const fieldId = boardField?.id;
        if (!fieldId) return;

        setLocalTasks((prev) => prev.map((t) => {
            if (t.id !== task.id) return t;
            return {
                ...t,
                custom_field_values: mergeCustomFieldValue(t.custom_field_values, {
                    fieldId,
                    fieldType: 'single_select',
                    value: optionId,
                    options: boardField.options || [],
                }),
            };
        }));

        apiFetch(`/projects/${project.id}/tasks/${task.id}/custom-field-values`, {
            method: 'PATCH',
            body: JSON.stringify({ values: { [fieldId]: optionId } }),
        }).then((res) => {
            if (!res.ok) setLocalTasks(serverTasks);   // put it back where it was
        }).catch(() => setLocalTasks(serverTasks));
    }, [boardField, project.id, serverTasks]);

    const handleBoardDragEnd = useCallback((event) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        const activeTask = localTasks.find((t) => t.id === active.id);
        if (!activeTask) return;

        // Grouped by a custom field: the columns are that field's options, so a
        // drop sets the value rather than touching status or position.
        if (boardField) {
            const overId = String(over.id);
            let targetCol = null;
            if (overId.startsWith('column-')) {
                targetCol = boardColumns.find((c) => c.id === overId.replace('column-', ''));
            } else {
                const overTask = localTasks.find((t) => t.id === over.id);
                targetCol = boardColumns.find((c) => c.tasks.some((t) => t.id === overTask?.id));
            }
            if (!targetCol) return;

            const current = (activeTask.custom_field_values || [])
                .find((v) => v.custom_field_id === boardField.id)?.value_option_id ?? null;
            if (String(current) === String(targetCol.optionId)) return;   // same column

            persistBoardFieldMove(activeTask, targetCol.optionId);
            return;
        }

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

        // Computed from localTasks directly rather than from inside a setLocalTasks
        // updater. React only runs an updater eagerly when nothing else is queued
        // on the fiber, and the setActiveId(null) above guarantees something is —
        // so the updater ran *after* this function returned, leaving toPersist null
        // and the drag never reaching the server at all. The card moved on screen
        // and nothing was saved, which is why no rule could refuse it.
        const updated = localTasks.map((t) => ({ ...t }));
        const activeIdx = updated.findIndex((t) => t.id === active.id);
        let toPersist = null;

        if (sameColumn) {
            // Reorder within column
            const columnTasks = inDisplayOrder(updated.filter((t) => t.status === targetStatus));
            const oldIdx = columnTasks.findIndex((t) => t.id === active.id);
            const newIdx = columnTasks.findIndex((t) => t.id === over.id);
            if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;

            const reordered = arrayMove(columnTasks, oldIdx, newIdx);
            reordered.forEach((t, i) => {
                const idx = updated.findIndex((u) => u.id === t.id);
                updated[idx].position = i;
            });

            toPersist = reordered;
        } else {
            // Move to different column
            updated[activeIdx].status = targetStatus;

            // Recalculate positions in the target column
            const targetTasks = inDisplayOrder(updated.filter((t) => t.status === targetStatus));

            // If dropping on a specific task, insert before/after it
            if (!overId.startsWith('column-')) {
                const movedTask = targetTasks.find((t) => t.id === active.id);
                const withoutMoved = targetTasks.filter((t) => t.id !== active.id);

                // Index within the list the card is being inserted *into*.
                // Taken from targetTasks it was one too high whenever the moved
                // card happened to sort above the card being dropped on — the
                // status was already reassigned above, so targetTasks still
                // contained it, carrying its old position from the other column.
                const overIdx = withoutMoved.findIndex((t) => t.id === over.id);
                const insertAt = overIdx === -1 ? withoutMoved.length : overIdx;

                withoutMoved.splice(insertAt, 0, movedTask);
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
        }

        setLocalTasks(updated);
        if (toPersist) persistReorder(toPersist);
    }, [localTasks, persistReorder, boardField, boardColumns, persistBoardFieldMove]);

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
        const { ok, data } = await request(`/projects/${project.id}/tasks/${task.id}/duplicate`, { method: 'POST' });
        // A silent reload used to hide the failure and drop any unsaved edits on
        // the page. Now the reason is toasted; reload only to resync the copy in.
        if (!ok) return;
        if (data.task) {
            setLocalTasks((prev) => [...prev, data.task]);
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
            const removing = selectedTasks.has(taskId);
            setSelectedTasks(prev => {
                const next = new Set(prev);
                if (next.has(taskId)) next.delete(taskId);
                else next.add(taskId);
                return next;
            });
            setLastClickedTaskId(removing ? null : taskId);
            setFocusedTaskId(removing ? null : taskId);
            return;
        } else {
            // Single select
            setSelectedTasks(new Set([taskId]));
            setLastClickedTaskId(taskId);
        }
        setFocusedTaskId(taskId);
    }, [lastClickedTaskId, flatVisibleTaskIds, selectedTasks]);

    const clearSelection = useCallback(() => {
        setSelectedTasks(new Set());
        setBulkDropdown(null);
        setFocusedTaskId(null);
        setLastClickedTaskId(null);
    }, []);

    // Clear selection when filters change
    useEffect(() => {
        setSelectedTasks(new Set());
        setFocusedTaskId(null);
        setLastClickedTaskId(null);
    }, [filterSearch, dynamicFilters]);

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
    const handleBulkAction = useCallback(async (action, value, opts = {}) => {
        if (selectedTasks.size === 0) return;
        const taskIds = Array.from(selectedTasks);
        setBulkDropdown(null);
        setBulkCustomField(null);

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
        const bulkField = action === 'update_custom_field'
            ? localCustomFields.find((f) => f.id === value.field_id)
            : null;
        const applyChange = (t) => {
            if (action === 'update_status') return { ...t, status: value };
            if (action === 'update_priority') return { ...t, priority: value };
            if (action === 'assign') {
                const assignee = value ? users.find((u) => u.id === value) : null;
                return { ...t, assigned_to: value, assignee: assignee ? { id: assignee.id, name: assignee.name } : null };
            }
            if (action === 'update_due_date') return { ...t, due_date: value || null };
            if (action === 'update_start_date') return { ...t, start_date: value || null };
            if (action === 'update_custom_field' && bulkField) {
                const values = [...(t.custom_field_values || [])];
                const idx = values.findIndex((v) => v.custom_field_id === bulkField.id);
                const entry = {
                    custom_field_id: bulkField.id,
                    value_text: (bulkField.type === 'text' || bulkField.type === 'textarea') ? value.value : null,
                    value_number: bulkField.type === 'number' ? value.value : null,
                    value_date: bulkField.type === 'date' ? value.value : null,
                    value_option_id: bulkField.type === 'single_select' ? value.value : null,
                    value_json: bulkField.type === 'multi_select' ? value.value : null,
                    selected_option: bulkField.type === 'single_select' && value.value
                        ? (bulkField.options || []).find((o) => o.id === Number(value.value)) || null
                        : null,
                };
                if (idx >= 0) { values[idx] = { ...values[idx], ...entry }; }
                else { values.push(entry); }
                return { ...t, custom_field_values: values };
            }
            return t;
        };
        setLocalTasks((prev) => prev.map((t) => {
            let updated = taskIds.includes(t.id) ? applyChange(t) : t;
            if (updated.subtasks?.some((s) => taskIds.includes(s.id))) {
                updated = { ...updated, subtasks: updated.subtasks.map((s) => (taskIds.includes(s.id) ? applyChange(s) : s)) };
            }
            return updated;
        }));

        if (!opts.keepSelection) clearSelection();

        const body = action === 'update_custom_field'
            ? { task_ids: taskIds, action, field_id: value.field_id, value: value.value }
            : { task_ids: taskIds, action, value };
        const { ok, data } = await request(`/projects/${project.id}/tasks/bulk`, {
            method: 'POST',
            body: JSON.stringify(body),
        });
        // The reload still resyncs the optimistic change, but now the user is
        // told why it snapped back instead of watching it silently undo.
        if (!ok) {
            router.reload({ only: ['tasks'] });
            return;
        }
        if (data.new_tasks?.length > 0) {
            setLocalTasks((prev) => [...prev, ...data.new_tasks]);
        }
    }, [selectedTasks, project.id, users, clearSelection, localCustomFields]);

    // Asana-style multi-select editing: changing a value on any selected task
    // applies it to every selected task (selection is kept for further edits)
    const editAppliesToSelection = useCallback((taskId) =>
        selectedTasks.size > 1 && selectedTasks.has(taskId), [selectedTasks]);

    const handleRowInlineUpdate = useCallback((taskId, field, value) => {
        if (editAppliesToSelection(taskId) && BULK_FIELD_ACTIONS[field]) {
            handleBulkAction(BULK_FIELD_ACTIONS[field], value, { keepSelection: true });
            return;
        }
        handleInlineUpdate(taskId, field, value);
    }, [editAppliesToSelection, handleBulkAction, handleInlineUpdate]);

    const handleSubtaskRowInlineUpdate = useCallback((taskId, field, value) => {
        if (editAppliesToSelection(taskId) && BULK_FIELD_ACTIONS[field]) {
            handleBulkAction(BULK_FIELD_ACTIONS[field], value, { keepSelection: true });
            return;
        }
        handleSubtaskInlineUpdate(taskId, field, value);
    }, [editAppliesToSelection, handleBulkAction, handleSubtaskInlineUpdate]);

    const handleRowCustomFieldUpdate = useCallback((taskId, fieldId, fieldType, value, meta) => {
        if (editAppliesToSelection(taskId)) {
            handleBulkAction('update_custom_field', { field_id: fieldId, value }, { keepSelection: true });
            return;
        }
        handleCustomFieldUpdate(taskId, fieldId, fieldType, value, meta);
    }, [editAppliesToSelection, handleBulkAction, handleCustomFieldUpdate]);

    // Handle bulk delete confirmation
    const handleConfirmDelete = () => {
        if (confirmDelete?.type === 'bulk') {
            const taskIds = confirmDelete.taskIds;
            setLocalTasks((prev) => prev.filter((t) => !taskIds.includes(t.id)));
            clearSelection();
            setConfirmDelete(null);
            // The old .catch only fired on a dropped connection, so a rejected
            // delete (say, no permission) left the rows gone from the screen but
            // alive on the server. request() catches the 4xx too, tells the user,
            // and the reload brings the rows back.
            request(`/projects/${project.id}/tasks/bulk`, {
                method: 'POST',
                body: JSON.stringify({ task_ids: taskIds, action: 'delete', value: null }),
            }).then(({ ok }) => { if (!ok) router.reload({ only: ['tasks'] }); });
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

    const activeFilterCount = dynamicFilters.filter(f => {
        if (!f.fieldId) return false;
        if (['is_empty', 'is_not_empty'].includes(f.operator)) return true;
        if (f.value === '' || f.value === null || f.value === undefined) return false;
        if (Array.isArray(f.value)) return f.value.length > 0;
        if (typeof f.value === 'object' && f.value !== null) return Object.values(f.value).some(x => x !== '' && x !== undefined);
        return true;
    }).length + (filterSearch ? 1 : 0);
    const hasActiveFilters = filterSearch || activeFilterCount > 0;

    const activeTask = activeId ? localTasks.find((t) => t.id === activeId) : null;

    return (
        <AuthenticatedLayout title={project.name} contained>
          <div className="flex flex-col h-full min-h-0">
            {/* Pinned header area */}
            <div className="shrink-0 pt-6">
            <PageHeader
                title={project.name}
                titleExtra={canManageProject && (
                    <ProjectContextMenu
                        align="left"
                        project={project}
                        isArchived={project.status === 'archived'}
                        onEdit={() => router.visit(`/projects/${project.id}/edit`)}
                        onDuplicate={() => setDuplicateTarget(project)}
                        onArchive={() => router.patch(`/projects/${project.id}/archive`, {}, { preserveScroll: true })}
                        onDelete={handleDeleteProject}
                        canArchive={canArchiveProject}
                        canDelete={canArchiveProject}
                    />
                )}
                breadcrumbs={[
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'Projects', href: '/projects' },
                    { label: project.name },
                ]}
                actions={
                    <div className="flex items-center gap-2">
                        <MemberAvatarStack
                            owner={project.owner}
                            members={project.members || []}
                            maxVisible={5}
                            onClick={() => setShowShareModal(true)}
                        />
                        {canManageProject && (
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => setShowShareModal(true)}
                            >
                                <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                </svg>
                                Share
                            </Button>
                        )}
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setShowDetails(v => !v)}
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {showDetails ? 'Hide Details' : 'Details'}
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleExport}
                            disabled={exporting}
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            {exporting ? 'Exporting…' : 'Export'}
                        </Button>
                        {canManageProject && (
                            <>
                            <LinkButton href={`/projects/${project.id}/forms`} variant="secondary" size="sm">
                                Forms
                            </LinkButton>
                            <Button
                                variant="secondary"
                                size="sm"
                                active={showCustomFields}
                                onClick={() => setShowCustomFields(v => !v)}
                            >
                                Custom Fields
                            </Button>
                            {canManageTasks && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    active={showAutomation}
                                    onClick={() => setShowAutomation(v => !v)}
                                >
                                    <AutomationIcon /> Automation
                                </Button>
                            )}
                            </>
                        )}
                    </div>
                }
            />

            {/* Project Details (hidden by default, toggled via Details button) */}
            {showDetails && (
                <Card className="mb-6">
                    <div className="flex flex-wrap items-start gap-6">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-3">
                                <StatusBadge status={project.status} type="project" />
                                {project.due_date && (
                                    <span className="text-sm text-gray-500 dark:text-gray-400">Due {formatDate(project.due_date)}</span>
                                )}
                            </div>
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
                </Card>
            )}

            {/* View Toggle + Filters + Add Task */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex flex-wrap items-center gap-3">
                    {/* View Toggle */}
                    <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-0.5">
                        <button
                            onClick={() => selectView('list')}
                            className={`inline-flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                view === 'list'
                                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                            }`}
                        >
                            <ListIcon /> <span className="hidden sm:inline">List</span>
                        </button>
                        <button
                            onClick={() => selectView('board')}
                            className={`inline-flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                view === 'board'
                                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                            }`}
                        >
                            <BoardIcon /> <span className="hidden sm:inline">Board</span>
                        </button>
                        <button
                            onClick={() => selectView('calendar')}
                            className={`inline-flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                view === 'calendar'
                                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                            }`}
                        >
                            <CalendarIcon /> <span className="hidden sm:inline">Calendar</span>
                        </button>
                        <button
                            onClick={() => selectView('gantt')}
                            className={`inline-flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                view === 'gantt'
                                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                            }`}
                        >
                            <GanttIcon /> <span className="hidden sm:inline">Gantt</span>
                        </button>
                        <button
                            onClick={() => selectView('dashboard')}
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
                    <button
                        type="button"
                        onClick={() => {
                            if (!showAdvancedFilters) {
                                if (dynamicFilters.length === 0) addDynamicFilter();
                                else setShowAdvancedFilters(true);
                            } else {
                                setShowAdvancedFilters(false);
                            }
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-lg border transition-colors ${
                            showAdvancedFilters || dynamicFilters.length > 0
                                ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-600'
                                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                    >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                        Filter
                        {activeFilterCount > 0 && (
                            <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 text-xs font-medium bg-primary-500 text-white rounded-full">{activeFilterCount}</span>
                        )}
                    </button>
                    {view === 'list' && (
                        <div className="flex items-center gap-1">
                            <select
                                value={sortConfig?.key || ''}
                                onChange={(e) => setSortConfig(e.target.value ? { key: e.target.value, direction: sortConfig?.direction || 'asc' } : null)}
                                title="Order the list by a column"
                                className="text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 py-1.5 pl-2.5 pr-7"
                            >
                                {/* Empty is the order people arranged by hand — the default,
                                    and it has to stay reachable once sorting is on. */}
                                <option value="">Sort: Manual</option>
                                {sortOptions.map((o) => (
                                    <option key={o.key} value={o.key}>Sort: {o.label}</option>
                                ))}
                            </select>
                            {sortConfig && (
                                <button
                                    type="button"
                                    onClick={() => setSortConfig((prev) => prev && { ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' })}
                                    aria-label={sortConfig.direction === 'asc' ? 'Sort descending' : 'Sort ascending'}
                                    title={sortConfig.direction === 'asc' ? 'Ascending — click for descending' : 'Descending — click for ascending'}
                                    className="inline-flex items-center px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round"
                                            d={sortConfig.direction === 'asc'
                                                ? 'M3 5h10M3 9h7M3 13h4m6 6V5m0 14l3-3m-3 3l-3-3'
                                                : 'M3 5h10M3 9h7M3 13h4m6-8v14m0-14l3 3m-3-3l-3 3'} />
                                    </svg>
                                </button>
                            )}
                        </div>
                    )}
                    {hasActiveFilters && (
                        <button
                            onClick={() => { setFilterSearch(''); setDynamicFilters([]); setShowAdvancedFilters(false); }}
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

            {/* Dynamic Filters Panel */}
            {showAdvancedFilters && (
                <Card className="mb-4">
                    <div className="space-y-2">
                        {dynamicFilters.map((filter, idx) => {
                            const fieldDef = filter.fieldId ? filterableFields.find(f => f.id === filter.fieldId) : null;
                            const operators = fieldDef ? getOperatorsForType(fieldDef.fieldType) : [];
                            const noValueNeeded = ['is_empty', 'is_not_empty'].includes(filter.operator);
                            const sortedOptions = (fieldDef?.options || []).slice().sort((a, b) => {
                                const sortMode = fieldDef?.config?.sort_mode || 'manual';
                                if (sortMode === 'alphabetical') return (a.label || '').localeCompare(b.label || '');
                                return (a.position ?? 0) - (b.position ?? 0);
                            });
                            const inputCls = "rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500";

                            return (
                                <div key={filter.id} className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-gray-400 dark:text-gray-500 w-12 shrink-0 text-right">{idx === 0 ? 'Where' : 'and'}</span>
                                    {/* Field selector */}
                                    <select
                                        value={filter.fieldId}
                                        onChange={(e) => {
                                            const newField = filterableFields.find(f => f.id === e.target.value);
                                            const defaultOp = newField ? getOperatorsForType(newField.fieldType)[0]?.value || 'is' : 'is';
                                            updateDynamicFilter(filter.id, { fieldId: e.target.value, operator: defaultOp, value: newField?.fieldType === 'multi_select' ? [] : '' });
                                        }}
                                        className={inputCls + ' min-w-[140px]'}
                                    >
                                        <option value="">Select field...</option>
                                        <optgroup label="Task Fields">
                                            {filterableFields.filter(f => !f.cfId).map(f => (
                                                <option key={f.id} value={f.id}>{f.name}</option>
                                            ))}
                                        </optgroup>
                                        {filterableFields.some(f => f.cfId) && (
                                            <optgroup label="Custom Fields">
                                                {filterableFields.filter(f => f.cfId).map(f => (
                                                    <option key={f.id} value={f.id}>{f.name}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                    </select>
                                    {/* Operator selector */}
                                    {fieldDef && operators.length > 0 && (
                                        <select
                                            value={filter.operator}
                                            onChange={(e) => {
                                                const newOp = e.target.value;
                                                let resetValue = '';
                                                if (['is_empty', 'is_not_empty'].includes(newOp)) resetValue = '';
                                                else if (newOp === 'between') resetValue = {};
                                                else if (['includes_any', 'includes_all'].includes(newOp)) resetValue = Array.isArray(filter.value) ? filter.value : [];
                                                else if (Array.isArray(filter.value)) resetValue = '';
                                                else resetValue = typeof filter.value === 'object' ? '' : filter.value;
                                                updateDynamicFilter(filter.id, { operator: newOp, value: resetValue });
                                            }}
                                            className={inputCls + ' min-w-[120px]'}
                                        >
                                            {operators.map(op => (
                                                <option key={op.value} value={op.value}>{op.label}</option>
                                            ))}
                                        </select>
                                    )}
                                    {/* Value input */}
                                    {fieldDef && !noValueNeeded && (
                                        <>
                                            {/* Select / Single Select */}
                                            {(fieldDef.fieldType === 'select' || fieldDef.fieldType === 'single_select') && (
                                                <select value={filter.value || ''} onChange={(e) => updateDynamicFilter(filter.id, { value: e.target.value })} className={inputCls + ' min-w-[140px]'}>
                                                    <option value="">Select...</option>
                                                    {sortedOptions.map(opt => (
                                                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                                                    ))}
                                                </select>
                                            )}
                                            {/* Multi Select */}
                                            {fieldDef.fieldType === 'multi_select' && (
                                                <div className="flex flex-wrap gap-1.5 items-center">
                                                    {sortedOptions.map(opt => {
                                                        const sel = Array.isArray(filter.value) && filter.value.includes(String(opt.id));
                                                        return (
                                                            <button
                                                                key={opt.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    const current = Array.isArray(filter.value) ? filter.value : [];
                                                                    const optId = String(opt.id);
                                                                    updateDynamicFilter(filter.id, { value: sel ? current.filter(v => v !== optId) : [...current, optId] });
                                                                }}
                                                                className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                                                                    sel
                                                                        ? 'bg-primary-100 border-primary-400 text-primary-700 dark:bg-primary-900/40 dark:border-primary-600 dark:text-primary-300'
                                                                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-600'
                                                                }`}
                                                            >
                                                                {opt.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {/* Text / Textarea */}
                                            {(fieldDef.fieldType === 'text' || fieldDef.fieldType === 'textarea') && (
                                                <input type="text" value={filter.value || ''} onChange={(e) => updateDynamicFilter(filter.id, { value: e.target.value })} placeholder="Value..." className={inputCls + ' min-w-[140px]'} />
                                            )}
                                            {/* Number (non-between) */}
                                            {fieldDef.fieldType === 'number' && filter.operator !== 'between' && (
                                                <input type="number" value={filter.value || ''} onChange={(e) => updateDynamicFilter(filter.id, { value: e.target.value })} placeholder="Value..." className={inputCls + ' w-28'} />
                                            )}
                                            {/* Number (between) */}
                                            {fieldDef.fieldType === 'number' && filter.operator === 'between' && (
                                                <div className="flex items-center gap-1.5">
                                                    <input type="number" value={filter.value?.min ?? ''} onChange={(e) => updateDynamicFilter(filter.id, { value: { ...(filter.value || {}), min: e.target.value } })} placeholder="Min" className={inputCls + ' w-24'} />
                                                    <span className="text-gray-400 text-xs">-</span>
                                                    <input type="number" value={filter.value?.max ?? ''} onChange={(e) => updateDynamicFilter(filter.id, { value: { ...(filter.value || {}), max: e.target.value } })} placeholder="Max" className={inputCls + ' w-24'} />
                                                </div>
                                            )}
                                            {/* Date (non-between) */}
                                            {fieldDef.fieldType === 'date' && filter.operator !== 'between' && (
                                                <input type="date" value={filter.value || ''} onChange={(e) => updateDynamicFilter(filter.id, { value: e.target.value })} className={inputCls + ' min-w-[140px]'} />
                                            )}
                                            {/* Date (between) */}
                                            {fieldDef.fieldType === 'date' && filter.operator === 'between' && (
                                                <div className="flex items-center gap-1.5">
                                                    <input type="date" value={filter.value?.from ?? ''} onChange={(e) => updateDynamicFilter(filter.id, { value: { ...(filter.value || {}), from: e.target.value } })} className={inputCls + ' w-36'} />
                                                    <span className="text-gray-400 text-xs">to</span>
                                                    <input type="date" value={filter.value?.to ?? ''} onChange={(e) => updateDynamicFilter(filter.id, { value: { ...(filter.value || {}), to: e.target.value } })} className={inputCls + ' w-36'} />
                                                </div>
                                            )}
                                        </>
                                    )}
                                    {/* Remove button */}
                                    <button type="button" onClick={() => removeDynamicFilter(filter.id)} className="p-1 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors shrink-0">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                    <button
                        type="button"
                        onClick={addDynamicFilter}
                        className="mt-2 inline-flex items-center gap-1 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                    >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Add filter
                    </button>
                </Card>
            )}

            {/* Custom Fields Panel — always mounted so column header edit/delete works via ref */}
            {/* No outer scroll cap: CustomFieldManager scrolls its own list under a
                sticky header, so a second scroll container here would nest. */}
            <div className={showCustomFields ? 'shrink-0' : 'hidden'}>
                <Card className="mb-4">
                    <CustomFieldManager
                        ref={cfManagerRef}
                        projectId={project.id}
                        initialFields={localCustomFields}
                        onFieldsChange={setLocalCustomFields}
                        builtInDateFields={[
                            { value: 'due_date', label: 'Due Date' },
                            { value: 'start_date', label: 'Start Date' },
                        ]}
                    />
                </Card>
            </div>

            {/* Automation Rules Panel */}
            {showAutomation && canManageTasks && (
                // No outer scroll cap: the builder scrolls its own rule list beneath
                // a fixed header, so a second scroll container here would nest.
                <div className="shrink-0">
                    <Card className="mb-4">
                        <AutomationRuleBuilder
                            projectId={project.id}
                            rules={automationRules || []}
                            users={users}
                            sections={localSections}
                            customFields={localCustomFields}
                            forms={forms}
                            canCreateRules={!!auth.user?.can_create_rules || !!auth.user?.permissions?.includes('manage-projects')}
                        />
                    </Card>
                </div>
            )}
            </div>

            {/* View area — each view handles its own scrolling */}
            <div className="flex-1 min-h-0 pb-6">

            {/* List View */}
            {view === 'list' && (
                <Card padding={false} className="h-full flex flex-col min-h-0">
                    {(filteredTasks.length > 0 || (!hasActiveFilters && (localSections.length > 0 || addingSectionName !== null))) ? (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCorners}
                            onDragStart={handleDragStart}
                            onDragOver={handleListDragOver}
                            onDragEnd={handleListDragEnd}
                        >
                            <div className="overflow-auto flex-1 min-h-0">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700" style={{ tableLayout: 'fixed' }}>
                                <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-30">
                                    <DndContext
                                        sensors={columnSensors}
                                        collisionDetection={closestCorners}
                                        onDragStart={(e) => setActiveColumnId(e.active.id)}
                                        onDragEnd={handleColumnDragEnd}
                                        onDragCancel={() => setActiveColumnId(null)}
                                    >
                                    <tr>
                                        <th className="sticky left-0 z-20 bg-gray-50 dark:bg-gray-800 pl-4 pr-2 py-3 w-[52px] min-w-[52px]">
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
                                            className="group/col sticky left-[52px] z-20 bg-gray-50 dark:bg-gray-800 pl-2 pr-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] relative overflow-hidden"
                                            style={columnWidths['title'] ? { width: columnWidths['title'], minWidth: 60, maxWidth: columnWidths['title'] } : { width: 300, minWidth: 60 }}
                                        >
                                            <div className="flex items-center gap-1.5 pr-5">
                                                <Tooltip content={COLUMN_DESCRIPTIONS.title}>
                                                    <span className="truncate">Title</span>
                                                </Tooltip>
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
                                                    onEditField={handleEditColumnField} onDeleteField={handleDeleteColumnField}
                                                    description={getColumnDescription(colId)}>
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
                                        /* Display order, not storage order — dnd-kit measures
                                           against this list, so a mismatch makes drops land a
                                           row out. */
                                        <SortableContext items={orderedSections.map((s) => `section-header-${s.id}`)} strategy={verticalListSortingStrategy}>
                                            {tasksBySection.map((group) => (
                                                <React.Fragment key={group.id ?? '__unsectioned'}>
                                                    {/* Section header — skip for unsectioned */}
                                                    {group.id !== null && (
                                                        <SortableSectionHeader
                                                            section={{ id: group.id, name: group.name, color: group.color, depth: group.depth }}
                                                            // Only a top-level column can take one — the
                                                            // structure stops at a single level.
                                                            onAddSubsection={group.depth === 0 ? () => {
                                                                setAddingSubsectionFor(group.id);
                                                                setAddingSubsectionName('');
                                                            } : null}
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
                                                    {/* Naming a new sub-section, inline under its column.
                                                        The id check has to be explicit: the Unsectioned
                                                        group has id null, and "not adding" is also null,
                                                        so a bare equality matched it on every load and
                                                        left the input permanently open. */}
                                                    {addingSubsectionFor !== null && addingSubsectionFor === group.id && (
                                                        <div className="pl-6 py-1.5">
                                                            <input
                                                                type="text"
                                                                autoFocus
                                                                value={addingSubsectionName}
                                                                placeholder="Sub-section name…"
                                                                onChange={(e) => setAddingSubsectionName(e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') handleCreateSection(addingSubsectionName, group.id);
                                                                    if (e.key === 'Escape') setAddingSubsectionFor(null);
                                                                }}
                                                                onBlur={() => {
                                                                    if (addingSubsectionName.trim()) handleCreateSection(addingSubsectionName, group.id);
                                                                    else setAddingSubsectionFor(null);
                                                                }}
                                                                className="w-64 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2.5 py-1.5 text-sm"
                                                            />
                                                        </div>
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
                                                                        onTaskUpdate={handleRowInlineUpdate}
                                                                        onCustomFieldUpdate={handleRowCustomFieldUpdate}
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
                                                                                        onTaskUpdate={handleSubtaskRowInlineUpdate}
                                                                                        onCustomFieldUpdate={handleRowCustomFieldUpdate}
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
                                                        <CompletedToggleRow
                                                            hiddenCount={group.hiddenCount}
                                                            closedCount={group.closedCount}
                                                            reveal={group.reveal}
                                                            recurringTitles={group.recurringTitles}
                                                            onSelect={(value) => setGroupReveal(group.id, value)}
                                                        />
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
                                            <SortableContext items={flatList.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                                                {flatList.tasks.map((task) => (
                                                    <React.Fragment key={task.id}>
                                                        <SortableRow
                                                            task={task}
                                                            project={project}
                                                            canEditTask={canEditTask(task)}
                                                            canManageTasks={canManageTasks}
                                                            canManageTaskDetails={canManageTasks}
                                                            handleDeleteTask={handleDeleteTask}
                                                            users={users}
                                                            onTaskUpdate={handleRowInlineUpdate}
                                                            onCustomFieldUpdate={handleRowCustomFieldUpdate}
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
                                                                            onTaskUpdate={handleSubtaskRowInlineUpdate}
                                                                            onCustomFieldUpdate={handleRowCustomFieldUpdate}
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
                                            <CompletedToggleRow
                                                hiddenCount={flatList.hiddenCount}
                                                closedCount={flatList.closedCount}
                                                reveal={flatList.reveal}
                                                recurringTitles={flatList.recurringTitles}
                                                onSelect={(value) => setGroupReveal('__flat', value)}
                                            />
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
                                    <div className="flex items-center justify-center gap-2">
                                        <LinkButton href={`/projects/${project.id}/tasks/create`} size="sm">
                                            + Add Task
                                        </LinkButton>
                                        <Button variant="secondary" size="sm" onClick={() => setAddingSectionName('')}>
                                            + Add Section
                                        </Button>
                                    </div>
                                )
                            }
                        />
                    )}
                </Card>
            )}

            {/* Board View */}
            {view === 'board' && (
                <div className="h-full flex flex-col min-h-0">
                    {boardGroupableFields.length > 0 && (
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs text-gray-500 dark:text-gray-400">Group by</span>
                            <select
                                value={boardGroupBy}
                                onChange={(e) => changeBoardGroupBy(e.target.value)}
                                className="text-xs rounded-md border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 py-1 pr-7"
                            >
                                <option value="status">Status</option>
                                {boardGroupableFields.map((f) => (
                                    <option key={f.id} value={String(f.id)}>{f.name}</option>
                                ))}
                            </select>
                            {boardField && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                    Dragging a card sets its {boardField.name}.
                                </span>
                            )}
                        </div>
                    )}
                    {/* closestCenter, not closestCorners: a column's droppable spans
                        the full height of the list, so by corner distance it beat the
                        card actually under the pointer and nearly every cross-column
                        drop fell through to "dropped on empty space" — which appends.
                        Comparing centres lets the card win, so where you drop decides
                        where it lands. */}
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleBoardDragEnd}
                    >
                        <div className="overflow-auto flex-1 min-h-0 pb-2">
                            <div className="inline-flex gap-4 min-w-full">
                                {boardColumns.map((col) => (
                                    <KanbanColumn
                                        key={col.id}
                                        status={col.isStatus ? col.id : undefined}
                                        columnId={col.id}
                                        label={col.label}
                                        dotClass={col.dotClass}
                                        badgeClass={col.badgeClass}
                                        tasks={col.tasks}
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
                </div>
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
                    <div className="h-full overflow-auto">
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
                                                                    // The same primary ring the rows, cards and questions
                                                                    // use, over the priority colour rather than instead of
                                                                    // it — the pill's colour is what the entry means, and
                                                                    // the old hover faded exactly that away. The ring sits
                                                                    // outside the pill, inside the 2px gap between entries.
                                                                    className={`block w-full text-left text-[11px] leading-tight px-1.5 py-0.5 rounded border truncate cursor-pointer transition-all hover:ring-1 hover:ring-primary-400/70 dark:hover:ring-primary-400/60 ${PRIORITY_PILL[task.priority] || PRIORITY_PILL.low}`}
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

                // Geometry is a pure function of dates: every x is
                // daysFromRangeStart * PX_PER_DAY. Columns are only what the
                // header and grid lines draw, so changing scale never has to
                // touch the bar, diamond or arrow maths.
                const SCALES = {
                    day:   { pxPerDay: 40,  step: 'day' },
                    week:  { pxPerDay: 8,   step: 'week' },
                    month: { pxPerDay: 3.2, step: 'month' },
                };
                const scale = SCALES[ganttScale] || SCALES.day;
                const PX_PER_DAY = scale.pxPerDay;
                const ROW_H = 44;          // fixed, so arrows can be positioned by row index
                const LABEL_W = 240;       // matches the w-60 name column
                const MS_DAY = 1000 * 60 * 60 * 24;

                const dayOf = (v) => new Date(String(v).split('T')[0] + 'T00:00:00');

                // Flatten all tasks with due dates for range calculation
                // filteredTasks, not the raw list: the Gantt has to honour the
                // same filters as every other view on this page.
                const allTasks = [];
                filteredTasks.forEach((t) => {
                    allTasks.push({ ...t, isSubtask: false });
                    (t.subtasks || []).forEach((st) => allTasks.push({ ...st, isSubtask: true, parentId: t.id }));
                });

                const tasksWithDate = allTasks.filter((t) => t.due_date || t.start_date);
                const tasksNoDate = allTasks.filter((t) => !t.due_date && !t.start_date);

                // Calculate date range
                let rangeStart, rangeEnd;
                if (tasksWithDate.length > 0) {
                    const dates = tasksWithDate.flatMap((t) => [t.start_date, t.due_date].filter(Boolean).map((d) => dayOf(d).getTime()));
                    const minDate = new Date(Math.min(...dates));
                    const maxDate = new Date(Math.max(...dates));
                    rangeStart = new Date(minDate);
                    rangeStart.setDate(rangeStart.getDate() - 3);
                    rangeEnd = new Date(maxDate);
                    rangeEnd.setDate(rangeEnd.getDate() + 3);
                    const diffDays = Math.ceil((rangeEnd - rangeStart) / MS_DAY);
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
                rangeStart.setHours(0, 0, 0, 0);

                // Whole weeks at week scale, whole months at month scale, so the
                // first column is not a stub.
                if (scale.step === 'week') {
                    rangeStart.setDate(rangeStart.getDate() - rangeStart.getDay());
                } else if (scale.step === 'month') {
                    rangeStart.setDate(1);
                }

                const totalDays = Math.max(Math.ceil((rangeEnd - rangeStart) / MS_DAY) + 1, 1);
                const totalWidth = totalDays * PX_PER_DAY;

                const xFor = (dateStr) => ((dayOf(dateStr) - rangeStart) / MS_DAY) * PX_PER_DAY;

                // Columns for the grid and the lower header row.
                const columns = [];
                {
                    const cur = new Date(rangeStart);
                    while (cur <= rangeEnd) {
                        const start = new Date(cur);
                        let span;                     // in days
                        if (scale.step === 'day') {
                            span = 1;
                            cur.setDate(cur.getDate() + 1);
                        } else if (scale.step === 'week') {
                            span = 7;
                            cur.setDate(cur.getDate() + 7);
                        } else {
                            span = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
                            cur.setMonth(cur.getMonth() + 1);
                        }
                        columns.push({ start, span, width: span * PX_PER_DAY });
                    }
                }

                // Upper header row: months when zoomed into days or weeks, years
                // when zoomed out to months.
                const groups = [];
                columns.forEach((col) => {
                    const key = scale.step === 'month'
                        ? `${col.start.getFullYear()}`
                        : `${col.start.getFullYear()}-${col.start.getMonth()}`;
                    const label = scale.step === 'month'
                        ? String(col.start.getFullYear())
                        : col.start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                    const last = groups[groups.length - 1];
                    if (last && last.key === key) {
                        last.width += col.width;
                    } else {
                        groups.push({ key, label, width: col.width });
                    }
                });

                const colLabel = (col) => {
                    if (scale.step === 'day') return String(col.start.getDate());
                    if (scale.step === 'week') return col.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    return col.start.toLocaleDateString('en-US', { month: 'short' });
                };

                // Date custom fields chosen for display. Each gets a colour of its
                // own so the legend can name it — these are not statuses or
                // priorities, so they borrow nothing from those palettes.
                const DATE_MARKS = [
                    { dot: 'bg-sky-500',     text: 'text-sky-600 dark:text-sky-400' },
                    { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
                    { dot: 'bg-fuchsia-500', text: 'text-fuchsia-600 dark:text-fuchsia-400' },
                    { dot: 'bg-orange-500',  text: 'text-orange-600 dark:text-orange-400' },
                ];
                const dateFieldDefs = (localCustomFields || []).filter((f) => f.type === 'date');
                const shownDateFields = dateFieldDefs
                    .filter((f) => ganttDateFields.includes(f.id))
                    .map((f, i) => ({ ...f, ...DATE_MARKS[i % DATE_MARKS.length] }));

                // Two fields joined read as a span: "it actually ran from here to
                // here". The pair is taken in the order the fields are defined on
                // the project, so the earlier one is the start — rather than the
                // order someone happened to click them on.
                const dateRange = (ganttLinkDates && shownDateFields.length === 2)
                    ? { from: shownDateFields[0], to: shownDateFields[1] }
                    : null;

                /** The value a task holds for one of those fields, if any. */
                const dateValueOf = (task, fieldId) => (task.custom_field_values || [])
                    .find((v) => v.custom_field_id === fieldId)?.value_date || null;

                const todayX = xFor(new Date().toISOString());
                const showToday = todayX >= 0 && todayX <= totalWidth;

                // Row index by task id — the arrows need to know which row each
                // end of an edge sits on.
                const rowIndex = new Map();
                tasksWithDate.forEach((t, i) => rowIndex.set(t.id, i));

                // Which tasks are actually held up *now*.
                //
                // Every task in a chain is technically blocked — in A→B→C→D with A
                // open, C waits on B and D waits on C — so badging all of them
                // marked nine rows out of nine and told nobody anything. A badge
                // is worth reading only where clearing one specific open task
                // would release this one: that is the frontier of the work.
                //
                // So a dependency counts as an *immediate* blocker when it is
                // open and is not itself waiting on something open.
                const byId = new Map(allTasks.map((t) => [t.id, t]));
                const isOpen = (t) => !!t && t.status !== 'done' && t.status !== 'cancelled';
                const openDepsOf = (t) => (t?.dependencies || []).filter(isOpen);
                const immediateBlockers = (t) => openDepsOf(t).filter((d) => {
                    const dep = byId.get(d.id);
                    // A blocker that is not on this chart cannot be shown to be
                    // waiting on anything, so treat it as immediate rather than
                    // silently dropping the warning.
                    return !dep || openDepsOf(dep).length === 0;
                });

                // One edge per dependency whose other end is also on the chart.
                const edges = [];
                tasksWithDate.forEach((t) => {
                    (t.dependencies || []).forEach((dep) => {
                        if (!rowIndex.has(dep.id)) return;   // off-chart: nothing to draw to
                        const from = tasksWithDate[rowIndex.get(dep.id)];
                        const fromDate = from.due_date || from.start_date;
                        const toDate = t.start_date || t.due_date;
                        if (!fromDate || !toDate) return;
                        edges.push({
                            key: `${dep.id}-${t.id}`,
                            x1: xFor(fromDate) + (from.is_milestone ? 0 : PX_PER_DAY),
                            y1: rowIndex.get(dep.id) * ROW_H + ROW_H / 2,
                            x2: xFor(toDate),
                            y2: rowIndex.get(t.id) * ROW_H + ROW_H / 2,
                        });
                    });
                });

                return (
                    <div className="h-full flex flex-col min-h-0">
                        {tasksWithDate.length === 0 && tasksNoDate.length === 0 ? (
                            <EmptyState
                                title="No tasks to display"
                                description="Add tasks with due dates to see them on the Gantt chart."
                            />
                        ) : (
                            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex-1 min-h-0 flex flex-col">
                                {/* Zoom */}
                                <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                                    <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 flex-wrap">
                                        <span className="inline-flex items-center gap-1.5">
                                            <span className="inline-block w-4 h-2 rounded-sm bg-blue-500" /> Task
                                        </span>
                                        <span className="inline-flex items-center gap-1.5">
                                            <span className="inline-block w-2.5 h-2.5 bg-purple-600 rotate-45" /> Milestone
                                        </span>
                                        {/* One legend entry per date field on show, so a pin on the
                                            chart can be told from every other pin. */}
                                        {dateRange ? (
                                            <span className={`inline-flex items-center gap-1.5 ${dateRange.from.text}`}>
                                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${dateRange.from.dot}`} />
                                                <span className={`inline-block w-4 h-0.5 ${dateRange.from.dot}`} />
                                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${dateRange.to.dot}`} />
                                                {dateRange.from.name} → {dateRange.to.name}
                                            </span>
                                        ) : shownDateFields.map((f) => (
                                            <span key={f.id} className={`inline-flex items-center gap-1.5 ${f.text}`}>
                                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${f.dot}`} />
                                                {f.name}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {dateFieldDefs.length > 0 && (
                                            <div className="flex items-center gap-1 mr-3">
                                                <span className="text-[11px] text-gray-500 dark:text-gray-400 mr-1">Dates</span>
                                                {shownDateFields.length === 2 && (
                                                    <button
                                                        onClick={toggleGanttLinkDates}
                                                        aria-pressed={ganttLinkDates}
                                                        title={ganttLinkDates ? 'Show the two dates separately' : 'Join the two dates into a range'}
                                                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-colors mr-1 ${
                                                            ganttLinkDates
                                                                ? 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-800'
                                                                : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                                                        }`}
                                                    >
                                                        <span className="inline-flex items-center gap-0.5">
                                                            <span className="inline-block w-1 h-1 rounded-full bg-current" />
                                                            <span className="inline-block w-2.5 h-px bg-current" />
                                                            <span className="inline-block w-1 h-1 rounded-full bg-current" />
                                                        </span>
                                                        Range
                                                    </button>
                                                )}
                                                {dateFieldDefs.map((f) => {
                                                    const on = ganttDateFields.includes(f.id);
                                                    const mark = DATE_MARKS[shownDateFields.findIndex((x) => x.id === f.id) % DATE_MARKS.length];
                                                    return (
                                                        <button
                                                            key={f.id}
                                                            onClick={() => toggleGanttDateField(f.id)}
                                                            aria-pressed={on}
                                                            title={on ? `Hide ${f.name}` : `Show ${f.name} on the chart`}
                                                            className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border transition-colors ${
                                                                on
                                                                    ? 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-800'
                                                                    : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                                                            }`}
                                                        >
                                                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${on && mark ? mark.dot : 'bg-gray-300 dark:bg-gray-600'}`} />
                                                            {f.name}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        <span className="text-[11px] text-gray-500 dark:text-gray-400 mr-1">Zoom</span>
                                        {[['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([val, label]) => (
                                            <button
                                                key={val}
                                                onClick={() => changeGanttScale(val)}
                                                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                                                    ganttScale === val
                                                        ? 'border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300'
                                                        : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                                }`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="overflow-auto flex-1 min-h-0">
                                    <div style={{ minWidth: `${LABEL_W + totalWidth}px` }}>
                                        {/* Header: month (or year) row */}
                                        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                                            <div className="w-60 shrink-0 px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-r border-gray-200 dark:border-gray-700">Task</div>
                                            <div className="flex">
                                                {groups.map((g) => (
                                                    <div key={g.key} style={{ width: `${g.width}px` }} className="text-center text-[10px] font-semibold text-gray-500 dark:text-gray-400 py-1 border-r border-gray-200 dark:border-gray-700">{g.label}</div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Header: unit row */}
                                        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                                            <div className="w-60 shrink-0 border-r border-gray-200 dark:border-gray-700" />
                                            <div className="flex">
                                                {columns.map((col, i) => {
                                                    const isWeekend = scale.step === 'day' && (col.start.getDay() === 0 || col.start.getDay() === 6);
                                                    return (
                                                        <div
                                                            key={i}
                                                            style={{ width: `${col.width}px` }}
                                                            className={`text-center text-[10px] py-1 border-r border-gray-100 dark:border-gray-700/50 overflow-hidden whitespace-nowrap ${isWeekend ? 'bg-gray-100 dark:bg-gray-800 text-gray-400' : 'text-gray-500 dark:text-gray-400'}`}
                                                        >
                                                            {colLabel(col)}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Rows + dependency arrows share one positioned container, so
                                            the overlay scrolls with the bars instead of drifting. */}
                                        <div className="relative">
                                            {edges.length > 0 && (
                                                <svg
                                                    className="absolute pointer-events-none z-10"
                                                    style={{ left: `${LABEL_W}px`, top: 0, width: `${totalWidth}px`, height: `${tasksWithDate.length * ROW_H}px` }}
                                                >
                                                    <defs>
                                                        <marker id="gantt-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                                                            <path d="M0,0 L6,3 L0,6 z" className="fill-gray-400 dark:fill-gray-500" />
                                                        </marker>
                                                    </defs>
                                                    {edges.map((e) => {
                                                        // Elbow: out of the predecessor, across, then into the
                                                        // left edge of the dependent task.
                                                        const midX = Math.max(e.x1 + 10, e.x2 - 12);
                                                        return (
                                                            <path
                                                                key={e.key}
                                                                d={`M ${e.x1} ${e.y1} H ${midX} V ${e.y2} H ${e.x2 - 4}`}
                                                                fill="none"
                                                                strokeWidth="1.5"
                                                                className="stroke-gray-400 dark:stroke-gray-500"
                                                                markerEnd="url(#gantt-arrow)"
                                                            />
                                                        );
                                                    })}
                                                </svg>
                                            )}

                                            {tasksWithDate.map((task) => {
                                                const isMilestone = !!task.is_milestone;
                                                const startStr = task.start_date || task.due_date;
                                                const endStr = task.due_date || task.start_date;
                                                const left = xFor(isMilestone ? endStr : startStr);
                                                const spanDays = Math.max(((dayOf(endStr) - dayOf(startStr)) / MS_DAY) + 1, 1);
                                                // Below about 6px a bar stops reading as a bar; at month
                                                // scale a one-day task would otherwise be 3px of nothing.
                                                const barWidth = Math.max(spanDays * PX_PER_DAY, 6);
                                                const barColor = PRIORITY_BAR[task.priority] || PRIORITY_BAR.low;
                                                const opacityCls = STATUS_OPACITY[task.status] || '';
                                                const blockers = immediateBlockers(task);
                                                const tooltipDate = task.start_date && task.due_date && !isMilestone
                                                    ? `${formatDate(task.start_date)} → ${formatDate(task.due_date)}`
                                                    : formatDate(endStr);
                                                return (
                                                    <div key={task.id} className="flex border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/30" style={{ height: `${ROW_H}px` }}>
                                                        <div className={`w-60 shrink-0 px-3 py-2 border-r border-gray-200 dark:border-gray-700 ${task.isSubtask ? 'pl-7' : ''}`}>
                                                            <Tooltip content={task.title}>
                                                                <button
                                                                    onClick={() => setDetailTaskId(task.id)}
                                                                    className="text-sm truncate block max-w-full text-left hover:text-blue-600 dark:hover:text-blue-400 text-gray-700 dark:text-gray-200"
                                                                >
                                                                    {isMilestone && <span className="inline-block w-2 h-2 mr-1.5 bg-purple-600 rotate-45 align-middle" />}
                                                                    {task.title}
                                                                </button>
                                                            </Tooltip>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                {blockers.length > 0 && (
                                                                    <Tooltip content={`Waiting on: ${blockers.map((d) => d.title).join(', ')}`}>
                                                                        <span className="text-[10px] text-amber-600 dark:text-amber-400">Blocked</span>
                                                                    </Tooltip>
                                                                )}
                                                                {task.assignee && <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{task.assignee.name}</span>}
                                                            </div>
                                                        </div>
                                                        <div className="relative" style={{ width: `${totalWidth}px` }}>
                                                            {/* Grid lines */}
                                                            <div className="absolute inset-0 flex">
                                                                {columns.map((col, i) => {
                                                                    const isWeekend = scale.step === 'day' && (col.start.getDay() === 0 || col.start.getDay() === 6);
                                                                    return <div key={i} style={{ width: `${col.width}px` }} className={`border-r border-gray-100 dark:border-gray-700/30 ${isWeekend ? 'bg-gray-50 dark:bg-gray-800/40' : ''}`} />;
                                                                })}
                                                            </div>
                                                            {showToday && (
                                                                <div className="absolute top-0 bottom-0 border-l border-red-400/70 dark:border-red-500/60" style={{ left: `${todayX}px` }} />
                                                            )}

                                                            {/* Date custom fields, drawn as pins so they read as
                                                                points in time rather than another span of work.
                                                                Never on a milestone: that is already a single moment,
                                                                so an actual start and end against it says nothing, and
                                                                the pins only crowd the diamond that carries the date. */}
                                                            {/* Two linked fields become a span under the planned
                                                                bar, so the difference between plan and actual is a
                                                                length rather than two dots to measure by eye. */}
                                                            {!isMilestone && dateRange && (() => {
                                                                const a = dateValueOf(task, dateRange.from.id);
                                                                const z = dateValueOf(task, dateRange.to.id);
                                                                if (!a && !z) return null;

                                                                // One end missing is the ordinary in-flight case:
                                                                // started but not finished. Run it to today so the
                                                                // bar shows elapsed time, and leave the end open.
                                                                const open = !a || !z;
                                                                const x1 = xFor(a || z);
                                                                const x2 = z ? xFor(z) : todayX;
                                                                const left = Math.min(x1, x2);
                                                                const width = Math.max(Math.abs(x2 - x1), 3);

                                                                return (
                                                                    <Tooltip content={`${dateRange.from.name} → ${dateRange.to.name}: ${a ? formatDate(a) : '—'} → ${z ? formatDate(z) : 'in progress'}`}>
                                                                        <div
                                                                            className="absolute z-30 flex items-center"
                                                                            style={{ left: `${left}px`, width: `${width}px`, top: `${ROW_H / 2 + 11}px` }}
                                                                        >
                                                                            <span className={`block h-1.5 w-1.5 rounded-full ring-1 ring-white dark:ring-gray-900 shrink-0 ${dateRange.from.dot}`} />
                                                                            <span className={`block h-0.5 flex-1 ${dateRange.from.dot} ${open ? 'opacity-50' : ''}`} />
                                                                            {!open && <span className={`block h-1.5 w-1.5 rounded-full ring-1 ring-white dark:ring-gray-900 shrink-0 ${dateRange.to.dot}`} />}
                                                                        </div>
                                                                    </Tooltip>
                                                                );
                                                            })()}

                                                            {!isMilestone && !dateRange && shownDateFields.map((f) => {
                                                                const val = dateValueOf(task, f.id);
                                                                if (!val) return null;
                                                                const x = xFor(val);
                                                                if (x < -8 || x > totalWidth + 8) return null;
                                                                return (
                                                                    <Tooltip key={f.id} content={`${f.name}: ${formatDate(val)}`}>
                                                                        {/* Below the bar, not across it: the bar starts at
                                                                            ROW_H/2 - 10 and is 20px tall, so a pin at the row's
                                                                            centre sat inside it — a blue pin on a blue bar. The
                                                                            tick points back up at the bar it marks. */}
                                                                        <div
                                                                            className="absolute z-30 flex flex-col items-center pointer-events-auto"
                                                                            style={{ left: `${x - 2.5}px`, top: `${ROW_H / 2 + 10}px` }}
                                                                        >
                                                                            <span className={`block w-px h-1.5 ${f.dot}`} />
                                                                            <span className={`block h-1.5 w-1.5 rounded-full ring-1 ring-white dark:ring-gray-900 ${f.dot}`} />
                                                                        </div>
                                                                    </Tooltip>
                                                                );
                                                            })}

                                                            {isMilestone ? (
                                                                <Tooltip content={`${task.title} — ${tooltipDate} — milestone`}>
                                                                    <Link
                                                                        href={`/projects/${project.id}/tasks/${task.id}/edit`}
                                                                        className={`absolute z-20 ${opacityCls}`}
                                                                        style={{ left: `${left - 6}px`, top: `${ROW_H / 2 - 6}px` }}
                                                                    >
                                                                        <span className="block w-3 h-3 bg-purple-600 rotate-45 hover:scale-110 transition-transform" />
                                                                    </Link>
                                                                </Tooltip>
                                                            ) : (
                                                                <Tooltip content={`${task.title} — ${tooltipDate} — ${formatLabel(task.status)}`}>
                                                                    <Link
                                                                        href={`/projects/${project.id}/tasks/${task.id}/edit`}
                                                                        className={`absolute h-5 rounded ${barColor} ${opacityCls} hover:brightness-110 transition-all z-20`}
                                                                        style={{ left: `${left}px`, width: `${barWidth}px`, top: `${ROW_H / 2 - 10}px` }}
                                                                    />
                                                                </Tooltip>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
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

                // Every drill-down target gets the same affordance: a pointer,
                // a hover lift, and a focus ring for keyboard users.
                const drillable = 'text-left w-full cursor-pointer transition-colors hover:border-primary-400 dark:hover:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40';

                return (
                    <div className="h-full overflow-auto space-y-6">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Total Tasks */}
                            <button
                                type="button"
                                onClick={() => drillDown([])}
                                title="Show every task in the list"
                                className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 ${drillable}`}
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Tasks</span>
                                    <span className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                    <div className="bg-green-500 h-2 rounded-full transition-all duration-500" style={{ width: `${stats.completionRate}%` }} />
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">{stats.completionRate}% complete</p>
                            </button>

                            {/* Completed */}
                            <button
                                type="button"
                                onClick={() => drillDown([{ fieldId: 'status', value: 'done' }])}
                                title="Show completed tasks"
                                className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 ${drillable}`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Completed</span>
                                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/40">
                                        <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                    </span>
                                </div>
                                <span className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.byStatus.done}</span>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">of {stats.total - stats.byStatus.cancelled} actionable</p>
                            </button>

                            {/* In Progress — the count is every active (pending)
                                task, so the drill-down must be the same set, not
                                just the in_progress status, or clicking a card
                                that reads 14 lands on an empty list. */}
                            <button
                                type="button"
                                onClick={() => drillDown(activeOnly)}
                                title="Show active (not done or cancelled) tasks"
                                className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 ${drillable}`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">In Progress</span>
                                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-yellow-100 dark:bg-yellow-900/40">
                                        <svg className="w-4 h-4 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    </span>
                                </div>
                                <span className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.activeTasks}</span>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{stats.byStatus.backlog} backlog, {stats.byStatus.to_do} to do, {stats.byStatus.in_progress} active, {stats.byStatus.in_review} in review</p>
                            </button>

                            {/* Overdue */}
                            <button
                                type="button"
                                onClick={() => drillDown(overdueFilters())}
                                title="Show overdue tasks"
                                className={`bg-white dark:bg-gray-800 rounded-xl border p-5 ${drillable} ${stats.overdue.length > 0 ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700'}`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Overdue</span>
                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${stats.overdue.length > 0 ? 'bg-red-100 dark:bg-red-900/40' : 'bg-gray-100 dark:bg-gray-700'}`}>
                                        <svg className={`w-4 h-4 ${stats.overdue.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </span>
                                </div>
                                <span className={`text-2xl font-bold ${stats.overdue.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>{stats.overdue.length}</span>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">past due date</p>
                            </button>
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
                                                <button
                                                    key={s}
                                                    type="button"
                                                    onClick={() => drillDown([{ fieldId: 'status', value: s }])}
                                                    disabled={stats.byStatus[s] === 0}
                                                    title={`Show ${formatLabel(s).toLowerCase()} tasks`}
                                                    className="w-full flex items-center justify-between rounded px-1 -mx-1 py-0.5 text-left enabled:hover:bg-gray-50 dark:enabled:hover:bg-gray-700/50 disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[s].bar}`} />
                                                        <span className="text-sm text-gray-600 dark:text-gray-300">{formatLabel(s)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium text-gray-900 dark:text-white">{stats.byStatus[s]}</span>
                                                        <span className="text-xs text-gray-400 w-10 text-right">{stats.total > 0 ? Math.round((stats.byStatus[s] / stats.total) * 100) : 0}%</span>
                                                    </div>
                                                </button>
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
                                                <button
                                                    key={p}
                                                    type="button"
                                                    // The panel counts active tasks only, so the
                                                    // drill-down excludes the closed ones too —
                                                    // otherwise the list would not match the bar.
                                                    onClick={() => drillDown([
                                                        { fieldId: 'priority', value: p },
                                                        { fieldId: 'status', operator: 'is_not', value: 'done' },
                                                        { fieldId: 'status', operator: 'is_not', value: 'cancelled' },
                                                    ])}
                                                    disabled={count === 0}
                                                    title={`Show active ${formatLabel(p).toLowerCase()} priority tasks`}
                                                    className="w-full text-left rounded px-1 -mx-1 py-0.5 enabled:hover:bg-gray-50 dark:enabled:hover:bg-gray-700/50 disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                                                >
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className={`text-sm font-medium ${PRIORITY_COLORS[p].text}`}>{formatLabel(p)}</span>
                                                        <span className="text-sm text-gray-600 dark:text-gray-300">{count}</span>
                                                    </div>
                                                    <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                                                        <div className={`${PRIORITY_COLORS[p].bar} h-2 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                                                    </div>
                                                </button>
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
                                {/* Every tile here counts active tasks only, so each
                                    drill-down carries the same two exclusions — the
                                    list has to add up to the number on the tile. */}
                                {[
                                    {
                                        key: 'overdue',
                                        label: 'Overdue',
                                        count: stats.overdue.length,
                                        filters: overdueFilters(),
                                        tone: 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800',
                                        text: 'text-red-600 dark:text-red-400',
                                    },
                                    {
                                        key: 'today',
                                        label: 'Due Today',
                                        count: stats.dueToday.length,
                                        filters: [
                                            { fieldId: 'due_date', operator: 'is', value: isoDate(0) },
                                            ...activeOnly,
                                        ],
                                        tone: 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800',
                                        text: 'text-amber-600 dark:text-amber-400',
                                    },
                                    {
                                        key: 'week',
                                        label: 'Due This Week',
                                        count: stats.dueThisWeek.length,
                                        filters: [
                                            { fieldId: 'due_date', operator: 'between', value: { from: isoDate(0), to: isoEndOfWeek() } },
                                            ...activeOnly,
                                        ],
                                        tone: 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800',
                                        text: 'text-blue-600 dark:text-blue-400',
                                    },
                                    {
                                        key: 'none',
                                        label: 'No Due Date',
                                        count: stats.noDueDate.length,
                                        filters: [
                                            { fieldId: 'due_date', operator: 'is_empty', value: '' },
                                            ...activeOnly,
                                        ],
                                        tone: '',
                                        text: 'text-gray-500 dark:text-gray-400',
                                    },
                                ].map((tile) => (
                                    <button
                                        key={tile.key}
                                        type="button"
                                        onClick={() => drillDown(tile.filters)}
                                        disabled={tile.count === 0}
                                        title={`Show active tasks — ${tile.label.toLowerCase()}`}
                                        className={`rounded-lg p-4 text-left transition-shadow enabled:hover:ring-2 enabled:hover:ring-primary-400/40 disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                                            tile.count > 0 && tile.tone ? tile.tone : 'bg-gray-50 dark:bg-gray-700/50'
                                        }`}
                                    >
                                        <p className={`text-2xl font-bold ${tile.count > 0 ? tile.text : 'text-gray-400 dark:text-gray-500'}`}>
                                            {tile.count}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{tile.label}</p>
                                    </button>
                                ))}
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
                                                <th className="text-center py-2 px-3 font-medium text-gray-500 dark:text-gray-400">
                                                    <Tooltip content="Finished, but after the due date — a subset of Done">
                                                        <span className="cursor-help border-b border-dotted border-gray-400">Done Late</span>
                                                    </Tooltip>
                                                </th>
                                                <th className="text-center py-2 px-3 font-medium text-gray-500 dark:text-gray-400">
                                                    <Tooltip content="Still open and past the due date">
                                                        <span className="cursor-help border-b border-dotted border-gray-400">Overdue</span>
                                                    </Tooltip>
                                                </th>
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
                                                        {/* Each number opens the tasks behind it, for
                                                            this person, on the same terms the column
                                                            was counted. */}
                                                        {[
                                                            { value: a.total, filters: [], className: 'text-gray-900 dark:text-white font-medium', what: 'all tasks' },
                                                            { value: a.active, filters: activeOnly, className: 'text-blue-600 dark:text-blue-400', what: 'active tasks' },
                                                            { value: a.done, filters: [{ fieldId: 'status', value: 'done' }], className: 'text-green-600 dark:text-green-400', what: 'completed tasks' },
                                                            {
                                                                value: a.doneLate,
                                                                filters: [
                                                                    { fieldId: 'status', value: 'done' },
                                                                    { fieldId: 'completed_late', value: 'yes' },
                                                                ],
                                                                className: a.doneLate > 0 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-gray-400 dark:text-gray-500',
                                                                what: 'tasks finished late',
                                                            },
                                                            {
                                                                value: a.overdue,
                                                                filters: overdueFilters(),
                                                                className: a.overdue > 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-400 dark:text-gray-500',
                                                                what: 'overdue tasks',
                                                            },
                                                        ].map((cell, i) => (
                                                            <td key={i} className="text-center py-2.5 px-3">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => drillDown([
                                                                        // The workload table keys unassigned rows
                                                                        // as 'unassigned'; the filter expresses the
                                                                        // same thing as an empty assignee.
                                                                        a.id === 'unassigned'
                                                                            ? { fieldId: 'assignee', operator: 'is_empty', value: '' }
                                                                            : { fieldId: 'assignee', value: String(a.id) },
                                                                        ...cell.filters,
                                                                    ])}
                                                                    disabled={cell.value === 0}
                                                                    title={`Show ${cell.what} for ${a.user?.name || 'unassigned'}`}
                                                                    className={`rounded px-1.5 py-0.5 enabled:hover:bg-gray-100 dark:enabled:hover:bg-gray-700 disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${cell.className}`}
                                                                >
                                                                    {cell.value}
                                                                </button>
                                                            </td>
                                                        ))}
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

                        {/* Custom Charts */}
                        <ProjectCharts
                            projectId={project.id}
                            charts={charts}
                            tasks={localTasks}
                            sections={localSections}
                            customFields={localCustomFields}
                            // Formula fields are computed here, not stored on the
                            // value rows, so a chart measuring one reads zero
                            // without them.
                            formulaResults={formulaResults}
                            canManage={canManageCharts}
                            // Lets a custom card drill into its tasks, the same
                            // way the summary cards above do.
                            onDrillDown={drillDown}
                        />
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
                        <Tooltip content="Status"><button onClick={() => setBulkDropdown(bulkDropdown === 'status' ? null : 'status')} className="p-1.5 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </button></Tooltip>
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
                        <Tooltip content="Priority"><button onClick={() => setBulkDropdown(bulkDropdown === 'priority' ? null : 'priority')} className="p-1.5 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z" /></svg>
                            </button></Tooltip>
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
                        <Tooltip content="Assign"><button onClick={() => { setBulkDropdown(bulkDropdown === 'assign' ? null : 'assign'); setBulkAssignSearch(''); }} className="p-1.5 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                            </button></Tooltip>
                        {bulkDropdown === 'assign' && (
                            <div className="absolute bottom-full mb-2 left-0 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 min-w-[220px]">
                                <div className="p-2 border-b border-gray-200 dark:border-gray-600">
                                    <input
                                        type="text"
                                        autoFocus
                                        placeholder="Search users..."
                                        value={bulkAssignSearch}
                                        onChange={(e) => setBulkAssignSearch(e.target.value)}
                                        className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    />
                                </div>
                                <div className="py-1 max-h-48 overflow-y-auto">
                                    <button onClick={() => handleBulkAction('assign', null)} className="w-full text-left px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2.5 italic">
                                        <div className="h-6 w-6 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                                            <svg className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                        </div>
                                        Unassign
                                    </button>
                                    {users
                                        .filter((u) => u.name.toLowerCase().includes(bulkAssignSearch.toLowerCase()))
                                        .map((u) => (
                                        <button key={u.id} onClick={() => handleBulkAction('assign', u.id)} className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2.5">
                                            <Avatar name={u.name} size="xs" />
                                            {u.name}
                                        </button>
                                    ))}
                                    {users.filter((u) => u.name.toLowerCase().includes(bulkAssignSearch.toLowerCase())).length === 0 && (
                                        <div className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500 text-center">No users found</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Due Date picker */}
                    <div className="relative">
                        <Tooltip content="Due Date"><button onClick={() => setBulkDropdown(bulkDropdown === 'due_date' ? null : 'due_date')} className="p-1.5 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            </button></Tooltip>
                        {bulkDropdown === 'due_date' && (
                            <div className="absolute bottom-full mb-2 left-0 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 p-3">
                                <CalendarGrid selectedDate={null} onSelect={(date) => handleBulkAction('update_due_date', date)} />
                                <button onClick={() => handleBulkAction('update_due_date', null)} className="mt-2 w-full text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors text-center">
                                    Clear due date
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Start Date picker */}
                    <div className="relative">
                        <Tooltip content="Start Date"><button onClick={() => setBulkDropdown(bulkDropdown === 'start_date' ? null : 'start_date')} className="p-1.5 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </button></Tooltip>
                        {bulkDropdown === 'start_date' && (
                            <div className="absolute bottom-full mb-2 left-0 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 p-3">
                                <CalendarGrid selectedDate={null} onSelect={(date) => handleBulkAction('update_start_date', date)} />
                                <button onClick={() => handleBulkAction('update_start_date', null)} className="mt-2 w-full text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors text-center">
                                    Clear start date
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Custom field editor */}
                    {localCustomFields.some((cf) => !isDerivedField(cf.type)) && (
                        <div className="relative">
                            <Tooltip content="Custom Field"><button onClick={() => { setBulkDropdown(bulkDropdown === 'custom_field' ? null : 'custom_field'); setBulkCustomField(null); }} className="p-1.5 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors">
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" /></svg>
                                </button></Tooltip>
                            {bulkDropdown === 'custom_field' && (
                                <div className="absolute bottom-full mb-2 left-0 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 min-w-[200px]">
                                    {!bulkCustomField ? (
                                        <div className="py-1 max-h-60 overflow-y-auto">
                                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Set custom field</div>
                                            {localCustomFields.filter((cf) => !isDerivedField(cf.type)).map((cf) => (
                                                <button key={cf.id} onClick={() => setBulkCustomField(cf)} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between gap-3">
                                                    <span className="truncate">{cf.name}</span>
                                                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{formatLabel(cf.type)}</span>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div>
                                            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-600">
                                                <button onClick={() => setBulkCustomField(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                                                </button>
                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{bulkCustomField.name}</span>
                                            </div>
                                            <BulkCustomFieldEditor
                                                key={bulkCustomField.id}
                                                field={bulkCustomField}
                                                onApply={(val) => handleBulkAction('update_custom_field', { field_id: bulkCustomField.id, value: val })}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="w-px h-5 bg-gray-600" />

                    {/* Delete */}
                    <Tooltip content="Delete"><button onClick={() => handleBulkAction('delete')} className="p-1.5 rounded-lg text-red-400 hover:bg-red-900/30 transition-colors">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button></Tooltip>

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

            <ShareProjectModal
                isOpen={showShareModal}
                onClose={() => setShowShareModal(false)}
                project={project}
                users={users}
                canManage={canManageProject}
            />

            {celebration && (
                <CelebrationEffect
                    x={celebration.x}
                    y={celebration.y}
                    onComplete={() => setCelebration(null)}
                />
            )}

            {/* Blocked status change (project attachment rule) */}
            {blockedMessage && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-md">
                    <div className="flex items-start gap-3 rounded-lg bg-red-600 text-white px-4 py-3 shadow-lg">
                        <svg className="h-5 w-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                        <p className="text-sm flex-1">{blockedMessage}</p>
                        <button
                            type="button"
                            onClick={() => setBlockedMessage(null)}
                            aria-label="Dismiss"
                            className="shrink-0 opacity-80 hover:opacity-100"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
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
