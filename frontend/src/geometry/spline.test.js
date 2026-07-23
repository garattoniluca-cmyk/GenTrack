// Test invarianti spline.js — vedi TESTING.md
import { describe, it, expect } from 'vitest';
import {
  catmullRomPoint,
  sampleClosedSpline,
  resampleClosedSpline,
  generateControlPointsFromPolygon,
} from './spline.js';
import { dist } from './polygon.js';

const P = (x, y) => ({ x, y });

/** CP disposti su un cerchio di raggio r. */
function circleCps(r, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * 2 * Math.PI;
    out.push(P(r * Math.cos(a), r * Math.sin(a)));
  }
  return out;
}

describe('catmullRomPoint', () => {
  it('passa per i control point agli estremi (u=0 → p1, u=1 → p2)', () => {
    const [p0, p1, p2, p3] = [P(0, 0), P(1, 0), P(2, 1), P(3, 1)];
    const s = catmullRomPoint(p0, p1, p2, p3, 0);
    const e = catmullRomPoint(p0, p1, p2, p3, 1);
    expect(dist(s, p1)).toBeLessThan(1e-9);
    expect(dist(e, p2)).toBeLessThan(1e-9);
  });
});

describe('sampleClosedSpline', () => {
  it('t cresce monotono in [0,1)', () => {
    const dense = sampleClosedSpline(circleCps(100, 8));
    for (let i = 1; i < dense.length; i++) {
      expect(dense[i].t).toBeGreaterThan(dense[i - 1].t);
    }
    expect(dense[0].t).toBe(0);
    expect(dense[dense.length - 1].t).toBeLessThan(1);
  });
  it('meno di 3 CP: vuoto', () => {
    expect(sampleClosedSpline([P(0, 0), P(1, 1)])).toEqual([]);
  });
});

describe('resampleClosedSpline', () => {
  const R = 500;
  const res = resampleClosedSpline(circleCps(R, 16));

  it('cerchio di raggio R: lunghezza ≈ 2πR (entro 1%)', () => {
    expect(Math.abs(res.totalLength - 2 * Math.PI * R) / (2 * Math.PI * R)).toBeLessThan(0.01);
  });

  it('i sample restano ≈ sul cerchio (overshoot centripeta contenuto)', () => {
    for (const p of res.samples) {
      expect(Math.abs(Math.hypot(p.x, p.y) - R) / R).toBeLessThan(0.02);
    }
  });

  it('s monotono da 0, spaziatura ≈ costante (±20%)', () => {
    const expected = res.totalLength / res.sampleCount;
    expect(res.samples[0].s).toBe(0);
    for (let i = 1; i < res.samples.length; i++) {
      expect(res.samples[i].s).toBeGreaterThan(res.samples[i - 1].s);
      const d = dist(res.samples[i - 1], res.samples[i]);
      expect(Math.abs(d - expected) / expected).toBeLessThan(0.2);
    }
  });

  it('chiusura: l ultimo sample torna vicino al primo (~1 passo)', () => {
    const step = res.totalLength / res.sampleCount;
    const gap = dist(res.samples[res.samples.length - 1], res.samples[0]);
    expect(gap).toBeLessThan(step * 1.5);
  });

  it('sampleCount adattivo: ~1 sample ogni 5 m, clampato', () => {
    expect(res.sampleCount).toBe(Math.round(res.totalLength / 5));
    const tiny = resampleClosedSpline(circleCps(10, 6)); // circonferenza ~63 m
    expect(tiny.sampleCount).toBe(200); // clamp minimo
  });

  it('meno di 3 CP: risultato vuoto', () => {
    expect(resampleClosedSpline([P(0, 0)]).samples).toEqual([]);
  });
});

describe('generateControlPointsFromPolygon', () => {
  // quadrato 1000×1000 disegnato in senso ANTIORARIO (y-up), start sul lato basso
  const square = [P(0, 0), P(1000, 0), P(1000, 1000), P(0, 1000)];
  const startSeg = 0; // (0,0) → (1000,0)

  it('primo CP = metà del segmento start (ancora s=0)', () => {
    const cps = generateControlPointsFromPolygon(square, startSeg, 'ccw');
    expect(cps[0].x).toBe(500);
    expect(cps[0].y).toBe(0);
    expect(cps.length).toBe(square.length + 1);
  });

  it('verso concorde col winding: secondo CP = fine del segmento start', () => {
    const cps = generateControlPointsFromPolygon(square, startSeg, 'ccw');
    expect(cps[1]).toMatchObject({ x: 1000, y: 0 });
    expect(cps[2]).toMatchObject({ x: 1000, y: 1000 });
  });

  it('verso opposto al winding: secondo CP = inizio del segmento start', () => {
    const cps = generateControlPointsFromPolygon(square, startSeg, 'cw');
    expect(cps[1]).toMatchObject({ x: 0, y: 0 });
    expect(cps[2]).toMatchObject({ x: 0, y: 1000 });
  });

  it('input non valido: vuoto', () => {
    expect(generateControlPointsFromPolygon(square, null, 'cw')).toEqual([]);
    expect(generateControlPointsFromPolygon([P(0, 0)], 0, 'cw')).toEqual([]);
  });
});
