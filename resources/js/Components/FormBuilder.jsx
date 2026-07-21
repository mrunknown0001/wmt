import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
    arrayMove,
    sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Input from './Input';
import Select from './Select';
import Button from './Button';
import Modal, { ConfirmModal } from './Modal';
import Tooltip from './Tooltip';

const FIELD_TYPES = [
    { value: 'text', label: 'Text Input', icon: 'A' },
    { value: 'textarea', label: 'Text Area', icon: 'P' },
    { value: 'number', label: 'Number', icon: '#' },
    { value: 'date', label: 'Date', icon: 'D' },
    { value: 'email', label: 'Email', icon: '@' },
    { value: 'select', label: 'Dropdown', icon: 'v' },
    { value: 'multi_select', label: 'Multi Select', icon: 'M' },
    { value: 'attachment', label: 'Attachment', icon: '📎' },
    { value: 'capture_photo', label: 'Camera Photo', icon: '📷' },
    { value: 'capture_video', label: 'Camera Video', icon: '🎥' },
    { value: 'heading', label: 'Heading', icon: 'H' },
    { value: 'description', label: 'Description', icon: 'i' },
];

const STATIC_TYPES = ['heading', 'description'];
const FILE_TYPES = ['attachment', 'capture_photo', 'capture_video'];

const CUSTOM_FIELD_TYPE_MAP = {
    'text': 'text',
    'textarea': 'textarea',
    'number': 'number',
    'date': 'date',
    'single_select': 'select',
    'multi_select': 'multi_select',
};

function getFieldIcon(type) {
    return FIELD_TYPES.find(t => t.value === type)?.icon || '?';
}

function getFieldTypeLabel(type) {
    return FIELD_TYPES.find(t => t.value === type)?.label || type;
}

