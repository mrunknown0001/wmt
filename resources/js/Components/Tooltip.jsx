import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react';

const ARROW_CLASSES = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-gray-900 dark:border-t-gray-700 border-x-transparent border-b-transparent border-4',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-900 dark:border-b-gray-700 border-x-transparent border-t-transparent border-4',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-gray-900 dark:border-l-gray-700 border-y-transparent border-r-transparent border-4',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-gray-900 dark:border-r-gray-700 border-y-transparent border-l-transparent border-4',
};

const FALLBACKS = {
    top: ['top', 'bottom', 'right', 'left'],
    bottom: ['bottom', 'top', 'right', 'left'],
    left: ['left', 'right', 'top', 'bottom'],
    right: ['right', 'left', 'top', 'bottom'],
};

const GAP = 8;
const VIEWPORT_PADDING = 4;

function calcCoords(wr, tr, side) {
    switch (side) {
        case 'top':
            return { top: wr.top - tr.height - GAP, left: wr.left + wr.width / 2 - tr.width / 2 };
        case 'bottom':
            return { top: wr.bottom + GAP, left: wr.left + wr.width / 2 - tr.width / 2 };
        case 'left':
            return { top: wr.top + wr.height / 2 - tr.height / 2, left: wr.left - tr.width - GAP };
        case 'right':
            return { top: wr.top + wr.height / 2 - tr.height / 2, left: wr.right + GAP };
    }
}

function fitsViewport(coords, tr) {
    return (
        coords.top >= VIEWPORT_PADDING &&
        coords.left >= VIEWPORT_PADDING &&
        coords.top + tr.height <= window.innerHeight - VIEWPORT_PADDING &&
        coords.left + tr.width <= window.innerWidth - VIEWPORT_PADDING
    );
}

export default function Tooltip({ children, content, position = 'top', className = '', delay = 150 }) {
    const [visible, setVisible] = useState(false);
    const [placement, setPlacement] = useState(null);
    const timerRef = useRef(null);
    const wrapperRef = useRef(null);
    const tooltipRef = useRef(null);

    const show = useCallback(() => {
        timerRef.current = setTimeout(() => setVisible(true), delay);
    }, [delay]);

    const hide = useCallback(() => {
        clearTimeout(timerRef.current);
        setVisible(false);
        setPlacement(null);
    }, []);

    // Clean up timer on unmount
    useEffect(() => () => clearTimeout(timerRef.current), []);

    // Calculate position synchronously before paint
    useLayoutEffect(() => {
        if (!visible || !wrapperRef.current || !tooltipRef.current) return;

        const wr = wrapperRef.current.getBoundingClientRect();
        const tr = tooltipRef.current.getBoundingClientRect();

        let resolvedSide = position;
        let coords = calcCoords(wr, tr, position);

        // Try fallback positions if preferred side overflows
        if (!fitsViewport(coords, tr)) {
            for (const side of FALLBACKS[position]) {
                const c = calcCoords(wr, tr, side);
                if (fitsViewport(c, tr)) {
                    resolvedSide = side;
                    coords = c;
                    break;
                }
            }
        }

        // Clamp to viewport edges as a last resort
        coords.left = Math.max(VIEWPORT_PADDING, Math.min(coords.left, window.innerWidth - tr.width - VIEWPORT_PADDING));
        coords.top = Math.max(VIEWPORT_PADDING, Math.min(coords.top, window.innerHeight - tr.height - VIEWPORT_PADDING));

        setPlacement({ ...coords, side: resolvedSide });
    }, [visible, position]);

    if (!content) return children;

    return (
        <span
            ref={wrapperRef}
            className={`relative inline-flex ${className}`}
            onMouseEnter={show}
            onMouseLeave={hide}
        >
            {children}
            {visible && (
                <span
                    ref={tooltipRef}
                    className={`fixed z-9999 px-2.5 py-1 rounded-md bg-gray-900 dark:bg-gray-700 text-white text-xs font-medium whitespace-nowrap shadow-lg pointer-events-none ${placement ? 'animate-fade-in' : 'opacity-0'}`}
                    style={placement ? { top: placement.top, left: placement.left } : { top: -9999, left: -9999 }}
                >
                    {content}
                    <span className={`absolute ${ARROW_CLASSES[placement?.side || position]} w-0 h-0`} />
                </span>
            )}
        </span>
    );
}
