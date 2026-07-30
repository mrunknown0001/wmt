import Tooltip from './Tooltip';

/**
 * Escalation for a project's overdue tasks.
 *
 * Either the organisation-wide tiers or the project's own ladder — never a
 * blend. Two systems escalating the same lateness under different labels is
 * worse than one, so switching the toggle swaps the whole mechanism.
 */

const UNITS = [
    { value: 'days', label: 'day(s) after the due date' },
    { value: 'hours', label: 'hour(s) after the due time' },
];

const blankRule = () => ({
    name: '',
    offset_unit: 'days',
    offset_value: 1,
    recipients: ['assignee'],
    is_active: true,
});

export default function ProjectEscalationSettings({
    useGlobal,
    onUseGlobalChange,
    rules = [],
    onRulesChange,
    recipientOptions = {},
    globalEscalation = null,
    errors = {},
}) {
    const setRule = (index, patch) =>
        onRulesChange(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));

    const toggleRecipient = (index, key) => {
        const current = rules[index].recipients || [];
        setRule(index, {
            recipients: current.includes(key)
                ? current.filter((k) => k !== key)
                : [...current, key],
        });
    };

    const move = (index, delta) => {
        const target = index + delta;
        if (target < 0 || target >= rules.length) return;
        const next = [...rules];
        [next[index], next[target]] = [next[target], next[index]];
        onRulesChange(next);
    };

    return (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Overdue Escalation</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-3">
                Who gets told when a task in this project runs past its due date.
            </p>

            <label className="flex items-start gap-2 cursor-pointer">
                <input
                    type="checkbox"
                    checked={useGlobal !== false}
                    onChange={(e) => onUseGlobalChange(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                />
                <span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Use the global escalation rules
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        The organisation-wide tiers set in admin settings.
                    </span>
                </span>
            </label>

            {/* Spelling out what the global tiers do, so the choice can be made
                without opening admin settings in another tab. */}
            {useGlobal !== false && globalEscalation && (
                <div className="mt-3 pl-6">
                    {!globalEscalation.enabled ? (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                            Global escalation is currently switched off, so tasks in this
                            project will not escalate at all. Untick the box above to set
                            up rules just for this project.
                        </p>
                    ) : (
                        <ul className="space-y-1">
                            {globalEscalation.tiers.map((tier, i) => (
                                <li key={i} className={`text-xs ${tier.enabled ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 line-through'}`}>
                                    <span className="font-medium">{tier.days} day{tier.days === 1 ? '' : 's'} overdue</span>
                                    {' — '}{tier.label}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {useGlobal === false && (
                <div className="mt-4 pl-6 space-y-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Rules fire in order, and a task only ever moves up the list — reaching
                        the third rung will not re-fire the first two.
                    </p>

                    {rules.length === 0 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                            No rules yet — tasks in this project will not escalate until you add one.
                        </p>
                    )}

                    {rules.map((rule, index) => (
                        <div key={index} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="shrink-0 h-5 w-5 rounded-full bg-gray-100 dark:bg-gray-700 text-[11px] font-medium text-gray-600 dark:text-gray-300 flex items-center justify-center">
                                    {index + 1}
                                </span>
                                <input
                                    type="text"
                                    value={rule.name}
                                    onChange={(e) => setRule(index, { name: e.target.value })}
                                    placeholder="What this step is called, e.g. Shift lead"
                                    maxLength={80}
                                    className="flex-1 min-w-0 rounded-lg border px-3 py-1.5 text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                                />
                                <Tooltip content="Move up">
                                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0}
                                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                                        </svg>
                                    </button>
                                </Tooltip>
                                <Tooltip content="Move down">
                                    <button type="button" onClick={() => move(index, 1)} disabled={index === rules.length - 1}
                                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                </Tooltip>
                                <Tooltip content="Remove step">
                                    <button type="button" onClick={() => onRulesChange(rules.filter((_, i) => i !== index))}
                                        className="p-1 text-gray-400 hover:text-red-500">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </Tooltip>
                            </div>
                            {errors[`escalation_rules.${index}.name`] && (
                                <p className="text-sm text-red-600 dark:text-red-400">{errors[`escalation_rules.${index}.name`]}</p>
                            )}

                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 dark:text-gray-400">Trigger</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={rule.offset_unit === 'hours' ? 8760 : 365}
                                    value={rule.offset_value}
                                    onChange={(e) => setRule(index, { offset_value: Number(e.target.value) || 0 })}
                                    className="w-20 rounded-lg border px-2 py-1.5 text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                                />
                                <select
                                    value={rule.offset_unit}
                                    onChange={(e) => setRule(index, { offset_unit: e.target.value })}
                                    className="flex-1 min-w-0 rounded-lg border px-2 py-1.5 text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                                >
                                    {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                                </select>
                            </div>

                            {/* The two units measure from different points, and that
                                difference is the whole reason both exist. */}
                            <p className="text-[11px] text-gray-400">
                                {rule.offset_unit === 'hours'
                                    ? 'Counted from the task’s due time. Tasks with no due time are treated as due at the end of the day.'
                                    : 'Counted in whole days from the due date, the same way the global tiers work.'}
                            </p>

                            <div>
                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Notify</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {Object.entries(recipientOptions).map(([key, label]) => {
                                        const active = (rule.recipients || []).includes(key);
                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => toggleRecipient(index, key)}
                                                aria-pressed={active}
                                                className={`px-2 py-1 rounded-md text-xs border transition-colors ${
                                                    active
                                                        ? 'bg-primary-50 border-primary-400 text-primary-700 dark:bg-primary-900/30 dark:border-primary-500 dark:text-primary-300'
                                                        : 'border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:text-gray-400'
                                                }`}
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                                {errors[`escalation_rules.${index}.recipients`] && (
                                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors[`escalation_rules.${index}.recipients`]}</p>
                                )}
                            </div>

                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={rule.is_active !== false}
                                    onChange={(e) => setRule(index, { is_active: e.target.checked })}
                                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-xs text-gray-600 dark:text-gray-400">Active</span>
                            </label>
                        </div>
                    ))}

                    {rules.length < 10 && (
                        <button
                            type="button"
                            onClick={() => onRulesChange([...rules, blankRule()])}
                            className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                        >
                            + Add escalation step
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
