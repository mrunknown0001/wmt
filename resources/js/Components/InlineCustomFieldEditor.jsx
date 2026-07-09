import { useEffect, useRef, useState } from 'react';
import InlinePopover from './InlinePopover';
import InlineDatePicker from './InlineDatePicker';
import Tooltip from './Tooltip';
import { formatFormulaResult } from '../formulaEngine';

function SelectOptions({ options, selectedId, onSelect }) {
    return (
        <div className="py-1 min-w-[160px] max-h-60 overflow-y-auto scrollbar-thin">
            <button
                onClick={() => onSelect(null)}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
                Clear
            </button>
            {options.map((opt) => (
                <button
                    key={opt.id}
                    onClick={() => onSelect(opt.id)}
                    className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors ${
                        String(selectedId) === String(opt.id)
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                    {opt.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />}
                    {opt.label}
                    {String(selectedId) === String(opt.id) && (
                        <svg className="w-4 h-4 ml-auto text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                </button>
            ))}
        </div>
    );
}

function MultiSelectOptions({ options, selectedIds = [], onToggle, onDone }) {
    return (
        <div className="py-1 min-w-[160px]">
            <div className="max-h-60 overflow-y-auto scrollbar-thin">
                {options.map((opt) => {
                    const checked = selectedIds.map(String).includes(String(opt.id));
                    return (
                        <button
                            key={opt.id}
                            onClick={() => onToggle(opt.id)}
                            className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                checked
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'border-gray-300 dark:border-gray-600'
                            }`}>
                                {checked && (
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </span>
                            {opt.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />}
                            {opt.label}
                        </button>
                    );
                })}
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-2 flex justify-between">
                <button
                    onClick={() => onToggle(null, 'clear')}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                    Clear all
                </button>
                <button
                    onClick={onDone}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
                >
                    Done
                </button>
            </div>
        </div>
    );
}

function TextNumberEditor({ value, type, onSave, onClose }) {
    const [draft, setDraft] = useState(value ?? '');
    const draftRef = useRef(draft);
    const resolvedRef = useRef(false);
    const onSaveRef = useRef(onSave);
    const valueRef = useRef(value);

    draftRef.current = draft;
    onSaveRef.current = onSave;
    valueRef.current = value;

    // Auto-save on unmount (triggered by outside click closing the popover)
    useEffect(() => {
        return () => {
            if (!resolvedRef.current) {
                const newVal = draftRef.current === '' ? null : draftRef.current;
                const oldVal = valueRef.current ?? null;
                if (String(newVal ?? '') !== String(oldVal ?? '')) {
                    onSaveRef.current(newVal);
                }
            }
        };
    }, []);

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            resolvedRef.current = true;
            onClose();
        } else if (e.key === 'Enter' && type !== 'textarea') {
            resolvedRef.current = true;
            onSave(draft === '' ? null : draft);
        }
    };

    const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";

    return (
        <div className={`p-2 ${type === 'textarea' ? 'min-w-70' : 'min-w-45'}`}>
            {type === 'textarea' ? (
                <textarea
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    maxLength={10000}
                    className={`${inputClass} resize-y min-h-20`}
                    placeholder="Enter text..."
                    rows={3}
                />
            ) : (
                <input
                    autoFocus
                    type={type === 'number' ? 'number' : 'text'}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className={inputClass}
                    placeholder={type === 'number' ? 'Enter number...' : 'Enter text...'}
                    {...(type === 'number' ? { max: 99999999999, min: -99999999999 } : { maxLength: 255 })}
                />
            )}
            <div className="flex justify-end gap-2 mt-2">
                <button
                    onClick={() => { resolvedRef.current = true; onClose(); }}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                    Cancel
                </button>
                <button
                    onClick={() => { resolvedRef.current = true; onSave(draft === '' ? null : draft); }}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
                >
                    Save
                </button>
            </div>
        </div>
    );
}

function DisplayValue({ customField, cfv, formatDate }) {
    if (customField.type === 'formula') {
        const val = customField._formulaValue;
        if (val == null) return <span className="text-gray-300 dark:text-gray-600">—</span>;
        return <span>{formatFormulaResult(val, customField.config)}</span>;
    }

    if (!cfv) return <span className="text-gray-300 dark:text-gray-600">—</span>;

    switch (customField.type) {
        case 'text':
        case 'textarea':
            return <Tooltip content={cfv.value_text || undefined}><span className={customField.type === 'textarea' ? 'line-clamp-2' : 'truncate block max-w-xs'}>{cfv.value_text || '—'}</span></Tooltip>;
        case 'number':
            if (cfv.value_number == null) return <span>—</span>;
            return <span>{customField.config?.decimal_places != null
                ? Number(cfv.value_number).toFixed(customField.config.decimal_places)
                : cfv.value_number}</span>;
        case 'date':
            return <span>{cfv.value_date ? formatDate(cfv.value_date) : '—'}</span>;
        case 'single_select': {
            const opt = cfv.selected_option;
            if (!opt) return <span className="text-gray-300 dark:text-gray-600">—</span>;
            return (
                <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    style={opt.color ? { backgroundColor: opt.color + '20', color: opt.color } : undefined}
                >
                    {opt.color && <span className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: opt.color }} />}
                    {opt.label}
                </span>
            );
        }
        case 'multi_select': {
            const selectedIds = cfv.value_json || [];
            if (!selectedIds.length) return <span className="text-gray-300 dark:text-gray-600">—</span>;
            const options = (customField.options || []).filter(o => selectedIds.map(String).includes(String(o.id)));
            return (
                <div className="flex flex-wrap gap-1">
                    {options.map(opt => (
                        <span
                            key={opt.id}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                            style={opt.color ? { backgroundColor: opt.color + '20', color: opt.color } : undefined}
                        >
                            {opt.color && <span className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: opt.color }} />}
                            {opt.label}
                        </span>
                    ))}
                </div>
            );
        }
        default:
            return <span className="text-gray-300 dark:text-gray-600">—</span>;
    }
}

export default function InlineCustomFieldEditor({ task, customField, isOpen, onToggle, onUpdate, formatDate: formatDateFn }) {
    const anchorRef = useRef(null);
    const cfValues = task.custom_field_values || [];
    const cfv = cfValues.find(v => v.custom_field_id === customField.id);

    // Formula fields are read-only — no inline editing
    if (customField.type === 'formula') {
        return (
            <span className="text-sm text-gray-700 dark:text-gray-300">
                <DisplayValue customField={customField} cfv={cfv} formatDate={formatDateFn} />
            </span>
        );
    }

    const handleSave = (value) => {
        onToggle(false);
        onUpdate(task.id, customField.id, customField.type, value);
    };

    // Date uses its own InlineDatePicker
    if (customField.type === 'date') {
        return (
            <InlineDatePicker
                currentDate={cfv?.value_date || null}
                isOpen={isOpen}
                onToggle={onToggle}
                onSelect={(dateStr) => handleSave(dateStr)}
            />
        );
    }

    const currentValue = (() => {
        if (!cfv) return null;
        switch (customField.type) {
            case 'text': case 'textarea': return cfv.value_text;
            case 'number': return cfv.value_number;
            case 'single_select': return cfv.value_option_id;
            case 'multi_select': return cfv.value_json || [];
            default: return null;
        }
    })();

    return (
        <>
            <button
                ref={anchorRef}
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="cursor-pointer text-left w-full rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:ring-1 hover:ring-blue-200 dark:hover:ring-blue-700/60 transition-all"
            >
                <DisplayValue customField={customField} cfv={cfv} formatDate={formatDateFn} />
            </button>
            <InlinePopover isOpen={isOpen} onClose={() => onToggle(false)} anchorRef={anchorRef}>
                {(customField.type === 'text' || customField.type === 'textarea' || customField.type === 'number') && (
                    <TextNumberEditor
                        value={currentValue}
                        type={customField.type}
                        onSave={handleSave}
                        onClose={() => onToggle(false)}
                    />
                )}
                {customField.type === 'single_select' && (
                    <SelectOptions
                        options={[...(customField.options || [])].sort((a, b) => a.label.localeCompare(b.label))}
                        selectedId={currentValue}
                        onSelect={handleSave}
                    />
                )}
                {customField.type === 'multi_select' && (
                    <MultiSelectEditor
                        options={[...(customField.options || [])].sort((a, b) => a.label.localeCompare(b.label))}
                        selectedIds={currentValue || []}
                        onSave={handleSave}
                        onClose={() => onToggle(false)}
                    />
                )}
            </InlinePopover>
        </>
    );
}

function MultiSelectEditor({ options, selectedIds, onSave, onClose }) {
    const [draft, setDraft] = useState([...selectedIds.map(String)]);

    const handleToggle = (id, action) => {
        if (action === 'clear') {
            setDraft([]);
            return;
        }
        const idStr = String(id);
        setDraft((prev) =>
            prev.includes(idStr) ? prev.filter((x) => x !== idStr) : [...prev, idStr]
        );
    };

    return (
        <MultiSelectOptions
            options={options}
            selectedIds={draft}
            onToggle={handleToggle}
            onDone={() => {
                onSave(draft.length > 0 ? draft.map(Number) : null);
            }}
        />
    );
}
