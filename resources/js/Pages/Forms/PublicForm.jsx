import { usePage, Head, router } from '@inertiajs/react';
import { useState, useCallback } from 'react';
import Input from '../../Components/Input';
import Textarea from '../../Components/Textarea';
import Select from '../../Components/Select';
import Button from '../../Components/Button';
import TurnstileWidget from '../../Components/TurnstileWidget';
import ThemeToggle from '../../Components/ThemeToggle';

const ACCEPTED_FILE_TYPES = 'image/*,video/*,.xlsx,.xls,.csv';
const MAX_FILE_SIZE_MB = 50;
const MAX_FILES = 5;

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function evaluateConditions(field, allFields, fieldValues, visited = new Set()) {
    const conditions = field.conditions;
    if (!conditions || !conditions.rules || conditions.rules.length === 0) {
        return true;
    }

    // Circular reference protection
    if (visited.has(field.id)) return true;
    visited.add(field.id);

    const logic = conditions.logic || 'all';
    const results = conditions.rules.map(rule => {
        const refField = allFields.find(f => f.id === rule.field_id);
        if (!refField) return true;

        // Recursively check if the referenced field is visible
        if (!evaluateConditions(refField, allFields, fieldValues, new Set(visited))) {
            return false;
        }

        const currentValue = fieldValues[refField.id];
        const expectedValue = rule.value;
        const operator = rule.operator || 'equals';

        switch (operator) {
            case 'equals':
                return String(currentValue ?? '') === String(expectedValue ?? '');
            case 'not_equals':
                return String(currentValue ?? '') !== String(expectedValue ?? '');
            case 'contains':
                return String(currentValue ?? '').includes(String(expectedValue ?? ''));
            case 'is_empty':
                return !currentValue || currentValue === '' || (Array.isArray(currentValue) && currentValue.length === 0);
            case 'is_not_empty':
                return currentValue != null && currentValue !== '' && !(Array.isArray(currentValue) && currentValue.length === 0);
            default:
                return true;
        }
    });

    return logic === 'all' ? results.every(Boolean) : results.some(Boolean);
}

