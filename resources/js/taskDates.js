/**
 * Working out which of two picked dates is the start and which is the due date.
 *
 * A task's dates are entered as two fields, but people do not think in fields:
 * they pick a date, then pick another, and expect the pair to make sense. The
 * server enforces start <= due, so picking them in the other order used to
 * bounce the whole form back with a validation error over what is really just
 * an ordering question the form can answer itself.
 *
 * One date is a due date. That is the common case — most tasks are "by Friday"
 * rather than "from Monday to Friday" — and it is why the due field is the one
 * always on screen.
 */

/**
 * Put a pair of dates in the right roles.
 *
 * Both are plain YYYY-MM-DD strings, which compare correctly as text, so no
 * Date objects are involved — parsing them would drag timezones into a question
 * that is purely about calendar days.
 *
 * @param {string} start   the value currently in the start field
 * @param {string} due     the value currently in the due field
 * @param {'start'|'due'} edited  which field the person just changed
 * @returns {{start: string, due: string}}
 */
export function orderTaskDates(start, due, edited = 'due') {
    const a = start || '';
    const z = due || '';

    // Only one date: it is the due date, whichever box it was typed into.
    // Someone entering a single date is saying when the work is wanted by.
    if (a && !z) {
        return edited === 'start' ? { start: '', due: a } : { start: a, due: '' };
    }
    if (!a && z) {
        return { start: '', due: z };
    }
    if (!a && !z) {
        return { start: '', due: '' };
    }

    // Two dates: the earlier one starts the work and the later one ends it,
    // regardless of which field received which. Swapping is what the person
    // meant; refusing is what the server would otherwise do.
    return a <= z ? { start: a, due: z } : { start: z, due: a };
}

/**
 * Whether the start field should be on screen, given the values.
 * A start date that exists must be visible, or it is edited by nobody and
 * saved by everybody.
 */
export function shouldShowStartDate(start) {
    return !!start;
}
