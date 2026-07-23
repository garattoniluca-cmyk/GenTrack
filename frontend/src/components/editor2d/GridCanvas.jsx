// GridCanvas.jsx — Fase 1: disegno + editing poligono su griglia (Konva).
// Coordinate mondo: metri, y-up. Lo Stage usa scaleY negativa per convertire
// dal sistema schermo (y-down): tutta la geometria è espressa in mondo.
// I Text (etichette) ri-flippano con scaleY=-1 locale per restare leggibili.
//
// Interazioni:
//   click sinistro   → aggiungi punto (snap alla griglia) [poligono aperto]
//   click sul primo punto (≥3 punti) → chiudi il poligono
//   drag su un vertice → sposta il punto (snap al rilascio)
//   click su un segmento [poligono chiuso] → inserisci un punto lì
//   Esc              → rimuovi ultimo punto
//   rotellina        → zoom sul puntatore
//   drag rotellina o Space+drag → pan

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Stage, Layer, Line, Circle, Text, Group } from 'react-konva';
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
} from '../../geometry/polygon.js';
import {
  WORLD_HALF_EXTENT,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_DEFAULT,
} from '../../config.js';

const CLOSE_TOLERANCE_PX = 12; // tolleranza chiusura in spazio SCHERMO (indipendente dallo zoom)
const LABEL_MIN_PX = 30; // mostra l'etichetta solo se il segmento a schermo è più lungo

const COLORS = {
  grid: '#2a2d33',
  gridMajor: '#3a3e46',
  axis: '#4a5060',
  segment: '#8ab4f8',
  segmentClosed: '#7ee787',
  fillClosed: 'rgba(126, 231, 135, 0.08)',
  conflict: '#f85149',
  rubber: '#8ab4f866',
  rubberConflict: '#f8514966',
  vertex: '#c9d1d9',
  vertexFirst: '#7ee787',
  vertexFirstReady: '#2ea043',
  label: '#e3b341',
};

