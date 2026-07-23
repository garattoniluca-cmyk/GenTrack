// SplineEditor.jsx — Fase 2: editing spline (Catmull-Rom centripeta chiusa).
// Il poligono di Fase 1 resta visibile in trasparenza come riferimento.
// Il ricampionamento arc-length è derivato puro dai CP (useMemo) e si
// aggiorna a ogni modifica, come richiesto dal brief §4.2.
//
// Interazioni:
//   drag su un control point → sposta (snap alla griglia visibile al rilascio)
//   click sulla curva        → inserisci un control point lì
//   tasto destro su un CP    → menu (Elimina control point)
//   rotellina / Space+drag   → zoom / pan

import { useEffect, useState, useMemo } from 'react';
import { Stage, Layer, Line, Circle, Text, Group, Arrow } from 'react-konva';
import { useTrackStore } from '../../state/trackStore.js';
import { resampleClosedSpline } from '../../geometry/spline.js';
import { useCanvasView } from './useCanvasView.js';
import GridLayer from './GridLayer.jsx';
import { COLORS } from './colors.js';

export default function SplineEditor() {
  const {
    containerRef,
    stageRef,
    size,
    view,
    cursorWorld,
    spacePan,
    pointerWorld,
    onWheel,
    onStageMouseDown,
    onStageMouseMove,
    scaleBarPx,
    scaleBarLabel,
  } = useCanvasView();

  const [ctxMenu, setCtxMenu] = useState(null);
  const [hoverCurve, setHoverCurve] = useState(false);

  const polygon = useTrackStore((s) => s.stage1Polygon);
  const spline = useTrackStore((s) => s.stage2Spline);
  const moveControlPoint = useTrackStore((s) => s.moveControlPoint);
  const insertControlPoint = useTrackStore((s) => s.insertControlPoint);
  const removeControlPoint = useTrackStore((s) => s.removeControlPoint);
  const beginBatch = useTrackStore((s) => s.beginBatch);
  const endBatch = useTrackStore((s) => s.endBatch);

  const { controlPoints } = spline;

  // ricampionamento arc-length: derivato puro, ricalcolato a ogni modifica CP
  const resampled = useMemo(
    () => resampleClosedSpline(controlPoints),
    [controlPoints]
  );

  // passo di griglia visibile (stesso meccanismo della Fase 1)
  let effGrid = polygon.gridSize;
  while (effGrid * view.scale < 8) effGrid *= 5;

  // Esc chiude il menu
  useEffect(() => {
    const down = (e) => {
      if (e.key === 'Escape' && ctxMenu) setCtxMenu(null);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [ctxMenu]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('wheel', close, { passive: true });
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('wheel', close);
    };
  }, [ctxMenu]);

  // --- drag control point ---
  const onCpDragStart = () => beginBatch();
  const onCpDragMove = (i) => (e) => {
    moveControlPoint(i, { x: e.target.x(), y: e.target.y() }, false);
  };
  const onCpDragEnd = (i) => (e) => {
    moveControlPoint(i, { x: e.target.x(), y: e.target.y() }, true, effGrid);
    endBatch();
  };

  // --- click sulla curva: inserisci CP nel tratto giusto ---
  const onCurveClick = (e) => {
    if (e.evt.button !== 0 || spacePan) return;
    e.cancelBubble = true;
    const w = pointerWorld();
    if (!w || resampled.samples.length === 0) return;
    // sample più vicino al click → indice del tratto CP (t = (seg+u)/nCP)
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < resampled.samples.length; i++) {
      const s = resampled.samples[i];
      const d = (s.x - w.x) ** 2 + (s.y - w.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const segIndex = Math.min(
      controlPoints.length - 1,
      Math.floor(resampled.samples[best].t * controlPoints.length)
    );
    insertControlPoint(segIndex, w, effGrid);
  };

  const onCpContextMenu = (i) => (e) => {
    e.evt.preventDefault();
    e.cancelBubble = true;
    const pos = stageRef.current.getPointerPosition();
    if (pos) setCtxMenu({ index: i, x: pos.x, y: pos.y });
  };

  // --- render data ---
  const cpR = 5 / view.scale;
  const polyFlat = polygon.points.flatMap((p) => [p.x, p.y]);
  const splineFlat = resampled.samples.flatMap((p) => [p.x, p.y]);

  // freccia del verso su s=0 (tangente dai primi sample)
  let startArrow = null;
  if (resampled.samples.length > 2) {
    const s0 = resampled.samples[0];
    const s1 = resampled.samples[1];
    const L = Math.hypot(s1.x - s0.x, s1.y - s0.y) || 1;
    const d = { x: (s1.x - s0.x) / L, y: (s1.y - s0.y) / L };
    startArrow = { s0, d };
  }

  return (
    <div
      ref={containerRef}
      className="canvas-container"
      onContextMenu={(e) => e.preventDefault()}
      style={{ cursor: spacePan ? 'grab' : hoverCurve ? 'copy' : 'default' }}
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

        <Layer>
          {/* poligono di Fase 1 in trasparenza (riferimento) */}
          {polygon.points.length >= 3 && (
            <Line
              points={polyFlat}
              closed
              stroke={COLORS.polygonGhost}
              strokeWidth={1.5 / view.scale}
              dash={[8 / view.scale, 6 / view.scale]}
              listening={false}
            />
          )}

          {/* spline ricampionata */}
          {resampled.samples.length > 1 && (
            <Line
              points={splineFlat}
              closed
              stroke={COLORS.spline}
              strokeWidth={2.5 / view.scale}
              hitStrokeWidth={14 / view.scale}
              onClick={onCurveClick}
              onMouseEnter={() => setHoverCurve(true)}
              onMouseLeave={() => setHoverCurve(false)}
            />
          )}

          {/* marker s=0 (start) + freccia del verso */}
          {startArrow && (
            <Group listening={false}>
              <Circle
                x={startArrow.s0.x}
                y={startArrow.s0.y}
                radius={cpR * 1.6}
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

          {/* control points */}
          <Group>
            {controlPoints.map((cp, i) => (
              <Circle
                key={cp.id}
                x={cp.x}
                y={cp.y}
                radius={i === 0 ? cpR * 1.3 : cpR}
                fill={i === 0 ? COLORS.vertexFirst : COLORS.spline}
                stroke="#0d1117"
                strokeWidth={1.5 / view.scale}
                draggable={!spacePan}
                dragDistance={4}
                onDragStart={onCpDragStart}
                onDragMove={onCpDragMove(i)}
                onDragEnd={onCpDragEnd(i)}
                onContextMenu={onCpContextMenu(i)}
                onMouseEnter={(e) => {
                  e.target.getStage().container().style.cursor = 'move';
                }}
                onMouseLeave={(e) => {
                  e.target.getStage().container().style.cursor = '';
                }}
              />
            ))}
          </Group>
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

      <div className="scalebar" style={{ width: `${scaleBarPx}px` }}>
        <span>{scaleBarLabel}</span>
      </div>

      {ctxMenu && (
        <div
          className="context-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            disabled={ctxMenu.index === 0 || controlPoints.length <= 3}
            title={
              ctxMenu.index === 0
                ? 'Il CP dello start (s=0) non è eliminabile'
                : controlPoints.length <= 3
                  ? 'La spline chiusa richiede almeno 3 control point'
                  : `Elimina il control point ${ctxMenu.index + 1}`
            }
            onClick={() => {
              removeControlPoint(ctxMenu.index);
              setCtxMenu(null);
            }}
          >
            🗑 Elimina control point
          </button>
        </div>
      )}
    </div>
  );
}
