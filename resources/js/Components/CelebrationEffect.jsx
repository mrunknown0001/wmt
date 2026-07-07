import { useEffect, useRef } from 'react';

const COLORS = [
    '#FF6B6B', '#FFE66D', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#FF8C94', '#A8E6CF', '#FFD93D',
    '#6C5CE7', '#FD79A8', '#00CEC9', '#E17055', '#81ECEC',
];

const TAU = Math.PI * 2;

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function createParticle(x, y) {
    const angle = Math.random() * TAU;
    const speed = randomBetween(2, 9);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const kind = Math.random();

    if (kind < 0.3) {
        // Star particle — larger, slower, with rotation
        return {
            x, y,
            vx: Math.cos(angle) * speed * 0.6,
            vy: Math.sin(angle) * speed * 0.6 - 2,
            size: randomBetween(4, 7),
            color,
            alpha: 1,
            rotation: Math.random() * TAU,
            rotationSpeed: randomBetween(-0.15, 0.15),
            gravity: 0.06,
            drag: 0.985,
            shape: 'star',
            trail: [],
        };
    } else if (kind < 0.6) {
        // Sparkle — small, fast, fading trail
        return {
            x, y,
            vx: Math.cos(angle) * speed * 1.2,
            vy: Math.sin(angle) * speed * 1.2 - 3,
            size: randomBetween(2, 4),
            color,
            alpha: 1,
            rotation: 0,
            rotationSpeed: 0,
            gravity: 0.04,
            drag: 0.975,
            shape: 'sparkle',
            trail: [],
        };
    } else {
        // Confetti — rectangular, fluttering
        return {
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2.5,
            size: randomBetween(3, 6),
            color,
            alpha: 1,
            rotation: Math.random() * TAU,
            rotationSpeed: randomBetween(-0.2, 0.2),
            gravity: 0.08,
            drag: 0.98,
            shape: 'confetti',
            trail: [],
            aspect: randomBetween(0.4, 0.8),
        };
    }
}

function drawStar(ctx, cx, cy, size, rotation, color, alpha) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;

    const spikes = 4;
    const outerR = size;
    const innerR = size * 0.4;

    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const a = (i * Math.PI) / spikes - Math.PI / 2;
        if (i === 0) ctx.moveTo(r * Math.cos(a), r * Math.sin(a));
        else ctx.lineTo(r * Math.cos(a), r * Math.sin(a));
    }
    ctx.closePath();
    ctx.fill();

    // Glow
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 2;
    ctx.fill();

    ctx.restore();
}

function drawSparkle(ctx, cx, cy, size, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 3;

    // Diamond cross shape
    ctx.beginPath();
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx + size * 0.3, cy);
    ctx.lineTo(cx, cy + size);
    ctx.lineTo(cx - size * 0.3, cy);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx - size, cy);
    ctx.lineTo(cx, cy + size * 0.3);
    ctx.lineTo(cx + size, cy);
    ctx.lineTo(cx, cy - size * 0.3);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

function drawConfetti(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;

    ctx.fillRect(-p.size / 2, -p.size * (p.aspect || 0.5) / 2, p.size, p.size * (p.aspect || 0.5));

    ctx.restore();
}

function drawRing(ctx, cx, cy, radius, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.3;
    ctx.strokeStyle = '#FFD93D';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#FFD93D';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.stroke();
    ctx.restore();
}

export default function CelebrationEffect({ x, y, onComplete }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const width = window.innerWidth;
        const height = window.innerHeight;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        // Create particles
        const particles = [];
        const count = 45;
        for (let i = 0; i < count; i++) {
            particles.push(createParticle(x, y));
        }

        // Ring expansion state
        let ringRadius = 0;
        let ringAlpha = 1;

        let frame = 0;
        const maxFrames = 90; // ~1.5s at 60fps
        let rafId;

        const animate = () => {
            frame++;
            ctx.clearRect(0, 0, width, height);

            // Expanding ring
            if (ringRadius < 60) {
                ringRadius += 3;
                ringAlpha = Math.max(0, 1 - ringRadius / 60);
                drawRing(ctx, x, y, ringRadius, ringAlpha);
            }

            // Update & draw particles
            let alive = 0;
            for (const p of particles) {
                p.vx *= p.drag;
                p.vy *= p.drag;
                p.vy += p.gravity;
                p.x += p.vx;
                p.y += p.vy;
                p.rotation += p.rotationSpeed;

                // Fade out in last 30% of life
                const lifeRatio = frame / maxFrames;
                if (lifeRatio > 0.7) {
                    p.alpha = Math.max(0, 1 - (lifeRatio - 0.7) / 0.3);
                }

                // Store trail points for sparkles
                if (p.shape === 'sparkle' && frame % 2 === 0) {
                    p.trail.push({ x: p.x, y: p.y, alpha: p.alpha });
                    if (p.trail.length > 5) p.trail.shift();
                }

                if (p.alpha <= 0) continue;
                alive++;

                // Draw trails
                if (p.shape === 'sparkle') {
                    for (let i = 0; i < p.trail.length; i++) {
                        const t = p.trail[i];
                        const ta = t.alpha * (i / p.trail.length) * 0.4;
                        ctx.save();
                        ctx.globalAlpha = ta;
                        ctx.fillStyle = p.color;
                        ctx.beginPath();
                        ctx.arc(t.x, t.y, p.size * 0.5, 0, TAU);
                        ctx.fill();
                        ctx.restore();
                    }
                }

                // Draw particle
                if (p.shape === 'star') {
                    drawStar(ctx, p.x, p.y, p.size, p.rotation, p.color, p.alpha);
                } else if (p.shape === 'sparkle') {
                    drawSparkle(ctx, p.x, p.y, p.size, p.color, p.alpha);
                } else {
                    drawConfetti(ctx, p);
                }
            }

            if (frame < maxFrames && alive > 0) {
                rafId = requestAnimationFrame(animate);
            } else {
                onComplete?.();
            }
        };

        rafId = requestAnimationFrame(animate);

        return () => {
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [x, y, onComplete]);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none"
            style={{ zIndex: 9999 }}
        />
    );
}
