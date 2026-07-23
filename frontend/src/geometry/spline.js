// spline.js — Fase 2: mezzeria del circuito = RETTILINEI del poligono +
// RACCORDI AD ARCO tangenti agli angoli (fillet), con raggio per-curva.
//
// Sostituisce la Catmull-Rom pura (D-018): una spline passante per i vertici
// arrotondava tutto, distruggendo i rettilinei. Qui i rettilinei restano
// esatti al millimetro e ogni curva è un arco di raggio costante e regolabile
// — come nella progettazione reale dei circuiti. Continuità C1 garantita per
// costruzione (archi tangenti alle rette).
//
// Convenzioni:
// - points: vertici del poligono di Fase 1 (ordine di disegno)
// - la percorrenza parte dalla METÀ del segmento start (s=0) e segue il
//   verso scelto ('cw'/'ccw')
// - radii: { [indiceVerticeOriginale]: raggioMetri } override per-curva
// - output samples: [{t, s, x, y}] con s = arc-length normalizzato [0,1)
//   e t = frazione lineare lungo il path (qui coincide con s)

import { dist, signedArea } from './polygon.js';

const EPS = 1e-9;
/** Angolo (rad) oltre il quale un vertice è considerato collineare: nessun arco. */
const COLLINEAR_EPS = 0.02;

const norm = (v) => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};

/**
 * Vertici nell'ordine di percorrenza: il primo è il vertice di FINE del
 * segmento start (il primo incontrato viaggiando da s=0), l'ultimo è quello
 * di inizio. Ogni vertice porta il suo indice originale (per i raggi).
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

/**
 * Calcola i raccordi ad arco per ogni vertice (in ordine di percorrenza).
 * Per il vertice V con precedente P e successivo N:
 *   d1 = direzione V→P, d2 = direzione V→N, φ = angolo interno
 *   t  = R / tan(φ/2)   (distanza dei punti di tangenza da V)
 *   C  = V + bisettrice · R / sin(φ/2)
 * Il raggio richiesto viene CLAMPATO perché t non superi metà degli spigoli
 * adiacenti (maxR): raggi enormi su spigoli corti si riducono da soli.
 */
export function computeCorners(points, startSegment, direction, radii = {}, defaultRadius = 60) {
  const verts = travelOrderedVertices(points, startSegment, direction);
  const n = verts.length;
  return verts.map((V, i) => {
    const P = verts[(i - 1 + n) % n];
    const N = verts[(i + 1) % n];
    const d1 = norm({ x: P.x - V.x, y: P.y - V.y });
    const d2 = norm({ x: N.x - V.x, y: N.y - V.y });
    const cosPhi = Math.max(-1, Math.min(1, d1.x * d2.x + d1.y * d2.y));
    const phi = Math.acos(cosPhi);

    if (phi > Math.PI - COLLINEAR_EPS) {
      // quasi collineare: nessun arco, si passa per il vertice
      return { origIndex: V.origIndex, V, skip: true, R: 0 };
    }

    const sinHalf = Math.sin(phi / 2);
    const tanHalf = Math.tan(phi / 2);
    const lenIn = dist(P, V);
    const lenOut = dist(V, N);
    const maxT = 0.49 * Math.min(lenIn, lenOut);
    const maxR = maxT * tanHalf;

    const requestedR = Math.max(1, radii[V.origIndex] ?? defaultRadius);
    const R = Math.min(requestedR, maxR);
    const t = R / tanHalf;

    const bis = norm({ x: d1.x + d2.x, y: d1.y + d2.y });
    const C = { x: V.x + (bis.x * R) / sinHalf, y: V.y + (bis.y * R) / sinHalf };
    const T1 = { x: V.x + d1.x * t, y: V.y + d1.y * t };
    const T2 = { x: V.x + d2.x * t, y: V.y + d2.y * t };

    const a1 = Math.atan2(T1.y - C.y, T1.x - C.x);
    const a2 = Math.atan2(T2.y - C.y, T2.x - C.x);
    let sweep = a2 - a1;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;

    const midAng = a1 + sweep / 2;
    const arcMid = { x: C.x + Math.cos(midAng) * R, y: C.y + Math.sin(midAng) * R };

    return {
      origIndex: V.origIndex,
      V,
      skip: false,
      R,
      requestedR,
      maxR,
      bis,
      sinHalf,
      C,
      T1,
      T2,
      a1,
      sweep,
      arcMid,
    };
  });
}

/**
 * Path completo della mezzeria + ricampionamento arc-length equidistante.
 * Il path parte e chiude su startMid (metà del segmento start): s=0 lì.
 * I rettilinei sono ESATTI (2 punti), gli archi campionati ogni ~2 m.
 *
 * Ritorna { totalLength, sampleCount, samples, corners, startMid }.
 */
export function resampleFilletPath(
  points,
  startSegment,
  direction,
  radii = {},
  defaultRadius = 60,
  { spacing = 5, minCount = 200, maxCount = 2000 } = {}
) {
  const n = points?.length ?? 0;
  if (n < 3 || startSegment == null || startSegment < 0 || startSegment >= n) {
    return { totalLength: 0, sampleCount: 0, samples: [], corners: [], startMid: null };
  }
  const A = points[startSegment];
  const B = points[(startSegment + 1) % n];
  const startMid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };

  const corners = computeCorners(points, startSegment, direction, radii, defaultRadius);

  // costruzione del path denso: startMid → [rettilineo, arco]* → startMid
  const dense = [{ x: startMid.x, y: startMid.y }];
  const push = (p) => {
    const last = dense[dense.length - 1];
    if (dist(last, p) > 1e-6) dense.push({ x: p.x, y: p.y });
  };
  for (const c of corners) {
    if (c.skip) {
      push(c.V);
      continue;
    }
    push(c.T1); // rettilineo fino al punto di tangenza (esatto: 2 punti)
    const arcLen = Math.abs(c.sweep) * c.R;
    const steps = Math.max(8, Math.ceil(arcLen / 2));
    for (let k = 1; k <= steps; k++) {
      const ang = c.a1 + c.sweep * (k / steps);
      push({ x: c.C.x + Math.cos(ang) * c.R, y: c.C.y + Math.sin(ang) * c.R });
    }
  }
  push(startMid); // chiusura lungo il rettilineo di start

  // tabella lunghezze cumulative + inversione per sample equidistanti
  const cum = [0];
  for (let k = 1; k < dense.length; k++) {
    cum.push(cum[k - 1] + dist(dense[k - 1], dense[k]));
  }
  const totalLength = cum[cum.length - 1];
  if (totalLength < EPS) {
    return { totalLength: 0, sampleCount: 0, samples: [], corners, startMid };
  }

  const sampleCount = Math.max(
    minCount,
    Math.min(maxCount, Math.round(totalLength / spacing))
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
  return { totalLength, sampleCount, samples, corners, startMid };
}

/**
 * Raggio a partire dalla distanza della maniglia (arcMid) dal vertice,
 * misurata lungo la bisettrice: dist(V, arcMid) = R·(1−sin(φ/2))/sin(φ/2).
 * Inversa usata dal drag della maniglia di curva.
 */
export function radiusFromHandleDistance(d, sinHalf) {
  if (1 - sinHalf < EPS) return Infinity;
  return (d * sinHalf) / (1 - sinHalf);
}
