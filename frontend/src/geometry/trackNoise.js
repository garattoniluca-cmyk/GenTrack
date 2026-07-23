// trackNoise.js — altimetria del tracciato: fBm PERIODICO lungo s.
//
// QUESTA È LA VERITÀ ALTIMETRICA del circuito (D-022): le quote definite qui
// sono le quote reali della pista; il terreno delle fasi successive si cuce
// dal tubo di flusso verso l'esterno, mai il contrario (coerente con D-001).
//
// Design:
// - periodicità per costruzione: il rumore 1D è un simplex 2D campionato
//   lungo un CERCHIO (raggio ∝ lunghezza/lunghezza d'onda) → z(0) ≡ z(1)
//   con tutte le derivate continue al raccordo, nessuna cucitura
// - fBm multi-ottava (amplitude, wavelength, octaves, persistence, lacunarity)
// - media sottratta (baseline 0), poi maschera di spianamento dello start
// - limite di pendenza: se max|dz/ds| supera il limite, l'ampiezza viene
//   riscalata GLOBALMENTE (preserva la forma, niente clamping locale che
//   creerebbe spigoli/non-derivabilità)

import { createNoise2D } from 'simplex-noise';

/** PRNG deterministico dal seed (per createNoise2D). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoothstep = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export const DEFAULT_NOISE_PARAMS = {
  seed: 12345,
  amplitude: 25, // escursione verticale (m) prima del limite di pendenza
  wavelength: 800, // lunghezza d'onda base lungo il tracciato (m)
  octaves: 4,
  persistence: 0.5,
  lacunarity: 2.0,
  maxSlopePct: 10, // pendenza longitudinale massima (%) — F1 ~10%
  flattenStart: 0.6, // 0..1: spianamento della zona start (s=0)
};

/** Ampiezza della finestra di spianamento start (frazioni di s). */
const FLAT_FULL = 0.06; // entro questa distanza da s=0: spianamento pieno
const FLAT_RAMP = 0.15; // oltre questa: nessuno spianamento

/**
 * Costruisce l'altimetria z(s) su `sampleCount` punti equidistanti.
 * Ritorna { z: number[], stats: {minZ, maxZ, gain, maxSlopePct, amplitudeScale} }.
 * Deterministico a parità di parametri.
 */
export function buildElevation(sampleCount, totalLength, params = {}) {
  const p = { ...DEFAULT_NOISE_PARAMS, ...params };
  if (sampleCount < 2 || !(totalLength > 0)) {
    return {
      z: [],
      stats: { minZ: 0, maxZ: 0, gain: 0, maxSlopePct: 0, amplitudeScale: 1 },
    };
  }
  const noise2D = createNoise2D(mulberry32(p.seed));

  // fBm periodico: per ogni ottava, cerchio di raggio totalLength/(2π·λ_o)
  const raw = new Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const sNorm = i / sampleCount;
    const theta = 2 * Math.PI * sNorm;
    let sum = 0;
    let amp = 1;
    let maxAmp = 0;
    for (let o = 0; o < p.octaves; o++) {
      const lambda = p.wavelength / Math.pow(p.lacunarity, o);
      const r = totalLength / (2 * Math.PI * Math.max(lambda, 1));
      const ox = 100 + o * 47.13; // offset per decorrelare le ottave
      const oy = -50 + o * 91.7;
      sum += amp * noise2D(Math.cos(theta) * r + ox, Math.sin(theta) * r + oy);
      maxAmp += amp;
      amp *= p.persistence;
    }
    raw[i] = (sum / maxAmp) * p.amplitude;
  }

  // baseline: media a 0
  const mean = raw.reduce((a, b) => a + b, 0) / sampleCount;

  // maschera di spianamento start (s=0): C1 grazie alla smoothstep
  const z = new Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const sNorm = i / sampleCount;
    const dStart = Math.min(sNorm, 1 - sNorm); // distanza periodica da s=0
    const w = smoothstep(FLAT_FULL, FLAT_RAMP, dStart); // 0 allo start → 1 lontano
    const mask = 1 - p.flattenStart * (1 - w);
    z[i] = (raw[i] - mean) * mask;
  }

  // limite di pendenza: riscala globalmente l'ampiezza
  const ds = totalLength / sampleCount;
  const limit = p.maxSlopePct / 100;
  let maxSlope = 0;
  for (let i = 0; i < sampleCount; i++) {
    const slope = Math.abs(z[(i + 1) % sampleCount] - z[i]) / ds;
    if (slope > maxSlope) maxSlope = slope;
  }
  const amplitudeScale = maxSlope > limit && maxSlope > 0 ? limit / maxSlope : 1;
  if (amplitudeScale !== 1) {
    for (let i = 0; i < sampleCount; i++) z[i] *= amplitudeScale;
  }

  // statistiche
  let minZ = Infinity;
  let maxZ = -Infinity;
  let gain = 0;
  let maxSlopeFinal = 0;
  for (let i = 0; i < sampleCount; i++) {
    if (z[i] < minZ) minZ = z[i];
    if (z[i] > maxZ) maxZ = z[i];
    const dz = z[(i + 1) % sampleCount] - z[i];
    if (dz > 0) gain += dz;
    const slope = Math.abs(dz) / ds;
    if (slope > maxSlopeFinal) maxSlopeFinal = slope;
  }

  return {
    z,
    stats: {
      minZ,
      maxZ,
      gain,
      maxSlopePct: maxSlopeFinal * 100,
      amplitudeScale,
    },
  };
}
