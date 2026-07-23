// FlowTubeEditor.jsx — Fase 3A: pianta del tubo di flusso semplificato.
// Mostra: fasce erba, asfalto, righe bianche (geometrie offset dalla
// mezzeria) e la mezzeria colorata per QUOTA (blu=basso → rosso=alto).
// L'editing di 3A avviene nei pannelli (sezione, rumore) e nel grafico
// banking sotto il canvas — qui solo visualizzazione + zoom/pan.

import { useMemo } from 'react';
import { Stage, Layer, Line, Circle, Text, Group, Arrow, Shape } from 'react-konva';
import { useTrackStore } from '../../state/trackStore.js';
import { resampleFilletPath } from '../../geometry/spline.js';
import { tubeOutlines } from '../../geometry/offset.js';
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

  let effGrid = polygon.gridSize;
  while (effGrid * view.scale < 8) effGrid *= 5;

  const { samples } = resampled;

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
    </div>
  );
}
