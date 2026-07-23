// flowTubeMesh.js — Fase 3B: estrusione del tubo di flusso (D-026).
// Modulo PURO: produce array indicizzati (positions/normals/uvs/indices)
// senza dipendere da three — testabile con vitest; il componente 3D li
// avvolge in BufferGeometry.
//
// Coordinate three.js (Y-up): X = mondo.x, Y = quota z, Z = −mondo.y.
//
// Frame per anello (D-026, deviazione motivata da D-003):
//   T  = tangente 3D (differenze centrali, wrap periodico)
//   Lh = normalize(UP × T) → laterale ORIZZONTALE, punta a SINISTRA
//   L  = Lh ruotato attorno a T del roll (Rodrigues; L⊥T ⇒ formula ridotta)
//   U  = T × L → normale della carreggiata
// Con roll=0 la strada è perfettamente orizzontale in trasversale (come una
// strada vera); nessun flip possibile (pendenza ≤10% ⇒ T mai verticale);
// il banking resta SOLO input utente (D-002). Niente parallel transport:
// avrebbe twist accumulato e mismatch di chiusura al traguardo.
//
// Sezione (da sinistra a destra nel verso di marcia; offset positivi a SX):
//   muroSX ▌ erbaSX │ rigaSX │ ASFALTO │ rigaDX │ erbaDX ▐ muroDX
// I punti di confine tra fasce sono calcolati UNA VOLTA per anello e
// riusati: fasce adiacenti condividono coordinate identiche al bit →
// nessun buco, nessuna T-junction. I muri sono VERTICALI (gravità), alti
// wallHeight, sui bordi esterni dell'erba; l'erba giace nel piano bankato.
// Chiusura: ring N−1 → ring 0 (indici modulari), nessuna cucitura.

export const WALL_HEIGHT = 2; // m

// ---- Metodo per le CURVE SECCHE (D-028) ----
// Sul lato INTERNO di una curva le sezioni convergono verso il centro di
// curvatura: a distanza laterale d = R si incontrano tutte, oltre si
// incrociano (muri che si intersecano, geometria ripiegata). Un verge da
// 8 m dentro un raggio da 12 è geometricamente impossibile: come nei
// tornanti reali, l'ERBA sul lato interno si RESTRINGE al raggio
// disponibile (fino a un minimo da cordolo), il muro segue il bordo
// ristretto. L'ASFALTO non viene MAI toccato: se non ci sta nemmeno lui,
// resta l'errore rosso (si allargano i bracci in Fase 2).
export const INNER_MARGIN = 1.5; // m di rispetto dal centro di curvatura
export const MIN_VERGE = 0.5; // larghezza minima erba interna (cordolo)
export const VERGE_SLEW = 0.5; // max variazione larghezza (m per m lungo s)

/** Curvatura firmata 2D per sample (Menger): >0 = svolta a sinistra. */
export function signedCurvature(samples) {
  const n = samples.length;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const a = samples[(i - 1 + n) % n];
    const b = samples[i];
    const c = samples[(i + 1) % n];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const bcx = c.x - b.x;
    const bcy = c.y - b.y;
    const cross2 = abx * bcy - aby * bcx;
    const lab = Math.hypot(abx, aby);
    const lbc = Math.hypot(bcx, bcy);
    const lac = Math.hypot(c.x - a.x, c.y - a.y);
    const denom = lab * lbc * lac;
    out[i] = denom > 1e-12 ? (2 * cross2) / denom : 0;
  }
  return out;
}

/**
 * Larghezze erba EFFETTIVE per anello: sul lato interno della curva la
 * larghezza è limitata a (R_locale − margine − w), con minimo MIN_VERGE,
 * e la variazione lungo s è rate-limitata (VERGE_SLEW) per un cuneo
 * progressivo come nei verge reali. Ritorna { effL, effR }.
 */
