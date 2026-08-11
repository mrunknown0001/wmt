/**
 * Per-project list-view column preferences, kept out of the component so the
 * one part with real edge cases — "hidden by default, but honour a later
 * choice" — can be tested without rendering the whole table.
 */

// Columns that exist but stay hidden until a user asks for them. Date Completed
// is only interesting once tasks are closed, so it does not clutter an
// in-progress project with a column of dashes.
export const DEFAULT_HIDDEN_COLUMN_IDS = ['completed'];

/**
 * The hidden-column set a project should open with.
 *
 * A column that ships hidden must start hidden even for someone whose saved
 * preference predates it — their saved set simply never mentioned it. A
 * one-time, per-project migration handles that: the first time the list opens
 * after the column exists, the defaults are folded in; from then on the saved
 * set is the whole truth, so showing the column sticks.
 *
 * Pure on purpose. Returns the set to use and whether the caller must persist
 * it and record that the migration has run — the localStorage writes stay in
 * the component, the decision lives here.
 *
 * @param {string[]|null} saved       ids the user has hidden (null if never saved)
 * @param {boolean}       migrated    has the default-hidden migration already run
 * @param {string[]}      defaults    columns hidden by default
 * @returns {{ hidden: string[], persist: boolean }}
 */
export function initialHiddenColumns(saved, migrated, defaults = DEFAULT_HIDDEN_COLUMN_IDS) {
    const set = new Set(saved || []);

    if (migrated) {
        return { hidden: [...set], persist: false };
    }

    defaults.forEach((id) => set.add(id));
    return { hidden: [...set], persist: true };
}
