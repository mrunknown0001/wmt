import Input from './Input';
import Select from './Select';

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
                    options={(field.options || []).map(opt => ({
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
                        {(field.options || []).map(opt => (
                            <label key={opt.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={selected.includes(String(opt.id))}
                                    onChange={() => toggleOption(opt.id)}
                                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
                                />
                                {opt.color && (
                                    <span
                                        className="w-3 h-3 rounded-full inline-block"
                                        style={{ backgroundColor: opt.color }}
                                    />
                                )}
                                {opt.label}
                            </label>
                        ))}
                    </div>
                    {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
                </div>
            );
        }

        default:
            return null;
    }
}
