// Test invarianti polygon.js — vedi TESTING.md
import { describe, it, expect } from 'vitest';
import {
  snapToGrid,
  segmentsIntersect,
  findSelfIntersections,
  candidateSegmentConflicts,
  closingSegmentConflicts,
  canClose,
  segmentLengths,
  totalLength,
  ringSelfIntersections,
  pointSegmentDistance,
  violatesClearance,
  signedArea,
} from './polygon.js';

const P = (x, y) => ({ x, y });

describe('snapToGrid', () => {
  it('arrotonda alla cella più vicina', () => {
    expect(snapToGrid(P(1.4, 2.6), 1)).toEqual(P(1, 3));
    expect(snapToGrid(P(1.2, 1.2), 0.5)).toEqual(P(1, 1));
    expect(snapToGrid(P(-0.6, -0.4), 1)).toEqual(P(-1, -0));
  });
});

describe('segmentsIntersect', () => {
  it('rileva intersezione propria (croce)', () => {
    expect(segmentsIntersect(P(0, 0), P(2, 2), P(0, 2), P(2, 0))).toBe(true);
  });
  it('segmenti separati non intersecano', () => {
    expect(segmentsIntersect(P(0, 0), P(1, 0), P(0, 1), P(1, 1))).toBe(false);
  });
  it('segmenti paralleli non collineari non intersecano', () => {
    expect(segmentsIntersect(P(0, 0), P(2, 0), P(0, 1), P(2, 1))).toBe(false);
  });
  it('rileva sovrapposizione collineare', () => {
    expect(segmentsIntersect(P(0, 0), P(2, 0), P(1, 0), P(3, 0))).toBe(true);
  });
  it('collineari disgiunti non intersecano', () => {
    expect(segmentsIntersect(P(0, 0), P(1, 0), P(2, 0), P(3, 0))).toBe(false);
  });
  it('rileva contatto a T (estremo su segmento)', () => {
    expect(segmentsIntersect(P(0, 0), P(2, 0), P(1, -1), P(1, 0))).toBe(true);
  });
});

describe('findSelfIntersections', () => {
  it('polyline semplice: nessun conflitto', () => {
    // quadrato aperto
    expect(findSelfIntersections([P(0, 0), P(4, 0), P(4, 4), P(0, 4)])).toEqual([]);
  });
  it('polyline a farfalla: conflitto con indici corretti', () => {
    // seg0: (0,0)→(4,0); seg1: (4,0)→(0,3); seg2: (0,3)→(4,3) — nessun incrocio
    // seg3: (4,3)→(2,-1) incrocia seg0 e seg1
    const pts = [P(0, 0), P(4, 0), P(0, 3), P(4, 3), P(2, -1)];
    const conflicts = findSelfIntersections(pts);
    expect(conflicts).toContainEqual([0, 3]);
    expect(conflicts.every(([i, j]) => j - i >= 2)).toBe(true);
  });
  it('adiacenti che condividono un vertice NON sono conflitto', () => {
    expect(findSelfIntersections([P(0, 0), P(2, 0), P(2, 2)])).toEqual([]);
  });
});

describe('candidateSegmentConflicts', () => {
  const pts = [P(0, 0), P(4, 0), P(4, 4)]; // seg0 in basso, seg1 a destra
  it('candidato che attraversa seg0 è in conflitto', () => {
    expect(candidateSegmentConflicts(pts, P(2, -2))).toEqual([0]);
  });
  it('candidato libero: nessun conflitto', () => {
    expect(candidateSegmentConflicts(pts, P(0, 4))).toEqual([]);
  });
  it('con meno di 2 punti nessun conflitto possibile', () => {
    expect(candidateSegmentConflicts([P(0, 0)], P(1, 1))).toEqual([]);
  });
});

describe('closingSegmentConflicts / canClose', () => {
  it('quadrato: chiusura valida', () => {
    const sq = [P(0, 0), P(4, 0), P(4, 4), P(0, 4)];
    expect(closingSegmentConflicts(sq)).toEqual([]);
    expect(canClose(sq)).toBe(true);
  });
  it('meno di 3 punti: chiusura impossibile', () => {
    expect(canClose([P(0, 0), P(1, 0)])).toBe(false);
  });
  it('chiusura che attraversa un segmento interno è bloccata', () => {
    // La chiusura (ultimo→primo) taglia seg1
    const pts = [P(0, 0), P(4, 0), P(4, 4), P(6, 2), P(6, -2)];
    // chiusura: (6,-2)→(0,0); seg1: (4,0)→(4,4)? no... verifichiamo il taglio di seg1
    // (6,-2)→(0,0) passa per y = -x/3: a x=4, y≈-1.33 → non taglia seg1 (x=4, y∈[0,4]).
    // Costruiamo un caso certo: spirale che si chiude attraversando seg1.
    const spiral = [P(0, 0), P(4, 0), P(4, 4), P(2, 4), P(2, 2), P(6, 2)];
    // chiusura: (6,2)→(0,0) attraversa seg1 (4,0)→(4,4) in (4, 4/3)
    expect(closingSegmentConflicts(spiral).length).toBeGreaterThan(0);
    expect(canClose(spiral)).toBe(false);
    expect(pts.length).toBeGreaterThan(0); // silence unused
  });
  it('polyline con self-intersection interna non può chiudersi', () => {
    const butterfly = [P(0, 0), P(4, 0), P(0, 3), P(4, 3), P(2, -1)];
    expect(canClose(butterfly)).toBe(false);
  });
});

