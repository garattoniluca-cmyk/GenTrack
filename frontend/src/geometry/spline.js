// spline.js — Fase 2: Catmull-Rom centripeta CHIUSA + arc-length resampling.
// Logica pura, NO React, NO Konva, NO three (2D; three arriverà col 3D).
//
// Convenzioni:
// - control points: [{x, y}] (l'id/tension dello store non serve qui)
// - la spline è sempre chiusa (circuito)
// - t = parametro globale [0,1): (indiceSegmento + u) / nCP
// - s = arc-length normalizzato [0,1); s=0 sul PRIMO control point, che per
//   costruzione (generateControlPointsFromPolygon) è la metà del rettilineo
//   di start; s cresce nel verso di percorrenza (ordine dei CP)

import { dist, signedArea } from './polygon.js';

const EPS = 1e-9;

/**
 * Punto sulla Catmull-Rom CENTRIPETA (alpha=0.5) tra p1 e p2, u ∈ [0,1].
 * Barry-Goldman. La variante centripeta evita cuspidi e auto-loop.
 */
export function catmullRomPoint(p0, p1, p2, p3, u, alpha = 0.5) {
  const t0 = 0;
  const t1 = t0 + Math.max(Math.pow(dist(p0, p1), alpha), EPS);
  const t2 = t1 + Math.max(Math.pow(dist(p1, p2), alpha), EPS);
  const t3 = t2 + Math.max(Math.pow(dist(p2, p3), alpha), EPS);
  const t = t1 + u * (t2 - t1);

  const lerp = (a, b, ta, tb) => {
    const f = (t - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  };
  const A1 = lerp(p0, p1, t0, t1);
  const A2 = lerp(p1, p2, t1, t2);
  const A3 = lerp(p2, p3, t2, t3);
  const B1 = lerp(A1, A2, t0, t2);
  const B2 = lerp(A2, A3, t1, t3);
  return lerp(B1, B2, t1, t2);
}

/**
 * Campionamento denso della spline chiusa: per ogni tratto CP i → i+1,
 * samplesPerSeg punti. Ritorna [{t, x, y}] (senza il punto di chiusura
 * duplicato) — length = n * samplesPerSeg.
 */
export function sampleClosedSpline(cps, samplesPerSeg = 24) {
  const n = cps.length;
  if (n < 3) return [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = cps[(i - 1 + n) % n];
    const p1 = cps[i];
    const p2 = cps[(i + 1) % n];
    const p3 = cps[(i + 2) % n];
    for (let j = 0; j < samplesPerSeg; j++) {
      const u = j / samplesPerSeg;
      const pt = catmullRomPoint(p0, p1, p2, p3, u);
      out.push({ t: (i + u) / n, x: pt.x, y: pt.y });
    }
  }
  return out;
}

/**
 * Ricampionamento arc-length (obbligatorio dopo ogni modifica — brief §4.2):
 * costruisce la tabella t → arcLength per campionamento denso e la inverte
 * per interpolazione lineare, producendo sample EQUIDISTANTI lungo la
 * lunghezza reale. Il numero di sample è adattivo: uno ogni `spacing` metri,
 * clampato in [minCount, maxCount].
 *
 * Ritorna { totalLength, sampleCount, samples: [{t, s, x, y}] } con
 * s = idx/sampleCount ∈ [0,1) (il sample s=1 coincide con s=0: curva chiusa).
 */
export function resampleClosedSpline(
  cps,
  { spacing = 5, minCount = 200, maxCount = 2000, samplesPerSeg = 24 } = {}
) {
  if (!cps || cps.length < 3) {
    return { totalLength: 0, sampleCount: 0, samples: [] };
  }
  const dense = sampleClosedSpline(cps, samplesPerSeg);
  // chiusura: aggiungi il ritorno al primo punto per la lunghezza totale
  const ring = [...dense, { ...dense[0], t: 1 }];

  const cum = [0];
  for (let k = 1; k < ring.length; k++) {
    cum.push(cum[k - 1] + dist(ring[k - 1], ring[k]));
  }
  const totalLength = cum[cum.length - 1];
  if (totalLength < EPS) return { totalLength: 0, sampleCount: 0, samples: [] };

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
      t: ring[k].t + f * (ring[k + 1].t - ring[k].t),
      s: idx / sampleCount,
      x: ring[k].x + f * (ring[k + 1].x - ring[k].x),
      y: ring[k].y + f * (ring[k + 1].y - ring[k].y),
    });
  }
  return { totalLength, sampleCount, samples };
}

/**
 * Genera i control point iniziali della Fase 2 dal poligono della Fase 1.
 * - il PRIMO CP è la metà del segmento di start (→ s=0 esattamente lì)
 * - i CP successivi sono i vertici del poligono nell'ordine del VERSO di
 *   percorrenza scelto ('cw'/'ccw'), indipendentemente dal winding disegnato
 * Output: [{id, x, y, tension}] — n+1 control point.
 */
export function generateControlPointsFromPolygon(points, startSegment, direction) {
  const n = points.length;
  if (n < 3 || startSegment == null || startSegment < 0 || startSegment >= n) {
    return [];
  }
  const a = points[startSegment];
  const b = points[(startSegment + 1) % n];
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

  const windingCcw = signedArea(points) > 0;
  const forward = (direction === 'ccw') === windingCcw;

  const ordered = [mid];
  if (forward) {
    // percorri nell'ordine dei punti: b, poi avanti fino ad a
    for (let i = 1; i <= n; i++) ordered.push(points[(startSegment + i) % n]);
  } else {
    // percorri in ordine inverso: a, poi indietro fino a b
    for (let i = 0; i < n; i++) ordered.push(points[(startSegment - i + n) % n]);
  }
  return ordered.map((p, i) => ({ id: `cp_${i}`, x: p.x, y: p.y, tension: 0.5 }));
}
