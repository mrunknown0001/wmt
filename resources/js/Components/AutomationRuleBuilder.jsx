import { useState, useCallback, useMemo } from 'react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Badge from './Badge';
import EmptyState from './EmptyState';
import Tooltip from './Tooltip';
import { apiFetch, formatLabel } from '../utils';

const TRIGGER_TYPES = [
    { value: 'task_created', label: 'Task Created' },
    { value: 'task_status_changed', label: 'Task Status Changed' },
    { value: 'task_priority_changed', label: 'Task Priority Changed' },
    { value: 'task_assigned', label: 'Task Assigned' },
    { value: 'task_completed', label: 'Task Completed' },
    { value: 'custom_field_changed', label: 'Custom Field Changed' },
    { value: 'form_submitted', label: 'Form Submitted' },
    { value: 'scheduled', label: 'Scheduled (Time of Day)' },
];

// Hours offered by the scheduled trigger. The runner sweeps hourly, so a rule
// can only pick the hour, not the minute.
const HOURS = Array.from({ length: 24 }, (_, h) => ({
    value: h,
    label: `${String(h).padStart(2, '0')}:00`,
}));

const CONDITION_FIELDS = [
    { value: 'status', label: 'Status' },
    { value: 'priority', label: 'Priority' },
    { value: 'assigned_to', label: 'Assignee' },
    { value: 'section_id', label: 'Section' },
    { value: 'due_date', label: 'Due Date' },
    { value: 'start_date', label: 'Start Date' },
    { value: 'custom_field', label: 'Custom Field' },
];

// Built-in task columns holding dates — these get the date operators rather than
// the plain equals/not-equals pair.
const DATE_CONDITION_FIELDS = ['due_date', 'start_date'];

// Operators that compare against today, so the value input is hidden for them.
const NO_VALUE_OPERATORS = ['is_empty', 'is_not_empty', 'is_today', 'before_today', 'after_today'];

const ACTION_TYPES = [
    { value: 'change_status', label: 'Change Status' },
    { value: 'change_priority', label: 'Change Priority' },
    { value: 'assign_user', label: 'Assign User' },
    { value: 'move_to_section', label: 'Move to Section' },
    { value: 'send_notification', label: 'Send Notification' },
    { value: 'add_comment', label: 'Add Comment' },
    { value: 'set_custom_field', label: 'Set Custom Field' },
];

const STATUSES = ['backlog', 'to_do', 'in_progress', 'in_review', 'done', 'cancelled'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

function getOperatorsForCustomFieldType(cfType) {
    switch (cfType) {
        case 'text':
        case 'textarea':
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
                { value: 'greater_than', label: 'greater than' },
                { value: 'less_than', label: 'less than' },
                { value: 'is_empty', label: 'is empty' },
                { value: 'is_not_empty', label: 'is not empty' },
            ];
        case 'date':
            return DATE_OPERATORS;
        case 'single_select':
            return [
                { value: 'equals', label: 'equals' },
                { value: 'not_equals', label: 'does not equal' },
                { value: 'in', label: 'is any of' },
                { value: 'not_in', label: 'is none of' },
                { value: 'is_empty', label: 'is empty' },
                { value: 'is_not_empty', label: 'is not empty' },
            ];
        case 'multi_select':
            return [
                { value: 'contains', label: 'contains' },
                { value: 'not_contains', label: 'does not contain' },
                { value: 'is_empty', label: 'is empty' },
                { value: 'is_not_empty', label: 'is not empty' },
            ];
        default:
            return [
                { value: 'equals', label: 'equals' },
                { value: 'not_equals', label: 'does not equal' },
            ];
    }
}

const DATE_OPERATORS = [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'does not equal' },
    { value: 'before', label: 'is before' },
    { value: 'after', label: 'is after' },
    { value: 'before_today', label: 'is earlier than today' },
    { value: 'after_today', label: 'is later than today' },
    { value: 'is_today', label: 'is today' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
];

const STANDARD_OPERATORS = [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'does not equal' },
];

