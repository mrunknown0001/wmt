import Input from './Input';
import Select from './Select';
import Textarea from './Textarea';
import PeoplePicker from './PeoplePicker';

// ISO-8601 week number, matching Carbon's isoWeek()/isoWeekYear() on the server.
function isoWeek(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return null;
    // Shift to the Thursday of this week: the ISO year is whichever year that
    // Thursday falls in.
    const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (target.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
    target.setUTCDate(target.getUTCDate() - dayNum + 3);
    const isoYear = target.getUTCFullYear();
    const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
    const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
    const week = 1 + Math.round((target - firstThursday) / (7 * 24 * 60 * 60 * 1000));
    return { week, year: isoYear };
}

export default function CustomFieldValueEditor({ field, value, onChange, error }) {
    const handleChange = (newValue) => {
        onChange(field.id, newValue);
    };

    switch (field.type) {
        case 'text':
            return (
                <Input
                    label={field.name}
                    id={`cf-${field.id}`}
                    value={value || ''}
                    onChange={(e) => handleChange(e.target.value)}
                    error={error}
                    maxLength={255}
                />
            );

        case 'textarea':
            return (
                <Textarea
                    label={field.name}
                    id={`cf-${field.id}`}
                    value={value || ''}
                    onChange={(e) => handleChange(e.target.value)}
                    error={error}
                    rows={3}
                    maxLength={10000}
                />
            );

        case 'number':
            return (
                <Input
                    label={field.name}
                    id={`cf-${field.id}`}
                    type="number"
                    value={value ?? ''}
                    onChange={(e) => handleChange(e.target.value)}
                    error={error}
                    max={99999999999}
                    min={-99999999999}
                />
            );

        case 'date':
            return (
                <Input
                    label={field.name}
                    id={`cf-${field.id}`}
                    type="date"
                    value={value || ''}
                    onChange={(e) => handleChange(e.target.value)}
                    error={error}
                />
            );

        case 'single_select':
            return (
                <Select
                    label={field.name}
                    id={`cf-${field.id}`}
                    value={value || ''}
                    onChange={(e) => handleChange(e.target.value)}
                    options={[...(field.options || [])].sort((a, b) =>
                        field.config?.sort_mode === 'manual' ? (a.position ?? 0) - (b.position ?? 0) : a.label.localeCompare(b.label)
                    ).map(opt => ({
                        value: String(opt.id),
                        label: opt.label,
                    }))}
                    placeholder="— Select —"
                    error={error}
                />
            );

        case 'multi_select': {
            const selected = Array.isArray(value) ? value.map(String) : [];
            const toggleOption = (optId) => {
                const id = String(optId);
                const newSelected = selected.includes(id)
                    ? selected.filter(s => s !== id)
                    : [...selected, id];
                handleChange(newSelected.map(Number));
            };

            return (
                <div>
                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                        {field.name}
                    </label>
                    <div className="space-y-1">
                        {[...(field.options || [])].sort((a, b) =>
                            field.config?.sort_mode === 'manual' ? (a.position ?? 0) - (b.position ?? 0) : a.label.localeCompare(b.label)
                        ).map(opt => (
                            <label key={opt.id} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={selected.includes(String(opt.id))}
                                    onChange={() => toggleOption(opt.id)}
                                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 mt-0.5 flex-shrink-0"
                                />
                                {opt.color && (
                                    <span
                                        className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5"
                                        style={{ backgroundColor: opt.color }}
                                    />
                                )}
                                <span className="break-word">
                                    {opt.label}
                                </span>
                            </label>
                        ))}
                    </div>
                    {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
                </div>
            );
        }

        case 'week_of_year': {
            const wk = isoWeek(value);
            return (
                <div>
                    <Input
                        label={field.name}
                        id={`cf-${field.id}`}
                        type="date"
                        value={value || ''}
                        onChange={(e) => handleChange(e.target.value)}
                        error={error}
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {wk ? `Week ${wk.week}, ${wk.year}` : 'Pick a reference date to set the week.'}
                    </p>
                </div>
            );
        }

        case 'people':
            return (
                <div>
                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                        {field.name}
                    </label>
                    <PeoplePicker
                        value={Array.isArray(value) ? value : (value ? [value] : [])}
                        onChange={(ids) => handleChange(ids)}
                    />
                    {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
                </div>
            );

        case 'formula':
            return (
                <div>
                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                        {field.name}
                        <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">Formula</span>
                    </label>
                    <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 italic">
                        Computed automatically
                    </div>
                </div>
            );

        default:
            return null;
    }
}