describe('segmentLengths / totalLength', () => {
  const square = [P(0, 0), P(4, 0), P(4, 4), P(0, 4)];
  it('polyline aperta: n-1 segmenti, somma corretta', () => {
    const segs = segmentLengths(square, false);
    expect(segs.length).toBe(3);
    expect(segs.map((s) => s.length)).toEqual([4, 4, 4]);
    expect(totalLength(square, false)).toBe(12);
  });
  it('poligono chiuso: n segmenti incluso quello di chiusura', () => {
    const segs = segmentLengths(square, true);
    expect(segs.length).toBe(4);
    expect(segs[3].index).toBe(3);
    expect(totalLength(square, true)).toBe(16);
  });
  it('lunghezza diagonale corretta', () => {
    expect(totalLength([P(0, 0), P(3, 4)], false)).toBe(5);
  });
  it('meno di 3 punti: nessun segmento di chiusura', () => {
    expect(segmentLengths([P(0, 0), P(1, 0)], true).length).toBe(1);
  });
});

describe('signedArea', () => {
  it('quadrato in ordine antiorario (y-up): area positiva', () => {
    expect(signedArea([P(0, 0), P(4, 0), P(4, 4), P(0, 4)])).toBe(16);
  });
  it('stesso quadrato in ordine orario: area negativa', () => {
    expect(signedArea([P(0, 0), P(0, 4), P(4, 4), P(4, 0)])).toBe(-16);
  });
  it('triangolo: metà base per altezza', () => {
    expect(Math.abs(signedArea([P(0, 0), P(4, 0), P(0, 3)]))).toBe(6);
  });
});

describe('pointSegmentDistance', () => {
  it('piede della perpendicolare interno al segmento', () => {
    expect(pointSegmentDistance(P(2, 3), P(0, 0), P(4, 0))).toBe(3);
  });
  it('oltre gli estremi: distanza dal vertice più vicino', () => {
    expect(pointSegmentDistance(P(7, 4), P(0, 0), P(4, 0))).toBe(5);
    expect(pointSegmentDistance(P(-3, 4), P(0, 0), P(4, 0))).toBe(5);
  });
  it('segmento degenere (punto)', () => {
    expect(pointSegmentDistance(P(3, 4), P(0, 0), P(0, 0))).toBe(5);
  });
});

describe('violatesClearance', () => {
  const pts = [P(0, 0), P(200, 0), P(200, 200)]; // due segmenti da 200 m
  it('candidato lontano: nessuna violazione', () => {
    expect(violatesClearance(pts, P(0, 200), 50)).toBe(false);
  });
  it('candidato a meno di minDist da un PUNTO: violazione', () => {
    expect(violatesClearance(pts, P(230, 230), 50)).toBe(true); // 42.4 m dal vertice (200,200)
  });
  it('candidato a meno di minDist da un SEGMENTO: violazione', () => {
    expect(violatesClearance(pts, P(100, 30), 50)).toBe(true); // 30 m dal segmento basso
  });
  it('distanza esattamente minDist: consentita', () => {
    expect(violatesClearance(pts, P(100, 50), 50)).toBe(false); // 50 m esatti
  });
  it('excludeSegment ignora il segmento su cui si inserisce', () => {
    // punto sul segmento 0, che senza esclusione violerebbe sempre
    expect(
      violatesClearance(pts, P(100, 0), 50, { excludeSegment: 0 })
    ).toBe(false);
    // ma se troppo vicino a un ENDPOINT del segmento resta rifiutato
    expect(
      violatesClearance(pts, P(30, 0), 50, { excludeSegment: 0 })
    ).toBe(true);
  });
  it('closed=true considera anche il segmento di chiusura', () => {
    const square = [P(0, 0), P(200, 0), P(200, 200), P(0, 200)];
    // vicino al lato di chiusura (0,200)→(0,0)
    expect(violatesClearance(square, P(-30, 100), 50, { closed: true })).toBe(true);
    expect(violatesClearance(square, P(-30, 100), 50, { closed: false })).toBe(false);
  });
  it('minDist 0 o negativa: mai violazione', () => {
    expect(violatesClearance(pts, P(1, 1), 0)).toBe(false);
  });
});

describe('ringSelfIntersections', () => {
  it('quadrato chiuso: nessun conflitto', () => {
    expect(ringSelfIntersections([P(0, 0), P(4, 0), P(4, 4), P(0, 4)])).toEqual([]);
  });
  it('farfalla chiusa (4 punti incrociati): conflitto rilevato', () => {
    // (0,0)→(4,0)→(0,3)→(4,3)→chiusura: seg1 (4,0)→(0,3) incrocia seg3 (4,3)→(0,0)
    const bow = [P(0, 0), P(4, 0), P(0, 3), P(4, 3)];
    const conflicts = ringSelfIntersections(bow);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts).toContainEqual([1, 3]);
  });
  it('spostare un vertice dentro il poligono crea conflitto (caso editing)', () => {
    // quadrato con un vertice trascinato oltre il lato opposto
    const dragged = [P(0, 0), P(4, 0), P(4, 4), P(2, -2)];
    expect(ringSelfIntersections(dragged).length).toBeGreaterThan(0);
  });
  it('meno di 3 punti: nessun conflitto', () => {
    expect(ringSelfIntersections([P(0, 0), P(1, 1)])).toEqual([]);
  });
});
