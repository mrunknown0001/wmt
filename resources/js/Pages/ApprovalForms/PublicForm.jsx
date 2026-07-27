import { useState, useRef, useCallback } from 'react';
import { Head } from '@inertiajs/react';
import TurnstileWidget from '../../Components/TurnstileWidget';

const NUMBER_MIN = -99999999999;
const NUMBER_MAX = 99999999999;

// Hard-clamp a number field value so typed/pasted out-of-range input snaps back
// into range. Preserves partial input ('', '-') and non-numeric strings (the
// server rule catches those) so the field stays editable while being bounded.
function clampNumber(v) {
    if (v === '' || v === '-') return v;
    const n = Number(v);
    if (Number.isNaN(n)) return v;
    if (n > NUMBER_MAX) return String(NUMBER_MAX);
    if (n < NUMBER_MIN) return String(NUMBER_MIN);
    return v;
}

export default function PublicForm({ form, fields, turnstile, csrf_token }) {
    const formRef = useRef(null);
    const [processing, setProcessing] = useState(false);
    const [errors, setErrors] = useState({});
    const [formErrors, setFormErrors] = useState('');
    const [turnstileToken, setTurnstileToken] = useState('');

    const handleTurnstileVerify = useCallback((token) => setTurnstileToken(token), []);
    const handleTurnstileExpire = useCallback(() => setTurnstileToken(''), []);

    // Reject oversized files at selection so the user isn't left waiting for a
    // failed upload. Caps mirror the server: 100MB video, 50MB otherwise.
    const checkFileSize = (e, field) => {
        const maxMb = field.type === 'capture_video' ? 100 : 50;
        const tooBig = Array.from(e.target.files).filter((f) => f.size > maxMb * 1024 * 1024);
        if (tooBig.length) {
            setErrors((prev) => ({ ...prev, [`field_${field.id}`]: [`Each file must be ${maxMb}MB or smaller.`] }));
            e.target.value = '';
        } else {
            setErrors((prev) => {
                const next = { ...prev };
                delete next[`field_${field.id}`];
                return next;
            });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Clear previous errors
        setErrors({});
        setFormErrors('');

        if (turnstile.enabled && !turnstileToken) {
            setFormErrors('Please verify that you are not a robot');
            return;
        }

        setProcessing(true);

        try {
            // Collect form data
            const formData = new FormData(formRef.current);

            // The widget renders outside the <form>, so its token isn't picked up
            // by FormData automatically. Name it as the server rule expects.
            if (turnstile.enabled) {
                formData.append('cf_turnstile_response', turnstileToken);
            }

            // Build URL directly
            const submitUrl = `/forms-approval/${form.uuid}`;
            console.log('Submitting to:', submitUrl);

            // Submit via fetch. Declare that we expect JSON so Laravel returns a
            // 422 with validation errors instead of a 302 redirect-back (which
            // fetch would follow into a 200 and misread as a successful submit).
            const response = await fetch(submitUrl, {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
            });

            console.log('Response status:', response.status, 'Final URL:', response.url, 'Content-Type:', response.headers.get('content-type'));

            // Clone response for reading
            const contentType = response.headers.get('content-type');
            let responseData;

            // Try to parse as JSON if it looks like JSON
            if (contentType && contentType.includes('application/json')) {
                responseData = await response.json();
            } else {
                responseData = await response.text();
            }

            console.log('Response data:', responseData);

            // Handle validation errors (422)
            if (response.status === 422) {
                console.log('Validation error detected, errors:', responseData?.errors);
                if (responseData?.errors) {
                    setErrors(responseData.errors);
                    // Surface non-field errors (e.g. the 'form' key) in the top banner
                    // so they aren't silently dropped by the per-field display.
                    if (responseData.errors.form) {
                        setFormErrors(responseData.errors.form[0]);
                    }
                    window.scrollTo(0, 0);
                    setProcessing(false);
                    return;
                } else {
                    setFormErrors('Validation failed. Please check your entries and try again.');
                    setProcessing(false);
                    return;
                }
            }

            // Any 2xx is a success — the submit endpoint returns 201 Created, so
            // matching on 200 alone reported a false error on a saved request.
            if (response.ok) {
                // Use window.location to properly initialize Inertia on the success page
                window.location.href = `/forms-approval/${form.uuid}/success`;
                return;
            }

            // Handle other errors
            console.error('Unexpected response status:', response.status, 'Response:', responseData);
            setFormErrors('An error occurred while submitting the form. Please try again.');
        } catch (error) {
            console.error('Form submission error:', error);
            setFormErrors('An error occurred while submitting the form. Please try again.');
        } finally {
            setProcessing(false);
        }
    };

    // Server-side validation errors arrive as { field_7: ['message', ...] }.
    // These helpers drive the red border + inline message for every field type.
    const fieldError = (id) => errors[`field_${id}`]?.[0];
    const inputClasses = (id) =>
        `w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            fieldError(id)
                ? 'border-red-500 dark:border-red-500'
                : 'border-gray-300 dark:border-gray-600'
        }`;
    const renderFieldError = (id) =>
        fieldError(id) ? (
            <p className="text-red-600 dark:text-red-400 text-sm mt-1">{fieldError(id)}</p>
        ) : null;

    return (
        <>
            <Head title={form.name} />
            {/* h-screen + overflow-y-auto: html/body are overflow:hidden globally (the
                app shell scrolls its own inner container), so a public page needs to
                provide the scroll container itself or long forms get clipped. */}
            <div className="h-screen overflow-y-auto bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
                <div className="max-w-2xl mx-auto">
                    {/* Form Header */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 mb-8">
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                            {form.name}
                        </h1>
                        {form.description && (
                            <p className="text-gray-600 dark:text-gray-400 mt-2">
                                {form.description}
                            </p>
                        )}
                    </div>

                    {/* Form */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
                        {/* General Form Error */}
                        {formErrors && (
                            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg">
                                <p className="text-red-700 dark:text-red-100 font-medium">{formErrors}</p>
                            </div>
                        )}

                        <form
                            ref={formRef}
                            onSubmit={handleSubmit}
                            encType="multipart/form-data"
                            className="space-y-6"
                        >
                            {/* CSRF Token */}
                            <input type="hidden" name="_token" value={csrf_token || ''} />

                            {fields.map((field) => (
                                <div key={field.id}>
                                    {field.type === 'heading' && (
                                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-6 mb-2">
                                            {field.label}
                                        </h2>
                                    )}

                                    {field.type === 'description' && (
                                        <p className="text-gray-600 dark:text-gray-400 mb-4">
                                            {field.label}
                                        </p>
                                    )}

                                    {field.type === 'text' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                {field.label}
                                                {field.is_required && <span className="text-red-600">*</span>}
                                            </label>
                                            <input
                                                type="text"
                                                name={`field_${field.id}`}
                                                placeholder={field.help_text || ''}
                                                className={inputClasses(field.id)}
                                                required={field.is_required}
                                                maxLength={255}
                                            />
                                            {renderFieldError(field.id)}
                                        </div>
                                    )}

                                    {field.type === 'textarea' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                {field.label}
                                                {field.is_required && <span className="text-red-600">*</span>}
                                            </label>
                                            <textarea
                                                name={`field_${field.id}`}
                                                placeholder={field.help_text || ''}
                                                rows="4"
                                                className={inputClasses(field.id)}
                                                required={field.is_required}
                                                maxLength={10000}
                                            />
                                            {renderFieldError(field.id)}
                                        </div>
                                    )}

                                    {field.type === 'email' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                {field.label}
                                                {field.is_required && <span className="text-red-600">*</span>}
                                            </label>
                                            <input
                                                type="email"
                                                name={`field_${field.id}`}
                                                placeholder={field.help_text || ''}
                                                className={inputClasses(field.id)}
                                                required={field.is_required}
                                                maxLength={255}
                                            />
                                            {renderFieldError(field.id)}
                                        </div>
                                    )}

                                    {field.type === 'number' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                {field.label}
                                                {field.is_required && <span className="text-red-600">*</span>}
                                            </label>
                                            <input
                                                type="number"
                                                name={`field_${field.id}`}
                                                placeholder={field.help_text || ''}
                                                className={inputClasses(field.id)}
                                                required={field.is_required}
                                                min={NUMBER_MIN}
                                                max={NUMBER_MAX}
                                                onChange={(e) => { e.target.value = clampNumber(e.target.value); }}
                                            />
                                            {renderFieldError(field.id)}
                                        </div>
                                    )}

                                    {field.type === 'date' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                {field.label}
                                                {field.is_required && <span className="text-red-600">*</span>}
                                            </label>
                                            <input
                                                type="date"
                                                name={`field_${field.id}`}
                                                className={inputClasses(field.id)}
                                                required={field.is_required}
                                            />
                                            {renderFieldError(field.id)}
                                        </div>
                                    )}

                                    {field.type === 'select' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                {field.label}
                                                {field.is_required && <span className="text-red-600">*</span>}
                                            </label>
                                            <select
                                                name={`field_${field.id}`}
                                                className={inputClasses(field.id)}
                                                required={field.is_required}
                                            >
                                                <option value="">-- Select --</option>
                                                {field.options?.map((option) => (
                                                    <option key={option.id} value={option.id}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                            {renderFieldError(field.id)}
                                        </div>
                                    )}

                                    {field.type === 'multi_select' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                {field.label}
                                                {field.is_required && <span className="text-red-600">*</span>}
                                            </label>
                                            <select
                                                multiple
                                                name={`field_${field.id}`}
                                                className={inputClasses(field.id)}
                                                required={field.is_required}
                                            >
                                                {field.options?.map((option) => (
                                                    <option key={option.id} value={option.id}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                Hold Ctrl (or Cmd on Mac) to select multiple options
                                            </p>
                                            {renderFieldError(field.id)}
                                        </div>
                                    )}

                                    {field.type === 'attachment' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                {field.label}
                                                {field.is_required && <span className="text-red-600">*</span>}
                                            </label>
                                            <input
                                                type="file"
                                                name={`field_${field.id}`}
                                                className={inputClasses(field.id)}
                                                required={field.is_required}
                                                accept=".pdf,.doc,.docx,.xls,.xlsx,.zip"
                                                onChange={(e) => checkFileSize(e, field)}
                                                multiple
                                            />
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                Accepted formats: PDF, DOC, DOCX, XLS, XLSX, ZIP
                                            </p>
                                            {renderFieldError(field.id)}
                                        </div>
                                    )}

                                    {field.type === 'capture_photo' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                {field.label}
                                                {field.is_required && <span className="text-red-600">*</span>}
                                            </label>
                                            <input
                                                type="file"
                                                name={`field_${field.id}`}
                                                className={inputClasses(field.id)}
                                                required={field.is_required}
                                                accept="image/jpeg,image/jpg,image/png"
                                                onChange={(e) => checkFileSize(e, field)}
                                                capture="environment"
                                            />
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                Accepted formats: JPG, PNG
                                            </p>
                                            {renderFieldError(field.id)}
                                        </div>
                                    )}

                                    {field.type === 'capture_video' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                {field.label}
                                                {field.is_required && <span className="text-red-600">*</span>}
                                            </label>
                                            <input
                                                type="file"
                                                name={`field_${field.id}`}
                                                className={inputClasses(field.id)}
                                                required={field.is_required}
                                                accept="video/mp4,video/quicktime,video/webm"
                                                onChange={(e) => checkFileSize(e, field)}
                                                capture="environment"
                                            />
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                Accepted formats: MP4, MOV, WEBM
                                            </p>
                                            {renderFieldError(field.id)}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Turnstile — the widget component loads Cloudflare's script and
                                renders explicitly. A bare .cf-turnstile div renders nothing
                                unless that script is on the page. */}
                            {turnstile.enabled && (
                                <TurnstileWidget
                                    siteKey={turnstile.siteKey}
                                    onVerify={handleTurnstileVerify}
                                    onExpire={handleTurnstileExpire}
                                    error={errors.cf_turnstile_response}
                                />
                            )}

                            {/* Submit Button */}
                            <div className="pt-4">
                                <button
                                    type="submit"
                                    disabled={processing}
                                    className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition"
                                >
                                    {processing ? 'Submitting...' : form.submit_button_text || 'Submit'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </>
    );
}
