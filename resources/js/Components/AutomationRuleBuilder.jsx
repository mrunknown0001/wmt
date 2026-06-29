import { useState, useCallback } from 'react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Badge from './Badge';
import EmptyState from './EmptyState';
import { apiFetch, formatLabel } from '../utils';

const TRIGGER_TYPES = [
    { value: 'task_created', label: 'Task Created' },
    { value: 'task_status_changed', label: 'Task Status Changed' },
    { value: 'task_priority_changed', label: 'Task Priority Changed' },
    { value: 'task_assigned', label: 'Task Assigned' },
    { value: 'task_completed', label: 'Task Completed' },
];

const CONDITION_FIELDS = [
    { value: 'status', label: 'Status' },
    { value: 'priority', label: 'Priority' },
    { value: 'assigned_to', label: 'Assignee' },
    { value: 'section_id', label: 'Section' },
];

const CONDITION_OPERATORS = [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'does not equal' },
];

const ACTION_TYPES = [
    { value: 'change_status', label: 'Change Status' },
    { value: 'change_priority', label: 'Change Priority' },
    { value: 'assign_user', label: 'Assign User' },
    { value: 'move_to_section', label: 'Move to Section' },
    { value: 'send_notification', label: 'Send Notification' },
    { value: 'add_comment', label: 'Add Comment' },
];

const STATUSES = ['backlog', 'to_do', 'in_progress', 'in_review', 'done', 'cancelled'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

function triggerColor(type) {
    switch (type) {
        case 'task_created': return 'green';
        case 'task_status_changed': return 'blue';
        case 'task_priority_changed': return 'purple';
        case 'task_assigned': return 'yellow';
        case 'task_completed': return 'green';
        default: return 'gray';
    }
}

const selectClass = 'block w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100';

function ConditionRow({ condition, index, onChange, onRemove, users, sections }) {
    const field = condition.field || 'status';

    const getValueOptions = () => {
        switch (field) {
            case 'status': return STATUSES.map(s => ({ value: s, label: formatLabel(s) }));
            case 'priority': return PRIORITIES.map(p => ({ value: p, label: formatLabel(p) }));
            case 'assigned_to': return users.map(u => ({ value: String(u.id), label: u.name }));
            case 'section_id': return sections.map(s => ({ value: String(s.id), label: s.name }));
            default: return [];
        }
    };

    return (
        <div className="flex items-start gap-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3">
            <div className="grid grid-cols-3 gap-2 flex-1 min-w-0">
                <select
                    value={field}
                    onChange={(e) => onChange(index, { ...condition, field: e.target.value, value: '' })}
                    className={selectClass}
                >
                    {CONDITION_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <select
                    value={condition.operator || 'equals'}
                    onChange={(e) => onChange(index, { ...condition, operator: e.target.value })}
                    className={selectClass}
                >
                    {CONDITION_OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select
                    value={condition.value || ''}
                    onChange={(e) => onChange(index, { ...condition, value: e.target.value })}
                    className={selectClass}
                >
                    <option value="">Select...</option>
                    {getValueOptions().map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                </select>
            </div>
            <button onClick={() => onRemove(index)} className="mt-2 text-gray-400 hover:text-red-500 transition-colors shrink-0" title="Remove condition">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}

function ActionRow({ action, index, onChange, onRemove, users, sections }) {
    const type = action.type || 'change_status';
    const params = action.params || {};

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
            default:
                return null;
        }
    };

    const needsFullWidth = type === 'add_comment';

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
                {needsFullWidth && (
                    <p className="text-xs text-gray-400">
                        Variables: {'{task}'}, {'{status}'}, {'{assignee}'}, {'{project}'}
                    </p>
                )}
            </div>
            <button onClick={() => onRemove(index)} className="mt-2 text-gray-400 hover:text-red-500 transition-colors shrink-0" title="Remove action">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}

const emptyRule = () => ({
    name: '',
    trigger_type: 'task_status_changed',
    conditions: [],
    actions: [{ type: 'change_status', params: {} }],
});

export default function AutomationRuleBuilder({ projectId, rules: initialRules, users, sections }) {
    const [rules, setRules] = useState(initialRules || []);
    const [showForm, setShowForm] = useState(false);
    const [editingRule, setEditingRule] = useState(null);
    const [form, setForm] = useState(emptyRule());
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

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

    const handleSave = useCallback(async () => {
        if (!form.name.trim() || form.actions.length === 0) {
            setError('Name and at least one action are required.');
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

            const data = await res.json();

            if (!res.ok) {
                setError(data.message || 'Failed to save rule.');
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

    const handleDelete = useCallback(async (rule) => {
        if (!confirm(`Delete rule "${rule.name}"?`)) return;
        try {
            await apiFetch(`/projects/${projectId}/automation-rules/${rule.id}`, { method: 'DELETE' });
            setRules(prev => prev.filter(r => r.id !== rule.id));
        } catch (e) {
            console.error('Failed to delete rule', e);
        }
    }, [projectId]);

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Automation Rules ({rules.length})
                </h3>
                <Button size="sm" onClick={openCreate}>Add Rule</Button>
            </div>

            {rules.length > 0 ? (
                <div className="space-y-2">
                    {rules.map((rule) => (
                        <div key={rule.id} className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
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
                                    </Badge>
                                    <span className="text-xs text-gray-400">
                                        {rule.conditions?.length || 0} condition{(rule.conditions?.length || 0) !== 1 ? 's' : ''}, {rule.actions?.length || 0} action{(rule.actions?.length || 0) !== 1 ? 's' : ''}
                                    </span>
                                </div>
                            </div>
                            <button onClick={() => openEdit(rule)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                            </button>
                            <button onClick={() => handleDelete(rule)} className="text-gray-400 hover:text-red-500 p-1">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                    No automation rules yet. Create one to automate task workflows.
                </div>
            )}

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
                        <select
                            value={form.trigger_type}
                            onChange={(e) => setForm(prev => ({ ...prev, trigger_type: e.target.value }))}
                            className={selectClass}
                        >
                            {TRIGGER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
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
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