export default function GridCanvas() {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [view, setView] = useState({ x: 0, y: 0, scale: ZOOM_DEFAULT }); // px per metro
  const [cursorWorld, setCursorWorld] = useState(null);
  const [spacePan, setSpacePan] = useState(false);
  const [hoverSeg, setHoverSeg] = useState(null);

  const polygon = useTrackStore((s) => s.stage1Polygon);
  const addPoint = useTrackStore((s) => s.addPoint);
  const removeLastPoint = useTrackStore((s) => s.removeLastPoint);
  const closePolygon = useTrackStore((s) => s.closePolygon);
  const updatePoint = useTrackStore((s) => s.updatePoint);
  const removePoint = useTrackStore((s) => s.removePoint);
  const insertPointOnSegment = useTrackStore((s) => s.insertPointOnSegment);
  const beginBatch = useTrackStore((s) => s.beginBatch);
  const endBatch = useTrackStore((s) => s.endBatch);
  const minClearance = useTrackStore((s) => s.minClearance);

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

  // passo di griglia VISIBILE: si ispessisce (×5) quando a schermo le celle
  // scenderebbero sotto ~8px. Lo snap usa SEMPRE questo passo (griglia visibile).
  let effGrid = gridSize;
  while (effGrid * view.scale < 8) effGrid *= 5;

  // --- dimensioni responsive del canvas ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // --- vista iniziale: TUTTA l'area 5000×5000 m visibile, centrata sull'origine ---
  const centeredRef = useRef(false);
  useEffect(() => {
    if (centeredRef.current || size.width === 0) return;
    centeredRef.current = true;
    const fitScale =
      (Math.min(size.width, size.height) / (2 * WORLD_HALF_EXTENT)) * 0.95;
    setView({
      x: size.width / 2,
      y: size.height / 2,
      scale: Math.max(ZOOM_MIN, fitScale),
    });
  }, [size]);

  // --- tastiera: Esc rimuove ultimo punto, Space attiva pan ---
  useEffect(() => {
    const down = (e) => {
      if (e.key === 'Escape') removeLastPoint();
      if (e.code === 'Space') setSpacePan(true);
    };
    const up = (e) => {
      if (e.code === 'Space') setSpacePan(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [removeLastPoint]);

  // --- conversioni schermo ↔ mondo (y-up) ---
  const screenToWorld = useCallback(
    (sx, sy) => ({
      x: (sx - view.x) / view.scale,
      y: -(sy - view.y) / view.scale,
    }),
    [view]
  );
  const worldToScreen = useCallback(
    (w) => ({ x: w.x * view.scale + view.x, y: -w.y * view.scale + view.y }),
    [view]
  );

  const pointerWorld = () => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    return screenToWorld(pos.x, pos.y);
  };

  // --- zoom sulla rotellina, centrato sul puntatore ---
  const onWheel = (e) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pos = stage.getPointerPosition();
    const factor = e.evt.deltaY < 0 ? 1.15 : 1 / 1.15;
    setView((v) => {
      const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.scale * factor));
      const k = scale / v.scale;
      return {
        scale,
        x: pos.x - (pos.x - v.x) * k,
        y: pos.y - (pos.y - v.y) * k,
      };
    });
  };

  // --- pan con drag rotellina o Space+drag ---
  const panState = useRef(null);
  const onMouseDown = (e) => {
    if (e.evt.button === 1 || (e.evt.button === 0 && spacePan)) {
      e.evt.preventDefault();
      panState.current = {
        startX: e.evt.clientX,
        startY: e.evt.clientY,
        viewX: view.x,
        viewY: view.y,
      };
    }
  };
  const onMouseMove = () => {
    const w = pointerWorld();
    if (w) setCursorWorld(w);
  };
  useEffect(() => {
    const move = (e) => {
      if (!panState.current) return;
      const { startX, startY, viewX, viewY } = panState.current;
      setView((v) => ({
        ...v,
        x: viewX + (e.clientX - startX),
        y: viewY + (e.clientY - startY),
      }));
    };
    const up = () => (panState.current = null);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);

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
    // fluido durante il drag (no snap): la mesh segue in tempo reale
    updatePoint(i, { x: e.target.x(), y: e.target.y() }, false);
  };
  const onVertexDragEnd = (i) => (e) => {
    // snap finale sulla griglia visibile
    updatePoint(i, { x: e.target.x(), y: e.target.y() }, true, effGrid);
    endBatch();
  };

  // --- click su un segmento (solo poligono chiuso): inserisci punto ---
  const onSegmentClick = (segIndex) => (e) => {
    if (!closed || e.evt.button !== 0 || spacePan) return;
    e.cancelBubble = true;
    const w = pointerWorld();
    if (w) insertPointOnSegment(segIndex, w, effGrid);
  };

  // --- tasto destro su un vertice: elimina il punto ---
  const onVertexContextMenu = (i) => (e) => {
    e.evt.preventDefault();
    e.cancelBubble = true;
    removePoint(i);
  };

  // --- dati derivati per il render ---
  const snappedCursor = cursorWorld && !closed ? snapToGrid(cursorWorld, effGrid) : null;

  // il candidato sotto il cursore viola la distanza minima? (feedback rosso)
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

  // griglia disegnata con lo stesso passo usato dallo snap
  const gridStep = effGrid;

  // disegna solo le linee visibili nel viewport (l'area è 5000×5000 m)
  const E = WORLD_HALF_EXTENT;
  const visXMin = Math.max(-E, (0 - view.x) / view.scale);
  const visXMax = Math.min(E, (size.width - view.x) / view.scale);
  const visYMin = Math.max(-E, -(size.height - view.y) / view.scale);
  const visYMax = Math.min(E, -(0 - view.y) / view.scale);

  const gridLines = [];
  const startX = Math.ceil(visXMin / gridStep) * gridStep;
  for (let v = startX; v <= visXMax; v += gridStep) {
    const major = Math.abs(v % (gridStep * 5)) < 1e-9;
    gridLines.push(
      <Line
        key={`v${v}`}
        points={[v, Math.max(-E, visYMin), v, Math.min(E, visYMax)]}
        stroke={v === 0 ? COLORS.axis : major ? COLORS.gridMajor : COLORS.grid}
        strokeWidth={(v === 0 ? 1.5 : 1) / view.scale}
        listening={false}
      />
    );
  }
  const startY = Math.ceil(visYMin / gridStep) * gridStep;
  for (let v = startY; v <= visYMax; v += gridStep) {
    const major = Math.abs(v % (gridStep * 5)) < 1e-9;
    gridLines.push(
      <Line
        key={`h${v}`}
        points={[Math.max(-E, visXMin), v, Math.min(E, visXMax), v]}
        stroke={v === 0 ? COLORS.axis : major ? COLORS.gridMajor : COLORS.grid}
        strokeWidth={(v === 0 ? 1.5 : 1) / view.scale}
        listening={false}
      />
    );
  }
  // bordo dell'area di lavoro
  gridLines.push(
    <Line
      key="worldBounds"
      points={[-E, -E, E, -E, E, E, -E, E]}
      closed
      stroke={COLORS.axis}
      strokeWidth={2 / view.scale}
      dash={[10 / view.scale, 6 / view.scale]}
      listening={false}
    />
  );

  // --- barra di scala (come nelle cartine): lunghezza "tonda" 1-2-5×10^n ---
  const targetPx = 120;
  const rawLen = targetPx / view.scale;
  const pow10 = Math.pow(10, Math.floor(Math.log10(rawLen)));
  const niceLen =
    [1, 2, 5, 10].map((m) => m * pow10).find((c) => c * view.scale >= 70) ??
    10 * pow10;
  const scaleBarPx = niceLen * view.scale;
  const scaleBarLabel =
    niceLen >= 1000 ? `${niceLen / 1000} km` : `${niceLen} m`;

  const flat = points.flatMap((p) => [p.x, p.y]);
  const vertexR = 5 / view.scale;
  const fontSize = 11 / view.scale;

  return (
    <div
      ref={containerRef}
      className="canvas-container"
      onContextMenu={(e) => e.preventDefault()} // il tasto destro è dell'app, non del browser
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
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onClick={onClick}
      >
        <Layer listening={false}>{gridLines}</Layer>

        <Layer>
          {/* poligono chiuso: riempimento */}
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
                  bad
                    ? COLORS.conflict
                    : closed
                      ? COLORS.segmentClosed
                      : COLORS.segment
                }
                strokeWidth={((bad ? 3 : 2) + (hoverSeg === seg.index ? 1 : 0)) / view.scale}
                hitStrokeWidth={closed ? 12 / view.scale : 0}
                onClick={onSegmentClick(seg.index)}
                onMouseEnter={() => closed && setHoverSeg(seg.index)}
                onMouseLeave={() => setHoverSeg(null)}
              />
            );
          })}

          {/* etichette lunghezza segmenti (ri-flippate per il y-up dello stage) */}
          {segments.map((seg) => {
            if (seg.length * view.scale < LABEL_MIN_PX) return null;
            const label = `${seg.length.toFixed(1)} m`;
            const mid = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
            // offset perpendicolare al segmento per non coprire la linea
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
                offsetX={(label.length * fontSize * 0.27)}
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
                offsetX={(label.length * fontSize * 0.27)}
                offsetY={fontSize / 2 + 10 / view.scale}
                listening={false}
              />
            );
          })()}

          {/* anteprima segmento di chiusura quando il mouse è sul primo punto */}
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

          {/* vertici: trascinabili per la modifica */}
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
              {/* raggio di rispetto attorno al candidato rifiutato */}
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
            &nbsp;·&nbsp; zoom: {view.scale >= 1 ? view.scale.toFixed(0) : view.scale.toFixed(2)} px/m
          </span>
        )}
      </div>

      <div className="scalebar" style={{ width: `${scaleBarPx}px` }}>
        <span>{scaleBarLabel}</span>
      </div>
    </div>
  );
}
