import { useEffect, useMemo, useState } from 'react';
import { router } from '@inertiajs/react';
import Button from './Button';

/**
 * Hand a decided request to people who were not part of it.
 *
 * The share is the whole grant — the recipient can open the request and its
 * attachments — so the panel keeps the current list visible rather than making
 * it something you set and cannot see afterwards.
 */
export default function ApprovalItemShare({ item, project, sharedWith = [] }) {
    const [people, setPeople] = useState([]);
    const [selected, setSelected] = useState([]);
    const [query, setQuery] = useState('');
    const [sharing, setSharing] = useState(false);

    // The People picker endpoint: every active user, open to any signed-in user.
    useEffect(() => {
        let cancelled = false;
        fetch(route('people-options'), { headers: { Accept: 'application/json' } })
            .then((r) => (r.ok ? r.json() : { users: [] }))
            .then((d) => { if (!cancelled) setPeople(d.users || []); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const alreadyShared = useMemo(
        () => new Set(sharedWith.map((s) => s.id)),
        [sharedWith],
    );

    const candidates = useMemo(() => {
        const q = query.trim().toLowerCase();
        return people
            // The requester already owns it, and anyone already on the list has
            // nothing to gain from being added twice.
            .filter((u) => u.id !== item.requested_by && !alreadyShared.has(u.id))
            .filter((u) => !q || u.name?.toLowerCase().includes(q) || u.position?.toLowerCase().includes(q))
            .slice(0, 50);
    }, [people, query, alreadyShared, item.requested_by]);

    const toggle = (id) =>
        setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

    const submit = () => {
        if (selected.length === 0) return;
        setSharing(true);
        router.post(
            route('approval-projects.items.shares.store', [project.id, item.id]),
            { user_ids: selected },
            {
                preserveScroll: true,
                onFinish: () => { setSharing(false); setSelected([]); setQuery(''); },
            },
        );
    };

    const revoke = (userId) =>
        router.delete(
            route('approval-projects.items.shares.destroy', [project.id, item.id, userId]),
            { preserveScroll: true },
        );

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Share</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Anyone you add can open this request and its attachments.
            </p>

            {sharedWith.length > 0 && (
                <ul className="mb-4 space-y-1.5">
                    {sharedWith.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="min-w-0 text-gray-700 dark:text-gray-300">
                                <span className="truncate">{s.name}</span>
                                {s.shared_by && (
                                    <span className="text-gray-400 dark:text-gray-500"> — shared by {s.shared_by}</span>
                                )}
                            </span>
                            <button
                                type="button"
                                onClick={() => revoke(s.id)}
                                aria-label={`Remove ${s.name}'s access`}
                                className="shrink-0 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people…"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />

            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                {candidates.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">No one to add.</p>
                ) : (
                    candidates.map((u) => (
                        <label
                            key={u.id}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                            <input
                                type="checkbox"
                                checked={selected.includes(u.id)}
                                onChange={() => toggle(u.id)}
                                className="rounded border-gray-300 dark:border-gray-600"
                            />
                            <span className="min-w-0 truncate text-gray-700 dark:text-gray-300">
                                {u.name}
                                {u.position && <span className="text-gray-400 dark:text-gray-500"> — {u.position}</span>}
                            </span>
                        </label>
                    ))
                )}
            </div>

            <div className="mt-3 flex items-center gap-3">
                <Button type="button" onClick={submit} disabled={selected.length === 0 || sharing}>
                    {sharing ? 'Sharing…' : `Share${selected.length ? ` with ${selected.length}` : ''}`}
                </Button>
                {selected.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setSelected([])}
                        className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                        Clear
                    </button>
                )}
            </div>
        </div>
    );
}
