// polygon.js — validazione poligono Fase 1. Logica pura, NO React, NO Konva.
// Convenzione coordinate: unità mondo in metri, y-up (D-011).
// Self-intersection: brute-force O(n²), adeguato per n < 100 punti (brief §4.1).

const EPS = 1e-9;

/** Snap di un punto alla griglia. */
export function snapToGrid(point, gridSize) {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

/** Orientazione del triangolo (a,b,c): >0 antiorario, <0 orario, 0 collineare. */
export function orient(a, b, c) {
  const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (Math.abs(v) < EPS) return 0;
  return Math.sign(v);
}

/** True se p giace sul segmento [a,b] (assumendo a,b,p collineari). */
function onSegment(a, b, p) {
  return (
    p.x >= Math.min(a.x, b.x) - EPS &&
    p.x <= Math.max(a.x, b.x) + EPS &&
    p.y >= Math.min(a.y, b.y) - EPS &&
    p.y <= Math.max(a.y, b.y) + EPS
  );
}

/**
 * Test di intersezione tra i segmenti [p1,p2] e [p3,p4].
 * Include i casi degeneri: sovrapposizione collineare e contatto agli estremi.
 * I chiamanti escludono a monte le coppie adiacenti (che condividono un vertice
 * legittimamente).
 */
export function segmentsIntersect(p1, p2, p3, p4) {
  const o1 = orient(p1, p2, p3);
  const o2 = orient(p1, p2, p4);
  const o3 = orient(p3, p4, p1);
  const o4 = orient(p3, p4, p2);

  if (o1 !== o2 && o3 !== o4) return true; // intersezione propria

  // Casi collineari: contatto o sovrapposizione
  if (o1 === 0 && onSegment(p1, p2, p3)) return true;
  if (o2 === 0 && onSegment(p1, p2, p4)) return true;
  if (o3 === 0 && onSegment(p3, p4, p1)) return true;
  if (o4 === 0 && onSegment(p3, p4, p2)) return true;

  return false;
}

/** Segmenti consecutivi della polyline aperta: [{a, b, index}], index = indice del primo punto. */
function polylineSegments(points) {
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) {
    segs.push({ a: points[i], b: points[i + 1], index: i });
  }
  return segs;
}

/**
 * Trova le self-intersection della polyline aperta `points`.
 * Ritorna array di coppie [i, j] di indici-segmento in conflitto (i < j).
 * Le coppie adiacenti (che condividono un vertice) sono escluse.
 */
export function findSelfIntersections(points) {
  const segs = polylineSegments(points);
  const conflicts = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 2; j < segs.length; j++) {
      if (segmentsIntersect(segs[i].a, segs[i].b, segs[j].a, segs[j].b)) {
        conflicts.push([i, j]);
      }
    }
  }
  return conflicts;
}

/**
 * Conflitti del segmento candidato [ultimo punto → candidate] (rubber band o
 * prossimo click) contro i segmenti esistenti, escluso l'adiacente (l'ultimo).
 * Ritorna gli indici-segmento in conflitto.
 */
export function candidateSegmentConflicts(points, candidate) {
  if (points.length < 2) return [];
  const last = points[points.length - 1];
  const segs = polylineSegments(points);
  const conflicts = [];
  for (const seg of segs) {
    if (seg.index === segs.length - 1) continue; // adiacente al candidato
    if (segmentsIntersect(last, candidate, seg.a, seg.b)) conflicts.push(seg.index);
  }
  return conflicts;
}

/**
 * Conflitti del segmento di chiusura [ultimo punto → primo punto] contro i
 * segmenti interni (esclusi il primo e l'ultimo, adiacenti alla chiusura).
 */
export function closingSegmentConflicts(points) {
  if (points.length < 3) return [];
  const first = points[0];
  const last = points[points.length - 1];
  const segs = polylineSegments(points);
  const conflicts = [];
  for (const seg of segs) {
    if (seg.index === 0 || seg.index === segs.length - 1) continue; // adiacenti
    if (segmentsIntersect(last, first, seg.a, seg.b)) conflicts.push(seg.index);
  }
  return conflicts;
}

/**
 * La polyline può chiudersi in poligono valido?
 * Richiede: almeno 3 punti, nessuna self-intersection interna, segmento di
 * chiusura senza conflitti.
 */
export function canClose(points) {
  return (
    points.length >= 3 &&
    findSelfIntersections(points).length === 0 &&
    closingSegmentConflicts(points).length === 0
  );
}

/** Distanza euclidea. */
export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Lunghezze dei segmenti della polyline: [{index, a, b, length}].
 * Se closed=true include il segmento di chiusura (index = n-1).
 */
export function segmentLengths(points, closed = false) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    out.push({ index: i, a: points[i], b: points[i + 1], length: dist(points[i], points[i + 1]) });
  }
  if (closed && points.length >= 3) {
    const last = points[points.length - 1];
    out.push({ index: points.length - 1, a: last, b: points[0], length: dist(last, points[0]) });
  }
  return out;
}

/** Lunghezza totale della polyline (o del perimetro se closed). */
export function totalLength(points, closed = false) {
  return segmentLengths(points, closed).reduce((sum, s) => sum + s.length, 0);
}

/**
 * Area con segno del poligono (shoelace). Con y-up: positiva = antiorario
 * (ccw), negativa = orario (cw). Usata per il verso di percorrenza.
 */
export function signedArea(points) {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Proiezione (clampata) del punto p sul segmento [a,b]. */
export function projectPointOnSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: a.x, y: a.y };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Distanza minima tra il punto p e il segmento [a,b]. */
export function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * True se `candidate` viola la distanza minima `minDist` da un punto o un
 * segmento esistente della polyline/poligono.
 * - closed: considera anche il segmento di chiusura
 * - excludeSegment: indice di segmento da ignorare (per l'inserimento di un
 *   punto SU quel segmento, che per costruzione gli è a distanza ~0)
 */
export function violatesClearance(
  points,
  candidate,
  minDist,
  { closed = false, excludeSegment = -1 } = {}
) {
  if (!(minDist > 0)) return false;
  for (const p of points) {
    if (dist(p, candidate) < minDist) return true;
  }
  for (const seg of segmentLengths(points, closed)) {
    if (seg.index === excludeSegment) continue;
    if (pointSegmentDistance(candidate, seg.a, seg.b) < minDist) return true;
  }
  return false;
}

/**
 * Self-intersections del poligono CHIUSO trattato come anello di n segmenti
 * (segmento i: points[i] → points[(i+1) % n]). Esclude le coppie adiacenti
 * cicliche. Ritorna coppie [i, j] con i < j.
 */
export function ringSelfIntersections(points) {
  const n = points.length;
  if (n < 3) return [];
  const conflicts = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adiacenti attraverso la chiusura
      if (
        segmentsIntersect(
          points[i], points[(i + 1) % n],
          points[j], points[(j + 1) % n]
        )
      ) {
        conflicts.push([i, j]);
      }
    }
  }
  return conflicts;
}
