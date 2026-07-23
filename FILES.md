# FILES.md — Mappa file ↔ responsabilità

> Stato: **pianificato** — nessun file sorgente esiste ancora. Aggiornare la
> colonna "Stato" man mano che i file vengono creati (⏳ pianificato,
> 🚧 in corso, ✅ implementato, 🧪 testato).
> Ultimo aggiornamento: 2026-07-23

## Root

| File | Responsabilità | Stato |
|---|---|---|
| `TRACKGEN_BRIEF.md` | Documento di progetto (fonte di verità) | ✅ |
| `CLAUDE.md` + file memoria | Documentazione di lavoro | ✅ |
| `shared/track_schema.json` | JSON Schema condiviso FE/BE, single source of truth | ✅ |
| `.claude/launch.json` | Config preview dev server (trackgen-frontend @5173) | ✅ |

## frontend/ (React + Vite + react-three-fiber)

| File | Responsabilità | Stato |
|---|---|---|
| `src/main.jsx`, `src/App.jsx` | Entry point e shell app (toolbar, statusbar, pannello JSON) | ✅ |
| `src/state/trackStore.js` | Zustand store: stage1Polygon + azioni (add/update/insert/close/reopen/reset) | ✅ |
| `src/state/historyMiddleware.js` | Undo/redo con batching per drag (beginBatch/endBatch) | ✅ |
| `index.html`, `vite.config.js`, `package.json` | Setup build (script: dev/build/test) | ✅ |

### src/geometry/ — logica pura, NO React, testabile isolata

| File | Responsabilità | Fase | Stato |
|---|---|---|---|
| `polygon.js` | Snap, self-intersection (polyline aperta + anello chiuso), lunghezze segmenti/totale (brute-force O(n²), n<100) | 1 | 🧪 |
| `polygon.test.js` | 25 test sugli invarianti | 1 | ✅ |
| `spline.js` | Mezzeria fillet: rettilinei esatti + raccordi ad arco tangenti, clamp raggi, arc-length resampling adattivo, s=0 a metà start (D-018) | 2 | 🧪 |
| `spline.test.js` | 17 test sugli invarianti (rettilinei esatti, archi sul cerchio, lunghezza analitica, verso, clamp) | 2 | ✅ |
| `frame.js` | Parallel-transport frame lungo la curva | 3 | ⏳ |
| `curvature.js` | Stima curvatura + euristica velocità `v=sqrt(a_lat/κ)` | 5 (usata anche in 4) | ⏳ |
| `sectionProfile.js` | Profili trasversali (wall_edge, secondary_surface), interpolazione | 3 | ⏳ |
| `widthChannel.js` | Canale larghezza (step/lerp/smoothstep) | 3 | ⏳ |
| `bankingChannel.js` | Canale banking | 3 | ⏳ |
| `elevationChannel.js` | Canale altitudine | 3 | ⏳ |
| `flowTubeMesh.js` | Estrusione finale: spline+canali → BufferGeometry | 3 | ⏳ |
| `runoffEnvelope.js` | Inviluppo tangenti-velocità per vie di fuga | 5 | ⏳ |
| `runoffPatch.js` | Triangolazione patch vie di fuga (earcut) | 5 | ⏳ |
| `chicaneTemplates.js` | Libreria elementi artificiali parametrici | 4 | ⏳ |
| `splice.js` | Innesto template su spline con continuità C1 + rimappatura s | 4 | ⏳ |
| `terrainNoise.js` | fBm ancorato in coordinate (s,d), projectToSpline | 6 | ⏳ |

### src/components/

| File | Responsabilità | Fase | Stato |
|---|---|---|---|
| `editor2d/GridCanvas.jsx` | Disegno+editing poligono: snap, validazione live, chiusura, zoom/pan, drag vertici, inserimento su segmento, etichette, start/verso, menu destro | 1 | ✅ |
| `editor2d/SplineEditor.jsx` | Editing CP spline: drag, inserimento su curva, menu destro, marker s=0, poligono ghost | 2 | ✅ |
| `editor2d/useCanvasView.js` | Hook vista condivisa: fit, zoom, pan, conversioni y-up, scalebar | — | ✅ |
| `editor2d/GridLayer.jsx` | Griglia + bordo area, render solo viewport | — | ✅ |
| `editor2d/colors.js` | Palette condivisa editor | — | ✅ |
| `editor2d/ChannelEditor.jsx` | Grafici s→width/bank/elevation | 3 | ⏳ |
| `viewer3d/Scene.jsx` | Scena r3f | 7 | ⏳ |
| `viewer3d/TrackMesh.jsx` | Render tubo di flusso (multi-material/vertex colors) | 7 | ⏳ |
| `viewer3d/TerrainMesh.jsx` | Render terreno (shading altezza/pendenza) | 7 | ⏳ |
| `viewer3d/RunoffOverlay.jsx` | Overlay vie di fuga (generato vs override) | 7 | ⏳ |
| `panels/SectionProfilePanel.jsx` | UI profili sezione | 3 | ⏳ |
| `panels/ChicaneLibraryPanel.jsx` | UI libreria chicane | 4 | ⏳ |
| `panels/ExportPanel.jsx` | UI export | 7 | ⏳ |

### src/io/

| File | Responsabilità | Stato |
|---|---|---|
| `exportJSON.js` / `importJSON.js` | Serializzazione progetto ↔ schema condiviso | ⏳ |

## backend/ (FastAPI, no DB)

| File | Responsabilità | Stato |
|---|---|---|
| `app/main.py` | Entry FastAPI | ⏳ |
| `app/routers/track.py` | CRUD in-memory / file JSON | ⏳ |
| `app/routers/generation.py` | Task pesanti (mesh export, AI prompt) | ⏳ |
| `app/routers/ai_assist.py` | Suggerimenti AI (profili, chicane) | ⏳ |
| `app/models/track_schema.py` | Pydantic models ≡ shared/track_schema.json | ⏳ |
| `app/storage/file_store.py` | Persistenza `./data/tracks/{id}.json`, lock su file; interfaccia save/load/list_all/delete sostituibile 1:1 con repository DB | ⏳ |
| `app/services/mesh_export_service.py` | Export OBJ/GLTF lato server (opzionale) | ⏳ |
| `app/services/ai_prompt_service.py` | Prompt AI (Claude API) | ⏳ |
| `requirements.txt`, `pyproject.toml` | Setup | ⏳ |
