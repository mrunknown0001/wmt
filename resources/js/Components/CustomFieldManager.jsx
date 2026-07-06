import { useState, useCallback } from 'react';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import Modal from './Modal';
import { ConfirmModal } from './Modal';
import { apiFetch } from '../utils';

const FIELD_TYPES = [
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'single_select', label: 'Single Select' },
    { value: 'multi_select', label: 'Multi Select' },
];

const OPTION_COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316',
];

function OptionEditor({ options, onChange }) {
    const addOption = () => {
        onChange([...options, { label: '', color: OPTION_COLORS[options.length % OPTION_COLORS.length] }]);
    };

    const updateOption = (index, key, value) => {
        const updated = [...options];
        updated[index] = { ...updated[index], [key]: value };
        onChange(updated);
    };

    const removeOption = (index) => {
        onChange(options.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">Options</label>
            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                {options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <input
                            type="color"
                            value={opt.color || '#3b82f6'}
                            onChange={(e) => updateOption(i, 'color', e.target.value)}
                            className="h-8 w-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer shrink-0"
                        />
                        <input
                            type="text"
                            value={opt.label}
                            onChange={(e) => updateOption(i, 'label', e.target.value)}
                            placeholder={`Option ${i + 1}`}
                            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                        />
                        <button
                            type="button"
                            onClick={() => removeOption(i)}
                            className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                ))}
            </div>
            <button
                type="button"
                onClick={addOption}
                className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
            >
                + Add option
            </button>
        </div>
    );
}

export default function CustomFieldManager({ projectId, initialFields = [] }) {
    const [fields, setFields] = useState(initialFields);
    const [showModal, setShowModal] = useState(false);
    const [editingField, setEditingField] = useState(null);
    const [deleteField, setDeleteField] = useState(null);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        name: '',
        type: 'text',
        is_required: false,
        options: [],
    });

    const resetForm = () => {
        setForm({ name: '', type: 'text', is_required: false, options: [] });
        setEditingField(null);
    };

    const openCreate = () => {
        resetForm();
        setShowModal(true);
    };

    const openEdit = (field) => {
        setEditingField(field);
        setForm({
            name: field.name,
            type: field.type,
            is_required: field.is_required,
            options: field.options || [],
        });
        setShowModal(true);
    };

    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            const payload = {
                name: form.name,
                type: form.type,
                is_required: form.is_required,
                options: ['single_select', 'multi_select'].includes(form.type) ? form.options : undefined,
            };

            let result;
            if (editingField) {
                result = await apiFetch(`/projects/${projectId}/custom-fields/${editingField.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                });
            } else {
                result = await apiFetch(`/projects/${projectId}/custom-fields`, {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
            }

            const data = await result.json();

            if (editingField) {
                setFields(prev => prev.map(f => f.id === data.field.id ? data.field : f));
            } else {
                setFields(prev => [...prev, data.field]);
            }

            setShowModal(false);
            resetForm();
        } catch (e) {
            console.error('Failed to save custom field', e);
        } finally {
            setSaving(false);
        }
    }, [form, editingField, projectId]);

    const handleDelete = useCallback(async () => {
        if (!deleteField) return;
        try {
            await apiFetch(`/projects/${projectId}/custom-fields/${deleteField.id}`, {
                method: 'DELETE',
            });
            setFields(prev => prev.filter(f => f.id !== deleteField.id));
            setDeleteField(null);
        } catch (e) {
            console.error('Failed to delete custom field', e);
        }
    }, [deleteField, projectId]);

    const typeLabel = (type) => FIELD_TYPES.find(t => t.value === type)?.label || type;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Custom Fields</h3>
                <Button variant="secondary" size="sm" onClick={openCreate}>+ Add Field</Button>
            </div>

            {fields.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No custom fields yet. Add one to track additional data on tasks.</p>
            ) : (
                <div className="space-y-2">
                    {fields.map(field => (
                        <div
                            key={field.id}
                            className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{field.name}</span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                                    {typeLabel(field.type)}
                                </span>
                                {field.is_required && (
                                    <span className="text-xs text-red-500">Required</span>
                                )}
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => openEdit(field)}
                                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                    title="Edit"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                </button>
                                <button
                                    onClick={() => setDeleteField(field)}
                                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                    title="Delete"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create/Edit Modal */}
            <Modal
                isOpen={showModal}
                onClose={() => { setShowModal(false); resetForm(); }}
                title={editingField ? 'Edit Custom Field' : 'Add Custom Field'}
                size="md"
                actions={
                    <>
                        <Button variant="secondary" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</Button>
                        <Button onClick={handleSave} processing={saving} processingText="Saving...">
                            {editingField ? 'Save Changes' : 'Add Field'}
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <Input
                        label="Field Name"
                        id="cf-name"
                        value={form.name}
                        onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g. Priority Level, Region"
                    />
                    <Select
                        label="Type"
                        id="cf-type"
                        value={form.type}
                        onChange={(e) => setForm(prev => ({ ...prev, type: e.target.value, options: [] }))}
                        options={FIELD_TYPES}
                        disabled={!!editingField}
                    />
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="cf-required"
                            checked={form.is_required}
                            onChange={(e) => setForm(prev => ({ ...prev, is_required: e.target.checked }))}
                            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
                        />
                        <label htmlFor="cf-required" className="text-sm text-gray-700 dark:text-gray-300">Required field</label>
                    </div>
                    {['single_select', 'multi_select'].includes(form.type) && (
                        <OptionEditor
                            options={form.options}
                            onChange={(opts) => setForm(prev => ({ ...prev, options: opts }))}
                        />
                    )}
                </div>
            </Modal>

            {/* Delete Confirm */}
            <ConfirmModal
                isOpen={!!deleteField}
                onClose={() => setDeleteField(null)}
                onConfirm={handleDelete}
                title="Delete Custom Field"
                message={`Are you sure you want to delete "${deleteField?.name}"? This will remove all values for this field from existing tasks.`}
            />
        </div>
    );
}
