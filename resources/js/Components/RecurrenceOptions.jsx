import Select from './Select';

/**
 * The variance controls for a recurrence — the part beyond "every N days".
 *
 * Weekly can pick specific weekdays; monthly can repeat on a date, on the last
 * day, or on an ordinal weekday ("2nd Tuesday"). Anything not configured here
 * falls back to the plain interval behaviour, so a task saved before these
 * options existed keeps working exactly as it did.
 */

// ISO weekdays — 1 is Monday, matching Carbon's isoWeekday() on the server.
const WEEKDAYS = [
    { value: 1, short: 'Mon', label: 'Monday' },
    { value: 2, short: 'Tue', label: 'Tuesday' },
    { value: 3, short: 'Wed', label: 'Wednesday' },
    { value: 4, short: 'Thu', label: 'Thursday' },
    { value: 5, short: 'Fri', label: 'Friday' },
    { value: 6, short: 'Sat', label: 'Saturday' },
    { value: 7, short: 'Sun', label: 'Sunday' },
];

const MONTHLY_MODES = [
    { value: '', label: 'Same date each month' },
    { value: 'day_of_month', label: 'On a specific date' },
    { value: 'last_day', label: 'On the last day of the month' },
    { value: 'nth_weekday', label: 'On a weekday of the month' },
];

const WEEK_ORDINALS = [
    { value: 1, label: 'First' },
    { value: 2, label: 'Second' },
    { value: 3, label: 'Third' },
    { value: 4, label: 'Fourth' },
    { value: 5, label: 'Fifth' },
    { value: -1, label: 'Last' },
];

const ordinalLabel = (n) => WEEK_ORDINALS.find((w) => w.value === Number(n))?.label ?? 'First';
const weekdayLabel = (n) => WEEKDAYS.find((d) => d.value === Number(n))?.label ?? 'Monday';

/** Plain-English summary so the choice can be checked without saving. */
function describe(frequency, interval, config) {
    const every = Number(interval) > 1 ? `every ${interval} ` : 'every ';

    if (frequency === 'weekly') {
        const days = (config?.days ?? []).map(Number).sort((a, b) => a - b);
        if (!days.length) return `Repeats ${every}week${Number(interval) > 1 ? 's' : ''}`;
        const names = days.map((d) => WEEKDAYS.find((w) => w.value === d)?.short).filter(Boolean);
        return `Repeats ${every}week${Number(interval) > 1 ? 's' : ''} on ${names.join(', ')}`;
    }

    if (frequency === 'monthly') {
        const unit = `${every}month${Number(interval) > 1 ? 's' : ''}`;
        switch (config?.mode) {
            case 'last_day':
                return `Repeats ${unit} on the last day`;
            case 'day_of_month':
                return `Repeats ${unit} on day ${config.day ?? 1}`;
            case 'nth_weekday':
                return `Repeats ${unit} on the ${ordinalLabel(config.week).toLowerCase()} ${weekdayLabel(config.weekday)}`;
            default:
                return `Repeats ${unit} on the same date`;
        }
    }

    return null;
}

export default function RecurrenceOptions({ frequency, interval, config, onChange, errors = {} }) {
    const cfg = config ?? {};
    const set = (patch) => onChange({ ...cfg, ...patch });

    const selectedDays = (cfg.days ?? []).map(Number);

    const toggleDay = (day) => {
        const next = selectedDays.includes(day)
            ? selectedDays.filter((d) => d !== day)
            : [...selectedDays, day].sort((a, b) => a - b);
        set({ days: next });
    };

    const summary = describe(frequency, interval, cfg);

    return (
        <div className="mt-3 space-y-3">
            {frequency === 'weekly' && (
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        On these days <span className="font-normal text-gray-400">(optional)</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                        {WEEKDAYS.map((d) => {
                            const active = selectedDays.includes(d.value);
                            return (
                                <button
                                    key={d.value}
                                    type="button"
                                    onClick={() => toggleDay(d.value)}
                                    aria-pressed={active}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                                        active
                                            ? 'bg-primary-600 border-primary-600 text-white'
                                            : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    {d.short}
                                </button>
                            );
                        })}
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Leave all unselected to repeat on the same weekday as the due date.
                    </p>
                </div>
            )}

            {frequency === 'monthly' && (
                <div className="space-y-3">
                    <Select
                        label="Repeat"
                        id="recurrence_monthly_mode"
                        value={cfg.mode ?? ''}
                        onChange={(e) => {
                            const mode = e.target.value;
                            // Drop the other modes' parameters so a stale day or
                            // weekday can't be read by the mode now in force.
                            if (!mode) return onChange(null);
                            if (mode === 'last_day') return onChange({ mode });
                            if (mode === 'day_of_month') return onChange({ mode, day: cfg.day ?? 1 });
                            return onChange({ mode, week: cfg.week ?? 1, weekday: cfg.weekday ?? 1 });
                        }}
                        options={MONTHLY_MODES}
                        error={errors['recurrence_config.mode']}
                    />

                    {cfg.mode === 'day_of_month' && (
                        <div className="w-40">
                            <label htmlFor="recurrence_day" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Day of the month
                            </label>
                            <input
                                id="recurrence_day"
                                type="number"
                                min={1}
                                max={31}
                                value={cfg.day ?? 1}
                                onChange={(e) => set({ day: Math.max(1, Math.min(31, Number(e.target.value) || 1)) })}
                                className="block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                            />
                            {Number(cfg.day) > 28 && (
                                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                                    Shorter months use their last day instead.
                                </p>
                            )}
                        </div>
                    )}

                    {cfg.mode === 'nth_weekday' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Select
                                label="Which"
                                id="recurrence_week"
                                value={String(cfg.week ?? 1)}
                                onChange={(e) => set({ week: Number(e.target.value) })}
                                options={WEEK_ORDINALS.map((w) => ({ value: String(w.value), label: w.label }))}
                            />
                            <Select
                                label="Weekday"
                                id="recurrence_weekday"
                                value={String(cfg.weekday ?? 1)}
                                onChange={(e) => set({ weekday: Number(e.target.value) })}
                                options={WEEKDAYS.map((d) => ({ value: String(d.value), label: d.label }))}
                            />
                            {Number(cfg.week) === 5 && (
                                <p className="sm:col-span-2 text-xs text-amber-600 dark:text-amber-400">
                                    Months without a fifth occurrence use the last one.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {summary && (
                <p className="text-xs font-medium text-gray-600 dark:text-gray-300">{summary}</p>
            )}
        </div>
    );
}
