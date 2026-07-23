// spline.js — Fase 2: mezzeria = RETTILINEI del poligono + STONDATURE
// ASIMMETRICHE agli angoli.
//
// Ogni curva è definita da DUE BRACCI indipendenti (D-021):
//   - braccio IN  (t1): distanza dal vertice lungo lo spigolo PRIMA del vertice
//   - braccio OUT (t2): distanza dal vertice lungo lo spigolo DOPO il vertice
// La curva è una Bézier QUADRATICA con controllo sul vertice:
//   B(u) = (1−u)²·T1 + 2u(1−u)·V + u²·T2,  T1 = V + d1·t1, T2 = V + d2·t2
// Tangente in T1 diretta come lo spigolo in ingresso e in T2 come quello in
// uscita → continuità C1 con i rettilinei per costruzione. Con t1 = t2 la
// stondatura è simmetrica; con bracci diversi si controllano ingresso e
// uscita di curva separatamente. Il raggio non è costante: si riporta il
// raggio MINIMO (R~) come riferimento.
//
// I rettilinei restano ESATTI (2 punti). s=0 a metà del segmento start,
// s cresce nel verso di percorrenza.

import { dist, signedArea } from './polygon.js';

const EPS = 1e-9;
/** Angolo (rad) oltre il quale un vertice è considerato collineare: nessuna curva. */
const COLLINEAR_EPS = 0.02;
/** Braccio minimo (m). */
export const MIN_ARM = 2;

const norm = (v) => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};

/**
 * Vertici nell'ordine di percorrenza: il primo è il vertice di FINE del
 * segmento start (il primo incontrato viaggiando da s=0), l'ultimo è quello
 * di inizio. Ogni vertice porta il suo indice originale (per i bracci).
 */
export function travelOrderedVertices(points, startSegment, direction) {
  const n = points.length;
  const windingCcw = signedArea(points) > 0;
  const forward = (direction === 'ccw') === windingCcw;
  const out = [];
  if (forward) {
    for (let i = 1; i <= n; i++) {
      const k = (startSegment + i) % n;
      out.push({ x: points[k].x, y: points[k].y, origIndex: k });
    }
  } else {
    for (let i = 0; i < n; i++) {
      const k = (startSegment - i + n) % n;
      out.push({ x: points[k].x, y: points[k].y, origIndex: k });
    }
  }
  return out;
}

/** Punto sulla Bézier quadratica del raccordo. */
export function cornerBezierPoint(T1, V, T2, u) {
  const a = (1 - u) * (1 - u);
  const b = 2 * u * (1 - u);
  const c = u * u;
  return {
    x: a * T1.x + b * V.x + c * T2.x,
    y: a * T1.y + b * V.y + c * T2.y,
  };
}

/** Raggio minimo della Bézier quadratica (campionamento della curvatura). */
function bezierMinRadius(T1, V, T2, steps = 32) {
  // B'(u) = 2[(1−u)(V−T1) + u(T2−V)];  B'' = 2[T1 − 2V + T2] (costante)
  const ax = 2 * (T1.x - 2 * V.x + T2.x);
  const ay = 2 * (T1.y - 2 * V.y + T2.y);
  let maxK = 0;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const dx = 2 * ((1 - u) * (V.x - T1.x) + u * (T2.x - V.x));
    const dy = 2 * ((1 - u) * (V.y - T1.y) + u * (T2.y - V.y));
    const speed2 = dx * dx + dy * dy;
    if (speed2 < EPS) continue;
    const k = Math.abs(dx * ay - dy * ax) / Math.pow(speed2, 1.5);
    if (k > maxK) maxK = k;
  }
  return maxK > EPS ? 1 / maxK : Infinity;
}

/**
 * Calcola le stondature per ogni vertice (in ordine di percorrenza).
 * arms: { [indiceVerticeOriginale]: {in: metri, out: metri} } override.
 * I bracci sono clampati a metà dello spigolo corrispondente (0.49): bracci
 * enormi su spigoli corti si riducono da soli.
 * ATTENZIONE ai versi: "in" = spigolo di provenienza NEL VERSO DI PERCORRENZA,
 * "out" = spigolo successivo.
 */
export function computeCorners(points, startSegment, direction, arms = {}, defaultArm = 60) {
  const verts = travelOrderedVertices(points, startSegment, direction);
  const n = verts.length;
  return verts.map((V, i) => {
    const P = verts[(i - 1 + n) % n]; // vertice precedente (nel verso)
    const N = verts[(i + 1) % n]; // vertice successivo
    const d1 = norm({ x: P.x - V.x, y: P.y - V.y }); // verso lo spigolo IN
    const d2 = norm({ x: N.x - V.x, y: N.y - V.y }); // verso lo spigolo OUT
    const cosPhi = Math.max(-1, Math.min(1, d1.x * d2.x + d1.y * d2.y));
    const phi = Math.acos(cosPhi);

    if (phi > Math.PI - COLLINEAR_EPS) {
      return { origIndex: V.origIndex, V, skip: true };
    }

    const lenIn = dist(P, V);
    const lenOut = dist(V, N);
    const maxT1 = 0.49 * lenIn;
    const maxT2 = 0.49 * lenOut;

    const o = arms[V.origIndex] ?? {};
    const t1 = Math.min(Math.max(MIN_ARM, o.in ?? defaultArm), maxT1);
    const t2 = Math.min(Math.max(MIN_ARM, o.out ?? defaultArm), maxT2);

    const T1 = { x: V.x + d1.x * t1, y: V.y + d1.y * t1 };
    const T2 = { x: V.x + d2.x * t2, y: V.y + d2.y * t2 };
    const minR = bezierMinRadius(T1, V, T2);
    const mid = cornerBezierPoint(T1, V, T2, 0.5);

    return {
      origIndex: V.origIndex,
      V,
      skip: false,
      d1,
      d2,
      t1,
      t2,
      maxT1,
      maxT2,
      T1,
      T2,
      minR,
      mid,
    };
  });
}

