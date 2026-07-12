import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, usePage, router } from '@inertiajs/react';
import StatusBadge from './StatusBadge';
import PriorityBadge from './PriorityBadge';
import Avatar from './Avatar';
import RichTextEditor from './RichTextEditor';
import Tooltip from './Tooltip';
import SearchableSelect from './SearchableSelect';
import { formatLabel, formatDate, apiFetch, taskEditUrl, timeAgo } from '../utils';
import { computeAllFormulas, formatFormulaResult } from '../formulaEngine';

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function isHtml(str) {
    return /<[a-z][\s\S]*>/i.test(str);
}

function fieldLabel(field) {
    const labels = {
        title: 'title', description: 'description', status: 'status',
        priority: 'priority', assigned_to: 'assignee', due_date: 'due date', start_date: 'start date',
    };
    return labels[field] || field;
}

function CollaboratorEditor({ collaborators, users, assigneeId, onUpdate }) {
    const [search, setSearch] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen]);

    const collabIds = new Set(collaborators.map((c) => c.id));
    const available = users.filter((u) => {
        if (collabIds.has(u.id)) return false;
        if (u.id === assigneeId) return false;
        if (!search) return true;
        return u.name.toLowerCase().includes(search.toLowerCase());
    });

    const handleAdd = (userId) => {
        const newIds = [...collaborators.map((c) => c.id), userId];
        onUpdate(newIds);
        setSearch('');
        setIsOpen(false);
    };

    const handleRemove = (userId) => {
        const newIds = collaborators.filter((c) => c.id !== userId).map((c) => c.id);
        onUpdate(newIds);
    };

    return (
        <div className="px-6 pb-4" ref={containerRef}>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Collaborators</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
                {collaborators.map((c) => (
                    <div key={c.id} className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 group">
                        <Avatar name={c.name} size="sm" />
                        <span className="text-xs text-gray-700 dark:text-gray-300">{c.name}</span>
                        <button
                            type="button"
                            onClick={() => handleRemove(c.id)}
                            className="ml-0.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                ))}
            </div>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen(true)}
                    className={`flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors ${isOpen ? 'hidden' : ''}`}
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Add collaborator
                </button>
                {isOpen && (
                    <div>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search people..."
                            autoFocus
                            className="w-full text-sm rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 py-1.5 px-2.5 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                        />
                        {available.length > 0 && (
                            <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-36 overflow-y-auto">
                                {available.slice(0, 8).map((user) => (
                                    <button
                                        key={user.id}
                                        type="button"
                                        onClick={() => handleAdd(user.id)}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <Avatar name={user.name} size="sm" />
                                        <span className="text-gray-900 dark:text-gray-100 truncate">{user.name}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        {search && available.length === 0 && (
                            <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-3 py-2 text-xs text-gray-500">
                                No users found.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function TaskDetailPanel({ projectId, taskId, onClose, onTaskUpdate, onSubtaskCreated, users = [] }) {
    const { auth } = usePage().props;
    const [loading, setLoading] = useState(true);
    const [taskData, setTaskData] = useState(null);
    const [timeline, setTimeline] = useState([]);
    const [totalComments, setTotalComments] = useState(0);
    const [totalActivities, setTotalActivities] = useState(0);
    const [taskAttachments, setTaskAttachments] = useState([]);
    const [subtasks, setSubtasks] = useState([]);
    const [customFields, setCustomFields] = useState([]);
    const [customFieldValues, setCustomFieldValues] = useState({});
    const [activeTab, setActiveTab] = useState('comments');
    const [commentBody, setCommentBody] = useState('');
    const [commentFiles, setCommentFiles] = useState([]);
    const [submittingComment, setSubmittingComment] = useState(false);
    const [visible, setVisible] = useState(false);
    const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
    const [newSubtaskAssignee, setNewSubtaskAssignee] = useState('');
    const [newSubtaskDueDate, setNewSubtaskDueDate] = useState('');
    const [addingSubtask, setAddingSubtask] = useState(false);
    const [showSubtaskInput, setShowSubtaskInput] = useState(false);
    const panelRef = useRef(null);
    const fileInputRef = useRef(null);

    const fetchTask = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiFetch(`/projects/${projectId}/tasks/${taskId}/detail`);
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            setTaskData(data.task);
            setTimeline(data.timeline);
            setTotalComments(data.totalComments);
            setTotalActivities(data.totalActivities);
            setTaskAttachments(data.taskAttachments);
            setSubtasks(data.subtasks || []);
            setCustomFields(data.customFields || []);
            setCustomFieldValues(data.customFieldValues || {});
        } catch (e) {
            console.error('Failed to load task detail:', e);
        } finally {
            setLoading(false);
        }
    }, [projectId, taskId]);

    useEffect(() => {
        fetchTask();
        requestAnimationFrame(() => setVisible(true));
    }, [fetchTask]);

    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') handleClose();
        };
        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, []);

    const handleClose = () => {
        setVisible(false);
        setTimeout(onClose, 300);
    };

    const isParentTask = taskData && !taskData.parent_id;

    const handleAddSubtask = async () => {
        if (!newSubtaskTitle.trim() || addingSubtask) return;
        setAddingSubtask(true);
        try {
            const res = await apiFetch(`/projects/${projectId}/tasks/quick`, {
                method: 'POST',
                body: JSON.stringify({
                    title: newSubtaskTitle.trim(),
                    parent_id: taskId,
                    status: 'to_do',
                    priority: 'medium',
                    assigned_to: newSubtaskAssignee || null,
                    due_date: newSubtaskDueDate || null,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                setSubtasks(prev => [...prev, data.task]);
                setNewSubtaskTitle('');
                setNewSubtaskAssignee('');
                setNewSubtaskDueDate('');
                setTaskData(prev => ({
                    ...prev,
                    subtasks_count: (prev.subtasks_count || 0) + 1,
                }));
                onSubtaskCreated?.(taskId, data.task);
            }
        } catch (e) {
            console.error('Failed to add subtask', e);
        } finally {
            setAddingSubtask(false);
        }
    };

    const handleToggleSubtaskDone = async (subtask) => {
        const newStatus = subtask.status === 'done' ? 'to_do' : 'done';
        setSubtasks(prev => prev.map(s => s.id === subtask.id ? { ...s, status: newStatus } : s));
        setTaskData(prev => ({
            ...prev,
            completed_subtasks_count: prev.completed_subtasks_count + (newStatus === 'done' ? 1 : -1),
        }));
        try {
            await apiFetch(`/projects/${projectId}/tasks/${subtask.id}/patch`, {
                method: 'PATCH',
                body: JSON.stringify({ status: newStatus }),
            });
            onTaskUpdate?.();
        } catch (e) {
            setSubtasks(prev => prev.map(s => s.id === subtask.id ? { ...s, status: subtask.status } : s));
            setTaskData(prev => ({
                ...prev,
                completed_subtasks_count: prev.completed_subtasks_count + (newStatus === 'done' ? -1 : 1),
            }));
        }
    };

    const handleFieldUpdate = async (field, value) => {
        try {
            const res = await apiFetch(`/projects/${projectId}/tasks/${taskId}/patch`, {
                method: 'PATCH',
                body: JSON.stringify({ [field]: value }),
            });
            if (res.ok) {
                const json = await res.json();
                setTaskData(json.task);
                onTaskUpdate?.(taskId, field, value);
            }
        } catch (e) {
            console.error('Failed to update field:', e);
        }
    };

    const handleSubmitComment = async () => {
        if (!commentBody.trim() && commentFiles.length === 0) return;
        setSubmittingComment(true);
        try {
            const formData = new FormData();
            formData.append('body', commentBody);
            commentFiles.forEach(f => formData.append('attachments[]', f));

            const headers = {
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content,
                'Accept': 'application/json',
            };
            if (window.Echo?.socketId?.()) {
                headers['X-Socket-ID'] = window.Echo.socketId();
            }

            const res = await fetch(`/projects/${projectId}/tasks/${taskId}/comments`, {
                method: 'POST',
                headers,
                body: formData,
            });

            if (res.ok) {
                setCommentBody('');
                setCommentFiles([]);
                fetchTask();
            }
        } catch (e) {
            console.error('Failed to post comment:', e);
        } finally {
            setSubmittingComment(false);
        }
    };

    const handleLoadMore = async (type) => {
        const currentCount = timeline.filter(i => i.type === type).length;
        try {
            const res = await apiFetch(`/projects/${projectId}/tasks/${taskId}/timeline?type=${type}&offset=${currentCount}`);
            if (res.ok) {
                const json = await res.json();
                setTimeline(prev => [...prev, ...json.items]);
            }
        } catch (e) {
            console.error('Failed to load more:', e);
        }
    };

    const comments = timeline.filter(i => i.type === 'comment');
    const activities = timeline.filter(i => i.type === 'activity');
    const isOverdue = taskData?.due_date && new Date(taskData.due_date) < new Date() && taskData.status !== 'done' && taskData.status !== 'cancelled';

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-black/20 dark:bg-black/40 z-40 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
                onClick={handleClose}
            />

            {/* Panel */}
            <div
                ref={panelRef}
                className={`fixed top-0 right-0 h-full w-full max-w-2xl bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-out ${visible ? 'translate-x-0' : 'translate-x-full'}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">Task Details</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <Tooltip content="Open full editor">
                        <Link
                            href={`/projects/${projectId}/tasks/${taskId}/edit`}
                            className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                        </Link>
                        </Tooltip>
                        <Tooltip content="Close">
                        <button
                            onClick={handleClose}
                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                        </Tooltip>
                    </div>
                </div>

                {loading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
                    </div>
                ) : taskData ? (
                    <div className="flex-1 overflow-y-auto">
                        {/* Title */}
                        <div className="px-6 pt-5 pb-3">
                            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                                {taskData.title}
                            </h1>
                            {taskData.parent && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Subtask of <span className="font-medium">{taskData.parent.title}</span>
                                </p>
                            )}
                        </div>

                        {/* Fields grid */}
                        <div className="px-6 pb-4 grid grid-cols-2 gap-x-6 gap-y-3">
                            {/* Status */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
                                <select
                                    value={taskData.status}
                                    onChange={(e) => handleFieldUpdate('status', e.target.value)}
                                    className="w-full text-sm rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 py-1.5"
                                >
                                    {['backlog', 'to_do', 'in_progress', 'in_review', 'done', 'cancelled'].map(s => (
                                        <option key={s} value={s}>{formatLabel(s)}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Priority */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Priority</label>
                                <select
                                    value={taskData.priority}
                                    onChange={(e) => handleFieldUpdate('priority', e.target.value)}
                                    className="w-full text-sm rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 py-1.5"
                                >
                                    {['low', 'medium', 'high', 'urgent'].map(p => (
                                        <option key={p} value={p}>{formatLabel(p)}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Assignee */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Assignee</label>
                                <SearchableSelect
                                    value={taskData.assigned_to || ''}
                                    onChange={(val) => handleFieldUpdate('assigned_to', val || null)}
                                    options={users.map(u => ({ value: u.id, label: u.name }))}
                                    placeholder="Unassigned"
                                    showAvatar
                                />
                            </div>

                            {/* Due Date */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Due Date</label>
                                <input
                                    type="date"
                                    value={taskData.due_date ? taskData.due_date.split('T')[0] : ''}
                                    onChange={(e) => handleFieldUpdate('due_date', e.target.value || null)}
                                    className={`w-full text-sm rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 py-1.5 ${isOverdue ? 'text-red-600 dark:text-red-400' : ''}`}
                                />
                            </div>

                            {/* Start Date */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Start Date</label>
                                <input
                                    type="date"
                                    value={taskData.start_date ? taskData.start_date.split('T')[0] : ''}
                                    onChange={(e) => handleFieldUpdate('start_date', e.target.value || null)}
                                    className="w-full text-sm rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 py-1.5"
                                />
                            </div>

                            {/* Created by */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Created by</label>
                                <div className="flex items-center gap-2 py-1.5">
                                    {taskData.creator && <Avatar name={taskData.creator.name} size="sm" />}
                                    <span className="text-sm text-gray-700 dark:text-gray-300">{taskData.creator?.name || '—'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Collaborators */}
                        <CollaboratorEditor
                            collaborators={taskData.collaborators || []}
                            users={users}
                            assigneeId={taskData.assigned_to}
                            onUpdate={(ids) => handleFieldUpdate('collaborator_ids', ids)}
                        />

                        {/* Custom Fields */}
                        {customFields.length > 0 && (
                            <div className="px-6 pb-4">
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Custom Fields</label>
                                <div className="space-y-2">
                                    {customFields.map(cf => {
                                        let displayValue = '—';
                                        if (cf.type === 'formula') {
                                            // Build a task-like object for formula evaluation
                                            const taskForFormula = {
                                                ...taskData,
                                                custom_field_values: Object.entries(customFieldValues).map(([fieldId, val]) => ({
                                                    custom_field_id: Number(fieldId),
                                                    ...val,
                                                })),
                                            };
                                            const results = computeAllFormulas(taskForFormula, customFields);
                                            const val = results[cf.id];
                                            displayValue = val != null ? formatFormulaResult(val, cf.config) : '—';
                                        } else {
                                            const cfv = customFieldValues[cf.id];
                                            if (cfv) {
                                                if (cf.type === 'text') displayValue = cfv.value_text || '—';
                                                else if (cf.type === 'number') {
                                                    if (cfv.value_number != null && cf.config?.decimal_places != null) {
                                                        displayValue = Number(cfv.value_number).toFixed(cf.config.decimal_places);
                                                    } else {
                                                        displayValue = cfv.value_number ?? '—';
                                                    }
                                                }
                                                else if (cf.type === 'date') displayValue = cfv.value_date ? formatDate(cfv.value_date) : '—';
                                                else if (cf.type === 'single_select') {
                                                    const opt = cf.options?.find(o => o.id === cfv.selected_option_id);
                                                    displayValue = opt?.label || '—';
                                                } else if (cf.type === 'multi_select') {
                                                    const ids = cfv.value_json || [];
                                                    const labels = ids.map(id => cf.options?.find(o => o.id === id)?.label).filter(Boolean);
                                                    displayValue = labels.join(', ') || '—';
                                                }
                                            }
                                        }
                                        return (
                                            <div key={cf.id} className="flex items-center justify-between text-sm">
                                                <span className="text-gray-500 dark:text-gray-400">{cf.name}</span>
                                                <span className="text-gray-900 dark:text-gray-100">{displayValue}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Description */}
                        <div className="px-6 pb-4 border-t border-gray-100 dark:border-gray-800 pt-4">
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Description</label>
                            {taskData.description ? (
                                isHtml(taskData.description) ? (
                                    <div className="text-sm text-gray-700 dark:text-gray-300 rich-text prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: taskData.description }} />
                                ) : (
                                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{taskData.description}</p>
                                )
                            ) : (
                                <p className="text-sm text-gray-400 italic">No description</p>
                            )}
                        </div>

                        {/* Subtasks */}
                        {isParentTask && (
                            <div className="px-6 pb-4 border-t border-gray-100 dark:border-gray-800 pt-4">
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                                    Subtasks
                                    {subtasks.length > 0 && (
                                        <span className="ml-1">({taskData.completed_subtasks_count}/{subtasks.length})</span>
                                    )}
                                </label>

                                {/* Progress bar */}
                                {subtasks.length > 0 && (
                                    <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mb-2 overflow-hidden">
                                        <div
                                            className="h-full bg-green-500 rounded-full transition-all duration-300"
                                            style={{ width: `${(subtasks.filter(s => s.status === 'done').length / subtasks.length) * 100}%` }}
                                        />
                                    </div>
                                )}

                                <div className="space-y-1">
                                    {subtasks.map(st => (
                                        <div key={st.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md group hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                            <button
                                                onClick={() => handleToggleSubtaskDone(st)}
                                                className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                                                    st.status === 'done'
                                                        ? 'bg-green-500 border-green-500 text-white'
                                                        : 'border-gray-300 dark:border-gray-500 hover:border-green-400'
                                                }`}
                                            >
                                                {st.status === 'done' && (
                                                    <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </button>
                                            <Link
                                                href={taskEditUrl(st)}
                                                className={`text-sm flex-1 truncate hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${
                                                    st.status === 'done'
                                                        ? 'text-gray-400 line-through'
                                                        : 'text-gray-700 dark:text-gray-300'
                                                }`}
                                            >
                                                {st.title}
                                            </Link>
                                            {st.due_date && (
                                                <span className={`text-xs whitespace-nowrap ${new Date(st.due_date) < new Date() && st.status !== 'done' ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}>
                                                    {formatDate(st.due_date)}
                                                </span>
                                            )}
                                            {st.assignee && <Avatar name={st.assignee.name} size="sm" />}
                                        </div>
                                    ))}
                                </div>

                                {/* Add subtask input */}
                                {showSubtaskInput ? (
                                    <div className="mt-2 space-y-2">
                                        <input
                                            autoFocus
                                            type="text"
                                            value={newSubtaskTitle}
                                            onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask(); }
                                                if (e.key === 'Escape') { setShowSubtaskInput(false); setNewSubtaskTitle(''); setNewSubtaskAssignee(''); setNewSubtaskDueDate(''); }
                                            }}
                                            placeholder="Subtask title..."
                                            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1 text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                                        />
                                        <div className="flex items-center gap-2">
                                            <SearchableSelect
                                                value={newSubtaskAssignee}
                                                onChange={(val) => setNewSubtaskAssignee(val)}
                                                options={users.map(u => ({ value: u.id, label: u.name }))}
                                                placeholder="Unassigned"
                                                showAvatar
                                                className="flex-1"
                                            />
                                            <input
                                                type="date"
                                                value={newSubtaskDueDate}
                                                onChange={(e) => setNewSubtaskDueDate(e.target.value)}
                                                className="rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={handleAddSubtask}
                                                disabled={addingSubtask}
                                                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium disabled:opacity-50"
                                            >
                                                {addingSubtask ? '...' : 'Add'}
                                            </button>
                                            <button
                                                onClick={() => { setShowSubtaskInput(false); setNewSubtaskTitle(''); setNewSubtaskAssignee(''); setNewSubtaskDueDate(''); }}
                                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                            >
                                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setShowSubtaskInput(true)}
                                        className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                                    >
                                        + Add subtask
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Attachments */}
                        {taskAttachments.length > 0 && (
                            <div className="px-6 pb-4 border-t border-gray-100 dark:border-gray-800 pt-4">
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                                    Attachments ({taskAttachments.length})
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {taskAttachments.map(att => (
                                        <a
                                            key={att.id}
                                            href={att.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block"
                                        >
                                            {att.is_image ? (
                                                <img src={att.url} alt={att.file_name} className="h-16 w-16 rounded-lg object-cover border border-gray-200 dark:border-gray-600 hover:opacity-80 transition-opacity" />
                                            ) : (
                                                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm">
                                                    <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                    </svg>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate max-w-24">{att.file_name}</p>
                                                        <p className="text-xs text-gray-400">{formatFileSize(att.file_size)}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Comments & Activity tabs */}
                        <div className="border-t border-gray-200 dark:border-gray-700">
                            <div className="flex px-6 border-b border-gray-200 dark:border-gray-700">
                                <button
                                    onClick={() => setActiveTab('comments')}
                                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                                        activeTab === 'comments'
                                            ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                    }`}
                                >
                                    Comments ({totalComments})
                                </button>
                                <button
                                    onClick={() => setActiveTab('activities')}
                                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                                        activeTab === 'activities'
                                            ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                    }`}
                                >
                                    Activity ({totalActivities})
                                </button>
                            </div>

                            <div className="px-6 py-4">
                                {activeTab === 'comments' && (
                                    <>
                                        {/* Comment form */}
                                        <div className="mb-4">
                                            <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                                                <RichTextEditor
                                                    value={commentBody}
                                                    onChange={setCommentBody}
                                                    placeholder="Write a comment..."
                                                    minimal
                                                    users={users}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between mt-2">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => fileInputRef.current?.click()}
                                                        className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
                                                    >
                                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                                        </svg>
                                                        Attach
                                                    </button>
                                                    <input
                                                        ref={fileInputRef}
                                                        type="file"
                                                        multiple
                                                        className="hidden"
                                                        onChange={(e) => setCommentFiles(prev => [...prev, ...Array.from(e.target.files)])}
                                                    />
                                                    {commentFiles.length > 0 && (
                                                        <span className="text-xs text-gray-400">{commentFiles.length} file{commentFiles.length > 1 ? 's' : ''}</span>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={handleSubmitComment}
                                                    disabled={submittingComment || (!commentBody.trim() && commentFiles.length === 0)}
                                                    className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50 transition-colors"
                                                >
                                                    {submittingComment ? 'Sending...' : 'Comment'}
                                                </button>
                                            </div>
                                            {commentFiles.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {commentFiles.map((f, i) => (
                                                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-400">
                                                            {f.name}
                                                            <button onClick={() => setCommentFiles(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">
                                                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                                </svg>
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Comment list */}
                                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                            {comments.map(item => (
                                                <div key={`c-${item.id}`} className="flex gap-3 py-3">
                                                    <Avatar name={item.user?.name} size="sm" className="shrink-0 mt-0.5" />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.user?.name || 'Unknown'}</span>
                                                            <span className="text-xs text-gray-400">{timeAgo(item.created_at)}</span>
                                                        </div>
                                                        {item.body && (isHtml(item.body) ? (
                                                            <div className="text-sm text-gray-700 dark:text-gray-300 mt-1 rich-text" dangerouslySetInnerHTML={{ __html: item.body }} />
                                                        ) : (
                                                            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">{item.body}</p>
                                                        ))}
                                                        {item.attachments?.length > 0 && (
                                                            <div className="flex flex-wrap gap-2 mt-2">
                                                                {item.attachments.map(att => (
                                                                    <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer">
                                                                        {att.is_image ? (
                                                                            <img src={att.url} alt={att.file_name} className="h-16 w-16 rounded-lg object-cover border border-gray-200 dark:border-gray-600" />
                                                                        ) : (
                                                                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-xs">
                                                                                <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                                                </svg>
                                                                                <span className="truncate max-w-20">{att.file_name}</span>
                                                                            </div>
                                                                        )}
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {comments.length < totalComments && (
                                            <button onClick={() => handleLoadMore('comment')} className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 mt-2">
                                                Load more comments...
                                            </button>
                                        )}
                                        {comments.length === 0 && (
                                            <p className="text-sm text-gray-400 text-center py-4">No comments yet</p>
                                        )}
                                    </>
                                )}

                                {activeTab === 'activities' && (
                                    <>
                                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                            {activities.map(item => (
                                                <div key={`a-${item.id}`} className="flex gap-3 py-3">
                                                    <div className="shrink-0 mt-0.5">
                                                        <div className={`h-7 w-7 rounded-full flex items-center justify-center ${item.description ? 'bg-green-100 dark:bg-green-900/40' : 'bg-blue-100 dark:bg-blue-900/40'}`}>
                                                            {item.description ? (
                                                                <svg className="h-3.5 w-3.5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                                                </svg>
                                                            ) : (
                                                                <svg className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                </svg>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm text-gray-700 dark:text-gray-300">
                                                            <span className="font-medium text-gray-900 dark:text-gray-100">{item.user?.name || 'Someone'}</span>{' '}
                                                            {item.description ? (
                                                                item.description
                                                            ) : (
                                                                <>
                                                                    changed {fieldLabel(item.field)}{' '}
                                                                    {item.old_value && <>from <span className="font-medium text-gray-900 dark:text-gray-100">{item.old_value}</span>{' '}</>}
                                                                    {item.new_value ? (
                                                                        <>to <span className="font-medium text-gray-900 dark:text-gray-100">{item.new_value}</span></>
                                                                    ) : (
                                                                        <span className="text-gray-500 italic">unset</span>
                                                                    )}
                                                                </>
                                                            )}
                                                        </p>
                                                        <p className="text-xs text-gray-400 mt-0.5">{timeAgo(item.created_at)}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {activities.length < totalActivities && (
                                            <button onClick={() => handleLoadMore('activity')} className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 mt-2">
                                                Load more activity...
                                            </button>
                                        )}
                                        {activities.length === 0 && (
                                            <p className="text-sm text-gray-400 text-center py-4">No activity yet</p>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-gray-400">Failed to load task details</p>
                    </div>
                )}
            </div>
        </>
    );
}
