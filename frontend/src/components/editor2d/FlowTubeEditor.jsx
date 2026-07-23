// FlowTubeEditor.jsx — Fase 3A: pianta del tubo di flusso semplificato.
// Mostra: fasce erba, asfalto, righe bianche (geometrie offset dalla
// mezzeria) e la mezzeria colorata per QUOTA (blu=basso → rosso=alto).
// Il BANKING si imposta QUI, curva per curva (D-024): click sul marker
// di una curva → popup con angolo e rampe di ritorno a zero.

import { useMemo, useState, useEffect } from 'react';
import { Stage, Layer, Line, Circle, Text, Group, Arrow, Shape } from 'react-konva';
import { useTrackStore } from '../../state/trackStore.js';
import { tubeOutlines } from '../../geometry/offset.js';
import {
  bankingIndicators,
  bankingConflicts,
  bankingRampQuality,
} from '../../geometry/banking.js';
import { useCanvasView } from './useCanvasView.js';
import GridLayer from './GridLayer.jsx';
import { COLORS } from './colors.js';

const TUBE_COLORS = {
  asphalt: '#3c4048',
  grass: '#1d4022',
  line: '#e8e8e8',
};

/** Quota normalizzata → colore (blu → ciano → verde → giallo → rosso). */
export function zToColor(t) {
  const stops = [
    [59, 130, 246], // blu
    [34, 211, 238], // ciano
    [74, 222, 128], // verde
    [250, 204, 21], // giallo
    [248, 81, 73], // rosso
  ];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export default function FlowTubeEditor({ resampled, elevation }) {
  const {
    containerRef,
    stageRef,
    size,
    view,
    cursorWorld,
    spacePan,
    onWheel,
    onStageMouseDown,
    onStageMouseMove,
    scaleBarPx,
    scaleBarLabel,
  } = useCanvasView();

  const polygon = useTrackStore((s) => s.stage1Polygon);
  const section = useTrackStore((s) => s.stage3FlowTube.section);
  const cornerBanking = useTrackStore((s) => s.stage3FlowTube.cornerBanking);
  const setCornerBanking = useTrackStore((s) => s.setCornerBanking);
  const removeCornerBanking = useTrackStore((s) => s.removeCornerBanking);

  // popup di editing bank: {origIndex, x, y} in px schermo
  const [bankEdit, setBankEdit] = useState(null);

  // chiudi popup con Esc o wheel (il click fuori è gestito dall'overlay)
  useEffect(() => {
    if (!bankEdit) return;
    const down = (e) => {
      if (e.key === 'Escape') setBankEdit(null);
    };
    const wheel = () => setBankEdit(null);
    window.addEventListener('keydown', down);
    window.addEventListener('wheel', wheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('wheel', wheel);
    };
  }, [bankEdit]);

  let effGrid = polygon.gridSize;
  while (effGrid * view.scale < 8) effGrid *= 5;

  const { samples } = resampled;
  const corners = useMemo(
    () => resampled.corners.filter((c) => !c.skip),
    [resampled.corners]
  );

  // indicatori di banking: linee a lato del tubo (pieno + transitori)
  const bankIndicators = useMemo(
    () => bankingIndicators(resampled.corners, cornerBanking, resampled.totalLength),
    [resampled.corners, cornerBanking, resampled.totalLength]
  );

  // rampe che si intersecano: stato invalido da segnalare (mai corretto da solo)
  const bankConflicts = useMemo(
    () => bankingConflicts(resampled.totalLength, resampled.corners, cornerBanking),
    [resampled.totalLength, resampled.corners, cornerBanking]
  );

  // rampe troppo corte per l'angolo (D-027): pendenza di bordo violenta
  const rampQuality = useMemo(
    () => bankingRampQuality(cornerBanking, section),
    [cornerBanking, section]
  );

  // polyline offset dalla mezzeria per un range di s (wrap periodico)
  const offsetRangePoints = (s0, s1, offsetDist) => {
    const N = samples.length;
    if (N < 3 || s1 <= s0) return [];
    const from = Math.ceil(s0 * N);
    const to = Math.floor(s1 * N);
    const pts = [];
    for (let k = from; k <= to; k++) {
      const i = ((k % N) + N) % N;
      const prev = samples[(i - 1 + N) % N];
      const next = samples[(i + 1) % N];
      let tx = next.x - prev.x;
      let ty = next.y - prev.y;
      const l = Math.hypot(tx, ty) || 1;
      tx /= l;
      ty /= l;
      pts.push(samples[i].x + -ty * offsetDist, samples[i].y + tx * offsetDist);
    }
    return pts;
  };

  // bordi del tubo (offset dalla mezzeria)
  const outlines = useMemo(
    () => (samples.length >= 3 ? tubeOutlines(samples, section) : null),
    [samples, section]
  );

  const ringFlat = (ring) => ring.flatMap((p) => [p.x, p.y]);

  // banda chiusa tra due anelli (esterno + interno invertito)
  const bandPoints = (outer, inner) => [
    ...outer.flatMap((p) => [p.x, p.y]),
    ...[...inner].reverse().flatMap((p) => [p.x, p.y]),
  ];

  // mezzeria termica: segmenti colorati per quota (Shape con context nativo)
  const zRange = useMemo(() => {
    if (!elevation || elevation.z.length === 0) return null;
    return { min: elevation.stats.minZ, max: elevation.stats.maxZ };
  }, [elevation]);

  const drawHeatCenterline = (ctx, shape) => {
    if (!zRange || samples.length < 2) return;
    const raw = ctx._context;
    const span = Math.max(zRange.max - zRange.min, 1e-6);
    raw.lineWidth = 2.5 / view.scale;
    raw.lineCap = 'round';
    const STRIDE = 3; // sample per segmento colorato
    for (let i = 0; i < samples.length; i += STRIDE) {
      const jEnd = Math.min(i + STRIDE, samples.length);
      raw.strokeStyle = zToColor((elevation.z[i] - zRange.min) / span);
      raw.beginPath();
      raw.moveTo(samples[i].x, samples[i].y);
      for (let j = i + 1; j <= jEnd; j++) {
        const q = samples[j % samples.length];
        raw.lineTo(q.x, q.y);
      }
      raw.stroke();
    }
    // shape non usato: disegno interamente manuale
    void shape;
  };

  // marker start + freccia
  let startArrow = null;
  if (samples.length > 2) {
    const s0 = samples[0];
    const s1 = samples[1];
    const L = Math.hypot(s1.x - s0.x, s1.y - s0.y) || 1;
    startArrow = { s0, d: { x: (s1.x - s0.x) / L, y: (s1.y - s0.y) / L } };
  }

  return (
    <div
      ref={containerRef}
      className="canvas-container"
      onContextMenu={(e) => e.preventDefault()}
      style={{ cursor: spacePan ? 'grab' : 'default' }}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={view.x}
        y={view.y}
        scaleX={view.scale}
        scaleY={-view.scale} // y-up
        onWheel={onWheel}
        onMouseDown={onStageMouseDown}
        onMouseMove={onStageMouseMove}
      >
        <GridLayer view={view} size={size} effGrid={effGrid} />

        <Layer listening={false}>
          {outlines && (
            <>
              {/* fasce erba */}
              <Line
                points={bandPoints(outlines.grassLeftOuter, outlines.trackLeft)}
                closed
                fill={TUBE_COLORS.grass}
              />
              <Line
                points={bandPoints(outlines.trackRight, outlines.grassRightOuter)}
                closed
                fill={TUBE_COLORS.grass}
              />
              {/* asfalto */}
              <Line
                points={bandPoints(outlines.trackLeft, outlines.trackRight)}
                closed
                fill={TUBE_COLORS.asphalt}
              />
              {/* righe bianche sui bordi pista (larghezza reale in metri) */}
              <Line
                points={ringFlat(outlines.trackLeft)}
                closed
                stroke={TUBE_COLORS.line}
                strokeWidth={section.lineWidth}
              />
              <Line
                points={ringFlat(outlines.trackRight)}
                closed
                stroke={TUBE_COLORS.line}
                strokeWidth={section.lineWidth}
              />
            </>
          )}

          {/* mezzeria termica per quota */}
          {zRange && <Shape sceneFunc={drawHeatCenterline} />}

          {/* indicatori banking a lato del tubo: pieno = linea continua,
              transitori entrata/uscita = tratteggiati */}
          {bankIndicators.map((ind) => {
            const grass = ind.outerSign > 0 ? section.grassLeft : section.grassRight;
            const off = ind.outerSign * (section.trackWidth / 2 + grass + 4);
            const color = ind.angleDeg > 0 ? '#e3b341' : '#22d3ee';
            const rampIn = offsetRangePoints(ind.sRampInStart, ind.sStart, off);
            const full = offsetRangePoints(ind.sStart, ind.sEnd, off);
            const rampOut = offsetRangePoints(ind.sEnd, ind.sRampOutEnd, off);
            const CONFLICT = '#f85149';
            return (
              <Group key={`ind${ind.origIndex}`}>
                {rampIn.length >= 4 && (
                  <Line
                    points={rampIn}
                    stroke={ind.conflictIn ? CONFLICT : color}
                    strokeWidth={(ind.conflictIn ? 4 : 3) / view.scale}
                    dash={[8 / view.scale, 6 / view.scale]}
                    opacity={ind.conflictIn ? 1 : 0.7}
                    lineCap="round"
                  />
                )}
                {full.length >= 4 && (
                  <Line
                    points={full}
                    stroke={color}
                    strokeWidth={4.5 / view.scale}
                    lineCap="round"
                  />
                )}
                {rampOut.length >= 4 && (
                  <Line
                    points={rampOut}
                    stroke={ind.conflictOut ? CONFLICT : color}
                    strokeWidth={(ind.conflictOut ? 4 : 3) / view.scale}
                    dash={[8 / view.scale, 6 / view.scale]}
                    opacity={ind.conflictOut ? 1 : 0.7}
                    lineCap="round"
                  />
                )}
              </Group>
            );
          })}

          {/* marker s=0 + freccia verso */}
          {startArrow && (
            <Group>
              <Circle
                x={startArrow.s0.x}
                y={startArrow.s0.y}
                radius={7 / view.scale}
                stroke="#ffffff"
                strokeWidth={2 / view.scale}
              />
              <Arrow
                points={[
                  startArrow.s0.x + startArrow.d.x * (14 / view.scale),
                  startArrow.s0.y + startArrow.d.y * (14 / view.scale),
                  startArrow.s0.x + startArrow.d.x * (40 / view.scale),
                  startArrow.s0.y + startArrow.d.y * (40 / view.scale),
                ]}
                stroke={COLORS.label}
                fill={COLORS.label}
                strokeWidth={3 / view.scale}
                pointerLength={10 / view.scale}
                pointerWidth={8 / view.scale}
              />
              <Text
                x={startArrow.s0.x}
                y={startArrow.s0.y}
                text="s = 0"
                fontSize={11 / view.scale}
                fontStyle="bold"
                fill="#ffffff"
                scaleY={-1}
                offsetX={-(10 / view.scale)}
                offsetY={-(14 / view.scale)}
              />
            </Group>
          )}
        </Layer>

        {/* layer INTERATTIVO: marker delle curve (click = imposta banking) */}
        <Layer>
          {corners.map((c) => {
            const bk = cornerBanking[c.origIndex];
            const hasBank = bk && bk.angleDeg !== 0;
            return (
              <Group key={`bk${c.origIndex}`}>
                <Circle
                  x={c.mid.x}
                  y={c.mid.y}
                  radius={7 / view.scale}
                  hitStrokeWidth={10 / view.scale}
                  fill={hasBank ? COLORS.label : '#565e6b'}
                  stroke="#0d1117"
                  strokeWidth={1.5 / view.scale}
                  onClick={(e) => {
                    if (e.evt.button !== 0) return;
                    e.cancelBubble = true;
                    const pos = stageRef.current.getPointerPosition();
                    if (pos) setBankEdit({ origIndex: c.origIndex, x: pos.x, y: pos.y });
                  }}
                  onMouseEnter={(e) => {
                    e.target.getStage().container().style.cursor = 'pointer';
                  }}
                  onMouseLeave={(e) => {
                    e.target.getStage().container().style.cursor = '';
                  }}
                />
                {hasBank && (
                  <Text
                    x={c.mid.x}
                    y={c.mid.y}
                    text={`${bk.angleDeg > 0 ? '+' : ''}${bk.angleDeg}°`}
                    fontSize={11 / view.scale}
                    fontStyle="bold"
                    fill={COLORS.label}
                    scaleY={-1}
                    offsetX={-(10 / view.scale)}
                    offsetY={-(12 / view.scale)}
                    listening={false}
                  />
                )}
              </Group>
            );
          })}
        </Layer>
      </Stage>

      <div className="canvas-hud">
        {cursorWorld && (
          <span>
            x: {cursorWorld.x.toFixed(1)} m &nbsp; y: {cursorWorld.y.toFixed(1)} m
            &nbsp;·&nbsp; zoom:{' '}
            {view.scale >= 1 ? view.scale.toFixed(0) : view.scale.toFixed(2)} px/m
          </span>
        )}
      </div>

      {/* legenda quota */}
      {zRange && (
        <div className="heat-legend">
          <span>{zRange.min.toFixed(0)} m</span>
          <div className="heat-gradient" />
          <span>{zRange.max.toFixed(0)} m</span>
        </div>
      )}

      <div className="scalebar" style={{ width: `${scaleBarPx}px` }}>
        <span>{scaleBarLabel}</span>
      </div>

      {/* popup impostazione banking della curva */}
      {bankEdit &&
        (() => {
          const bk = cornerBanking[bankEdit.origIndex] ?? {
            angleDeg: 0,
            rampBefore: 100,
            rampAfter: 100,
          };
          const patch = (p) => setCornerBanking(bankEdit.origIndex, p);
          return (
            <>
              {/* click fuori = chiudi */}
              <div className="popup-catcher" onMouseDown={() => setBankEdit(null)} />
              <div
                className="context-menu bank-popup"
                style={{ left: bankEdit.x, top: bankEdit.y }}
                onMouseDown={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
              >
                <div className="bank-popup-title">🏔 Banking della curva</div>
                {(() => {
                  const conf = bankConflicts.filter(
                    (c) =>
                      c.fromIndex === bankEdit.origIndex ||
                      c.toIndex === bankEdit.origIndex
                  );
                  if (conf.length === 0) return null;
                  return (
                    <div className="bank-popup-warn">
                      ⚠ Rampe in conflitto con la curva adiacente: riduci di
                      almeno {Math.ceil(Math.max(...conf.map((c) => c.excessM)))} m
                      (gap disponibile{' '}
                      {Math.floor(Math.min(...conf.map((c) => c.gapM)))} m)
                    </div>
                  );
                })()}
                {(() => {
                  const short = rampQuality.filter(
                    (w) => w.origIndex === bankEdit.origIndex
                  );
                  if (short.length === 0) return null;
                  const minM = Math.max(...short.map((w) => w.minRampM));
                  return (
                    <div className="bank-popup-warn">
                      ⚠ Rampa troppo corta per {bk.angleDeg}°: pendenza al bordo
                      del tubo{' '}
                      {short
                        .map(
                          (w) =>
                            `${w.side === 'in' ? 'in' : 'out'} ${
                              Number.isFinite(w.gradePct)
                                ? w.gradePct.toFixed(0) + '%'
                                : '∞'
                            }`
                        )
                        .join(' · ')}{' '}
                      — consigliati ≥ {minM} m (bordo ≤ 10%)
                    </div>
                  );
                })()}
                <label className="param-row">
                  Bank (°)
                  <input
                    type="number"
                    min="-30"
                    max="30"
                    step="1"
                    value={bk.angleDeg}
                    autoFocus
                    onChange={(e) => patch({ angleDeg: parseFloat(e.target.value) || 0 })}
                  />
                </label>
                <label className="param-row">
                  Rampa prima (m)
                  <input
                    type="number"
                    min="0"
                    step="25"
                    value={bk.rampBefore}
                    onChange={(e) => patch({ rampBefore: parseFloat(e.target.value) || 0 })}
                  />
                </label>
                <label className="param-row">
                  Rampa dopo (m)
                  <input
                    type="number"
                    min="0"
                    step="25"
                    value={bk.rampAfter}
                    onChange={(e) => patch({ rampAfter: parseFloat(e.target.value) || 0 })}
                  />
                </label>
                <div className="bank-popup-actions">
                  <button
                    onClick={() => {
                      removeCornerBanking(bankEdit.origIndex);
                      setBankEdit(null);
                    }}
                  >
                    ✕ Azzera
                  </button>
                  <button className="primary" onClick={() => setBankEdit(null)}>
                    Fatto
                  </button>
                </div>
              </div>
            </>
          );
        })()}
    </div>
  );
}
