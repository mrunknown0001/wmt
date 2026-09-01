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
