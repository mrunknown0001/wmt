import { useState, useCallback, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import Modal from './Modal';
import { ConfirmModal } from './Modal';
import Tooltip from './Tooltip';
import { apiFetch } from '../utils';
import { validateFormula } from '../formulaEngine';
import { loadPeopleOptions } from './PeoplePicker';
import { dateSourceOptions } from '../weekOfYear';
import { normalizeScopes, filterUsersByScopes } from '../peopleScope';

const FIELD_TYPES = [
    { value: 'text', label: 'Text' },
    { value: 'textarea', label: 'Multi-line Text' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'single_select', label: 'Single Select' },
    { value: 'multi_select', label: 'Multi Select' },
    { value: 'people', label: 'People' },
    { value: 'week_of_year', label: 'Week of Year' },
    { value: 'formula', label: 'Formula' },
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

function OptionEditor({ options, onChange, sortMode }) {
    const listRef = useRef(null);
    const lastInputRef = useRef(null);
    const prevCountRef = useRef(options.length);
    const [colorPickerIndex, setColorPickerIndex] = useState(null);
    const colorBtnRefs = useRef({});
    const [optDragIndex, setOptDragIndex] = useState(null);
    const [optDragOverIndex, setOptDragOverIndex] = useState(null);

    useEffect(() => {
        if (options.length > prevCountRef.current && lastInputRef.current) {
            lastInputRef.current.focus();
            listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
        }
        prevCountRef.current = options.length;
    }, [options.length]);

    const autoSizeTextarea = (textarea) => {
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = Math.max(textarea.scrollHeight, 40) + 'px';
        }
    };

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

    const handleOptDragStart = (e, index) => {
        setOptDragIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleOptDrop = (e, dropIndex) => {
        e.preventDefault();
        if (optDragIndex === null || optDragIndex === dropIndex) {
            setOptDragIndex(null);
            setOptDragOverIndex(null);
            return;
        }
        const reordered = [...options];
        const [moved] = reordered.splice(optDragIndex, 1);
        reordered.splice(dropIndex, 0, moved);
        onChange(reordered);
        setOptDragIndex(null);
        setOptDragOverIndex(null);
    };

    const isManual = sortMode === 'manual';

    // Build display order: alphabetical when not manual, original order when manual
    const displayOrder = useMemo(() => {
        const indices = options.map((_, i) => i);
        if (!isManual) {
            indices.sort((a, b) => (options[a].label || '').localeCompare(options[b].label || ''));
        }
        return indices;
    }, [options, isManual]);

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">Options</label>
            <div ref={listRef} className="max-h-48 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {displayOrder.map((i) => {
                    const opt = options[i];
                    return (
                    <div
                        key={i}
                        draggable={isManual}
                        onDragStart={isManual ? (e) => handleOptDragStart(e, i) : undefined}
                        onDragOver={isManual ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOptDragOverIndex(i); } : undefined}
                        onDrop={isManual ? (e) => handleOptDrop(e, i) : undefined}
                        onDragEnd={isManual ? () => { setOptDragIndex(null); setOptDragOverIndex(null); } : undefined}
                        className={`flex items-start gap-2 ${
                            optDragOverIndex === i && optDragIndex !== i ? 'ring-1 ring-primary-400/50 rounded' : ''
                        } ${optDragIndex === i ? 'opacity-50' : ''}`}
                    >
                        {isManual && (
                            <span className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0">
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
                            </span>
                        )}
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
                        <textarea
                            ref={(el) => {
                                if (i === options.length - 1) lastInputRef.current = el;
                                if (el) autoSizeTextarea(el);
                            }}
                            value={opt.label}
                            onChange={(e) => {
                                updateOption(i, 'label', e.target.value);
                                autoSizeTextarea(e.target);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    if (opt.label.trim()) addOption();
                                }
                            }}
                            placeholder={`Option ${i + 1}`}
                            rows={1}
                            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none overflow-hidden"
                            style={{ minHeight: '2.5rem' }}
                        />
                        <button
                            type="button"
                            onClick={() => removeOption(i)}
                            className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    );
                })}
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

