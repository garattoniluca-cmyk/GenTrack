// BankingProfile.jsx — Fase 3A: VISUALIZZAZIONE del banking lungo il
// tracciato (sola lettura, D-024). Il bank si IMPOSTA sulla mappa cliccando
// il marker di ogni curva; qui si vede il profilo risultante s → gradi
// (tratti costanti sulle curve + rampe smoothstep di ritorno a zero).

import { useRef, useState, useEffect, useMemo } from 'react';

const PAD = { l: 38, r: 10, t: 8, b: 18 };

export default function BankingProfile({ bankingProfile }) {
  const svgRef = useRef(null);
  const [box, setBox] = useState({ w: 600, h: 150 });

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0) setBox((b) => (Math.abs(r.width - b.w) > 1 ? { ...b, w: r.width } : b));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = box;
  const plotW = w - PAD.l - PAD.r;
  const plotH = h - PAD.t - PAD.b;

  const data = useMemo(() => {
    if (!bankingProfile || bankingProfile.length < 2) return null;
    const N = bankingProfile.length;
    const maxAbs = Math.max(6, ...bankingProfile.map(Math.abs)) + 1;
    const xOf = (i) => PAD.l + (i / N) * plotW;
    const yOf = (a) => PAD.t + plotH / 2 - (a / maxAbs) * (plotH / 2);
    let d = '';
    const K = Math.max(1, Math.floor(N / 400));
    for (let i = 0; i < N; i += K) {
      d += `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(bankingProfile[i]).toFixed(1)}`;
    }
    const gridAngles = [];
    for (let a = -Math.floor(maxAbs / 5) * 5; a <= maxAbs; a += 5) gridAngles.push(a);
    return { d, maxAbs, yOf, gridAngles };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankingProfile, w, h]);

  return (
    <div className="chart-panel">
      <div className="chart-title">
        Banking lungo il tracciato (°) —{' '}
        <span className="dim">sola visualizzazione · si imposta sulla mappa, click sul marker di curva</span>
      </div>
      <svg ref={svgRef} className="chart-svg" width="100%" height={h}>
        {data && (
          <>
            {data.gridAngles.map((a) => (
              <g key={a}>
                <line
                  x1={PAD.l}
                  x2={w - PAD.r}
                  y1={data.yOf(a)}
                  y2={data.yOf(a)}
                  stroke={a === 0 ? '#4a5060' : '#2a2d33'}
                  strokeWidth={a === 0 ? 1.5 : 1}
                />
                <text x={4} y={data.yOf(a) + 3} className="chart-tick">
                  {a > 0 ? `+${a}` : a}
                </text>
              </g>
            ))}
            <text x={PAD.l + 3} y={h - 6} className="chart-tick">s=0</text>
            <text x={w - PAD.r - 26} y={h - 6} className="chart-tick">s=1</text>
            <path d={data.d} fill="none" stroke="#8ab4f8" strokeWidth="2" />
          </>
        )}
      </svg>
    </div>
  );
}
