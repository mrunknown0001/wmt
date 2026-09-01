/**
 * How much room is left in a field, next to whatever the field already says.
 *
 * Sits under the input with the help text, because that is where somebody looks
 * when they want to know what a field wants. The number counts down rather than
 * up: what matters while typing is how much is left, not how much has been used.
 *
 * This only reports. Stopping the typing is the input's own `maxLength` (or the
 * editor's limit), so the count can never disagree with what the field allows.
 *
 * @param used   characters already typed
 * @param limit  the field's maximum
 * @param help   the field's own help text, if it has any
 */
export default function CharacterCounter({ used = 0, limit, help = null, id = undefined }) {
    if (!limit) {
        return help
            ? <p className="mt-1 text-xs whitespace-pre-line text-gray-500 dark:text-gray-400">{help}</p>
            : null;
    }

    const left = Math.max(0, limit - used);
    const full = left === 0;
    // Warn while there is still time to do something about it. A tenth of the
    // limit reads as "getting close" on a 255-character line and on a 10,000
    // character one alike; the floor keeps it useful on very short fields.
    const nearlyFull = !full && left <= Math.max(10, Math.round(limit * 0.1));

    const tone = full
        ? 'text-red-600 dark:text-red-400 font-medium'
        : nearlyFull
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-gray-500 dark:text-gray-400';

    return (
        <div className="mt-1 flex items-start justify-between gap-3">
            {help
                ? <p className="text-xs whitespace-pre-line text-gray-500 dark:text-gray-400">{help}</p>
                : <span />}
            <span
                id={id}
                className={`shrink-0 text-xs tabular-nums ${tone}`}
                // Announced only once it matters. Reading a new number after
                // every keystroke would make a screen reader unusable.
                aria-live={full ? 'polite' : 'off'}
            >
                {full
                    ? 'Character limit reached'
                    : `${left.toLocaleString()} character${left === 1 ? '' : 's'} left`}
            </span>
        </div>
    );
}
