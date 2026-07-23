// Test invarianti spline.js (stondature asimmetriche a due bracci) — vedi TESTING.md
import { describe, it, expect } from 'vitest';
import {
  travelOrderedVertices,
  computeCorners,
  cornerBezierPoint,
  resampleFilletPath,
  MIN_ARM,
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

describe('computeCorners (bracci)', () => {
  it('bracci simmetrici di default: T1/T2 a defaultArm dal vertice', () => {
    const corners = computeCorners(square, START, 'ccw', {}, 100);
    const c = corners.find((c) => c.origIndex === 1); // vertice (1000,0)
    expect(c.skip).toBe(false);
    // in ccw il braccio IN è sul lato basso, OUT sul lato destro
    expect(dist(c.T1, P(900, 0))).toBeLessThan(1e-6);
    expect(dist(c.T2, P(1000, 100))).toBeLessThan(1e-6);
    expect(c.t1).toBe(100);
    expect(c.t2).toBe(100);
  });

  it('bracci ASIMMETRICI: in/out indipendenti', () => {
    const corners = computeCorners(square, START, 'ccw', { 1: { in: 200, out: 50 } }, 100);
    const c = corners.find((c) => c.origIndex === 1);
    expect(dist(c.T1, P(800, 0))).toBeLessThan(1e-6); // 200 m prima del vertice
    expect(dist(c.T2, P(1000, 50))).toBeLessThan(1e-6); // 50 m dopo il vertice
  });

  it('bracci clampati a metà spigolo (0.49)', () => {
    const corners = computeCorners(square, START, 'ccw', { 1: { in: 5000, out: 5000 } }, 100);
    const c = corners.find((c) => c.origIndex === 1);
    expect(c.t1).toBeCloseTo(490, 6);
    expect(c.t2).toBeCloseTo(490, 6);
  });

  it('braccio minimo rispettato', () => {
    const corners = computeCorners(square, START, 'ccw', { 1: { in: 0.1, out: 0.1 } }, 100);
    const c = corners.find((c) => c.origIndex === 1);
    expect(c.t1).toBe(MIN_ARM);
  });

  it('vertice collineare: skip (nessuna curva)', () => {
    const withMid = [P(0, 0), P(500, 0), P(1000, 0), P(1000, 1000), P(0, 1000)];
    const corners = computeCorners(withMid, 0, 'ccw', {}, 100);
    expect(corners.find((c) => c.origIndex === 1).skip).toBe(true);
  });

  it('raggio minimo: cresce coi bracci', () => {
    const small = computeCorners(square, START, 'ccw', {}, 50).find((c) => c.origIndex === 1);
    const big = computeCorners(square, START, 'ccw', {}, 150).find((c) => c.origIndex === 1);
    expect(small.minR).toBeGreaterThan(0);
    expect(big.minR).toBeGreaterThan(small.minR);
  });
});

describe('cornerBezierPoint', () => {
  it('estremi esatti: u=0 → T1, u=1 → T2', () => {
    const [T1, V, T2] = [P(900, 0), P(1000, 0), P(1000, 100)];
    expect(dist(cornerBezierPoint(T1, V, T2, 0), T1)).toBeLessThan(1e-12);
    expect(dist(cornerBezierPoint(T1, V, T2, 1), T2)).toBeLessThan(1e-12);
  });
  it('tangenza C1: la partenza è diretta come il braccio', () => {
    const [T1, V, T2] = [P(900, 0), P(1000, 0), P(1000, 100)];
    const p = cornerBezierPoint(T1, V, T2, 0.01);
    // il primo passo deve muoversi ~lungo +x (direzione T1→V), y trascurabile
    expect(p.x).toBeGreaterThan(T1.x);
    expect(Math.abs(p.y)).toBeLessThan(0.02);
  });
});

describe('resampleFilletPath', () => {
  const res = resampleFilletPath(square, START, 'ccw', {}, 100);

  it('s=0 esattamente sulla metà del rettilineo start', () => {
    expect(dist(res.samples[0], P(500, 0))).toBeLessThan(1e-9);
  });

  it('verso ccw: il path parte verso x crescente', () => {
    expect(res.samples[1].x).toBeGreaterThan(res.samples[0].x);
    expect(Math.abs(res.samples[1].y)).toBeLessThan(1e-9);
  });

  it('verso cw: il path parte verso x decrescente', () => {
    const cw = resampleFilletPath(square, START, 'cw', {}, 100);
    expect(cw.samples[1].x).toBeLessThan(cw.samples[0].x);
  });

  it('i RETTILINEI restano esatti: sample sul lato basso a y=0', () => {
    for (const p of res.samples) {
      const d = p.s * res.totalLength;
      if (d > 1 && d < 399) expect(Math.abs(p.y)).toBeLessThan(1e-9);
    }
  });

  it('lunghezza sensata: tra il taglio dritto e il percorso per il vertice', () => {
    // per ogni curva: corda T1→T2 ≤ lunghezza bezier ≤ t1+t2
    const straight = 4 * (1000 - 200); // rettilinei con bracci 100
    const chord = 4 * Math.hypot(100, 100);
    const viaVertex = 4 * 200;
    expect(res.totalLength).toBeGreaterThan(straight + chord - 1);
    expect(res.totalLength).toBeLessThan(straight + viaVertex + 1);
  });

  it('s monotono, spaziatura ≈ costante', () => {
    const step = res.totalLength / res.sampleCount;
    for (let i = 1; i < res.samples.length; i++) {
      expect(res.samples[i].s).toBeGreaterThan(res.samples[i - 1].s);
      const d = dist(res.samples[i - 1], res.samples[i]);
      expect(Math.abs(d - step) / step).toBeLessThan(0.05);
    }
  });

  it('bracci asimmetrici: il path è più lungo dal lato del braccio lungo', () => {
    const asym = resampleFilletPath(square, START, 'ccw', { 1: { in: 300, out: 50 } }, 100);
    expect(asym.totalLength).toBeGreaterThan(0);
    const c = asym.corners.find((c) => c.origIndex === 1);
    expect(c.t1).toBe(300);
    expect(c.t2).toBe(50);
  });

  it('input non valido: vuoto', () => {
    expect(resampleFilletPath(square, null, 'ccw').samples).toEqual([]);
    expect(resampleFilletPath([P(0, 0)], 0, 'ccw').samples).toEqual([]);
  });
});
