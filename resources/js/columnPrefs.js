/**
 * Per-project list-view column preferences, kept out of the component so the
 * one part with real edge cases — "hidden by default, but honour a later
 * choice" — can be tested without rendering the whole table.
 */

// Columns that exist but stay hidden until a user asks for them. Date Completed
// is only interesting once tasks are closed, so it does not clutter an
// in-progress project with a column of dashes. Completion % is derived from
// status and subtasks rather than entered, so it is a reporting view most
// projects will not want taking up width by default.
export const DEFAULT_HIDDEN_COLUMN_IDS = ['completed', 'completion'];

/**
 * The hidden-column set a project should open with.
 *
 * A column that ships hidden must start hidden even for someone whose saved
 * preference predates it — their saved set simply never mentioned it. So each
 * default is folded in once, the first time the list opens after that column
 * exists, and from then on the saved set is the whole truth so showing the
 * column sticks.
 *
 * `applied` is the record of which defaults have already had that one-time
 * fold-in. It has to be per column, not a single "have I run" flag: with a
 * boolean, adding a second default-hidden column would find the flag already
 * set from the first and never hide the new one. Accepts the legacy '1' written
 * when the flag *was* a boolean, which at that point meant only 'completed'.
 *
 * Pure on purpose. Returns the set to use, whether the caller must persist it,
 * and the new applied list — the localStorage writes stay in the component.
 *
 * @param {string[]|null}      saved    ids the user has hidden (null if never saved)
 * @param {string[]|string|null} applied defaults already folded in ('1' = legacy)
 * @param {string[]}           defaults columns hidden by default
 * @returns {{ hidden: string[], persist: boolean, applied: string[] }}
 */
export function initialHiddenColumns(saved, applied, defaults = DEFAULT_HIDDEN_COLUMN_IDS) {
    const set = new Set(saved || []);

    // '1' is what the old boolean flag wrote; back then 'completed' was the only
    // default, so that is exactly what it stands for.
    const already = new Set(
        applied === '1' || applied === true ? ['completed'] : (Array.isArray(applied) ? applied : []),
    );

    const pending = defaults.filter((id) => !already.has(id));

    if (pending.length === 0) {
        return { hidden: [...set], persist: false, applied: [...already] };
    }

    pending.forEach((id) => set.add(id));

    return { hidden: [...set], persist: true, applied: [...already, ...pending] };
}
