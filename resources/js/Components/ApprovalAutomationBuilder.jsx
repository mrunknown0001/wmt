import Button from './Button';

const ACTION_TYPES = [
    { value: 'send_notification', label: 'Send Notification' },
    { value: 'add_comment', label: 'Add Comment' },
    { value: 'set_custom_field', label: 'Set Custom Field' },
];

const NOTIFY_TARGETS = [
    { value: 'requester', label: 'Requester' },
    { value: '__requester_manager__', label: "Requester's Manager" },
];

const ITEM_STATUSES = ['pending', 'approved', 'rejected', 'changes_requested', 'cancelled'];

const CONDITION_OPERATORS = [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'does not equal' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
];

const selectClass = 'px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm';
const inputClass = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm';

// Default params for each action type.
const actionDefaults = (type, customFields) => ({
    send_notification: { target: 'requester', message: '' },
    add_comment: { message: '' },
    set_custom_field: { custom_field_id: customFields[0]?.id ?? '', value: '' },
}[type]);

export default function ApprovalAutomationBuilder({ conditions, onConditionsChange, actions = [], onActionsChange, customFields = [] }) {
    // ----- Actions (at least one is required) -----
    const addAction = () => onActionsChange([...actions, { type: 'add_comment', params: { message: '' } }]);
    const setAction = (i, next) => onActionsChange(actions.map((a, idx) => (idx === i ? next : a)));
    const removeAction = (i) => onActionsChange(actions.filter((_, idx) => idx !== i));
    const setActionType = (i, type) => setAction(i, { type, params: actionDefaults(type, customFields) });
    const setParam = (i, key, value) => setAction(i, { ...actions[i], params: { ...actions[i].params, [key]: value } });

    // ----- Conditions (optional) -----
    const cond = conditions || { logic: 'all', rules: [] };
    const commit = (next) => onConditionsChange(next.rules.length ? next : null);
    const addCondition = () => commit({ ...cond, rules: [...cond.rules, { field: 'status', operator: 'equals', value: 'pending' }] });
    const setRule = (i, next) => commit({ ...cond, rules: cond.rules.map((r, idx) => (idx === i ? next : r)) });
    const removeRule = (i) => commit({ ...cond, rules: cond.rules.filter((_, idx) => idx !== i) });

    return (
        <div className="space-y-8">
            {/* Conditions */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Conditions <span className="font-normal text-gray-500">(optional)</span></h3>
                    <Button type="button" variant="secondary" onClick={addCondition}>+ Add Condition</Button>
                </div>
                {cond.rules.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No conditions — the rule runs on every matching trigger.</p>
                ) : (
                    <div className="space-y-2">
                        {cond.rules.length > 1 && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                Match
                                <select value={cond.logic} onChange={(e) => commit({ ...cond, logic: e.target.value })} className={selectClass}>
                                    <option value="all">all</option>
                                    <option value="any">any</option>
                                </select>
                                of the following:
                            </div>
                        )}
                        {cond.rules.map((rule, i) => {
                            const needsValue = !['is_empty', 'is_not_empty'].includes(rule.operator);
                            return (
                                <div key={i} className="flex flex-wrap items-center gap-2">
                                    <select value={rule.field} onChange={(e) => setRule(i, { ...rule, field: e.target.value })} className={selectClass}>
                                        <option value="status">Status</option>
                                    </select>
                                    <select value={rule.operator} onChange={(e) => setRule(i, { ...rule, operator: e.target.value })} className={selectClass}>
                                        {CONDITION_OPERATORS.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
                                    </select>
                                    {needsValue && (
                                        <select value={rule.value} onChange={(e) => setRule(i, { ...rule, value: e.target.value })} className={selectClass}>
                                            {ITEM_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                                        </select>
                                    )}
                                    <button type="button" onClick={() => removeRule(i)} className="text-gray-400 hover:text-red-500 p-1" title="Remove">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Actions */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Actions <span className="text-red-600">*</span></h3>
                    <Button type="button" variant="secondary" onClick={addAction}>+ Add Action</Button>
                </div>
                {actions.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Add at least one action to define what this rule does.</p>
                ) : (
                    <div className="space-y-3">
                        {actions.map((action, i) => (
                            <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <select value={action.type} onChange={(e) => setActionType(i, e.target.value)} className={selectClass}>
                                        {ACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                    <button type="button" onClick={() => removeAction(i)} className="text-gray-400 hover:text-red-500 p-1" title="Remove">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>

                                {action.type === 'send_notification' && (
                                    <div className="space-y-2">
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Notify</label>
                                        <select value={action.params.target ?? 'requester'} onChange={(e) => setParam(i, 'target', e.target.value)} className={selectClass}>
                                            {NOTIFY_TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                        </select>
                                        <input type="text" value={action.params.message ?? ''} onChange={(e) => setParam(i, 'message', e.target.value)} placeholder="Message" className={inputClass} />
                                        <p className="text-xs text-gray-400">Placeholders: {'{item}'}, {'{status}'}, {'{requester}'}</p>
                                    </div>
                                )}

                                {action.type === 'add_comment' && (
                                    <div className="space-y-2">
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Comment</label>
                                        <textarea value={action.params.message ?? ''} onChange={(e) => setParam(i, 'message', e.target.value)} rows="2" placeholder="Comment text" className={inputClass} />
                                        <p className="text-xs text-gray-400">Placeholders: {'{item}'}, {'{status}'}, {'{requester}'}</p>
                                    </div>
                                )}

                                {action.type === 'set_custom_field' && (
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Custom Field</label>
                                            <select value={action.params.custom_field_id ?? ''} onChange={(e) => setParam(i, 'custom_field_id', e.target.value)} className={`${selectClass} w-full`}>
                                                <option value="">— Select —</option>
                                                {customFields.map((cf) => <option key={cf.id} value={cf.id}>{cf.name || cf.label}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Value</label>
                                            <input type="text" value={action.params.value ?? ''} onChange={(e) => setParam(i, 'value', e.target.value)} className={inputClass} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
