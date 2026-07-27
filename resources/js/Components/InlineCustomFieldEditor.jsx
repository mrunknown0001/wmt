import { useEffect, useRef, useState } from 'react';
import InlinePopover from './InlinePopover';
import InlineDatePicker from './InlineDatePicker';
import Tooltip from './Tooltip';
import PeoplePicker, { loadPeopleOptions } from './PeoplePicker';
import { formatFormulaResult } from '../formulaEngine';

/** ISO-8601 week of a date, matching Carbon's isoWeek()/isoWeekYear(). */
function isoWeekLabel(dateStr) {
    if (!dateStr) return null;
    const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return null;
    // Shift to the Thursday of this week — the ISO year is whichever year holds it.
    const target = new Date(d.getTime());
    target.setDate(target.getDate() - ((d.getDay() + 6) % 7) + 3);
    const isoYear = target.getFullYear();
    const firstThursday = new Date(isoYear, 0, 4);
    firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);
    const week = 1 + Math.round((target - firstThursday) / (7 * 24 * 60 * 60 * 1000));
    return `Week ${week}, ${isoYear}`;
}

function SelectOptions({ options, selectedId, onSelect }) {
    return (
        <div className="py-1 min-w-[160px] max-w-xs max-h-60 overflow-y-auto scrollbar-thin">
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
                    className={`w-full text-left px-3 py-1.5 text-sm flex items-start gap-2 transition-colors ${
                        String(selectedId) === String(opt.id)
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                    {opt.color && <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: opt.color }} />}
                    <span className="break-word flex-1">
                        {opt.label}
                    </span>
                    {String(selectedId) === String(opt.id) && (
                        <svg className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
        <div className="py-1 min-w-[160px] max-w-xs">
            <div className="max-h-60 overflow-y-auto scrollbar-thin">
                {options.map((opt) => {
                    const checked = selectedIds.map(String).includes(String(opt.id));
                    return (
                        <button
                            key={opt.id}
                            onClick={() => onToggle(opt.id)}
                            className="w-full text-left px-3 py-1.5 text-sm flex items-start gap-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
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
                            {opt.color && <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: opt.color }} />}
                            <span className="break-word flex-1">
                                {opt.label}
                            </span>
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

    const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 break-word";

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
            return <Tooltip content={cfv.value_text || undefined}><span className={customField.type === 'textarea' ? 'line-clamp-2' : 'truncate block max-w-xs mx-auto'}>{cfv.value_text || '—'}</span></Tooltip>;
        case 'number':
            if (cfv.value_number == null) return <span>—</span>;
            return <span>{customField.config?.decimal_places != null
                ? Number(cfv.value_number).toFixed(customField.config.decimal_places)
                : cfv.value_number}</span>;
        case 'date':
            return <span>{cfv.value_date ? formatDate(cfv.value_date) : '—'}</span>;
        case 'week_of_year': {
            const label = isoWeekLabel(cfv.value_date);
            if (!label) return <span className="text-gray-300 dark:text-gray-600">—</span>;
            // The underlying date is worth surfacing — the week alone is ambiguous.
            return <Tooltip content={formatDate(cfv.value_date)}><span>{label}</span></Tooltip>;
        }
        case 'people': {
            // people_names is a comma-joined string appended by the value model.
            const names = cfv.people_names;
            if (!names) return <span className="text-gray-300 dark:text-gray-600">—</span>;
            return <Tooltip content={names}><span className="truncate block max-w-xs mx-auto">{names}</span></Tooltip>;
        }
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
                <div className="flex flex-wrap justify-center gap-1">
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

    const handleSave = (value, meta) => {
        onToggle(false);
        onUpdate(task.id, customField.id, customField.type, value, meta);
    };

    // Date uses its own InlineDatePicker
    // Week of year stores a reference date, so it edits with the same picker.
    if (customField.type === 'date' || customField.type === 'week_of_year') {
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
            case 'people': return cfv.value_json || [];
            default: return null;
        }
    })();

    return (
        <>
            <button
                ref={anchorRef}
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="cursor-pointer text-center w-full rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:ring-1 hover:ring-blue-200 dark:hover:ring-blue-700/60 transition-all"
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
                        options={[...(customField.options || [])].sort((a, b) =>
                            customField.config?.sort_mode === 'manual' ? (a.position ?? 0) - (b.position ?? 0) : a.label.localeCompare(b.label)
                        )}
                        selectedId={currentValue}
                        onSelect={handleSave}
                    />
                )}
                {customField.type === 'people' && (
                    <PeopleEditor
                        scope={customField.config}
                        selectedIds={currentValue || []}
                        onSave={handleSave}
                        onClose={() => onToggle(false)}
                    />
                )}
                {customField.type === 'multi_select' && (
                    <MultiSelectEditor
                        options={[...(customField.options || [])].sort((a, b) =>
                            customField.config?.sort_mode === 'manual' ? (a.position ?? 0) - (b.position ?? 0) : a.label.localeCompare(b.label)
                        )}
                        selectedIds={currentValue || []}
                        onSave={handleSave}
                        onClose={() => onToggle(false)}
                    />
                )}
            </InlinePopover>
        </>
    );
}

/**
 * Inline people editor for the list view. Reuses PeoplePicker so the scope
 * configured on the field applies here exactly as it does on the task.
 */
function PeopleEditor({ scope, selectedIds, onSave, onClose }) {
    const [draft, setDraft] = useState((selectedIds || []).map(Number));
    const [directory, setDirectory] = useState(null);

    // Same cached fetch the picker uses, so this costs nothing extra.
    useEffect(() => {
        let alive = true;
        loadPeopleOptions().then((d) => alive && setDirectory(d)).catch(() => {});
        return () => { alive = false; };
    }, []);

    // Server sorts names alphabetically; match that so the cell doesn't reshuffle
    // on the next page load.
    const namesFor = (ids) => {
        if (!directory || !ids.length) return null;
        const names = directory.users
            .filter((u) => ids.includes(u.id))
            .map((u) => u.name)
            .sort((a, b) => a.localeCompare(b));
        return names.length ? names.join(', ') : null;
    };

    return (
        <div className="p-2 w-72 space-y-2">
            <PeoplePicker value={draft} onChange={setDraft} scope={scope} />
            <div className="flex justify-end gap-2 pt-1 border-t border-gray-200 dark:border-gray-700">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:underline"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={() => onSave(draft.length ? draft : null, { people_names: namesFor(draft) })}
                    className="px-3 py-1 text-xs rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                >
                    Save
                </button>
            </div>
        </div>
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