export default function PublicForm() {
    const { form: formDef, turnstile } = usePage().props;

    // Filter to only visible fields for display
    const visibleFields = formDef.fields.filter(f => f.is_visible !== false);

    // Build initial field values with defaults
    const initialValues = {};
    visibleFields.forEach(field => {
        if (['heading', 'description', 'attachment'].includes(field.type)) return;
        if (field.type === 'multi_select') {
            initialValues[field.id] = field.default_value ? [field.default_value] : [];
        } else {
            initialValues[field.id] = field.default_value || '';
        }
    });

    const [fieldValues, setFieldValues] = useState(initialValues);
    const [attachments, setAttachments] = useState({});
    const [processing, setProcessing] = useState(false);
    const [errors, setErrors] = useState({});
    const [turnstileToken, setTurnstileToken] = useState('');

    const setFieldValue = (fieldId, value) => {
        setFieldValues(prev => ({ ...prev, [fieldId]: value }));
    };

    const handleTurnstileVerify = useCallback((token) => {
        setTurnstileToken(token);
    }, []);

    const handleTurnstileExpire = useCallback(() => {
        setTurnstileToken('');
    }, []);

    const handleFileChange = (fieldId, files) => {
        const fileArray = Array.from(files).slice(0, MAX_FILES);
        setAttachments(prev => ({ ...prev, [fieldId]: fileArray }));
    };

    const removeFile = (fieldId, index) => {
        setAttachments(prev => {
            const files = [...(prev[fieldId] || [])];
            files.splice(index, 1);
            return { ...prev, [fieldId]: files };
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setProcessing(true);

        const formData = new FormData();

        // Add field values (only for fields whose conditions are met)
        Object.entries(fieldValues).forEach(([fieldId, value]) => {
            const field = formDef.fields.find(f => f.id === Number(fieldId));
            if (field && !evaluateConditions(field, formDef.fields, fieldValues)) {
                return; // Skip hidden conditional fields
            }
            if (Array.isArray(value)) {
                value.forEach(v => formData.append(`fields[${fieldId}][]`, v));
            } else {
                formData.append(`fields[${fieldId}]`, value ?? '');
            }
        });

        // Add attachment files
        Object.entries(attachments).forEach(([fieldId, files]) => {
            files.forEach(file => {
                formData.append(`fields[${fieldId}][]`, file);
            });
        });

        // Add Turnstile token
        if (turnstileToken) {
            formData.append('cf_turnstile_response', turnstileToken);
        }

        router.post(`/forms/${formDef.uuid}`, formData, {
            forceFormData: true,
            onError: (errs) => {
                setErrors(errs);
                setProcessing(false);
            },
            onFinish: () => {
                setProcessing(false);
            },
        });
    };

    const renderField = (field) => {
        const value = fieldValues[field.id];
        const fieldError = errors[`fields.${field.id}`];

        switch (field.type) {
            case 'heading':
                return (
                    <h2 key={field.id} className="text-lg font-semibold text-gray-900 dark:text-gray-100 pt-2">
                        {field.label}
                    </h2>
                );

            case 'description':
                return (
                    <p key={field.id} className="text-sm text-gray-600 dark:text-gray-400">
                        {field.label}
                    </p>
                );

            case 'text':
                return (
                    <div key={field.id}>
                        <Input
                            label={field.label + (field.is_required ? ' *' : '')}
                            id={`field-${field.id}`}
                            value={value || ''}
                            onChange={(e) => setFieldValue(field.id, e.target.value)}
                            error={fieldError}
                            placeholder={field.config?.placeholder || ''}
                            maxLength={255}
                        />
                        {field.help_text && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.help_text}</p>}
                    </div>
                );

            case 'textarea':
                return (
                    <div key={field.id}>
                        <Textarea
                            label={field.label + (field.is_required ? ' *' : '')}
                            id={`field-${field.id}`}
                            value={value || ''}
                            onChange={(e) => setFieldValue(field.id, e.target.value)}
                            error={fieldError}
                            placeholder={field.config?.placeholder || ''}
                            maxLength={10000}
                        />
                        {field.help_text && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.help_text}</p>}
                    </div>
                );

            case 'number':
                return (
                    <div key={field.id}>
                        <Input
                            label={field.label + (field.is_required ? ' *' : '')}
                            id={`field-${field.id}`}
                            type="number"
                            value={value ?? ''}
                            onChange={(e) => setFieldValue(field.id, e.target.value)}
                            error={fieldError}
                            max={99999999999}
                            min={-99999999999}
                        />
                        {field.help_text && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.help_text}</p>}
                    </div>
                );

            case 'date':
                return (
                    <div key={field.id}>
                        <Input
                            label={field.label + (field.is_required ? ' *' : '')}
                            id={`field-${field.id}`}
                            type="date"
                            value={value || ''}
                            onChange={(e) => setFieldValue(field.id, e.target.value)}
                            error={fieldError}
                        />
                        {field.help_text && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.help_text}</p>}
                    </div>
                );

            case 'select':
                return (
                    <div key={field.id}>
                        <Select
                            label={field.label + (field.is_required ? ' *' : '')}
                            id={`field-${field.id}`}
                            value={value || ''}
                            onChange={(e) => setFieldValue(field.id, e.target.value)}
                            options={[...(field.options || [])].sort((a, b) => a.label.localeCompare(b.label)).map(opt => ({
                                value: String(opt.id ?? opt.value),
                                label: opt.label,
                            }))}
                            placeholder="— Select —"
                            error={fieldError}
                        />
                        {field.help_text && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.help_text}</p>}
                    </div>
                );

            case 'multi_select': {
                const selected = Array.isArray(value) ? value.map(String) : [];
                return (
                    <div key={field.id}>
                        <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                            {field.label}{field.is_required ? ' *' : ''}
                        </label>
                        <div className="space-y-1">
                            {[...(field.options || [])].sort((a, b) => a.label.localeCompare(b.label)).map(opt => {
                                const optVal = String(opt.id ?? opt.value);
                                return (
                                    <label key={optVal} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                        <input
                                            type="checkbox"
                                            checked={selected.includes(optVal)}
                                            onChange={() => {
                                                const newSelected = selected.includes(optVal)
                                                    ? selected.filter(s => s !== optVal)
                                                    : [...selected, optVal];
                                                setFieldValue(field.id, newSelected);
                                            }}
                                            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
                                        />
                                        {opt.label}
                                    </label>
                                );
                            })}
                        </div>
                        {fieldError && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{fieldError}</p>}
                        {field.help_text && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.help_text}</p>}
                    </div>
                );
            }

            case 'attachment': {
                const files = attachments[field.id] || [];
                const fileErrors = [];
                for (let i = 0; i < MAX_FILES; i++) {
                    if (errors[`fields.${field.id}.${i}`]) {
                        fileErrors.push(errors[`fields.${field.id}.${i}`]);
                    }
                }
                return (
                    <div key={field.id}>
                        <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                            {field.label}{field.is_required ? ' *' : ''}
                        </label>
                        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4">
                            <input
                                type="file"
                                accept={ACCEPTED_FILE_TYPES}
                                multiple
                                onChange={(e) => handleFileChange(field.id, e.target.files)}
                                className="block w-full text-sm text-gray-500 dark:text-gray-400
                                    file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0
                                    file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700
                                    dark:file:bg-primary-900/20 dark:file:text-primary-400
                                    hover:file:bg-primary-100 dark:hover:file:bg-primary-900/30
                                    file:cursor-pointer file:transition-colors"
                            />
                            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                                Images, videos, or Excel files. Max {MAX_FILES} files, {MAX_FILE_SIZE_MB}MB each.
                            </p>
                            {files.length > 0 && (
                                <div className="mt-3 space-y-1">
                                    {files.map((file, i) => (
                                        <div key={i} className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded px-3 py-1.5">
                                            <span className="truncate">{file.name} ({formatFileSize(file.size)})</span>
                                            <button
                                                type="button"
                                                onClick={() => removeFile(field.id, i)}
                                                className="text-gray-400 hover:text-red-500 ml-2 shrink-0"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        {fieldError && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{fieldError}</p>}
                        {fileErrors.map((err, i) => (
                            <p key={i} className="mt-1 text-sm text-red-600 dark:text-red-400">{err}</p>
                        ))}
                        {field.help_text && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.help_text}</p>}
                    </div>
                );
            }

            default:
                return null;
        }
    };

    return (
        <>
            <Head title={formDef.name} />
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
                <div className="absolute top-4 right-4">
                    <ThemeToggle className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" />
                </div>
                <div className="w-full max-w-2xl mx-auto">
                    <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 px-8 py-8">
                        <div className="mb-6">
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{formDef.project_name}</p>
                            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{formDef.name}</h1>
                            {formDef.description && (
                                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{formDef.description}</p>
                            )}
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-5" encType="multipart/form-data">
                            {visibleFields.map(field => {
                                if (!evaluateConditions(field, formDef.fields, fieldValues)) return null;
                                return renderField(field);
                            })}

                            {turnstile.enabled && (
                                <TurnstileWidget
                                    siteKey={turnstile.siteKey}
                                    onVerify={handleTurnstileVerify}
                                    onExpire={handleTurnstileExpire}
                                    error={errors.cf_turnstile_response}
                                />
                            )}

                            <Button
                                type="submit"
                                processing={processing}
                                processingText="Submitting..."
                                className="w-full"
                            >
                                {formDef.submit_button_text || 'Submit'}
                            </Button>
                        </form>
                    </div>

                    <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4">
                        Powered by WMT
                    </p>
                </div>
            </div>
        </>
    );
}
