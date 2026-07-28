/**
 * Series numbering for an approval project's items, e.g. SP-OPS-00001.
 *
 * The prefix is write-once: once a number has been issued under it, changing it
 * would leave every issued number referring to a prefix that no longer exists.
 * The server enforces that too — this only reflects it in the UI.
 */
export default function SeriesNumberConfig({
    prefix,
    padding,
    onPrefixChange,
    onPaddingChange,
    locked = false,
    nextSequence = 1,
    errors = {},
}) {
    const pad = Math.max(1, Math.min(10, Number(padding) || 5));
    const sample = String(nextSequence).padStart(pad, '0');
    const preview = prefix ? `${prefix}${sample}` : null;

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Item Series Number</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-3">
                Give every request in this project a reference number. Leave the prefix
                blank if you don&rsquo;t want numbering.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label htmlFor="series_prefix" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Prefix
                    </label>
                    <input
                        id="series_prefix"
                        type="text"
                        value={prefix || ''}
                        onChange={(e) => onPrefixChange(e.target.value)}
                        disabled={locked}
                        maxLength={20}
                        placeholder="SP-OPS-"
                        className="block w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    {errors.series_prefix && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.series_prefix}</p>
                    )}
                </div>

                <div>
                    <label htmlFor="series_padding" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Number length
                    </label>
                    <input
                        id="series_padding"
                        type="number"
                        min={1}
                        max={10}
                        value={padding ?? 5}
                        onChange={(e) => onPaddingChange(e.target.value === '' ? '' : Number(e.target.value))}
                        className="block w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    />
                    {errors.series_padding && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.series_padding}</p>
                    )}
                </div>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                {preview ? (
                    <>
                        Next number will be{' '}
                        <span className="font-mono font-medium text-gray-700 dark:text-gray-200">{preview}</span>
                    </>
                ) : (
                    'No prefix set — items in this project will not be numbered.'
                )}
            </p>

            {locked ? (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                    The prefix is fixed once numbering has started, so existing numbers keep
                    their meaning. Number length can still be changed — it only affects
                    numbers issued from now on.
                </p>
            ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                    The prefix cannot be changed after the project is created.
                </p>
            )}
        </div>
    );
}
