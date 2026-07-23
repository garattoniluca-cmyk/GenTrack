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

/**
 * Indicatori visivi del banking per la mappa: per ogni curva con bank,
 * i range in s di [rampa in | bank pieno | rampa out] e il LATO ESTERNO
 * della curva (quello che il bank alza): +1 = sinistra, -1 = destra nel
 * verso di percorrenza. I range possono sforare [0,1]: il renderer wrappa.
 */
export function bankingIndicators(corners, cornerBanking, totalLength) {
  if (!(totalLength > 0)) return [];
  return corners
    .filter(
      (c) =>
        !c.skip &&
        c.sStart != null &&
        c.d1 &&
        c.d2 &&
        cornerBanking[c.origIndex] &&
        cornerBanking[c.origIndex].angleDeg !== 0
    )
    .map((c) => {
      const bk = cornerBanking[c.origIndex];
      const li = Math.max(0, bk.rampBefore ?? DEFAULT_BANK_RAMP) / totalLength;
      const lo = Math.max(0, bk.rampAfter ?? DEFAULT_BANK_RAMP) / totalLength;
      // direzione di svolta: travel_in × travel_out (z). >0 = svolta a
      // sinistra → l'esterno curva è a DESTRA (-1); <0 → esterno a sinistra.
      const cross = -c.d1.x * c.d2.y + c.d1.y * c.d2.x;
      const outerSign = cross > 0 ? -1 : 1;
      return {
        origIndex: c.origIndex,
        angleDeg: bk.angleDeg,
        outerSign,
        sRampInStart: c.sStart - li,
        sStart: c.sStart,
        sEnd: c.sEnd,
        sRampOutEnd: c.sEnd + lo,
      };
    });
}
