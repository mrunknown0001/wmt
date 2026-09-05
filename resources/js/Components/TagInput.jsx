import { useEffect, useRef, useState } from 'react';
import { apiFetch, errorMessageFrom, toast } from '../utils';

/**
 * Labels on one record, saved as they are changed.
 *
 * Deliberately not part of the surrounding form. A tag is a filing decision
 * rather than a property of the work — people add one while looking for
 * something, on a page they never meant to edit — so waiting for Save (and
 * failing on a form that will not validate for unrelated reasons) would put a
 * dialog in the way of a two-second act.
 *
 * Suggestions come from everything already in use, most-used first, because the
 * value of a shared vocabulary is entirely in people picking the existing word
 * instead of coining a synonym for it.
 */
export default function TagInput({
    type,            // 'project' | 'task' | 'minute'
    id,
    initial = [],
    canEdit = true,
    label = 'Tags',
    // A tag is a search: clicking one runs it. The host supplies the action, so
    // this component does not need to know how the page navigates.
    onSearch = null,
    className = '',
}) {
    const [tags, setTags] = useState(() => initial.map((t) => (typeof t === 'string' ? t : t.name)));
    const [draft, setDraft] = useState('');
    const [open, setOpen] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [busy, setBusy] = useState(false);
    const boxRef = useRef(null);

    useEffect(() => {
        setTags(initial.map((t) => (typeof t === 'string' ? t : t.name)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, type]);

    // Close the suggestion list on an outside click, like every other popover.
    useEffect(() => {
        if (!open) return undefined;

        const away = (e) => {
            if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
        };

        document.addEventListener('mousedown', away);

        return () => document.removeEventListener('mousedown', away);
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;

        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                const res = await apiFetch(`/api/tags?q=${encodeURIComponent(draft)}`);
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled) setSuggestions(data.tags || []);
            } catch {
                // A suggestion list that fails to load is not worth a message:
                // typing the name still works.
            }
        }, 200);

        return () => { cancelled = true; clearTimeout(timer); };
    }, [draft, open]);

    const save = async (next) => {
        const before = tags;
        setTags(next);          // optimistic: the chip appears as it is typed
        setBusy(true);

        try {
            const res = await apiFetch(`/api/tags/${type}/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ tags: next }),
            });
            if (!res.ok) throw new Error(await errorMessageFrom(res, 'Could not save those tags.'));

            const data = await res.json();
            setTags((data.tags || []).map((t) => t.name));
        } catch (err) {
            setTags(before);
            toast(err.message || 'Could not save those tags.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const add = (name) => {
        const clean = (name || '').trim().slice(0, 40);

        if (!clean) return;

        // Same word twice is the same tag, whatever the casing.
        if (tags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
            setDraft('');
            return;
        }

        setDraft('');
        save([...tags, clean]);
    };

    const remove = (name) => save(tags.filter((t) => t !== name));

    const onKeyDown = (e) => {
        // Comma and Enter both finish a tag; people type both.
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(draft);
        } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
            // The usual chip-field behaviour: backspace on an empty box takes
            // the last chip back rather than doing nothing.
            remove(tags[tags.length - 1]);
        } else if (e.key === 'Escape') {
            setOpen(false);
        }
    };

    const unused = suggestions.filter((s) => !tags.some((t) => t.toLowerCase() === s.name.toLowerCase()));

    return (
        <div className={className} ref={boxRef}>
            {label && (
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
                {tags.map((tag) => (
                    <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800 px-2 py-0.5 text-xs"
                    >
                        <button
                            type="button"
                            onClick={() => onSearch?.(tag)}
                            disabled={!onSearch}
                            title={onSearch ? `Find everything tagged ${tag}` : undefined}
                            className={onSearch ? 'hover:underline' : 'cursor-default'}
                        >
                            {tag}
                        </button>
                        {canEdit && (
                            <button
                                type="button"
                                onClick={() => remove(tag)}
                                disabled={busy}
                                aria-label={`Remove ${tag}`}
                                className="text-primary-400 hover:text-red-500 disabled:opacity-50"
                            >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </span>
                ))}

                {canEdit && (
                    <div className="relative">
                        <input
                            type="text"
                            value={draft}
                            onChange={(e) => { setDraft(e.target.value); setOpen(true); }}
                            onFocus={() => setOpen(true)}
                            onKeyDown={onKeyDown}
                            onBlur={() => add(draft)}
                            placeholder={tags.length ? 'Add another…' : 'Add a tag…'}
                            // The visible label sits above the whole chip row
                            // rather than on this box, so the box says what it
                            // is itself — and keeps saying it once the
                            // placeholder changes.
                            aria-label="Add a tag"
                            maxLength={40}
                            className="w-32 text-xs rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 py-1 px-2"
                        />

                        {open && unused.length > 0 && (
                            <div className="absolute z-40 mt-1 w-56 max-h-56 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
                                {unused.map((s) => (
                                    <button
                                        key={s.id}
                                        type="button"
                                        // onMouseDown, not onClick: the input's
                                        // blur fires first and would otherwise
                                        // add the half-typed draft instead.
                                        onMouseDown={(e) => { e.preventDefault(); add(s.name); }}
                                        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-700"
                                    >
                                        <span className="truncate text-gray-700 dark:text-gray-200">{s.name}</span>
                                        <span className="shrink-0 text-[10px] text-gray-400">{s.uses}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {!canEdit && tags.length === 0 && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">No tags</span>
                )}
            </div>
        </div>
    );
}
