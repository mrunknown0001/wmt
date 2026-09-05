import { useForm, usePage, router, Link } from '@inertiajs/react';
import { useState, useEffect, useRef } from 'react';
import { pickTaskDate } from '../../taskDates';
import { COMMENT_LIMIT } from '../../limits';
import TaskMinutes from '../../Components/TaskMinutes';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Input from '../../Components/Input';
import Select from '../../Components/Select';
import SearchableSelect from '../../Components/SearchableSelect';
import RichTextEditor from '../../Components/RichTextEditor';
import Button from '../../Components/Button';
import LinkButton from '../../Components/LinkButton';
import Avatar from '../../Components/Avatar';
import UserMultiSelect from '../../Components/UserMultiSelect';
import RecurrenceOptions from '../../Components/RecurrenceOptions';
import EstimateInput from '../../Components/EstimateInput';
import TaskTimePanel from '../../Components/TaskTimePanel';
import TimeInMotion from '../../Components/TimeInMotion';
import CustomFieldValueEditor from '../../Components/CustomFieldValueEditor';
import Tooltip from '../../Components/Tooltip';
import { ConfirmModal } from '../../Components/Modal';
import OverdueNotice from '../../Components/OverdueNotice';
import CompletedNotice from '../../Components/CompletedNotice';
import { formatLabel, formatDate, apiFetch, taskEditUrl, isPastDue, overdueDays } from '../../utils';
import { request } from '../../apiClient';
import echo from '../../echo';

function timeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fieldLabel(field) {
    const labels = {
        title: 'title',
        description: 'description',
        status: 'status',
        priority: 'priority',
        assigned_to: 'assignee',
        due_date: 'due date',
    };
    return labels[field] || field;
}

function ActivityItem({ item }) {
    const isFormSubmission = !item.user && item.description?.includes('via form');
    const userName = item.user?.name || 'System';

    if (item.description) {
        return (
            <div className="flex gap-3 py-3">
                <div className="shrink-0 mt-0.5">
                    <div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                        <svg className="h-3.5 w-3.5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </div>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                        {isFormSubmission ? (
                            <span className="capitalize">{item.description}</span>
                        ) : (
                            <><span className="font-medium text-gray-900 dark:text-gray-100">{userName}</span>{' '}{item.description}</>
                        )}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{timeAgo(item.created_at)}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex gap-3 py-3">
            <div className="shrink-0 mt-0.5">
                <div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                    <svg className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                </div>
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{userName}</span>{' '}
                    changed {fieldLabel(item.field)}{' '}
                    {item.old_value && (
                        <>from <span className="font-medium text-gray-900 dark:text-gray-100">{item.old_value}</span>{' '}</>
                    )}
                    {item.new_value ? (
                        <>to <span className="font-medium text-gray-900 dark:text-gray-100">{item.new_value}</span></>
                    ) : (
                        <span className="text-gray-500 italic">unset</span>
                    )}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{timeAgo(item.created_at)}</p>
            </div>
        </div>
    );
}