function triggerColor(type) {
    switch (type) {
        case 'task_created': return 'green';
        case 'task_status_changed': return 'blue';
        case 'task_priority_changed': return 'purple';
        case 'task_assigned': return 'yellow';
        case 'task_completed': return 'green';
        case 'custom_field_changed': return 'cyan';
        case 'form_submitted': return 'indigo';
        case 'scheduled': return 'orange';
        default: return 'gray';
    }
}

const selectClass = 'block w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100';
const inputClass = selectClass;

function ConditionRow({ condition, index, onChange, onRemove, users, sections, customFields }) {
    const field = condition.field || 'status';
    const isCustomField = field === 'custom_field';
    const selectedCfId = condition.custom_field_id;
    const selectedCf = isCustomField ? customFields.find(cf => cf.id === Number(selectedCfId)) : null;
    const needsValue = !NO_VALUE_OPERATORS.includes(condition.operator);

    const operators = useMemo(() => {
        if (DATE_CONDITION_FIELDS.includes(field)) return DATE_OPERATORS;
        if (!isCustomField) return STANDARD_OPERATORS;
        if (!selectedCf) return STANDARD_OPERATORS;
        return getOperatorsForCustomFieldType(selectedCf.type);
    }, [field, isCustomField, selectedCf]);

    const getStandardValueOptions = () => {
        switch (field) {
            case 'status': return STATUSES.map(s => ({ value: s, label: formatLabel(s) }));
            case 'priority': return PRIORITIES.map(p => ({ value: p, label: formatLabel(p) }));
            case 'assigned_to': return [{ value: '__project_owner__', label: 'Project Owner' }, ...users.map(u => ({ value: String(u.id), label: u.name }))];
            case 'section_id': return sections.map(s => ({ value: String(s.id), label: s.name }));
            default: return [];
        }
    };

    const handleFieldChange = (newField) => {
        const updated = { ...condition, field: newField, value: '', operator: 'equals' };
        if (newField !== 'custom_field') {
            delete updated.custom_field_id;
        } else {
            updated.custom_field_id = '';
        }
        onChange(index, updated);
    };

    const handleCustomFieldSelect = (cfId) => {
        onChange(index, { ...condition, custom_field_id: cfId ? Number(cfId) : '', value: '', operator: 'equals' });
    };

    const renderValueInput = () => {
        if (!needsValue) return null;

        // Built-in date columns compare against a picked date.
        if (DATE_CONDITION_FIELDS.includes(field)) {
            return (
                <input
                    type="date"
                    value={condition.value || ''}
                    onChange={(e) => onChange(index, { ...condition, value: e.target.value })}
                    className={inputClass}
                />
            );
        }

        if (isCustomField && selectedCf) {
            const cfType = selectedCf.type;
            if (cfType === 'single_select' || cfType === 'multi_select') {
                const options = selectedCf.options || [];
                return (
                    <select
                        value={condition.value || ''}
                        onChange={(e) => onChange(index, { ...condition, value: e.target.value })}
                        className={selectClass}
                    >
                        <option value="">Select...</option>
                        {options.map(opt => (
                            <option key={opt.id} value={String(opt.id)}>{opt.label}</option>
                        ))}
                    </select>
                );
            }
            if (cfType === 'number') {
                return (
                    <input
                        type="number"
                        value={condition.value || ''}
                        onChange={(e) => onChange(index, { ...condition, value: e.target.value })}
                        placeholder="Value..."
                        className={inputClass}
                    />
                );
            }
            if (cfType === 'date') {
                return (
                    <input
                        type="date"
                        value={condition.value || ''}
                        onChange={(e) => onChange(index, { ...condition, value: e.target.value })}
                        className={inputClass}
                    />
                );
            }
            // text/textarea
            return (
                <input
                    type="text"
                    value={condition.value || ''}
                    onChange={(e) => onChange(index, { ...condition, value: e.target.value })}
                    placeholder="Value..."
                    className={inputClass}
                />
            );
        }

        // Standard field value select
        return (
            <select
                value={condition.value || ''}
                onChange={(e) => onChange(index, { ...condition, value: e.target.value })}
                className={selectClass}
            >
                <option value="">Select...</option>
                {getStandardValueOptions().map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
        );
    };

    return (
        <div className="flex items-start gap-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3">
            <div className={`grid gap-2 flex-1 min-w-0 ${isCustomField ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
                {/* Field selector */}
                <select
                    value={field}
                    onChange={(e) => handleFieldChange(e.target.value)}
                    className={selectClass}
                >
                    {CONDITION_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>

                {/* Custom field selector (only when field=custom_field) */}
                {isCustomField && (
                    <select
                        value={selectedCfId || ''}
                        onChange={(e) => handleCustomFieldSelect(e.target.value)}
                        className={selectClass}
                    >
                        <option value="">Select field...</option>
                        {customFields.map(cf => (
                            <option key={cf.id} value={cf.id}>{cf.name}</option>
                        ))}
                    </select>
                )}

                {/* Operator */}
                <select
                    value={condition.operator || 'equals'}
                    onChange={(e) => onChange(index, { ...condition, operator: e.target.value, ...(NO_VALUE_OPERATORS.includes(e.target.value) ? { value: '' } : {}) })}
                    className={selectClass}
                >
                    {operators.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>

                {/* Value input */}
                {renderValueInput()}
            </div>
            <Tooltip content="Remove condition"><button onClick={() => onRemove(index)} className="mt-2 text-gray-400 hover:text-red-500 transition-colors shrink-0">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button></Tooltip>
        </div>
    );
}

function CustomFieldValueInput({ customField, value, onChange }) {
    if (!customField) return null;
    const cfType = customField.type;

    if (cfType === 'single_select' || cfType === 'multi_select') {
        const options = customField.options || [];
        return (
            <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={selectClass}>
                <option value="">Select...</option>
                {options.map(opt => (
                    <option key={opt.id} value={String(opt.id)}>{opt.label}</option>
                ))}
            </select>
        );
    }
    if (cfType === 'number') {
        return <input type="number" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="Value..." className={inputClass} />;
    }
    if (cfType === 'date') {
        return <input type="date" value={value || ''} onChange={(e) => onChange(e.target.value)} className={inputClass} />;
    }
    return <input type="text" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="Value..." className={inputClass} />;
}

function ActionRow({ action, index, onChange, onRemove, users, sections, customFields }) {
    const type = action.type || 'change_status';
    const params = action.params || {};
    const isSetCustomField = type === 'set_custom_field';
    const selectedCf = isSetCustomField ? customFields.find(cf => cf.id === Number(params.custom_field_id)) : null;

    const renderParams = () => {
        switch (type) {
            case 'change_status':
                return (
                    <select
                        value={params.status || ''}
                        onChange={(e) => onChange(index, { ...action, params: { status: e.target.value } })}
                        className={selectClass}
                    >
                        <option value="">Select status...</option>
                        {STATUSES.map(s => <option key={s} value={s}>{formatLabel(s)}</option>)}
                    </select>
                );
            case 'change_priority':
                return (
                    <select
                        value={params.priority || ''}
                        onChange={(e) => onChange(index, { ...action, params: { priority: e.target.value } })}
                        className={selectClass}
                    >
                        <option value="">Select priority...</option>
                        {PRIORITIES.map(p => <option key={p} value={p}>{formatLabel(p)}</option>)}
                    </select>
                );
            case 'assign_user':
                return (
                    <select
                        value={params.user_id || ''}
                        onChange={(e) => onChange(index, { ...action, params: { user_id: e.target.value } })}
                        className={selectClass}
                    >
                        <option value="">Select user...</option>
                        <option value="__project_owner__">Project Owner</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                );
            case 'move_to_section':
                return (
                    <select
                        value={params.section_id || ''}
                        onChange={(e) => onChange(index, { ...action, params: { section_id: e.target.value } })}
                        className={selectClass}
                    >
                        <option value="">Select section...</option>
                        {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                );
            case 'send_notification':
                return (
                    <select
                        value={params.target || 'project_owner'}
                        onChange={(e) => onChange(index, { ...action, params: { target: e.target.value } })}
                        className={selectClass}
                    >
                        <option value="project_owner">Project Owner</option>
                        <option value="assignee">Task Assignee</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                );
            case 'add_comment':
                return (
                    <textarea
                        value={params.message || ''}
                        onChange={(e) => onChange(index, { ...action, params: { message: e.target.value } })}
                        placeholder="e.g., Task {task} has been completed. Great work, {assignee}!"
                        rows={2}
                        className={selectClass + ' resize-none'}
                    />
                );
            case 'set_custom_field':
                return (
                    <div className="space-y-2">
                        <select
                            value={params.custom_field_id || ''}
                            onChange={(e) => onChange(index, { ...action, params: { custom_field_id: e.target.value ? Number(e.target.value) : '', value: '' } })}
                            className={selectClass}
                        >
                            <option value="">Select custom field...</option>
                            {customFields.map(cf => (
                                <option key={cf.id} value={cf.id}>{cf.name}</option>
                            ))}
                        </select>
                        {selectedCf && (
                            <CustomFieldValueInput
                                customField={selectedCf}
                                value={params.value}
                                onChange={(val) => onChange(index, { ...action, params: { ...params, value: val } })}
                            />
                        )}
                    </div>
                );
            default:
                return null;
        }
    };

    const needsFullWidth = type === 'add_comment' || type === 'set_custom_field';

    return (
        <div className="flex items-start gap-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3">
            <div className={`${needsFullWidth ? 'flex flex-col' : 'grid grid-cols-2'} gap-2 flex-1 min-w-0`}>
                <select
                    value={type}
                    onChange={(e) => onChange(index, { type: e.target.value, params: {} })}
                    className={selectClass}
                >
                    {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
                {renderParams()}
                {type === 'add_comment' && (
                    <p className="text-xs text-gray-400">
                        Variables: {'{task}'}, {'{status}'}, {'{assignee}'}, {'{project}'}
                    </p>
                )}
            </div>
            <Tooltip content="Remove action"><button onClick={() => onRemove(index)} className="mt-2 text-gray-400 hover:text-red-500 transition-colors shrink-0">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button></Tooltip>
        </div>
    );
}

const emptyRule = () => ({
    name: '',
    trigger_type: 'task_status_changed',
    trigger_config: null,
    conditions: [],
    actions: [{ type: 'change_status', params: {} }],
});

export default function AutomationRuleBuilder({ projectId, rules: initialRules, users, sections, customFields = [], forms = [], canCreateRules = false }) {
    const [rules, setRules] = useState(initialRules || []);
    const [showForm, setShowForm] = useState(false);
    const [editingRule, setEditingRule] = useState(null);
    const [form, setForm] = useState(emptyRule());
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [deletingRule, setDeletingRule] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const openCreate = () => {
        setEditingRule(null);
        setForm(emptyRule());
        setShowForm(true);
        setError(null);
    };

    const openEdit = (rule) => {
        setEditingRule(rule);
        setForm({
            name: rule.name,
            trigger_type: rule.trigger_type,
            trigger_config: rule.trigger_config || null,
            conditions: rule.conditions || [],
            actions: rule.actions || [],
        });
        setShowForm(true);
        setError(null);
    };

    const handleConditionChange = (index, updated) => {
        setForm(prev => ({
            ...prev,
            conditions: prev.conditions.map((c, i) => i === index ? updated : c),
        }));
    };

    const handleConditionRemove = (index) => {
        setForm(prev => ({
            ...prev,
            conditions: prev.conditions.filter((_, i) => i !== index),
        }));
    };

    const handleActionChange = (index, updated) => {
        setForm(prev => ({
            ...prev,
            actions: prev.actions.map((a, i) => i === index ? updated : a),
        }));
    };

    const handleActionRemove = (index) => {
        setForm(prev => ({
            ...prev,
            actions: prev.actions.filter((_, i) => i !== index),
        }));
    };

    const validateRule = useCallback(() => {
        const errors = [];
        if (!form.name.trim()) errors.push('Rule name is required.');
        if (form.actions.length === 0) errors.push('At least one action is required.');

        // Validate trigger config
        if (form.trigger_type === 'custom_field_changed' && form.trigger_config?.custom_field_id) {
            const cf = customFields.find(c => c.id === Number(form.trigger_config.custom_field_id));
            if (!cf) errors.push('Selected trigger custom field no longer exists.');
        }
        if (form.trigger_type === 'form_submitted' && form.trigger_config?.form_id) {
            const f = forms.find(x => x.id === Number(form.trigger_config.form_id));
            if (!f) errors.push('Selected trigger form no longer exists.');
        }

        // Validate conditions
        form.conditions.forEach((cond, i) => {
            const n = i + 1;
            if (cond.field === 'custom_field' && !cond.custom_field_id) {
                errors.push(`Condition ${n}: Select a custom field.`);
            }
            const noValueNeeded = NO_VALUE_OPERATORS.includes(cond.operator);
            if (!noValueNeeded && (cond.value === '' || cond.value === undefined || cond.value === null)) {
                errors.push(`Condition ${n}: Value is required.`);
            }
        });

        // Validate actions
        form.actions.forEach((act, i) => {
            const n = i + 1;
            const p = act.params || {};
            switch (act.type) {
                case 'change_status':
                    if (!p.status) errors.push(`Action ${n}: Select a status.`);
                    break;
                case 'change_priority':
                    if (!p.priority) errors.push(`Action ${n}: Select a priority.`);
                    break;
                case 'assign_user':
                    if (!p.user_id) errors.push(`Action ${n}: Select a user.`);
                    break;
                case 'move_to_section':
                    if (!p.section_id) errors.push(`Action ${n}: Select a section.`);
                    break;
                case 'add_comment':
                    if (!p.message?.trim()) errors.push(`Action ${n}: Enter a comment message.`);
                    break;
                case 'set_custom_field':
                    if (!p.custom_field_id) errors.push(`Action ${n}: Select a custom field.`);
                    else if (!p.value && p.value !== 0) errors.push(`Action ${n}: Enter a value for the custom field.`);
                    break;
            }
        });

        return errors;
    }, [form, customFields, forms]);

    const handleSave = useCallback(async () => {
        const errors = validateRule();
        if (errors.length > 0) {
            setError(errors.join(' '));
            return;
        }
        setSaving(true);
        setError(null);

        try {
            const url = editingRule
                ? `/projects/${projectId}/automation-rules/${editingRule.id}`
                : `/projects/${projectId}/automation-rules`;
            const method = editingRule ? 'PUT' : 'POST';

            const res = await apiFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });

            // Tolerate a non-JSON body: if the server ever answers with a redirect
            // or an HTML error page, parsing would throw and the real status would
            // be reported as a network failure.
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                setError(data?.message || `Failed to save rule (HTTP ${res.status}).`);
                return;
            }
            if (!data?.rule) {
                setError('The server returned an unexpected response. Please try again.');
                return;
            }

            if (editingRule) {
                setRules(prev => prev.map(r => r.id === data.rule.id ? data.rule : r));
            } else {
                setRules(prev => [data.rule, ...prev]);
            }

            setShowForm(false);
        } catch (e) {
            setError('Network error. Please try again.');
        } finally {
            setSaving(false);
        }
    }, [form, editingRule, projectId]);

    const handleToggle = useCallback(async (rule) => {
        try {
            const res = await apiFetch(`/projects/${projectId}/automation-rules/${rule.id}/toggle`, { method: 'PATCH' });
            const data = await res.json();
            setRules(prev => prev.map(r => r.id === data.rule.id ? data.rule : r));
        } catch (e) {
            console.error('Failed to toggle rule', e);
        }
    }, [projectId]);

    const handleDuplicate = useCallback(async (rule) => {
        try {
            const res = await apiFetch(`/projects/${projectId}/automation-rules/${rule.id}/duplicate`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                setRules(prev => [data.rule, ...prev]);
            }
        } catch (e) {
            console.error('Failed to duplicate rule', e);
        }
    }, [projectId]);

    const handleDelete = useCallback(async () => {
        if (!deletingRule) return;
        setDeleting(true);
        try {
            await apiFetch(`/projects/${projectId}/automation-rules/${deletingRule.id}`, { method: 'DELETE' });
            setRules(prev => prev.filter(r => r.id !== deletingRule.id));
            setDeletingRule(null);
        } catch (e) {
            console.error('Failed to delete rule', e);
        } finally {
            setDeleting(false);
        }
    }, [projectId, deletingRule]);

    return (
        <div>
            {/* Header sits outside the scrolling list below, so it stays put while
                only the rules scroll — matching the Custom Fields panel. */}
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-white dark:bg-gray-800 pb-3 mb-1 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Automation Rules ({rules.length})
                </h3>
                {canCreateRules && <Button size="sm" onClick={openCreate}>Add Rule</Button>}
            </div>

            {rules.length > 0 ? (
                <div className="space-y-2 max-h-96 overflow-y-auto pt-3 pr-1 scrollbar-thin">
                    {rules.map((rule) => (
                        <div key={rule.id} className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40 hover:border-gray-300 dark:hover:border-gray-600">
                            <button
                                onClick={() => handleToggle(rule)}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                                    rule.is_active ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                                }`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                                    rule.is_active ? 'translate-x-4' : 'translate-x-0'
                                }`} />
                            </button>
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${rule.is_active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>
                                    {rule.name}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <Badge color={triggerColor(rule.trigger_type)} className="text-xs">
                                        {TRIGGER_TYPES.find(t => t.value === rule.trigger_type)?.label || rule.trigger_type}
                                        {rule.trigger_type === 'custom_field_changed' && rule.trigger_config?.custom_field_id && (
                                            <> &middot; {customFields.find(cf => cf.id === rule.trigger_config.custom_field_id)?.name || 'Unknown'}</>
                                        )}
                                        {rule.trigger_type === 'scheduled' && (
                                            <> &middot; {String(rule.trigger_config?.hour ?? 9).padStart(2, '0')}:00 daily</>
                                        )}
                                        {rule.trigger_type === 'form_submitted' && rule.trigger_config?.form_id && (
                                            <> &middot; {forms.find(f => f.id === rule.trigger_config.form_id)?.name || 'Unknown'}</>
                                        )}
                                    </Badge>
                                    <span className="text-xs text-gray-400">
                                        {rule.conditions?.length || 0} condition{(rule.conditions?.length || 0) !== 1 ? 's' : ''}, {rule.actions?.length || 0} action{(rule.actions?.length || 0) !== 1 ? 's' : ''}
                                    </span>
                                </div>
                            </div>
                            {canCreateRules && (
                            <>
                            <Tooltip content="Edit">
                                <button onClick={() => openEdit(rule)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                </button>
                            </Tooltip>
                            <Tooltip content="Duplicate">
                                <button onClick={() => handleDuplicate(rule)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                </button>
                            </Tooltip>
                            <Tooltip content="Delete">
                                <button onClick={() => setDeletingRule(rule)} className="text-gray-400 hover:text-red-500 p-1">
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </Tooltip>
                            </>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                    No automation rules yet. Create one to automate task workflows.
                </div>
            )}

            <Modal
                isOpen={!!deletingRule}
                onClose={() => setDeletingRule(null)}
                title="Delete Automation Rule"
                actions={
                    <>
                        <Button variant="secondary" onClick={() => setDeletingRule(null)}>Cancel</Button>
                        <Button variant="danger" onClick={handleDelete} processing={deleting} processingText="Deleting...">
                            Delete Rule
                        </Button>
                    </>
                }
            >
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    Are you sure you want to delete <span className="font-medium text-gray-900 dark:text-gray-100">"{deletingRule?.name}"</span>? This action cannot be undone.
                </p>
            </Modal>

            <Modal
                isOpen={showForm}
                onClose={() => setShowForm(false)}
                title={editingRule ? 'Edit Automation Rule' : 'New Automation Rule'}
                size="lg"
                actions={
                    <>
                        <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
                        <Button onClick={handleSave} processing={saving} processingText="Saving...">
                            {editingRule ? 'Update Rule' : 'Create Rule'}
                        </Button>
                    </>
                }
            >
                <div className="space-y-5">
                    {error && (
                        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Rule Name</label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="e.g., Auto-assign reviewer on in_review"
                            className={selectClass}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Trigger</label>
                        <div className={`grid gap-2 ${['custom_field_changed', 'form_submitted', 'scheduled'].includes(form.trigger_type) ? 'grid-cols-2' : ''}`}>
                            <select
                                value={form.trigger_type}
                                onChange={(e) => setForm(prev => ({ ...prev, trigger_type: e.target.value, trigger_config: null }))}
                                className={selectClass}
                            >
                                {TRIGGER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                            {form.trigger_type === 'custom_field_changed' && (
                                <select
                                    value={form.trigger_config?.custom_field_id || ''}
                                    onChange={(e) => setForm(prev => ({
                                        ...prev,
                                        trigger_config: e.target.value ? { custom_field_id: Number(e.target.value) } : null,
                                    }))}
                                    className={selectClass}
                                >
                                    <option value="">Any custom field</option>
                                    {customFields.map(cf => (
                                        <option key={cf.id} value={cf.id}>{cf.name}</option>
                                    ))}
                                </select>
                            )}
                            {form.trigger_type === 'scheduled' && (
                                <select
                                    value={form.trigger_config?.hour ?? 9}
                                    onChange={(e) => setForm(prev => ({
                                        ...prev,
                                        trigger_config: { hour: Number(e.target.value) },
                                    }))}
                                    className={selectClass}
                                >
                                    {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
                                </select>
                            )}
                            {form.trigger_type === 'form_submitted' && (
                                <select
                                    value={form.trigger_config?.form_id || ''}
                                    onChange={(e) => setForm(prev => ({
                                        ...prev,
                                        trigger_config: e.target.value ? { form_id: Number(e.target.value) } : null,
                                    }))}
                                    className={selectClass}
                                >
                                    <option value="">Any form</option>
                                    {forms.map(f => (
                                        <option key={f.id} value={f.id}>{f.name}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium text-gray-900 dark:text-gray-100">Conditions <span className="font-normal text-gray-400">(optional)</span></label>
                            <button
                                onClick={() => setForm(prev => ({
                                    ...prev,
                                    conditions: [...prev.conditions, { field: 'status', operator: 'equals', value: '' }],
                                }))}
                                className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                            >
                                + Add condition
                            </button>
                        </div>
                        <div className="space-y-2">
                            {form.conditions.map((condition, i) => (
                                <ConditionRow
                                    key={i}
                                    condition={condition}
                                    index={i}
                                    onChange={handleConditionChange}
                                    onRemove={handleConditionRemove}
                                    users={users}
                                    sections={sections}
                                    customFields={customFields}
                                />
                            ))}
                            {form.conditions.length === 0 && (
                                <p className="text-xs text-gray-400 italic">No conditions — rule applies to all tasks matching the trigger.</p>
                            )}
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium text-gray-900 dark:text-gray-100">Actions</label>
                            <button
                                onClick={() => setForm(prev => ({
                                    ...prev,
                                    actions: [...prev.actions, { type: 'change_status', params: {} }],
                                }))}
                                className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                            >
                                + Add action
                            </button>
                        </div>
                        <div className="space-y-2">
                            {form.actions.map((action, i) => (
                                <ActionRow
                                    key={i}
                                    action={action}
                                    index={i}
                                    onChange={handleActionChange}
                                    onRemove={handleActionRemove}
                                    users={users}
                                    sections={sections}
                                    customFields={customFields}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
