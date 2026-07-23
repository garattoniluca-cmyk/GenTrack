# INTEGRATION.md — Contratti frontend ↔ backend

> Stato: pianificato. Ultimo aggiornamento: 2026-07-23

## Single source of truth: `shared/track_schema.json`

- JSON Schema condiviso che valida **sia** i dati frontend **sia** quelli backend.
- Frontend: `io/exportJSON.js` / `io/importJSON.js` serializzano lo stato
  Zustand da/verso questo schema.
- Backend: `models/track_schema.py` (Pydantic) rispecchia lo schema 1:1.
- **Regola**: qualunque modifica allo schema si fa PRIMA in
  `shared/track_schema.json`, poi si allineano Pydantic e store. Mai divergere.
- Versionamento nello schema stesso: `metadata.version` (attuale: `0.1.0`).
  Incrementare a ogni modifica breaking e annotare qui la migrazione.

## Flussi di integrazione

### Salvataggio/caricamento progetto
```
Zustand store → exportJSON.js → POST/PUT /tracks → file_store.py → ./data/tracks/{id}.json
./data/tracks/{id}.json → GET /tracks/{id} → importJSON.js → Zustand store
```
Il frontend deve funzionare anche **senza backend** (download/upload JSON
locale dal browser come fallback).

### Export mesh
- Default: client-side con `GLTFExporter` di Three.js (immediato).
- Opzionale: delega a `POST /generation/export-mesh` per post-processing
  pesanti (decimazione, UV unwrapping) non pratici in browser.

### AI assist (futuro, non bloccante)
- Frontend chiama `POST /ai/suggest-layout` → il backend interroga Claude API
  via `ai_prompt_service.py` → risposta conforme allo schema (es. un
  `stage1_polygon` proposto).

## Dipendenze tra fasi (contratto interno alla pipeline)

Modificare uno stage invalida i successivi. Catena di derivazione:

```
stage1_polygon → stage2_spline → stage3_flowTube → stage4 (splice) ─┐
                                        │                            │
                                        ├→ stage5_runoffAreas ←──────┘
                                        └→ stage6_terrain (dipende dal bordo
                                           esterno effettivo: tubo + runoff)
```

- Dopo ogni modifica a stage2: ricampionare arc-length (obbligatorio).
- Dopo uno splice (stage4): rimappare gli `s` di tutti i keyframe con `s > s2`
  in ogni canale (width/banking/elevation/profiles/gates/runoff/falloff).
- Il terreno (stage6) proietta sul **bordo esterno effettivo** precalcolato
  (mesh tubo + patch runoff), non sulla mezzeria.
- I vertici di aggancio delle patch runoff coincidono esattamente con i
  vertici del bordo pista (stessa posizione — no micro-gap).

## Librerie (versioni da fissare al setup)

| Scopo | Libreria |
|---|---|
| State management | zustand |
| Editor 2D | Konva.js o canvas nativo (pendente P-001) |
| Spline/geometria 3D | three.js (`CatmullRomCurve3`) |
| React + 3D | @react-three/fiber, @react-three/drei |
| Triangolazione | earcut |
| Rumore | simplex-noise |
| Backend | FastAPI + Pydantic |
| Build | Vite |
