// Test invarianti channel.js — vedi TESTING.md
import { describe, it, expect } from 'vitest';
import { evalChannel, sampleChannel } from './channel.js';

describe('evalChannel', () => {
  it('canale vuoto → 0; singolo keyframe → costante', () => {
    expect(evalChannel([], 0.3)).toBe(0);
    expect(evalChannel([{ s: 0.4, value: 7 }], 0.9)).toBe(7);
  });

  it('valore esatto sui keyframe', () => {
    const kfs = [
      { s: 0, value: 0, transition: 'linear' },
      { s: 0.5, value: 10, transition: 'linear' },
    ];
    expect(evalChannel(kfs, 0)).toBe(0);
    expect(evalChannel(kfs, 0.5)).toBe(10);
  });

  it('linear: interpolazione lineare', () => {
    const kfs = [
      { s: 0, value: 0, transition: 'linear' },
      { s: 0.5, value: 10, transition: 'linear' },
    ];
    expect(evalChannel(kfs, 0.25)).toBeCloseTo(5, 9);
    expect(evalChannel(kfs, 0.125)).toBeCloseTo(2.5, 9);
  });

  it('smoothstep: passa dal punto medio, derivata ~0 agli estremi', () => {
    const kfs = [
      { s: 0, value: 0, transition: 'smoothstep' },
      { s: 0.5, value: 10, transition: 'smoothstep' },
    ];
    expect(evalChannel(kfs, 0.25)).toBeCloseTo(5, 9); // t=0.5 → smoothstep=0.5
    // vicino ai keyframe la variazione è quasi nulla (derivata → 0)
    expect(evalChannel(kfs, 0.01)).toBeLessThan(0.05);
    expect(evalChannel(kfs, 0.49)).toBeGreaterThan(9.95);
  });

  it('step: costante fino al keyframe successivo', () => {
    const kfs = [
      { s: 0, value: 3, transition: 'step' },
      { s: 0.5, value: 8, transition: 'step' },
    ];
    expect(evalChannel(kfs, 0.49)).toBe(3);
    expect(evalChannel(kfs, 0.5)).toBe(8);
    expect(evalChannel(kfs, 0.99)).toBe(8);
  });

  it('PERIODICO: il tratto ultimo→primo interpola col wrap', () => {
    const kfs = [
      { s: 0, value: 0, transition: 'linear' },
      { s: 0.5, value: 10, transition: 'linear' },
    ];
    // da s=0.5 (10) a s=1≡0 (0): a 0.75 metà strada → 5
    expect(evalChannel(kfs, 0.75)).toBeCloseTo(5, 9);
    // continuità al wrap
    expect(evalChannel(kfs, 0.999)).toBeCloseTo(evalChannel(kfs, 0.001), 1);
  });

  it('valueKey personalizzato (angleDeg per il banking)', () => {
    const kfs = [
      { s: 0, angleDeg: -5, transition: 'linear' },
      { s: 0.5, angleDeg: 15, transition: 'linear' },
    ];
    expect(evalChannel(kfs, 0.25, 'angleDeg')).toBeCloseTo(5, 9);
  });

  it('keyframes non ordinati: gestiti (sort interno)', () => {
    const kfs = [
      { s: 0.5, value: 10, transition: 'linear' },
      { s: 0, value: 0, transition: 'linear' },
    ];
    expect(evalChannel(kfs, 0.25)).toBeCloseTo(5, 9);
  });
});

describe('sampleChannel', () => {
  it('campiona count valori', () => {
    const out = sampleChannel([{ s: 0, value: 4 }], 10);
    expect(out).toHaveLength(10);
    expect(out.every((v) => v === 4)).toBe(true);
  });
});
