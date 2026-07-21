import { useState } from 'react';

const APPROVER_TYPES = {
    specific_user: 'Specific User',
    role: 'Role',
    requester_manager: 'Requester\'s Manager',
    department_head: 'Department Head',
    division_head: 'Division Head',
    team_leader: 'Team Leader',
    group: 'Group',
    project_owner: 'Project Owner',
};

const QUORUM_MODES = {
    any: 'Any Approver',
    all: 'All Approvers',
    majority: 'Majority',
    count: 'Specific Count',
};

const REJECT_BEHAVIORS = {
    reject_item: 'Reject (Terminal)',
    return_to_previous_step: 'Return to Previous Step',
    return_to_requester: 'Return to Requester',
};

export default function ApprovalChainBuilder({ value = [], onChange, users = [], roles = [] }) {
    const [expandedStep, setExpandedStep] = useState(null);

    const addStep = () => {
        const newStep = {
            temp_id: Date.now(),
            step_number: Math.max(...value.map(s => s.step_number || 0), 0) + 1,
            name: '',
            approver_type: 'specific_user',
            approver_config: {},
            quorum_mode: 'any',
            quorum_count: 1,
            skip_conditions: null,
            on_reject_override: null,
            fallback_user_id: null,
        };
        onChange([...value, newStep]);
        setExpandedStep(newStep.temp_id);
    };

    const updateStep = (tempId, updates) => {
        onChange(value.map(step =>
            (step.temp_id === tempId || step.id === tempId) ? { ...step, ...updates } : step
        ));
    };

    const removeStep = (tempId) => {
        onChange(value.filter(step => (step.temp_id || step.id) !== tempId && step.id !== tempId));
    };

    const moveStep = (currentIndex, direction) => {
        const newValue = [...value];
        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex >= 0 && targetIndex < newValue.length) {
            [newValue[currentIndex], newValue[targetIndex]] = [newValue[targetIndex], newValue[currentIndex]];
            newValue.forEach((step, idx) => {
                step.step_number = idx + 1;
            });
            onChange(newValue);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Approval Steps</label>
                <button
                    type="button"
                    onClick={addStep}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition"
                >
                    Add Step
                </button>
            </div>

            {value && value.length > 0 ? (
                <div className="space-y-3">
                    {value.map((step, index) => (
                        <div key={step.temp_id || step.id} className="bg-white dark:bg-gray-700 rounded-lg shadow">
                            <button
                                type="button"
                                onClick={() => setExpandedStep(expandedStep === (step.temp_id || step.id) ? null : (step.temp_id || step.id))}
                                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-600 transition"
                            >
                                <div className="flex items-center gap-4 flex-1 text-left">
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">
                                            Step {step.step_number}: {step.name || 'Unnamed'}
                                        </p>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                            {APPROVER_TYPES[step.approver_type] || step.approver_type}
                                        </p>
                                    </div>
                                </div>
                                <span className={`text-gray-400 transition ${expandedStep === (step.temp_id || step.id) ? 'rotate-180' : ''}`}>▼</span>
                            </button>

                            {expandedStep === (step.temp_id || step.id) && (
                                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-600 border-t border-gray-200 dark:border-gray-500 space-y-4">
                                    {/* Step Name */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Step Name
                                        </label>
                                        <input
                                            type="text"
                                            value={step.name}
                                            onChange={(e) => updateStep(step.temp_id || step.id, { name: e.target.value })}
                                            placeholder="e.g., Manager Review, Executive Approval"
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-lg dark:bg-gray-700 dark:text-white"
                                        />
                                    </div>

                                    {/* Approver Type */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Approver Type
                                        </label>
                                        <select
                                            value={step.approver_type}
                                            onChange={(e) => updateStep(step.temp_id || step.id, { approver_type: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-lg dark:bg-gray-700 dark:text-white"
                                        >
                                            {Object.entries(APPROVER_TYPES).map(([key, label]) => (
                                                <option key={key} value={key}>{label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Approver Config (context-specific) */}
                                    {step.approver_type === 'specific_user' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Select User
                                            </label>
                                            <select
                                                value={step.approver_config?.user_id || ''}
                                                onChange={(e) => updateStep(step.temp_id || step.id, {
                                                    approver_config: { ...step.approver_config, user_id: parseInt(e.target.value) }
                                                })}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-lg dark:bg-gray-700 dark:text-white"
                                            >
                                                <option value="">Choose a user...</option>
                                                {users.map(user => (
                                                    <option key={user.id} value={user.id}>{user.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {step.approver_type === 'role' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Select Role
                                            </label>
                                            <select
                                                value={step.approver_config?.role || ''}
                                                onChange={(e) => updateStep(step.temp_id || step.id, {
                                                    approver_config: { ...step.approver_config, role: e.target.value }
                                                })}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-lg dark:bg-gray-700 dark:text-white"
                                            >
                                                <option value="">Choose a role...</option>
                                                {roles.map(role => (
                                                    <option key={role.id} value={role.name}>{role.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {step.approver_type === 'department_head' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Resolve From
                                            </label>
                                            <select
                                                value={step.approver_config?.of || 'requester'}
                                                onChange={(e) => updateStep(step.temp_id || step.id, {
                                                    approver_config: { ...step.approver_config, of: e.target.value }
                                                })}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-lg dark:bg-gray-700 dark:text-white"
                                            >
                                                <option value="requester">Requester's Department</option>
                                                <option value="fixed">Fixed Department</option>
                                            </select>
                                        </div>
                                    )}

                                    {/* Quorum Settings */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Quorum Mode
                                        </label>
                                        <select
                                            value={step.quorum_mode}
                                            onChange={(e) => updateStep(step.temp_id || step.id, { quorum_mode: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-lg dark:bg-gray-700 dark:text-white"
                                        >
                                            {Object.entries(QUORUM_MODES).map(([key, label]) => (
                                                <option key={key} value={key}>{label}</option>
                                            ))}
                                        </select>
                                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                                            {step.quorum_mode === 'any' && 'Step passes when any single approver approves'}
                                            {step.quorum_mode === 'all' && 'Step passes when all approvers approve'}
                                            {step.quorum_mode === 'majority' && 'Step passes when majority of approvers approve'}
                                            {step.quorum_mode === 'count' && 'Step passes when a specific count approves'}
                                        </p>
                                    </div>

                                    {step.quorum_mode === 'count' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Required Approvals
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={step.quorum_count}
                                                onChange={(e) => updateStep(step.temp_id || step.id, { quorum_count: parseInt(e.target.value) })}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-lg dark:bg-gray-700 dark:text-white"
                                            />
                                        </div>
                                    )}

                                    {/* Reject Behavior Override */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            When Rejected (step-specific override)
                                        </label>
                                        <select
                                            value={step.on_reject_override || ''}
                                            onChange={(e) => updateStep(step.temp_id || step.id, { on_reject_override: e.target.value || null })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-lg dark:bg-gray-700 dark:text-white"
                                        >
                                            <option value="">Use Chain Default</option>
                                            {Object.entries(REJECT_BEHAVIORS).map(([key, label]) => (
                                                <option key={key} value={key}>{label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Fallback User */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Fallback Approver (if none resolved)
                                        </label>
                                        <select
                                            value={step.fallback_user_id || ''}
                                            onChange={(e) => updateStep(step.temp_id || step.id, { fallback_user_id: e.target.value ? parseInt(e.target.value) : null })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-lg dark:bg-gray-700 dark:text-white"
                                        >
                                            <option value="">None (will fail)</option>
                                            {users.map(user => (
                                                <option key={user.id} value={user.id}>{user.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Step Actions */}
                                    <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-500">
                                        {index > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => moveStep(index, 'up')}
                                                className="px-3 py-2 bg-gray-200 dark:bg-gray-500 text-gray-700 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-400 text-sm transition"
                                            >
                                                ↑ Move Up
                                            </button>
                                        )}
                                        {index < value.length - 1 && (
                                            <button
                                                type="button"
                                                onClick={() => moveStep(index, 'down')}
                                                className="px-3 py-2 bg-gray-200 dark:bg-gray-500 text-gray-700 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-400 text-sm transition"
                                            >
                                                ↓ Move Down
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => removeStep(step.temp_id || step.id)}
                                            className="ml-auto px-3 py-2 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 text-sm transition flex items-center gap-2"
                                        >
                                            Delete Step
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 text-center">
                    <p className="text-gray-600 dark:text-gray-400 mb-4">No steps yet</p>
                    <button
                        type="button"
                        onClick={addStep}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition"
                    >
                        Add First Step
                    </button>
                </div>
            )}
        </div>
    );
}
