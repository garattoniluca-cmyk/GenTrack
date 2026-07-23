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
  amplitude: 50, // escursione verticale (m) prima del limite di pendenza
  wavelength: 2500, // lunghezza d'onda base lungo il tracciato (m)
  octaves: 2,
  persistence: 0.5,
  lacunarity: 2.0,
  maxSlopePct: 10, // pendenza longitudinale massima (%) — F1 ~10%
  flattenStart: 0.6, // 0..1: spianamento della zona start (s=0)
};

/** Finestra di spianamento start di FALLBACK (frazioni di s), usata solo se
 * non viene passata l'estensione reale del rettilineo. */
const FLAT_FULL = 0.06;
const FLAT_RAMP = 0.15;

/** Lunghezza (m) della rampa di spianamento OLTRE i confini del rettilineo. */
const FLAT_RAMP_M = 250;

const wrap01 = (x) => ((x % 1) + 1) % 1;

/**
 * Costruisce l'altimetria z(s) su `sampleCount` punti equidistanti.
 * startStraight (opzionale): {beginS, endS} = estensione REALE del rettilineo
 * di start nel dominio s (wrappa attorno a s=0: dentro se s ≥ beginS o
 * s ≤ endS). Con flattenStart=1 l'INTERO rettilineo è piatto (z=0 esatto),
 * con rampe smoothstep di FLAT_RAMP_M metri oltre i suoi confini.
 * Ritorna { z: number[], stats: {minZ, maxZ, gain, maxSlopePct, amplitudeScale} }.
 * Deterministico a parità di parametri.
 */
export function buildElevation(sampleCount, totalLength, params = {}, startStraight = null) {
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

  // maschera di spianamento start: C1 grazie alla smoothstep.
  // Se è nota l'estensione reale del rettilineo, lo spianamento la copre
  // TUTTA (niente rumore residuo dentro il rettilineo, niente spigoli).
  const useStraight =
    startStraight != null &&
    startStraight.beginS != null &&
    startStraight.endS != null;
  const rampS = Math.min(0.2, FLAT_RAMP_M / totalLength);

  const maskAt = (sNorm) => {
    let d;
    if (useStraight) {
      const inside = sNorm >= startStraight.beginS || sNorm <= startStraight.endS;
      d = inside
        ? 0
        : Math.min(wrap01(sNorm - startStraight.endS), wrap01(startStraight.beginS - sNorm));
      const w = smoothstep(0, rampS, d);
      return 1 - p.flattenStart * (1 - w);
    }
    d = Math.min(sNorm, 1 - sNorm); // fallback: finestra fissa attorno a s=0
    const w = smoothstep(FLAT_FULL, FLAT_RAMP, d);
    return 1 - p.flattenStart * (1 - w);
  };

  const z = new Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    z[i] = (raw[i] - mean) * maskAt(i / sampleCount);
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
