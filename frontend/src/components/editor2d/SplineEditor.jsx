// SplineEditor.jsx — Fase 2: stondature asimmetriche a due bracci (D-021).
// Ogni curva ha DUE maniglie quadrate, una per braccio:
//   - maniglia IN  (sul lato di arrivo, prima del vertice)
//   - maniglia OUT (sul lato di uscita, dopo il vertice)
// Trascinandole lungo il proprio spigolo si allunga/accorcia il braccio:
// bracci uguali = stondatura simmetrica, diversi = asimmetrica.
// La curva è una Bézier quadratica tangente ai due bracci (C1); l'etichetta
// R~ mostra il raggio minimo della curva.
//
// Interazioni:
//   drag su una maniglia braccio → cambia quel braccio
//   tasto destro su una maniglia → menu (Reimposta bracci default)
//   rotellina / Space+drag       → zoom / pan

import { useEffect, useState, useMemo } from 'react';
import { Stage, Layer, Line, Circle, Rect, Text, Group, Arrow, Shape } from 'react-konva';
import { useTrackStore } from '../../state/trackStore.js';
import { resampleFilletPath, MIN_ARM } from '../../geometry/spline.js';
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
  const [dragArm, setDragArm] = useState(null); // {origIndex, side, len}

  const polygon = useTrackStore((s) => s.stage1Polygon);
  const spline = useTrackStore((s) => s.stage2Spline);
  const setCornerArm = useTrackStore((s) => s.setCornerArm);
  const resetCornerArms = useTrackStore((s) => s.resetCornerArms);
  const beginBatch = useTrackStore((s) => s.beginBatch);
  const endBatch = useTrackStore((s) => s.endBatch);

  // path derivato puro: rettilinei + stondature, ricalcolato a ogni modifica
  const resampled = useMemo(
    () =>
      resampleFilletPath(
        polygon.points,
        polygon.startSegment,
        polygon.direction,
        spline.arms,
        spline.defaultArm
      ),
    [
      polygon.points,
      polygon.startSegment,
      polygon.direction,
      spline.arms,
      spline.defaultArm,
    ]
  );

  let effGrid = polygon.gridSize;
  while (effGrid * view.scale < 8) effGrid *= 5;

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

  // --- drag maniglia braccio: lunghezza = proiezione del cursore sullo spigolo ---
  const onArmDragStart = () => beginBatch();
  const onArmDragMove = (corner, side) => () => {
    const w = pointerWorld();
    if (!w) return;
    const d = side === 'in' ? corner.d1 : corner.d2;
    const maxT = side === 'in' ? corner.maxT1 : corner.maxT2;
    const len = Math.max(
      MIN_ARM,
      Math.min(maxT, (w.x - corner.V.x) * d.x + (w.y - corner.V.y) * d.y)
    );
    setCornerArm(corner.origIndex, side, len);
    setDragArm({ origIndex: corner.origIndex, side, len: Math.round(len) });
  };
  const onArmDragEnd = () => {
    endBatch();
    setDragArm(null);
  };

  const onArmContextMenu = (corner) => (e) => {
    e.evt.preventDefault();
    e.cancelBubble = true;
    const pos = stageRef.current.getPointerPosition();
    if (pos) setCtxMenu({ corner, x: pos.x, y: pos.y });
  };

  // --- render data ---
  const handleS = 9 / view.scale; // lato dei quadratini-maniglia
  const polyFlat = polygon.points.flatMap((p) => [p.x, p.y]);
  const corners = resampled.corners.filter((c) => !c.skip);

  // Mezzeria disegnata con la GEOMETRIA ESATTA (rette + quadraticCurveTo):
  // il browser tassella le Bézier alla risoluzione dello schermo → nessuna
  // spezzata a qualsiasi zoom. I sample equidistanti restano solo per i calcoli.
  const drawExactPath = (ctx, shape) => {
    const { startMid, corners: cs } = resampled;
    if (!startMid || cs.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(startMid.x, startMid.y);
    for (const c of cs) {
      if (c.skip) {
        ctx.lineTo(c.V.x, c.V.y);
        continue;
      }
      ctx.lineTo(c.T1.x, c.T1.y);
      ctx.quadraticCurveTo(c.V.x, c.V.y, c.T2.x, c.T2.y);
    }
    ctx.closePath();
    ctx.fillStrokeShape(shape);
  };

  let startArrow = null;
  if (resampled.samples.length > 2) {
    const s0 = resampled.samples[0];
    const s1 = resampled.samples[1];
    const L = Math.hypot(s1.x - s0.x, s1.y - s0.y) || 1;
    startArrow = { s0, d: { x: (s1.x - s0.x) / L, y: (s1.y - s0.y) / L } };
  }

  const armHandle = (corner, side) => {
    const T = side === 'in' ? corner.T1 : corner.T2;
    const isOverride =
      corner.origIndex in spline.arms && side in (spline.arms[corner.origIndex] ?? {});
    return (
      <Rect
        key={`${corner.origIndex}-${side}`}
        x={T.x - handleS / 2}
        y={T.y - handleS / 2}
        width={handleS}
        height={handleS}
        fill={isOverride ? COLORS.label : COLORS.spline}
        stroke="#0d1117"
        strokeWidth={1.5 / view.scale}
        draggable={!spacePan}
        dragDistance={4}
        onDragStart={onArmDragStart}
        onDragMove={onArmDragMove(corner, side)}
        onDragEnd={onArmDragEnd}
        onContextMenu={onArmContextMenu(corner)}
        onMouseEnter={(e) => {
          e.target.getStage().container().style.cursor = 'ew-resize';
        }}
        onMouseLeave={(e) => {
          e.target.getStage().container().style.cursor = '';
        }}
      />
    );
  };

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

          {/* mezzeria: geometria esatta (rette + Bézier native) */}
          {resampled.samples.length > 1 && (
            <Shape
              sceneFunc={drawExactPath}
              stroke={COLORS.spline}
              strokeWidth={2.5 / view.scale}
              listening={false}
            />
          )}

          {/* marker s=0 (start) + freccia del verso */}
          {startArrow && (
            <Group listening={false}>
              <Circle
                x={startArrow.s0.x}
                y={startArrow.s0.y}
                radius={8 / view.scale}
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

          {/* per ogni curva: linee-guida dei bracci, 2 maniglie, etichetta R~ */}
          {corners.map((c) => {
            const isDraggingThis = dragArm?.origIndex === c.origIndex;
            return (
              <Group key={`c${c.origIndex}`}>
                {/* guide sottili vertice→maniglie */}
                <Line
                  points={[c.V.x, c.V.y, c.T1.x, c.T1.y]}
                  stroke={COLORS.splineDim}
                  strokeWidth={1 / view.scale}
                  dash={[3 / view.scale, 3 / view.scale]}
                  listening={false}
                />
                <Line
                  points={[c.V.x, c.V.y, c.T2.x, c.T2.y]}
                  stroke={COLORS.splineDim}
                  strokeWidth={1 / view.scale}
                  dash={[3 / view.scale, 3 / view.scale]}
                  listening={false}
                />
                {armHandle(c, 'in')}
                {armHandle(c, 'out')}
                {(isDraggingThis || Math.max(c.t1, c.t2) * view.scale > 30) && (
                  <Text
                    x={c.mid.x}
                    y={c.mid.y}
                    text={
                      isDraggingThis
                        ? `${c.t1}/${c.t2} m · R~${Math.round(c.minR)}`
                        : `R~${Math.round(c.minR)}`
                    }
                    fontSize={10 / view.scale}
                    fill={
                      c.origIndex in spline.arms ? COLORS.label : COLORS.splineDim
                    }
                    scaleY={-1}
                    offsetX={(6 * 10 * 0.27) / view.scale}
                    offsetY={-(8 / view.scale)}
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
            {dragArm && (
              <>
                &nbsp;·&nbsp;{' '}
                <b>
                  braccio {dragArm.side === 'in' ? 'IN' : 'OUT'} = {dragArm.len} m
                </b>
              </>
            )}
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
            disabled={!(ctxMenu.corner.origIndex in spline.arms)}
            title={
              ctxMenu.corner.origIndex in spline.arms
                ? `Torna ai bracci default (${spline.defaultArm} m)`
                : 'Questa curva usa già i bracci default'
            }
            onClick={() => {
              resetCornerArms(ctxMenu.corner.origIndex);
              setCtxMenu(null);
            }}
          >
            ↺ Reimposta bracci default
          </button>
        </div>
      )}
    </div>
  );
}
