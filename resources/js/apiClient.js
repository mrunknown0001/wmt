// Extension spelled out so plain Node can import this for tests, not only Vite.
import { apiFetch, toast, errorMessageFrom } from './utils.js';

/**
 * A JSON API call that speaks up when it fails.
 *
 * The app had four different ways of handling a failed save — a toast here, a
 * blocked-message banner there, a silent console.error somewhere else, and in a
 * few places nothing at all. Same class of operation, four behaviours, and only
 * one of them told the user why. This is the one that told them why, made
 * shared.
 *
 * Returns a plain result — never throws for an HTTP error — so a caller with an
 * optimistic update can roll it back on `!ok` without a try/catch:
 *
 *   const { ok, data, error } = await request(url, { method: 'POST', body });
 *   if (!ok) { rollback(); return; }        // the toast has already fired
 *   apply(data);
 *
 * `error` carries `{ message, reference, status, errors }` for callers that
 * want to branch on a validation field or show the support reference inline.
 * A network failure (the fetch itself rejecting) comes back as status 0.
 *
 * @param {string} url
 * @param {RequestInit} options
 * @param {{ toastOnError?: boolean, fallback?: string }} [opts]
 * @returns {Promise<{ ok: boolean, status: number, data: any, error: null | { message: string, reference?: string, status: number, errors?: object, network?: boolean } }>}
 */
export async function request(url, options = {}, { toastOnError = true, fallback } = {}) {
    let response;
    try {
        response = await apiFetch(url, options);
    } catch {
        // fetch only rejects when the request never completed — offline, DNS,
        // a dropped connection. There is no response to read a message from.
        const message = 'Could not reach the server. Check your connection and try again.';
        if (toastOnError) toast(message);
        return { ok: false, status: 0, data: null, error: { message, status: 0, network: true } };
    }

    // Some endpoints answer 204, or HTML on an unexpected fault; tolerate both.
    let data = null;
    try { data = await response.clone().json(); } catch {}

    if (!response.ok) {
        const message = await errorMessageFrom(response, fallback);
        if (toastOnError) toast(message);
        return {
            ok: false,
            status: response.status,
            data,
            error: { message, reference: data?.reference, status: response.status, errors: data?.errors },
        };
    }

    return { ok: true, status: response.status, data, error: null };
}

/**
 * Same call, but a success worth announcing.
 *
 * A quiet save is right for an inline edit, but a create or a destructive
 * action reads better with a confirmation. `successMessage` is shown only on
 * ok; errors behave exactly as `request`.
 */
export async function mutate(url, options = {}, { successMessage, ...rest } = {}) {
    const result = await request(url, options, rest);
    if (result.ok && successMessage) toast(successMessage, 'success');
    return result;
}
