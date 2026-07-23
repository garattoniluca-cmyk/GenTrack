// Test invarianti banking.js — vedi TESTING.md
import { describe, it, expect } from 'vitest';
import { buildBankingProfile, bankingIndicators, MAX_BANK_DEG } from './banking.js';

const N = 1000;
const LEN = 5000; // m → 1 sample ogni 5 m

// una curva da s=0.4 a s=0.5, vertice orig 3
const corners = [{ origIndex: 3, skip: false, sStart: 0.4, sEnd: 0.5 }];

describe('buildBankingProfile', () => {
  it('nessun bank impostato → tutto zero', () => {
    const out = buildBankingProfile(N, LEN, corners, {});
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it('bank costante DENTRO la curva', () => {
    const out = buildBankingProfile(N, LEN, corners, {
      3: { angleDeg: 8, rampBefore: 250, rampAfter: 250 },
    });
    for (let i = 0; i < N; i++) {
      const s = i / N;
      if (s >= 0.4 && s <= 0.5) expect(out[i]).toBeCloseTo(8, 9);
    }
  });

  it('rampe: a metà rampa ≈ metà bank; fuori dalle rampe zero', () => {
    // rampBefore 250 m su 5000 m = 0.05 in s → rampa da 0.35 a 0.40
    const out = buildBankingProfile(N, LEN, corners, {
      3: { angleDeg: 8, rampBefore: 250, rampAfter: 250 },
    });
    const at = (s) => out[Math.round(s * N)];
    expect(at(0.375)).toBeCloseTo(4, 1); // metà rampa (smoothstep(0.5)=0.5)
    expect(at(0.3)).toBe(0); // prima della rampa
    expect(at(0.6)).toBe(0); // dopo la rampa out (0.5+0.05=0.55)
    expect(at(0.525)).toBeCloseTo(4, 1); // metà rampa out
  });

  it('CONTINUITÀ: nessun salto tra sample consecutivi', () => {
    const out = buildBankingProfile(N, LEN, corners, {
      3: { angleDeg: 10, rampBefore: 150, rampAfter: 150 },
    });
    for (let i = 0; i < N; i++) {
      const d = Math.abs(out[(i + 1) % N] - out[i]);
      expect(d).toBeLessThan(0.6); // max variazione per 5 m di rampa smoothstep
    }
  });

  it('rampa che attraversa il traguardo (wrap): valori corretti vicino a s=0', () => {
    const nearStart = [{ origIndex: 1, skip: false, sStart: 0.02, sEnd: 0.06 }];
    const out = buildBankingProfile(N, LEN, nearStart, {
      1: { angleDeg: 6, rampBefore: 300, rampAfter: 100 },
    });
    // rampBefore 300 m = 0.06 s: inizia a s = 0.02-0.06 = -0.04 → wrappa a 0.96
    expect(out[Math.round(0.98 * N)]).toBeGreaterThan(0);
    expect(out[0]).toBeGreaterThan(0);
    expect(out[Math.round(0.5 * N)]).toBe(0);
  });

  it('bank negativo e clamp a ±MAX', () => {
    const out = buildBankingProfile(N, LEN, corners, {
      3: { angleDeg: -50, rampBefore: 100, rampAfter: 100 },
    });
    const at = (s) => out[Math.round(s * N)];
    expect(at(0.45)).toBe(-MAX_BANK_DEG);
  });

  it('curve skip o senza estensione s: ignorate', () => {
    const cs = [
      { origIndex: 0, skip: true },
      { origIndex: 2, skip: false }, // senza sStart
    ];
    const out = buildBankingProfile(N, LEN, cs, { 0: { angleDeg: 9 }, 2: { angleDeg: 9 } });
    expect(out.every((v) => v === 0)).toBe(true);
  });
});

describe('buildBankingProfile — PONTE tra rampe che si intersecano', () => {
  // due curve: A [0.30-0.35] e B [0.40-0.45], gap 0.05 (250 m su 5000)
  const two = [
    { origIndex: 1, skip: false, sStart: 0.3, sEnd: 0.35 },
    { origIndex: 2, skip: false, sStart: 0.4, sEnd: 0.45 },
  ];

  it('rampe sovrapposte → transizione DIRETTA A→B senza tornare a zero', () => {
    // lo(A)=200m=0.04 + li(B)=100m=0.02 = 0.06 > gap 0.05 → ponte
    const out = buildBankingProfile(N, LEN, two, {
      1: { angleDeg: 12, rampBefore: 100, rampAfter: 200 },
      2: { angleDeg: 4, rampBefore: 100, rampAfter: 100 },
    });
    const at = (s) => out[Math.round(s * N)];
    expect(at(0.32)).toBeCloseTo(12, 6); // dentro A
    expect(at(0.42)).toBeCloseTo(4, 6); // dentro B
    expect(at(0.375)).toBeCloseTo(8, 0.5); // metà gap ≈ (12+4)/2
    // nel gap: MAI sotto il minimo né sopra il massimo (niente gobbe)
    for (let s = 0.351; s < 0.399; s += 0.002) {
      expect(at(s)).toBeGreaterThanOrEqual(4 - 1e-6);
      expect(at(s)).toBeLessThanOrEqual(12 + 1e-6);
    }
  });

  it('rampe corte (nessuna sovrapposizione) → torna a zero tra le curve', () => {
    const out = buildBankingProfile(N, LEN, two, {
      1: { angleDeg: 12, rampBefore: 50, rampAfter: 50 }, // 0.01 + 0.01 < 0.05
      2: { angleDeg: 4, rampBefore: 50, rampAfter: 50 },
    });
    expect(out[Math.round(0.375 * N)]).toBe(0);
  });

  it('segni opposti in ponte: crossover morbido che passa per lo zero', () => {
    const out = buildBankingProfile(N, LEN, two, {
      1: { angleDeg: 10, rampBefore: 100, rampAfter: 200 },
      2: { angleDeg: -10, rampBefore: 100, rampAfter: 100 },
    });
    expect(out[Math.round(0.375 * N)]).toBeCloseTo(0, 0.6);
  });

  it('caso limite: rampe che coprono tutto il giro → bank costante ovunque', () => {
    const one = [{ origIndex: 3, skip: false, sStart: 0.4, sEnd: 0.5 }];
    const out = buildBankingProfile(N, LEN, one, {
      3: { angleDeg: 7, rampBefore: 3000, rampAfter: 3000 },
    });
    expect(out.every((v) => Math.abs(v - 7) < 1e-9)).toBe(true);
  });

  it('CONTINUITÀ anche col ponte: nessun salto tra sample consecutivi', () => {
    const out = buildBankingProfile(N, LEN, two, {
      1: { angleDeg: 12, rampBefore: 100, rampAfter: 200 },
      2: { angleDeg: 4, rampBefore: 100, rampAfter: 100 },
    });
    // pendenza massima teorica: rampa 12° su 100 m → smoothstep max 1.5·12/0.02
    // = 900°/unità-s → 0.9°/sample. Un vero salto (discontinuità) sarebbe ≥ 4°.
    for (let i = 0; i < N; i++) {
      expect(Math.abs(out[(i + 1) % N] - out[i])).toBeLessThan(1.0);
    }
  });
});

describe('bankingIndicators', () => {
  // curva a SINISTRA (stile quadrato ccw): d1 verso il prev = (-1,0),
  // d2 verso il next = (0,1) → esterno curva a destra (-1)
  const leftTurn = {
    origIndex: 5,
    skip: false,
    sStart: 0.4,
    sEnd: 0.5,
    d1: { x: -1, y: 0 },
    d2: { x: 0, y: 1 },
  };
  // curva a DESTRA: d2 verso il basso → esterno a sinistra (+1)
  const rightTurn = { ...leftTurn, origIndex: 6, d2: { x: 0, y: -1 } };

  it('lato esterno corretto per svolte a sinistra e a destra', () => {
    const out = bankingIndicators([leftTurn, rightTurn], {
      5: { angleDeg: 10, rampBefore: 250, rampAfter: 500 },
      6: { angleDeg: 8, rampBefore: 100, rampAfter: 100 },
    }, 5000);
    expect(out.find((i) => i.origIndex === 5).outerSign).toBe(-1);
    expect(out.find((i) => i.origIndex === 6).outerSign).toBe(1);
  });

  it('range dei transitori in s (rampe in metri / lunghezza)', () => {
    const out = bankingIndicators([leftTurn], {
      5: { angleDeg: 10, rampBefore: 250, rampAfter: 500 },
    }, 5000);
    expect(out[0].sRampInStart).toBeCloseTo(0.4 - 0.05, 9);
    expect(out[0].sRampOutEnd).toBeCloseTo(0.5 + 0.1, 9);
  });

  it('curve senza bank: nessun indicatore', () => {
    expect(bankingIndicators([leftTurn], {}, 5000)).toEqual([]);
  });

  it('rampe in ponte: i tratteggi si incontrano a metà gap', () => {
    const A = { origIndex: 1, skip: false, sStart: 0.3, sEnd: 0.35, d1: { x: -1, y: 0 }, d2: { x: 0, y: 1 } };
    const B = { origIndex: 2, skip: false, sStart: 0.4, sEnd: 0.45, d1: { x: 0, y: -1 }, d2: { x: 1, y: 0 } };
    const out = bankingIndicators([A, B], {
      1: { angleDeg: 12, rampBefore: 100, rampAfter: 200 },
      2: { angleDeg: 4, rampBefore: 100, rampAfter: 100 },
    }, 5000);
    const iA = out.find((i) => i.origIndex === 1);
    const iB = out.find((i) => i.origIndex === 2);
    expect(iA.sRampOutEnd).toBeCloseTo(0.375, 9); // metà del gap [0.35, 0.40]
    expect(iB.sRampInStart).toBeCloseTo(0.375, 9);
  });
});
