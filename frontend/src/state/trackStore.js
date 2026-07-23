// trackStore.js — Zustand store, unica fonte di verità (D-007, brief §2).
// Fase 1: solo stage1_polygon. Le fasi successive aggiungeranno le loro slice.
// Convenzione coordinate: metri, y-up (D-011).

import { create } from 'zustand';
import { withHistory } from './historyMiddleware.js';
import {
  snapToGrid,
  canClose,
  violatesClearance,
  signedArea,
  dist,
  projectPointOnSegment,
} from '../geometry/polygon.js';
import {
  DEFAULT_GRID_SIZE,
  DEFAULT_MIN_CLEARANCE,
  DEFAULT_MIN_START_LENGTH,
  clampToWorld,
} from '../config.js';

const initialPolygon = {
  points: [], // [{x, y}] in metri, y-up
  gridSize: DEFAULT_GRID_SIZE,
  closed: false,
  startSegment: null, // indice segmento start/finish (i: points[i] → points[(i+1)%n])
  direction: null, // verso di percorrenza: 'cw' (orario) | 'ccw' (antiorario)
};

/**
 * Snap alla griglia + clamp dentro l'area di lavoro 5000×5000 m.
 * `snapSize` è il passo di griglia VISIBILE (può essere più grosso di
 * gridSize quando si è zoomati indietro): lo snap segue ciò che si vede.
 */
const snapClamp = (p, snapSize) => snapToGrid(clampToWorld(p), snapSize);

/**
 * Impronta della parte di stage1 da cui deriva la spline: se cambia, i
 * control point della Fase 2 vanno rigenerati (pipeline reversibile, brief §1).
 */
export const computeStage1Fingerprint = (stage1) =>
  JSON.stringify([stage1.points, stage1.startSegment, stage1.direction]);

const initialFlowTube = {
  // sezione trasversale FISSA su tutto il tracciato (semplificazione 3A):
  // [erba SX][riga][pista][riga][erba DX] — i muri arrivano in 3B
  section: {
    trackWidth: 12, // larghezza pista (m) — minimo FIA F1
    lineWidth: 0.2, // riga bianca (m), dentro il bordo pista
    grassLeft: 8, // fascia erba lato sinistro (m, verso di percorrenza)
    grassRight: 8, // fascia erba lato destro (m)
  },
  // banking PER CURVA (D-024): { [indiceVertice]: {angleDeg, rampBefore, rampAfter} }
  // — bank costante lungo la curva, rampe smoothstep di ritorno a zero (m)
  cornerBanking: {},
  // altimetria: parametri del rumore periodico (D-022) — z(s) è derivato puro
  elevationNoise: {
    seed: 12345,
    amplitude: 25,
    wavelength: 800,
    octaves: 4,
    persistence: 0.5,
    lacunarity: 2.0,
    maxSlopePct: 10,
    flattenStart: 0.6,
  },
};

const initialSpline = {
  defaultArm: 60, // braccio di default delle stondature (m)
  // override per-vertice: { [indiceVerticeOriginale]: {in: metri, out: metri} }
  // "in" = braccio sullo spigolo PRIMA del vertice (verso di percorrenza),
  // "out" = braccio sullo spigolo DOPO — bracci diversi = stondatura asimmetrica
  arms: {},
  sourceFingerprint: null, // impronta dello stage1 da cui deriva il path
};

