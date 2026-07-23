# API.md — Backend e schema dati

> Stato: **pianificato** — il backend non esiste ancora. Gli endpoint sotto
> sono il contratto previsto; aggiornare quando implementati.
> Ultimo aggiornamento: 2026-07-23

## Principi

- Backend FastAPI **minimale e non indispensabile**: la pipeline gira client-side.
- Nessuna autenticazione/multi-utente (tool locale di prototipazione).
- Ogni richiesta validata con i Pydantic model (`track_schema.py`) che
  rispecchiano **esattamente** `shared/track_schema.json`.
- Persistenza dietro `file_store.py`: `save(track)`, `load(id)`, `list_all()`,
  `delete(id)` — nessun dettaglio filesystem esposto oltre questo layer.
  File in `./data/tracks/{id}.json` con lock semplice su file.

## Endpoint previsti

### routers/track.py — CRUD progetti
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/tracks` | Lista progetti (list_all) |
| GET | `/tracks/{id}` | Carica progetto |
| POST | `/tracks` | Crea/salva progetto (validazione Pydantic) |
| PUT | `/tracks/{id}` | Aggiorna progetto |
| DELETE | `/tracks/{id}` | Elimina progetto |

### routers/generation.py — task pesanti (opzionali)
| Metodo | Path | Descrizione |
|---|---|---|
| POST | `/generation/export-mesh` | Export OBJ/GLTF lato server (decimazione, UV unwrapping) — delega a `mesh_export_service.py` |

### routers/ai_assist.py — assistenza AI (feature futura, non bloccante per MVP)
| Metodo | Path | Descrizione |
|---|---|---|
| POST | `/ai/suggest-layout` | Primo layout poligono dati vincoli (lunghezza target, n° curve, stile) — via Claude API |
| POST | `/ai/suggest-profile` | Suggerimento profili/chicane |

## Schema dati condiviso (riassunto — completo in TRACKGEN_BRIEF.md §3)

Oggetto `track` con chiavi top-level:

- `id`, `name`, `metadata` (createdAt/updatedAt/version)
- `stage1_polygon`: `points[{x,y}]`, `gridSize`, `closed`
- `stage2_spline`: `controlPoints[{id,x,y,tension}]`,
  `resampledArcLength{totalLength, sampleCount, samples[{t,s,x,y}]}`
- `stage3_flowTube`:
  - `widthChannel[{s, value, transition}]`
  - `bankingChannel[{s, angleDeg, transition}]`
  - `elevationChannel[{s, height, transition}]`
  - `sectionProfiles[{s, profileType: "wall_edge"|"secondary_surface", wallHeight, secondarySurface{material,width}|null}]`
  - `marshalGates[{s, width, side}]`
  - `transition ∈ {"step","linear","smoothstep"}`
- `stage4_artificialElements[{id, type, insertAt{sStart,sEnd}, params{entrySpeedKph, lateralOffset, severity}}]`
- `stage5_runoffAreas[{id, sRange[2], side, generatedEnvelope[{s,d}], manualOverride[{x,y}], surfaceType}]`
- `stage6_terrain`: `falloffDistance`, `falloffDistanceCurve[{s,value}]`,
  `noiseParams{baseFrequencyS, baseFrequencyD, octaves, persistence, lacunarity, seed}`

**Regola di consistenza**: ogni canale è parametrizzato su `s` normalizzato
[0,1] sull'arc-length totale (vedi DECISIONS.md D-006).

## Errori / convenzioni (da definire all'implementazione)

- 404 per id inesistente, 422 per validazione Pydantic fallita.
- CORS aperto a localhost (dev tool locale).
