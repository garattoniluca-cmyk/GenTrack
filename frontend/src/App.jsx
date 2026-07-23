// App.jsx — shell TrackGen: switcher di fase, toolbar, statusbar, pannello dati.
// NOTA: mai usare window.confirm/alert — i dialog nativi sono bloccati in
// alcuni ambienti embedded (preview) e falliscono in silenzio. Solo modali interne.
import { useMemo, useState } from 'react';
import GridCanvas from './components/editor2d/GridCanvas.jsx';
import SplineEditor from './components/editor2d/SplineEditor.jsx';
import {
  useTrackStore,
  computeStage1Fingerprint,
} from './state/trackStore.js';
import {
  findSelfIntersections,
  ringSelfIntersections,
  segmentLengths,
  canClose,
} from './geometry/polygon.js';
import { resampleFilletPath } from './geometry/spline.js';

export default function App() {
  const phase = useTrackStore((s) => s.phase);
  const setPhase = useTrackStore((s) => s.setPhase);
  const polygon = useTrackStore((s) => s.stage1Polygon);
  const spline = useTrackStore((s) => s.stage2Spline);
  const setGridSize = useTrackStore((s) => s.setGridSize);
  const minClearance = useTrackStore((s) => s.minClearance);
  const setMinClearance = useTrackStore((s) => s.setMinClearance);
  const minStartLength = useTrackStore((s) => s.minStartLength);
  const setMinStartLength = useTrackStore((s) => s.setMinStartLength);
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

  // Fase 2: path derivato (stesso memo dell'editor)
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
  const curveCount = useMemo(
    () => resampled.corners.filter((c) => !c.skip).length,
    [resampled.corners]
  );

  const startSegLength =
    polygon.startSegment != null
      ? (segments.find((s) => s.index === polygon.startSegment)?.length ?? 0)
      : null;
  const startTooShort =
    startSegLength != null && startSegLength < minStartLength;

  const phase2Ready =
    polygon.closed && polygon.startSegment != null && !startTooShort;

  // modale interna di conferma rigenerazione (MAI window.confirm: bloccato
  // negli ambienti embedded, fallirebbe in silenzio)
  const [confirmRegenOpen, setConfirmRegenOpen] = useState(false);

  // ingresso in Fase 2: se il poligono è cambiato, i raggi override decadono
  const goPhase2 = () => {
    if (!phase2Ready) return;
    const st = useTrackStore.getState();
    const fp = computeStage1Fingerprint(st.stage1Polygon);
    const hasEdits =
      Object.keys(st.stage2Spline.arms).length > 0 &&
      st.stage2Spline.sourceFingerprint != null &&
      st.stage2Spline.sourceFingerprint !== fp;
    if (hasEdits) {
      setConfirmRegenOpen(true);
      return;
    }
    st.generateSplineFromPolygon();
    setPhase(2);
  };

  const confirmRegen = () => {
    useTrackStore.getState().generateSplineFromPolygon(true);
    setConfirmRegenOpen(false);
    setPhase(2);
  };

  const status =
    phase === 2
      ? {
          text: `${curveCount} curve · ${resampled.sampleCount} sample`,
          cls: 'ok',
        }
      : polygon.closed
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

        <div className="phase-tabs">
          <button
            className={phase === 1 ? 'active' : ''}
            onClick={() => setPhase(1)}
          >
            1 · Poligonale
          </button>
          <button
            className={phase === 2 ? 'active' : ''}
            disabled={!phase2Ready}
            title={
              phase2Ready
                ? 'Editing spline'
                : 'Chiudi il poligono e imposta lo start per accedere'
            }
            onClick={goPhase2}
          >
            2 · Spline
          </button>
        </div>

        {phase === 2 && (
          <label title="Braccio di default delle stondature (distanza dei punti di tangenza dal vertice)">
            Braccio curve (m)
            <input
              type="number"
              min="5"
              step="5"
              value={spline.defaultArm}
              onChange={(e) =>
                useTrackStore.getState().setDefaultArm(parseFloat(e.target.value))
              }
            />
          </label>
        )}

        {phase === 1 && (
          <>
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

            <label title="Lunghezza minima del rettilineo di start">
              Start min (m)
              <input
                type="number"
                min="0"
                step="50"
                value={minStartLength}
                onChange={(e) => setMinStartLength(parseFloat(e.target.value))}
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
          </>
        )}

        <button onClick={undo} disabled={historyPast === 0} title="Annulla">
          ↩ Undo
        </button>
        <button onClick={redo} disabled={historyFuture === 0} title="Ripristina">
          ↪ Redo
        </button>
        {phase === 1 && polygon.closed && (
          <button onClick={reopenPolygon} title="Riapri per modificare">
            ✎ Riapri
          </button>
        )}
        {phase === 1 && (
          <button
            className="danger"
            onClick={resetPolygon}
            disabled={polygon.points.length === 0}
          >
            ✕ Reset
          </button>
        )}

        <span className={`status ${status.cls}`}>{status.text}</span>
      </header>

      <main className="workspace">
        {phase === 1 ? <GridCanvas /> : <SplineEditor />}

        <aside className="side-panel">
          {phase === 1 ? (
            <>
              <h2>stage1_polygon</h2>
              <pre>{JSON.stringify(polygon, null, 2)}</pre>
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
            </>
          ) : (
            <>
              <h2>stage2_spline</h2>
              <pre>
                {JSON.stringify(
                  {
                    defaultArmLength: spline.defaultArm,
                    cornerArms: spline.arms,
                    resampledArcLength: {
                      totalLength: Math.round(resampled.totalLength * 10) / 10,
                      sampleCount: resampled.sampleCount,
                      samples: `[${resampled.sampleCount} × {t, s, x, y}]`,
                    },
                  },
                  null,
                  2
                )}
              </pre>
              <div className="hints">
                <h3>Comandi</h3>
                <ul>
                  <li><b>Drag su una maniglia</b> — allunga/accorcia quel braccio</li>
                  <li>Due maniglie per curva: <b>prima</b> e <b>dopo</b> il vertice — bracci diversi = curva asimmetrica</li>
                  <li><b>Tasto destro su una maniglia</b> — reimposta default</li>
                  <li>Maniglia <b>gialla</b> = braccio personalizzato</li>
                  <li><b>Rotellina</b> — zoom</li>
                  <li><b>Space + drag</b> / rotellina premuta — pan</li>
                </ul>
              </div>
            </>
          )}
        </aside>
      </main>

      {confirmRegenOpen && (
        <div className="modal-overlay" onClick={() => setConfirmRegenOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Poligono modificato</h3>
            <p>
              Il poligono è cambiato dall'ultima sessione di Fase 2.
              <br />
              I <b>bracci personalizzati</b> delle curve verranno reimpostati al
              default ({useTrackStore.getState().stage2Spline.defaultArm} m).
            </p>
            <div className="modal-actions">
              <button onClick={() => setConfirmRegenOpen(false)}>Annulla</button>
              <button className="primary" onClick={confirmRegen}>
                Continua in Fase 2
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="statusbar">
        {phase === 1 ? (
          <>
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
                startTooShort ? (
                  <span className="err">
                    🏁 start troppo corto: {startSegLength.toFixed(0)} m &lt;{' '}
                    {minStartLength} m — allunga il rettilineo o scegline un altro
                  </span>
                ) : (
                  <span className="ok">
                    🏁 start: segmento {polygon.startSegment + 1} (
                    {startSegLength.toFixed(0)} m) ·{' '}
                    {polygon.direction === 'cw' ? 'orario ⟳' : 'antiorario ⟲'}
                  </span>
                )
              ) : (
                <span className="warn">
                  🏁 imposta lo start — tasto destro su un segmento ≥{' '}
                  {minStartLength} m
                </span>
              ))}
            <span className={polygon.closed ? 'ok' : 'dim'}>
              {polygon.closed ? '● circuito chiuso' : '○ in disegno'}
            </span>
          </>
        ) : (
          <>
            <span>
              Curve: <b>{curveCount}</b>
              {Object.keys(spline.arms).length > 0 && (
                <> ({Object.keys(spline.arms).length} personalizzate)</>
              )}
            </span>
            <span>
              Lunghezza tracciato: <b>{resampled.totalLength.toFixed(1)} m</b>
            </span>
            <span>
              Sample arc-length: <b>{resampled.sampleCount}</b>
            </span>
            <span className="ok">
              🏁 s = 0 sullo start ·{' '}
              {polygon.direction === 'cw' ? 'orario ⟳' : 'antiorario ⟲'}
            </span>
            <span className="dim">● rettilinei esatti + stondature C1</span>
          </>
        )}
      </footer>
    </div>
  );
}
