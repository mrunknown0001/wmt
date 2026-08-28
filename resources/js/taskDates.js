/**
 * Working out which of two picked dates is the start and which is the due date.
 *
 * A task's dates live in two fields, but people do not think in fields: they
 * pick a date, then pick another, and expect the pair to make sense. Two rules
 * come out of that, and the second is the one worth stating:
 *
 *   1. One date is a due date. Most tasks are wanted by a day rather than run
 *      between two, so a lone date lands in Due whichever box it was typed in.
 *
 *   2. A second date does not replace the first, it extends it. Picking again
 *      in Due pushes the date already there down into Start, so the pair
 *      becomes a span. Overwriting instead is the obvious implementation and
 *      quietly loses the date the person picked a moment earlier.
 *
 * The server enforces start <= due, so the pair is finally ordered by date. A
 * second pick that lands earlier than the first still reads as "these are my
 * two dates" — refusing it over which box received which would be pedantry.
 */

/**
 * Apply a change to one of the two date fields and return the resulting pair.
 *
 * Dates are plain YYYY-MM-DD strings, which sort correctly as text. Parsing
 * them into Date objects would invite timezones into a question that is only
 * ever about calendar days.
 *
 * @param {{start: string, due: string}} current  what the fields hold now
 * @param {'start'|'due'} field                   which one the person changed
 * @param {string} value                          its new value ('' when cleared)
 * @returns {{start: string, due: string}}
 */
export function pickTaskDate(current, field, value) {
    const prevStart = current.start || '';
    const prevDue = current.due || '';
    const next = value || '';

    if (field === 'due') {
        // Cleared: leave the start alone. Promoting it into Due would move a
        // value the person did not touch, in response to them emptying a field.
        if (!next) {
            return { start: prevStart, due: '' };
        }
        // A second date picked in Due, with Start still empty: the date already
        // there becomes the start rather than being overwritten.
        const start = (prevDue && !prevStart && prevDue !== next) ? prevDue : prevStart;
        return order(start, next);
    }

    // field === 'start'
    if (!next) {
        return { start: '', due: prevDue };
    }
    // A start date typed when there is no due yet is really a due date — see
    // rule 1. Otherwise it pairs with the due already present.
    if (!prevDue) {
        return { start: '', due: next };
    }
    return order(next, prevDue);
}

/** Earlier date starts the work, later one ends it. */
function order(a, z) {
    if (!a) return { start: '', due: z };
    if (!z) return { start: '', due: a };
    return a <= z ? { start: a, due: z } : { start: z, due: a };
}
