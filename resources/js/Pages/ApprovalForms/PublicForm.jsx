import { useState, useRef } from 'react';
import { Head } from '@inertiajs/react';

export default function PublicForm({ form, fields, turnstile, csrf_token }) {
    const formRef = useRef(null);
    const [processing, setProcessing] = useState(false);
    const [errors, setErrors] = useState({});
    const [formErrors, setFormErrors] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Clear previous errors
        setErrors({});
        setFormErrors('');

        if (turnstile.enabled && !window.turnstileToken) {
            setFormErrors('Please verify that you are not a robot');
            return;
        }

        setProcessing(true);

        try {
            // Collect form data
            const formData = new FormData(formRef.current);

            // Submit via fetch
            const response = await fetch(route('forms-approval.submit', form.uuid), {
                method: 'POST',
                body: formData,
            });

            const contentType = response.headers.get('content-type');

            // Check if response is JSON (error response with validation errors)
            if (contentType && contentType.includes('application/json')) {
                const data = await response.json();

                if (response.status === 422 && data.errors) {
                    // Validation error
                    setErrors(data.errors);
                    window.scrollTo(0, 0);
                    return;
                } else if (data.message) {
                    setFormErrors(data.message);
                    return;
                }
            } else {
                // Successful submission (HTML response or redirect)
                if (response.ok) {
                    // Redirect to success page
                    const text = await response.text();
                    if (text.includes('success')) {
                        window.location.href = response.url;
                    }
                } else {
                    setFormErrors('An error occurred while submitting the form.');
                }
            }
        } catch (error) {
            console.error('Form submission error:', error);
            setFormErrors('An error occurred while submitting the form. Please try again.');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <>
            <Head title={form.name} />
            <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
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
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                required={field.is_required}
                                            />
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
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                required={field.is_required}
                                            />
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
                                                className={`w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                                    errors[`field_${field.id}`]
                                                        ? 'border-red-500 dark:border-red-500'
                                                        : 'border-gray-300 dark:border-gray-600'
                                                }`}
                                                required={field.is_required}
                                            />
                                            {errors[`field_${field.id}`] && (
                                                <p className="text-red-600 dark:text-red-400 text-sm mt-1">
                                                    {errors[`field_${field.id}`][0]}
                                                </p>
                                            )}
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
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                required={field.is_required}
                                            />
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
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                required={field.is_required}
                                            />
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
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                required={field.is_required}
                                            >
                                                <option value="">-- Select --</option>
                                                {field.options?.map((option) => (
                                                    <option key={option.id} value={option.id}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
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
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                required={field.is_required}
                                                accept=".pdf,.doc,.docx,.xls,.xlsx,.zip"
                                                multiple
                                            />
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                Accepted formats: PDF, DOC, DOCX, XLS, XLSX, ZIP
                                            </p>
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
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                required={field.is_required}
                                                accept="image/jpeg,image/jpg,image/png"
                                                capture="environment"
                                            />
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                Accepted formats: JPG, PNG
                                            </p>
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
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                required={field.is_required}
                                                accept="video/mp4,video/quicktime,video/webm"
                                                capture="environment"
                                            />
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                Accepted formats: MP4, MOV, WEBM
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Turnstile */}
                            {turnstile.enabled && (
                                <div className="cf-turnstile" data-sitekey={turnstile.siteKey} />
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
