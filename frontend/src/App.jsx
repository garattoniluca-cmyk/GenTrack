// App.jsx — shell TrackGen: switcher di fase, toolbar, statusbar, pannello dati.
// NOTA: mai usare window.confirm/alert — i dialog nativi sono bloccati in
// alcuni ambienti embedded (preview) e falliscono in silenzio. Solo modali interne.
import { useMemo, useState } from 'react';
import GridCanvas from './components/editor2d/GridCanvas.jsx';
import SplineEditor from './components/editor2d/SplineEditor.jsx';
import FlowTubeEditor from './components/editor2d/FlowTubeEditor.jsx';
import Scene3D from './components/viewer3d/Scene3D.jsx';
import BankingProfile from './components/panels/BankingProfile.jsx';
import ElevationProfile from './components/panels/ElevationProfile.jsx';
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
import { buildElevation } from './geometry/trackNoise.js';
import { buildBankingProfile, buildBankingRoll, bankingConflicts } from './geometry/banking.js';
import { buildFlowTubeMesh } from './geometry/flowTubeMesh.js';

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

  // Fase 3A: altimetria derivata (rumore periodico sul path)
  const flowTube = useTrackStore((s) => s.stage3FlowTube);

  // estensione del rettilineo di start nel dominio s: dal termine dell'ultima
  // stondatura (prima del traguardo) all'inizio della prima (dopo il traguardo).
  // Usata sia dal grafico sia dallo SPIANAMENTO dell'altimetria.
  const startStraight = useMemo(() => {
    const cs = resampled.corners.filter((c) => !c.skip && c.sStart != null);
    if (cs.length === 0) return null;
    const first = cs.reduce((a, b) => (a.sStart < b.sStart ? a : b));
    const last = cs.reduce((a, b) => (a.sEnd > b.sEnd ? a : b));
    return { endS: first.sStart, beginS: last.sEnd };
  }, [resampled.corners]);

  // segmento di start sulla MAPPA: ancora z=0 del campo altimetrico 2D (D-025)
  const startSegWorld = useMemo(() => {
    const pts = polygon.points;
    if (polygon.startSegment == null || pts.length < 3) return null;
    return {
      a: pts[polygon.startSegment],
      b: pts[(polygon.startSegment + 1) % pts.length],
    };
  }, [polygon.points, polygon.startSegment]);

  const elevation = useMemo(
    () =>
      resampled.sampleCount >= 2
        ? buildElevation(
            resampled.samples,
            resampled.totalLength,
            flowTube.elevationNoise,
            startSegWorld
          )
        : null,
    [resampled.samples, resampled.sampleCount, resampled.totalLength, flowTube.elevationNoise, startSegWorld]
  );
  const bankingProfile = useMemo(
    () =>
      buildBankingProfile(
        resampled.sampleCount,
        resampled.totalLength,
        resampled.corners,
        flowTube.cornerBanking
      ),
    [resampled.sampleCount, resampled.totalLength, resampled.corners, flowTube.cornerBanking]
  );
  const bankConflicts = useMemo(
    () =>
      bankingConflicts(resampled.totalLength, resampled.corners, flowTube.cornerBanking),
    [resampled.totalLength, resampled.corners, flowTube.cornerBanking]
  );

  // Fase 3B: mesh 3D (solo quando serve)
  const view3d = useTrackStore((s) => s.view3d);
  const setView3d = useTrackStore((s) => s.setView3d);
  const mesh3d = useMemo(() => {
    if (phase !== 4 || !elevation || resampled.sampleCount < 3) return null;
    const roll = buildBankingRoll(
      resampled.sampleCount,
      resampled.totalLength,
      resampled.corners,
      flowTube.cornerBanking
    );
    return buildFlowTubeMesh(resampled.samples, elevation.z, roll, flowTube.section);
  }, [phase, resampled, elevation, flowTube.cornerBanking, flowTube.section]);

  // validazione 3B: il bordo interno di una curva troppo stretta per il tubo
  // si auto-intersecherebbe (da segnalare, mai correggere)
  const tightCorners = useMemo(() => {
    return resampled.corners
      .filter((c) => !c.skip && c.minR != null)
      .filter((c) => {
        const halfTube =
          flowTube.section.trackWidth / 2 +
          Math.max(flowTube.section.grassLeft, flowTube.section.grassRight);
        return c.minR < halfTube;
      })
      .map((c) => ({ origIndex: c.origIndex, minR: c.minR }));
  }, [resampled.corners, flowTube.section]);

  const startSegLength =
    polygon.startSegment != null
      ? (segments.find((s) => s.index === polygon.startSegment)?.length ?? 0)
      : null;
  const startTooShort =
    startSegLength != null && startSegLength < minStartLength;

  const phase2Ready =
    polygon.closed && polygon.startSegment != null && !startTooShort;

  // modale interna di conferma rigenerazione (MAI window.confirm: bloccato
  // negli ambienti embedded, fallirebbe in silenzio).
  // confirmRegenOpen = null | fase di destinazione (2 o 3)
  const [confirmRegenOpen, setConfirmRegenOpen] = useState(null);

  // ingresso in una fase derivata: se il poligono è cambiato, i bracci decadono
  const goDerivedPhase = (target) => {
    if (!phase2Ready) return;
    const st = useTrackStore.getState();
    const fp = computeStage1Fingerprint(st.stage1Polygon);
    const hasEdits =
      Object.keys(st.stage2Spline.arms).length > 0 &&
      st.stage2Spline.sourceFingerprint != null &&
      st.stage2Spline.sourceFingerprint !== fp;
    if (hasEdits) {
      setConfirmRegenOpen(target);
      return;
    }
    st.generateSplineFromPolygon();
    setPhase(target);
  };

  const confirmRegen = () => {
    useTrackStore.getState().generateSplineFromPolygon(true);
    setPhase(confirmRegenOpen ?? 2);
    setConfirmRegenOpen(null);
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
            onClick={() => goDerivedPhase(2)}
          >
            2 · Spline
          </button>
          <button
            className={phase === 3 ? 'active' : ''}
            disabled={!phase2Ready}
            title={
              phase2Ready
                ? 'Sezione, banking e altimetria del tubo di flusso'
                : 'Chiudi il poligono e imposta lo start per accedere'
            }
            onClick={() => goDerivedPhase(3)}
          >
            3A · Tubo 2D
          </button>
          <button
            className={phase === 4 ? 'active' : ''}
            disabled={!phase2Ready}
            title={
              phase2Ready
                ? 'Scena 3D del tubo di flusso'
                : 'Chiudi il poligono e imposta lo start per accedere'
            }
            onClick={() => goDerivedPhase(4)}
          >
            3B · 3D
          </button>
        </div>

        {phase === 4 && (
          <>
            <label className="check-row" title="Inverte l'asse Y del mouse">
              <input
                type="checkbox"
                checked={view3d.invertY}
                onChange={(e) => setView3d({ invertY: e.target.checked })}
              />
              Y invertita
            </label>
            <label className="check-row" title="Ispezione dei triangoli">
              <input
                type="checkbox"
                checked={view3d.wireframe}
                onChange={(e) => setView3d({ wireframe: e.target.checked })}
              />
              Wireframe
            </label>
          </>
        )}

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
        {phase === 1 ? (
          <GridCanvas />
        ) : phase === 2 ? (
          <SplineEditor />
        ) : phase === 4 ? (
          <Scene3D
            mesh={mesh3d}
            resampled={resampled}
            elevation={elevation}
            invertY={view3d.invertY}
            wireframe={view3d.wireframe}
          />
        ) : (
          <div className="canvas-with-charts">
            <FlowTubeEditor resampled={resampled} elevation={elevation} />
            <div className="charts-row">
              <BankingProfile bankingProfile={bankingProfile} />
              <ElevationProfile
                elevation={elevation}
                totalLength={resampled.totalLength}
                maxSlopePct={flowTube.elevationNoise.maxSlopePct}
                startStraight={startStraight}
              />
            </div>
          </div>
        )}

        <aside className="side-panel">
          {phase === 4 ? (
            <>
              <h2>fase 3B — tubo di flusso 3D</h2>
              {mesh3d && (
                <div className="param-group">
                  <h3>Mesh</h3>
                  <div className="stats-grid">
                    <span>Triangoli</span>
                    <b>{mesh3d.stats.triangles.toLocaleString('it-IT')}</b>
                    <span>Vertici</span>
                    <b>{mesh3d.stats.vertices.toLocaleString('it-IT')}</b>
                    <span>Anelli</span>
                    <b>{resampled.sampleCount}</b>
                    <span>Muri</span>
                    <b>2 m verticali</b>
                  </div>
                </div>
              )}
              {tightCorners.length > 0 && (
                <div className="param-group">
                  <h3 className="err">⚠ Curve troppo strette per il tubo</h3>
                  <div className="stats-grid">
                    {tightCorners.map((c) => (
                      <span key={c.origIndex} className="err" style={{ gridColumn: '1 / -1' }}>
                        vertice {c.origIndex + 1}: R~{Math.round(c.minR)} m &lt;{' '}
                        semi-larghezza tubo — il bordo interno si auto-interseca:
                        allarga i bracci in Fase 2
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="hints">
                <h3>Comandi</h3>
                <ul>
                  <li><b>Drag col mouse</b> — guarda intorno</li>
                  <li><b>Frecce / WASD</b> — vola (↑ avanti, ← → strafe)</li>
                  <li><b>Shift</b> — boost ×4 · <b>rotellina</b> — velocità</li>
                  <li><b>Y invertita / Wireframe</b> — toggle in toolbar</li>
                  <li>Bank e quota arrivano dalla Fase 3A: modifica lì, rientra qui</li>
                </ul>
              </div>
            </>
          ) : phase === 3 ? (
            <>
              <h2>stage3_flowTube</h2>

              <div className="param-group">
                <h3>Sezione (fissa su tutto il tracciato)</h3>
                {[
                  ['trackWidth', 'Pista (m)', 1, 1],
                  ['lineWidth', 'Riga bianca (m)', 0.05, 0.05],
                  ['grassLeft', 'Erba SX (m)', 1, 1],
                  ['grassRight', 'Erba DX (m)', 1, 1],
                ].map(([key, label, min, step]) => (
                  <label key={key} className="param-row">
                    {label}
                    <input
                      type="number"
                      min={min}
                      step={step}
                      value={flowTube.section[key]}
                      onChange={(e) =>
                        useTrackStore.getState().setSectionParam(key, parseFloat(e.target.value))
                      }
                    />
                  </label>
                ))}
              </div>

              <div className="param-group">
                <h3>Altimetria (rumore)</h3>
                {[
                  ['amplitude', 'Ampiezza (m)', 0, 1],
                  ['wavelength', 'Lungh. onda (m)', 50, 50],
                  ['octaves', 'Ottave', 1, 1],
                  ['persistence', 'Persistenza', 0.1, 0.05],
                  ['lacunarity', 'Lacunarità', 1.1, 0.1],
                  ['maxSlopePct', 'Pendenza max (%)', 0.5, 0.5],
                  ['flatRadius', 'Raggio piana start (m)', 0, 50],
                ].map(([key, label, min, step]) => (
                  <label key={key} className="param-row">
                    {label}
                    <input
                      type="number"
                      min={min}
                      step={step}
                      value={flowTube.elevationNoise[key]}
                      onChange={(e) =>
                        useTrackStore.getState().setNoiseParam(key, parseFloat(e.target.value))
                      }
                    />
                  </label>
                ))}
                <div className="param-row">
                  <span className="dim">Seed: {flowTube.elevationNoise.seed}</span>
                  <button onClick={() => useTrackStore.getState().newNoiseSeed()}>
                    🎲 Nuovo seed
                  </button>
                </div>
              </div>

              {elevation && (
                <div className="param-group">
                  <h3>Statistiche altimetria</h3>
                  <div className="stats-grid">
                    <span>Quota min/max</span>
                    <b>
                      {elevation.stats.minZ.toFixed(1)} / {elevation.stats.maxZ.toFixed(1)} m
                    </b>
                    <span>Dislivello salite</span>
                    <b>{elevation.stats.gain.toFixed(0)} m</b>
                    <span>Pendenza max</span>
                    <b>{elevation.stats.maxSlopePct.toFixed(1)} %</b>
                    {elevation.stats.amplitudeScale < 1 && (
                      <>
                        <span className="warn">Ampiezza ridotta</span>
                        <b className="warn">
                          ×{elevation.stats.amplitudeScale.toFixed(2)} (limite pendenza)
                        </b>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="hints">
                <h3>Comandi</h3>
                <ul>
                  <li><b>Click sul marker di una curva</b> — imposta bank e rampe di ritorno a zero</li>
                  <li>Marker <b>giallo</b> = curva con bank; il grafico in basso è sola visualizzazione</li>
                  <li>Linea a lato del tubo (esterno curva): <b>continua</b> = bank pieno, <b>tratteggiata</b> = transitori; gialla = bank +, ciano = bank −</li>
                  <li><b>🎲 Nuovo seed</b> — altra altimetria con gli stessi parametri</li>
                  <li>Mezzeria colorata per quota (blu=basso, rosso=alto)</li>
                  <li><b>Rotellina / Space+drag</b> — zoom / pan</li>
                </ul>
              </div>
            </>
          ) : phase === 1 ? (
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

      {confirmRegenOpen != null && (
        <div className="modal-overlay" onClick={() => setConfirmRegenOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Poligono modificato</h3>
            <p>
              Il poligono è cambiato dall'ultima sessione di Fase 2.
              <br />
              I <b>bracci personalizzati</b> delle curve verranno reimpostati al
              default ({useTrackStore.getState().stage2Spline.defaultArm} m).
            </p>
            <div className="modal-actions">
              <button onClick={() => setConfirmRegenOpen(null)}>Annulla</button>
              <button className="primary" onClick={confirmRegen}>
                Continua
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="statusbar">
        {phase === 4 ? (
          <>
            <span>
              Triangoli: <b>{mesh3d ? mesh3d.stats.triangles.toLocaleString('it-IT') : '—'}</b>
            </span>
            <span>
              Lunghezza: <b>{resampled.totalLength.toFixed(0)} m</b>
            </span>
            {elevation && (
              <span>
                Dislivello: <b>{(elevation.stats.maxZ - elevation.stats.minZ).toFixed(1)} m</b>
              </span>
            )}
            {bankConflicts.length > 0 && (
              <span className="err">⚠ rampe bank in conflitto — sistemale in 3A</span>
            )}
            {tightCorners.length > 0 && (
              <span className="err">
                ⚠ {tightCorners.length} curve più strette del tubo — vedi pannello
              </span>
            )}
            <span className="dim">● 3B: mesh dal vivo dai dati 3A</span>
          </>
        ) : phase === 3 ? (
          <>
            <span>
              Lunghezza: <b>{resampled.totalLength.toFixed(0)} m</b>
            </span>
            <span>
              Pista: <b>{flowTube.section.trackWidth} m</b> · erba{' '}
              <b>
                {flowTube.section.grassLeft}+{flowTube.section.grassRight} m
              </b>
            </span>
            <span>
              Curve con bank:{' '}
              <b>
                {
                  Object.values(flowTube.cornerBanking).filter((b) => b.angleDeg !== 0)
                    .length
                }
              </b>
            </span>
            {bankConflicts.length > 0 && (
              <span className="err">
                ⚠ rampe bank in conflitto ({bankConflicts.length}):{' '}
                {bankConflicts
                  .map((c) => `eccesso ${Math.ceil(c.excessM)} m`)
                  .join(' · ')}{' '}
                — riduci le rampe
              </span>
            )}
            {elevation && (
              <>
                <span>
                  Dislivello: <b>{(elevation.stats.maxZ - elevation.stats.minZ).toFixed(1)} m</b>
                </span>
                <span
                  className={
                    elevation.stats.maxSlopePct > flowTube.elevationNoise.maxSlopePct * 0.98
                      ? 'warn'
                      : 'ok'
                  }
                >
                  Pendenza max: <b>{elevation.stats.maxSlopePct.toFixed(1)}%</b> /{' '}
                  {flowTube.elevationNoise.maxSlopePct}%
                </span>
              </>
            )}
            <span className="dim">● 3A: sezione fissa · altimetria = verità</span>
          </>
        ) : phase === 1 ? (
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
