/**
 * Deadlines for this project's approval steps.
 *
 * Nothing here ever decides an approval. A passed deadline raises the
 * request's visibility — first with the approvers, then with the people who own
 * the process. Auto-approving on a timeout would turn an unanswered request
 * into an authorised one.
 */
export default function ApprovalSlaSettings({
    defaultHours,
    reminderHours,
    escalateAfterHours,
    onDefaultChange,
    onReminderChange,
    onEscalateChange,
    errors = {},
}) {
    const enabled = defaultHours != null && defaultHours !== '';

    const field = (id, label, value, onChange, hint, error) => (
        <div>
            <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {label}
            </label>
            <input
                id={id}
                type="number"
                min={1}
                max={8760}
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
                className="block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
            {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
    );

    return (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Approval Deadlines</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-3">
                How long each step has, and what happens when it runs out. Leave the deadline
                blank for no time limit, which is how this project behaves today.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {field(
                    'default_sla_hours', 'Step deadline (hours)',
                    defaultHours, onDefaultChange,
                    'Counted from when a step becomes active. A chain step can override it.',
                    errors.default_sla_hours,
                )}
                {field(
                    'sla_reminder_hours', 'Remind before (hours)',
                    reminderHours, onReminderChange,
                    'Nudges the approvers this long before the deadline.',
                    errors.sla_reminder_hours,
                )}
                {field(
                    'sla_escalate_after_hours', 'Escalate after (hours)',
                    escalateAfterHours, onEscalateChange,
                    'Tells the project owner and admins this long past the deadline. 0 means straight away.',
                    errors.sla_escalate_after_hours,
                )}
            </div>

            {!enabled && (reminderHours != null || escalateAfterHours != null) && (
                <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                    Reminders and escalation need a deadline to count from. Without a step deadline
                    here — or one on every chain step — neither will fire.
                </p>
            )}

            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                A missed deadline never approves or rejects anything on its own; it only raises who
                gets told.
            </p>
        </div>
    );
}
