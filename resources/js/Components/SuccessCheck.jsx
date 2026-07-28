/**
 * Filled green circle with a check that strokes itself in.
 *
 * Used to confirm actions that changed something — saved, approved, submitted,
 * deleted. Deliberately not used for page navigation: a confirmation that fires
 * on every click stops meaning anything on the ones that matter.
 *
 * The draw-in is what makes it read as "just happened" rather than as a static
 * status icon; `prefers-reduced-motion` renders the finished state instead.
 */
export default function SuccessCheck({ size = 22, className = '' }) {
    return (
        <span
            className={`success-check inline-flex shrink-0 ${className}`}
            style={{ width: size, height: size }}
            aria-hidden="true"
        >
            <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
                <circle className="success-check__circle" cx="12" cy="12" r="11" fill="currentColor" />
                <path
                    className="success-check__tick"
                    d="M7 12.4l3.3 3.3L17 9"
                    stroke="#fff"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        </span>
    );
}
