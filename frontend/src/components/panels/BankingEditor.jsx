// BankingEditor.jsx — Fase 3A: editor grafico del canale banking (s → gradi).
// SVG interattivo: drag dei keyframe (s e angolo insieme), doppio click per
// aggiungerne uno, tasto destro su un punto per rimuoverlo. Il canale è
// periodico e sempre input utente (D-002).

import { useRef, useState, useMemo, useEffect } from 'react';
import { useTrackStore } from '../../state/trackStore.js';
import { evalChannel } from '../../geometry/channel.js';

const PAD = { l: 38, r: 10, t: 8, b: 18 };
const ANGLE_RANGE = 16; // ±gradi visibili di default (si adatta ai keyframe)

export default function BankingEditor() {
  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null); // indice keyframe in drag
  const [box, setBox] = useState({ w: 600, h: 150 });

  // misura reale della larghezza dell'SVG
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

  const kfs = useTrackStore((s) => s.stage3FlowTube.bankingChannel);
  const addKf = useTrackStore((s) => s.addBankingKeyframe);
  const updateKf = useTrackStore((s) => s.updateBankingKeyframe);
  const removeKf = useTrackStore((s) => s.removeBankingKeyframe);
  const beginBatch = useTrackStore((s) => s.beginBatch);
  const endBatch = useTrackStore((s) => s.endBatch);

  const range = useMemo(() => {
    const maxAbs = Math.max(ANGLE_RANGE, ...kfs.map((k) => Math.abs(k.angleDeg) + 2));
    return maxAbs;
  }, [kfs]);

  const { w, h } = box;
  const plotW = w - PAD.l - PAD.r;
  const plotH = h - PAD.t - PAD.b;

  const xOf = (s) => PAD.l + s * plotW;
  const yOf = (a) => PAD.t + plotH / 2 - (a / range) * (plotH / 2);
  const sOf = (x) => Math.min(0.999, Math.max(0, (x - PAD.l) / plotW));
  const aOf = (y) => Math.max(-range, Math.min(range, ((PAD.t + plotH / 2 - y) / (plotH / 2)) * range));

  // curva del canale
  const curvePath = useMemo(() => {
    const N = 240;
    let d = '';
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const a = evalChannel(kfs, s, 'angleDeg');
      d += `${i === 0 ? 'M' : 'L'}${xOf(s).toFixed(1)},${yOf(a).toFixed(1)}`;
    }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kfs, w, h, range]);

  const svgPoint = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (i) => (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.target.setPointerCapture(e.pointerId);
    beginBatch();
    setDrag(i);
  };
  const onPointerMove = (e) => {
    if (drag == null) return;
    const p = svgPoint(e);
    updateKf(drag, { s: sOf(p.x), angleDeg: Math.round(aOf(p.y) * 2) / 2 });
  };
  const onPointerUp = () => {
    if (drag == null) return;
    endBatch();
    setDrag(null);
  };
  const onDoubleClick = (e) => {
    const p = svgPoint(e);
    if (p.x < PAD.l || p.x > w - PAD.r) return;
    addKf(sOf(p.x), Math.round(aOf(p.y) * 2) / 2);
  };
  const onKfContextMenu = (i) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    removeKf(i);
  };

  // griglia angoli: linee ogni 5°
  const gridAngles = [];
  for (let a = -Math.floor(range / 5) * 5; a <= range; a += 5) gridAngles.push(a);

  return (
    <div className="chart-panel">
      <div className="chart-title">
        Banking (°) — <span className="dim">doppio click: aggiungi · drag: sposta · destro: elimina</span>
      </div>
      <svg
        ref={svgRef}
        className="chart-svg"
        width="100%"
        height={h}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* griglia */}
        {gridAngles.map((a) => (
          <g key={a}>
            <line
              x1={PAD.l}
              x2={w - PAD.r}
              y1={yOf(a)}
              y2={yOf(a)}
              stroke={a === 0 ? '#4a5060' : '#2a2d33'}
              strokeWidth={a === 0 ? 1.5 : 1}
            />
            <text x={4} y={yOf(a) + 3} className="chart-tick">
              {a > 0 ? `+${a}` : a}
            </text>
          </g>
        ))}
        {/* linea start s=0 */}
        <line x1={xOf(0)} x2={xOf(0)} y1={PAD.t} y2={h - PAD.b} stroke="#4a5060" strokeDasharray="3,3" />
        <text x={xOf(0) + 3} y={h - 6} className="chart-tick">s=0</text>
        <text x={w - PAD.r - 26} y={h - 6} className="chart-tick">s=1</text>

        {/* curva */}
        <path d={curvePath} fill="none" stroke="#8ab4f8" strokeWidth="2" />

        {/* keyframe */}
        {kfs.map((k, i) => (
          <circle
            key={i}
            cx={xOf(k.s)}
            cy={yOf(k.angleDeg)}
            r={drag === i ? 7 : 5}
            fill="#e3b341"
            stroke="#0d1117"
            strokeWidth="1.5"
            style={{ cursor: 'grab' }}
            onPointerDown={onPointerDown(i)}
            onContextMenu={onKfContextMenu(i)}
          >
            <title>{`s=${k.s.toFixed(3)} · ${k.angleDeg}°`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
