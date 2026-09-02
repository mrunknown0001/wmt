/**
 * Put the cursor where a form needs attention.
 *
 * A form that comes back with "this field is required" and leaves you where you
 * were is a form you have to search. That is worst exactly where it hurts most:
 * a long public form, on a phone, where the offending question may be several
 * screens away.
 *
 * Everything here works on ids the form already gives its fields:
 *   field-{id}       the control itself, where there is a single one
 *   field-wrap-{id}  the block around it, for the questions that are a group of
 *                    checkboxes or a file picker rather than one input
 */

/** Whether an element can take focus. */
const focusable = (el) => el
    && !el.disabled
    && el.offsetParent !== null
    && typeof el.focus === 'function';

const firstControlIn = (wrapper) => wrapper?.querySelector(
    'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], button:not([disabled])'
);

/**
 * Scroll one field into view and focus it.
 *
 * @param  fieldId  the question's id
 * @return true when something was actually focused
 */
export function focusField(fieldId) {
    const control = document.getElementById(`field-${fieldId}`);
    const wrapper = document.getElementById(`field-wrap-${fieldId}`);
    const target = focusable(control) ? control : firstControlIn(wrapper);
    const scrollTo = target || wrapper;

    if (!scrollTo) {
        return false;
    }

    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    scrollTo.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });

    if (!target) {
        return false;
    }

    // preventScroll, because the smooth scroll above is already on its way and
    // focus would otherwise jump the page to the field instantly and undo it.
    target.focus({ preventScroll: true });

    return true;
}

/**
 * Focus the first field with a problem, in the order the form asks them.
 *
 * Order comes from the caller rather than from the error object: the server
 * answers with a bag of keys, and sending somebody to whichever one happened to
 * be first in it would feel arbitrary.
 *
 * @param  fieldIds  every field's id, in form order
 * @param  hasError  tells whether that field is one of the problems
 */
export function focusFirstError(fieldIds, hasError) {
    const first = fieldIds.find((id) => hasError(id));

    if (first === undefined) {
        return false;
    }

    // After the error state has painted, or the field is not on the page yet.
    requestAnimationFrame(() => focusField(first));

    return true;
}

/**
 * Focus the first field a server refused, on any page.
 *
 * The public forms know their own field order and say so. Everywhere else —
 * task forms, project settings, the user admin — the page just hands Inertia a
 * bag of errors keyed by field name, so the order is taken from the document:
 * whichever offending field appears first is the one somebody scrolls to.
 *
 * Nothing is stolen from a field already being corrected: if the person is
 * standing on one of the offending fields, they stay there.
 *
 * @param errors  Inertia's error bag, keyed by field name
 */
export function focusFirstErrorField(errors) {
    const keys = Object.keys(errors || {});

    if (keys.length === 0) {
        return false;
    }

    const escape = (value) => (window.CSS?.escape ? window.CSS.escape(value) : value);

    const elements = keys
        .map((key) => document.getElementById(key)
            || document.querySelector(`[name="${escape(key)}"]`)
            || document.getElementById(`field-${key}`))
        // A field on a tab nobody has opened has no box to scroll to.
        .filter((el) => el && el.offsetParent !== null);

    if (elements.length === 0) {
        return false;
    }

    if (elements.includes(document.activeElement)) {
        return false;
    }

    const first = elements.reduce((earliest, el) => (
        earliest.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING ? el : earliest
    ));

    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    first.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
    first.focus({ preventScroll: true });

    return true;
}
