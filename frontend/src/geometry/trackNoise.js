// trackNoise.js — altimetria del tracciato: campo fBm BIDIMENSIONALE z(x,y)
// (D-025, architettura indicata dall'utente il 2026-07-23).
//
// QUESTA È LA VERITÀ ALTIMETRICA del circuito (D-022): le quote definite qui
// sono le quote reali della pista; il terreno delle fasi successive si cuce
// dal tubo di flusso verso l'esterno, mai il contrario (coerente con D-001).
//
// Perché un campo 2D sulla MAPPA e non un rumore 1D lungo s:
// - punti vicini sulla mappa hanno quote simili QUALUNQUE sia la loro
//   distanza lungo il giro: due rettilinei paralleli ravvicinati non possono
//   divergere in quota → il terreno procedurale resta generabile dai bordi
//   del tubo di flusso (il rumore 1D non lo garantiva)
// - il campo NASCE piatto sul rettilineo di start: l'ampiezza cresce con la
//   distanza 2D dal segmento di start (smoothstep 0 → flatRadius) — niente
//   appiattimenti a posteriori, che su una zona "alta" del rumore creavano
//   pendenze artificiali e discontinuità
// - periodicità esatta per costruzione: s=0 e s=1 sono lo stesso punto del
//   piano → stesso z, con tutte le derivate
// - derivabilità lungo il tracciato: campo liscio ∘ path C1 → z(s) C1
// - limite di pendenza: riscalo GLOBALE dell'ampiezza (preserva la forma e
//   lo zero sul rettilineo; MAI clamping locale, che creerebbe spigoli)

import { createNoise2D } from 'simplex-noise';
import { pointSegmentDistance } from './polygon.js';

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
  wavelength: 2500, // lunghezza d'onda base SULLA MAPPA (m)
  octaves: 2,
  persistence: 0.5,
  lacunarity: 2.0,
  maxSlopePct: 10, // pendenza longitudinale massima (%) — F1 ~10%
  flatRadius: 500, // distanza 2D (m) dal rettilineo di start entro cui il campo sale da 0 a pieno
};

/**
 * Costruisce l'altimetria del tracciato valutando il campo 2D nei punti
 * (x,y) dei sample del path.
 *
 * samples: [{x, y}, ...] — anello di punti ~equidistanti lungo il tracciato
 * startSeg: {a:{x,y}, b:{x,y}} | null — segmento di start sulla mappa;
 *   il campo è ancorato a z=0 su di esso (peso smoothstep sulla distanza 2D).
 *   Con null il campo è a piena ampiezza ovunque.
 *
 * Ritorna { z: number[], stats: {minZ, maxZ, gain, maxSlopePct, amplitudeScale} }.
 * Deterministico a parità di parametri.
 */
export function buildElevation(samples, totalLength, params = {}, startSeg = null) {
  const p = { ...DEFAULT_NOISE_PARAMS, ...params };
  const n = samples?.length ?? 0;
  if (n < 2 || !(totalLength > 0)) {
    return {
      z: [],
      stats: { minZ: 0, maxZ: 0, gain: 0, maxSlopePct: 0, amplitudeScale: 1 },
    };
  }
  const noise2D = createNoise2D(mulberry32(p.seed));
  const rampR = Math.max(1, p.flatRadius);

  const z = new Array(n);
  for (let i = 0; i < n; i++) {
    const pt = samples[i];
    // fBm 2D in coordinate mondo
    let sum = 0;
    let amp = 1;
    let maxAmp = 0;
    for (let o = 0; o < p.octaves; o++) {
      const lambda = Math.max(1, p.wavelength / Math.pow(p.lacunarity, o));
      const ox = 100 + o * 47.13; // offset per decorrelare le ottave
      const oy = -50 + o * 91.7;
      sum += amp * noise2D(pt.x / lambda + ox, pt.y / lambda + oy);
      maxAmp += amp;
      amp *= p.persistence;
    }
    // peso: 0 sul rettilineo di start, 1 oltre flatRadius (in 2D)
    const w = startSeg
      ? smoothstep(0, rampR, pointSegmentDistance(pt, startSeg.a, startSeg.b))
      : 1;
    z[i] = (sum / maxAmp) * p.amplitude * w;
  }

  // limite di pendenza lungo il tracciato: riscala GLOBALMENTE l'ampiezza
  // (z=0 sul rettilineo resta 0; la forma del campo non cambia)
  const ds = totalLength / n;
  const limit = p.maxSlopePct / 100;
  let maxSlope = 0;
  for (let i = 0; i < n; i++) {
    const slope = Math.abs(z[(i + 1) % n] - z[i]) / ds;
    if (slope > maxSlope) maxSlope = slope;
  }
  const amplitudeScale = maxSlope > limit && maxSlope > 0 ? limit / maxSlope : 1;
  if (amplitudeScale !== 1) {
    for (let i = 0; i < n; i++) z[i] *= amplitudeScale;
  }

  // statistiche
  let minZ = Infinity;
  let maxZ = -Infinity;
  let gain = 0;
  let maxSlopeFinal = 0;
  for (let i = 0; i < n; i++) {
    if (z[i] < minZ) minZ = z[i];
    if (z[i] > maxZ) maxZ = z[i];
    const dz = z[(i + 1) % n] - z[i];
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