export function computeVergeWidths(samples, section, totalLength) {
  const n = samples.length;
  const w = section.trackWidth / 2;
  const kappa = signedCurvature(samples);
  const effL = new Array(n).fill(section.grassLeft);
  const effR = new Array(n).fill(section.grassRight);
  for (let i = 0; i < n; i++) {
    const k = kappa[i];
    if (k > 1e-6) {
      // svolta a sinistra → interno a SINISTRA
      const avail = 1 / k - INNER_MARGIN - w;
      effL[i] = Math.min(section.grassLeft, Math.max(MIN_VERGE, avail));
    } else if (k < -1e-6) {
      const avail = 1 / -k - INNER_MARGIN - w;
      effR[i] = Math.min(section.grassRight, Math.max(MIN_VERGE, avail));
    }
  }
  // rate-limit periodico (avanti+indietro, 2 giri per convergere sul wrap)
  const ds = totalLength / n;
  const maxStep = VERGE_SLEW * ds;
  for (const arr of [effL, effR]) {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i <= n; i++) {
        const j = i % n;
        arr[j] = Math.min(arr[j], arr[(i - 1) % n] + maxStep);
      }
      for (let i = n - 1; i >= -1; i--) {
        const j = (i + n) % n;
        arr[j] = Math.min(arr[j], arr[(i + 1 + n) % n] + maxStep);
      }
    }
  }
  return { effL, effR };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * Ribbon indicizzato tra due rail chiusi (railA = lato sinistro, railB =
 * destro rispetto alla marcia). Winding CCW visto dal lato della normale.
 * normals: array per-anello [nx,ny,nz] (condiviso dai due vertici).
 * flip: inverte il winding (per facce che guardano dall'altra parte).
 * uv: u = metri lungo il tracciato, v = 0 (A) / 1 (B).
 */
export function buildRibbon(railA, railB, normals, totalLength, flip = false) {
  const n = railA.length;
  const positions = new Float32Array(n * 2 * 3);
  const nrm = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  const indices = new Uint32Array(n * 6);

  for (let i = 0; i < n; i++) {
    const u = (i / n) * totalLength;
    positions.set(railA[i], i * 6);
    positions.set(railB[i], i * 6 + 3);
    nrm.set(normals[i], i * 6);
    nrm.set(normals[i], i * 6 + 3);
    uvs[i * 4] = u;
    uvs[i * 4 + 1] = 0;
    uvs[i * 4 + 2] = u;
    uvs[i * 4 + 3] = 1;

    const a = i * 2;
    const b = i * 2 + 1;
    const a1 = ((i + 1) % n) * 2;
    const b1 = ((i + 1) % n) * 2 + 1;
    if (!flip) {
      indices.set([a, b, b1, a, b1, a1], i * 6);
    } else {
      indices.set([a, b1, b, a, a1, b1], i * 6);
    }
  }
  return { positions, normals: nrm, uvs, indices };
}

/** Concatena più geometrie indicizzate in una (per materiale condiviso). */
export function mergeIndexed(parts) {
  let vCount = 0;
  let iCount = 0;
  for (const p of parts) {
    vCount += p.positions.length / 3;
    iCount += p.indices.length;
  }
  const positions = new Float32Array(vCount * 3);
  const normals = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const indices = new Uint32Array(iCount);
  let vOff = 0;
  let iOff = 0;
  for (const p of parts) {
    positions.set(p.positions, vOff * 3);
    normals.set(p.normals, vOff * 3);
    uvs.set(p.uvs, vOff * 2);
    for (let k = 0; k < p.indices.length; k++) {
      indices[iOff + k] = p.indices[k] + vOff;
    }
    vOff += p.positions.length / 3;
    iOff += p.indices.length;
  }
  return { positions, normals, uvs, indices };
}

/**
 * Costruisce le geometrie del tubo di flusso.
 * samples: [{x,y}] mezzeria (N, chiusi) · z: quota per sample ·
 * rollDeg: roll per sample (positivo = sinistra alzata) ·
 * section: {trackWidth, lineWidth, grassLeft, grassRight}.
 * Ritorna { bands: {asphalt, lines, grass, walls}, stats }.
 */
export function buildFlowTubeMesh(samples, z, rollDeg, section, { wallHeight = WALL_HEIGHT } = {}) {
  const n = samples?.length ?? 0;
  if (n < 3 || z.length !== n || rollDeg.length !== n) {
    return { bands: null, stats: { triangles: 0, vertices: 0 } };
  }
  const w = section.trackWidth / 2;
  const lw = section.lineWidth;

  // punti 3D della mezzeria (coordinate three: Y-up)
  const P = new Array(n);
  for (let i = 0; i < n; i++) {
    P[i] = [samples[i].x, z[i], -samples[i].y];
  }

  // curve secche (D-028): larghezze erba effettive per anello
  const tLen = totalLen(samples);
  const { effL, effR } = computeVergeWidths(samples, section, tLen);

  // rail per fascia (condivisi al bit tra fasce adiacenti)
  const rWallLTop = new Array(n);
  const rGrassLOut = new Array(n); // = base muro SX
  const rLineLOut = new Array(n); // = bordo interno erba SX (+w)
  const rLineLIn = new Array(n); // (+w−lw)
  const rLineRIn = new Array(n); // (−(w−lw))
  const rLineROut = new Array(n); // (−w) = bordo interno erba DX
  const rGrassROut = new Array(n); // = base muro DX
  const rWallRTop = new Array(n);
  const upN = new Array(n); // normale carreggiata per anello
  const leftN = new Array(n); // laterale (per le normali dei muri)
  const grassLN = new Array(n); // normale erba SX (piano bankato o apron piatto)
  const grassRN = new Array(n); // normale erba DX

  const UP = [0, 1, 0];
  for (let i = 0; i < n; i++) {
    const T = norm(sub(P[(i + 1) % n], P[(i - 1 + n) % n]));
    const Lh = norm(cross(UP, T)); // orizzontale, punta a sinistra
    const U0 = norm(cross(T, Lh)); // ~verticale
    const roll = (rollDeg[i] * Math.PI) / 180;
    const c = Math.cos(roll);
    const s = Math.sin(roll);
    // Rodrigues ridotto (Lh ⊥ T): L = Lh·cos + (T×Lh)·sin
    const L = [
      Lh[0] * c + U0[0] * s,
      Lh[1] * c + U0[1] * s,
      Lh[2] * c + U0[2] * s,
    ];
    const U = norm(cross(T, L));
    upN[i] = U;
    leftN[i] = L;

    // METODO SOLIDO (D-026 rev.4, prescrizione utente): SWEEP RIGIDO.
    // La sezione trasversale è un profilo RIGIDO che ruota attorno alla
    // MEZZERIA della strada del roll(s) e trasla lungo il path a quota
    // z(s). Nessun termine di lift, nessun cambio di lato, nessun caso
    // speciale: l'unica variazione lungo s è roll(s) e z(s), entrambi C1
    // per costruzione → nessuna deformazione possibile.
    // Il lato interno scende sotto la quota nominale: è CORRETTO — il
    // terreno (Fase 6) si cuce ai bordi del tubo (D-001) e seguirà il
    // bordo dove sta. Anche i muri sono solidali alla sezione
    // (perpendicolari al piano bankato, come nei catini reali).
    void Lh;
    void U0;
    const at = (d) => [
      P[i][0] + L[0] * d,
      P[i][1] + L[1] * d,
      P[i][2] + L[2] * d,
    ];

    rGrassLOut[i] = at(w + effL[i]);
    rLineLOut[i] = at(w);
    rLineLIn[i] = at(w - lw);
    rLineRIn[i] = at(-(w - lw));
    rLineROut[i] = at(-w);
    rGrassROut[i] = at(-(w + effR[i]));
    grassLN[i] = U;
    grassRN[i] = U;
    // muri solidali alla sezione: estrusi lungo la normale del piano bankato
    rWallLTop[i] = [
      rGrassLOut[i][0] + U[0] * wallHeight,
      rGrassLOut[i][1] + U[1] * wallHeight,
      rGrassLOut[i][2] + U[2] * wallHeight,
    ];
    rWallRTop[i] = [
      rGrassROut[i][0] + U[0] * wallHeight,
      rGrassROut[i][1] + U[1] * wallHeight,
      rGrassROut[i][2] + U[2] * wallHeight,
    ];
  }

  const rightN = leftN.map((l) => [-l[0], -l[1], -l[2]]);

  const bands = {
    asphalt: buildRibbon(rLineLIn, rLineRIn, upN, tLen),
    lines: mergeIndexed([
      buildRibbon(rLineLOut, rLineLIn, upN, tLen),
      buildRibbon(rLineRIn, rLineROut, upN, tLen),
    ]),
    grass: mergeIndexed([
      buildRibbon(rGrassLOut, rLineLOut, grassLN, tLen),
      buildRibbon(rLineROut, rGrassROut, grassRN, tLen),
    ]),
    walls: mergeIndexed([
      // muro SX: faccia interna verso destra (−L) → winding flip
      buildRibbon(rWallLTop, rGrassLOut, rightN, tLen, true),
      // muro DX: faccia interna verso sinistra (+L)
      buildRibbon(rWallRTop, rGrassROut, leftN, tLen, false),
    ]),
  };

  let triangles = 0;
  let vertices = 0;
  for (const b of Object.values(bands)) {
    triangles += b.indices.length / 3;
    vertices += b.positions.length / 3;
  }
  return { bands, stats: { triangles, vertices } };
}

/** Lunghezza della polyline chiusa (per le UV in metri). */
function totalLen(samples) {
  let L = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % samples.length];
    L += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return L;
}

/** Area minima dei triangoli (per i test: nessun triangolo degenere). */
export function minTriangleArea({ positions, indices }) {
  let minA = Infinity;
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k] * 3;
    const b = indices[k + 1] * 3;
    const c = indices[k + 2] * 3;
    const ab = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
    const ac = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
    const cr = cross(ab, ac);
    const area = 0.5 * Math.hypot(cr[0], cr[1], cr[2]);
    if (area < minA) minA = area;
  }
  return minA;
}
