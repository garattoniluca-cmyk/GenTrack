// GridCanvas.jsx — Fase 1: disegno + editing poligono su griglia (Konva).
// Coordinate mondo: metri, y-up. Lo Stage usa scaleY negativa per convertire
// dal sistema schermo (y-down): tutta la geometria è espressa in mondo.
// I Text (etichette) ri-flippano con scaleY=-1 locale per restare leggibili.
//
// Interazioni:
//   click sinistro   → aggiungi punto (snap alla griglia visibile) [aperto]
//   click sul primo punto (≥3 punti) → chiudi il poligono
//   drag su un vertice → sposta il punto (snap al rilascio)
//   click su un segmento [chiuso] → inserisci un punto lì
//   tasto destro su vertice/segmento → menu contestuale
//   Esc              → chiudi menu / rimuovi ultimo punto
//   rotellina        → zoom sul puntatore
//   drag rotellina o Space+drag → pan

import { useEffect, useState, useMemo } from 'react';
import { Stage, Layer, Line, Circle, Text, Group, Arrow } from 'react-konva';
import { useTrackStore } from '../../state/trackStore.js';
import {
  snapToGrid,
  candidateSegmentConflicts,
  closingSegmentConflicts,
  findSelfIntersections,
  ringSelfIntersections,
  segmentLengths,
  canClose,
  dist,
  violatesClearance,
  signedArea,
} from '../../geometry/polygon.js';
import { useCanvasView } from './useCanvasView.js';
import GridLayer from './GridLayer.jsx';
import { COLORS } from './colors.js';

const CLOSE_TOLERANCE_PX = 12; // tolleranza chiusura in spazio SCHERMO
const LABEL_MIN_PX = 30; // mostra l'etichetta solo se il segmento a schermo è più lungo

