// Test invarianti trackNoise.js — vedi TESTING.md
import { describe, it, expect } from 'vitest';
import { buildElevation, mulberry32 } from './trackNoise.js';

const N = 1000;
const LEN = 5000; // m

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

describe('buildElevation', () => {
  const params = { seed: 7, amplitude: 25, wavelength: 800, maxSlopePct: 10, flattenStart: 0 };
  const res = buildElevation(N, LEN, params);

  it('stesso seed → output identico (determinismo)', () => {
    const res2 = buildElevation(N, LEN, params);
    expect(res2.z).toEqual(res.z);
  });

  it('seed diverso → output diverso', () => {
    const other = buildElevation(N, LEN, { ...params, seed: 8 });
    expect(other.z).not.toEqual(res.z);
  });

  it('PERIODICO: nessun salto al raccordo s=1→s=0', () => {
    const ds = LEN / N;
    const wrapSlope = Math.abs(res.z[0] - res.z[N - 1]) / ds;
    expect(wrapSlope).toBeLessThanOrEqual(0.1 + 1e-9); // entro il limite di pendenza
  });

  it('DERIVABILITÀ discreta: pendenza ovunque entro il limite', () => {
    const ds = LEN / N;
    for (let i = 0; i < N; i++) {
      const slope = Math.abs(res.z[(i + 1) % N] - res.z[i]) / ds;
      expect(slope).toBeLessThanOrEqual(0.1 + 1e-9);
    }
    expect(res.stats.maxSlopePct).toBeLessThanOrEqual(10 + 1e-6);
  });

  it('limite di pendenza più severo → ampiezza ridotta di conseguenza', () => {
    const strict = buildElevation(N, LEN, { ...params, maxSlopePct: 2 });
    expect(strict.stats.maxSlopePct).toBeLessThanOrEqual(2 + 1e-6);
    expect(strict.stats.maxZ - strict.stats.minZ).toBeLessThan(
      res.stats.maxZ - res.stats.minZ + 1e-9
    );
  });

  it('baseline: media ≈ 0 (senza spianamento)', () => {
    const mean = res.z.reduce((a, b) => a + b, 0) / N;
    expect(Math.abs(mean)).toBeLessThan(0.5);
  });

  it('spianamento start: z(s=0) esattamente 0 con flattenStart=1', () => {
    const flat = buildElevation(N, LEN, { ...params, flattenStart: 1 });
    expect(Math.abs(flat.z[0])).toBeLessThan(1e-9);
    // e la zona attorno allo start è più piatta del resto
    const nearMax = Math.max(
      ...[0, 1, 2, N - 2, N - 1].map((i) => Math.abs(flat.z[i]))
    );
    const globalMax = Math.max(...flat.z.map(Math.abs));
    expect(nearMax).toBeLessThan(globalMax * 0.3);
  });

  it('ampiezza maggiore → escursione maggiore (sotto il limite)', () => {
    // parametri dolci per non attivare il riscalo
    const soft = { seed: 7, wavelength: 3000, octaves: 2, maxSlopePct: 20, flattenStart: 0 };
    const a = buildElevation(N, LEN, { ...soft, amplitude: 5 });
    const b = buildElevation(N, LEN, { ...soft, amplitude: 15 });
    expect(a.stats.amplitudeScale).toBe(1);
    expect(b.stats.maxZ - b.stats.minZ).toBeGreaterThan(a.stats.maxZ - a.stats.minZ);
  });

  it('gain: somma delle salite > 0 e chiusura del giro coerente', () => {
    expect(res.stats.gain).toBeGreaterThan(0);
  });

  it('input non validi → vuoto', () => {
    expect(buildElevation(1, LEN).z).toEqual([]);
    expect(buildElevation(N, 0).z).toEqual([]);
  });
});
