// Test invarianti spline.js (fillet path) — vedi TESTING.md
import { describe, it, expect } from 'vitest';
import {
  travelOrderedVertices,
  computeCorners,
  resampleFilletPath,
  radiusFromHandleDistance,
} from './spline.js';
import { dist, projectPointOnSegment } from './polygon.js';

const P = (x, y) => ({ x, y });

// quadrato 1000×1000 disegnato ANTIORARIO (y-up), start sul lato basso
const square = [P(0, 0), P(1000, 0), P(1000, 1000), P(0, 1000)];
const START = 0; // (0,0) → (1000,0); startMid = (500,0)

describe('projectPointOnSegment', () => {
  it('proietta sul segmento (resta sopra)', () => {
    expect(projectPointOnSegment(P(500, 30), P(0, 0), P(1000, 0))).toEqual(P(500, 0));
  });
  it('clampa oltre gli estremi', () => {
    expect(projectPointOnSegment(P(-50, 10), P(0, 0), P(1000, 0))).toEqual(P(0, 0));
  });
});

describe('travelOrderedVertices', () => {
  it('ccw (concorde col winding): parte dal vertice di fine del segmento start', () => {
    const v = travelOrderedVertices(square, START, 'ccw');
    expect(v[0]).toMatchObject({ x: 1000, y: 0, origIndex: 1 });
    expect(v[v.length - 1]).toMatchObject({ x: 0, y: 0, origIndex: 0 });
  });
  it('cw (opposto al winding): parte dal vertice di inizio', () => {
    const v = travelOrderedVertices(square, START, 'cw');
    expect(v[0]).toMatchObject({ x: 0, y: 0, origIndex: 0 });
    expect(v[1]).toMatchObject({ x: 0, y: 1000, origIndex: 3 });
  });
});

describe('computeCorners', () => {
  it('angolo a 90°: t = R, tangenze sui lati', () => {
    const corners = computeCorners(square, START, 'ccw', {}, 100);
    const c = corners.find((c) => c.origIndex === 1); // vertice (1000,0)
    expect(c.skip).toBe(false);
    expect(c.R).toBeCloseTo(100, 6);
    // tangenze a distanza t=R=100 dal vertice, sui due lati
    expect(dist(c.T1, P(900, 0))).toBeLessThan(1e-6);
    expect(dist(c.T2, P(1000, 100))).toBeLessThan(1e-6);
    // centro a R dal lato: (900, 100)
    expect(dist(c.C, P(900, 100))).toBeLessThan(1e-6);
  });
  it('raggio enorme: clampato da maxR (spigoli adiacenti)', () => {
    const corners = computeCorners(square, START, 'ccw', {}, 5000);
    for (const c of corners) {
      expect(c.R).toBeLessThanOrEqual(c.maxR + 1e-9);
      expect(c.R).toBeCloseTo(490, 0); // 0.49·1000·tan(45°)
    }
  });
  it('override per-vertice: solo quel vertice cambia', () => {
    const corners = computeCorners(square, START, 'ccw', { 2: 50 }, 100);
    expect(corners.find((c) => c.origIndex === 2).R).toBeCloseTo(50, 6);
    expect(corners.find((c) => c.origIndex === 1).R).toBeCloseTo(100, 6);
  });
  it('vertice collineare: skip (nessun arco)', () => {
    const withMid = [P(0, 0), P(500, 0), P(1000, 0), P(1000, 1000), P(0, 1000)];
    const corners = computeCorners(withMid, 0, 'ccw', {}, 100);
    expect(corners.find((c) => c.origIndex === 1).skip).toBe(true);
  });
});

describe('resampleFilletPath', () => {
  const R = 100;
  const res = resampleFilletPath(square, START, 'ccw', {}, R);

  it('lunghezza esatta: 4·(1000−2R) + 2πR', () => {
    const expected = 4 * (1000 - 2 * R) + 2 * Math.PI * R;
    expect(Math.abs(res.totalLength - expected)).toBeLessThan(0.1);
  });

  it('s=0 esattamente sulla metà del rettilineo start', () => {
    expect(dist(res.samples[0], P(500, 0))).toBeLessThan(1e-9);
  });

  it('verso ccw: il path parte verso x crescente (fine del segmento start)', () => {
    expect(res.samples[1].x).toBeGreaterThan(res.samples[0].x);
    expect(Math.abs(res.samples[1].y)).toBeLessThan(1e-9);
  });

  it('verso cw: il path parte verso x decrescente', () => {
    const cw = resampleFilletPath(square, START, 'cw', {}, R);
    expect(cw.samples[1].x).toBeLessThan(cw.samples[0].x);
  });

  it('i RETTILINEI restano esatti: sample sul lato basso a y=0', () => {
    // primi 400 m: da (500,0) a (900,0) — tutti a y = 0 esatto
    for (const p of res.samples) {
      const d = p.s * res.totalLength;
      if (d > 1 && d < 399) expect(Math.abs(p.y)).toBeLessThan(1e-9);
    }
  });

  it('gli archi stanno sul cerchio del raccordo', () => {
    const c = res.corners.find((c) => c.origIndex === 1); // centro (900,100)
    for (const p of res.samples) {
      const d = p.s * res.totalLength;
      if (d > 405 && d < 550) {
        // dentro l'arco del primo angolo
        expect(Math.abs(dist(p, c.C) - R)).toBeLessThan(0.05);
      }
    }
  });

  it('s monotono, spaziatura ≈ costante', () => {
    const step = res.totalLength / res.sampleCount;
    for (let i = 1; i < res.samples.length; i++) {
      expect(res.samples[i].s).toBeGreaterThan(res.samples[i - 1].s);
      const d = dist(res.samples[i - 1], res.samples[i]);
      expect(Math.abs(d - step) / step).toBeLessThan(0.05);
    }
  });

  it('input non valido: vuoto', () => {
    expect(resampleFilletPath(square, null, 'ccw').samples).toEqual([]);
    expect(resampleFilletPath([P(0, 0)], 0, 'ccw').samples).toEqual([]);
  });
});

describe('radiusFromHandleDistance', () => {
  it('inversa coerente: d = R(1−sin)/sin → R', () => {
    const sinHalf = Math.sin(Math.PI / 4); // angolo 90°
    const R = 80;
    const d = (R * (1 - sinHalf)) / sinHalf;
    expect(radiusFromHandleDistance(d, sinHalf)).toBeCloseTo(R, 9);
  });
});
