/**
 * A small "?" that explains something on hover or focus.
 *
 * Lifted out of Users/Show, where it was the only thing in the app explaining
 * how a computed number was arrived at. Anywhere a figure is derived rather
 * than counted — a rate, a score, a weighted ranking — the reader has no way to
 * check it against their own expectation without this.
 *
 * A button rather than a bare icon so it is reachable by keyboard: a hover-only
 * explanation is no explanation at all to anyone not using a mouse.
 */
export default function InfoTip({ text, placement = 'top', className = '' }) {
    if (!text) return null;

    const above = placement === 'top';

    return (
        <span className={`group relative inline-flex align-middle ${className}`}>
            <button
                type="button"
                // The tooltip is the whole content, so the button carries it as
                // its accessible name and does nothing when pressed.
                aria-label={text}
                onClick={(e) => e.preventDefault()}
                className="inline-flex rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="9" />
                    <path strokeLinecap="round" d="M12 16v-4M12 8h.01" />
                </svg>
            </button>

            <span
                role="tooltip"
                className={`pointer-events-none absolute left-1/2 -translate-x-1/2 hidden group-hover:block group-focus-within:block w-64 z-30 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-xs font-normal leading-relaxed px-3 py-2 shadow-lg text-left normal-case ${
                    above ? 'bottom-full mb-2' : 'top-full mt-2'
                }`}
            >
                {text}
            </span>
        </span>
    );
}
