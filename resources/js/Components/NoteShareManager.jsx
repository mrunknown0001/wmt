import { useState, useEffect } from 'react';
import { router } from '@inertiajs/react';
import Button from './Button';
import Select from './Select';
import SearchableSelect from './SearchableSelect';
import Tooltip from './Tooltip';
import { apiFetch } from '../utils';

const TYPES = [
    { value: 'user', label: 'Person' },
    { value: 'team', label: 'Team' },
    { value: 'department', label: 'Department' },
    { value: 'division', label: 'Division' },
];

const ROLES = [
    { value: 'viewer', label: 'Viewer — can read only' },
    { value: 'editor', label: 'Editor — can read and edit' },
    { value: 'admin', label: 'Admin — can edit, archive and delete' },
];

const TYPE_LABEL = { user: 'Person', team: 'Team', department: 'Department', division: 'Division' };

export default function NoteShareManager({ basePath, shares = [], canManage, title = 'Sharing', hint }) {
    const [options, setOptions] = useState(null);
    const [type, setType] = useState('user');
    const [shareableId, setShareableId] = useState('');
    const [role, setRole] = useState('viewer');

    // Fetched once, on first render of the panel — the picker needs the whole
    // org and there is no reason to carry it on every notes page load.
    useEffect(() => {
        if (!canManage || options) return;

        let cancelled = false;
        apiFetch('/notes/share-options')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => { if (data && !cancelled) setOptions(data); })
            .catch(() => {});

        return () => { cancelled = true; };
    }, [canManage, options]);

    const listFor = (t) => ({
        user: options?.users,
        team: options?.teams,
        department: options?.departments,
        division: options?.divisions,
    }[t] || []);

    // Already-shared audiences are dropped from the picker: re-adding one would
    // silently overwrite its role rather than add anything.
    const taken = new Set(shares.map((s) => `${s.type}:${s.shareable_id}`));
    const choices = listFor(type)
        .filter((o) => !taken.has(`${type}:${o.id}`))
        .map((o) => ({ value: o.id, label: o.name }));

    const add = (e) => {
        e.preventDefault();
        if (!shareableId) return;

        router.post(`${basePath}/shares`, { type, shareable_id: shareableId, role }, {
            preserveScroll: true,
            onSuccess: () => { setShareableId(''); setRole('viewer'); },
        });
    };

    return (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-3">
                {hint || 'Share with a person, or with a whole team, department or division.'}
            </p>

            {shares.length === 0 && (
                <p className="text-xs text-gray-400 mb-3">Not shared with anyone yet.</p>
            )}

            {shares.length > 0 && (
                <ul className="space-y-2 mb-4">
                    {shares.map((share) => (
                        <li key={share.id} className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{share.name}</p>
                                <p className="text-[11px] text-gray-400">{TYPE_LABEL[share.type] || share.type}</p>
                            </div>

                            {canManage ? (
                                <>
                                    <select
                                        value={share.role}
                                        onChange={(e) => router.put(`${basePath}/shares/${share.id}`, { role: e.target.value }, { preserveScroll: true })}
                                        className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs text-gray-900 dark:text-gray-100 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                    >
                                        <option value="viewer">Viewer</option>
                                        <option value="editor">Editor</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                    <Tooltip content="Remove access">
                                        <button
                                            type="button"
                                            onClick={() => router.delete(`${basePath}/shares/${share.id}`, { preserveScroll: true })}
                                            className="text-gray-400 hover:text-red-500 transition-colors"
                                        >
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </Tooltip>
                                </>
                            ) : (
                                <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">{share.role}</span>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {canManage && (
                <form onSubmit={add} className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Select
                            label="Share with" id="share_type" value={type}
                            onChange={(e) => { setType(e.target.value); setShareableId(''); }}
                            options={TYPES}
                        />
                        <SearchableSelect
                            label={TYPE_LABEL[type]} id="share_target" value={shareableId}
                            onChange={setShareableId}
                            placeholder={options ? `Choose a ${type}...` : 'Loading...'}
                            options={choices}
                            showAvatar={type === 'user'}
                        />
                    </div>
                    <Select
                        label="Access" id="share_role" value={role}
                        onChange={(e) => setRole(e.target.value)}
                        options={ROLES}
                    />
                    <div className="flex justify-end">
                        <Button type="submit" size="sm" disabled={!shareableId}>Share</Button>
                    </div>
                </form>
            )}
        </div>
    );
}
