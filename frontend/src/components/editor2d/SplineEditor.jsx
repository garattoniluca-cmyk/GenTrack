// SplineEditor.jsx — Fase 2: mezzeria = rettilinei + raccordi ad arco.
// I rettilinei del poligono restano esatti; ogni curva è un arco tangente di
// raggio regolabile. La maniglia gialla su ogni curva si trascina per
// cambiare il raggio (lungo la bisettrice); tasto destro = menu (reset).
//
// Interazioni:
//   drag sulla maniglia di curva → cambia il raggio di quel raccordo
//   tasto destro sulla maniglia  → menu (Reimposta raggio default)
//   rotellina / Space+drag       → zoom / pan

import { useEffect, useState, useMemo } from 'react';
import { Stage, Layer, Line, Circle, Text, Group, Arrow } from 'react-konva';
import { useTrackStore } from '../../state/trackStore.js';
import {
  resampleFilletPath,
  radiusFromHandleDistance,
} from '../../geometry/spline.js';
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
  const [dragRadius, setDragRadius] = useState(null); // {origIndex, R} durante il drag

  const polygon = useTrackStore((s) => s.stage1Polygon);
  const spline = useTrackStore((s) => s.stage2Spline);
  const setCornerRadius = useTrackStore((s) => s.setCornerRadius);
  const resetCornerRadius = useTrackStore((s) => s.resetCornerRadius);
  const beginBatch = useTrackStore((s) => s.beginBatch);
  const endBatch = useTrackStore((s) => s.endBatch);

  // path derivato puro: rettilinei + archi, ricalcolato a ogni modifica
  const resampled = useMemo(
    () =>
      resampleFilletPath(
        polygon.points,
        polygon.startSegment,
        polygon.direction,
        spline.radii,
        spline.defaultRadius
      ),
    [
      polygon.points,
      polygon.startSegment,
      polygon.direction,
      spline.radii,
      spline.defaultRadius,
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

  // --- drag della maniglia di curva: raggio dalla distanza lungo la bisettrice ---
  const onHandleDragStart = () => beginBatch();
  const onHandleDragMove = (corner) => () => {
    const w = pointerWorld();
    if (!w) return;
    const d =
      (w.x - corner.V.x) * corner.bis.x + (w.y - corner.V.y) * corner.bis.y;
    const R = Math.max(
      2,
      Math.min(corner.maxR, radiusFromHandleDistance(Math.max(0, d), corner.sinHalf))
    );
    setCornerRadius(corner.origIndex, R);
    setDragRadius({ origIndex: corner.origIndex, R: Math.round(R) });
  };
  const onHandleDragEnd = () => {
    endBatch();
    setDragRadius(null);
  };

  const onHandleContextMenu = (corner) => (e) => {
    e.evt.preventDefault();
    e.cancelBubble = true;
    const pos = stageRef.current.getPointerPosition();
    if (pos) setCtxMenu({ corner, x: pos.x, y: pos.y });
  };

  // --- render data ---
  const handleR = 6 / view.scale;
  const polyFlat = polygon.points.flatMap((p) => [p.x, p.y]);
  const pathFlat = resampled.samples.flatMap((p) => [p.x, p.y]);
  const corners = resampled.corners.filter((c) => !c.skip);

  // freccia del verso su s=0
  let startArrow = null;
  if (resampled.samples.length > 2) {
    const s0 = resampled.samples[0];
    const s1 = resampled.samples[1];
    const L = Math.hypot(s1.x - s0.x, s1.y - s0.y) || 1;
    startArrow = {
      s0,
      d: { x: (s1.x - s0.x) / L, y: (s1.y - s0.y) / L },
    };
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

          {/* mezzeria: rettilinei + raccordi */}
          {resampled.samples.length > 1 && (
            <Line
              points={pathFlat}
              closed
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
                radius={handleR * 1.4}
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

          {/* maniglie dei raccordi: drag = raggio */}
          {corners.map((c) => {
            const isOverride = c.origIndex in spline.radii;
            const showLabel =
              dragRadius?.origIndex === c.origIndex || c.R * view.scale > 25;
            return (
              <Group key={`c${c.origIndex}`}>
                <Circle
                  x={c.arcMid.x}
                  y={c.arcMid.y}
                  radius={handleR}
                  fill={isOverride ? COLORS.label : COLORS.spline}
                  stroke="#0d1117"
                  strokeWidth={1.5 / view.scale}
                  draggable={!spacePan}
                  dragDistance={4}
                  onDragStart={onHandleDragStart}
                  onDragMove={onHandleDragMove(c)}
                  onDragEnd={onHandleDragEnd}
                  onContextMenu={onHandleContextMenu(c)}
                  onMouseEnter={(e) => {
                    e.target.getStage().container().style.cursor = 'ew-resize';
                  }}
                  onMouseLeave={(e) => {
                    e.target.getStage().container().style.cursor = '';
                  }}
                />
                {showLabel && (
                  <Text
                    x={c.arcMid.x + c.bis.x * (16 / view.scale)}
                    y={c.arcMid.y + c.bis.y * (16 / view.scale)}
                    text={`R ${Math.round(c.R)}`}
                    fontSize={10 / view.scale}
                    fill={isOverride ? COLORS.label : COLORS.splineDim}
                    scaleY={-1}
                    offsetX={(4 * 10 * 0.27) / view.scale}
                    offsetY={5 / view.scale}
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
            {dragRadius && (
              <>
                &nbsp;·&nbsp; <b>R = {dragRadius.R} m</b>
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
            disabled={!(ctxMenu.corner.origIndex in spline.radii)}
            title={
              ctxMenu.corner.origIndex in spline.radii
                ? `Torna al raggio default (${spline.defaultRadius} m)`
                : 'Questa curva usa già il raggio default'
            }
            onClick={() => {
              resetCornerRadius(ctxMenu.corner.origIndex);
              setCtxMenu(null);
            }}
          >
            ↺ Reimposta raggio default
          </button>
        </div>
      )}
    </div>
  );
}
