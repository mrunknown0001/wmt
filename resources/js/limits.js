/**
 * Limits the server enforces, named once so a field and its counter cannot
 * drift from what will actually be accepted.
 *
 * Each is mirrored by a validation rule; changing one here without changing the
 * rule turns the counter into a promise the server will not keep.
 */

/** Task and approval comments. See StoreTaskCommentRequest and its siblings. */
export const COMMENT_LIMIT = 2000;

/**
 * The form builder. Mirrored by StoreFormRequest and UpdateFormRequest.
 */
export const FORM_LIMITS = {
    name: 255,
    submitButtonText: 255,
    description: 5000,
    successMessage: 5000,
    fieldLabel: 255,
    fieldHelpText: 1000,
};
