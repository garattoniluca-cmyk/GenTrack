// channel.js — interpolazione di canali a keyframe lungo l'ascissa s ∈ [0,1).
// Dominio PERIODICO (circuito chiuso): l'ultimo keyframe raccorda col primo.
// Transizioni (proprietà del keyframe di PARTENZA del tratto):
//   step       → valore costante fino al keyframe successivo
//   linear     → interpolazione lineare
//   smoothstep → 3t²−2t³, derivata nulla agli estremi (default)
// Generico: usato per bankingChannel ora, per qualunque canale futuro.

/** Valuta il canale in s. keyframes: [{s, [valueKey], transition?}]. */
export function evalChannel(keyframes, s, valueKey = 'value') {
  if (!keyframes || keyframes.length === 0) return 0;
  const kfs = [...keyframes].sort((a, b) => a.s - b.s);
  if (kfs.length === 1) return kfs[0][valueKey];

  s = ((s % 1) + 1) % 1;
  let a, b, t;
  const i = kfs.findIndex((k) => k.s > s);
  if (i <= 0) {
    // s dopo l'ultimo keyframe (o prima del primo): tratto di wrap last→first
    a = kfs[kfs.length - 1];
    b = kfs[0];
    const span = 1 - a.s + b.s;
    const ds = s >= a.s ? s - a.s : s + 1 - a.s;
    t = span > 1e-12 ? ds / span : 0;
  } else {
    a = kfs[i - 1];
    b = kfs[i];
    const span = b.s - a.s;
    t = span > 1e-12 ? (s - a.s) / span : 0;
  }

  const mode = a.transition ?? 'smoothstep';
  if (mode === 'step') return a[valueKey];
  if (mode === 'smoothstep') t = t * t * (3 - 2 * t);
  return a[valueKey] + (b[valueKey] - a[valueKey]) * t;
}

/** Campiona il canale su `count` punti equidistanti (per i grafici). */
export function sampleChannel(keyframes, count, valueKey = 'value') {
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = evalChannel(keyframes, i / count, valueKey);
  }
  return out;
}
