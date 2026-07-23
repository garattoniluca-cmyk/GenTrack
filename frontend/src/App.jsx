// App.jsx — shell TrackGen. Fase 1: editor poligonale + pannello stato.
import { useMemo } from 'react';
import GridCanvas from './components/editor2d/GridCanvas.jsx';
import { useTrackStore } from './state/trackStore.js';
import {
  findSelfIntersections,
  ringSelfIntersections,
  segmentLengths,
  canClose,
} from './geometry/polygon.js';

export default function App() {
  const polygon = useTrackStore((s) => s.stage1Polygon);
  const setGridSize = useTrackStore((s) => s.setGridSize);
  const minClearance = useTrackStore((s) => s.minClearance);
  const setMinClearance = useTrackStore((s) => s.setMinClearance);
  const setDirection = useTrackStore((s) => s.setDirection);
  const undo = useTrackStore((s) => s.undo);
  const redo = useTrackStore((s) => s.redo);
  const historyPast = useTrackStore((s) => s.historyPast);
  const historyFuture = useTrackStore((s) => s.historyFuture);
  const resetPolygon = useTrackStore((s) => s.resetPolygon);
  const reopenPolygon = useTrackStore((s) => s.reopenPolygon);

  const conflicts = useMemo(
    () =>
      polygon.closed
        ? ringSelfIntersections(polygon.points)
        : findSelfIntersections(polygon.points),
    [polygon.points, polygon.closed]
  );
  const canCloseNow = useMemo(
    () => !polygon.closed && canClose(polygon.points),
    [polygon.points, polygon.closed]
  );
  const segments = useMemo(
    () => segmentLengths(polygon.points, polygon.closed),
    [polygon.points, polygon.closed]
  );
  const totalLen = useMemo(
    () => segments.reduce((sum, s) => sum + s.length, 0),
    [segments]
  );
  // polygon è già nella forma dello schema condiviso (points, gridSize, closed)
  const stage1Schema = polygon;

  const status = polygon.closed
    ? { text: 'Poligono chiuso ✓', cls: 'ok' }
    : conflicts.length > 0
      ? { text: `${conflicts.length} intersezioni — chiusura bloccata`, cls: 'err' }
      : canCloseNow
        ? { text: 'Pronto a chiudere — clicca sul primo punto', cls: 'ready' }
        : { text: `${polygon.points.length} punti — disegna la poligonale`, cls: '' };

  return (
    <div className="app">
      <header className="toolbar">
        <h1>TrackGen</h1>
        <span className="phase-badge">Fase 1 — Poligonale</span>

        <label>
          Griglia (m)
          <input
            type="number"
            min="1"
            step="1"
            value={polygon.gridSize}
            onChange={(e) => setGridSize(parseFloat(e.target.value))}
          />
        </label>

        <label title="Distanza minima di un punto nuovo da punti e segmenti esistenti">
          Dist. min (m)
          <input
            type="number"
            min="0"
            step="10"
            value={minClearance}
            onChange={(e) => setMinClearance(parseFloat(e.target.value))}
          />
        </label>

        {polygon.closed && (
          <div className="direction-toggle" title="Verso di percorrenza">
            <button
              className={polygon.direction === 'cw' ? 'active' : ''}
              onClick={() => setDirection('cw')}
            >
              ⟳ Orario
            </button>
            <button
              className={polygon.direction === 'ccw' ? 'active' : ''}
              onClick={() => setDirection('ccw')}
            >
              ⟲ Antiorario
            </button>
          </div>
        )}

        <button onClick={undo} disabled={historyPast === 0} title="Annulla">
          ↩ Undo
        </button>
        <button onClick={redo} disabled={historyFuture === 0} title="Ripristina">
          ↪ Redo
        </button>
        {polygon.closed && (
          <button onClick={reopenPolygon} title="Riapri per modificare">
            ✎ Riapri
          </button>
        )}
        <button
          className="danger"
          onClick={resetPolygon}
          disabled={polygon.points.length === 0}
        >
          ✕ Reset
        </button>

        <span className={`status ${status.cls}`}>{status.text}</span>
      </header>

      <main className="workspace">
        <GridCanvas />

        <aside className="side-panel">
          <h2>stage1_polygon</h2>
          <pre>{JSON.stringify(stage1Schema, null, 2)}</pre>
          <div className="hints">
            <h3>Comandi</h3>
            <ul>
              <li><b>Click</b> — aggiungi punto</li>
              <li><b>Click sul primo punto</b> — chiudi</li>
              <li><b>Drag su un vertice</b> — sposta punto</li>
              <li><b>Tasto destro su un vertice</b> — menu (Elimina punto)</li>
              <li><b>Click su un segmento</b> (chiuso) — inserisci punto</li>
              <li><b>Tasto destro su un segmento</b> (chiuso) — imposta start</li>
              <li><b>Esc</b> — rimuovi ultimo punto</li>
              <li><b>Rotellina</b> — zoom</li>
              <li><b>Space + drag</b> / rotellina premuta — pan</li>
            </ul>
          </div>
        </aside>
      </main>

      <footer className="statusbar">
        <span>
          Punti: <b>{polygon.points.length}</b>
        </span>
        <span>
          Segmenti: <b>{segments.length}</b>
        </span>
        <span>
          Lunghezza {polygon.closed ? 'totale' : 'attuale'}:{' '}
          <b>{totalLen.toFixed(1)} m</b>
        </span>
        {conflicts.length > 0 && (
          <span className="err">⚠ {conflicts.length} intersezioni</span>
        )}
        {polygon.closed &&
          (polygon.startSegment != null ? (
            <span className="ok">
              🏁 start: segmento {polygon.startSegment + 1} ·{' '}
              {polygon.direction === 'cw' ? 'orario ⟳' : 'antiorario ⟲'}
            </span>
          ) : (
            <span className="warn">
              🏁 imposta lo start — tasto destro su un segmento
            </span>
          ))}
        <span className={polygon.closed ? 'ok' : 'dim'}>
          {polygon.closed ? '● circuito chiuso' : '○ in disegno'}
        </span>
      </footer>
    </div>
  );
}
