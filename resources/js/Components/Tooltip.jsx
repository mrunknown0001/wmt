import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react';

const FALLBACKS = {
    top: ['top', 'bottom', 'right', 'left'],
    bottom: ['bottom', 'top', 'right', 'left'],
    left: ['left', 'right', 'top', 'bottom'],
    right: ['right', 'left', 'top', 'bottom'],
};

const GAP = 8;
const VIEWPORT_PADDING = 4;
const ARROW_SIZE = 4;
const ARROW_EDGE_MIN = 8;

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

function calcArrowStyle(side, wr, finalCoords, tr) {
    const triggerCenterX = wr.left + wr.width / 2;
    const triggerCenterY = wr.top + wr.height / 2;

    if (side === 'top' || side === 'bottom') {
        let arrowLeft = triggerCenterX - finalCoords.left;
        arrowLeft = Math.max(ARROW_EDGE_MIN, Math.min(arrowLeft, tr.width - ARROW_EDGE_MIN));
        return {
            position: 'absolute',
            left: arrowLeft,
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderWidth: ARROW_SIZE,
            ...(side === 'top'
                ? { top: '100%', borderColor: 'transparent', borderTopColor: 'var(--arrow-color)' }
                : { bottom: '100%', borderColor: 'transparent', borderBottomColor: 'var(--arrow-color)' }),
        };
    }
    // left or right
    let arrowTop = triggerCenterY - finalCoords.top;
    arrowTop = Math.max(ARROW_EDGE_MIN, Math.min(arrowTop, tr.height - ARROW_EDGE_MIN));
    return {
        position: 'absolute',
        top: arrowTop,
        transform: 'translateY(-50%)',
        width: 0,
        height: 0,
        borderWidth: ARROW_SIZE,
        ...(side === 'left'
            ? { left: '100%', borderColor: 'transparent', borderLeftColor: 'var(--arrow-color)' }
            : { right: '100%', borderColor: 'transparent', borderRightColor: 'var(--arrow-color)' }),
    };
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

        const arrowStyle = calcArrowStyle(resolvedSide, wr, coords, tr);

        setPlacement({ ...coords, side: resolvedSide, arrowStyle });
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
                    className={`fixed z-9999 px-2.5 py-1 rounded-md bg-gray-900 dark:bg-gray-700 text-white text-xs font-medium whitespace-nowrap shadow-lg pointer-events-none [--arrow-color:var(--color-gray-900)] dark:[--arrow-color:var(--color-gray-700)] ${placement ? 'animate-fade-in' : 'opacity-0'}`}
                    style={placement ? { top: placement.top, left: placement.left } : { top: -9999, left: -9999 }}
                >
                    {content}
                    {placement && <span style={placement.arrowStyle} />}
                </span>
            )}
        </span>
    );
}
