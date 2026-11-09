// Componente PieChart — donut refinado, SVG puro, sem deps
// Visual contido: anel fino, centro com total, legenda enxuta.
function PieChart({ data, colors }) {
    const entries = Object.entries(data || {}).filter(([, v]) => v > 0);
    const total = entries.reduce((a, [, b]) => a + b, 0) || 1;
    let acc = 0;
    const R = 42, C = 50;
    const segments = entries.map(([label, value]) => {
        const start = acc;
        const portion = value / total;
        acc += portion;
        const end = acc;
        const large = portion > 0.5 ? 1 : 0;
        const a1 = 2 * Math.PI * start - Math.PI / 2;
        const a2 = 2 * Math.PI * end - Math.PI / 2;
        const x1 = C + R * Math.cos(a1), y1 = C + R * Math.sin(a1);
        const x2 = C + R * Math.cos(a2), y2 = C + R * Math.sin(a2);
        const color = (colors && (colors[label] || colors[entries.indexOf([label, value])])) || '#64748b';
        const d = portion >= 0.999
            ? `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R} Z`
            : `M ${C} ${C} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
        return { label, value, d, color, percent: Math.round(portion * 100) };
    });

    if (entries.length === 0) {
        return <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">Sem dados no período.</p>;
    }

    return (
        <div className="flex flex-col min-[440px]:flex-row items-center gap-4 sm:gap-5">
            <svg viewBox="0 0 100 100" className="w-28 h-28 sm:w-32 sm:h-32 shrink-0" role="img">
                {segments.map(s => <path key={s.label} d={s.d} fill={s.color} strokeWidth="0" opacity="0.92" />)}
                <circle cx="50" cy="50" r="26" fill="white" className="dark:fill-slate-900" />
                <text x="50" y="48" textAnchor="middle" dominantBaseline="central" fontSize="13" fontWeight="800" className="fill-slate-900 dark:fill-white">{total}</text>
                <text x="50" y="58" textAnchor="middle" dominantBaseline="central" fontSize="6" className="fill-slate-400">total</text>
            </svg>
            <div className="w-full min-w-0 flex-1 space-y-2">
                {segments.map(s => (
                    <div key={s.label} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }}></span>
                            <span className="font-medium text-slate-600 dark:text-slate-300 truncate">{String(s.label).replace(/_/g, ' ').toLowerCase()}</span>
                        </div>
                        <span className="font-medium text-slate-700 dark:text-slate-200 shrink-0 tabular-nums">{s.value} <span className="font-normal text-slate-500">{s.percent}%</span></span>
                    </div>
                ))}
            </div>
        </div>
    );
}
