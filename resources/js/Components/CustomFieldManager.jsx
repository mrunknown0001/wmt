import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import Modal from './Modal';
import { ConfirmModal } from './Modal';
import { apiFetch } from '../utils';

const FIELD_TYPES = [
    { value: 'text', label: 'Text' },
    { value: 'textarea', label: 'Multi-line Text' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'single_select', label: 'Single Select' },
    { value: 'multi_select', label: 'Multi Select' },
];

const OPTION_COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316',
];

const COLOR_PALETTE = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308',
    '#84cc16', '#22c55e', '#10b981', '#14b8a6',
    '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
    '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
    '#f43f5e', '#78716c', '#64748b', '#1e293b',
];

function ColorPickerPopover({ color, onChange, onClose, anchorRef }) {
    const popoverRef = useRef(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (anchorRef?.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            setPos({ top: rect.bottom + 4, left: rect.left });
        }
    }, [anchorRef]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target) &&
                anchorRef?.current && !anchorRef.current.contains(e.target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose, anchorRef]);

    return createPortal(
        <div ref={popoverRef} className="fixed z-9999 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700" style={{ top: pos.top, left: pos.left }}>
            <div className="grid grid-cols-5 gap-1.5 mb-2">
                {COLOR_PALETTE.map((c) => (
                    <button
                        key={c}
                        type="button"
                        onClick={() => { onChange(c); onClose(); }}
                        className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                            color === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                    />
                ))}
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <input
                    type="color"
                    value={color || '#3b82f6'}
                    onChange={(e) => { onChange(e.target.value); onClose(); }}
                    className="h-6 w-6 rounded border border-gray-300 dark:border-gray-600 cursor-pointer shrink-0"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400">Custom</span>
            </div>
        </div>,
        document.body
    );
}

function OptionEditor({ options, onChange }) {
    const listRef = useRef(null);
    const lastInputRef = useRef(null);
    const prevCountRef = useRef(options.length);
    const [colorPickerIndex, setColorPickerIndex] = useState(null);
    const colorBtnRefs = useRef({});

    useEffect(() => {
        if (options.length > prevCountRef.current && lastInputRef.current) {
            lastInputRef.current.focus();
            listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
        }
        prevCountRef.current = options.length;
    }, [options.length]);

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
            <div ref={listRef} className="max-h-48 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <button
                            type="button"
                            ref={(el) => { colorBtnRefs.current[i] = el; }}
                            onClick={() => setColorPickerIndex(colorPickerIndex === i ? null : i)}
                            className="h-7 w-7 rounded-full border-2 border-gray-300 dark:border-gray-600 cursor-pointer shrink-0 transition-transform hover:scale-110"
                            style={{ backgroundColor: opt.color || '#3b82f6' }}
                        />
                        {colorPickerIndex === i && (
                            <ColorPickerPopover
                                color={opt.color || '#3b82f6'}
                                onChange={(c) => updateOption(i, 'color', c)}
                                onClose={() => setColorPickerIndex(null)}
                                anchorRef={{ current: colorBtnRefs.current[i] }}
                            />
                        )}
                        <input
                            ref={i === options.length - 1 ? lastInputRef : undefined}
                            type="text"
                            value={opt.label}
                            onChange={(e) => updateOption(i, 'label', e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (opt.label.trim()) addOption();
                                }
                            }}
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

export default function CustomFieldManager({ projectId, initialFields = [], onFieldsChange }) {
    const [fields, setFieldsInternal] = useState(initialFields);

    // Wrap setFields to also notify parent
    const setFields = useCallback((updater) => {
        setFieldsInternal((prev) => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            onFieldsChange?.(next);
            return next;
        });
    }, [onFieldsChange]);

    // Sync when parent provides updated initialFields (e.g. after server refresh)
    useEffect(() => {
        setFieldsInternal(initialFields);
    }, [initialFields]);

    const [showModal, setShowModal] = useState(false);
    const [editingField, setEditingField] = useState(null);
    const [deleteField, setDeleteField] = useState(null);
    const [saving, setSaving] = useState(false);
    const [dragIndex, setDragIndex] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);

    const [form, setForm] = useState({
        name: '',
        type: 'text',
        options: [],
    });

    const resetForm = () => {
        setForm({ name: '', type: 'text', options: [] });
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

    const handleDragStart = (e, index) => {
        setDragIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverIndex(index);
    };

    const handleDrop = async (e, dropIndex) => {
        e.preventDefault();
        if (dragIndex === null || dragIndex === dropIndex) {
            setDragIndex(null);
            setDragOverIndex(null);
            return;
        }

        const reordered = [...fields];
        const [moved] = reordered.splice(dragIndex, 1);
        reordered.splice(dropIndex, 0, moved);
        setFields(reordered);
        setDragIndex(null);
        setDragOverIndex(null);

        try {
            await apiFetch(`/projects/${projectId}/custom-fields/reorder`, {
                method: 'POST',
                body: JSON.stringify({ order: reordered.map(f => f.id) }),
            });
        } catch (e) {
            console.error('Failed to reorder custom fields', e);
            setFields(fields); // revert on failure
        }
    };

    const handleDragEnd = () => {
        setDragIndex(null);
        setDragOverIndex(null);
    };

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
                    {fields.map((field, index) => (
                        <div
                            key={field.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDrop={(e) => handleDrop(e, index)}
                            onDragEnd={handleDragEnd}
                            className={`flex items-center justify-between p-3 rounded-lg border bg-gray-50 dark:bg-gray-800/50 transition-all ${
                                dragOverIndex === index && dragIndex !== index
                                    ? 'border-primary-400 dark:border-primary-500 ring-1 ring-primary-400/30'
                                    : 'border-gray-200 dark:border-gray-700'
                            } ${dragIndex === index ? 'opacity-50' : ''}`}
                        >
                            <div className="flex items-center gap-3">
                                <span className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="Drag to reorder">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
                                </span>
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{field.name}</span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                                    {typeLabel(field.type)}
                                </span>
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