export const useTrackStore = create(
  withHistory(
    (set, get) => ({
      stage1Polygon: initialPolygon,
      stage2Spline: initialSpline,
      stage3FlowTube: initialFlowTube,

      /** Fase attiva nell'UI (1 = poligonale, 2 = spline, 3 = tubo 2D). */
      phase: 1,
      setPhase: (p) => {
        if (p !== 1 && p !== 2 && p !== 3) return;
        set({ phase: p });
      },

      /** Distanza minima (m) di un punto nuovo da punti/segmenti esistenti. */
      minClearance: DEFAULT_MIN_CLEARANCE,

      setMinClearance: (v) => {
        if (!(v >= 0)) return;
        set({ minClearance: v });
      },

      /** Lunghezza minima (m) del rettilineo di start. */
      minStartLength: DEFAULT_MIN_START_LENGTH,

      setMinStartLength: (v) => {
        if (!(v >= 0)) return;
        set({ minStartLength: v });
      },

      /** Aggiunge un punto (già in coordinate mondo), con snap alla griglia visibile. */
      addPoint: (worldPoint, snapSize) => {
        const { stage1Polygon, minClearance } = get();
        if (stage1Polygon.closed) return;
        const snapped = snapClamp(worldPoint, snapSize ?? stage1Polygon.gridSize);
        const last = stage1Polygon.points[stage1Polygon.points.length - 1];
        // Ignora click sullo stesso punto (doppio click accidentale)
        if (last && last.x === snapped.x && last.y === snapped.y) return;
        // Distanza minima da punti e segmenti esistenti
        if (violatesClearance(stage1Polygon.points, snapped, minClearance)) return;
        set({
          stage1Polygon: {
            ...stage1Polygon,
            points: [...stage1Polygon.points, snapped],
          },
        });
      },

      /** Rimuove l'ultimo punto (Esc). */
      removeLastPoint: () => {
        const { stage1Polygon } = get();
        if (stage1Polygon.closed || stage1Polygon.points.length === 0) return;
        set({
          stage1Polygon: {
            ...stage1Polygon,
            points: stage1Polygon.points.slice(0, -1),
          },
        });
      },

      /**
       * Rimuove un punto qualsiasi (tasto destro sul vertice).
       * Un poligono chiuso non può scendere sotto i 3 punti.
       */
      removePoint: (index) => {
        const { stage1Polygon } = get();
        const pts = stage1Polygon.points;
        const n = pts.length;
        if (index < 0 || index >= n) return;
        if (stage1Polygon.closed && n <= 3) return;
        const next = pts.slice();
        next.splice(index, 1);
        // Rimappa startSegment: rimuovere il punto k fonde i segmenti k-1 e k.
        let s = stage1Polygon.startSegment;
        if (s != null) {
          if (index === 0) {
            // fusione tra il segmento di chiusura (n-1) e il segmento 0
            s = s === 0 || s === n - 1 ? next.length - 1 : s - 1;
          } else if (s === index - 1 || s === index) {
            s = index - 1; // il segmento fuso
          } else if (s > index) {
            s = s - 1;
          }
          if (s >= next.length) s = next.length - 1;
        }
        set({ stage1Polygon: { ...stage1Polygon, points: next, startSegment: s } });
      },

      /**
       * Chiude il poligono se valido (≥3 punti, nessuna self-intersection).
       * Il verso di default è quello con cui l'utente ha disegnato
       * (winding via area con segno, y-up: positiva = antiorario).
       */
      closePolygon: () => {
        const { stage1Polygon } = get();
        if (stage1Polygon.closed) return false;
        if (!canClose(stage1Polygon.points)) return false;
        const defaultDirection =
          signedArea(stage1Polygon.points) > 0 ? 'ccw' : 'cw';
        set({
          stage1Polygon: {
            ...stage1Polygon,
            closed: true,
            direction: stage1Polygon.direction ?? defaultDirection,
          },
        });
        return true;
      },

      /**
       * Imposta il segmento di start/finish (dal menu contestuale).
       * Rifiutato se il segmento è più corto di minStartLength.
       */
      setStartSegment: (segIndex) => {
        const { stage1Polygon, minStartLength } = get();
        const pts = stage1Polygon.points;
        const n = pts.length;
        if (!stage1Polygon.closed || segIndex < 0 || segIndex >= n) return;
        const segLen = dist(pts[segIndex], pts[(segIndex + 1) % n]);
        if (segLen < minStartLength) return;
        set({ stage1Polygon: { ...stage1Polygon, startSegment: segIndex } });
      },

      /** Imposta il verso di percorrenza: 'cw' (orario) | 'ccw' (antiorario). */
      setDirection: (direction) => {
        if (direction !== 'cw' && direction !== 'ccw') return;
        const { stage1Polygon } = get();
        set({ stage1Polygon: { ...stage1Polygon, direction } });
      },

      /** Riapre un poligono chiuso per continuare l'editing. */
      reopenPolygon: () => {
        const { stage1Polygon } = get();
        if (!stage1Polygon.closed) return;
        set({ stage1Polygon: { ...stage1Polygon, closed: false } });
      },

      /** Reset completo del disegno. */
      resetPolygon: () => {
        const { stage1Polygon } = get();
        set({ stage1Polygon: { ...initialPolygon, gridSize: stage1Polygon.gridSize } });
      },

      setGridSize: (gridSize) => {
        if (!(gridSize > 0)) return;
        const { stage1Polygon } = get();
        set({ stage1Polygon: { ...stage1Polygon, gridSize } });
      },

      // ---- Fase 2: raccordi (fillet) ----

      /**
       * Allinea la Fase 2 al poligono di Fase 1. Se l'impronta dello stage1 è
       * cambiata (o force=true) i bracci override vengono azzerati (gli indici
       * dei vertici non sono più affidabili); altrimenti non fa nulla.
       */
      generateSplineFromPolygon: (force = false) => {
        const { stage1Polygon, stage2Spline } = get();
        if (!stage1Polygon.closed || stage1Polygon.startSegment == null) return;
        const fp = computeStage1Fingerprint(stage1Polygon);
        if (!force && stage2Spline.sourceFingerprint === fp) return;
        set({
          stage2Spline: { ...stage2Spline, arms: {}, sourceFingerprint: fp },
        });
      },

      /** Braccio di default delle stondature (m). */
      setDefaultArm: (v) => {
        if (!(v >= 1)) return;
        const { stage2Spline } = get();
        set({ stage2Spline: { ...stage2Spline, defaultArm: v } });
      },

      /**
       * Imposta un braccio della curva sul vertice `origIndex`.
       * side: 'in' (prima del vertice) | 'out' (dopo il vertice).
       */
      setCornerArm: (origIndex, side, len) => {
        if (side !== 'in' && side !== 'out') return;
        if (!(len >= 1)) return;
        const { stage2Spline } = get();
        const prev = stage2Spline.arms[origIndex] ?? {};
        set({
          stage2Spline: {
            ...stage2Spline,
            arms: {
              ...stage2Spline.arms,
              [origIndex]: { ...prev, [side]: Math.round(len) },
            },
          },
        });
      },

      /** Rimuove gli override: la curva torna ai bracci di default. */
      resetCornerArms: (origIndex) => {
        const { stage2Spline } = get();
        if (!(origIndex in stage2Spline.arms)) return;
        const arms = { ...stage2Spline.arms };
        delete arms[origIndex];
        set({ stage2Spline: { ...stage2Spline, arms } });
      },

      // ---- Fase 3A: sezione, banking, altimetria ----

      /** Parametro della sezione fissa (trackWidth/lineWidth/grassLeft/grassRight). */
      setSectionParam: (key, v) => {
        const { stage3FlowTube } = get();
        if (!(key in stage3FlowTube.section)) return;
        const min = key === 'lineWidth' ? 0.05 : 1;
        if (!(v >= min)) return;
        set({
          stage3FlowTube: {
            ...stage3FlowTube,
            section: { ...stage3FlowTube.section, [key]: v },
          },
        });
      },

      /** Parametro del rumore altimetrico. */
      setNoiseParam: (key, v) => {
        const { stage3FlowTube } = get();
        if (!(key in stage3FlowTube.elevationNoise)) return;
        if (typeof v !== 'number' || !Number.isFinite(v)) return;
        set({
          stage3FlowTube: {
            ...stage3FlowTube,
            elevationNoise: { ...stage3FlowTube.elevationNoise, [key]: v },
          },
        });
      },

      /** Nuovo seed casuale per l'altimetria. */
      newNoiseSeed: () => {
        const { stage3FlowTube } = get();
        set({
          stage3FlowTube: {
            ...stage3FlowTube,
            elevationNoise: {
              ...stage3FlowTube.elevationNoise,
              seed: Math.floor(Math.random() * 2 ** 31),
            },
          },
        });
      },

      /**
       * Imposta/aggiorna il banking di una curva (dalla mappa).
       * patch: {angleDeg?, rampBefore?, rampAfter?} (gradi, metri).
       */
      setCornerBanking: (origIndex, patch) => {
        const { stage3FlowTube } = get();
        const prev = stage3FlowTube.cornerBanking[origIndex] ?? {
          angleDeg: 0,
          rampBefore: 100,
          rampAfter: 100,
        };
        const next = { ...prev, ...patch };
        next.angleDeg = Math.min(30, Math.max(-30, next.angleDeg));
        next.rampBefore = Math.max(0, next.rampBefore);
        next.rampAfter = Math.max(0, next.rampAfter);
        set({
          stage3FlowTube: {
            ...stage3FlowTube,
            cornerBanking: {
              ...stage3FlowTube.cornerBanking,
              [origIndex]: next,
            },
          },
        });
      },

      /** Azzera il banking di una curva. */
      removeCornerBanking: (origIndex) => {
        const { stage3FlowTube } = get();
        if (!(origIndex in stage3FlowTube.cornerBanking)) return;
        const cornerBanking = { ...stage3FlowTube.cornerBanking };
        delete cornerBanking[origIndex];
        set({ stage3FlowTube: { ...stage3FlowTube, cornerBanking } });
      },

      /**
       * Sposta il punto `index`. snap=false durante il drag (movimento fluido),
       * snap=true al rilascio (aggancio alla griglia).
       */
      updatePoint: (index, worldPoint, snap = true, snapSize) => {
        const { stage1Polygon } = get();
        const pts = stage1Polygon.points;
        if (index < 0 || index >= pts.length) return;
        const p = snap
          ? snapClamp(worldPoint, snapSize ?? stage1Polygon.gridSize)
          : clampToWorld(worldPoint);
        const next = pts.slice();
        next[index] = p;
        set({ stage1Polygon: { ...stage1Polygon, points: next } });
      },

      /**
       * Inserisce un nuovo punto sul segmento `segIndex`
       * (segmento i: points[i] → points[(i+1) % n]; n-1 = segmento di chiusura).
       * Il punto viene PROIETTATO sul segmento (niente snap a griglia: lo
       * snap poteva spostarlo fuori dal segmento — deve rimanerci sopra).
       */
      insertPointOnSegment: (segIndex, worldPoint) => {
        const { stage1Polygon, minClearance } = get();
        const pts = stage1Polygon.points;
        if (segIndex < 0 || segIndex >= pts.length) return;
        const a = pts[segIndex];
        const b = pts[(segIndex + 1) % pts.length];
        const proj = projectPointOnSegment(clampToWorld(worldPoint), a, b);
        // centimetro di risoluzione, resta comunque sul segmento
        const snapped = {
          x: Math.round(proj.x * 100) / 100,
          y: Math.round(proj.y * 100) / 100,
        };
        // niente duplicati (o quasi-duplicati) con gli estremi del segmento
        if (dist(snapped, a) < 1e-6 || dist(snapped, b) < 1e-6) return;
        // Distanza minima da punti/segmenti (escluso il segmento su cui si inserisce)
        if (
          violatesClearance(pts, snapped, minClearance, {
            closed: stage1Polygon.closed,
            excludeSegment: segIndex,
          })
        ) {
          return;
        }
        const next = pts.slice();
        next.splice(segIndex + 1, 0, snapped);
        // Rimappa startSegment: l'inserimento sul segmento i lo divide in i e
        // i+1; lo start resta sulla prima metà, gli indici successivi scalano.
        let s = stage1Polygon.startSegment;
        if (s != null && s > segIndex) s = s + 1;
        set({ stage1Polygon: { ...stage1Polygon, points: next, startSegment: s } });
      },
    }),
    {
      // Undo/redo traccia i dati delle fasi (non zoom/pan né la fase attiva).
      // resampledArcLength NON è nello store: è derivato puro dai CP
      // (calcolato con useMemo nei componenti) — l'undo resta consistente.
      partialize: (state) => ({
        stage1Polygon: state.stage1Polygon,
        stage2Spline: state.stage2Spline,
        stage3FlowTube: state.stage3FlowTube,
      }),
    }
  )
);

// NOTA: niente selettori che costruiscono nuovi oggetti/array — con zustand
// causerebbero re-render infiniti (getSnapshot non cachato). I valori derivati
// (conflitti, canClose, …) si calcolano nei componenti con useMemo, chiamando
// direttamente le funzioni pure di geometry/polygon.js.

// Solo in dev: store accessibile dalla console per debug/collaudo.
if (import.meta.env.DEV) {
  window.__trackStore = useTrackStore;
}
