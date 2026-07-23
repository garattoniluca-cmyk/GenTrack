// banking.js — banking PER CURVA (D-024).
// Il bank si imposta sulla mappa a livello di curva: angolo COSTANTE lungo
// l'estensione della stondatura [sStart, sEnd], con RAMPE smoothstep di
// salita/discesa a zero su distanze configurabili prima e dopo la curva.
// Le rampe smoothstep hanno derivata nulla agli estremi → il profilo
// complessivo è C1 (nessuna discontinuità né spigolo).
// Contributi di curve vicine si SOMMANO (comportamento continuo e
// prevedibile; se le rampe si sovrappongono, accorciarle), clamp a ±30°.

export const DEFAULT_BANK_RAMP = 100; // m
export const MAX_BANK_DEG = 30;

const smoothstep = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};

/**
 * Peso [0,1] del bank di una curva alla posizione s (non periodico).
 * range: [sStart - li] rampa ↑ [sStart .. sEnd] costante [sEnd + lo] rampa ↓
 */
function bankWeight(s, sStart, sEnd, li, lo) {
  if (s >= sStart && s <= sEnd) return 1;
  if (s < sStart) {
    if (li <= 0) return 0;
    return smoothstep(1 - (sStart - s) / li);
  }
  if (lo <= 0) return 0;
  return smoothstep(1 - (s - sEnd) / lo);
}

/**
 * Profilo del banking su sampleCount punti equidistanti.
 * corners: da resampleFilletPath (con sStart/sEnd).
 * cornerBanking: { [origIndex]: {angleDeg, rampBefore, rampAfter} } (metri).
 * Ritorna array di gradi per sample. Periodicità: le rampe che sforano
 * s=0/s=1 avvolgono correttamente (valutazione anche in s±1).
 */
export function buildBankingProfile(sampleCount, totalLength, corners, cornerBanking) {
  const out = new Array(sampleCount).fill(0);
  if (!(totalLength > 0) || sampleCount < 2) return out;

  const banked = corners.filter(
    (c) =>
      !c.skip &&
      c.sStart != null &&
      cornerBanking[c.origIndex] &&
      cornerBanking[c.origIndex].angleDeg !== 0
  );
  if (banked.length === 0) return out;

  for (const c of banked) {
    const bk = cornerBanking[c.origIndex];
    const A = Math.max(-MAX_BANK_DEG, Math.min(MAX_BANK_DEG, bk.angleDeg));
    const li = Math.max(0, bk.rampBefore ?? DEFAULT_BANK_RAMP) / totalLength;
    const lo = Math.max(0, bk.rampAfter ?? DEFAULT_BANK_RAMP) / totalLength;
    for (let i = 0; i < sampleCount; i++) {
      const s = i / sampleCount;
      // valuta anche con wrap ±1 per le rampe che attraversano il traguardo
      const w =
        bankWeight(s, c.sStart, c.sEnd, li, lo) +
        bankWeight(s + 1, c.sStart, c.sEnd, li, lo) +
        bankWeight(s - 1, c.sStart, c.sEnd, li, lo);
      out[i] += A * Math.min(1, w);
    }
  }
  // clamp complessivo (sovrapposizioni di più curve)
  for (let i = 0; i < sampleCount; i++) {
    out[i] = Math.max(-MAX_BANK_DEG, Math.min(MAX_BANK_DEG, out[i]));
  }
  return out;
}
