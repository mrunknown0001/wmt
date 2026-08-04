import { formatMinutes } from '../utils';

/**
 * How much this person can absorb, and on which days.
 *
 * Feeds the Workload view. Kept per person because part-time hours and weekend
 * shifts are ordinary in a warehouse — a single org-wide number would make
 * every capacity figure wrong for anyone who doesn't work a standard week.
 */

// ISO weekdays, matching Carbon's isoWeekday() on the server.
const WEEKDAYS = [
    { value: 1, short: 'Mon' },
    { value: 2, short: 'Tue' },
    { value: 3, short: 'Wed' },
    { value: 4, short: 'Thu' },
    { value: 5, short: 'Fri' },
    { value: 6, short: 'Sat' },
    { value: 7, short: 'Sun' },
];

const DEFAULT_DAYS = [1, 2, 3, 4, 5];

export default function CapacitySettings({ minutes, workingDays, onMinutesChange, onWorkingDaysChange, errors = {} }) {
    // Null means "not set", which the server reads as Mon-Fri. Showing the
    // default as ticked makes that visible instead of leaving the row blank.
    const days = workingDays?.length ? workingDays.map(Number) : DEFAULT_DAYS;
    const hours = minutes != null ? minutes / 60 : 8;

    const toggleDay = (day) => {
        const next = days.includes(day)
            ? days.filter((d) => d !== day)
            : [...days, day].sort((a, b) => a - b);

        // Never leave someone with no working days — capacity would be zero
        // every day and their whole row would read as over-committed.
        onWorkingDaysChange(next.length ? next : DEFAULT_DAYS);
    };

    const weeklyMinutes = Math.round((minutes ?? 480) * days.length);

    return (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Capacity</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-3">
                Used by the Workload view to show whether this person is over-committed.
            </p>

            <div className="w-40">
                <label htmlFor="daily_capacity_hours" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Hours per day
                </label>
                <input
                    id="daily_capacity_hours"
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    value={hours}
                    onChange={(e) => {
                        const v = e.target.value;
                        if (v === '') return onMinutesChange(null);
                        onMinutesChange(Math.max(0, Math.min(24, Number(v))) * 60);
                    }}
                    className="block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
                {errors.daily_capacity_minutes && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.daily_capacity_minutes}</p>
                )}
            </div>

            <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Working days
                </label>
                <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((d) => {
                        const active = days.includes(d.value);
                        return (
                            <button
                                key={d.value}
                                type="button"
                                onClick={() => toggleDay(d.value)}
                                aria-pressed={active}
                                className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                                    active
                                        ? 'bg-primary-50 border-primary-400 text-primary-700 dark:bg-primary-900/30 dark:border-primary-500 dark:text-primary-300'
                                        : 'border-gray-300 text-gray-500 hover:border-gray-400 dark:border-gray-600 dark:text-gray-400'
                                }`}
                            >
                                {d.short}
                            </button>
                        );
                    })}
                </div>
                {errors.working_days && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.working_days}</p>
                )}
            </div>

            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                {formatMinutes(weeklyMinutes)} a week across {days.length} {days.length === 1 ? 'day' : 'days'}.
                Days not selected show no capacity in the Workload view.
            </p>
        </div>
    );
}