function isHtml(str) {
    return /<[a-z][\s\S]*>/i.test(str);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function CommentItem({ item, currentUserId, projectId, taskId, isStandalone, users }) {
    const [deleting, setDeleting] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editBody, setEditBody] = useState('');
    const [saving, setSaving] = useState(false);

    const commentUrl = isStandalone
        ? `/tasks/${taskId}/comments/${item.id}`
        : `/projects/${projectId}/tasks/${taskId}/comments/${item.id}`;

    // Asked in the app's own dialog rather than the browser's, which sits
    // outside the page, ignores the theme, and cannot say which comment.
    const handleDelete = () => {
        setConfirmingDelete(false);
        setDeleting(true);
        router.delete(commentUrl, {
            preserveScroll: true,
            onFinish: () => setDeleting(false),
        });
    };

    const startEditing = () => {
        setEditBody(item.body || '');
        setEditing(true);
    };

    const handleSaveEdit = () => {
        const hasBody = editBody && editBody !== '<p></p>';
        if (!hasBody || saving) return;
        setSaving(true);
        router.put(commentUrl, { body: editBody }, {
            preserveScroll: true,
            onSuccess: () => setEditing(false),
            onFinish: () => setSaving(false),
        });
    };

    const isEdited = item.updated_at && item.updated_at !== item.created_at;

    return (
        <div className="flex gap-3 py-3">
            <div className="shrink-0 mt-0.5">
                <Avatar name={item.user?.name} size="sm" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {item.user?.name || 'Unknown'}
                    </span>
                    <span className="text-xs text-gray-400">{timeAgo(item.created_at)}</span>
                    {isEdited && <span className="text-xs text-gray-400 italic">(edited)</span>}
                    {item.user?.id === currentUserId && !editing && (
                        <span className="ml-auto flex items-center gap-1">
                            <Tooltip content="Edit">
                                <button
                                    onClick={startEditing}
                                    className="p-1 rounded-md text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:text-primary-400 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487z" />
                                    </svg>
                                </button>
                            </Tooltip>
                            <Tooltip content="Delete">
                                <button
                                    onClick={() => setConfirmingDelete(true)}
                                    disabled={deleting}
                                    className="p-1 rounded-md text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                                >
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                    </svg>
                                </button>
                            </Tooltip>
                        </span>
                    )}
                </div>
                {editing ? (
                    <div className="mt-2">
                        <RichTextEditor
                            value={editBody}
                            onChange={setEditBody}
                            placeholder="Edit your comment..."
                            minimal
                            users={users}
                            onSubmit={handleSaveEdit}
                            limit={COMMENT_LIMIT}
                        />
                        <div className="flex items-center gap-2 mt-2">
                            <button
                                onClick={handleSaveEdit}
                                disabled={saving || !editBody || editBody === '<p></p>'}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
                            >
                                {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                                onClick={() => setEditing(false)}
                                disabled={saving}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : item.body && (isHtml(item.body) ? (
                    <div className="text-sm text-gray-700 dark:text-gray-300 mt-1 rich-text" dangerouslySetInnerHTML={{ __html: item.body }} />
                ) : (
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">{item.body}</p>
                ))}
                {item.attachments && item.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                        {item.attachments.map((att) => (
                            <div key={att.id} className="relative group">
                                <a
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block"
                                >
                                    {att.is_image ? (
                                        <img
                                            src={att.url}
                                            alt={att.file_name}
                                            className="h-20 w-20 rounded-lg object-cover border border-gray-200 dark:border-gray-600 hover:opacity-80 transition-opacity"
                                        />
                                    ) : att.is_video ? (
                                        <div className="relative h-20 w-32 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden bg-black hover:opacity-80 transition-opacity">
                                            <video src={att.url} className="h-full w-full object-cover" preload="metadata" />
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <svg className="h-8 w-8 text-white/80" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M8 5v14l11-7z" />
                                                </svg>
                                            </div>
                                            <p className="absolute bottom-0 left-0 right-0 text-[10px] text-white/80 bg-black/50 px-1 py-0.5 truncate">{att.file_name}</p>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                                            {att.file_type?.includes('spreadsheet') || att.file_type?.includes('excel') || att.file_type?.includes('csv') ? (
                                                <svg className="h-5 w-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M12 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M3.375 12H12m0 0v1.5c0 .621.504 1.125 1.125 1.125M12 12c0 .621-.504 1.125-1.125 1.125m1.125 2.625h7.5m-7.5 0c-.621 0-1.125-.504-1.125-1.125M12 15.75c0-.621-.504-1.125-1.125-1.125m-2.25 0c.621 0 1.125-.504 1.125-1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125" />
                                                </svg>
                                            ) : (
                                                <svg className="h-5 w-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                </svg>
                                            )}
                                            <div className="min-w-0">
                                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate max-w-30">{att.file_name}</p>
                                                <p className="text-xs text-gray-400">{formatFileSize(att.file_size)}</p>
                                            </div>
                                        </div>
                                    )}
                                </a>
                                {att.download_url && (
                                    <Tooltip content="Download">
                                        <a
                                            href={att.download_url}
                                            className="absolute top-1 right-1 p-1 rounded-md bg-white/80 dark:bg-gray-800/80 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                            </svg>
                                        </a>
                                    </Tooltip>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={confirmingDelete}
                onClose={() => setConfirmingDelete(false)}
                onConfirm={handleDelete}
                title="Delete comment"
                message="Delete this comment? Any files attached to it go with it, and this cannot be undone."
            />
        </div>
    );
}


export default function Edit() {
    const { project, task, taskAttachments = [], timeline: initialTimeline, totalComments, totalActivities, users, statuses, priorities, auth, recurrenceFrequencies, recurrenceChain, canManageTaskDetails, canFlagMilestone = false, requiresAttachmentOnClose = false, canExemptFromCloseRules = false, minutes = null, minutesUpdatedBy = null, minutesUpdatedAt = null, dependencies: initialDependencies = [], dependencyOptions = [], settings, isStandalone, projects, customFields = [], customFieldValues: initialCfValues = {}, subtasks: initialSubtasks = [] } = usePage().props;

    const { data, setData, put, processing, errors } = useForm({
        title: task.title || '',
        description: task.description || '',
        status: task.status || 'to_do',
        priority: task.priority || 'medium',
        assigned_to: task.assigned_to || '',
        start_date: task.start_date ? task.start_date.split('T')[0] : '',
        due_date: task.due_date ? task.due_date.split('T')[0] : '',
        due_time: (task.due_time || '').slice(0, 5),
        estimated_minutes: task.estimated_minutes ?? null,
        collaborator_ids: (task.collaborators || []).map((c) => c.id),
        is_recurring: task.is_recurring || false,
        task_type: task.task_type || 'standard',
        is_milestone: task.is_milestone || false,
        close_rule_exempt: task.close_rule_exempt || false,
        close_rule_exempt_reason: task.close_rule_exempt_reason || '',
        recurrence_frequency: task.recurrence_frequency || 'weekly',
        recurrence_interval: task.recurrence_interval || 1,
        recurrence_config: task.recurrence_config || null,
        ...(isStandalone ? { project_id: task.project_id || '' } : {}),
        custom_field_values: (() => {
            const vals = {};
            Object.entries(initialCfValues).forEach(([fieldId, cfv]) => {
                const cf = customFields.find(f => f.id === Number(fieldId));
                if (!cf) return;
                if (cf.type === 'text') vals[fieldId] = cfv.value_text || '';
                else if (cf.type === 'number') vals[fieldId] = cfv.value_number ?? '';
                else if (cf.type === 'date') vals[fieldId] = cfv.value_date ? cfv.value_date.split('T')[0] : '';
                else if (cf.type === 'single_select') vals[fieldId] = cfv.value_option_id ? String(cfv.value_option_id) : '';
                else if (cf.type === 'multi_select') vals[fieldId] = cfv.value_json || [];
            });


            return vals;
        })(),
    });

    // Dependencies are managed through their own endpoints rather than the form:
    // adding one can be refused (a loop, another project), and that refusal
    // should surface immediately, not on save.
    const [deps, setDeps] = useState(initialDependencies);
    const [depError, setDepError] = useState(null);
    const [depBusy, setDepBusy] = useState(false);

    const addDependency = async (id) => {
        if (!id) return;
        setDepBusy(true); setDepError(null);
        try {
            const res = await fetch(`/tasks/${task.id}/dependencies`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content || '',
                },
                body: JSON.stringify({ depends_on_task_id: Number(id) }),
            });
            const body = await res.json();
            if (!res.ok) {
                setDepError(body?.errors?.depends_on_task_id?.[0] || body?.message || 'Could not add that dependency.');
                return;
            }
            setDeps(body.dependencies || []);
        } catch {
            setDepError('Could not reach the server.');
        } finally {
            setDepBusy(false);
        }
    };

    const removeDependency = async (id) => {
        setDepBusy(true); setDepError(null);
        try {
            const res = await fetch(`/tasks/${task.id}/dependencies/${id}`, {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content || '',
                },
            });
            const body = await res.json();
            if (res.ok) setDeps(body.dependencies || []);
        } finally {
            setDepBusy(false);
        }
    };

    const [showStartDate, setShowStartDate] = useState(!!task.start_date);
    // Pausing and resuming the clock change the task record; kept here so the
    // strip redraws from the server's answer rather than a page reload.
    const [motion, setMotion] = useState({
        paused_at: task.motion_paused_at || null,
        resumed_at: task.motion_resumed_at || null,
        paused_minutes: task.motion_paused_minutes || 0,
    });
    const [activeTab, setActiveTab] = useState('comments');

    // Switching tabs moves the page to what was asked for. Minutes take the full
    // width and sit below the task form, so choosing them without scrolling
    // leaves the reader looking at the form they just left; the other tabs live
    // at the top of the column and have to be scrolled back up to.
    const tabsRef = useRef(null);
    const minutesRef = useRef(null);
    const tabsMounted = useRef(false);

    useEffect(() => {
        // Only on an actual change — the first render must not yank the page.
        if (!tabsMounted.current) {
            tabsMounted.current = true;
            return;
        }

        const target = activeTab === 'minutes' ? minutesRef.current : tabsRef.current;
        if (!target) return;

        // Scroll the container by hand rather than with scrollIntoView. The page
        // scrolls inside <main>, under a sticky header, and scrollIntoView's own
        // alignment put the tab bar eight pixels behind that header — close
        // enough to look like a rendering fault. Positioning it explicitly leaves
        // no doubt where the target lands.
        const scroller = target.closest('main') || document.scrollingElement;
        if (!scroller) return;

        const GAP = 12; // a little air above the target, not flush to the edge
        const top = target.getBoundingClientRect().top
            - scroller.getBoundingClientRect().top
            + scroller.scrollTop
            - GAP;

        const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        scroller.scrollTo({ top: Math.max(0, top), behavior: still ? 'auto' : 'smooth' });
    }, [activeTab]);
    const [commentBody, setCommentBody] = useState('');
    const [posting, setPosting] = useState(false);
    const [attachments, setAttachments] = useState([]);
    const [attachmentError, setAttachmentError] = useState('');

    // Subtask state (only for parent tasks)
    const [localSubtasks, setLocalSubtasks] = useState(initialSubtasks);
    const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
    const [newSubtaskAssignee, setNewSubtaskAssignee] = useState('');
    const [newSubtaskDueDate, setNewSubtaskDueDate] = useState('');
    const [addingSubtask, setAddingSubtask] = useState(false);
    const [showSubtaskInput, setShowSubtaskInput] = useState(false);

    const handleAddSubtask = async () => {
        if (!newSubtaskTitle.trim() || addingSubtask) return;
        setAddingSubtask(true);
        try {
            const { ok, data } = await request(`/projects/${project.id}/tasks/quick`, {
                method: 'POST',
                body: JSON.stringify({
                    title: newSubtaskTitle.trim(),
                    parent_id: task.id,
                    status: 'to_do',
                    priority: 'medium',
                    assigned_to: newSubtaskAssignee || null,
                    due_date: newSubtaskDueDate || null,
                }),
            });
            if (!ok) return; // reason already toasted; keep the typed title

            setLocalSubtasks(prev => [...prev, data.task || data]);
            setNewSubtaskTitle('');
            setNewSubtaskAssignee('');
            setNewSubtaskDueDate('');
        } finally {
            setAddingSubtask(false);
        }
    };

    const handleToggleSubtaskDone = async (subtask) => {
        const newStatus = subtask.status === 'done' ? 'to_do' : 'done';
        setLocalSubtasks(prev => prev.map(s => s.id === subtask.id ? { ...s, status: newStatus } : s));

        // A 4xx does not reject a fetch, so the old catch never fired and a
        // rejected toggle silently stuck. request() reports it and we revert.
        const { ok } = await request(`/projects/${project.id}/tasks/${subtask.id}/patch`, {
            method: 'PATCH',
            body: JSON.stringify({ status: newStatus }),
        });
        if (!ok) {
            setLocalSubtasks(prev => prev.map(s => s.id === subtask.id ? { ...s, status: subtask.status } : s));
        }
    };

    const handleDeleteSubtask = async (subtask) => {
        if (!confirm(`Delete subtask "${subtask.title}"?`)) return;
        setLocalSubtasks(prev => prev.filter(s => s.id !== subtask.id));

        const { ok } = await request(`/projects/${project.id}/tasks/${subtask.id}`, { method: 'DELETE' });
        // Put it back if the server refused, instead of leaving the UI claiming
        // a delete that did not happen.
        if (!ok) setLocalSubtasks(prev => [...prev, subtask]);
    };

    const maxUploadSize = settings?.max_upload_size || 10;

    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files);
        const maxBytes = maxUploadSize * 1024 * 1024;
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
            'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv', 'video/webm',
            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        // Some browsers hand over a blank or generic type for Office files, so
        // the extension gets the final say rather than the file being refused
        // for something the server would have accepted.
        const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'mp4', 'mov', 'avi', 'wmv', 'webm', 'xls', 'xlsx', 'csv', 'docx'];
        const extensionOf = (name) => (name.split('.').pop() || '').toLowerCase();

        setAttachmentError('');

        for (const file of files) {
            if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(extensionOf(file.name))) {
                setAttachmentError(`"${file.name}" is not supported. Allowed: images, PDF, Word, videos, Excel, CSV.`);
                e.target.value = '';
                return;
            }
            if (file.size > maxBytes) {
                setAttachmentError(`"${file.name}" exceeds the ${maxUploadSize}MB limit.`);
                e.target.value = '';
                return;
            }
        }

        if (attachments.length + files.length > 5) {
            setAttachmentError('Maximum 5 files per comment.');
            e.target.value = '';
            return;
        }

        setAttachments((prev) => [...prev, ...files]);
        e.target.value = '';
    };

    const removeAttachment = (index) => {
        setAttachments((prev) => prev.filter((_, i) => i !== index));
    };

    // Separate loaded items by type for offset tracking
    const initialComments = (initialTimeline || []).filter(i => i.type === 'comment');
    const initialActivities = (initialTimeline || []).filter(i => i.type === 'activity');

    const [comments, setComments] = useState(initialComments);
    const [activities, setActivities] = useState(initialActivities);
    const [loadingComments, setLoadingComments] = useState(false);
    const [loadingActivities, setLoadingActivities] = useState(false);

    // Sync state when server props change (e.g. after posting a comment)
    useEffect(() => {
        setComments(initialComments);
    }, [initialTimeline]);
    useEffect(() => {
        setActivities(initialActivities);
    }, [initialTimeline]);

    // Real-time comment updates via Echo
    useEffect(() => {
        const channel = echo.private(`task.${task.id}`);

        channel.listen('.comment.created', (e) => {
            setComments((prev) => {
                if (prev.some((c) => c.id === e.comment.id)) return prev;
                return [e.comment, ...prev];
            });
        });

        channel.listen('.comment.updated', (e) => {
            setComments((prev) => prev.map((c) => (
                c.id === e.comment_id ? { ...c, body: e.body, updated_at: e.updated_at } : c
            )));
        });

        channel.listen('.comment.deleted', (e) => {
            setComments((prev) => prev.filter((c) => c.id !== e.comment_id));
        });

        return () => echo.leave(`task.${task.id}`);
    }, [task.id]);

    const hasMoreComments = comments.length < (totalComments || 0);
    const hasMoreActivities = activities.length < (totalActivities || 0);

    const loadMoreComments = async () => {
        setLoadingComments(true);
        try {
            const timelineBase = isStandalone ? `/tasks/${task.id}/timeline` : `/projects/${project.id}/tasks/${task.id}/timeline`;
            const res = await apiFetch(`${timelineBase}?type=comment&offset=${comments.length}`);
            const json = await res.json();
            setComments(prev => [...prev, ...json.items]);
        } finally {
            setLoadingComments(false);
        }
    };

    const loadMoreActivities = async () => {
        setLoadingActivities(true);
        try {
            const timelineBase = isStandalone ? `/tasks/${task.id}/timeline` : `/projects/${project.id}/tasks/${task.id}/timeline`;
            const res = await apiFetch(`${timelineBase}?type=activity&offset=${activities.length}`);
            const json = await res.json();
            setActivities(prev => [...prev, ...json.items]);
        } finally {
            setLoadingActivities(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        put(isStandalone ? `/tasks/${task.id}` : `/projects/${project.id}/tasks/${task.id}`);
    };

    const handleComment = (e) => {
        e?.preventDefault();
        if (posting) return;
        const hasBody = commentBody && commentBody !== '<p></p>';
        if (!hasBody && attachments.length === 0) return;

        setPosting(true);

        const formData = new FormData();
        if (hasBody) formData.append('body', commentBody);
        attachments.forEach((file) => formData.append('attachments[]', file));

        const commentUrl = isStandalone
            ? `/tasks/${task.id}/comments`
            : `/projects/${project.id}/tasks/${task.id}/comments`;
        router.post(commentUrl, formData, {
            preserveScroll: true,
            forceFormData: true,
            onSuccess: () => {
                setCommentBody('');
                setAttachments([]);
                setAttachmentError('');
            },
            onFinish: () => setPosting(false),
        });
    };

    // Read from the saved task, not the form: typing a new due date should not
    // clear the warning before the change has actually been saved.
    const daysOverdue = overdueDays(task);
    const isDone = task.status === 'done';

    return (
        <AuthenticatedLayout title="Edit Task">
            <PageHeader
                title="Edit Task"
                titleExtra={isDone ? (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/40 px-2 py-0.5 text-xs font-semibold text-green-700 dark:text-green-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        Completed
                    </span>
                ) : daysOverdue > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/40 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        Overdue
                    </span>
                )}
                breadcrumbs={isStandalone ? [
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'My Tasks', href: '/my-tasks' },
                    { label: 'Edit Task' },
                ] : [
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'Projects', href: '/projects' },
                    { label: project.name, href: `/projects/${project.id}` },
                    { label: 'Edit Task' },
                ]}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Task Form */}
                <div className="lg:col-span-2 min-w-0">
                    <Card>
                        {/* First thing on the task, above even the notices:
                            a Start button further down is a Start button
                            nobody presses. Only for projects that asked to
                            track this — anywhere else it would be two empty
                            dates and a dash. */}
                        {!isStandalone && project?.show_time_in_motion && (
                            <div className="mb-5">
                                <TimeInMotion
                                    projectId={project.id}
                                    taskId={task.id}
                                    startedAt={task.started_at}
                                    completedAt={task.completed_at}
                                    status={data.status}
                                    motionPausedAt={motion.paused_at}
                                    motionResumedAt={motion.resumed_at}
                                    motionPausedMinutes={motion.paused_minutes}
                                    motionSpansDays={task.motion_spans_days}
                                    canEdit={canManageTaskDetails && !['completed', 'archived'].includes(project.status)}
                                    onStarted={(json) => setData('status', json.status || 'in_progress')}
                                    onMotionChange={(json) => setMotion({
                                        paused_at: json.motion_paused_at,
                                        resumed_at: json.motion_resumed_at,
                                        paused_minutes: json.motion_paused_minutes,
                                    })}
                                />
                            </div>
                        )}
                        <OverdueNotice task={task} className="mb-5" />
                        <CompletedNotice task={task} className="mb-5" />
                        {task.parent && (
                            <div className="mb-5 flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
                                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                                Subtask of:{' '}
                                <Link
                                    href={taskEditUrl(task.parent)}
                                    className="font-medium hover:underline"
                                >
                                    {task.parent.title}
                                </Link>
                            </div>
                        )}
                        {task.subtasks_count > 0 && (
                            <div className="mb-5 flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
                                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                </svg>
                                {task.subtasks_count} subtask{task.subtasks_count !== 1 ? 's' : ''}
                            </div>
                        )}
                        <form id="task-edit-form" onSubmit={handleSubmit} className="space-y-5">
                            <Input label="Title" id="title" value={data.title} onChange={(e) => setData('title', e.target.value)} error={errors.title} />

                            {/* What kind of task this is. A meeting keeps minutes; the tab
                                appears as soon as the type is switched, before saving. */}
                            <Select
                                label="Task Type"
                                id="task_type"
                                value={data.task_type}
                                onChange={(e) => setData('task_type', e.target.value)}
                                options={[
                                    { value: 'standard', label: 'Standard Task' },
                                    { value: 'meeting', label: 'Meeting (keeps minutes)' },
                                ]}
                                error={errors.task_type}
                                disabled={!canManageTaskDetails}
                            />
                            {data.task_type === 'meeting' && task.task_type !== 'meeting' && (
                                <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">
                                    Save the task to open its Minutes tab.
                                </p>
                            )}
                            <RichTextEditor label="Description" id="description" value={data.description} onChange={(val) => setData('description', val)} error={errors.description} placeholder="Add a description..." />

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Select label="Status" id="status" value={data.status} onChange={(e) => setData('status', e.target.value)} options={statuses.map((s) => ({ value: s, label: formatLabel(s) }))} error={errors.status} />
                                <Select label="Priority" id="priority" value={data.priority} onChange={(e) => setData('priority', e.target.value)} options={priorities.map((p) => ({ value: p, label: formatLabel(p) }))} error={errors.priority} />
                            </div>

                            <SearchableSelect label="Assigned To" id="assigned_to" value={data.assigned_to} onChange={(val) => setData('assigned_to', val)} placeholder="— Unassigned —" options={users.map((u) => ({ value: u.id, label: u.name }))} error={errors.assigned_to} disabled={!canManageTaskDetails} showAvatar />

                            {isStandalone && projects && projects.length > 0 && (
                                <SearchableSelect
                                    label="Project"
                                    id="project_id"
                                    value={data.project_id}
                                    onChange={(val) => setData('project_id', val)}
                                    placeholder="— No project (standalone) —"
                                    options={projects.map((p) => ({ value: p.id, label: p.name }))}
                                    error={errors.project_id}
                                />
                            )}

                            <div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {showStartDate && (
                                        <Input label="Start Date" id="start_date" type="date" max={data.due_date || undefined} value={data.start_date} onChange={(e) => { const o = pickTaskDate({ start: data.start_date, due: data.due_date }, 'start', e.target.value); setData({ ...data, start_date: o.start, due_date: o.due }); if (o.start) setShowStartDate(true); }} error={errors.start_date} disabled={!canManageTaskDetails} />
                                    )}
                                    <div>
                                        <Input
                                            label="Due Date"
                                            id="due_date"

                                            min={data.start_date || undefined}
                                            type="date"
                                            value={data.due_date}
                                            onChange={(e) => { const o = pickTaskDate({ start: data.start_date, due: data.due_date }, 'due', e.target.value); setData({ ...data, start_date: o.start, due_date: o.due }); if (o.start) setShowStartDate(true); }}
                                            error={errors.due_date}
                                            disabled={!canManageTaskDetails}
                                        />
                                        {daysOverdue > 0 && !errors.due_date && (
                                            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                                                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                                                {daysOverdue} {daysOverdue === 1 ? 'day' : 'days'} past due
                                            </p>
                                        )}
                                    </div>
                                    <Input label="Due Time" id="due_time" type="time" value={data.due_time} onChange={(e) => setData('due_time', e.target.value)} error={errors.due_time} disabled={!canManageTaskDetails} />
                            <EstimateInput
                                value={data.estimated_minutes}
                                onChange={(mins) => setData('estimated_minutes', mins)}
                                error={errors.estimated_minutes}
                                disabled={!canManageTaskDetails}
                            />
                                </div>

                                {!showStartDate && canManageTaskDetails && (
                                    <button
                                        type="button"
                                        onClick={() => setShowStartDate(true)}
                                        className="mt-1.5 text-xs text-primary-600 dark:text-primary-400 hover:underline"
                                    >
                                        + Add start date
                                    </button>
                                )}
                                {showStartDate && canManageTaskDetails && (
                                    <button
                                        type="button"
                                        onClick={() => { setShowStartDate(false); setData('start_date', ''); }}
                                        className="mt-1.5 text-xs text-gray-400 hover:text-red-500 hover:underline"
                                    >
                                        Remove start date
                                    </button>
                                )}
                            </div>

                            {canFlagMilestone && (
                                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={data.is_milestone}
                                            onChange={(e) => setData('is_milestone', e.target.checked)}
                                            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                                        />
                                        <span className="inline-block w-2.5 h-2.5 bg-purple-600 rotate-45" />
                                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Milestone</span>
                                    </label>
                                    <p className="mt-1.5 ml-6 text-xs text-gray-500 dark:text-gray-400">
                                        Marks when this lands. The Gantt keeps the task's bar and puts a diamond at
                                        its end, so a stretch of work can carry a milestone without becoming a single day.
                                    </p>
                                    {errors.is_milestone && <p className="mt-1 ml-6 text-xs text-red-600">{errors.is_milestone}</p>}
                                </div>
                            )}

                            {/* Waiver against the project's close rule. Only shown where the
                                rule actually applies, so it never advertises an exception to
                                a project that has nothing to except from. */}
                            {requiresAttachmentOnClose && canExemptFromCloseRules && (
                                <div className="rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 p-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={data.close_rule_exempt}
                                            onChange={(e) => setData('close_rule_exempt', e.target.checked)}
                                            className="rounded border-amber-400 dark:border-amber-600 text-amber-600 focus:ring-amber-500"
                                        />
                                        <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
                                            Exempt this task from the attachment rule
                                        </span>
                                    </label>
                                    <p className="mt-1.5 ml-6 text-xs text-amber-800/80 dark:text-amber-300/80">
                                        This project requires a file before a task can be marked Done or Cancelled.
                                        Exempting lets this one task close without it — for work that genuinely
                                        produced no file. Everything else in the project stays under the rule.
                                    </p>

                                    {data.close_rule_exempt && (
                                        <div className="mt-3 ml-6">
                                            <label htmlFor="close_rule_exempt_reason" className="block text-xs font-medium text-amber-900 dark:text-amber-200">
                                                Reason <span className="text-red-600">*</span>
                                            </label>
                                            <textarea
                                                id="close_rule_exempt_reason"
                                                rows={2}
                                                maxLength={500}
                                                value={data.close_rule_exempt_reason}
                                                onChange={(e) => setData('close_rule_exempt_reason', e.target.value)}
                                                placeholder="Why this task can close without a file"
                                                className="mt-1 block w-full rounded-md border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-amber-500 focus:ring-amber-500"
                                            />
                                            <p className="mt-1 text-xs text-amber-800/70 dark:text-amber-300/70">
                                                Recorded against the task with your name, so the decision can be
                                                accounted for later.
                                            </p>
                                        </div>
                                    )}

                                    {task.close_rule_exempt && task.close_rule_exempt_by && (
                                        <p className="mt-3 ml-6 text-xs text-amber-900/80 dark:text-amber-300/80">
                                            Granted by{' '}
                                            <span className="font-medium">{task.close_rule_exempt_by?.name || task.close_rule_exempt_by_name || 'someone'}</span>
                                            {task.close_rule_exempt_at && (
                                                <> on {new Date(task.close_rule_exempt_at).toLocaleDateString()}</>
                                            )}.
                                        </p>
                                    )}

                                    {errors.close_rule_exempt && <p className="mt-2 ml-6 text-xs text-red-600">{errors.close_rule_exempt}</p>}
                                    {errors.close_rule_exempt_reason && <p className="mt-1 ml-6 text-xs text-red-600">{errors.close_rule_exempt_reason}</p>}
                                </div>
                            )}

                            {/* Read-only for everyone else: the person doing the work should be
                                able to see the rule was waived, and by whom, without being able
                                to waive it themselves. */}
                            {requiresAttachmentOnClose && !canExemptFromCloseRules && task.close_rule_exempt && (
                                <div className="rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 p-4">
                                    <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                                        Exempt from the attachment rule
                                    </p>
                                    <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/80">
                                        This task can be closed without a file.
                                        {task.close_rule_exempt_reason && <> Reason: {task.close_rule_exempt_reason}</>}
                                    </p>
                                </div>
                            )}

                            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Waiting on</div>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    This task cannot be marked Done or Cancelled until everything listed here is done.
                                </p>

                                {deps.length > 0 ? (
                                    <ul className="mt-3 space-y-1.5">
                                        {deps.map((d) => (
                                            <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                                                <span className="flex items-center gap-2 min-w-0">
                                                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${d.status === 'done' || d.status === 'cancelled' ? 'bg-green-500' : 'bg-amber-500'}`} />
                                                    <span className="truncate text-gray-700 dark:text-gray-200">{d.title}</span>
                                                </span>
                                                {canManageTaskDetails && (
                                                    <button type="button" onClick={() => removeDependency(d.id)} disabled={depBusy}
                                                        className="text-xs text-gray-400 hover:text-red-600 shrink-0">Remove</button>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="mt-3 text-sm text-gray-400 dark:text-gray-500">Nothing yet.</p>
                                )}

                                {canManageTaskDetails && dependencyOptions.length > 0 && (
                                    <select
                                        value=""
                                        disabled={depBusy}
                                        onChange={(e) => { addDependency(e.target.value); e.target.value = ''; }}
                                        className="mt-3 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm transition-all duration-200 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                                    >
                                        <option value="">Add a task this one waits on…</option>
                                        {dependencyOptions
                                            .filter((o) => !deps.some((d) => d.id === o.id))
                                            .map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                                    </select>
                                )}
                                {depError && <p className="mt-2 text-xs text-red-600">{depError}</p>}
                            </div>

                            {!task.parent_id && (
                                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={data.is_recurring}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setData({ ...data, is_recurring: true });
                                                } else {
                                                    setData({ ...data, is_recurring: false, recurrence_frequency: 'weekly', recurrence_interval: 1 });
                                                }
                                            }}
                                            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                                        />
                                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Recurring task</span>
                                    </label>

                                    {data.is_recurring && (
                                        <>
                                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <Input
                                                    label="Every"
                                                    id="recurrence_interval"
                                                    type="number"
                                                    min={1}
                                                    max={365}
                                                    value={data.recurrence_interval}
                                                    onChange={(e) => setData('recurrence_interval', parseInt(e.target.value) || 1)}
                                                    error={errors.recurrence_interval}
                                                />
                                                <Select
                                                    label="Frequency"
                                                    id="recurrence_frequency"
                                                    value={data.recurrence_frequency}
                                                    onChange={(e) => setData('recurrence_frequency', e.target.value)}
                                                    options={(recurrenceFrequencies || []).map((f) => ({ value: f, label: formatLabel(f) }))}
                                                    error={errors.recurrence_frequency}
                                                />
                                            </div>
                                            <RecurrenceOptions
                                                frequency={data.recurrence_frequency}
                                                interval={data.recurrence_interval}
                                                config={data.recurrence_config}
                                                onChange={(cfg) => setData('recurrence_config', cfg)}
                                                dueTime={data.due_time}
                                                onDueTimeChange={(val) => setData('due_time', val)}
                                                dueTimeDisabled={!canManageTaskDetails}
                                                errors={errors}
                                            />
                                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                                A new task will be created automatically when this task is marked as done.
                                                {data.due_date && ' Next due date will be calculated from the current due date.'}
                                            </p>
                                        </>
                                    )}
                                </div>
                            )}

                            <UserMultiSelect
                                label="Collaborators"
                                users={users}
                                selected={data.collaborator_ids}
                                onChange={(ids) => setData('collaborator_ids', ids)}
                                excludeIds={data.assigned_to ? [Number(data.assigned_to)] : []}
                            />

                            {customFields.length > 0 && (
                                <div className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Custom Fields</h4>
                                    {customFields.filter(f => !['formula', 'week_of_year'].includes(f.type)).map(field => (
                                        <CustomFieldValueEditor
                                            key={field.id}
                                            field={field}
                                            value={data.custom_field_values[field.id]}
                                            onChange={(id, val) => setData('custom_field_values', { ...data.custom_field_values, [id]: val })}
                                        />
                                    ))}
                                </div>
                            )}

                            <div className="h-16" />
                        </form>
                    </Card>
                    <div className="sticky bottom-0 z-20 -mx-px">
                        <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 px-6 py-3 flex justify-end gap-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_-2px_8px_rgba(0,0,0,0.2)]">
                            <LinkButton href={isStandalone ? '/my-tasks' : `/projects/${project.id}`} variant="secondary">Cancel</LinkButton>
                            <Button type="submit" form="task-edit-form" processing={processing} processingText="Saving...">Save Changes</Button>
                        </div>
                    </div>

                    {/* Time: the timer, manual entries and the running total.
                        Its home is here rather than the quick view, which shows
                        the elapsed figure alone — a glance at a task does not
                        want a ledger, and this is where there is room for one. */}
                    <Card className="mt-6">
                        <TaskTimePanel
                            taskId={task.id}
                            estimatedMinutes={data.estimated_minutes}
                            canEdit={canManageTaskDetails}
                            currentUserId={auth?.user?.id}
                            className=""
                        />
                    </Card>

                    {/* Subtasks — only for parent tasks */}
                    {!task.parent_id && (
                        <Card className="mt-6">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                    Subtasks
                                    {localSubtasks.length > 0 && (
                                        <span className="ml-2 text-xs font-normal text-gray-400">
                                            {localSubtasks.filter(s => s.status === 'done').length}/{localSubtasks.length}
                                        </span>
                                    )}
                                </h4>
                            </div>

                            {/* Progress bar */}
                            {localSubtasks.length > 0 && (
                                <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mb-3 overflow-hidden">
                                    <div
                                        className="h-full bg-green-500 rounded-full transition-all duration-300"
                                        style={{ width: `${(localSubtasks.filter(s => s.status === 'done').length / localSubtasks.length) * 100}%` }}
                                    />
                                </div>
                            )}

                            {/* Subtask list */}
                            <div className="space-y-1">
                                {localSubtasks.map(st => (
                                    <div key={st.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md group hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                        <button
                                            type="button"
                                            onClick={() => handleToggleSubtaskDone(st)}
                                            className={`h-4.5 w-4.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
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
                                            className={`text-sm flex-1 truncate hover:text-primary-600 dark:hover:text-primary-400 transition-colors ${
                                                st.status === 'done'
                                                    ? 'text-gray-400 line-through'
                                                    : 'text-gray-700 dark:text-gray-300'
                                            }`}
                                        >
                                            {st.title}
                                        </Link>
                                        {st.due_date && (
                                            <span className={`text-xs whitespace-nowrap ${isPastDue(st.due_date) && st.status !== 'done' ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}>
                                                {formatDate(st.due_date)}
                                            </span>
                                        )}
                                        {st.assignee && <Avatar name={st.assignee.name} size="sm" />}
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteSubtask(st)}
                                            className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-red-500 transition-all shrink-0"
                                        >
                                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
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
                                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
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
                                            className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button size="sm" onClick={handleAddSubtask} processing={addingSubtask} processingText="Adding...">Add</Button>
                                        <button
                                            type="button"
                                            onClick={() => { setShowSubtaskInput(false); setNewSubtaskTitle(''); setNewSubtaskAssignee(''); setNewSubtaskDueDate(''); }}
                                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                        >
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setShowSubtaskInput(true)}
                                    className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                                >
                                    + Add subtask
                                </button>
                            )}
                        </Card>
                    )}
                </div>

                {/* Activity & Comments */}
                {/* min-w-0 so the wide minutes tables scroll inside this column
                    rather than stretching the grid track — a grid item defaults to
                    min-width:auto, which lets wide content push the layout out.
                    Minutes are a full-page document, so they take the full width. */}
                <div className={`min-w-0 ${activeTab === 'minutes' ? 'lg:col-span-3' : 'lg:col-span-1'}`}>
                    <Card>
                        {/* Tabs */}
                        <div ref={tabsRef} className="flex border-b border-gray-200 dark:border-gray-700 mb-4 scroll-mt-4">
                            <button
                                onClick={() => setActiveTab('comments')}
                                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                    activeTab === 'comments'
                                        ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                            >
                                Comments {totalComments > 0 && <span className="ml-1 text-xs text-gray-400">({totalComments})</span>}
                            </button>
                            <button
                                onClick={() => setActiveTab('activities')}
                                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                    activeTab === 'activities'
                                        ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                            >
                                Activities {totalActivities > 0 && <span className="ml-1 text-xs text-gray-400">({totalActivities})</span>}
                            </button>
                            {task.task_type === 'meeting' && (
                                <button
                                    onClick={() => setActiveTab('minutes')}
                                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                        activeTab === 'minutes'
                                            ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                            : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                    }`}
                                >
                                    Minutes
                                </button>
                            )}
                            {recurrenceChain && recurrenceChain.length > 0 && (
                                <button
                                    onClick={() => setActiveTab('recurrence')}
                                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                        activeTab === 'recurrence'
                                            ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                            : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                    }`}
                                >
                                    Recurrence
                                </button>
                            )}
                        </div>

                        {/* Comments Tab */}
                        {activeTab === 'comments' && (
                            <>
                                <form onSubmit={handleComment} className="mb-4">
                                    <RichTextEditor
                                        value={commentBody}
                                        onChange={setCommentBody}
                                        placeholder="Leave a comment... Use @ to mention someone"
                                        minimal
                                        users={users}
                                        onSubmit={handleComment}
                                        limit={COMMENT_LIMIT}
                                    />

                                    {attachments.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {attachments.map((file, index) => (
                                                <div key={index} className="relative group flex items-center gap-2 bg-gray-50 dark:bg-gray-700 rounded-lg px-2 py-1.5 text-xs">
                                                    {file.type.startsWith('image/') ? (
                                                        <img
                                                            src={URL.createObjectURL(file)}
                                                            alt={file.name}
                                                            className="h-8 w-8 rounded object-cover"
                                                        />
                                                    ) : file.type.startsWith('video/') ? (
                                                        <svg className="h-5 w-5 text-purple-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                                                        </svg>
                                                    ) : file.type.includes('spreadsheet') || file.type.includes('excel') || file.type.includes('csv') ? (
                                                        <svg className="h-5 w-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M12 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M3.375 12H12m0 0v1.5c0 .621.504 1.125 1.125 1.125M12 12c0 .621-.504 1.125-1.125 1.125m1.125 2.625h7.5m-7.5 0c-.621 0-1.125-.504-1.125-1.125M12 15.75c0-.621-.504-1.125-1.125-1.125m-2.25 0c.621 0 1.125-.504 1.125-1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125" />
                                                        </svg>
                                                    ) : (
                                                        <svg className="h-5 w-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                        </svg>
                                                    )}
                                                    <span className="max-w-24 truncate text-gray-600 dark:text-gray-300">{file.name}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeAttachment(index)}
                                                        className="text-gray-400 hover:text-red-500"
                                                    >
                                                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {attachmentError && (
                                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{attachmentError}</p>
                                    )}

                                    <div className="flex items-center justify-between mt-2">
                                        <Tooltip content="Attach files">
                                            <label className="cursor-pointer text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                                                <input
                                                    type="file"
                                                    multiple
                                                    accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.mp4,.mov,.avi,.wmv,.webm,.xls,.xlsx,.csv"
                                                    onChange={handleFileSelect}
                                                    className="hidden"
                                                />
                                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                                                </svg>
                                            </label>
                                        </Tooltip>
                                        <Button type="submit" size="sm" title="Ctrl+Enter" processing={posting} processingText="Posting..." disabled={(!commentBody || commentBody === '<p></p>') && attachments.length === 0}>
                                            Comment
                                        </Button>
                                    </div>
                                </form>

                                {taskAttachments.length > 0 && (
                                    <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
                                        <div className="flex items-center gap-2 mb-2.5">
                                            <svg className="h-4 w-4 text-gray-500 dark:text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                                            </svg>
                                            <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                                                Attachments ({taskAttachments.length})
                                            </h4>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {taskAttachments.map((att) => (
                                                <div key={att.id} className="relative group">
                                                    <a href={att.url} target="_blank" rel="noopener noreferrer" className="block">
                                                        {att.is_image ? (
                                                            <img
                                                                src={att.url}
                                                                alt={att.file_name}
                                                                className="h-20 w-20 rounded-lg object-cover border border-gray-200 dark:border-gray-600 hover:opacity-80 transition-opacity"
                                                            />
                                                        ) : att.is_video ? (
                                                            <div className="relative h-20 w-32 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden bg-black hover:opacity-80 transition-opacity">
                                                                <video src={att.url} className="h-full w-full object-cover" preload="metadata" />
                                                                <div className="absolute inset-0 flex items-center justify-center">
                                                                    <svg className="h-8 w-8 text-white/80" fill="currentColor" viewBox="0 0 24 24">
                                                                        <path d="M8 5v14l11-7z" />
                                                                    </svg>
                                                                </div>
                                                                <p className="absolute bottom-0 left-0 right-0 text-[10px] text-white/80 bg-black/50 px-1 py-0.5 truncate">{att.file_name}</p>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                                                                {att.is_spreadsheet ? (
                                                                    <svg className="h-5 w-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M12 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M3.375 12H12m0 0v1.5c0 .621.504 1.125 1.125 1.125M12 12c0 .621-.504 1.125-1.125 1.125m1.125 2.625h7.5m-7.5 0c-.621 0-1.125-.504-1.125-1.125M12 15.75c0-.621-.504-1.125-1.125-1.125m-2.25 0c.621 0 1.125-.504 1.125-1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125" />
                                                                    </svg>
                                                                ) : (
                                                                    <svg className="h-5 w-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                                    </svg>
                                                                )}
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate max-w-30">{att.file_name}</p>
                                                                    <p className="text-xs text-gray-400">{formatFileSize(att.file_size)}</p>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </a>
                                                    {att.download_url && (
                                                        <Tooltip content="Download">
                                                            <a
                                                                href={att.download_url}
                                                                className="absolute top-1 right-1 p-1 rounded-md bg-white/80 dark:bg-gray-800/80 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                                                </svg>
                                                            </a>
                                                        </Tooltip>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {comments.length > 0 ? (
                                        [...comments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((item) => (
                                            <CommentItem
                                                key={`comment-${item.id}`}
                                                item={item}
                                                currentUserId={auth.user?.id}
                                                projectId={project?.id}
                                                taskId={task.id}
                                                isStandalone={isStandalone}
                                                users={users}
                                            />
                                        ))
                                    ) : (
                                        <p className="text-sm text-gray-400 py-4 text-center">No comments yet.</p>
                                    )}
                                </div>

                                {hasMoreComments && (
                                    <div className="pt-3 border-t border-gray-100 dark:border-gray-700 mt-1">
                                        <button
                                            onClick={loadMoreComments}
                                            disabled={loadingComments}
                                            className="text-xs text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50"
                                        >
                                            {loadingComments ? 'Loading...' : `Show more comments (${totalComments - comments.length})`}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Activities Tab */}
                        {activeTab === 'minutes' && task.task_type === 'meeting' && (
                            <div ref={minutesRef} className="scroll-mt-4">
                                <TaskMinutes
                                    task={task}
                                    users={users}
                                    minutes={minutes}
                                    updatedBy={minutesUpdatedBy}
                                    updatedAt={minutesUpdatedAt}
                                    canEdit={canManageTaskDetails !== false}
                                />
                            </div>
                        )}

                        {activeTab === 'activities' && (
                            <>
                                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {activities.length > 0 ? (
                                        [...activities].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((item) => (
                                            <ActivityItem key={`activity-${item.id}`} item={item} />
                                        ))
                                    ) : (
                                        <p className="text-sm text-gray-400 py-4 text-center">No activities yet.</p>
                                    )}
                                </div>

                                {hasMoreActivities && (
                                    <div className="pt-3 border-t border-gray-100 dark:border-gray-700 mt-1">
                                        <button
                                            onClick={loadMoreActivities}
                                            disabled={loadingActivities}
                                            className="text-xs text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50"
                                        >
                                            {loadingActivities ? 'Loading...' : `Show more activities (${totalActivities - activities.length})`}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Recurrence Tab */}
                        {activeTab === 'recurrence' && recurrenceChain && recurrenceChain.length > 0 && (
                            <div className="space-y-1">
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                    Occurrence history ({recurrenceChain.length} total)
                                </p>
                                {recurrenceChain.map((item, index) => (
                                    <div
                                        key={item.id}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                                            item.is_current
                                                ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                        }`}
                                    >
                                        <div className="flex flex-col items-center w-4">
                                            {index > 0 && <div className="w-px h-2 bg-gray-300 dark:bg-gray-600" />}
                                            <div className={`h-2 w-2 rounded-full shrink-0 ${
                                                item.status === 'done' ? 'bg-green-500' :
                                                item.status === 'cancelled' ? 'bg-gray-400' :
                                                item.is_current ? 'bg-primary-500' : 'bg-gray-300'
                                            }`} />
                                            {index < recurrenceChain.length - 1 && <div className="w-px h-2 bg-gray-300 dark:bg-gray-600" />}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            {item.is_current ? (
                                                <span className="font-medium text-gray-900 dark:text-gray-100 truncate block">
                                                    {item.title} <span className="text-xs text-gray-400">(current)</span>
                                                </span>
                                            ) : (
                                                <Link
                                                    href={taskEditUrl(item)}
                                                    className="text-primary-600 dark:text-primary-400 hover:underline truncate block"
                                                >
                                                    {item.title}
                                                </Link>
                                            )}
                                        </div>

                                        <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                                            {item.start_date && item.due_date ? `${item.start_date} → ${item.due_date}` : item.due_date || item.start_date || 'No date'}
                                        </span>

                                        <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${
                                            item.status === 'done' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                            item.status === 'cancelled' ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' :
                                            'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                        }`}>
                                            {formatLabel(item.status)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