/**
 * Path completo della mezzeria + ricampionamento arc-length equidistante.
 * Il path parte e chiude su startMid (metà del segmento start): s=0 lì.
 * Rettilinei ESATTI (2 punti); curve Bézier campionate ogni ~2 m.
 *
 * Ritorna { totalLength, sampleCount, samples, corners, startMid }.
 */
export function resampleFilletPath(
  points,
  startSegment,
  direction,
  arms = {},
  defaultArm = 60,
  { spacing = 5, minCount = 200, maxCount = 12000 } = {}
) {
  const n = points?.length ?? 0;
  if (n < 3 || startSegment == null || startSegment < 0 || startSegment >= n) {
    return { totalLength: 0, sampleCount: 0, samples: [], corners: [], startMid: null };
  }
  const A = points[startSegment];
  const B = points[(startSegment + 1) % n];
  const startMid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };

  const corners = computeCorners(points, startSegment, direction, arms, defaultArm);

  const dense = [{ x: startMid.x, y: startMid.y }];
  const push = (p) => {
    const last = dense[dense.length - 1];
    if (dist(last, p) > 1e-6) dense.push({ x: p.x, y: p.y });
  };
  // indice denso di inizio/fine curva, per ricavare l'estensione in s di
  // ogni stondatura (serve al banking per-curva)
  const cornerMarks = new Map();
  for (const c of corners) {
    if (c.skip) {
      push(c.V);
      continue;
    }
    push(c.T1); // rettilineo fino all'inizio della stondatura
    const startIdx = dense.length - 1;
    const estLen = (dist(c.T1, c.V) + dist(c.V, c.T2) + dist(c.T1, c.T2)) / 2;
    const steps = Math.max(16, Math.ceil(estLen / 1)); // ~1 m per step sugli archi
    for (let k = 1; k <= steps; k++) {
      push(cornerBezierPoint(c.T1, c.V, c.T2, k / steps));
    }
    cornerMarks.set(c, { startIdx, endIdx: dense.length - 1 });
  }
  push(startMid); // chiusura lungo il rettilineo di start

  const cum = [0];
  for (let k = 1; k < dense.length; k++) {
    cum.push(cum[k - 1] + dist(dense[k - 1], dense[k]));
  }
  const totalLength = cum[cum.length - 1];
  if (totalLength < EPS) {
    return { totalLength: 0, sampleCount: 0, samples: [], corners, startMid };
  }

  // estensione in s di ogni curva: [sStart, sEnd]
  const cornersWithS = corners.map((c) => {
    const m = cornerMarks.get(c);
    if (!m) return c;
    return {
      ...c,
      sStart: cum[m.startIdx] / totalLength,
      sEnd: cum[m.endIdx] / totalLength,
    };
  });

  // DENSITÀ ADATTIVA (curve secche): il passo scende col raggio minimo delle
  // stondature (~R/12 → ≤ ~5° di curva per anello), clampato a [1 m, spacing].
  // Il campionamento resta UNIFORME (tutti i consumer lo assumono): un
  // tornante stretto infittisce l'intero anello di sample.
  let effSpacing = spacing;
  let minRadius = Infinity;
  for (const c of corners) {
    if (!c.skip && Number.isFinite(c.minR) && c.minR < minRadius) minRadius = c.minR;
  }
  if (Number.isFinite(minRadius)) {
    effSpacing = Math.max(1, Math.min(spacing, minRadius / 12));
  }

  const sampleCount = Math.max(
    minCount,
    Math.min(maxCount, Math.round(totalLength / effSpacing))
  );

  const samples = [];
  let k = 0;
  for (let idx = 0; idx < sampleCount; idx++) {
    const target = (idx / sampleCount) * totalLength;
    while (k < cum.length - 2 && cum[k + 1] < target) k++;
    const span = cum[k + 1] - cum[k];
    const f = span > EPS ? (target - cum[k]) / span : 0;
    samples.push({
      t: idx / sampleCount,
      s: idx / sampleCount,
      x: dense[k].x + f * (dense[k + 1].x - dense[k].x),
      y: dense[k].y + f * (dense[k + 1].y - dense[k].y),
    });
  }
  return { totalLength, sampleCount, samples, corners: cornersWithS, startMid };
}
