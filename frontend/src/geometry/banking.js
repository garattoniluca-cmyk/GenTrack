// banking.js — banking PER CURVA (D-024).
// Il bank si imposta sulla mappa a livello di curva: angolo COSTANTE lungo
// l'estensione della stondatura [sStart, sEnd], con RAMPE smoothstep di
// salita/discesa a zero su distanze configurabili prima e dopo la curva.
//
// RAMPE CHE SI INTERSECANO → PONTE DIRETTO (scelta utente, 2026-07-23):
// se la rampa di uscita di una curva si sovrappone alla rampa di ingresso
// della successiva, il bank transita DIRETTAMENTE dall'angolo della prima
// a quello della seconda con una smoothstep sull'intero gap: non torna a
// zero, non crea gobbe sopra i valori impostati, resta C1 ovunque.
// Caso limite incluso: un'unica curva con rampe che coprono tutto il giro
// → bank costante su tutto il tracciato.

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
    gaps.push({ A, B, gapLen, bridged: A.lo + B.li >= gapLen });
  }
  return { banked, gaps };
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
        if (g.bridged) {
          // PONTE: transizione diretta A → B sull'intero gap
          const u = g.gapLen > 1e-12 ? d / g.gapLen : 0;
          return g.A.A + (g.B.A - g.A.A) * smoothstep(u);
        }
        // rampe indipendenti: discesa di A, zero, salita di B
        if (g.A.lo > 0 && d <= g.A.lo) {
          return g.A.A * (1 - smoothstep(d / g.A.lo));
        }
        const dToB = g.gapLen - d;
        if (g.B.li > 0 && dToB <= g.B.li) {
          return g.B.A * (1 - smoothstep(dToB / g.B.li));
        }
        return 0;
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
 * Se due rampe sono in PONTE (vedi buildBankingProfile), i tratteggi si
 * incontrano a metà del gap invece di sovrapporsi.
 */
export function bankingIndicators(corners, cornerBanking, totalLength) {
  if (!(totalLength > 0)) return [];
  const { banked, gaps } = buildBankModel(totalLength, corners, cornerBanking);
  if (banked.length === 0) return [];

  // range di rampa effettivi, con clip a metà gap se in ponte
  const rampOutEnd = new Map(); // origIndex → s
  const rampInStart = new Map();
  for (const g of gaps) {
    if (g.bridged) {
      const mid = g.A.sEnd + g.gapLen / 2;
      rampOutEnd.set(g.A.origIndex, mid);
      rampInStart.set(g.B.origIndex, mid);
    } else {
      if (!rampOutEnd.has(g.A.origIndex)) {
        rampOutEnd.set(g.A.origIndex, g.A.sEnd + g.A.lo);
      }
      if (!rampInStart.has(g.B.origIndex)) {
        rampInStart.set(g.B.origIndex, g.B.sStart - g.B.li);
      }
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
      sRampInStart: rampInStart.get(b.origIndex) ?? b.sStart - b.li,
      sStart: b.sStart,
      sEnd: b.sEnd,
      sRampOutEnd: rampOutEnd.get(b.origIndex) ?? b.sEnd + b.lo,
    };
  });
}
