import { router } from '@inertiajs/react';
import { useState } from 'react';

const presets = [
    { value: 'this_week', label: 'This Week' },
    { value: 'this_month', label: 'This Month' },
    { value: 'this_quarter', label: 'This Quarter' },
    { value: 'this_year', label: 'This Year' },
    { value: 'all_time', label: 'All Time' },
];

export default function DateFilter({ filters }) {
    const [showCustom, setShowCustom] = useState(filters.preset === 'custom');
    const [dateFrom, setDateFrom] = useState(filters.date_from || '');
    const [dateTo, setDateTo] = useState(filters.date_to || '');

    const applyPreset = (preset) => {
        setShowCustom(false);
        router.get(window.location.pathname, { preset }, { preserveState: true, preserveScroll: true });
    };

    const applyCustom = () => {
        if (dateFrom && dateTo) {
            router.get(window.location.pathname, { preset: 'custom', date_from: dateFrom, date_to: dateTo }, { preserveState: true, preserveScroll: true });
        }
    };

    return (
        <div className="flex items-center gap-2 flex-wrap">
            {presets.map((p) => (
                <button
                    key={p.value}
                    onClick={() => applyPreset(p.value)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        filters.preset === p.value && !showCustom
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                    }`}
                >
                    {p.label}
                </button>
            ))}
            <button
                onClick={() => setShowCustom(!showCustom)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    showCustom
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                }`}
            >
                Custom
            </button>
            {showCustom && (
                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="text-xs px-2 py-1.5 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                    />
                    <span className="text-xs text-gray-400">to</span>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="text-xs px-2 py-1.5 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                    />
                    <button
                        onClick={applyCustom}
                        className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    >
                        Apply
                    </button>
                </div>
            )}
        </div>
    );
}
