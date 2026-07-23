# MEMORY.md — Stato del progetto TrackGen

> Snapshot dello stato corrente. Aggiornare a ogni sessione di lavoro.
> Ultimo aggiornamento: **2026-07-23**

## Stato: FASE 1 IMPLEMENTATA (in validazione utente)

Editor poligonale 2D funzionante su http://localhost:5173 (`npm run dev` in
`frontend/`). 25 test unitari verdi su `geometry/polygon.js`.

## Fatto

- [x] 2026-07-23 — Ricevuto e analizzato TRACKGEN_BRIEF.md (documento di progetto)
- [x] 2026-07-23 — Creato sistema di file di memoria (CLAUDE.md + 9 file)
- [x] 2026-07-23 — `git init`, primo commit, repo GitHub creato e collegato:
      https://github.com/garattoniluca-cmyk/GenTrack (pubblico, branch `main`).
      GitHub CLI installato e autenticato (account garattoniluca-cmyk).
      Identità git repo-locale: garattoniluca-cmyk (la globale resta mc12027).
- [x] 2026-07-23 — Recap Fase 1 discusso; l'utente ha approvato **Konva.js**
      (P-001 → D-010). Scope ristretto: solo Fase 1 + preview, niente spline.
- [x] 2026-07-23 — **Fase 1 implementata**:
      - Scaffold Vite+React in `frontend/`; deps: zustand, konva, react-konva, vitest
      - `shared/track_schema.json` (schema completo dal brief §3)
      - `geometry/polygon.js` — snap, intersezioni (aperto+anello chiuso),
        lunghezze segmenti/totale — **25 test verdi**
      - `state/trackStore.js` + `historyMiddleware.js` (undo/redo con batching drag)
      - `GridCanvas.jsx` — griglia+snap, validazione live (rosso), chiusura sul
        primo punto, zoom/pan, drag vertici, inserimento punto su segmento
        (a poligono chiuso), etichette lunghezza sui segmenti
      - `App.jsx` — toolbar (griglia/undo/redo/riapri/reset), pannello JSON
        `stage1_polygon`, barra di stato (punti/segmenti/lunghezza/conflitti)
      - Preview attiva: `.claude/launch.json` → trackgen-frontend @5173
      - Bug risolti: loop infinito getSnapshot (selettori zustand),
        centraggio vista su dimensione container reale
- [ ] Fase 1: **validazione visiva/interattiva dell'utente** in corso.
      Nota: i test con click sintetici via CDP sono inaffidabili (il pannello
      preview cambia dimensione e l'utente può interagire in parallelo) —
      la verifica interattiva va fatta a mano dall'utente.

## In corso

- (niente)

## Prossimi passi (ordine sprint dal brief, §7)

1. ~~Setup repo~~ ✓ (manca solo lo scaffold backend, rinviato)
2. ~~Fase 1~~ ✓ → Fase 2: spline con arc-length resampling (senza 3D)
3. Fase 3 base: estrusione flat con profilo fisso (validare frame + strip triangolare)
4. Canali width/banking/elevation con keyframe e interpolazione
5. Fase 6: terreno base (falloff costante, senza vie di fuga)
6. Fase 5: vie di fuga (inviluppo + editing manuale + integrazione terreno)
7. Fase 4: elementi artificiali (chicane splice)
8. Export GLTF/OBJ, pannelli UI, persistenza file JSON

## Problemi aperti / decisioni pendenti

- Larghezza asimmetrica (`widthLeft`/`widthRight`): supportarla da subito o
  partire simmetrici? (brief la cita come opzione, P-002)
- Librerie delle fasi successive non ancora installate: three,
  @react-three/fiber, drei, earcut, simplex-noise (si aggiungono quando servono)

## Note di contesto

- Il progetto nasce da esperienze passate negative con lo stitching del
  terreno a posteriori — è il motivo del principio "il rumore nasce dal
  bordo" (vedi DECISIONS.md, D-001).
- Remote GitHub: `origin` → https://github.com/garattoniluca-cmyk/GenTrack
