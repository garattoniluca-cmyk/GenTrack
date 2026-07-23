// Test invarianti trackNoise.js (campo 2D, D-025) — vedi TESTING.md
import { describe, it, expect } from 'vitest';
import { buildElevation, mulberry32 } from './trackNoise.js';
import { resampleFilletPath } from './spline.js';

const P = (x, y) => ({ x, y });

// path realistico: quadrato 2000×2000 con stondature da 100 m, start sul
// lato basso (segmento (0,0)→(2000,0)), percorrenza ccw
const square = [P(0, 0), P(2000, 0), P(2000, 2000), P(0, 2000)];
const START_SEG = { a: square[0], b: square[1] };
const path = resampleFilletPath(square, 0, 'ccw', {}, 100);
const N = path.sampleCount;
const LEN = path.totalLength;
const ds = LEN / N;

const BASE = {
  seed: 7,
  amplitude: 50,
  wavelength: 2500,
  octaves: 2,
  persistence: 0.5,
  lacunarity: 2,
  maxSlopePct: 10,
  flatRadius: 500,
};

describe('mulberry32', () => {
  it('deterministico e in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) {
      const va = a();
      expect(va).toBe(b());
      expect(va).toBeGreaterThanOrEqual(0);
      expect(va).toBeLessThan(1);
    }
  });
});

describe('buildElevation (campo 2D)', () => {
  const res = buildElevation(path.samples, LEN, BASE, START_SEG);

  it('stesso seed → output identico; seed diverso → diverso', () => {
    expect(buildElevation(path.samples, LEN, BASE, START_SEG).z).toEqual(res.z);
    expect(buildElevation(path.samples, LEN, { ...BASE, seed: 8 }, START_SEG).z).not.toEqual(res.z);
  });

  it('z = 0 ESATTO su tutto il rettilineo di start (nessun appiattimento a posteriori: il campo nasce piatto lì)', () => {
    let onStraight = 0;
    for (let i = 0; i < N; i++) {
      const pt = path.samples[i];
      if (Math.abs(pt.y) < 1e-9 && pt.x >= -1e-9 && pt.x <= 2000 + 1e-9) {
        expect(Math.abs(res.z[i])).toBeLessThan(1e-12);
        onStraight++;
      }
    }
    expect(onStraight).toBeGreaterThan(50); // il rettilineo è campionato davvero
  });

  it('PERIODICITÀ esatta: s=0 e s=1 sono lo stesso punto del piano', () => {
    // il path chiude su startMid: primo e ultimo sample sono sul rettilineo → z=0
    expect(Math.abs(res.z[0])).toBeLessThan(1e-12);
    const wrapSlope = Math.abs(res.z[0] - res.z[N - 1]) / ds;
    expect(wrapSlope).toBeLessThanOrEqual(0.1 + 1e-9);
  });

  it('CONTINUITÀ e DERIVABILITÀ lungo il path: pendenza nel limite, niente spigoli', () => {
    const slope = (i) => (res.z[(i + 1) % N] - res.z[i]) / ds;
    for (let i = 0; i < N; i++) {
      expect(Math.abs(res.z[(i + 1) % N] - res.z[i])).toBeLessThanOrEqual(0.1 * ds + 1e-9);
      // salto di pendenza tra sample: uno spigolo vero sarebbe ~10%
      expect(Math.abs(slope((i + 1) % N) - slope(i))).toBeLessThan(0.03);
    }
    expect(res.stats.maxSlopePct).toBeLessThanOrEqual(10 + 1e-6);
  });

  it('COERENZA SPAZIALE: punti vicini sulla mappa → quote vicine, anche se lontani lungo s', () => {
    // due rettilinei paralleli a 25 m: andata (y=0) e ritorno (y=25),
    // agli antipodi nel dominio s ma adiacenti nel piano
    const samples = [];
    for (let i = 0; i < 100; i++) samples.push(P(1000 + i * 20, 0));
    for (let i = 0; i < 100; i++) samples.push(P(1000 + (99 - i) * 20, 25));
    const out = buildElevation(samples, 4000, { ...BASE, maxSlopePct: 1e6 }, null);
    let maxDiff = 0;
    let range = { min: Infinity, max: -Infinity };
    for (let i = 0; i < 100; i++) {
      const j = 199 - i; // stesso x, y=25
      maxDiff = Math.max(maxDiff, Math.abs(out.z[i] - out.z[j]));
      range.min = Math.min(range.min, out.z[i]);
      range.max = Math.max(range.max, out.z[i]);
    }
    expect(maxDiff).toBeLessThan(8); // 25 m di distanza → pochi metri di differenza
    expect(range.max - range.min).toBeGreaterThan(10); // ma il campo NON è banale
  });

  it('flatRadius: a metà rampa il campo pesa smoothstep(0.5) = 0.5 esatto', () => {
    // punto a 250 m dal segmento di start, flatRadius 500
    const pts = [P(1000, 250), P(1010, 250), P(1020, 250)];
    const withSeg = buildElevation(pts, 30, { ...BASE, maxSlopePct: 1e6 }, START_SEG);
    const noSeg = buildElevation(pts, 30, { ...BASE, maxSlopePct: 1e6 }, null);
    expect(withSeg.z[0]).toBeCloseTo(noSeg.z[0] * 0.5, 9);
  });

  it('ampiezza lineare: 3× ampiezza → 3× escursione (senza riscalo)', () => {
    const soft = { ...BASE, maxSlopePct: 1e6 };
    const a = buildElevation(path.samples, LEN, { ...soft, amplitude: 5 }, null);
    const b = buildElevation(path.samples, LEN, { ...soft, amplitude: 15 }, null);
    expect(a.stats.amplitudeScale).toBe(1);
    expect(b.stats.maxZ - b.stats.minZ).toBeCloseTo(3 * (a.stats.maxZ - a.stats.minZ), 6);
  });

  it('limite di pendenza più severo → rispettato via riscalo globale', () => {
    const strict = buildElevation(path.samples, LEN, { ...BASE, maxSlopePct: 2 }, START_SEG);
    expect(strict.stats.maxSlopePct).toBeLessThanOrEqual(2 + 1e-6);
    // il riscalo è globale: il rettilineo resta a 0
    expect(Math.abs(strict.z[0])).toBeLessThan(1e-12);
  });

  it('gain: somma delle salite > 0', () => {
    expect(res.stats.gain).toBeGreaterThan(0);
  });

  it('input non validi → vuoto', () => {
    expect(buildElevation([P(0, 0)], LEN).z).toEqual([]);
    expect(buildElevation(path.samples, 0).z).toEqual([]);
  });
});
