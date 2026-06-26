export default function CompletionRateRing({ rate, size = 48 }) {
    const radius = (size - 8) / 2;
    const center = size / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (rate / 100) * circumference;
    const color = rate >= 75 ? '#22c55e' : rate >= 50 ? '#eab308' : rate >= 25 ? '#f97316' : '#ef4444';

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth={4} className="text-gray-200 dark:text-gray-700" />
            <circle
                cx={center} cy={center} r={radius}
                fill="none" stroke={color} strokeWidth={4}
                strokeDasharray={circumference} strokeDashoffset={offset}
                strokeLinecap="round"
                transform={`rotate(-90 ${center} ${center})`}
            />
            <text x={center} y={center + 4} textAnchor="middle" className="fill-gray-900 dark:fill-gray-100" fontSize={size > 40 ? 12 : 10} fontWeight="600">
                {rate}%
            </text>
        </svg>
    );
}
