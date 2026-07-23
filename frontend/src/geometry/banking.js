// banking.js — banking PER CURVA (D-024, rev. 2).
// Il bank si imposta sulla mappa a livello di curva: angolo COSTANTE lungo
// l'estensione della stondatura [sStart, sEnd], con RAMPE smoothstep di
// salita/discesa a zero su distanze configurabili prima e dopo la curva.
//
// NESSUN AUTOMATISMO (scelta utente, 2026-07-23): le rampe sono SEMPRE
// indipendenti e il bank è solo quello impostato dall'utente. Se due rampe
// si intersecano, lo stato è INVALIDO e va segnalato (bankingConflicts):
// l'app avverte, l'utente accorcia le rampe. Nello stato invalido il
// profilo mostra il contributo maggiore in modulo (comportamento definito
// ma non "corretto": il rosso in UI dice che va sistemato).

export const DEFAULT_BANK_RAMP = 100; // m
export const MAX_BANK_DEG = 30;

const smoothstep = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};

const wrap01 = (x) => ((x % 1) + 1) % 1;

/** Modello a tratti: curve con bank ordinate + gap (con ponte o rampe). */
function buildBankModel(totalLength, corners, cornerBanking) {
  const banked = corners
    .filter(
      (c) =>
        !c.skip &&
        c.sStart != null &&
        cornerBanking[c.origIndex] &&
        cornerBanking[c.origIndex].angleDeg !== 0
    )
    .map((c) => {
      const bk = cornerBanking[c.origIndex];
      return {
        origIndex: c.origIndex,
        sStart: c.sStart,
        sEnd: c.sEnd,
        A: Math.max(-MAX_BANK_DEG, Math.min(MAX_BANK_DEG, bk.angleDeg)),
        li: Math.max(0, bk.rampBefore ?? DEFAULT_BANK_RAMP) / totalLength,
        lo: Math.max(0, bk.rampAfter ?? DEFAULT_BANK_RAMP) / totalLength,
      };
    })
    .sort((a, b) => a.sStart - b.sStart);

  const n = banked.length;
  const gaps = [];
  for (let k = 0; k < n; k++) {
    const A = banked[k];
    const B = banked[(k + 1) % n];
    const gapLen = n === 1 ? wrap01(A.sStart - A.sEnd) : wrap01(B.sStart - A.sEnd);
    gaps.push({ A, B, gapLen, overlap: A.lo + B.li > gapLen + 1e-12 });
  }
  return { banked, gaps };
}

/**
 * VALIDAZIONE: rampe che si intersecano. Ritorna un conflitto per ogni
 * coppia di curve le cui rampe non ci stanno nel gap tra le stondature:
 * { fromIndex, toIndex, gapM, rampsM, excessM } (metri). fromIndex può
 * coincidere con toIndex (unica curva con rampe più lunghe del giro).
 */
export function bankingConflicts(totalLength, corners, cornerBanking) {
  if (!(totalLength > 0)) return [];
  const { gaps } = buildBankModel(totalLength, corners, cornerBanking);
  return gaps
    .filter((g) => g.overlap)
    .map((g) => ({
      fromIndex: g.A.origIndex,
      toIndex: g.B.origIndex,
      gapM: g.gapLen * totalLength,
      rampsM: (g.A.lo + g.B.li) * totalLength,
      excessM: (g.A.lo + g.B.li - g.gapLen) * totalLength,
    }));
}

/**
 * Profilo del banking su sampleCount punti equidistanti (gradi per sample).
 * corners: da resampleFilletPath (con sStart/sEnd).
 * cornerBanking: { [origIndex]: {angleDeg, rampBefore, rampAfter} } (metri).
 */
export function buildBankingProfile(sampleCount, totalLength, corners, cornerBanking) {
  const out = new Array(sampleCount).fill(0);
  if (!(totalLength > 0) || sampleCount < 2) return out;

  const { banked, gaps } = buildBankModel(totalLength, corners, cornerBanking);
  if (banked.length === 0) return out;

  const evalAt = (s) => {
    // dentro una curva? (le stondature non attraversano s=0: il path parte
    // dalla metà del rettilineo di start)
    for (const c of banked) {
      if (s >= c.sStart && s <= c.sEnd) return c.A;
    }
    // in quale gap? (distanza periodica dalla fine della curva precedente)
    for (const g of gaps) {
      const d = wrap01(s - g.A.sEnd);
      if (d <= g.gapLen + 1e-12) {
        // rampe SEMPRE indipendenti: discesa di A, zero, salita di B.
        // Se si intersecano (stato INVALIDO, segnalato da bankingConflicts)
        // prevale il contributo maggiore in modulo.
        let vA = 0;
        let vB = 0;
        if (g.A.lo > 0 && d <= g.A.lo) {
          vA = g.A.A * (1 - smoothstep(d / g.A.lo));
        }
        const dToB = g.gapLen - d;
        if (g.B.li > 0 && dToB <= g.B.li) {
          vB = g.B.A * (1 - smoothstep(dToB / g.B.li));
        }
        return Math.abs(vA) >= Math.abs(vB) ? vA : vB;
      }
    }
    return 0;
  };

  for (let i = 0; i < sampleCount; i++) {
    out[i] = evalAt(i / sampleCount);
  }
  return out;
}

/**
 * Indicatori visivi del banking per la mappa: per ogni curva con bank,
 * i range in s di [rampa in | bank pieno | rampa out] e il LATO ESTERNO
 * della curva (quello che il bank alza): +1 = sinistra, -1 = destra nel
 * verso di percorrenza. I range possono sforare [0,1]: il renderer wrappa.
 * conflictIn/conflictOut: la rampa interseca quella della curva adiacente
 * (stato invalido, da renderizzare in rosso).
 */
export function bankingIndicators(corners, cornerBanking, totalLength) {
  if (!(totalLength > 0)) return [];
  const { banked, gaps } = buildBankModel(totalLength, corners, cornerBanking);
  if (banked.length === 0) return [];

  const conflictOut = new Set();
  const conflictIn = new Set();
  for (const g of gaps) {
    if (g.overlap) {
      conflictOut.add(g.A.origIndex);
      conflictIn.add(g.B.origIndex);
    }
  }

  return banked.map((b) => {
    const c = corners.find((c) => c.origIndex === b.origIndex);
    // direzione di svolta: travel_in × travel_out (z). >0 = svolta a
    // sinistra → l'esterno curva è a DESTRA (-1); <0 → esterno a sinistra.
    const cross = -c.d1.x * c.d2.y + c.d1.y * c.d2.x;
    const outerSign = cross > 0 ? -1 : 1;
    return {
      origIndex: b.origIndex,
      angleDeg: b.A,
      outerSign,
      sRampInStart: b.sStart - b.li,
      sStart: b.sStart,
      sEnd: b.sEnd,
      sRampOutEnd: b.sEnd + b.lo,
      conflictIn: conflictIn.has(b.origIndex),
      conflictOut: conflictOut.has(b.origIndex),
    };
  });
}
