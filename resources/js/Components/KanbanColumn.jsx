import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { formatLabel, taskStatusColors } from '../utils';
import TaskCard from './TaskCard';

export default function KanbanColumn({ status, tasks, projectId, canManageTasks, auth, onDeleteTask }) {
    const canEditTask = (task) => canManageTasks || task.assigned_to === auth?.user?.id;

    const { setNodeRef, isOver } = useDroppable({ id: `column-${status}` });

    const taskIds = tasks.map((t) => t.id);

    return (
        <div className="min-w-[280px] w-[280px] shrink-0">
            <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${taskStatusColors[status] || ''}`}>
                        {formatLabel(status)}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{tasks.length}</span>
                </div>
            </div>
            <div
                ref={setNodeRef}
                className={`bg-gray-100 dark:bg-gray-900/50 rounded-lg p-2 min-h-[200px] space-y-2 transition-colors ${isOver ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-300 dark:ring-blue-500 ring-inset' : ''}`}
            >
                <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
                    {tasks.map((task) => (
                        <TaskCard
                            key={task.id}
                            task={task}
                            projectId={projectId}
                            canEdit={canEditTask(task)}
                            canDelete={canManageTasks}
                            onDelete={onDeleteTask}
                        />
                    ))}
                </SortableContext>
                {tasks.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-8">No tasks</p>
                )}
            </div>
        </div>
    );
}
