// offset.js — curve offset della mezzeria (bordi pista/erba).
// samples: anello chiuso di punti ~equidistanti [{x, y}].
// offset POSITIVO = lato SINISTRO nel verso di percorrenza (y-up: normale
// sinistra = tangente ruotata di +90°). I bordi servono al footprint 2D del
// tubo (3A), all'estrusione (3B) e all'ancoraggio del terreno (Fase 6).
// Limite noto: offset maggiori del raggio locale di curvatura producono
// auto-intersezioni (accettato per la preview; gestito più avanti).

/** Polyline offset dell'anello chiuso. */
export function offsetClosedPolyline(samples, offset) {
  const n = samples.length;
  if (n < 3) return [];
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const prev = samples[(i - 1 + n) % n];
    const next = samples[(i + 1) % n];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    // normale sinistra (y-up): (-ty, tx)
    out[i] = {
      x: samples[i].x + -ty * offset,
      y: samples[i].y + tx * offset,
    };
  }
  return out;
}

/**
 * Bordi del tubo di flusso semplificato (Fase 3A).
 * section: { trackWidth, grassLeft, grassRight }.
 * Ritorna { trackLeft, trackRight, grassLeftOuter, grassRightOuter }.
 */
export function tubeOutlines(samples, section) {
  const half = section.trackWidth / 2;
  return {
    trackLeft: offsetClosedPolyline(samples, +half),
    trackRight: offsetClosedPolyline(samples, -half),
    grassLeftOuter: offsetClosedPolyline(samples, +(half + section.grassLeft)),
    grassRightOuter: offsetClosedPolyline(samples, -(half + section.grassRight)),
  };
}
