import { useMemo, useState } from 'react';
import { router, Link } from '@inertiajs/react';
import AuthenticatedLayout from '../Layouts/AuthenticatedLayout';
import PageHeader from '../Components/PageHeader';
import StatusBadge from '../Components/StatusBadge';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const PRIORITY_DOT = {
    urgent: 'bg-red-500',
    high: 'bg-orange-500',
    medium: 'bg-blue-500',
    low: 'bg-gray-400',
};

const PRIORITY_PILL = {
    urgent: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    high: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
    medium: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    low: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-700/40 dark:text-gray-300 dark:border-gray-600',
};

const MAX_VISIBLE_TASKS = 3;

function TaskPill({ task }) {
    return (
        <Link
            href={`/projects/${task.project_id}/tasks/${task.id}/edit`}
            onClick={(e) => e.stopPropagation()}
            className={`block w-full text-left text-[11px] leading-tight px-1.5 py-0.5 rounded border truncate hover:opacity-80 transition-opacity ${PRIORITY_PILL[task.priority] || PRIORITY_PILL.low}`}
            title={`${task.title} (${task.project?.name || 'No project'})`}
        >
            {task.title}
        </Link>
    );
}

function DayCell({ date, tasks, isToday, isOutside, month, year }) {
    const visible = tasks.slice(0, MAX_VISIBLE_TASKS);
    const overflow = tasks.length - MAX_VISIBLE_TASKS;

    return (
        <div
            className={`min-h-[100px] border-t border-gray-200 dark:border-gray-700 p-1 ${
                isOutside ? 'bg-gray-50/50 dark:bg-gray-800/30' : 'bg-white dark:bg-gray-800'
            }`}
        >
            <div className="flex items-center justify-between mb-0.5">
                <span
                    className={`text-xs font-medium h-6 w-6 flex items-center justify-center rounded-full ${
                        isToday
                            ? 'bg-blue-600 text-white'
                            : isOutside
                                ? 'text-gray-400 dark:text-gray-600'
                                : 'text-gray-700 dark:text-gray-300'
                    }`}
                >
                    {date.getDate()}
                </span>
                {tasks.length > 0 && isOutside && (
                    <span className="flex gap-0.5">
                        {tasks.slice(0, 3).map((t) => (
                            <span key={t.id} className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[t.priority] || PRIORITY_DOT.low}`} />
                        ))}
                    </span>
                )}
            </div>
            {!isOutside && (
                <div className="space-y-0.5">
                    {visible.map((task) => (
                        <TaskPill key={task.id} task={task} />
                    ))}
                    {overflow > 0 && (
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 px-1">
                            +{overflow} more
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

export default function Calendar({ tasks, month, year }) {
    const [filterProject, setFilterProject] = useState('');
    const [filterPriority, setFilterPriority] = useState('');

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Extract unique projects for filter dropdown
    const projects = useMemo(() => {
        const map = new Map();
        tasks.forEach((t) => {
            if (t.project) map.set(t.project.id, t.project.name);
        });
        return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    }, [tasks]);

    // Filter tasks
    const filteredTasks = useMemo(() => {
        return tasks.filter((t) => {
            if (filterProject && t.project_id !== parseInt(filterProject)) return false;
            if (filterPriority && t.priority !== filterPriority) return false;
            return true;
        });
    }, [tasks, filterProject, filterPriority]);

    // Group tasks by date string
    const tasksByDate = useMemo(() => {
        const map = new Map();
        filteredTasks.forEach((t) => {
            const key = t.due_date?.split('T')[0];
            if (!key) return;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(t);
        });
        return map;
    }, [filteredTasks]);

    // Build calendar grid
    const weeks = useMemo(() => {
        const first = new Date(year, month - 1, 1);
        const startDay = first.getDay(); // 0=Sun
        const daysInMonth = new Date(year, month, 0).getDate();
        const daysInPrevMonth = new Date(year, month - 1, 0).getDate();

        const cells = [];

        // Previous month trailing days
        for (let i = startDay - 1; i >= 0; i--) {
            const d = daysInPrevMonth - i;
            const m = month === 1 ? 12 : month - 1;
            const y = month === 1 ? year - 1 : year;
            cells.push({
                date: new Date(y, m - 1, d),
                dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
                outside: true,
            });
        }

        // Current month
        for (let d = 1; d <= daysInMonth; d++) {
            cells.push({
                date: new Date(year, month - 1, d),
                dateStr: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
                outside: false,
            });
        }

        // Next month leading days
        const remaining = 7 - (cells.length % 7);
        if (remaining < 7) {
            const nm = month === 12 ? 1 : month + 1;
            const ny = month === 12 ? year + 1 : year;
            for (let d = 1; d <= remaining; d++) {
                cells.push({
                    date: new Date(ny, nm - 1, d),
                    dateStr: `${ny}-${String(nm).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
                    outside: true,
                });
            }
        }

        const rows = [];
        for (let i = 0; i < cells.length; i += 7) {
            rows.push(cells.slice(i, i + 7));
        }
        return rows;
    }, [month, year]);

    const goToPrev = () => {
        const m = month === 1 ? 12 : month - 1;
        const y = month === 1 ? year - 1 : year;
        router.get('/calendar', { month: m, year: y }, { preserveState: true });
    };

    const goToNext = () => {
        const m = month === 12 ? 1 : month + 1;
        const y = month === 12 ? year + 1 : year;
        router.get('/calendar', { month: m, year: y }, { preserveState: true });
    };

    const goToToday = () => {
        const now = new Date();
        router.get('/calendar', { month: now.getMonth() + 1, year: now.getFullYear() }, { preserveState: true });
    };

    const hasActiveFilters = filterProject || filterPriority;

    return (
        <AuthenticatedLayout title="Calendar">
            <PageHeader title="Calendar" />

            {/* Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                {/* Month navigation */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={goToPrev}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 min-w-[180px] text-center">
                        {MONTHS[month - 1]} {year}
                    </h2>
                    <button
                        onClick={goToNext}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                    <button
                        onClick={goToToday}
                        className="ml-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        Today
                    </button>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2">
                    {projects.length > 1 && (
                        <select
                            value={filterProject}
                            onChange={(e) => setFilterProject(e.target.value)}
                            className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        >
                            <option value="">All Projects</option>
                            {projects.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    )}
                    <select
                        value={filterPriority}
                        onChange={(e) => setFilterPriority(e.target.value)}
                        className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                        <option value="">All Priorities</option>
                        <option value="urgent">Urgent</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                    </select>
                    {hasActiveFilters && (
                        <button
                            onClick={() => { setFilterProject(''); setFilterPriority(''); }}
                            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Calendar grid */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
                <div className="min-w-[640px]">
                {/* Day headers */}
                <div className="grid grid-cols-7 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                    {DAYS.map((day) => (
                        <div key={day} className="px-2 py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Weeks */}
                {weeks.map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7 divide-x divide-gray-200 dark:divide-gray-700">
                        {week.map((cell) => (
                            <DayCell
                                key={cell.dateStr}
                                date={cell.date}
                                tasks={tasksByDate.get(cell.dateStr) || []}
                                isToday={cell.dateStr === todayStr}
                                isOutside={cell.outside}
                                month={month}
                                year={year}
                            />
                        ))}
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
        </AuthenticatedLayout>
    );
}
