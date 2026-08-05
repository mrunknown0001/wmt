/**
 * Section hierarchy: display order, and where a dragged section lands.
 *
 * A project board is two lists, not one — the columns, and each column's
 * sub-sections. Both functions here are pure, which is why they live outside
 * the page component: the rules are fiddly enough to be worth testing on their
 * own, and a 4,000-line file is a poor place to read them.
 */

/** Local so this module stays free of the drag library. */
function arrayMove(list, from, to) {
    const next = [...list];
    next.splice(to < 0 ? next.length + to : to, 0, next.splice(from, 1)[0]);
    return next;
}

const isRoot = (section) => !section.parent_id;

/**
 * Sections in reading order: each column followed by its own sub-sections.
 *
 * The server keeps a position sequence per list, so a flat array sorted by
 * position interleaves the two. Each entry gains a `depth` for indenting.
 */
export function orderSections(sections) {
    const roots = sections.filter(isRoot);
    const rootIds = new Set(roots.map((r) => r.id));
    const out = [];

    roots.forEach((root) => {
        out.push({ ...root, depth: 0 });
        sections
            .filter((s) => s.parent_id === root.id)
            .forEach((child) => out.push({ ...child, depth: 1 }));
    });

    // A sub-section whose parent is missing would otherwise vanish along with
    // its tasks; it is shown at the top level rather than dropped.
    sections
        .filter((s) => s.parent_id && !rootIds.has(s.parent_id))
        .forEach((orphan) => out.push({ ...orphan, depth: 0 }));

    return out;
}

/**
 * Work out where a dragged section lands.
 *
 * A flat arrayMove over everything would happily drop a column into the middle
 * of another column's children, so each case is decided explicitly:
 *
 *  - column onto column          reorder the columns; children travel with them
 *  - sub-section onto a sibling  reorder within that column
 *  - sub-section onto another column, or one of its sub-sections
 *                                move it there, at the drop point
 *  - column onto a sub-section   refused — a column cannot become one, and the
 *                                server would reject it anyway
 *
 * @returns {{sections: Array, changed: Array}|null}
 *   the whole updated list plus only the rows whose position or parent moved,
 *   or null when the drag changes nothing.
 */
export function moveSection(sections, activeId, overId) {
    const active = sections.find((s) => s.id === activeId);
    const over = sections.find((s) => s.id === overId);

    if (!active || !over || active.id === over.id) return null;

    // Renumber one list and fold it back into the full set.
    const applyOrder = (ordered, parentId) => {
        const byId = new Map(
            ordered.map((s, index) => [s.id, { ...s, parent_id: parentId, position: index }])
        );

        return {
            sections: sections.map((s) => byId.get(s.id) ?? s),
            changed: [...byId.values()],
        };
    };

    if (isRoot(active)) {
        // A column cannot be filed under another column.
        if (!isRoot(over)) return null;

        const roots = sections.filter(isRoot);
        const from = roots.findIndex((s) => s.id === activeId);
        const to = roots.findIndex((s) => s.id === overId);

        if (from === -1 || to === -1 || from === to) return null;

        return applyOrder(arrayMove(roots, from, to), null);
    }

    // Dropped on a column joins the end of its sub-sections; dropped on a
    // sub-section takes that one's place.
    const targetParentId = isRoot(over) ? over.id : over.parent_id;
    const siblings = sections.filter((s) => s.parent_id === targetParentId && s.id !== activeId);
    const overIndex = siblings.findIndex((s) => s.id === overId);
    const insertAt = overIndex === -1 ? siblings.length : overIndex;

    const next = [...siblings];
    next.splice(insertAt, 0, active);

    // Same parent, same order — nothing actually moved.
    const before = sections.filter((s) => s.parent_id === targetParentId).map((s) => s.id).join();
    const after = next.map((s) => s.id).join();

    if (active.parent_id === targetParentId && before === after) return null;

    return applyOrder(next, targetParentId);
}
