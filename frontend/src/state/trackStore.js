// trackStore.js — Zustand store, unica fonte di verità (D-007, brief §2).
// Fase 1: solo stage1_polygon. Le fasi successive aggiungeranno le loro slice.
// Convenzione coordinate: metri, y-up (D-011).

import { create } from 'zustand';
import { withHistory } from './historyMiddleware.js';
import { snapToGrid, canClose } from '../geometry/polygon.js';
import { DEFAULT_GRID_SIZE, clampToWorld } from '../config.js';

const initialPolygon = {
  points: [], // [{x, y}] in metri, y-up
  gridSize: DEFAULT_GRID_SIZE,
  closed: false,
};

/**
 * Snap alla griglia + clamp dentro l'area di lavoro 5000×5000 m.
 * `snapSize` è il passo di griglia VISIBILE (può essere più grosso di
 * gridSize quando si è zoomati indietro): lo snap segue ciò che si vede.
 */
const snapClamp = (p, snapSize) => snapToGrid(clampToWorld(p), snapSize);

export const useTrackStore = create(
  withHistory(
    (set, get) => ({
      stage1Polygon: initialPolygon,

      /** Aggiunge un punto (già in coordinate mondo), con snap alla griglia visibile. */
      addPoint: (worldPoint, snapSize) => {
        const { stage1Polygon } = get();
        if (stage1Polygon.closed) return;
        const snapped = snapClamp(worldPoint, snapSize ?? stage1Polygon.gridSize);
        const last = stage1Polygon.points[stage1Polygon.points.length - 1];
        // Ignora click sullo stesso punto (doppio click accidentale)
        if (last && last.x === snapped.x && last.y === snapped.y) return;
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

      /** Chiude il poligono se valido (≥3 punti, nessuna self-intersection). */
      closePolygon: () => {
        const { stage1Polygon } = get();
        if (stage1Polygon.closed) return false;
        if (!canClose(stage1Polygon.points)) return false;
        set({ stage1Polygon: { ...stage1Polygon, closed: true } });
        return true;
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
       * Inserisce un nuovo punto (snappato) sul segmento `segIndex`
       * (segmento i: points[i] → points[(i+1) % n]; n-1 = segmento di chiusura).
       */
      insertPointOnSegment: (segIndex, worldPoint, snapSize) => {
        const { stage1Polygon } = get();
        const pts = stage1Polygon.points;
        if (segIndex < 0 || segIndex >= pts.length) return;
        const snapped = snapClamp(worldPoint, snapSize ?? stage1Polygon.gridSize);
        const a = pts[segIndex];
        const b = pts[(segIndex + 1) % pts.length];
        // niente duplicati con gli estremi del segmento
        if (
          (a.x === snapped.x && a.y === snapped.y) ||
          (b.x === snapped.x && b.y === snapped.y)
        ) {
          return;
        }
        const next = pts.slice();
        next.splice(segIndex + 1, 0, snapped);
        set({ stage1Polygon: { ...stage1Polygon, points: next } });
      },
    }),
    {
      // Undo/redo traccia solo il poligono (non lo zoom/pan della vista)
      partialize: (state) => ({ stage1Polygon: state.stage1Polygon }),
    }
  )
);

// NOTA: niente selettori che costruiscono nuovi oggetti/array — con zustand
// causerebbero re-render infiniti (getSnapshot non cachato). I valori derivati
// (conflitti, canClose, …) si calcolano nei componenti con useMemo, chiamando
// direttamente le funzioni pure di geometry/polygon.js.
