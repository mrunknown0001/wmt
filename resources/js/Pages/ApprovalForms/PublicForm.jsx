import { useState, useRef } from 'react';
import { Head, router } from '@inertiajs/react';

export default function PublicForm({ form, fields, turnstile }) {
    const formRef = useRef(null);
    const [fieldValues, setFieldValues] = useState({});
    const [fileValues, setFileValues] = useState({});
    const [errors, setErrors] = useState({});
    const [processing, setProcessing] = useState(false);
    const [turnstileToken, setTurnstileToken] = useState(null);

    const handleFieldChange = (fieldId, value) => {
        setFieldValues({
            ...fieldValues,
            [`field_${fieldId}`]: value,
        });
        // Clear error for this field when user starts typing
        if (errors[`field_${fieldId}`]) {
            setErrors({
                ...errors,
                [`field_${fieldId}`]: null,
            });
        }
    };

    const handleFileChange = (fieldId, files) => {
        if (files) {
            setFileValues({
                ...fileValues,
                [`field_${fieldId}`]: files,
            });
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setErrors({});

        // Validate Turnstile if enabled
        if (turnstile.enabled && !turnstileToken) {
            alert('Please verify that you are not a robot');
            return;
        }

        setProcessing(true);

        const formData = new FormData();

        // Add field values
        Object.entries(fieldValues).forEach(([key, value]) => {
            formData.append(key, value || '');
        });

        // Add file values
        Object.entries(fileValues).forEach(([key, files]) => {
            if (files) {
                Array.from(files).forEach((file) => {
                    formData.append(key, file);
                });
            }
        });

        // Add Turnstile token if enabled
        if (turnstile.enabled && turnstileToken) {
            formData.append('cf_turnstile_response', turnstileToken);
        }

        router.post(route('forms-approval.submit', form.uuid), formData, {
            onError: (errors) => {
                setErrors(errors);
                setProcessing(false);
            },
            onSuccess: () => {
                setProcessing(false);
            },
        });
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
                        <form onSubmit={handleSubmit} className="space-y-6">
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
                                                value={fieldValues[`field_${field.id}`] || ''}
                                                onChange={(e) => handleFieldChange(field.id, e.target.value)}
                                                placeholder={field.help_text || ''}
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                required={field.is_required}
                                            />
                                            {errors[`field_${field.id}`] && (
                                                <p className="text-red-600 text-sm mt-1">{errors[`field_${field.id}`]}</p>
                                            )}
                                        </div>
                                    )}

                                    {field.type === 'textarea' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                {field.label}
                                                {field.is_required && <span className="text-red-600">*</span>}
                                            </label>
                                            <textarea
                                                value={fieldValues[`field_${field.id}`] || ''}
                                                onChange={(e) => handleFieldChange(field.id, e.target.value)}
                                                placeholder={field.help_text || ''}
                                                rows="4"
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                required={field.is_required}
                                            />
                                            {errors[`field_${field.id}`] && (
                                                <p className="text-red-600 text-sm mt-1">{errors[`field_${field.id}`]}</p>
                                            )}
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
                                                value={fieldValues[`field_${field.id}`] || ''}
                                                onChange={(e) => handleFieldChange(field.id, e.target.value)}
                                                placeholder={field.help_text || ''}
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                required={field.is_required}
                                            />
                                            {errors[`field_${field.id}`] && (
                                                <p className="text-red-600 text-sm mt-1">{errors[`field_${field.id}`]}</p>
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
                                                value={fieldValues[`field_${field.id}`] || ''}
                                                onChange={(e) => handleFieldChange(field.id, e.target.value)}
                                                placeholder={field.help_text || ''}
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                required={field.is_required}
                                            />
                                            {errors[`field_${field.id}`] && (
                                                <p className="text-red-600 text-sm mt-1">{errors[`field_${field.id}`]}</p>
                                            )}
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
                                                value={fieldValues[`field_${field.id}`] || ''}
                                                onChange={(e) => handleFieldChange(field.id, e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                required={field.is_required}
                                            />
                                            {errors[`field_${field.id}`] && (
                                                <p className="text-red-600 text-sm mt-1">{errors[`field_${field.id}`]}</p>
                                            )}
                                        </div>
                                    )}

                                    {field.type === 'select' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                {field.label}
                                                {field.is_required && <span className="text-red-600">*</span>}
                                            </label>
                                            <select
                                                value={fieldValues[`field_${field.id}`] || ''}
                                                onChange={(e) => handleFieldChange(field.id, e.target.value)}
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
                                            {errors[`field_${field.id}`] && (
                                                <p className="text-red-600 text-sm mt-1">{errors[`field_${field.id}`]}</p>
                                            )}
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
                                                onChange={(e) => handleFileChange(field.id, e.target.files)}
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                required={field.is_required}
                                                accept=".pdf,.doc,.docx,.xls,.xlsx,.zip"
                                                multiple
                                            />
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                Accepted formats: PDF, DOC, DOCX, XLS, XLSX, ZIP
                                            </p>
                                            {errors[`field_${field.id}`] && (
                                                <p className="text-red-600 text-sm mt-1">{errors[`field_${field.id}`]}</p>
                                            )}
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
                                                onChange={(e) => handleFileChange(field.id, e.target.files)}
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                required={field.is_required}
                                                accept="image/jpeg,image/jpg,image/png"
                                                capture="environment"
                                            />
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                Accepted formats: JPG, PNG
                                            </p>
                                            {errors[`field_${field.id}`] && (
                                                <p className="text-red-600 text-sm mt-1">{errors[`field_${field.id}`]}</p>
                                            )}
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
                                                onChange={(e) => handleFileChange(field.id, e.target.files)}
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                required={field.is_required}
                                                accept="video/mp4,video/quicktime,video/webm"
                                                capture="environment"
                                            />
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                Accepted formats: MP4, MOV, WEBM
                                            </p>
                                            {errors[`field_${field.id}`] && (
                                                <p className="text-red-600 text-sm mt-1">{errors[`field_${field.id}`]}</p>
                                            )}
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
                                                value={Array.isArray(fieldValues[`field_${field.id}`]) ? fieldValues[`field_${field.id}`] : []}
                                                onChange={(e) => handleFieldChange(field.id, Array.from(e.target.selectedOptions, option => option.value))}
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
                                            {errors[`field_${field.id}`] && (
                                                <p className="text-red-600 text-sm mt-1">{errors[`field_${field.id}`]}</p>
                                            )}
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