export default function GridCanvas() {
  const {
    containerRef,
    stageRef,
    size,
    view,
    cursorWorld,
    spacePan,
    worldToScreen,
    pointerWorld,
    onWheel,
    onStageMouseDown,
    onStageMouseMove,
    scaleBarPx,
    scaleBarLabel,
  } = useCanvasView();

  const [hoverSeg, setHoverSeg] = useState(null);
  // menu contestuale (tasto destro): {kind, index, x, y} in px schermo
  const [ctxMenu, setCtxMenu] = useState(null);

  const polygon = useTrackStore((s) => s.stage1Polygon);
  const addPoint = useTrackStore((s) => s.addPoint);
  const removeLastPoint = useTrackStore((s) => s.removeLastPoint);
  const closePolygon = useTrackStore((s) => s.closePolygon);
  const updatePoint = useTrackStore((s) => s.updatePoint);
  const removePoint = useTrackStore((s) => s.removePoint);
  const insertPointOnSegment = useTrackStore((s) => s.insertPointOnSegment);
  const setStartSegment = useTrackStore((s) => s.setStartSegment);
  const beginBatch = useTrackStore((s) => s.beginBatch);
  const endBatch = useTrackStore((s) => s.endBatch);
  const minClearance = useTrackStore((s) => s.minClearance);
  const minStartLength = useTrackStore((s) => s.minStartLength);

  const { points, gridSize, closed } = polygon;

  // --- derivati puri, memoizzati ---
  const conflicts = useMemo(
    () => (closed ? ringSelfIntersections(points) : findSelfIntersections(points)),
    [points, closed]
  );
  const closingConflicts = useMemo(
    () => (closed ? [] : closingSegmentConflicts(points)),
    [points, closed]
  );
  const canCloseNow = useMemo(() => !closed && canClose(points), [points, closed]);
  const segments = useMemo(() => segmentLengths(points, closed), [points, closed]);

  // passo di griglia VISIBILE: lo snap usa sempre questo passo
  let effGrid = gridSize;
  while (effGrid * view.scale < 8) effGrid *= 5;

  // --- tastiera: Esc chiude il menu o rimuove l'ultimo punto ---
  useEffect(() => {
    const down = (e) => {
      if (e.key === 'Escape') {
        if (ctxMenu) setCtxMenu(null);
        else removeLastPoint();
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [removeLastPoint, ctxMenu]);

  // --- il menu contestuale si chiude su click altrove o wheel ---
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

  // --- click sullo Stage: chiusura o aggiunta punto in coda (solo aperto) ---
  const onClick = (e) => {
    if (e.evt.button !== 0 || spacePan || closed) return;
    const w = pointerWorld();
    if (!w) return;
    const snapped = snapToGrid(w, effGrid);

    // chiusura: click vicino al primo punto (in px schermo) o sul suo snap esatto
    if (points.length >= 3) {
      const firstScreen = worldToScreen(points[0]);
      const pos = stageRef.current.getPointerPosition();
      const dPx = Math.hypot(pos.x - firstScreen.x, pos.y - firstScreen.y);
      const sameSnap = snapped.x === points[0].x && snapped.y === points[0].y;
      if (dPx <= CLOSE_TOLERANCE_PX || sameSnap) {
        closePolygon(); // no-op se non valido; il feedback rosso è già visibile
        return;
      }
    }
    // niente punti duplicati su vertici esistenti
    if (points.some((p) => p.x === snapped.x && p.y === snapped.y)) return;
    addPoint(w, effGrid);
  };

  // --- drag di un vertice ---
  const onVertexDragStart = () => beginBatch();
  const onVertexDragMove = (i) => (e) => {
    updatePoint(i, { x: e.target.x(), y: e.target.y() }, false); // fluido
  };
  const onVertexDragEnd = (i) => (e) => {
    updatePoint(i, { x: e.target.x(), y: e.target.y() }, true, effGrid); // snap finale
    endBatch();
  };

  // --- click su un segmento (solo poligono chiuso): inserisci punto ---
  const onSegmentClick = (segIndex) => (e) => {
    if (!closed || e.evt.button !== 0 || spacePan) return;
    e.cancelBubble = true;
    const w = pointerWorld();
    if (w) insertPointOnSegment(segIndex, w, effGrid);
  };

  // --- menu contestuale ---
  const onVertexContextMenu = (i) => (e) => {
    e.evt.preventDefault();
    e.cancelBubble = true;
    const pos = stageRef.current.getPointerPosition();
    if (pos) setCtxMenu({ kind: 'vertex', index: i, x: pos.x, y: pos.y });
  };
  const onSegmentContextMenu = (segIndex) => (e) => {
    e.evt.preventDefault();
    if (!closed) return;
    e.cancelBubble = true;
    const pos = stageRef.current.getPointerPosition();
    if (pos) setCtxMenu({ kind: 'segment', index: segIndex, x: pos.x, y: pos.y });
  };

  // il punto è eliminabile? (un poligono chiuso non scende sotto 3 punti)
  const canDeletePoint = !(closed && points.length <= 3);

  // --- dati derivati per il render ---
  const snappedCursor = cursorWorld && !closed ? snapToGrid(cursorWorld, effGrid) : null;

  const cursorClearanceViolated =
    snappedCursor && points.length >= 1
      ? violatesClearance(points, snappedCursor, minClearance)
      : false;

  const rubberConflicts =
    snappedCursor && points.length >= 2
      ? candidateSegmentConflicts(points, snappedCursor)
      : [];

  const conflictSegs = new Set();
  conflicts.forEach(([i, j]) => {
    conflictSegs.add(i);
    conflictSegs.add(j);
  });
  closingConflicts.forEach((i) => conflictSegs.add(i));
  rubberConflicts.forEach((i) => conflictSegs.add(i));

  const nearFirst =
    !closed &&
    points.length >= 3 &&
    cursorWorld &&
    dist(cursorWorld, points[0]) * view.scale <= CLOSE_TOLERANCE_PX;

  const flat = points.flatMap((p) => [p.x, p.y]);
  const vertexR = 5 / view.scale;
  const fontSize = 11 / view.scale;

  // --- marker START + verso di percorrenza ---
  const startSeg =
    closed && polygon.startSegment != null
      ? segments.find((s) => s.index === polygon.startSegment) ?? null
      : null;
  let travelDir = null;
  if (startSeg && polygon.direction && startSeg.length > 0) {
    const windingCcw = signedArea(points) > 0;
    const forward = (polygon.direction === 'ccw') === windingCcw;
    const from = forward ? startSeg.a : startSeg.b;
    const to = forward ? startSeg.b : startSeg.a;
    travelDir = {
      x: (to.x - from.x) / startSeg.length,
      y: (to.y - from.y) / startSeg.length,
    };
  }

  return (
    <div
      ref={containerRef}
      className="canvas-container"
      onContextMenu={(e) => e.preventDefault()}
      style={{
        cursor: spacePan
          ? 'grab'
          : closed
            ? hoverSeg !== null
              ? 'copy'
              : 'default'
            : 'crosshair',
      }}
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
        onClick={onClick}
      >
        <GridLayer view={view} size={size} effGrid={effGrid} />

        <Layer>
          {closed && (
            <Line
              points={flat}
              closed
              fill={COLORS.fillClosed}
              strokeEnabled={false}
              listening={false}
            />
          )}

          {/* segmenti (inclusa la chiusura se closed) */}
          {segments.map((seg) => {
            const bad = conflictSegs.has(seg.index);
            return (
              <Line
                key={`s${seg.index}`}
                points={[seg.a.x, seg.a.y, seg.b.x, seg.b.y]}
                stroke={
                  bad ? COLORS.conflict : closed ? COLORS.segmentClosed : COLORS.segment
                }
                strokeWidth={((bad ? 3 : 2) + (hoverSeg === seg.index ? 1 : 0)) / view.scale}
                hitStrokeWidth={closed ? 12 / view.scale : 0}
                onClick={onSegmentClick(seg.index)}
                onContextMenu={onSegmentContextMenu(seg.index)}
                onMouseEnter={() => closed && setHoverSeg(seg.index)}
                onMouseLeave={() => setHoverSeg(null)}
              />
            );
          })}

          {/* marker START: linea a scacchi + freccia del verso + etichetta */}
          {startSeg && (
            <Group listening={false}>
              <Line
                points={[startSeg.a.x, startSeg.a.y, startSeg.b.x, startSeg.b.y]}
                stroke="#ffffff"
                strokeWidth={6 / view.scale}
              />
              <Line
                points={[startSeg.a.x, startSeg.a.y, startSeg.b.x, startSeg.b.y]}
                stroke="#111111"
                strokeWidth={6 / view.scale}
                dash={[5 / view.scale, 5 / view.scale]}
              />
              {travelDir && (
                <Arrow
                  points={[
                    (startSeg.a.x + startSeg.b.x) / 2 - travelDir.x * (18 / view.scale),
                    (startSeg.a.y + startSeg.b.y) / 2 - travelDir.y * (18 / view.scale),
                    (startSeg.a.x + startSeg.b.x) / 2 + travelDir.x * (26 / view.scale),
                    (startSeg.a.y + startSeg.b.y) / 2 + travelDir.y * (26 / view.scale),
                  ]}
                  stroke={COLORS.label}
                  fill={COLORS.label}
                  strokeWidth={3 / view.scale}
                  pointerLength={10 / view.scale}
                  pointerWidth={8 / view.scale}
                />
              )}
              {(() => {
                const mid = {
                  x: (startSeg.a.x + startSeg.b.x) / 2,
                  y: (startSeg.a.y + startSeg.b.y) / 2,
                };
                const dx = startSeg.b.x - startSeg.a.x;
                const dy = startSeg.b.y - startSeg.a.y;
                const len = startSeg.length || 1;
                const off = 22 / view.scale;
                return (
                  <Text
                    x={mid.x - (-dy / len) * off}
                    y={mid.y - (dx / len) * off}
                    text="START"
                    fontSize={12 / view.scale}
                    fontStyle="bold"
                    fill="#ffffff"
                    scaleY={-1}
                    offsetX={(5 * 12 * 0.3) / view.scale}
                    offsetY={6 / view.scale}
                  />
                );
              })()}
            </Group>
          )}

          {/* etichette lunghezza segmenti */}
          {segments.map((seg) => {
            if (seg.length * view.scale < LABEL_MIN_PX) return null;
            const label = `${seg.length.toFixed(1)} m`;
            const mid = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
            const dx = seg.b.x - seg.a.x;
            const dy = seg.b.y - seg.a.y;
            const len = seg.length || 1;
            const off = 8 / view.scale;
            return (
              <Text
                key={`l${seg.index}`}
                x={mid.x + (-dy / len) * off}
                y={mid.y + (dx / len) * off}
                text={label}
                fontSize={fontSize}
                fill={COLORS.label}
                scaleY={-1}
                offsetX={label.length * fontSize * 0.27}
                offsetY={fontSize / 2}
                listening={false}
              />
            );
          })}

          {/* rubber band: ultimo punto → cursore snappato */}
          {!closed && snappedCursor && points.length >= 1 && !nearFirst && (
            <Line
              points={[
                points[points.length - 1].x,
                points[points.length - 1].y,
                snappedCursor.x,
                snappedCursor.y,
              ]}
              stroke={
                rubberConflicts.length || cursorClearanceViolated
                  ? COLORS.rubberConflict
                  : COLORS.rubber
              }
              strokeWidth={2 / view.scale}
              dash={[6 / view.scale, 4 / view.scale]}
              listening={false}
            />
          )}

          {/* anteprima lunghezza del segmento elastico */}
          {!closed && snappedCursor && points.length >= 1 && !nearFirst && (() => {
            const last = points[points.length - 1];
            const L = dist(last, snappedCursor);
            if (L * view.scale < LABEL_MIN_PX) return null;
            const label = `${L.toFixed(1)} m`;
            return (
              <Text
                x={(last.x + snappedCursor.x) / 2}
                y={(last.y + snappedCursor.y) / 2}
                text={label}
                fontSize={fontSize}
                fill={COLORS.rubber}
                scaleY={-1}
                offsetX={label.length * fontSize * 0.27}
                offsetY={fontSize / 2 + 10 / view.scale}
                listening={false}
              />
            );
          })()}

          {/* anteprima segmento di chiusura */}
          {!closed && nearFirst && points.length >= 3 && (
            <Line
              points={[
                points[points.length - 1].x,
                points[points.length - 1].y,
                points[0].x,
                points[0].y,
              ]}
              stroke={canCloseNow ? COLORS.vertexFirstReady : COLORS.conflict}
              strokeWidth={2.5 / view.scale}
              dash={[6 / view.scale, 4 / view.scale]}
              listening={false}
            />
          )}

          {/* vertici: trascinabili */}
          <Group>
            {points.map((p, i) => (
              <Circle
                key={`p${i}`}
                x={p.x}
                y={p.y}
                radius={i === 0 && nearFirst ? vertexR * 1.8 : vertexR}
                fill={
                  i === 0
                    ? nearFirst && canCloseNow
                      ? COLORS.vertexFirstReady
                      : COLORS.vertexFirst
                    : COLORS.vertex
                }
                stroke="#0d1117"
                strokeWidth={1.5 / view.scale}
                draggable={!spacePan}
                dragDistance={4}
                onDragStart={onVertexDragStart}
                onDragMove={onVertexDragMove(i)}
                onDragEnd={onVertexDragEnd(i)}
                onContextMenu={onVertexContextMenu(i)}
                onMouseEnter={(e) => {
                  e.target.getStage().container().style.cursor = 'move';
                }}
                onMouseLeave={(e) => {
                  e.target.getStage().container().style.cursor = '';
                }}
              />
            ))}
          </Group>

          {/* cursore snappato (rosso se viola la distanza minima) */}
          {!closed && snappedCursor && !nearFirst && (
            <>
              <Circle
                x={snappedCursor.x}
                y={snappedCursor.y}
                radius={vertexR * 0.8}
                stroke={cursorClearanceViolated ? COLORS.conflict : COLORS.segment}
                strokeWidth={1.5 / view.scale}
                listening={false}
              />
              {cursorClearanceViolated && (
                <Circle
                  x={snappedCursor.x}
                  y={snappedCursor.y}
                  radius={minClearance}
                  stroke={COLORS.conflict}
                  strokeWidth={1 / view.scale}
                  dash={[4 / view.scale, 4 / view.scale]}
                  opacity={0.5}
                  listening={false}
                />
              )}
            </>
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

      <div className="scalebar" style={{ width: `${scaleBarPx}px` }}>
        <span>{scaleBarLabel}</span>
      </div>

      {/* menu contestuale del tasto destro */}
      {ctxMenu && (
        <div
          className="context-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {ctxMenu.kind === 'vertex' && (
            <button
              disabled={!canDeletePoint}
              title={
                canDeletePoint
                  ? `Elimina il punto ${ctxMenu.index + 1}`
                  : 'Un poligono chiuso richiede almeno 3 punti'
              }
              onClick={() => {
                removePoint(ctxMenu.index);
                setCtxMenu(null);
              }}
            >
              🗑 Elimina punto
            </button>
          )}
          {ctxMenu.kind === 'segment' &&
            (() => {
              const seg = segments.find((s) => s.index === ctxMenu.index);
              const segLen = seg ? seg.length : 0;
              const tooShort = segLen < minStartLength;
              const isStart = polygon.startSegment === ctxMenu.index;
              return (
                <button
                  disabled={isStart || tooShort}
                  title={
                    isStart
                      ? 'Questo segmento è già lo start'
                      : tooShort
                        ? `Troppo corto: ${segLen.toFixed(0)} m — lo start richiede almeno ${minStartLength} m`
                        : `Rettilineo di partenza sul segmento ${ctxMenu.index + 1} (${segLen.toFixed(0)} m)`
                  }
                  onClick={() => {
                    setStartSegment(ctxMenu.index);
                    setCtxMenu(null);
                  }}
                >
                  🏁 Imposta come start
                  {tooShort && (
                    <span className="menu-note">
                      {segLen.toFixed(0)} m &lt; {minStartLength} m
                    </span>
                  )}
                </button>
              );
            })()}
        </div>
      )}
    </div>
  );
}
