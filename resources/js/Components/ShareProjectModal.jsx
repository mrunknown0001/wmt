import { useState, useRef, useEffect } from 'react';
import { router } from '@inertiajs/react';
import Modal from './Modal';
import Avatar from './Avatar';
import Tooltip from './Tooltip';
import { apiFetch } from '../utils';

const ROLE_LABELS = {
    viewer: 'Can view',
    editor: 'Can edit',
    admin: 'Admin',
};

export default function ShareProjectModal({ isOpen, onClose, project, users = [], canManage }) {
    const [search, setSearch] = useState('');
    const [selectedRole, setSelectedRole] = useState('viewer');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [processing, setProcessing] = useState(null);
    const containerRef = useRef(null);
    const inputRef = useRef(null);

    const members = project?.members || [];
    const owner = project?.owner;
    const memberIds = new Set(members.map((m) => m.id));
    if (owner) memberIds.add(owner.id);

    const available = users.filter((u) => {
        if (memberIds.has(u.id)) return false;
        if (!search) return false;
        const q = search.toLowerCase();
        return u.name.toLowerCase().includes(q) || (u.email && u.email.toLowerCase().includes(q));
    });

    useEffect(() => {
        if (!isDropdownOpen) return;
        const handler = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isDropdownOpen]);

    useEffect(() => {
        if (isOpen) {
            setSearch('');
            setIsDropdownOpen(false);
        }
    }, [isOpen]);

    const handleAddMember = async (userId) => {
        setProcessing(userId);
        setSearch('');
        setIsDropdownOpen(false);
        try {
            await apiFetch(`/projects/${project.id}/members`, {
                method: 'POST',
                body: JSON.stringify({ members: [{ user_id: userId, role: selectedRole }] }),
            });
            router.reload({ only: ['project'] });
        } finally {
            setProcessing(null);
        }
    };

    const handleUpdateRole = async (userId, newRole) => {
        setProcessing(userId);
        try {
            await apiFetch(`/projects/${project.id}/members/${userId}`, {
                method: 'PUT',
                body: JSON.stringify({ role: newRole }),
            });
            router.reload({ only: ['project'] });
        } finally {
            setProcessing(null);
        }
    };

    const handleRemoveMember = async (userId) => {
        setProcessing(userId);
        try {
            await apiFetch(`/projects/${project.id}/members/${userId}`, {
                method: 'DELETE',
            });
            router.reload({ only: ['project'] });
        } finally {
            setProcessing(null);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Share Project" size="lg">
            <div className="space-y-4">
                {/* Add member search */}
                {canManage && (
                    <div ref={containerRef} className="relative">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={search}
                                    onChange={(e) => { setSearch(e.target.value); setIsDropdownOpen(true); }}
                                    onFocus={() => { if (search) setIsDropdownOpen(true); }}
                                    placeholder="Add people by name or email..."
                                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
                                />
                            </div>
                            <select
                                value={selectedRole}
                                onChange={(e) => setSelectedRole(e.target.value)}
                                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-700 dark:text-gray-200 px-2 py-2 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                            >
                                <option value="viewer">Viewer</option>
                                <option value="editor">Editor</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>

                        {/* Dropdown results */}
                        {isDropdownOpen && search.length > 0 && (
                            <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                {available.length > 0 ? (
                                    available.slice(0, 10).map((user) => (
                                        <button
                                            key={user.id}
                                            type="button"
                                            onClick={() => handleAddMember(user.id)}
                                            disabled={processing === user.id}
                                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                                        >
                                            <Avatar name={user.name} size="sm" />
                                            <div className="min-w-0 flex-1">
                                                <div className="text-gray-900 dark:text-gray-100 font-medium truncate">{user.name}</div>
                                                {user.email && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</div>}
                                            </div>
                                        </button>
                                    ))
                                ) : (
                                    <div className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">No users found.</div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Member list */}
                <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-80 overflow-y-auto">
                    {/* Owner row */}
                    {owner && (
                        <div className="flex items-center gap-3 py-3">
                            <Avatar name={owner.name} size="md" />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{owner.name}</div>
                                {owner.email && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{owner.email}</div>}
                            </div>
                            <span className="text-xs font-medium bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-2.5 py-1 rounded-full">
                                Owner
                            </span>
                        </div>
                    )}

                    {/* Member rows */}
                    {members.filter((m) => m.id !== owner?.id).map((member) => (
                        <div key={member.id} className="flex items-center gap-3 py-3">
                            <Avatar name={member.name} size="md" />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{member.name}</div>
                                {member.email && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.email}</div>}
                            </div>
                            {canManage ? (
                                <div className="flex items-center gap-1.5">
                                    <select
                                        value={member.pivot?.role || 'viewer'}
                                        onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                                        disabled={processing === member.id}
                                        className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 cursor-pointer disabled:opacity-50 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                                    >
                                        <option value="viewer">Can view</option>
                                        <option value="editor">Can edit</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                    <Tooltip content="Remove">
                                        <button
                                            onClick={() => handleRemoveMember(member.id)}
                                            disabled={processing === member.id}
                                            className="p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                                        >
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </Tooltip>
                                </div>
                            ) : (
                                <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2.5 py-1 rounded-full">
                                    {ROLE_LABELS[member.pivot?.role] || 'Viewer'}
                                </span>
                            )}
                        </div>
                    ))}

                    {/* Empty state */}
                    {members.filter((m) => m.id !== owner?.id).length === 0 && (
                        <div className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                            No members yet. {canManage ? 'Search above to add people.' : ''}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
