// config.js — costanti di progetto condivise tra store e componenti.

/** Metà estensione dell'area di lavoro: il canvas copre ±2500 m → 5000×5000 m. */
export const WORLD_HALF_EXTENT = 2500;

/** Dimensione griglia di default (metri). */
export const DEFAULT_GRID_SIZE = 10;

/** Limiti di zoom (px per metro). Al minimo l'intera area 5000 m è visibile. */
export const ZOOM_MIN = 0.08;
export const ZOOM_MAX = 200;

/** Zoom iniziale: ~1400 m visibili su un viewport tipico. */
export const ZOOM_DEFAULT = 0.5;

/** Clampa un punto dentro l'area di lavoro. */
export function clampToWorld(p) {
  return {
    x: Math.min(WORLD_HALF_EXTENT, Math.max(-WORLD_HALF_EXTENT, p.x)),
    y: Math.min(WORLD_HALF_EXTENT, Math.max(-WORLD_HALF_EXTENT, p.y)),
  };
}
