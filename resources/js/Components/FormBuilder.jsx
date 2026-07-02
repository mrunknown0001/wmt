import { useState } from 'react';
import Input from './Input';
import Select from './Select';
import Textarea from './Textarea';
import Button from './Button';
import { ConfirmModal } from './Modal';

const FIELD_TYPES = [
    { value: 'text', label: 'Text Input', icon: 'T' },
    { value: 'textarea', label: 'Text Area', icon: 'P' },
    { value: 'number', label: 'Number', icon: '#' },
    { value: 'date', label: 'Date', icon: 'D' },
    { value: 'select', label: 'Dropdown', icon: 'v' },
    { value: 'multi_select', label: 'Multi Select', icon: 'M' },
    { value: 'heading', label: 'Heading', icon: 'H' },
    { value: 'description', label: 'Description', icon: 'i' },
];

const STATIC_TYPES = ['heading', 'description'];

function FieldConfigPanel({ field, index, customFields, onChange, onRemove, onMove, isFirst, isLast }) {
    const update = (key, value) => {
        onChange(index, { ...field, [key]: value });
    };

    const isStatic = STATIC_TYPES.includes(field.type);

    // Build mapping options
    const mapOptions = [
        { value: '', label: 'No mapping (static)' },
        { value: 'title', label: 'Task Title' },
        { value: 'description', label: 'Task Description' },
    ];
    if (customFields?.length > 0) {
        customFields.forEach(cf => {
            mapOptions.push({ value: `custom_field:${cf.id}`, label: `Custom: ${cf.name}` });
        });
    }

    const currentMapValue = field.maps_to === 'custom_field' && field.custom_field_id
        ? `custom_field:${field.custom_field_id}`
        : (field.maps_to || '');

    const handleMapChange = (val) => {
        if (val.startsWith('custom_field:')) {
            const cfId = parseInt(val.split(':')[1]);
            update('maps_to', 'custom_field');
            onChange(index, { ...field, maps_to: 'custom_field', custom_field_id: cfId });
        } else {
            onChange(index, { ...field, maps_to: val || null, custom_field_id: null });
        }
    };

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 dark:bg-gray-700 text-xs font-mono text-gray-600 dark:text-gray-400">
                        {FIELD_TYPES.find(t => t.value === field.type)?.icon || '?'}
                    </span>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {FIELD_TYPES.find(t => t.value === field.type)?.label || field.type}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => onMove(index, -1)}
                        disabled={isFirst}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 transition-colors"
                        title="Move up"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                    </button>
                    <button
                        type="button"
                        onClick={() => onMove(index, 1)}
                        disabled={isLast}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 transition-colors"
                        title="Move down"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    <button
                        type="button"
                        onClick={() => onRemove(index)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        title="Remove"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </div>
            </div>

            <div className="space-y-3">
                <Input
                    label="Label"
                    id={`field-${index}-label`}
                    value={field.label}
                    onChange={(e) => update('label', e.target.value)}
                    placeholder={isStatic ? 'Heading text...' : 'Field label'}
                />

                {!isStatic && (
                    <>
                        <Input
                            label="Help Text"
                            id={`field-${index}-help`}
                            value={field.help_text || ''}
                            onChange={(e) => update('help_text', e.target.value)}
                            placeholder="Optional help text for this field"
                        />
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id={`field-${index}-required`}
                                checked={field.is_required || false}
                                onChange={(e) => update('is_required', e.target.checked)}
                                className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
                            />
                            <label htmlFor={`field-${index}-required`} className="text-sm text-gray-700 dark:text-gray-300">Required</label>
                        </div>
                        <Select
                            label="Maps To"
                            id={`field-${index}-maps`}
                            value={currentMapValue}
                            onChange={(e) => handleMapChange(e.target.value)}
                            options={mapOptions}
                        />
                    </>
                )}

                {/* Options for select/multi_select without custom field mapping */}
                {['select', 'multi_select'].includes(field.type) && field.maps_to !== 'custom_field' && (
                    <FieldOptionsEditor
                        options={field.config?.options || []}
                        onChange={(opts) => update('config', { ...field.config, options: opts })}
                    />
                )}
            </div>
        </div>
    );
}

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

export default function FormBuilder({ fields, onChange, customFields = [], errors = {} }) {
    const [deleteIndex, setDeleteIndex] = useState(null);

    const addField = (type) => {
        const newField = {
            type,
            label: '',
            help_text: '',
            is_required: false,
            position: fields.length,
            config: null,
            maps_to: null,
            custom_field_id: null,
        };
        onChange([...fields, newField]);
    };

    const updateField = (index, updatedField) => {
        const newFields = [...fields];
        newFields[index] = updatedField;
        onChange(newFields);
    };

    const removeField = (index) => {
        onChange(fields.filter((_, i) => i !== index).map((f, i) => ({ ...f, position: i })));
        setDeleteIndex(null);
    };

    const moveField = (index, direction) => {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= fields.length) return;
        const newFields = [...fields];
        [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
        onChange(newFields.map((f, i) => ({ ...f, position: i })));
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Field Palette */}
            <div className="lg:col-span-1">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Add Field</h4>
                <div className="space-y-1">
                    {FIELD_TYPES.map(type => (
                        <button
                            key={type.value}
                            type="button"
                            onClick={() => addField(type.value)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300 transition-colors"
                        >
                            <span className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 dark:bg-gray-700 text-xs font-mono text-gray-500 dark:text-gray-400">
                                {type.icon}
                            </span>
                            {type.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Form Canvas */}
            <div className="lg:col-span-3">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    Form Fields ({fields.length})
                </h4>
                {fields.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Click a field type from the palette to add it to your form.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {fields.map((field, i) => (
                            <FieldConfigPanel
                                key={i}
                                field={field}
                                index={i}
                                customFields={customFields}
                                onChange={updateField}
                                onRemove={(idx) => setDeleteIndex(idx)}
                                onMove={moveField}
                                isFirst={i === 0}
                                isLast={i === fields.length - 1}
                            />
                        ))}
                    </div>
                )}
            </div>

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