// --- Sortable Field Row ---
function SortableFieldRow({ field, fieldIndex, isExpanded, onToggleExpand, onRemove, customFields, allFields, onChange }) {
    const sortableId = `field-${fieldIndex}`;
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: sortableId });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
        zIndex: isDragging ? 50 : undefined,
    };

    const isStatic = STATIC_TYPES.includes(field.type);

    const update = (key, value) => {
        onChange(fieldIndex, { ...field, [key]: value });
    };

    // Build mapping options for non-custom-field items
    const usedMappings = new Set();
    allFields.forEach((f, i) => {
        if (i === fieldIndex) return;
        if (f.maps_to === 'description') usedMappings.add('description');
        if (f.maps_to === 'assignee') usedMappings.add('assignee');
        if (f.maps_to === 'custom_field' && f.custom_field_id) usedMappings.add(`custom_field:${f.custom_field_id}`);
    });

    const mapOptions = [{ value: '', label: 'No mapping' }];
    if (!usedMappings.has('description')) {
        mapOptions.push({ value: 'description', label: 'Task Description' });
    }
    if (field.type === 'email' && field.config?.email_mode === 'registered_user' && !usedMappings.has('assignee')) {
        mapOptions.push({ value: 'assignee', label: 'Task Assignee (auto-assign)' });
    }

    const isCustomFieldMapped = field.maps_to === 'custom_field' && field.custom_field_id;
    const mappedCf = isCustomFieldMapped ? customFields?.find(cf => cf.id === field.custom_field_id) : null;

    return (
        <div ref={setNodeRef} style={style} className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
            {/* Collapsed Row */}
            <div className="flex items-center gap-2 px-3 py-2.5">
                    <Tooltip content="Drag to reorder">
                    <button
                        {...attributes}
                        {...listeners}
                        className="shrink-0 cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 touch-none"
                        type="button"
                    >
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm8-16a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
                        </svg>
                    </button>
                    </Tooltip>
                <span className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 dark:bg-gray-700 text-xs font-mono text-gray-500 dark:text-gray-400 shrink-0">
                    {getFieldIcon(field.type)}
                </span>
                <button
                    type="button"
                    onClick={() => onToggleExpand(fieldIndex)}
                    className="flex-1 text-left text-sm font-medium text-gray-700 dark:text-gray-300 truncate"
                >
                    {field.label || <span className="text-gray-400 italic">Untitled field</span>}
                </button>
                {field.is_required && !isStatic && (
                    <span className="text-xs text-red-500 font-medium shrink-0">Required</span>
                )}
                {isCustomFieldMapped && (
                    <span className="text-xs text-primary-600 dark:text-primary-400 shrink-0">Custom Field</span>
                )}
                {!field.is_visible && (
                    <span className="text-xs text-yellow-600 dark:text-yellow-400 shrink-0">Hidden</span>
                )}
                {field.conditions?.rules?.length > 0 && (
                    <span className="text-xs text-purple-600 dark:text-purple-400 shrink-0">Conditional</span>
                )}
                    <Tooltip content={isExpanded ? 'Collapse' : 'Expand'}>
                    <button
                        type="button"
                        onClick={() => onToggleExpand(fieldIndex)}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0"
                    >
                        <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    </Tooltip>
                    <Tooltip content="Remove">
                    <button
                        type="button"
                        onClick={() => onRemove(fieldIndex)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                    </Tooltip>
            </div>

            {/* Expanded Config */}
            {isExpanded && (
                <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-gray-700 space-y-3">
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
                        <span className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 dark:bg-gray-700 text-xs font-mono">
                            {getFieldIcon(field.type)}
                        </span>
                        {getFieldTypeLabel(field.type)}
                        {isCustomFieldMapped && mappedCf && (
                            <span className="ml-auto text-primary-600 dark:text-primary-400">
                                Mapped to: {mappedCf.name}
                            </span>
                        )}
                    </div>

                    <Input
                        label="Label"
                        id={`field-${fieldIndex}-label`}
                        value={field.label}
                        onChange={(e) => update('label', e.target.value)}
                        placeholder={isStatic ? 'Heading text...' : 'Field label'}
                    />

                    {!isStatic && !FILE_TYPES.includes(field.type) && (
                        <Input
                            label="Help Text"
                            id={`field-${fieldIndex}-help`}
                            value={field.help_text || ''}
                            onChange={(e) => update('help_text', e.target.value)}
                            placeholder="Optional help text"
                        />
                    )}

                    {field.type === 'attachment' && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Accepts images, videos, and Excel files. Max 5 files, 50MB each.
                        </p>
                    )}
                    {field.type === 'capture_photo' && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Opens device camera. User can capture up to 5 photos.
                        </p>
                    )}
                    {field.type === 'capture_video' && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Opens device camera. User can record 1 video, max 1 minute.
                        </p>
                    )}

                    {!isStatic && !FILE_TYPES.includes(field.type) && (
                        <DefaultValueInput field={field} fieldIndex={fieldIndex} onChange={update} customFields={customFields} />
                    )}

                    {!isStatic && (
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id={`field-${fieldIndex}-required`}
                                    checked={field.is_required || false}
                                    onChange={(e) => update('is_required', e.target.checked)}
                                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
                                />
                                <label htmlFor={`field-${fieldIndex}-required`} className="text-sm text-gray-700 dark:text-gray-300">Required</label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id={`field-${fieldIndex}-visible`}
                                    checked={field.is_visible !== false}
                                    onChange={(e) => update('is_visible', e.target.checked)}
                                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
                                />
                                <label htmlFor={`field-${fieldIndex}-visible`} className="text-sm text-gray-700 dark:text-gray-300">Visible on form</label>
                            </div>
                        </div>
                    )}

                    {/* Conditional Branching */}
                    {!isStatic && (
                        <FieldConditionsEditor
                            field={field}
                            fieldIndex={fieldIndex}
                            allFields={allFields}
                            customFields={customFields}
                            onChange={update}
                        />
                    )}

                    {/* Email mode selector */}
                    {field.type === 'email' && (
                        <Select
                            label="Email Mode"
                            id={`field-${fieldIndex}-email-mode`}
                            value={field.config?.email_mode || 'plain'}
                            onChange={(e) => {
                                const newMode = e.target.value;
                                const newConfig = { ...field.config, email_mode: newMode };
                                const updates = { config: newConfig };
                                if (newMode !== 'registered_user' && field.maps_to === 'assignee') {
                                    updates.maps_to = null;
                                }
                                onChange(fieldIndex, { ...field, ...updates });
                            }}
                            options={[
                                { value: 'plain', label: 'Plain email (validates format only)' },
                                { value: 'registered_user', label: 'Registered user (must match a user)' },
                            ]}
                        />
                    )}

                    {/* Maps To for non-custom-field items */}
                    {!isStatic && !isCustomFieldMapped && !FILE_TYPES.includes(field.type) && (
                        <Select
                            label="Maps To"
                            id={`field-${fieldIndex}-maps`}
                            value={field.maps_to || ''}
                            onChange={(e) => onChange(fieldIndex, { ...field, maps_to: e.target.value || null, custom_field_id: null })}
                            options={mapOptions}
                        />
                    )}

                    {/* Options for select/multi_select mapped to custom field */}
                    {['select', 'multi_select'].includes(field.type) && isCustomFieldMapped && mappedCf && (() => {
                        const opts = [...(mappedCf.options || [])].sort((a, b) =>
                            mappedCf.config?.sort_mode === 'manual' ? (a.position ?? 0) - (b.position ?? 0) : a.label.localeCompare(b.label)
                        );
                        if (!opts.length) return null;
                        return (
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                                    Options <span className="text-xs font-normal text-gray-400">(from custom field)</span>
                                </label>
                                <div className="space-y-1">
                                    {opts.map(opt => (
                                        <div key={opt.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-sm text-gray-700 dark:text-gray-300">
                                            {opt.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />}
                                            {opt.label}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Options editor for unmapped select/multi_select */}
                    {['select', 'multi_select'].includes(field.type) && !isCustomFieldMapped && (
                        <FieldOptionsEditor
                            options={field.config?.options || []}
                            onChange={(opts) => update('config', { ...field.config, options: opts })}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

// --- Default Value Input ---
function DefaultValueInput({ field, fieldIndex, onChange, customFields }) {
    const isCustomFieldMapped = field.maps_to === 'custom_field' && field.custom_field_id;
    const mappedCf = isCustomFieldMapped ? customFields?.find(cf => cf.id === field.custom_field_id) : null;

    switch (field.type) {
        case 'email':
            return (
                <Input
                    label="Default Value"
                    id={`field-${fieldIndex}-default`}
                    type="email"
                    value={field.default_value || ''}
                    onChange={(e) => onChange('default_value', e.target.value)}
                    placeholder="Default email (optional)"
                />
            );
        case 'text':
        case 'textarea':
            return (
                <Input
                    label="Default Value"
                    id={`field-${fieldIndex}-default`}
                    value={field.default_value || ''}
                    onChange={(e) => onChange('default_value', e.target.value)}
                    placeholder="Pre-filled value (optional)"
                />
            );
        case 'number':
            return (
                <Input
                    label="Default Value"
                    id={`field-${fieldIndex}-default`}
                    type="number"
                    value={field.default_value || ''}
                    onChange={(e) => onChange('default_value', e.target.value)}
                    placeholder="Default number (optional)"
                />
            );
        case 'date':
            return (
                <Input
                    label="Default Value"
                    id={`field-${fieldIndex}-default`}
                    type="date"
                    value={field.default_value || ''}
                    onChange={(e) => onChange('default_value', e.target.value)}
                />
            );
        case 'select': {
            const opts = isCustomFieldMapped && mappedCf
                ? [...(mappedCf.options || [])].sort((a, b) =>
                    mappedCf.config?.sort_mode === 'manual' ? (a.position ?? 0) - (b.position ?? 0) : a.label.localeCompare(b.label)
                ).map(o => ({ value: String(o.id), label: o.label }))
                : (field.config?.options || []).map(o => ({ value: o.value, label: o.label }));
            return (
                <Select
                    label="Default Value"
                    id={`field-${fieldIndex}-default`}
                    value={field.default_value || ''}
                    onChange={(e) => onChange('default_value', e.target.value)}
                    options={opts}
                    placeholder="— None —"
                />
            );
        }
        default:
            return null;
    }
}

// --- Field Options Editor ---
function FieldOptionsEditor({ options, onChange }) {
    const addOption = () => {
        onChange([...options, { label: '', value: String(options.length + 1) }]);
    };

    const updateOption = (i, label) => {
        const updated = [...options];
        updated[i] = { ...updated[i], label, value: label.toLowerCase().replace(/\s+/g, '_') || String(i + 1) };
        onChange(updated);
    };

    const removeOption = (i) => {
        onChange(options.filter((_, idx) => idx !== i));
    };

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">Options</label>
            {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                    <input
                        type="text"
                        value={opt.label}
                        onChange={(e) => updateOption(i, e.target.value)}
                        placeholder={`Option ${i + 1}`}
                        className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                    <button type="button" onClick={() => removeOption(i)} className="text-gray-400 hover:text-red-500">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            ))}
            <button type="button" onClick={addOption} className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700">
                + Add option
            </button>
        </div>
    );
}

// --- Condition Rule Row ---
function ConditionRuleRow({ rule, index, availableFields, onUpdate, onRemove }) {
    const selectedField = availableFields.find(f => f._conditionKey === rule.field_key);

    const getOperators = () => {
        if (!selectedField) return [{ value: 'equals', label: 'equals' }];
        switch (selectedField.type) {
            case 'text':
            case 'textarea':
            case 'email':
                return [
                    { value: 'equals', label: 'equals' },
                    { value: 'not_equals', label: 'does not equal' },
                    { value: 'contains', label: 'contains' },
                    { value: 'is_empty', label: 'is empty' },
                    { value: 'is_not_empty', label: 'is not empty' },
                ];
            case 'number':
                return [
                    { value: 'equals', label: 'equals' },
                    { value: 'not_equals', label: 'does not equal' },
                    { value: 'is_empty', label: 'is empty' },
                    { value: 'is_not_empty', label: 'is not empty' },
                ];
            case 'date':
                return [
                    { value: 'equals', label: 'equals' },
                    { value: 'not_equals', label: 'does not equal' },
                    { value: 'is_empty', label: 'is empty' },
                    { value: 'is_not_empty', label: 'is not empty' },
                ];
            case 'select':
            case 'multi_select':
                return [
                    { value: 'equals', label: 'equals' },
                    { value: 'not_equals', label: 'does not equal' },
                    { value: 'is_empty', label: 'is empty' },
                    { value: 'is_not_empty', label: 'is not empty' },
                ];
            default:
                return [
                    { value: 'equals', label: 'equals' },
                    { value: 'not_equals', label: 'does not equal' },
                ];
        }
    };

    const needsValue = !['is_empty', 'is_not_empty'].includes(rule.operator);

    const renderValueInput = () => {
        if (!needsValue) return null;

        if (selectedField && (selectedField.type === 'select' || selectedField.type === 'multi_select')) {
            // Get options from the field's config or mapped custom field
            const options = selectedField.config?.options || selectedField.options || [];
            return (
                <select
                    value={rule.value || ''}
                    onChange={(e) => onUpdate(index, { ...rule, value: e.target.value })}
                    className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                >
                    <option value="">Select...</option>
                    {options.map(opt => (
                        <option key={opt.id ?? opt.value} value={String(opt.id ?? opt.value)}>{opt.label}</option>
                    ))}
                </select>
            );
        }

        return (
            <input
                type={selectedField?.type === 'number' ? 'number' : selectedField?.type === 'date' ? 'date' : 'text'}
                value={rule.value || ''}
                onChange={(e) => onUpdate(index, { ...rule, value: e.target.value })}
                placeholder="Value..."
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
        );
    };

    return (
        <div className="flex items-center gap-2">
            <select
                value={rule.field_key || ''}
                onChange={(e) => onUpdate(index, { ...rule, field_key: e.target.value || '', value: '', operator: 'equals' })}
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            >
                <option value="">Select field...</option>
                {availableFields.map(f => (
                    <option key={f._conditionKey} value={f._conditionKey}>{f.label || 'Untitled'}</option>
                ))}
            </select>
            <select
                value={rule.operator || 'equals'}
                onChange={(e) => onUpdate(index, { ...rule, operator: e.target.value, ...(['is_empty', 'is_not_empty'].includes(e.target.value) ? { value: '' } : {}) })}
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            >
                {getOperators().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {renderValueInput()}
                <Tooltip content="Remove condition">
                <button
                    type="button"
                    onClick={() => onRemove(index)}
                    className="text-gray-400 hover:text-red-500 shrink-0"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                </Tooltip>
        </div>
    );
}

// --- Field Conditions Editor ---
function FieldConditionsEditor({ field, fieldIndex, allFields, customFields = [], onChange }) {
    const conditions = field.conditions || { logic: 'all', rules: [] };
    const rules = conditions.rules || [];

    // Show all non-static, non-attachment fields (except self)
    // Assign a stable _conditionKey: use `id:{id}` for saved fields, `pos:{index}` for unsaved
    const availableFields = allFields.map((f, i) => {
        const enriched = { ...f, _conditionKey: f.id ? `id:${f.id}` : `pos:${i}` };
        // For custom-field-mapped select fields, include options from the custom field
        if (f.maps_to === 'custom_field' && f.custom_field_id && ['select', 'multi_select'].includes(f.type)) {
            const cf = customFields.find(c => c.id === f.custom_field_id);
            if (cf?.options?.length) {
                enriched.options = cf.options;
            }
        }
        return enriched;
    }).filter((f, i) => {
        if (i === fieldIndex) return false;
        if (STATIC_TYPES.includes(f.type)) return false;
        if (FILE_TYPES.includes(f.type)) return false;
        return true;
    });

    const updateConditions = (updated) => {
        onChange('conditions', updated.rules?.length > 0 ? updated : null);
    };

    const addRule = () => {
        updateConditions({
            logic: conditions.logic || 'all',
            rules: [...rules, { field_key: '', operator: 'equals', value: '' }],
        });
    };

    const removeRule = (index) => {
        const newRules = rules.filter((_, i) => i !== index);
        updateConditions({ ...conditions, rules: newRules });
    };

    const updateRule = (index, updated) => {
        const newRules = [...rules];
        newRules[index] = updated;
        updateConditions({ ...conditions, rules: newRules });
    };

    const updateLogic = (logic) => {
        updateConditions({ ...conditions, logic });
    };

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                Conditions
                <span className="text-xs font-normal text-gray-400 ml-1">(show this field when...)</span>
            </label>

            {rules.length > 1 && (
                <select
                    value={conditions.logic || 'all'}
                    onChange={(e) => updateLogic(e.target.value)}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                >
                    <option value="all">All conditions are met</option>
                    <option value="any">Any condition is met</option>
                </select>
            )}

            <div className="space-y-2">
                {rules.map((rule, i) => (
                    <ConditionRuleRow
                        key={i}
                        rule={rule}
                        index={i}
                        availableFields={availableFields}
                        onUpdate={updateRule}
                        onRemove={removeRule}
                    />
                ))}
            </div>

            {availableFields.length > 0 && (
                <button
                    type="button"
                    onClick={addRule}
                    className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700"
                >
                    + Add condition
                </button>
            )}
        </div>
    );
}

// --- Add from Custom Fields Modal ---
function CustomFieldsModal({ isOpen, onClose, customFields, currentFields, onUpdate }) {
    const getCheckedIds = () => {
        return new Set(currentFields.filter(f => f.maps_to === 'custom_field' && f.custom_field_id).map(f => f.custom_field_id));
    };

    const [checkedIds, setCheckedIds] = useState(getCheckedIds);

    // Sync when modal opens
    const prevOpen = useRef(false);
    if (isOpen && !prevOpen.current) {
        const newIds = getCheckedIds();
        if ([...newIds].join(',') !== [...checkedIds].join(',')) {
            setCheckedIds(newIds);
        }
    }
    prevOpen.current = isOpen;

    const toggleField = (cfId) => {
        setCheckedIds(prev => {
            const next = new Set(prev);
            if (next.has(cfId)) {
                next.delete(cfId);
            } else {
                next.add(cfId);
            }
            return next;
        });
    };

    const deselectAll = () => setCheckedIds(new Set());

    const handleUpdate = () => {
        // Remove unchecked custom field mappings
        let newFields = currentFields.filter(f => {
            if (f.maps_to === 'custom_field' && f.custom_field_id) {
                return checkedIds.has(f.custom_field_id);
            }
            return true;
        });

        // Add newly checked custom fields
        const existingCfIds = new Set(newFields.filter(f => f.maps_to === 'custom_field').map(f => f.custom_field_id));
        checkedIds.forEach(cfId => {
            if (!existingCfIds.has(cfId)) {
                const cf = customFields.find(c => c.id === cfId);
                if (!cf) return;
                const formType = CUSTOM_FIELD_TYPE_MAP[cf.type] || 'text';
                newFields.push({
                    type: formType,
                    label: cf.name,
                    help_text: '',
                    is_required: cf.is_required || false,
                    position: newFields.length,
                    config: null,
                    default_value: null,
                    is_visible: true,
                    conditions: null,
                    maps_to: 'custom_field',
                    custom_field_id: cf.id,
                });
            }
        });

        // Re-index positions
        newFields = newFields.map((f, i) => ({ ...f, position: i }));
        onUpdate(newFields);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Added to form" size="lg">
            <div className="mb-4 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 pb-2">
                <span className="font-medium">Field</span>
                <button type="button" onClick={deselectAll} className="text-primary-600 dark:text-primary-400 hover:text-primary-700 text-xs">
                    Deselect all
                </button>
            </div>
            <div className="space-y-1 max-h-96 overflow-y-auto styled-scrollbar">
                {customFields.map(cf => {
                    const icon = getFieldIcon(CUSTOM_FIELD_TYPE_MAP[cf.type] || 'text');
                    const opts = [...(cf.options || [])].sort((a, b) =>
                        cf.config?.sort_mode === 'manual' ? (a.position ?? 0) - (b.position ?? 0) : a.label.localeCompare(b.label)
                    );
                    const showOpts = opts.slice(0, 3);
                    const moreCount = opts.length - showOpts.length;

                    return (
                        <label
                            key={cf.id}
                            className="flex items-start gap-3 px-3 py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer border-b border-gray-100 dark:border-gray-700/50 last:border-0"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 dark:bg-gray-700 text-xs font-mono text-gray-500 dark:text-gray-400 shrink-0">
                                        {icon}
                                    </span>
                                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                                        {cf.name}
                                    </span>
                                </div>
                                {opts.length > 0 ? (
                                    <div className="flex items-center gap-2 mt-1 ml-7 flex-wrap">
                                        {showOpts.map(opt => (
                                            <span key={opt.id} className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                                                {opt.color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: opt.color }} />}
                                                {opt.label}
                                            </span>
                                        ))}
                                        {moreCount > 0 && (
                                            <span className="text-xs text-gray-400 dark:text-gray-500">+{moreCount}</span>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 ml-7">No description provided</p>
                                )}
                            </div>
                            <input
                                type="checkbox"
                                checked={checkedIds.has(cf.id)}
                                onChange={() => toggleField(cf.id)}
                                className="mt-1 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 shrink-0"
                            />
                        </label>
                    );
                })}
                {customFields.length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                        No custom fields defined for this project.
                    </p>
                )}
            </div>
            <div className="flex justify-end mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                <Button onClick={handleUpdate}>Update</Button>
            </div>
        </Modal>
    );
}

// --- Settings Tab ---
function SettingsTab({ fields, sections, taskDefaults, onTaskDefaultsChange }) {
    const [titleDropdownOpen, setTitleDropdownOpen] = useState(false);
    const titleBtnRef = useRef(null);
    const titleDropdownRef = useRef(null);
    const [titlePos, setTitlePos] = useState({ top: 0, left: 0, width: 0 });

    const nonStaticFields = fields.filter(f => !STATIC_TYPES.includes(f.type) && !FILE_TYPES.includes(f.type));
    const titleFieldIds = taskDefaults?.title_field_ids || [];

    const toggleTitleField = (position) => {
        const next = titleFieldIds.includes(position)
            ? titleFieldIds.filter(p => p !== position)
            : [...titleFieldIds, position];
        onTaskDefaultsChange({ ...taskDefaults, title_field_ids: next });
    };

    const titleLabelParts = nonStaticFields
        .filter(f => titleFieldIds.includes(f.position))
        .map(f => f.label || 'Untitled');
    if (titleFieldIds.includes('assignee')) {
        titleLabelParts.unshift('Assignee');
    }
    const titleLabel = titleLabelParts.length > 0 ? titleLabelParts.join(', ') : 'Form name (default)';

    const updateTitlePos = useCallback(() => {
        if (titleBtnRef.current) {
            const rect = titleBtnRef.current.getBoundingClientRect();
            const dropdownMaxH = 240; // max-h-60 = 15rem = 240px
            const spaceBelow = window.innerHeight - rect.bottom;
            const openUp = spaceBelow < dropdownMaxH && rect.top > dropdownMaxH;
            setTitlePos({
                top: openUp ? rect.top - dropdownMaxH - 4 : rect.bottom + 4,
                left: rect.left,
                width: rect.width,
            });
        }
    }, []);

    useEffect(() => {
        if (!titleDropdownOpen) return;
        updateTitlePos();
        window.addEventListener('scroll', updateTitlePos, true);
        window.addEventListener('resize', updateTitlePos);
        const handleClickOutside = (e) => {
            if (titleDropdownRef.current && !titleDropdownRef.current.contains(e.target) && !titleBtnRef.current.contains(e.target)) {
                setTitleDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            window.removeEventListener('scroll', updateTitlePos, true);
            window.removeEventListener('resize', updateTitlePos);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [titleDropdownOpen, updateTitlePos]);

    return (
        <div className="space-y-6">
            <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Task settings</h4>

                {/* Section selector */}
                <div className="mb-4">
                    <Select
                        label="Select a section for tasks"
                        id="task-section"
                        value={taskDefaults?.section_id || ''}
                        onChange={(e) => onTaskDefaultsChange({ ...taskDefaults, section_id: e.target.value || null })}
                        options={(sections || []).map(s => ({ value: s.id, label: s.name }))}
                        placeholder="— No section —"
                    />
                </div>

                {/* Task title field selector */}
                <div>
                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                        Select fields for task titles
                    </label>
                    <button
                        ref={titleBtnRef}
                        type="button"
                        onClick={() => setTitleDropdownOpen(!titleDropdownOpen)}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm text-left rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                    >
                        <span className="truncate">{titleLabel}</span>
                        <svg className={`w-4 h-4 shrink-0 ml-2 transition-transform ${titleDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {titleDropdownOpen && createPortal(
                        <div
                            ref={titleDropdownRef}
                            className="fixed z-9999 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto styled-scrollbar animate-slide-down"
                            style={{ top: titlePos.top, left: titlePos.left, width: titlePos.width }}
                        >
                            <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer text-sm text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-gray-700">
                                <input
                                    type="checkbox"
                                    checked={titleFieldIds.includes('assignee')}
                                    onChange={() => toggleTitleField('assignee')}
                                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
                                />
                                <span className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 dark:bg-gray-700 text-xs font-mono text-gray-500 dark:text-gray-400 shrink-0">
                                    @
                                </span>
                                <span className="flex-1">
                                    Assignee
                                    <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">(blank if unassigned)</span>
                                </span>
                            </label>
                            {nonStaticFields.length === 0 ? (
                                <p className="text-sm text-gray-500 dark:text-gray-400 p-3 text-center">No fields available</p>
                            ) : (
                                nonStaticFields.map(f => (
                                    <label
                                        key={f.position}
                                        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer text-sm text-gray-700 dark:text-gray-300"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={titleFieldIds.includes(f.position)}
                                            onChange={() => toggleTitleField(f.position)}
                                            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
                                        />
                                        <span className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 dark:bg-gray-700 text-xs font-mono text-gray-500 dark:text-gray-400 shrink-0">
                                            {getFieldIcon(f.type)}
                                        </span>
                                        {f.label || 'Untitled'}
                                    </label>
                                ))
                            )}
                        </div>,
                        document.body
                    )}
                </div>
            </div>
        </div>
    );
}

// --- Add Field Dropdown ---
function AddFieldDropdown({ onAdd }) {
    const [open, setOpen] = useState(false);
    const btnRef = useRef(null);
    const dropdownRef = useRef(null);
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

    const updatePos = useCallback(() => {
        if (btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            const dropdownHeight = FIELD_TYPES.length * 36 + 8; // approx height
            const spaceBelow = window.innerHeight - rect.bottom;
            const openUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
            setPos({
                top: openUp ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
                left: rect.left,
                width: rect.width,
            });
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        updatePos();
        window.addEventListener('scroll', updatePos, true);
        window.addEventListener('resize', updatePos);
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target) && !btnRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            window.removeEventListener('scroll', updatePos, true);
            window.removeEventListener('resize', updatePos);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [open, updatePos]);

    return (
        <div>
            <button
                ref={btnRef}
                type="button"
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-center gap-1 px-3 py-2.5 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-400 dark:hover:border-primary-500 transition-colors"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add question
            </button>
            {open && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed z-9999 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden animate-slide-down"
                    style={{ top: pos.top, left: pos.left, width: pos.width }}
                >
                    {FIELD_TYPES.map(type => (
                        <button
                            key={type.value}
                            type="button"
                            onClick={() => { onAdd(type.value); setOpen(false); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                            <span className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 dark:bg-gray-700 text-xs font-mono text-gray-500 dark:text-gray-400">
                                {type.icon}
                            </span>
                            {type.label}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
}

// --- Main FormBuilder ---
export default function FormBuilder({ fields = [], onChange, customFields = [], sections = [], taskDefaults = {}, onTaskDefaultsChange, errors = {} }) {
    const safeFields = Array.isArray(fields) ? fields : [];
    const safeCustomFields = Array.isArray(customFields) ? customFields : [];
    const safeSections = Array.isArray(sections) ? sections : [];

    const [activeTab, setActiveTab] = useState('questions');
    const [expandedIndex, setExpandedIndex] = useState(null);
    const [deleteIndex, setDeleteIndex] = useState(null);
    const [cfModalOpen, setCfModalOpen] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const addField = (type) => {
        const newField = {
            type,
            label: '',
            help_text: '',
            is_required: false,
            position: safeFields.length,
            config: type === 'email' ? { email_mode: 'plain' } : null,
            default_value: null,
            is_visible: true,
            conditions: null,
            maps_to: null,
            custom_field_id: null,
        };
        const newFields = [...safeFields, newField];
        onChange(newFields);
        setExpandedIndex(newFields.length - 1);
    };

    const updateField = (index, updatedField) => {
        const newFields = [...fields];
        newFields[index] = updatedField;
        onChange(newFields);
    };

    const removeField = (index) => {
        const removedField = fields[index];
        const removedKey = removedField?.id ? `id:${removedField.id}` : `pos:${index}`;
        let newFields = fields.filter((_, i) => i !== index);

        // Clean up conditions referencing the removed field and update pos: keys
        newFields = newFields.map((f, newIdx) => {
            if (!f.conditions?.rules?.length) return f;
            const filteredRules = f.conditions.rules
                .filter(r => r.field_key !== removedKey)
                .map(r => {
                    // Update pos: references since indices shifted
                    if (r.field_key?.startsWith('pos:')) {
                        const oldPos = parseInt(r.field_key.split(':')[1]);
                        if (oldPos > index) return { ...r, field_key: `pos:${oldPos - 1}` };
                    }
                    return r;
                });
            return {
                ...f,
                conditions: filteredRules.length > 0 ? { ...f.conditions, rules: filteredRules } : null,
            };
        });

        onChange(newFields.map((f, i) => ({ ...f, position: i })));
        setDeleteIndex(null);
        if (expandedIndex === index) setExpandedIndex(null);
        else if (expandedIndex > index) setExpandedIndex(expandedIndex - 1);
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = parseInt(active.id.replace('field-', ''));
        const newIndex = parseInt(over.id.replace('field-', ''));

        // Build position mapping for pos: condition references
        const posMapping = {};
        fields.forEach((_, i) => {
            let dest = i;
            if (i === oldIndex) dest = newIndex;
            else if (oldIndex < newIndex && i > oldIndex && i <= newIndex) dest = i - 1;
            else if (oldIndex > newIndex && i >= newIndex && i < oldIndex) dest = i + 1;
            posMapping[i] = dest;
        });

        const newFields = arrayMove(fields, oldIndex, newIndex).map((f, i) => {
            const updated = { ...f, position: i };
            // Update pos: references in conditions
            if (updated.conditions?.rules?.length) {
                updated.conditions = {
                    ...updated.conditions,
                    rules: updated.conditions.rules.map(r => {
                        if (r.field_key?.startsWith('pos:')) {
                            const oldPos = parseInt(r.field_key.split(':')[1]);
                            if (posMapping[oldPos] !== undefined) {
                                return { ...r, field_key: `pos:${posMapping[oldPos]}` };
                            }
                        }
                        return r;
                    }),
                };
            }
            return updated;
        });
        onChange(newFields);

        // Update expanded index if needed
        if (expandedIndex === oldIndex) setExpandedIndex(newIndex);
        else if (expandedIndex !== null) {
            if (oldIndex < expandedIndex && newIndex >= expandedIndex) setExpandedIndex(expandedIndex - 1);
            else if (oldIndex > expandedIndex && newIndex <= expandedIndex) setExpandedIndex(expandedIndex + 1);
        }
    };

    const sortableIds = safeFields.map((_, i) => `field-${i}`);

    return (
        <div>
            {/* Tabs */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
                <button
                    type="button"
                    onClick={() => setActiveTab('questions')}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'questions'
                            ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                            : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    Questions
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('settings')}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'settings'
                            ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                            : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    Settings
                </button>
            </div>

            {/* Questions Tab */}
            {activeTab === 'questions' && (
                <div className="space-y-3">
                    {safeFields.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Add questions to your form using the buttons below.
                            </p>
                        </div>
                    ) : (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                                {safeFields.map((field, i) => (
                                    <SortableFieldRow
                                        key={`field-${i}`}
                                        field={field}
                                        fieldIndex={i}
                                        isExpanded={expandedIndex === i}
                                        onToggleExpand={(idx) => setExpandedIndex(expandedIndex === idx ? null : idx)}
                                        onRemove={(idx) => setDeleteIndex(idx)}
                                        customFields={safeCustomFields}
                                        allFields={safeFields}
                                        onChange={updateField}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    )}

                    <AddFieldDropdown onAdd={addField} />

                    {safeCustomFields.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setCfModalOpen(true)}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-400 dark:hover:border-primary-500 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                            </svg>
                            Add from custom fields
                        </button>
                    )}
                </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
                <SettingsTab
                    fields={safeFields}
                    sections={safeSections}
                    taskDefaults={taskDefaults}
                    onTaskDefaultsChange={onTaskDefaultsChange}
                />
            )}

            {/* Custom Fields Modal */}
            <CustomFieldsModal
                isOpen={cfModalOpen}
                onClose={() => setCfModalOpen(false)}
                customFields={safeCustomFields}
                currentFields={safeFields}
                onUpdate={onChange}
            />

            {/* Delete Confirmation */}
            <ConfirmModal
                isOpen={deleteIndex !== null}
                onClose={() => setDeleteIndex(null)}
                onConfirm={() => removeField(deleteIndex)}
                title="Remove Field"
                message="Are you sure you want to remove this field from the form?"
                confirmLabel="Remove"
            />
        </div>
    );
}
