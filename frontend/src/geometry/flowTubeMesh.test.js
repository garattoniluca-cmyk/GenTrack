// Test invarianti flowTubeMesh.js (qualità da simulatore) — vedi TESTING.md
import { describe, it, expect } from 'vitest';
import { buildFlowTubeMesh, minTriangleArea, mergeIndexed, buildRibbon } from './flowTubeMesh.js';
import { buildBankingRoll } from './banking.js';
import { resampleFilletPath } from './spline.js';

const P = (x, y) => ({ x, y });

// tracciato di prova: quadrato 2000×2000 con stondature 150 m, ccw
const square = [P(0, 0), P(2000, 0), P(2000, 2000), P(0, 2000)];
const path = resampleFilletPath(square, 0, 'ccw', {}, 150);
const N = path.sampleCount;
const SECTION = { trackWidth: 12, lineWidth: 0.2, grassLeft: 8, grassRight: 8 };
const zFlat = new Array(N).fill(0);
const rollZero = new Array(N).fill(0);

const mesh = buildFlowTubeMesh(path.samples, zFlat, rollZero, SECTION);

describe('buildFlowTubeMesh — struttura', () => {
  it('4 fasce, conteggi coerenti, indici validi', () => {
    expect(Object.keys(mesh.bands)).toEqual(['asphalt', 'lines', 'grass', 'walls']);
    expect(mesh.stats.triangles).toBe(N * 2 * 7); // 7 ribbon × 2 tri per anello
    for (const band of Object.values(mesh.bands)) {
      const vCount = band.positions.length / 3;
      for (const idx of band.indices) expect(idx).toBeLessThan(vCount);
      expect(band.normals.length).toBe(band.positions.length);
      expect(band.uvs.length / 2).toBe(vCount);
    }
  });

  it('NESSUN triangolo degenere, NESSUN NaN', () => {
    for (const band of Object.values(mesh.bands)) {
      expect(minTriangleArea(band)).toBeGreaterThan(1e-6);
      for (const v of band.positions) expect(Number.isFinite(v)).toBe(true);
      for (const v of band.normals) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('normali unitarie; carreggiata verso l\'ALTO con roll=0', () => {
    for (const band of [mesh.bands.asphalt, mesh.bands.lines, mesh.bands.grass]) {
      for (let i = 0; i < band.normals.length; i += 3) {
        const l = Math.hypot(band.normals[i], band.normals[i + 1], band.normals[i + 2]);
        expect(Math.abs(l - 1)).toBeLessThan(1e-6);
        expect(band.normals[i + 1]).toBeGreaterThan(0.99); // Y-up, piano
      }
    }
  });

  it('CONTINUITÀ tra fasce: i rail di confine sono IDENTICI AL BIT', () => {
    // bordo asfalto/riga: rail B della riga SX (=rLineLIn) == rail A asfalto
    const asphalt = mesh.bands.asphalt;
    const lines = mesh.bands.lines;
    const grass = mesh.bands.grass;
    for (let i = 0; i < N; i++) {
      // riga SX railB (vertice 2i+1) vs asfalto railA (vertice 2i)
      for (let k = 0; k < 3; k++) {
        expect(lines.positions[i * 6 + 3 + k]).toBe(asphalt.positions[i * 6 + k]);
      }
      // erba SX railB (=rLineLOut, vertice 2i+1) vs riga SX railA (vertice 2i)
      for (let k = 0; k < 3; k++) {
        expect(grass.positions[i * 6 + 3 + k]).toBe(lines.positions[i * 6 + k]);
      }
    }
  });

  it('CHIUSURA del giro: l\'ultimo anello si aggancia al primo (indici wrap)', () => {
    const idx = mesh.bands.asphalt.indices;
    const lastQuad = Array.from(idx.slice((N - 1) * 6));
    expect(lastQuad).toContain(0); // il quad dell'ultimo anello usa i vertici del primo
    expect(lastQuad).toContain(1);
  });

  it('muri: verticali, alti 2 m, sui bordi esterni', () => {
    const walls = mesh.bands.walls;
    const half = walls.positions.length / 2; // primo blocco = muro SX
    for (let i = 0; i < N; i++) {
      const topY = walls.positions[i * 6 + 1];
      const baseY = walls.positions[i * 6 + 4];
      expect(topY - baseY).toBeCloseTo(2, 9);
      // verticale: stessa X/Z tra base e top
      expect(walls.positions[i * 6]).toBe(walls.positions[i * 6 + 3]);
      expect(walls.positions[i * 6 + 2]).toBe(walls.positions[i * 6 + 5]);
    }
    expect(half).toBeGreaterThan(0);
  });

  it('larghezze giuste: asfalto, righe, erba (sezione piana)', () => {
    const a = mesh.bands.asphalt;
    // anello 0: distanza railA↔railB = trackWidth − 2·lineWidth
    const dx = a.positions[0] - a.positions[3];
    const dy = a.positions[1] - a.positions[4];
    const dz = a.positions[2] - a.positions[5];
    expect(Math.hypot(dx, dy, dz)).toBeCloseTo(12 - 0.4, 6);
  });
});

describe('buildFlowTubeMesh — banking e quota', () => {
  it('PERNO SUL BORDO BASSO: la pista non scende MAI sotto la quota nominale', () => {
    // pista piatta (z=0) con roll variabile: nessun vertice della
    // carreggiata/erba deve andare sotto y=0 (il vecchio perno in mezzeria
    // affondava il lato interno di ~6.8 m a 20°)
    const roll = Array.from({ length: N }, (_, i) => 20 * Math.sin((2 * Math.PI * i) / N));
    const m = buildFlowTubeMesh(path.samples, zFlat, roll, SECTION);
    for (const band of [m.bands.asphalt, m.bands.lines, m.bands.grass]) {
      for (let k = 1; k < band.positions.length; k += 3) {
        expect(band.positions[k]).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });

  it('il bordo basso della CARREGGIATA resta esattamente a quota nominale', () => {
    const roll10 = new Array(N).fill(10); // sinistra alzata → lato basso = destra
    const m = buildFlowTubeMesh(path.samples, zFlat, roll10, SECTION);
    const lines = m.bands.lines;
    const half = lines.positions.length / 2; // secondo blocco = riga DX
    for (let i = 0; i < N; i += 50) {
      const rightLineOuterY = lines.positions[half + i * 6 + 4]; // rail −w
      expect(Math.abs(rightLineOuterY)).toBeLessThan(1e-9);
    }
  });

  it('APRON: l\'erba sul lato basso è PIATTA a quota terreno (come gli ovali reali)', () => {
    const roll10 = new Array(N).fill(10); // lato basso = destra
    const m = buildFlowTubeMesh(path.samples, zFlat, roll10, SECTION);
    const g = m.bands.grass;
    const half = g.positions.length / 2; // secondo blocco = erba DX
    for (let k = half + 1; k < g.positions.length; k += 3) {
      expect(Math.abs(g.positions[k])).toBeLessThan(1e-9); // tutta a z=0
    }
  });

  it('GOBBA LIMITATA: la carreggiata sale al massimo di 2w·sin(roll), non di più', () => {
    const roll20 = new Array(N).fill(20);
    const m = buildFlowTubeMesh(path.samples, zFlat, roll20, SECTION);
    const maxRise = 12 * Math.sin((20 * Math.PI) / 180) + 1e-6; // 2w·sin20 ≈ 4.10 m
    const a = m.bands.asphalt;
    for (let k = 1; k < a.positions.length; k += 3) {
      expect(a.positions[k]).toBeLessThanOrEqual(maxRise);
      expect(a.positions[k]).toBeGreaterThanOrEqual(-1e-9);
    }
    // col vecchio perno sul bordo del TUBO il bordo alto arrivava a
    // 2·(w+grass)·sin20 ≈ 9.6 m: qui deve restare sotto 4.2
  });

  it('CONTINUITÀ del lift lungo le rampe: nessun salto verticale', () => {
    // rampa smoothstep 0→20→0 come nei transitori reali
    const roll = Array.from({ length: N }, (_, i) => {
      const s = i / N;
      const t = Math.max(0, Math.min(1, (s - 0.2) / 0.1));
      const u = Math.max(0, Math.min(1, (0.6 - s) / 0.1));
      return 20 * (t * t * (3 - 2 * t)) * (u * u * (3 - 2 * u));
    });
    const m = buildFlowTubeMesh(path.samples, zFlat, roll, SECTION);
    const a = m.bands.asphalt;
    // Δy tra anelli consecutivi del bordo sinistro dell'asfalto: piccolo e regolare
    for (let i = 0; i < N - 1; i++) {
      const dy = Math.abs(a.positions[(i + 1) * 6 + 1] - a.positions[i * 6 + 1]);
      expect(dy).toBeLessThan(0.35); // anelli ~5 m: un salto vero sarebbe metri
    }
  });

  it('roll positivo = lato SINISTRO alzato', () => {
    const roll10 = new Array(N).fill(10);
    const m = buildFlowTubeMesh(path.samples, zFlat, roll10, SECTION);
    const g = m.bands.grass;
    // erba SX railA (=rGrassLOut) vs erba DX railB (=rGrassROut):
    // blocco SX = prima metà vertici, blocco DX = seconda metà
    const half = g.positions.length / 2;
    for (let i = 0; i < N; i += 50) {
      const leftY = g.positions[i * 6 + 1]; // erba SX, rail esterno
      const rightY = g.positions[half + i * 6 + 4]; // erba DX, rail esterno
      expect(leftY).toBeGreaterThan(rightY);
    }
  });

  it('quota applicata: la mezzeria segue z', () => {
    const zVar = Array.from({ length: N }, (_, i) => 20 * Math.sin((2 * Math.PI * i) / N));
    const m = buildFlowTubeMesh(path.samples, zVar, rollZero, SECTION);
    const a = m.bands.asphalt;
    for (let i = 0; i < N; i += 100) {
      const yA = a.positions[i * 6 + 1];
      expect(Math.abs(yA - zVar[i])).toBeLessThan(0.5); // bordo ~mezzeria a roll 0 (pendenza long. piccola)
    }
  });

  it('convenzione D-026 end-to-end: bank positivo alza l\'ESTERNO curva', () => {
    // quadrato ccw: tutte le curve girano a sinistra → esterno a DESTRA
    const roll = buildBankingRoll(N, path.totalLength, path.corners, {
      1: { angleDeg: 10, rampBefore: 100, rampAfter: 100 },
    });
    const c = path.corners.find((c) => c.origIndex === 1);
    const iMid = Math.round(((c.sStart + c.sEnd) / 2) * N);
    // roll negativo = destra alzata (esterno) ✓
    expect(roll[iMid]).toBeCloseTo(-10, 6);
    const m = buildFlowTubeMesh(path.samples, zFlat, roll, SECTION);
    const g = m.bands.grass;
    const half = g.positions.length / 2;
    const leftY = g.positions[iMid * 6 + 1];
    const rightY = g.positions[half + iMid * 6 + 4];
    expect(rightY).toBeGreaterThan(leftY); // esterno (destra) più alto
  });
});

describe('helpers', () => {
  it('mergeIndexed: offset indici corretto', () => {
    const rail = (y) => [[0, y, 0], [1, y, 0], [2, y, 0]];
    const nrm = [[0, 1, 0], [0, 1, 0], [0, 1, 0]];
    const r1 = buildRibbon(rail(0), rail(1), nrm, 10);
    const r2 = buildRibbon(rail(2), rail(3), nrm, 10);
    const merged = mergeIndexed([r1, r2]);
    expect(merged.positions.length / 3).toBe(12);
    expect(Math.max(...merged.indices)).toBe(11);
  });

  it('input non valido: bands null', () => {
    expect(buildFlowTubeMesh([], [], [], SECTION).bands).toBeNull();
  });
});
