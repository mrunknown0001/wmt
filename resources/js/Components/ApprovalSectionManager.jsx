import { useState } from 'react';
import AddSectionModal from './AddSectionModal';
import { apiFetch, errorMessageFrom, toast } from '../utils';

const SECTION_COLORS = [
    '#6366f1', '#ec4899', '#f59e0b', '#10b981',
    '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4',
];

const EditIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
);

const TrashIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

/**
 * Add / rename / recolour / delete an approval project's sections, mirroring the
 * custom fields manager on the same Overview tab. Talks to the JSON section API.
 */
export default function ApprovalSectionManager({ projectId, initialSections = [] }) {
    const [sections, setSections] = useState(initialSections);
    const [showAdd, setShowAdd] = useState(false);
    const [editing, setEditing] = useState(null); // { id, name, color }
    const [saving, setSaving] = useState(false);

    const startEdit = (section) => setEditing({ id: section.id, name: section.name, color: section.color || SECTION_COLORS[0] });

    const handleUpdate = async () => {
        if (!editing?.name.trim()) return;
        setSaving(true);
        try {
            const res = await apiFetch(`/api/approval-projects/${projectId}/sections/${editing.id}`, {
                method: 'PUT',
                body: JSON.stringify({ name: editing.name.trim(), color: editing.color }),
            });
            if (!res.ok) {
                toast(await errorMessageFrom(res, 'Failed to update section'));
                return;
            }
            const { section } = await res.json();
            setSections((prev) => prev.map((s) => (s.id === section.id ? section : s)));
            setEditing(null);
        } catch {
            toast('Failed to update section');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (section) => {
        if (!confirm(`Delete section "${section.name}"?`)) return;
        try {
            const res = await apiFetch(`/api/approval-projects/${projectId}/sections/${section.id}`, {
                method: 'DELETE',
            });
            if (!res.ok) {
                toast(await errorMessageFrom(res, 'Failed to delete section'));
                return;
            }
            setSections((prev) => prev.filter((s) => s.id !== section.id));
        } catch {
            toast('Failed to delete section');
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-900 dark:text-white">
                    Sections ({sections.length})
                </h4>
                <button
                    type="button"
                    onClick={() => setShowAdd(true)}
                    className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
                >
                    + Add Section
                </button>
            </div>

            {sections.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                    No sections yet. Add one to group requests.
                </p>
            ) : (
                <ul className="space-y-2">
                    {sections.map((section) => (
                        <li key={section.id} className="group flex items-center gap-2">
                            {editing?.id === section.id ? (
                                <div className="flex-1 flex flex-wrap items-center gap-2">
                                    <input
                                        value={editing.name}
                                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleUpdate();
                                            if (e.key === 'Escape') setEditing(null);
                                        }}
                                        autoFocus
                                        className="flex-1 min-w-[8rem] px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                                    />
                                    <div className="flex items-center gap-1">
                                        {SECTION_COLORS.map((c) => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setEditing({ ...editing, color: c })}
                                                className={`w-4 h-4 rounded-full border-2 ${
                                                    editing.color === c ? 'border-gray-900 dark:border-white' : 'border-transparent'
                                                }`}
                                                style={{ backgroundColor: c }}
                                            />
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleUpdate}
                                        disabled={saving || !editing.name.trim()}
                                        className="px-2 py-1 text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white rounded disabled:opacity-50"
                                    >
                                        Save
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditing(null)}
                                        className="px-2 py-1 text-xs text-gray-600 dark:text-gray-300 hover:underline"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <span
                                        className="w-3 h-3 rounded-full shrink-0"
                                        style={{ backgroundColor: section.color || SECTION_COLORS[0] }}
                                    />
                                    <span className="flex-1 text-gray-700 dark:text-gray-300 truncate">{section.name}</span>
                                    <button
                                        type="button"
                                        onClick={() => startEdit(section)}
                                        title="Rename"
                                        className="p-1 text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                                    >
                                        <EditIcon />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(section)}
                                        title="Delete"
                                        className="p-1 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                                    >
                                        <TrashIcon />
                                    </button>
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <AddSectionModal
                isOpen={showAdd}
                onClose={() => setShowAdd(false)}
                projectId={projectId}
                onSectionAdded={(section) => setSections((prev) => [...prev, section])}
            />
        </div>
    );
}
