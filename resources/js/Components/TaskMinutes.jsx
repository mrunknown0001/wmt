import { useMemo, useState } from 'react';
import SearchableSelect from './SearchableSelect';

/**
 * Minutes for a meeting task, filled in by hand by the people who were there.
 *
 * Follows the printed minutes form section for section, so a record typed here
 * and a record typed on paper hold the same things in the same order. Nothing
 * is inferred or pre-filled from the task: minutes are a statement about what
 * happened in a room.
 */

const MEETING_TYPES = [
    { value: 'regular', label: 'Regular' },
    { value: 'special', label: 'Special' },
    { value: 'project', label: 'Project' },
    { value: 'management', label: 'Management' },
    { value: 'other', label: 'Other' },
];

const ATTENDANCE = [
    { value: 'present', label: 'Present' },
    { value: 'absent', label: 'Absent' },
    { value: 'excused', label: 'Excused' },
];

const ACTION_STATUSES = [
    { value: 'not_started', label: 'Not Started' },
    { value: 'open', label: 'Open' },
    { value: 'ongoing', label: 'Ongoing' },
    { value: 'delayed', label: 'Delayed' },
    { value: 'completed', label: 'Completed' },
];

const BLANK = {
    attendee: { user_id: '', name: '', position: '', attendance: 'present' },
    discussion: { topic: '', key_points: '', decision: '' },
    action: { action: '', user_id: '', name: '', target_date: '', status: 'open' },
    decision: { title: '', description: '' },
    issue: { issue: '', impact: '', recommended_action: '', user_id: '', name: '' },
};

// The same shape as Components/Input, so a field inside the minutes looks like
// a field anywhere else in the application.
const input = 'block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm transition-all duration-200 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500';

// Repeating sections are grids rather than tables. A table wide enough to need
// a scrolling wrapper also clips anything that escapes it, and the person
// picker's dropdown is exactly that — it was being cut in half by the wrapper.
const headRow = 'hidden sm:grid gap-2 px-1 pb-1 text-xs font-semibold text-gray-600 dark:text-gray-400';
const bodyRow = 'grid grid-cols-1 sm:grid-cols-12 gap-2 items-start px-1 py-2 border-t border-gray-200 dark:border-gray-700 first:border-t-0';
const mobileLabel = 'sm:hidden block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';

function Section({ number, title, children }) {
    return (
        <section className="mb-7">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                <span className="text-gray-400 dark:text-gray-500 mr-1.5">{number}.</span>{title}
            </h4>
            {children}
        </section>
    );
}

function Field({ label, children, className = '' }) {
    return (
        <label className={`block ${className}`}>
            <span className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</span>
            {children}
        </label>
    );
}

function AddRow({ onClick, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="mt-2 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >
            {children}
        </button>
    );
}

function RemoveRow({ onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label="Remove row"
            className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 text-sm leading-none px-1"
        >
            ×
        </button>
    );
}

