import { useState, useEffect, useRef, useCallback } from 'react';
import { usePage } from '@inertiajs/react';
import {
    DndContext,
    closestCenter,
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
import InlinePopover from './InlinePopover';
import Modal, { ConfirmModal } from './Modal';
import { apiFetch } from '../utils';

function SortableTodoItem({ todo, onToggle, onDelete, modal }) {
    const [fading, setFading] = useState(false);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: todo.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
        zIndex: isDragging ? 50 : undefined,
    };

    const handleToggle = () => {
        if (!todo.is_completed) {
            setFading(true);
            setTimeout(() => onToggle(todo.id, !todo.is_completed), 600);
        } else {
            onToggle(todo.id, !todo.is_completed);
        }
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`group flex items-center gap-2 px-2 rounded-md transition-all duration-300 ${
                modal ? 'py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700/40' : 'py-1 hover:bg-gray-700/40'
            } ${fading ? 'opacity-30 line-through' : ''}`}
        >
            {modal && !todo.is_completed && (
                <button
                    {...attributes}
                    {...listeners}
                    className="shrink-0 cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 touch-none opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Drag to reorder"
                >
                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm8-16a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
                    </svg>
                </button>
            )}
            <button
                onClick={handleToggle}
                className="shrink-0 flex items-center justify-center"
            >
                <span className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${
                    todo.is_completed
                        ? 'bg-primary-600 border-primary-600'
                        : modal
                            ? 'border-gray-400 dark:border-gray-500 hover:border-primary-500'
                            : 'border-gray-500 hover:border-primary-500'
                }`}>
                    {todo.is_completed && (
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                </span>
            </button>
            <span className={`flex-1 text-sm ${modal ? '' : 'truncate'} ${
                todo.is_completed
                    ? 'text-gray-500 line-through'
                    : modal
                        ? 'text-gray-700 dark:text-gray-300'
                        : 'text-gray-300'
            }`}>
                {todo.title}
            </span>
            <button
                onClick={() => onDelete(todo.id)}
                className={`shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
                    modal ? 'text-gray-400 hover:text-red-500' : 'text-gray-600 hover:text-red-400'
                }`}
            >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}

function TodoList({ todos, onToggle, onDelete, onAdd, onReorder, onClearCompleted, onClearAll, showCompleted, setShowCompleted, modal }) {
    const [newTitle, setNewTitle] = useState('');
    const inputRef = useRef(null);

    const completedCount = todos.filter(t => t.is_completed).length;
    const incomplete = todos.filter(t => !t.is_completed);
    const completed = todos.filter(t => t.is_completed);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const handleSubmit = (e) => {
        e.preventDefault();
        const title = newTitle.trim();
        if (!title) return;
        onAdd(title);
        setNewTitle('');
        inputRef.current?.focus();
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        onReorder(active.id, over.id);
    };

    const inputClass = modal
        ? "w-full bg-gray-100 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
        : "w-full bg-gray-700/50 border border-gray-600 rounded-md px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500";

    return (
        <div>
            <form onSubmit={handleSubmit} className={modal ? "pb-3" : "px-3 pb-2"}>
                <input
                    ref={inputRef}
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Add a to-do..."
                    maxLength={255}
                    className={inputClass}
                />
            </form>

            <div className={`overflow-y-auto ${modal ? 'max-h-[60vh] px-0' : 'max-h-48 px-1'}`}>
                {incomplete.length === 0 && completedCount === 0 && (
                    <p className={`text-xs text-gray-500 text-center py-3 ${modal ? '' : 'px-3'}`}>No to-dos yet</p>
                )}
                {modal ? (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={incomplete.map(t => t.id)} strategy={verticalListSortingStrategy}>
                            {incomplete.map((todo) => (
                                <SortableTodoItem key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDelete} modal={modal} />
                            ))}
                        </SortableContext>
                    </DndContext>
                ) : (
                    incomplete.map((todo) => (
                        <SortableTodoItem key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDelete} modal={modal} />
                    ))
                )}
            </div>

            {completedCount > 0 && (
                <div className={modal ? "pt-2 mt-2 border-t border-gray-200 dark:border-gray-700" : "px-3 pt-1"}>
                    <div className="flex items-center justify-between">
                        <button
                            onClick={() => setShowCompleted(!showCompleted)}
                            className={`text-xs transition-colors ${modal ? 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-400' : 'text-gray-500 hover:text-gray-400'}`}
                        >
                            {showCompleted ? 'Hide' : 'Show'} completed ({completedCount})
                        </button>
                        {modal && showCompleted && (
                            <button
                                onClick={onClearCompleted}
                                className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                            >
                                Clear done
                            </button>
                        )}
                    </div>
                    {showCompleted && (
                        <div className="mt-1 px-0">
                            {completed.map((todo) => (
                                <SortableTodoItem key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDelete} modal={modal} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {modal && todos.length > 0 && (
                <div className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                    <button
                        onClick={onClearAll}
                        className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    >
                        Clear all
                    </button>
                </div>
            )}
        </div>
    );
}

export default function SidebarTodoWidget({ collapsed }) {
    const { personalTodosCount } = usePage().props;
    const [todos, setTodos] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [showCompleted, setShowCompleted] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [confirmClear, setConfirmClear] = useState(null); // 'all' | 'completed' | null
    const anchorRef = useRef(null);
    const [incompleteCount, setIncompleteCount] = useState(personalTodosCount || 0);

    useEffect(() => {
        setIncompleteCount(personalTodosCount || 0);
    }, [personalTodosCount]);

    const loadTodos = useCallback(async () => {
        if (loaded) return;
        try {
            const res = await apiFetch('/api/personal-todos');
            if (!res.ok) return;
            const data = await res.json();
            setTodos(data.todos || []);
            setLoaded(true);
            setIncompleteCount((data.todos || []).filter(t => !t.is_completed).length);
        } catch (e) {
            console.error('Failed to load personal todos', e);
        }
    }, [loaded]);

    const handleAdd = async (title) => {
        const tempId = `temp-${Date.now()}`;
        const optimistic = { id: tempId, title, is_completed: false, position: 0 };
        setTodos(prev => [optimistic, ...prev]);
        setIncompleteCount(prev => prev + 1);

        try {
            const res = await apiFetch('/api/personal-todos', {
                method: 'POST',
                body: JSON.stringify({ title }),
            });
            const data = await res.json();
            setTodos(prev => prev.map(t => t.id === tempId ? data.todo : t));
        } catch {
            setTodos(prev => prev.filter(t => t.id !== tempId));
            setIncompleteCount(prev => prev - 1);
        }
    };

    const handleToggle = async (id, isCompleted) => {
        setTodos(prev => prev.map(t => t.id === id ? { ...t, is_completed: isCompleted } : t));
        setIncompleteCount(prev => isCompleted ? prev - 1 : prev + 1);

        try {
            await apiFetch(`/api/personal-todos/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ is_completed: isCompleted }),
            });
        } catch {
            setTodos(prev => prev.map(t => t.id === id ? { ...t, is_completed: !isCompleted } : t));
            setIncompleteCount(prev => isCompleted ? prev + 1 : prev - 1);
        }
    };

    const handleDelete = async (id) => {
        const deleted = todos.find(t => t.id === id);
        setTodos(prev => prev.filter(t => t.id !== id));
        if (deleted && !deleted.is_completed) {
            setIncompleteCount(prev => prev - 1);
        }

        try {
            await apiFetch(`/api/personal-todos/${id}`, { method: 'DELETE' });
        } catch {
            setTodos(prev => [...prev, deleted].sort((a, b) => a.position - b.position));
            if (deleted && !deleted.is_completed) {
                setIncompleteCount(prev => prev + 1);
            }
        }
    };

    const handleReorder = useCallback(async (activeId, overId) => {
        const incomplete = todos.filter(t => !t.is_completed);
        const oldIndex = incomplete.findIndex(t => t.id === activeId);
        const newIndex = incomplete.findIndex(t => t.id === overId);
        if (oldIndex === -1 || newIndex === -1) return;

        const reordered = arrayMove(incomplete, oldIndex, newIndex);
        const completed = todos.filter(t => t.is_completed);
        setTodos([...reordered, ...completed]);

        try {
            await apiFetch('/api/personal-todos/reorder', {
                method: 'POST',
                body: JSON.stringify({ ids: reordered.map(t => t.id) }),
            });
        } catch {
            // Revert on error
            setTodos([...incomplete, ...completed]);
        }
    }, [todos]);

    const handleClearCompleted = () => {
        setConfirmClear('completed');
    };

    const handleClearAll = () => {
        setConfirmClear('all');
    };

    const handleConfirmClear = async () => {
        const mode = confirmClear;
        setConfirmClear(null);

        if (mode === 'completed') {
            const kept = todos.filter(t => !t.is_completed);
            const removed = todos.filter(t => t.is_completed);
            setTodos(kept);

            try {
                await apiFetch('/api/personal-todos/clear-completed', { method: 'DELETE' });
            } catch {
                setTodos(prev => [...prev, ...removed]);
            }
        } else if (mode === 'all') {
            const backup = [...todos];
            setTodos([]);
            setIncompleteCount(0);

            try {
                await apiFetch('/api/personal-todos/clear-all', { method: 'DELETE' });
            } catch {
                setTodos(backup);
                setIncompleteCount(backup.filter(t => !t.is_completed).length);
            }
        }
    };

    // Auto-load when expanded sidebar renders
    useEffect(() => {
        if (!collapsed) loadTodos();
    }, [collapsed, loadTodos]);

    const todoListProps = {
        todos,
        onToggle: handleToggle,
        onDelete: handleDelete,
        onAdd: handleAdd,
        onReorder: handleReorder,
        onClearCompleted: handleClearCompleted,
        onClearAll: handleClearAll,
        showCompleted,
        setShowCompleted,
    };

    // Collapsed mode: icon button with popover
    if (collapsed) {
        return (
            <>
                <div className="px-2 py-1">
                    <button
                        ref={anchorRef}
                        onClick={() => {
                            if (isOpen) {
                                setIsOpen(false);
                            } else {
                                loadTodos();
                                setIsOpen(true);
                            }
                        }}
                        className="relative w-full flex items-center justify-center p-2 rounded-lg text-gray-300 hover:bg-gray-700/50 hover:text-white transition-colors"
                        title="To-Do List"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {incompleteCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 bg-primary-500 text-white text-[9px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-0.5">
                                {incompleteCount > 99 ? '99+' : incompleteCount}
                            </span>
                        )}
                    </button>
                </div>
                <InlinePopover isOpen={isOpen} onClose={() => setIsOpen(false)} anchorRef={anchorRef} className="w-72">
                    <div className="bg-gray-800 rounded-lg border border-gray-700 py-3">
                        <div className="flex items-center justify-between px-3 pb-2">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">To-Do List</p>
                            <button
                                onClick={() => { setIsOpen(false); setShowModal(true); }}
                                className="text-gray-500 hover:text-gray-300 transition-colors"
                                title="Expand"
                            >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                                </svg>
                            </button>
                        </div>
                        <TodoList {...todoListProps} />
                    </div>
                </InlinePopover>
                <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="To-Do List" size="md">
                    <TodoList {...todoListProps} modal />
                </Modal>
                <ConfirmModal
                    isOpen={!!confirmClear}
                    onClose={() => setConfirmClear(null)}
                    onConfirm={handleConfirmClear}
                    title={confirmClear === 'all' ? 'Clear All To-Dos' : 'Clear Completed'}
                    message={confirmClear === 'all'
                        ? 'Are you sure you want to delete all to-dos? This cannot be undone.'
                        : 'Are you sure you want to delete all completed to-dos? This cannot be undone.'
                    }
                />
            </>
        );
    }

    // Expanded mode: inline in sidebar
    return (
        <>
            <div className="px-3 py-2">
                <div className="flex items-center justify-between px-2 mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">To-Do List</p>
                    <button
                        onClick={() => setShowModal(true)}
                        className="text-gray-600 hover:text-gray-400 transition-colors"
                        title="Expand"
                    >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                        </svg>
                    </button>
                </div>
                <TodoList {...todoListProps} />
            </div>
            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="To-Do List" size="md">
                <TodoList {...todoListProps} modal />
            </Modal>
            <ConfirmModal
                isOpen={!!confirmClear}
                onClose={() => setConfirmClear(null)}
                onConfirm={handleConfirmClear}
                title={confirmClear === 'all' ? 'Clear All To-Dos' : 'Clear Completed'}
                message={confirmClear === 'all'
                    ? 'Are you sure you want to delete all to-dos? This cannot be undone.'
                    : 'Are you sure you want to delete all completed to-dos? This cannot be undone.'
                }
            />
        </>
    );
}
