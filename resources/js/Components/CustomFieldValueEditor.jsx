import Input from './Input';
import Select from './Select';
import Textarea from './Textarea';

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
                                <span className="break-words whitespace-normal">
                                    {opt.label}
                                </span>
                            </label>
                        ))}
                    </div>
                    {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
                </div>
            );
        }

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
