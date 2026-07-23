// ElevationProfile.jsx — Fase 3A: profilo altimetrico s → z (SVG, sola lettura).
// La linea è colorata a tratti per pendenza: verde = dolce, gialla ≥60% del
// limite, rossa ≈ al limite. Area riempita sotto la curva, quote min/max.

import { useRef, useState, useEffect, useMemo } from 'react';

const PAD = { l: 38, r: 10, t: 8, b: 18 };

export default function ElevationProfile({ elevation, totalLength, maxSlopePct }) {
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
    if (!elevation || elevation.z.length < 2) return null;
    const { z, stats } = elevation;
    const N = z.length;
    const span = Math.max(stats.maxZ - stats.minZ, 1);
    const xOf = (i) => PAD.l + (i / N) * plotW;
    const yOf = (v) => PAD.t + plotH - ((v - stats.minZ) / span) * plotH;

    // area riempita
    let area = `M${xOf(0)},${PAD.t + plotH}`;
    for (let i = 0; i < N; i++) area += `L${xOf(i).toFixed(1)},${yOf(z[i]).toFixed(1)}`;
    area += `L${xOf(N - 1)},${PAD.t + plotH}Z`;

    // tratti colorati per pendenza
    const ds = totalLength / N;
    const limit = maxSlopePct / 100;
    const strokes = [];
    const K = Math.max(1, Math.floor(N / 300));
    for (let i = 0; i < N - K; i += K) {
      const slope = Math.abs(z[i + K] - z[i]) / (ds * K);
      const ratio = limit > 0 ? slope / limit : 0;
      const color = ratio > 0.9 ? '#f85149' : ratio > 0.6 ? '#e3b341' : '#7ee787';
      let d = `M${xOf(i).toFixed(1)},${yOf(z[i]).toFixed(1)}`;
      for (let j = i + 1; j <= i + K; j++) d += `L${xOf(j).toFixed(1)},${yOf(z[j]).toFixed(1)}`;
      strokes.push({ d, color });
    }
    return { stats, area, strokes, yZero: yOf(0), xOf, yOf };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elevation, totalLength, maxSlopePct, w, h]);

  return (
    <div className="chart-panel">
      <div className="chart-title">
        Profilo altimetrico (m) —{' '}
        <span className="dim">
          verde: dolce · giallo ≥60% del limite · rosso ≈ limite ({maxSlopePct}%)
        </span>
      </div>
      <svg ref={svgRef} className="chart-svg" width="100%" height={h}>
        {data && (
          <>
            {/* quota 0 */}
            <line
              x1={PAD.l}
              x2={w - PAD.r}
              y1={data.yZero}
              y2={data.yZero}
              stroke="#4a5060"
              strokeDasharray="3,3"
            />
            <text x={4} y={data.yZero + 3} className="chart-tick">0</text>
            <text x={4} y={PAD.t + 8} className="chart-tick">
              {data.stats.maxZ.toFixed(0)}
            </text>
            <text x={4} y={PAD.t + plotH} className="chart-tick">
              {data.stats.minZ.toFixed(0)}
            </text>
            <text x={PAD.l + 3} y={h - 6} className="chart-tick">s=0</text>
            <text x={w - PAD.r - 26} y={h - 6} className="chart-tick">s=1</text>

            {/* area + curva colorata per pendenza */}
            <path d={data.area} fill="rgba(138, 180, 248, 0.08)" stroke="none" />
            {data.strokes.map((sgm, i) => (
              <path key={i} d={sgm.d} fill="none" stroke={sgm.color} strokeWidth="2" />
            ))}
          </>
        )}
      </svg>
    </div>
  );
}
