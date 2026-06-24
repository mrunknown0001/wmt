import { useState, useMemo, useCallback } from 'react';
import { Link, router, usePage } from '@inertiajs/react';
import {
    DndContext,
    DragOverlay,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
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
import StatusPicker from '../../Components/StatusPicker';
import PriorityPicker from '../../Components/PriorityPicker';
import AssigneePicker from '../../Components/AssigneePicker';
import InlineDatePicker from '../../Components/InlineDatePicker';
import { formatLabel, formatDate, apiFetch } from '../../utils';

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

const EditIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
);

const TrashIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

// Sortable table row for list view drag-and-drop
function SortableRow({ task, project, canEditTask, canManageTasks, handleDeleteTask, users, onTaskUpdate }) {
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
        <tr ref={setNodeRef} style={style} {...attributes} {...listeners} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-grab active:cursor-grabbing touch-none ${isDragging ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}>
            <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">{task.title}</td>
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
                    {canEditTask ? (
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
                {canEditTask ? (
                    <InlineDatePicker
                        currentDate={task.due_date}
                        isOpen={openPopover === 'due_date'}
                        onToggle={togglePopover('due_date')}
                        onSelect={(date) => handleFieldUpdate('due_date', date)}
                        isOverdue={isOverdue}
                    />
                ) : (
                    <span className={`text-sm ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                        {formatDate(task.due_date) || '—'}
                    </span>
                )}
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

export default function Show() {
    const { project, tasks: serverTasks, canManageProject, canManageTasks, auth, users } = usePage().props;

    const [view, setView] = useState('list');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterPriority, setFilterPriority] = useState('');
    const [filterAssignee, setFilterAssignee] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [localTasks, setLocalTasks] = useState(serverTasks);
    const [activeId, setActiveId] = useState(null);

    // Sync local state when server data changes (after Inertia navigation)
    useMemo(() => {
        setLocalTasks(serverTasks);
    }, [serverTasks]);

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
    const filteredTasks = useMemo(() => {
        return localTasks.filter((t) => {
            if (filterStatus && t.status !== filterStatus) return false;
            if (filterPriority && t.priority !== filterPriority) return false;
            if (filterAssignee && String(t.assigned_to) !== filterAssignee) return false;
            return true;
        });
    }, [localTasks, filterStatus, filterPriority, filterAssignee]);

    // Group filtered tasks by status for board view
    const tasksByStatus = useMemo(() => {
        const grouped = {};
        TASK_STATUSES.forEach((s) => (grouped[s] = []));
        filteredTasks.forEach((t) => {
            if (grouped[t.status]) grouped[t.status].push(t);
        });
        return grouped;
    }, [filteredTasks]);

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
        }));

        apiFetch(`/projects/${project.id}/tasks/reorder`, {
            method: 'POST',
            body: JSON.stringify({ tasks: payload }),
        });
    }, [project.id]);

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
        }).then((res) => {
            if (!res.ok) setLocalTasks(serverTasks);
        }).catch(() => {
            setLocalTasks(serverTasks);
        });
    }, [project.id, users, serverTasks]);

    // --- List view drag handlers ---
    const handleListDragEnd = useCallback((event) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over || active.id === over.id) return;

        setLocalTasks((prev) => {
            const filtered = prev.filter((t) => {
                if (filterStatus && t.status !== filterStatus) return false;
                if (filterPriority && t.priority !== filterPriority) return false;
                if (filterAssignee && String(t.assigned_to) !== filterAssignee) return false;
                return true;
            });
            const unfilteredIds = new Set(filtered.map((t) => t.id));

            const oldIndex = filtered.findIndex((t) => t.id === active.id);
            const newIndex = filtered.findIndex((t) => t.id === over.id);
            if (oldIndex === -1 || newIndex === -1) return prev;

            const reordered = arrayMove(filtered, oldIndex, newIndex);

            // Rebuild full list: keep unfiltered items in place, splice reordered filtered items
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
    }, [filterStatus, filterPriority, filterAssignee, persistReorder]);

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

    const handleConfirmDelete = () => {
        if (confirmDelete.type === 'project') {
            router.delete(`/projects/${project.id}`);
        } else {
            router.delete(`/projects/${project.id}/tasks/${confirmDelete.taskId}`);
        }
        setConfirmDelete(null);
    };

    const hasActiveFilters = filterStatus || filterPriority || filterAssignee;

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

            {/* Project Info Card */}
            <Card className="mb-6">
                <div className="flex flex-wrap items-start gap-6">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                            <StatusBadge status={project.status} type="project" />
                            {project.due_date && (
                                <span className="text-sm text-gray-500 dark:text-gray-400">Due {formatDate(project.due_date)}</span>
                            )}
                        </div>
                        {project.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{project.description}</p>
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

            {/* View Toggle + Filters + Add Task */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                    {/* View Toggle */}
                    <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-0.5">
                        <button
                            onClick={() => setView('list')}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                view === 'list'
                                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                            }`}
                        >
                            <ListIcon /> List
                        </button>
                        <button
                            onClick={() => setView('board')}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                view === 'board'
                                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                            }`}
                        >
                            <BoardIcon /> Board
                        </button>
                    </div>

                    {/* Filters */}
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
                        className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                        <option value="">All Priorities</option>
                        {['low', 'medium', 'high', 'urgent'].map((p) => (
                            <option key={p} value={p}>{formatLabel(p)}</option>
                        ))}
                    </select>
                    <select
                        value={filterAssignee}
                        onChange={(e) => setFilterAssignee(e.target.value)}
                        className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                        <option value="">All Assignees</option>
                        {assignees.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                    {hasActiveFilters && (
                        <button
                            onClick={() => { setFilterStatus(''); setFilterPriority(''); setFilterAssignee(''); }}
                            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
                        >
                            Clear
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
                            onDragEnd={handleListDragEnd}
                        >
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-800/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Title</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Priority</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Assignee</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Due Date</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    <SortableContext items={filteredTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                                        {filteredTasks.map((task) => (
                                            <SortableRow
                                                key={task.id}
                                                task={task}
                                                project={project}
                                                canEditTask={canEditTask(task)}
                                                canManageTasks={canManageTasks}
                                                handleDeleteTask={handleDeleteTask}
                                                users={users}
                                                onTaskUpdate={handleInlineUpdate}
                                            />
                                        ))}
                                    </SortableContext>
                                </tbody>
                            </table>
                            <DragOverlay>
                                {activeTask ? (
                                    <table className="min-w-full">
                                        <tbody>
                                            <tr className="bg-white dark:bg-gray-800 shadow-lg rounded-lg">
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
                                                    {formatDate(activeTask.due_date) || '—'}
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
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCorners}
                    onDragStart={handleDragStart}
                    onDragEnd={handleBoardDragEnd}
                >
                    <div className="overflow-x-auto pb-4">
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
                                    {activeTask.due_date && (
                                        <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(activeTask.due_date)}</span>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>
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
