// Test invarianti offset.js — vedi TESTING.md
import { describe, it, expect } from 'vitest';
import { offsetClosedPolyline, tubeOutlines } from './offset.js';

// anello circolare di raggio R percorso in senso ANTIORARIO
function circle(R, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * 2 * Math.PI;
    out.push({ x: R * Math.cos(a), y: R * Math.sin(a) });
  }
  return out;
}

describe('offsetClosedPolyline', () => {
  const R = 500;
  const ring = circle(R, 360);

  it('ccw: offset positivo (SINISTRA nel verso di marcia) = verso il centro', () => {
    // percorrendo un cerchio in senso antiorario, la sinistra è l'interno
    const out = offsetClosedPolyline(ring, 10);
    for (const p of out) {
      expect(Math.abs(Math.hypot(p.x, p.y) - (R - 10))).toBeLessThan(0.05);
    }
  });

  it('offset negativo (destra) = verso l\'esterno', () => {
    const out = offsetClosedPolyline(ring, -10);
    for (const p of out) {
      expect(Math.abs(Math.hypot(p.x, p.y) - (R + 10))).toBeLessThan(0.05);
    }
  });

  it('offset 0 = identità', () => {
    const out = offsetClosedPolyline(ring, 0);
    for (let i = 0; i < ring.length; i++) {
      expect(out[i].x).toBeCloseTo(ring[i].x, 9);
      expect(out[i].y).toBeCloseTo(ring[i].y, 9);
    }
  });

  it('meno di 3 punti → vuoto; nessun NaN', () => {
    expect(offsetClosedPolyline([{ x: 0, y: 0 }], 5)).toEqual([]);
    const out = offsetClosedPolyline(ring, 25);
    expect(out.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe('tubeOutlines', () => {
  const ring = circle(500, 360);
  const section = { trackWidth: 12, grassLeft: 8, grassRight: 6 };
  const t = tubeOutlines(ring, section);

  it('bordi pista a ±trackWidth/2 dalla mezzeria (ccw: sinistra = interno)', () => {
    expect(Math.hypot(t.trackLeft[0].x, t.trackLeft[0].y)).toBeCloseTo(494, 1);
    expect(Math.hypot(t.trackRight[0].x, t.trackRight[0].y)).toBeCloseTo(506, 1);
  });

  it('bordi erba a ±(trackWidth/2 + erba)', () => {
    expect(Math.hypot(t.grassLeftOuter[0].x, t.grassLeftOuter[0].y)).toBeCloseTo(486, 1);
    expect(Math.hypot(t.grassRightOuter[0].x, t.grassRightOuter[0].y)).toBeCloseTo(512, 1);
  });
});