export default function TaskMinutes({ task, users = [], minutes, updatedBy, updatedAt, canEdit = true }) {
    const [form, setForm] = useState(() => ({
        meeting_title: minutes?.meeting_title || '',
        meeting_date: (minutes?.meeting_date || '').slice(0, 10),
        start_time: minutes?.start_time || '',
        end_time: minutes?.end_time || '',
        venue: minutes?.venue || '',
        facilitator_user_id: minutes?.facilitator_user_id || '',
        prepared_by_user_id: minutes?.prepared_by_user_id || '',
        meeting_type: minutes?.meeting_type || '',
        attendees: minutes?.attendees || [],
        absent_notes: minutes?.absent_notes || '',
        agenda: minutes?.agenda || [],
        discussions: minutes?.discussions || [],
        action_items: minutes?.action_items || [],
        decisions: minutes?.decisions || [],
        issues: minutes?.issues || [],
        other_matters: minutes?.other_matters || '',
        next_meeting_date: (minutes?.next_meeting_date || '').slice(0, 10),
        next_meeting_time: minutes?.next_meeting_time || '',
        next_meeting_venue: minutes?.next_meeting_venue || '',
        next_meeting_agenda: minutes?.next_meeting_agenda || '',
        adjourned_at: minutes?.adjourned_at || '',
        prepared_by_position: minutes?.prepared_by_position || '',
        prepared_by_date: (minutes?.prepared_by_date || '').slice(0, 10),
        reviewed_by_user_id: minutes?.reviewed_by_user_id || '',
        reviewed_by_position: minutes?.reviewed_by_position || '',
        reviewed_by_date: (minutes?.reviewed_by_date || '').slice(0, 10),
    }));
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(null);
    const [error, setError] = useState(null);
    const [author, setAuthor] = useState({ by: updatedBy, at: updatedAt });

    // The people options: every active user in the system, searchable by name.
    const userOptions = useMemo(
        () => users.map((u) => ({ value: String(u.id), label: u.name })),
        [users],
    );

    const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

    const setRow = (list, index, field, value) =>
        setForm((f) => ({
            ...f,
            [list]: f[list].map((row, i) => (i === index ? { ...row, [field]: value } : row)),
        }));

    // Picking a person stores the id and snapshots the name, so an old minute
    // still reads correctly if that person later leaves.
    const setRowPerson = (list, index, userId) => {
        const picked = users.find((u) => String(u.id) === String(userId));
        setForm((f) => ({
            ...f,
            [list]: f[list].map((row, i) =>
                i === index ? { ...row, user_id: userId || '', name: picked?.name || '' } : row,
            ),
        }));
    };

    const addRow = (list, blank) => setForm((f) => ({ ...f, [list]: [...f[list], { ...blank }] }));
    const removeRow = (list, index) =>
        setForm((f) => ({ ...f, [list]: f[list].filter((_, i) => i !== index) }));

    const save = async () => {
        setSaving(true);
        setError(null);
        setSaved(null);
        try {
            const res = await fetch(`/tasks/${task.id}/minutes`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content || '',
                },
                body: JSON.stringify(form),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(json.message || 'The minutes could not be saved.');
            } else {
                setSaved('Minutes saved.');
                setAuthor({ by: json.updated_by, at: json.updated_at });
                setTimeout(() => setSaved(null), 4000);
            }
        } catch (e) {
            setError('The minutes could not be saved.');
        } finally {
            setSaving(false);
        }
    };

    const readOnly = !canEdit;

    return (
        <div className="text-sm">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
                Filled in by the people who were at the meeting. Nothing here is filled in for you.
            </p>

            <fieldset disabled={readOnly} className={readOnly ? 'opacity-70' : ''}>
                {/* 1 */}
                <Section number="1" title="Meeting Information">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Meeting Title" className="sm:col-span-2">
                            <input type="text" className={input} value={form.meeting_title}
                                onChange={(e) => set('meeting_title', e.target.value)} />
                        </Field>
                        <Field label="Date">
                            <input type="date" className={input} value={form.meeting_date}
                                onChange={(e) => set('meeting_date', e.target.value)} />
                        </Field>
                        <Field label="Venue / Platform">
                            <input type="text" className={input} value={form.venue}
                                placeholder="Office / Conference Room / Online"
                                onChange={(e) => set('venue', e.target.value)} />
                        </Field>
                        <Field label="Start Time">
                            <input type="text" className={input} value={form.start_time}
                                placeholder="e.g. 9:00 AM" onChange={(e) => set('start_time', e.target.value)} />
                        </Field>
                        <Field label="End Time">
                            <input type="text" className={input} value={form.end_time}
                                placeholder="e.g. 10:30 AM" onChange={(e) => set('end_time', e.target.value)} />
                        </Field>
                        <div>
                            <SearchableSelect
                                label="Facilitator / Chairperson"
                                id="minutes_facilitator"
                                value={form.facilitator_user_id}
                                onChange={(v) => set('facilitator_user_id', v)}
                                options={userOptions}
                                placeholder="Search people…"
                                showAvatar
                            />
                        </div>
                        <div>
                            <SearchableSelect
                                label="Minutes Prepared By"
                                id="minutes_prepared_by"
                                value={form.prepared_by_user_id}
                                onChange={(v) => set('prepared_by_user_id', v)}
                                options={userOptions}
                                placeholder="Search people…"
                                showAvatar
                            />
                        </div>
                        <Field label="Meeting Type">
                            <select className={input} value={form.meeting_type}
                                onChange={(e) => set('meeting_type', e.target.value)}>
                                <option value="">— Select —</option>
                                {MEETING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </Field>
                    </div>
                </Section>

                {/* 2 */}
                <Section number="2" title="Attendees">
                    <div className={`${headRow} sm:grid-cols-12`}>
                        <span className="sm:col-span-1">No.</span>
                        <span className="sm:col-span-4">Name</span>
                        <span className="sm:col-span-4">Position / Department</span>
                        <span className="sm:col-span-2">Attendance</span>
                        <span className="sm:col-span-1" />
                    </div>
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-2">
                        {form.attendees.map((row, i) => (
                            <div key={i} className={bodyRow}>
                                <span className="hidden sm:block sm:col-span-1 pt-2 text-sm text-gray-500">{i + 1}</span>
                                <div className="sm:col-span-4">
                                    <span className={mobileLabel}>Name</span>
                                    <SearchableSelect
                                        id={`attendee_${i}`}
                                        value={row.user_id}
                                        onChange={(v) => setRowPerson('attendees', i, v)}
                                        options={userOptions}
                                        placeholder="Search people…"
                                        showAvatar
                                    />
                                </div>
                                <div className="sm:col-span-4">
                                    <span className={mobileLabel}>Position / Department</span>
                                    <input type="text" className={input} value={row.position || ''}
                                        onChange={(e) => setRow('attendees', i, 'position', e.target.value)} />
                                </div>
                                <div className="sm:col-span-2">
                                    <span className={mobileLabel}>Attendance</span>
                                    <select className={input} value={row.attendance || 'present'}
                                        onChange={(e) => setRow('attendees', i, 'attendance', e.target.value)}>
                                        {ATTENDANCE.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                                    </select>
                                </div>
                                <div className="sm:col-span-1 flex sm:justify-end pt-2">
                                    <RemoveRow onClick={() => removeRow('attendees', i)} />
                                </div>
                            </div>
                        ))}
                        {form.attendees.length === 0 && (
                            <p className="px-1 py-2 text-xs text-gray-400">No attendees recorded yet.</p>
                        )}
                    </div>
                    <AddRow onClick={() => addRow('attendees', BLANK.attendee)}>+ Add attendee</AddRow>

                    <Field label="Absent / Excused (name – reason)" className="mt-3">
                        <textarea rows={2} className={input} value={form.absent_notes}
                            onChange={(e) => set('absent_notes', e.target.value)} />
                    </Field>
                </Section>

                {/* 3 */}
                <Section number="3" title="Meeting Objectives / Agenda">
                    {form.agenda.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-gray-500 w-5 shrink-0">{i + 1}.</span>
                            <input type="text" className={input} value={item || ''}
                                onChange={(e) => setForm((f) => ({
                                    ...f, agenda: f.agenda.map((a, j) => (j === i ? e.target.value : a)),
                                }))} />
                            <RemoveRow onClick={() => removeRow('agenda', i)} />
                        </div>
                    ))}
                    {form.agenda.length === 0 && <p className="text-xs text-gray-400">No agenda items yet.</p>}
                    <AddRow onClick={() => setForm((f) => ({ ...f, agenda: [...f.agenda, ''] }))}>+ Add agenda item</AddRow>
                </Section>

                {/* 4 */}
                <Section number="4" title="Discussion and Deliberations">
                    {form.discussions.map((row, i) => (
                        <div key={i} className="border border-gray-200 dark:border-gray-700 rounded p-3 mb-2">
                            <div className="flex items-start justify-between gap-2">
                                <span className="text-xs font-medium text-gray-500 mt-2">{i + 1}.</span>
                                <div className="flex-1 grid grid-cols-1 gap-2">
                                    <Field label="Agenda / Topic">
                                        <input type="text" className={input} value={row.topic || ''}
                                            onChange={(e) => setRow('discussions', i, 'topic', e.target.value)} />
                                    </Field>
                                    <Field label="Discussion / Key Points">
                                        <textarea rows={3} className={input} value={row.key_points || ''}
                                            onChange={(e) => setRow('discussions', i, 'key_points', e.target.value)} />
                                    </Field>
                                    <Field label="Decision / Agreement">
                                        <textarea rows={2} className={input} value={row.decision || ''}
                                            onChange={(e) => setRow('discussions', i, 'decision', e.target.value)} />
                                    </Field>
                                </div>
                                <RemoveRow onClick={() => removeRow('discussions', i)} />
                            </div>
                        </div>
                    ))}
                    {form.discussions.length === 0 && <p className="text-xs text-gray-400">Nothing recorded yet.</p>}
                    <AddRow onClick={() => addRow('discussions', BLANK.discussion)}>+ Add topic</AddRow>
                </Section>

                {/* 5 */}
                <Section number="5" title="Action Items">
                    <div className={`${headRow} sm:grid-cols-12`}>
                        <span className="sm:col-span-1">No.</span>
                        <span className="sm:col-span-4">Action Item / Deliverable</span>
                        <span className="sm:col-span-3">Person Responsible</span>
                        <span className="sm:col-span-2">Target Date</span>
                        <span className="sm:col-span-1">Status</span>
                        <span className="sm:col-span-1" />
                    </div>
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-2">
                        {form.action_items.map((row, i) => (
                            <div key={i} className={bodyRow}>
                                <span className="hidden sm:block sm:col-span-1 pt-2 text-sm text-gray-500">{i + 1}</span>
                                <div className="sm:col-span-4">
                                    <span className={mobileLabel}>Action Item / Deliverable</span>
                                    <textarea rows={2} className={input} value={row.action || ''}
                                        onChange={(e) => setRow('action_items', i, 'action', e.target.value)} />
                                </div>
                                <div className="sm:col-span-3">
                                    <span className={mobileLabel}>Person Responsible</span>
                                    <SearchableSelect
                                        id={`action_person_${i}`}
                                        value={row.user_id}
                                        onChange={(v) => setRowPerson('action_items', i, v)}
                                        options={userOptions}
                                        placeholder="Search people…"
                                        showAvatar
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <span className={mobileLabel}>Target Date</span>
                                    <input type="date" className={input} value={(row.target_date || '').slice(0, 10)}
                                        onChange={(e) => setRow('action_items', i, 'target_date', e.target.value)} />
                                </div>
                                <div className="sm:col-span-1">
                                    <span className={mobileLabel}>Status</span>
                                    <select className={input} value={row.status || 'open'}
                                        onChange={(e) => setRow('action_items', i, 'status', e.target.value)}>
                                        {ACTION_STATUSES.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
                                    </select>
                                </div>
                                <div className="sm:col-span-1 flex sm:justify-end pt-2">
                                    <RemoveRow onClick={() => removeRow('action_items', i)} />
                                </div>
                            </div>
                        ))}
                        {form.action_items.length === 0 && (
                            <p className="px-1 py-2 text-xs text-gray-400">No action items yet.</p>
                        )}
                    </div>
                    <AddRow onClick={() => addRow('action_items', BLANK.action)}>+ Add action item</AddRow>
                </Section>

                {/* 6 */}
                <Section number="6" title="Key Decisions / Resolutions">
                    {form.decisions.map((row, i) => (
                        <div key={i} className="flex items-start gap-2 mb-2">
                            <span className="text-xs text-gray-500 mt-2 w-5 shrink-0">{i + 1}.</span>
                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <input type="text" className={input} placeholder="Decision / Resolution"
                                    value={row.title || ''}
                                    onChange={(e) => setRow('decisions', i, 'title', e.target.value)} />
                                <textarea rows={2} className={`${input} sm:col-span-2`} placeholder="Brief description"
                                    value={row.description || ''}
                                    onChange={(e) => setRow('decisions', i, 'description', e.target.value)} />
                            </div>
                            <RemoveRow onClick={() => removeRow('decisions', i)} />
                        </div>
                    ))}
                    {form.decisions.length === 0 && <p className="text-xs text-gray-400">Nothing recorded yet.</p>}
                    <AddRow onClick={() => addRow('decisions', BLANK.decision)}>+ Add decision</AddRow>
                </Section>

                {/* 7 */}
                <Section number="7" title="Issues / Concerns / Risks">
                    <div className={`${headRow} sm:grid-cols-12`}>
                        <span className="sm:col-span-3">Issue / Concern</span>
                        <span className="sm:col-span-3">Impact</span>
                        <span className="sm:col-span-3">Recommended Action</span>
                        <span className="sm:col-span-2">Responsible Person</span>
                        <span className="sm:col-span-1" />
                    </div>
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-2">
                        {form.issues.map((row, i) => (
                            <div key={i} className={bodyRow}>
                                <div className="sm:col-span-3">
                                    <span className={mobileLabel}>Issue / Concern</span>
                                    <textarea rows={2} className={input} value={row.issue || ''}
                                        onChange={(e) => setRow('issues', i, 'issue', e.target.value)} />
                                </div>
                                <div className="sm:col-span-3">
                                    <span className={mobileLabel}>Impact</span>
                                    <textarea rows={2} className={input} value={row.impact || ''}
                                        onChange={(e) => setRow('issues', i, 'impact', e.target.value)} />
                                </div>
                                <div className="sm:col-span-3">
                                    <span className={mobileLabel}>Recommended Action</span>
                                    <textarea rows={2} className={input} value={row.recommended_action || ''}
                                        onChange={(e) => setRow('issues', i, 'recommended_action', e.target.value)} />
                                </div>
                                <div className="sm:col-span-2">
                                    <span className={mobileLabel}>Responsible Person</span>
                                    <SearchableSelect
                                        id={`issue_person_${i}`}
                                        value={row.user_id}
                                        onChange={(v) => setRowPerson('issues', i, v)}
                                        options={userOptions}
                                        placeholder="Search people…"
                                        showAvatar
                                    />
                                </div>
                                <div className="sm:col-span-1 flex sm:justify-end pt-2">
                                    <RemoveRow onClick={() => removeRow('issues', i)} />
                                </div>
                            </div>
                        ))}
                        {form.issues.length === 0 && (
                            <p className="px-1 py-2 text-xs text-gray-400">Nothing recorded yet.</p>
                        )}
                    </div>
                    <AddRow onClick={() => addRow('issues', BLANK.issue)}>+ Add issue</AddRow>
                </Section>

                {/* 8 */}
                <Section number="8" title="Other Matters">
                    <textarea rows={3} className={input} value={form.other_matters}
                        placeholder="Matters discussed that were not on the original agenda"
                        onChange={(e) => set('other_matters', e.target.value)} />
                </Section>

                {/* 9 */}
                <Section number="9" title="Next Meeting">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Date">
                            <input type="date" className={input} value={form.next_meeting_date}
                                onChange={(e) => set('next_meeting_date', e.target.value)} />
                        </Field>
                        <Field label="Time">
                            <input type="text" className={input} value={form.next_meeting_time}
                                onChange={(e) => set('next_meeting_time', e.target.value)} />
                        </Field>
                        <Field label="Venue / Platform">
                            <input type="text" className={input} value={form.next_meeting_venue}
                                onChange={(e) => set('next_meeting_venue', e.target.value)} />
                        </Field>
                        <Field label="Initial Agenda">
                            <textarea rows={2} className={input} value={form.next_meeting_agenda}
                                onChange={(e) => set('next_meeting_agenda', e.target.value)} />
                        </Field>
                    </div>
                </Section>

                {/* 10 */}
                <Section number="10" title="Adjournment">
                    <Field label="The meeting was adjourned at">
                        <input type="text" className={input} value={form.adjourned_at}
                            placeholder="e.g. 10:45 AM" onChange={(e) => set('adjourned_at', e.target.value)} />
                    </Field>
                </Section>

                {/* 11 */}
                <Section number="11" title="Confirmation / Acknowledgment">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="border border-gray-200 dark:border-gray-700 rounded p-3">
                            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Prepared by</p>
                            <SearchableSelect
                                label="Name"
                                id="confirm_prepared_by"
                                value={form.prepared_by_user_id}
                                onChange={(v) => set('prepared_by_user_id', v)}
                                options={userOptions}
                                placeholder="Search people…"
                                showAvatar
                            />
                            <Field label="Position" className="mt-2">
                                <input type="text" className={input} value={form.prepared_by_position}
                                    onChange={(e) => set('prepared_by_position', e.target.value)} />
                            </Field>
                            <Field label="Date" className="mt-2">
                                <input type="date" className={input} value={form.prepared_by_date}
                                    onChange={(e) => set('prepared_by_date', e.target.value)} />
                            </Field>
                        </div>
                        <div className="border border-gray-200 dark:border-gray-700 rounded p-3">
                            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Reviewed / Confirmed by</p>
                            <SearchableSelect
                                label="Name"
                                id="confirm_reviewed_by"
                                value={form.reviewed_by_user_id}
                                onChange={(v) => set('reviewed_by_user_id', v)}
                                options={userOptions}
                                placeholder="Search people…"
                                showAvatar
                            />
                            <Field label="Position" className="mt-2">
                                <input type="text" className={input} value={form.reviewed_by_position}
                                    onChange={(e) => set('reviewed_by_position', e.target.value)} />
                            </Field>
                            <Field label="Date" className="mt-2">
                                <input type="date" className={input} value={form.reviewed_by_date}
                                    onChange={(e) => set('reviewed_by_date', e.target.value)} />
                            </Field>
                        </div>
                    </div>
                </Section>
            </fieldset>

            {canEdit && (
                <div className="sticky bottom-0 flex items-center gap-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-3">
                    <button
                        type="button"
                        onClick={save}
                        disabled={saving}
                        className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                        {saving ? 'Saving…' : 'Save Minutes'}
                    </button>
                    {saved && <span className="text-xs text-green-600 dark:text-green-400">{saved}</span>}
                    {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
                    {author.by && !saved && !error && (
                        <span className="text-xs text-gray-400">
                            Last saved by {author.by}
                            {author.at && <> on {new Date(author.at).toLocaleString()}</>}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
