// Test invarianti banking.js — vedi TESTING.md
import { describe, it, expect } from 'vitest';
import { buildBankingProfile, MAX_BANK_DEG } from './banking.js';

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