const MATH_FUNCTIONS = ['ABS', 'ROUND', 'CEIL', 'FLOOR', 'MIN', 'MAX', 'SUM', 'AVG', 'POWER', 'SQRT'];
const DATE_FUNCTIONS = ['DATE_ADD', 'DATE_SUB', 'DATE_DIFF', 'TODAY'];
const CONDITIONAL_FUNCTIONS = ['IF'];
const BUILT_IN_FIELDS = [
    { name: 'Due Date', type: 'date' },
    { name: 'Start Date', type: 'date' },
    { name: 'Created Date', type: 'date' },
];

function FormulaEditor({ config, onChange, availableFields }) {
    const textareaRef = useRef(null);
    const handleFormulaChange = (formula) => onChange({ ...config, formula });

    const insertAtCursor = (text) => {
        const el = textareaRef.current;
        if (!el) { handleFormulaChange(config.formula + text); return; }
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const before = config.formula.slice(0, start);
        const after = config.formula.slice(end);
        handleFormulaChange(before + text + after);
        requestAnimationFrame(() => {
            el.focus();
            el.selectionStart = el.selectionEnd = start + text.length;
        });
    };

    const validation = config.formula ? validateFormula(config.formula) : null;

    const chipBase = 'px-2 py-0.5 text-xs rounded border cursor-pointer transition-colors';

    return (
        <div className="space-y-3">
            <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Formula</label>
                <textarea
                    ref={textareaRef}
                    value={config.formula}
                    onChange={(e) => handleFormulaChange(e.target.value)}
                    placeholder='e.g. {Cost} * {Quantity}'
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-mono dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-y"
                />
                {validation && !validation.valid && (
                    <p className="mt-1 text-xs text-red-500 dark:text-red-400">{validation.error}</p>
                )}
                {validation && validation.valid && config.formula && (
                    <p className="mt-1 text-xs text-green-600 dark:text-green-400">Formula is valid</p>
                )}
            </div>

            <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Insert Field</label>
                <div className="flex flex-wrap gap-1">
                    {availableFields.map(f => (
                        <button key={f.id} type="button" onClick={() => insertAtCursor(`{${f.name}}`)}
                            className={`${chipBase} bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50`}>
                            {f.name}
                        </button>
                    ))}
                    {BUILT_IN_FIELDS.map(f => (
                        <button key={f.name} type="button" onClick={() => insertAtCursor(`{${f.name}}`)}
                            className={`${chipBase} bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/50`}>
                            {f.name}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Insert Function</label>
                <div className="space-y-1.5">
                    <div className="flex flex-wrap gap-1">
                        {MATH_FUNCTIONS.map(fn => (
                            <button key={fn} type="button" onClick={() => insertAtCursor(`${fn}(`)}
                                className={`${chipBase} bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600`}>
                                {fn}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {DATE_FUNCTIONS.map(fn => (
                            <button key={fn} type="button" onClick={() => insertAtCursor(fn === 'TODAY' ? 'TODAY()' : `${fn}(`)}
                                className={`${chipBase} bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50`}>
                                {fn}
                            </button>
                        ))}
                        {CONDITIONAL_FUNCTIONS.map(fn => (
                            <button key={fn} type="button" onClick={() => insertAtCursor(`${fn}(`)}
                                className={`${chipBase} bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50`}>
                                {fn}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex gap-4">
                <div className="flex-1">
                    <Select label="Result Type" id="formula-result-type" value={config.result_type || 'number'}
                        onChange={(e) => onChange({ ...config, result_type: e.target.value })}
                        options={[
                            { value: 'number', label: 'Number' },
                            { value: 'date', label: 'Date' },
                            { value: 'boolean', label: 'Yes / No' },
                        ]}
                    />
                </div>
                {(config.result_type || 'number') === 'boolean' && (
                    <div className="flex-1">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-6">
                            Shows <span className="font-medium">Yes</span> when the formula is true.
                            Comparisons work directly, e.g. <code>[Budget] &gt; 1000</code>. Combine
                            with <code>*</code> for “and”, <code>+</code> for “or”.
                        </p>
                    </div>
                )}
                {(config.result_type || 'number') === 'number' && (
                    <div className="w-32">
                        <Input label="Decimals" id="formula-decimals" type="number"
                            value={config.decimal_places ?? 2}
                            onChange={(e) => onChange({ ...config, decimal_places: Number(e.target.value) })}
                            min={0} max={10}
                        />
                    </div>
                )}
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-500">
                Reference fields with {'{Field Name}'}. Operators: +, -, *, /, %. Functions: ROUND, AVG, IF, DATE_DIFF, etc.
            </p>
        </div>
    );
}

/** One division/department/team rule inside a People field's scope. */
function PeopleScopeRow({ data, scope, index, onChange, onRemove, canRemove }) {
    const divisionId = scope.division_id ? String(scope.division_id) : '';
    const departmentId = scope.department_id ? String(scope.department_id) : '';
    const teamId = scope.team_id ? String(scope.team_id) : '';

    // Each dropdown only offers what fits the one above it.
    const departments = useMemo(() => {
        if (!data) return [];
        return divisionId
            ? data.departments.filter((d) => String(d.division_id) === divisionId)
            : data.departments;
    }, [data, divisionId]);

    const teams = useMemo(() => {
        if (!data) return [];
        const deptIds = departmentId ? [departmentId] : departments.map((d) => String(d.id));
        return data.teams.filter((t) => deptIds.includes(String(t.department_id)));
    }, [data, departmentId, departments]);

    // Narrowing a level invalidates anything chosen below it.
    const set = (patch) => onChange(index, { ...scope, ...patch });

    return (
        <div className="flex items-end gap-2">
            <div className="grid grid-cols-3 gap-2 flex-1">
                <Select label={index === 0 ? 'Division' : undefined} id={`cf-people-division-${index}`} value={divisionId}
                    onChange={(e) => set({ division_id: e.target.value || null, department_id: null, team_id: null })}
                    options={[{ value: '', label: 'Any' }, ...data.divisions.map((d) => ({ value: String(d.id), label: d.name }))]}
                />
                <Select label={index === 0 ? 'Department' : undefined} id={`cf-people-department-${index}`} value={departmentId}
                    onChange={(e) => set({ department_id: e.target.value || null, team_id: null })}
                    options={[{ value: '', label: 'Any' }, ...departments.map((d) => ({ value: String(d.id), label: d.name }))]}
                />
                <Select label={index === 0 ? 'Team' : undefined} id={`cf-people-team-${index}`} value={teamId}
                    onChange={(e) => set({ team_id: e.target.value || null })}
                    options={[{ value: '', label: 'Any' }, ...teams.map((t) => ({ value: String(t.id), label: t.name }))]}
                />
            </div>
            <button
                type="button"
                onClick={() => onRemove(index)}
                disabled={!canRemove}
                title="Remove this rule"
                className="mb-1 p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
            >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}

/**
 * Scope editor for a People field. Rules are set here, on the field definition,
 * so everyone filling the field in gets an already-narrowed list.
 *
 * Several rules can be added to widen coverage: a person is offered if they
 * match ANY rule, so "Payroll team" plus "the whole Operations division" covers
 * both. Within one rule the three levels narrow together. Leave a single rule
 * entirely on "Any" to offer every active user.
 */
function PeopleScopeConfig({ config, onChange }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let alive = true;
        loadPeopleOptions()
            .then((d) => alive && setData(d))
            .catch(() => alive && setError(true));
        return () => { alive = false; };
    }, []);

    // Always render at least one row. Legacy single-scope configs are lifted into
    // the array shape so an older field opens in the new editor unchanged.
    const scopes = useMemo(() => {
        if (Array.isArray(config.scopes) && config.scopes.length) return config.scopes;
        if (config.division_id || config.department_id || config.team_id) {
            return [{ division_id: config.division_id, department_id: config.department_id, team_id: config.team_id }];
        }
        return [{ division_id: null, department_id: null, team_id: null }];
    }, [config]);

    const commit = (next) => onChange({ scopes: next });

    const updateRow = (index, next) => commit(scopes.map((s, i) => (i === index ? next : s)));
    const removeRow = (index) => commit(scopes.filter((_, i) => i !== index));
    const addRow = () => commit([...scopes, { division_id: null, department_id: null, team_id: null }]);

    // Union across rules, deduplicated — the count people will actually see.
    const matchCount = useMemo(() => {
        if (!data) return null;
        return filterUsersByScopes(data.users, normalizeScopes({ scopes })).length;
    }, [data, scopes]);

    const anyRuleSet = normalizeScopes({ scopes }).length > 0;

    if (error) return <p className="text-sm text-red-600 dark:text-red-400">Could not load the org list.</p>;
    if (!data) return <p className="text-sm text-gray-500 dark:text-gray-400">Loading org list…</p>;

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                Limit people to <span className="font-normal text-gray-400">(optional)</span>
            </label>

            <div className="space-y-2">
                {scopes.map((scope, i) => (
                    <PeopleScopeRow
                        key={i}
                        data={data}
                        scope={scope}
                        index={i}
                        onChange={updateRow}
                        onRemove={removeRow}
                        canRemove={scopes.length > 1}
                    />
                ))}
            </div>

            <button
                type="button"
                onClick={addRow}
                className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
                + Add another group
            </button>

            <p className="text-xs text-gray-500 dark:text-gray-400">
                {!anyRuleSet
                    ? `No limit set — all ${matchCount} active people can be picked.`
                    : matchCount === 0
                        ? 'No active users match these rules — the field would have nothing to pick from.'
                        : `${matchCount} active ${matchCount === 1 ? 'person' : 'people'} match ${scopes.length > 1 ? 'these rules' : 'this rule'}.`}
            </p>
        </div>
    );
}

export default forwardRef(function CustomFieldManager({ projectId, initialFields = [], onFieldsChange, baseUrl, builtInDateFields = [] }, ref) {
    // Approval projects expose the same custom-field API under a different prefix;
    // pass baseUrl to point this manager at it. Defaults to regular projects.
    const fieldsUrl = baseUrl || `/projects/${projectId}/custom-fields`;
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
        default_value: '',
        config: { formula: '', result_type: 'number', decimal_places: 2, sort_mode: 'alphabetical' },
    });

    const resetForm = () => {
        setForm({ name: '', type: 'text', options: [], default_value: '', config: { formula: '', result_type: 'number', decimal_places: 2, sort_mode: 'alphabetical' } });
        setEditingField(null);
    };

    const openCreate = () => {
        resetForm();
        setShowModal(true);
    };

    const openEdit = (field) => {
        setEditingField(field);
        const isSelect = ['single_select', 'multi_select'].includes(field.type);
        const dv = field.config?.default_value;
        const defaultIds = Array.isArray(dv) ? dv.map(Number) : (dv !== undefined && dv !== null && dv !== '' ? [Number(dv)] : []);
        setForm({
            name: field.name,
            type: field.type,
            options: isSelect
                ? (field.options || []).map(o => ({ ...o, is_default: defaultIds.includes(o.id) }))
                : (field.options || []),
            default_value: isSelect ? '' : (dv ?? ''),
            config: { formula: '', result_type: 'number', decimal_places: 2, sort_mode: 'alphabetical', ...field.config },
        });
        setShowModal(true);
    };

    useImperativeHandle(ref, () => ({
        editField: (fieldId) => {
            const field = fields.find(f => f.id === fieldId);
            if (field) openEdit(field);
        },
        deleteField: (fieldId) => {
            const field = fields.find(f => f.id === fieldId);
            if (field) setDeleteField(field);
        },
    }), [fields]);

    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            if (form.type === 'formula') {
                const v = validateFormula(form.config.formula);
                if (!v.valid) {
                    alert('Invalid formula: ' + v.error);
                    setSaving(false);
                    return;
                }
            }

            // Without a reference the field has nothing to calculate from and would
            // read as blank on every record.
            if (form.type === 'week_of_year' && !form.config.reference_field) {
                alert('Pick the date field this Week of Year should follow.');
                setSaving(false);
                return;
            }

            const isSelect = ['single_select', 'multi_select'].includes(form.type);

            let config;
            if (form.type === 'formula') {
                config = { formula: form.config.formula, result_type: form.config.result_type, decimal_places: form.config.decimal_places };
            } else if (isSelect) {
                config = { sort_mode: form.config.sort_mode };
            } else if (form.type === 'number') {
                config = { decimal_places: form.config.decimal_places };
            } else if (form.type === 'week_of_year') {
                config = { reference_field: form.config.reference_field || null };
            } else if (form.type === 'people') {
                // Empty selects come through as '' — normalise to null so the
                // server sees "no rule" rather than an unparseable id. Rules that
                // name nothing are dropped: one would match everyone and make the
                // whole union unscoped.
                const num = (v) => (v === '' || v == null ? null : Number(v));
                config = {
                    scopes: normalizeScopes(form.config).map((s) => ({
                        division_id: num(s.division_id),
                        department_id: num(s.department_id),
                        team_id: num(s.team_id),
                    })),
                };
            }

            // Optional default value (selects send option indexes instead —
            // the server resolves them to option IDs after saving options)
            if (!isSelect && form.type !== 'formula' && form.default_value !== '' && form.default_value != null) {
                config = { ...(config || {}), default_value: form.type === 'number' ? Number(form.default_value) : form.default_value };
            }

            const payload = {
                name: form.name,
                type: form.type,
                options: isSelect ? form.options : undefined,
                default_option_indexes: isSelect
                    ? form.options.map((o, i) => (o.is_default ? i : -1)).filter(i => i >= 0)
                    : undefined,
                config,
            };

            let result;
            if (editingField) {
                result = await apiFetch(`${fieldsUrl}/${editingField.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                });
            } else {
                result = await apiFetch(`${fieldsUrl}`, {
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
    }, [form, editingField, projectId, fieldsUrl]);

    const handleDelete = useCallback(async () => {
        if (!deleteField) return;
        try {
            await apiFetch(`${fieldsUrl}/${deleteField.id}`, {
                method: 'DELETE',
            });
            setFields(prev => prev.filter(f => f.id !== deleteField.id));
            setDeleteField(null);
        } catch (e) {
            console.error('Failed to delete custom field', e);
        }
    }, [deleteField, projectId, fieldsUrl]);

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
            await apiFetch(`${fieldsUrl}/reorder`, {
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
        <div>
            {/* Sticky so "Add Field" stays reachable while a long list scrolls
                underneath. Needs an opaque background to cover the rows. */}
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-white dark:bg-gray-800 pb-3 mb-1 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Custom Fields ({fields.length})
                </h3>
                <Button size="sm" onClick={openCreate}>+ Add Field</Button>
            </div>

            {fields.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 pt-3">No custom fields yet. Add one to track additional data on tasks.</p>
            ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pt-3 pr-1 scrollbar-thin">
                    {fields.map((field, index) => (
                        <div
                            key={field.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDrop={(e) => handleDrop(e, index)}
                            onDragEnd={handleDragEnd}
                            className={`flex items-center justify-between p-3 rounded-lg border bg-gray-50 dark:bg-gray-800/50 transition-all hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 ${
                                dragOverIndex === index && dragIndex !== index
                                    ? 'border-primary-400 dark:border-primary-500 ring-1 ring-primary-400/30'
                                    : 'border-gray-200 dark:border-gray-700'
                            } ${dragIndex === index ? 'opacity-50' : ''}`}
                        >
                            <div className="flex items-center gap-3">
                                    <Tooltip content="Drag to reorder"><span className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
                                    </span></Tooltip>
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{field.name}</span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                                    {typeLabel(field.type)}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                    <Tooltip content="Edit">
                                    <button
                                        onClick={() => openEdit(field)}
                                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                    </button>
                                    </Tooltip>
                                    <Tooltip content="Delete">
                                    <button
                                        onClick={() => setDeleteField(field)}
                                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                    </Tooltip>
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
                        onChange={(e) => setForm(prev => ({ ...prev, type: e.target.value, options: [], default_value: '', config: { formula: '', result_type: 'number', decimal_places: 2 } }))}
                        options={FIELD_TYPES}
                        disabled={!!editingField}
                    />
                    {form.type === 'week_of_year' && (() => {
                        const sources = dateSourceOptions(builtInDateFields, fields, editingField?.id ?? null);
                        return (
                            <div>
                                <Select
                                    label="Reference date field"
                                    id="cf-week-reference"
                                    value={form.config.reference_field || ''}
                                    onChange={(e) => setForm(prev => ({ ...prev, config: { ...prev.config, reference_field: e.target.value || null } }))}
                                    options={[
                                        { value: '', label: sources.length ? 'Select a date field…' : 'No date fields available' },
                                        ...sources,
                                    ]}
                                    disabled={sources.length === 0}
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    {sources.length
                                        ? 'The week is calculated from this date — it is not entered by hand.'
                                        : 'Add a Date custom field first, or pick one of the built-in dates.'}
                                </p>
                            </div>
                        );
                    })()}
                    {form.type === 'people' && (
                        <PeopleScopeConfig
                            config={form.config}
                            onChange={(next) => setForm(prev => ({ ...prev, config: { ...prev.config, ...next } }))}
                        />
                    )}
                    {form.type === 'number' && (
                        <div className="w-32">
                            <Input label="Decimal Places" id="cf-number-decimals" type="number"
                                value={form.config.decimal_places ?? ''}
                                onChange={(e) => setForm(prev => ({ ...prev, config: { ...prev.config, decimal_places: e.target.value === '' ? null : Number(e.target.value) } }))}
                                min={0} max={10}
                                placeholder="Auto"
                            />
                        </div>
                    )}
                    {['text', 'textarea', 'number', 'date'].includes(form.type) && (
                        form.type === 'textarea' ? (
                            <div>
                                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                                    Default Value <span className="font-normal text-gray-400">(optional)</span>
                                </label>
                                <textarea
                                    value={form.default_value ?? ''}
                                    onChange={(e) => setForm(prev => ({ ...prev, default_value: e.target.value }))}
                                    rows={2}
                                    placeholder="Applied when a task is created without a value"
                                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                                />
                            </div>
                        ) : (
                            <Input
                                label="Default Value (optional)"
                                id="cf-default-value"
                                type={form.type === 'number' ? 'number' : form.type === 'date' ? 'date' : 'text'}
                                value={form.default_value ?? ''}
                                onChange={(e) => setForm(prev => ({ ...prev, default_value: e.target.value }))}
                                placeholder="Applied when a task is created without a value"
                            />
                        )
                    )}
                    {['single_select', 'multi_select'].includes(form.type) && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Option Order</label>
                                <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setForm(prev => ({ ...prev, config: { ...prev.config, sort_mode: 'alphabetical' } }))}
                                        className={`flex-1 px-3 py-1.5 text-sm font-medium transition-colors ${
                                            (form.config.sort_mode || 'alphabetical') === 'alphabetical'
                                                ? 'bg-primary-600 text-white'
                                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        Alphabetical
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setForm(prev => ({ ...prev, config: { ...prev.config, sort_mode: 'manual' } }))}
                                        className={`flex-1 px-3 py-1.5 text-sm font-medium transition-colors border-l border-gray-300 dark:border-gray-600 ${
                                            form.config.sort_mode === 'manual'
                                                ? 'bg-primary-600 text-white'
                                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        Manual
                                    </button>
                                </div>
                                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                                    {(form.config.sort_mode || 'alphabetical') === 'alphabetical'
                                        ? 'Options will be sorted A-Z when displayed'
                                        : 'Drag options to set your preferred order'}
                                </p>
                            </div>
                            <OptionEditor
                                options={form.options}
                                onChange={(opts) => setForm(prev => ({ ...prev, options: opts }))}
                                sortMode={form.config.sort_mode || 'alphabetical'}
                            />
                            <div>
                                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                                    Default {form.type === 'single_select' ? 'Option' : 'Options'} <span className="font-normal text-gray-400">(optional)</span>
                                </label>
                                {form.options.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic">Add options first.</p>
                                ) : form.type === 'single_select' ? (
                                    <select
                                        value={String(form.options.findIndex(o => o.is_default))}
                                        onChange={(e) => {
                                            const idx = Number(e.target.value);
                                            setForm(prev => ({ ...prev, options: prev.options.map((o, i) => ({ ...o, is_default: i === idx })) }));
                                        }}
                                        className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                                    >
                                        <option value="-1">No default</option>
                                        {form.options.map((opt, i) => (
                                            <option key={i} value={i}>{opt.label || `Option ${i + 1}`}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                                        {form.options.map((opt, i) => (
                                            <label key={i} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                                <input
                                                    type="checkbox"
                                                    checked={!!opt.is_default}
                                                    onChange={() => setForm(prev => ({
                                                        ...prev,
                                                        options: prev.options.map((o, j) => j === i ? { ...o, is_default: !o.is_default } : o),
                                                    }))}
                                                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
                                                />
                                                {opt.color && <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: opt.color }} />}
                                                {opt.label || `Option ${i + 1}`}
                                            </label>
                                        ))}
                                    </div>
                                )}
                                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                                    Applied when a task is created without a value for this field.
                                </p>
                            </div>
                        </>
                    )}
                    {form.type === 'formula' && (
                        <FormulaEditor
                            config={form.config}
                            onChange={(config) => setForm(prev => ({ ...prev, config }))}
                            availableFields={fields.filter(f => f.type !== 'formula' || (editingField && f.id !== editingField.id))}
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
});
