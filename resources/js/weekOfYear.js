/**
 * Week of Year custom fields are derived, not entered: the field definition
 * names a date to follow (a built-in task date, or another date custom field)
 * and the week is computed from whatever that date currently holds.
 *
 * Single source of truth for the ISO week maths, which is easy to get subtly
 * wrong at year boundaries — see the year-boundary cases in the tests.
 */

/** ISO-8601 week and week-year, matching Carbon's isoWeek()/isoWeekYear(). */
export function isoWeekParts(dateStr) {
    if (!dateStr) return null;

    const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return null;

    // Shift to the Thursday of this week: the ISO week-year is whichever
    // calendar year that Thursday falls in.
    const thursday = new Date(d.getTime());
    thursday.setDate(thursday.getDate() - ((d.getDay() + 6) % 7) + 3);

    const isoYear = thursday.getFullYear();

    // Week 1 is the week holding the first Thursday of the ISO year.
    const firstThursday = new Date(isoYear, 0, 4);
    firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);

    const week = 1 + Math.round((thursday - firstThursday) / 604800000);

    return { week, year: isoYear };
}

/** "Week 31, 2026", or null when there is no usable date. */
export function formatIsoWeek(dateStr) {
    const parts = isoWeekParts(dateStr);
    return parts ? `Week ${parts.week}, ${parts.year}` : null;
}

/**
 * The date a Week of Year field follows. `reference_field` is either the name of
 * a built-in date column ("due_date") or "cf:<id>" pointing at a date custom
 * field on the same record.
 */
export function resolveReferenceDate(record, config) {
    const ref = config?.reference_field;
    if (!ref || !record) return null;

    if (String(ref).startsWith('cf:')) {
        const id = Number(String(ref).slice(3));
        const values = record.custom_field_values || [];
        return values.find((v) => Number(v.custom_field_id) === id)?.value_date || null;
    }

    return record[ref] || null;
}

/** Computed label for a Week of Year field on a given record. */
export function weekOfYearLabel(record, config) {
    return formatIsoWeek(resolveReferenceDate(record, config));
}

/**
 * Date fields a Week of Year field may follow: the built-ins the host page
 * offers, plus every date custom field defined alongside it. `selfId` keeps a
 * field from referencing itself.
 */
export function dateSourceOptions(builtIns = [], customFields = [], selfId = null) {
    const custom = (customFields || [])
        .filter((f) => f.type === 'date' && f.id !== selfId)
        .map((f) => ({ value: `cf:${f.id}`, label: f.name }));

    return [...builtIns, ...custom];
}
