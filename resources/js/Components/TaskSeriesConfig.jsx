/**
 * Optional reference numbering for a project's tasks, e.g. TASK-0001.
 *
 * Off by default. Once numbers have been issued the prefix is fixed, since
 * changing it would strand every number already quoted in a comment or email.
 * The server enforces that too — this only reflects it in the UI.
 */
export default function TaskSeriesConfig({
    enabled,
    prefix,
    padding,
    showColumn,
    onEnabledChange,
    onPrefixChange,
    onPaddingChange,
    onShowColumnChange,
    started = false,
    nextSequence = 1,
    taskCount = null,
    errors = {},
}) {
    const pad = Math.max(1, Math.min(10, Number(padding) || 4));
    const preview = `${prefix || ''}${String(nextSequence).padStart(pad, '0')}`;

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <label className="flex items-start gap-2 cursor-pointer">
                <input
                    type="checkbox"
                    checked={!!enabled}
                    onChange={(e) => onEnabledChange(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                />
                <span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Number the tasks in this project
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Gives every task its own reference, counting up as tasks are added.
                    </span>
                </span>
            </label>

            {enabled && (
                <div className="mt-4 pl-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="task_series_prefix" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Prefix <span className="font-normal text-gray-400">(optional)</span>
                            </label>
                            <input
                                id="task_series_prefix"
                                type="text"
                                value={prefix || ''}
                                onChange={(e) => onPrefixChange(e.target.value)}
                                disabled={started}
                                maxLength={20}
                                placeholder="TASK-"
                                className="block w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
                            />
                            {errors.task_series_prefix && (
                                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.task_series_prefix}</p>
                            )}
                        </div>

                        <div>
                            <label htmlFor="task_series_padding" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Number length
                            </label>
                            <input
                                id="task_series_padding"
                                type="number"
                                min={1}
                                max={10}
                                value={padding ?? 4}
                                onChange={(e) => onPaddingChange(e.target.value === '' ? '' : Number(e.target.value))}
                                className="block w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                            />
                            {errors.task_series_padding && (
                                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.task_series_padding}</p>
                            )}
                        </div>
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                        Next number will be{' '}
                        <span className="font-mono font-medium text-gray-700 dark:text-gray-200">{preview}</span>
                    </p>

                    {started ? (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                            The prefix is fixed now that numbering has started, so existing numbers
                            keep their meaning. Number length can still be changed — it only affects
                            numbers issued from now on.
                        </p>
                    ) : taskCount > 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            The {taskCount} {taskCount === 1 ? 'task' : 'tasks'} already in this project
                            will be numbered oldest first when you save.
                        </p>
                    ) : (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                            The prefix cannot be changed once the first number has been issued.
                        </p>
                    )}

                    <label className="flex items-start gap-2 cursor-pointer mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                        <input
                            type="checkbox"
                            checked={showColumn !== false}
                            onChange={(e) => onShowColumnChange(e.target.checked)}
                            className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                        />
                        <span>
                            <span className="text-sm text-gray-900 dark:text-gray-100">
                                Show a <span className="font-medium">Series</span> column in the task list
                            </span>
                            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                Applies to everyone on the project. Numbers still show on the task
                                card and detail panel either way, and stay searchable.
                            </span>
                        </span>
                    </label>
                </div>
            )}
        </div>
    );
}
