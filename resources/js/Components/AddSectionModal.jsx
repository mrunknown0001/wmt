import { useState } from 'react';
import { apiFetch, errorMessageFrom } from '../utils';

const SECTION_COLORS = [
    '#6366f1', // indigo
    '#ec4899', // pink
    '#f59e0b', // amber
    '#10b981', // emerald
    '#3b82f6', // blue
    '#8b5cf6', // violet
    '#ef4444', // red
    '#06b6d4', // cyan
];

export default function AddSectionModal({ isOpen, onClose, projectId, onSectionAdded }) {
    const [name, setName] = useState('');
    const [color, setColor] = useState('#6366f1');
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState(null);

    // The sections endpoint is a JSON API, so this posts with fetch rather than
    // Inertia's router (which expects an Inertia page response and would choke on
    // the JSON payload — and the named route it used never existed).
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        if (!name.trim()) {
            setError('Section name is required');
            return;
        }

        setIsCreating(true);
        try {
            const res = await apiFetch(`/api/approval-projects/${projectId}/sections`, {
                method: 'POST',
                body: JSON.stringify({ name: name.trim(), color }),
            });

            if (!res.ok) {
                setError(await errorMessageFrom(res, 'Failed to create section'));
                return;
            }

            const { section } = await res.json();
            onSectionAdded?.(section);
            setName('');
            setColor('#6366f1');
            onClose();
        } catch {
            setError('Failed to create section');
        } finally {
            setIsCreating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-sm mx-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Add New Section
                </h3>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg">
                            <p className="text-sm text-red-700 dark:text-red-200">{error}</p>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Section Name *
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Pending Review"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Color
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                            {SECTION_COLORS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setColor(c)}
                                    className={`w-full h-10 rounded-lg border-2 transition ${
                                        color === c
                                            ? 'border-gray-900 dark:border-white'
                                            : 'border-transparent'
                                    }`}
                                    style={{ backgroundColor: c }}
                                    title={c}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-3 justify-end pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium rounded-lg transition"
                            disabled={isCreating}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition disabled:opacity-50"
                            disabled={isCreating || !name.trim()}
                        >
                            {isCreating ? 'Creating...' : 'Create Section'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
