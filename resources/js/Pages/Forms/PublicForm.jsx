import { useForm, usePage, Head } from '@inertiajs/react';
import { useState, useCallback } from 'react';
import Input from '../../Components/Input';
import Textarea from '../../Components/Textarea';
import Select from '../../Components/Select';
import Button from '../../Components/Button';
import TurnstileWidget from '../../Components/TurnstileWidget';
import ThemeToggle from '../../Components/ThemeToggle';

export default function PublicForm() {
    const { form: formDef, turnstile } = usePage().props;

    // Build initial field values
    const initialValues = {};
    formDef.fields.forEach(field => {
        if (['heading', 'description'].includes(field.type)) return;
        if (field.type === 'multi_select') {
            initialValues[field.id] = [];
        } else {
            initialValues[field.id] = '';
        }
    });

    const { data, setData, post, processing, errors } = useForm({
        fields: initialValues,
        cf_turnstile_response: '',
    });

    const setFieldValue = (fieldId, value) => {
        setData('fields', { ...data.fields, [fieldId]: value });
    };

    const handleTurnstileVerify = useCallback((token) => {
        setData('cf_turnstile_response', token);
    }, []);

    const handleTurnstileExpire = useCallback(() => {
        setData('cf_turnstile_response', '');
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        post(`/forms/${formDef.uuid}`);
    };

    const renderField = (field) => {
        const value = data.fields[field.id];
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

                        <form onSubmit={handleSubmit} className="space-y-5">
                            {formDef.fields.map(renderField)}

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
