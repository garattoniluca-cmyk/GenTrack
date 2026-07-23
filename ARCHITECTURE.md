# ARCHITECTURE.md — TrackGen

> Architettura del sistema. Fonte: TRACKGEN_BRIEF.md §1–§4.
> Ultimo aggiornamento: 2026-07-23 (stato: pre-coding, architettura pianificata)

## Vista d'insieme

Due applicazioni + uno schema condiviso:

```
frontend (React+Vite+r3f)  ←— shared/track_schema.json —→  backend (FastAPI)
        │                                                        │
        └── TUTTA la pipeline geometrica (client-side)           └── persistenza JSON,
                                                                     AI assist, export opzionale
```

Il backend **non è indispensabile**: serve solo per (a) salvataggio/caricamento
JSON su disco, (b) endpoint AI assist, (c) export mesh pesante futuro. Scritto
per essere estendibile a un DB reale senza toccare gli schemi.

## Pipeline a 7 fasi (sequenziali, reversibili)

Modificare uno stage precedente rigenera gli stage successivi.

| # | Fase | Moduli chiave | Output nello schema |
|---|---|---|---|
| 1 | Editor poligonale 2D | `GridCanvas.jsx`, `polygon.js` | `stage1_polygon` |
| 2 | Spline editing | `SplineEditor.jsx`, `spline.js` | `stage2_spline` (+ resampledArcLength) |
| 3 | Tubo di flusso | `ChannelEditor.jsx`, `frame.js`, `flowTubeMesh.js`, `sectionProfile.js`, canali | `stage3_flowTube` |
| 4 | Elementi artificiali | `chicaneTemplates.js`, `splice.js` | `stage4_artificialElements` |
| 5 | Vie di fuga | `runoffEnvelope.js`, `runoffPatch.js`, `curvature.js` | `stage5_runoffAreas` |
| 6 | Terreno | `terrainNoise.js` | `stage6_terrain` |
| 7 | Export/viz 3D | `viewer3d/*`, `exportJSON.js`, GLTFExporter | — |

**Principio cardine**: ogni fase si ancora alla precedente per costruzione
geometrica. Continuità C1/C2 by design, mai stitching a posteriori.

## Punti architetturali chiave per fase

### Fase 2 — Spline
- Catmull-Rom chiusa (`CatmullRomCurve3`), tensione per punto opzionale.
- **Ricampionamento arc-length obbligatorio** dopo ogni modifica: tabella
  lookup `t → arcLength` per integrazione numerica (Simpson), poi inversione.
- Sample: `{t, s, x, y}` con `s` normalizzato [0,1].

### Fase 3 — Tubo di flusso
- **Parallel transport frame** (non Frenet): propagazione del frame per
  rotazione attorno a `t_prev × t_curr`.
- Banking = rotazione aggiuntiva attorno alla tangente, da `bankingChannel(s)`
  — input utente diretto.
- Canali (width/banking/elevation) come keyframe su `s` con transizioni
  `step` | `linear` | `smoothstep` (default consigliato: smoothstep).
- Profili sezione: `wall_edge` | `secondary_surface`; interpolazione parametri
  se stesso tipo, switch netto a `s` preciso se tipo diverso.
- `marshalGates`: override locale del profilo (varco nel muro), non modifica
  permanente del canale.
- Mesh: sezioni trasversali in 3D collegate a strip triangolare → BufferGeometry.

### Fase 4 — Chicane splice
- Template = funzione pura (velocità ingresso, offset, severità) → sotto-spline.
- Hermite blending agli estremi: tangenti template ≡ tangenti host in s1/s2.
- L'innesto cambia la lunghezza totale → **rimappatura esplicita** degli `s`
  di tutti i keyframe con `s > s2` (non ricalcolo implicito).

### Fase 5 — Vie di fuga
- `v_max(s) = sqrt(a_lat_max / curvatura(s))` clampato — euristica, non fisica.
- Tangenti di lunghezza `L = k·v²` proiettate verso l'esterno curva → inviluppo
  smoothed = **suggerimento** (`generatedEnvelope`); `manualOverride` ha priorità.
- Patch triangolate con earcut; i vertici di aggancio devono coincidere
  **esattamente** con quelli del bordo pista (no micro-gap).

### Fase 6 — Terreno
- Altezza per vertice: `baseHeight(s,d) + fBm pesato(s,d)`, con `d` = distanza
  con segno dal **bordo esterno effettivo** (non dalla mezzeria).
- Il bordo esterno va precalcolato come polyline densa (da mesh tubo + patch
  vie di fuga) su cui proiettare.
- Peso `smoothstep(0, falloff(s), d)` scala l'ampiezza per-ottava dell'fBm.
- Performance: struttura di accelerazione spaziale (griglia uniforme o k-d
  tree) per la proiezione punto→bordo su griglie grandi.
- Mesh = plane geometry regolare con altezza per vertice. No voxel.

## Flusso dati e stato

- `trackStore.js` (zustand) = **unica fonte di verità** frontend.
- `historyMiddleware.js` = undo/redo.
- Schema dati condiviso in `shared/track_schema.json`, rispecchiato dai
  Pydantic model backend (`track_schema.py`). Dettagli campi: vedi API.md.
- **Regola di consistenza**: tutti i canali parametrizzati su `s` arc-length
  normalizzato [0,1] — mai indici di control point.

## Struttura repository (pianificata)

Vedi FILES.md per la mappa completa file → responsabilità.
