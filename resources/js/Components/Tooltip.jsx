import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';

const FALLBACKS = {
    top: ['top', 'bottom', 'right', 'left'],
    bottom: ['bottom', 'top', 'right', 'left'],
    left: ['left', 'right', 'top', 'bottom'],
    right: ['right', 'left', 'top', 'bottom'],
};

const GAP = 6;
const EDGE = 6;
const ARROW = 5;
const ARROW_MIN = 10;

function place(tr, tp, side) {
    const cx = tr.left + tr.width / 2;
    const cy = tr.top + tr.height / 2;
    switch (side) {
        case 'top': return { top: tr.top - tp.height - GAP, left: cx - tp.width / 2 };
        case 'bottom': return { top: tr.bottom + GAP, left: cx - tp.width / 2 };
        case 'left': return { top: cy - tp.height / 2, left: tr.left - tp.width - GAP };
        case 'right': return { top: cy - tp.height / 2, left: tr.right + GAP };
    }
}

function inView(coords, tp) {
    return coords.top >= EDGE && coords.left >= EDGE &&
        coords.top + tp.height <= window.innerHeight - EDGE &&
        coords.left + tp.width <= window.innerWidth - EDGE;
}

function arrowStyle(side, tr, coords, tp) {
    const cx = tr.left + tr.width / 2;
    const cy = tr.top + tr.height / 2;
    const base = { position: 'absolute', width: 0, height: 0 };

    if (side === 'top' || side === 'bottom') {
        const x = Math.max(ARROW_MIN, Math.min(cx - coords.left, tp.width - ARROW_MIN));
        return {
            ...base, left: x, transform: 'translateX(-50%)',
            borderLeft: `${ARROW}px solid transparent`, borderRight: `${ARROW}px solid transparent`,
            ...(side === 'top'
                ? { bottom: -ARROW, borderTop: `${ARROW}px solid #1f2937` }
                : { top: -ARROW, borderBottom: `${ARROW}px solid #1f2937` }),
        };
    }
    const y = Math.max(ARROW_MIN, Math.min(cy - coords.top, tp.height - ARROW_MIN));
    return {
        ...base, top: y, transform: 'translateY(-50%)',
        borderTop: `${ARROW}px solid transparent`, borderBottom: `${ARROW}px solid transparent`,
        ...(side === 'left'
            ? { right: -ARROW, borderLeft: `${ARROW}px solid #1f2937` }
            : { left: -ARROW, borderRight: `${ARROW}px solid #1f2937` }),
    };
}

const ORIGINS = { top: 'center bottom', bottom: 'center top', left: 'right center', right: 'left center' };

export default function Tooltip({ children, content, position = 'top', delay = 300 }) {
    const [visible, setVisible] = useState(false);
    const [layout, setLayout] = useState(null);
    const triggerRef = useRef(null);
    const tipRef = useRef(null);
    const timer = useRef(null);

    const show = useCallback(() => {
        timer.current = setTimeout(() => setVisible(true), delay);
    }, [delay]);

    const hide = useCallback(() => {
        clearTimeout(timer.current);
        setVisible(false);
        setLayout(null);
    }, []);

    useEffect(() => () => clearTimeout(timer.current), []);

    useLayoutEffect(() => {
        if (!visible || !triggerRef.current || !tipRef.current) return;

        const tr = triggerRef.current.getBoundingClientRect();
        const tp = tipRef.current.getBoundingClientRect();

        let side = position;
        let coords = place(tr, tp, position);

        if (!inView(coords, tp)) {
            for (const s of FALLBACKS[position]) {
                const c = place(tr, tp, s);
                if (inView(c, tp)) { side = s; coords = c; break; }
            }
        }

        coords.left = Math.max(EDGE, Math.min(coords.left, window.innerWidth - tp.width - EDGE));
        coords.top = Math.max(EDGE, Math.min(coords.top, window.innerHeight - tp.height - EDGE));

        setLayout({ ...coords, side, arrow: arrowStyle(side, tr, coords, tp) });
    }, [visible, position]);

    if (!content) return children;

    return (
        <>
            <span ref={triggerRef} className="inline-flex" onMouseEnter={show} onMouseLeave={hide}>
                {children}
            </span>
            {visible && createPortal(
                <div
                    ref={tipRef}
                    role="tooltip"
                    className="fixed z-9999 pointer-events-none"
                    style={layout
                        ? { top: layout.top, left: layout.left, transformOrigin: ORIGINS[layout.side] }
                        : { top: -9999, left: -9999 }
                    }
                >
                    <div className={`px-2 py-1 rounded bg-gray-800 text-white text-xs font-medium leading-snug whitespace-nowrap shadow-lg ${layout ? 'animate-tooltip' : 'opacity-0'}`}>
                        {content}
                    </div>
                    {layout && <span style={layout.arrow} />}
                </div>,
                document.body
            )}
        </>
    );
}
