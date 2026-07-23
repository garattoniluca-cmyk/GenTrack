# MEMORY.md — Stato del progetto TrackGen

> Snapshot dello stato corrente. Aggiornare a ogni sessione di lavoro.
> Ultimo aggiornamento: **2026-07-23**

## Stato: FASE 3A IMPLEMENTATA (in validazione utente)

Fase 1 (poligonale) + Fase 2 (stondature) + Fase 3A (sezione/banking/
altimetria) su http://localhost:5173. **84 test unitari verdi**.

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
- [x] 2026-07-23 — Canvas portato a **5000×5000 m** (bordo tratteggiato, punti
      clampati), griglia default **10 m**, **barra di scala** stile cartina,
      zoom 0.08–200 px/m, griglia renderizzata solo nel viewport (perf).
      Costanti in `frontend/src/config.js` (D-013).
- [x] 2026-07-23 — **Snap sulla griglia visibile** (non sul gridSize base).
- [x] 2026-07-23 — **Distanza minima punti nuovi** 50 m configurabile (D-014):
      rifiuto aggiunta/inserimento se troppo vicino a punti o segmenti;
      feedback rosso + raggio di rispetto. 35 test verdi.
- [x] 2026-07-23 — Vista iniziale = **fit dell'intera area 5000×5000 m**;
      **tasto destro riservato all'app** (menu browser soppresso): destro su
      vertice apre **menu contestuale** con voce "Elimina punto"
      (disabilitata se poligono chiuso a 3 punti; chiusura con Esc/click/wheel).
- [x] 2026-07-23 — **Start su segmento + verso di percorrenza** (D-015):
      menu contestuale sui segmenti ("Imposta come start"), toggle
      orario/antiorario in toolbar (default = winding del disegno), marker a
      scacchi + freccia del verso, campi `startSegment`/`direction` nello
      schema condiviso, rimappatura indici su insert/remove. 38 test verdi.
- [x] 2026-07-23 — **Lunghezza minima start 700 m** configurabile ("Start min"
      in toolbar): menu disabilitato sui segmenti corti, errore in statusbar
      se un editing accorcia lo start sotto il minimo.
- [x] 2026-07-23 — **Fase 2 implementata** (scope approvato; niente Fase 3):
      - `geometry/spline.js`: Catmull-Rom centripeta chiusa (Barry-Goldman),
        ricampionamento arc-length adattivo (~5 m, clamp 200-2000),
        `generateControlPointsFromPolygon` (CP0 = metà start, ordine = verso)
        — 13 test nuovi, tot **51 verdi** (D-016, D-017; P-003 chiusa: rinviata)
      - Refactor editor: `useCanvasView` (vista/zoom/pan/scalebar condivisi),
        `GridLayer`, `colors.js` — GridCanvas riscritto sull'infrastruttura
      - `SplineEditor.jsx`: poligono ghost, curva, drag CP, click sulla curva
        per inserire CP, menu destro (CP0 non eliminabile), marker s=0 +
        freccia verso, lunghezza reale in statusbar
      - Store: slice `stage2Spline` (solo CP + fingerprint; resample derivato
        puro), `phase` UI, tab fase in toolbar (Fase 2 gated su
        chiuso+start+lunghezza minima), conferma rigenerazione se stage1 cambia
      - Dev: `window.__trackStore` esposto in DEV per debug/collaudo
      - Collaudo e2e via store: tracciato 9 punti → 5107.7 m, 1022 sample,
        CP0 esattamente a metà start, ordine antiorario corretto
- [x] 2026-07-23 — **PIVOT Fase 2 su feedback utente** (D-018): la Catmull-Rom
      distruggeva i rettilinei → mezzeria riscritta come **rettilinei esatti +
      raccordi ad arco tangenti** (fillet), raggio default 60 m in toolbar +
      override per-curva trascinando la maniglia sull'arco (label "R xx",
      gialla se personalizzata, destro = reset). Raggio clampato dagli spigoli
      adiacenti; vertici collineari senza arco. Schema stage2 aggiornato:
      {defaultCornerRadius, cornerRadii, resampledArcLength}. 55 test verdi
      (rettilinei esatti entro 1e-9, archi sul cerchio, lunghezza analitica).
- [x] 2026-07-23 — **Fix inserimento su segmento** (D-019): proiezione sul
      segmento (1 cm) invece dello snap a griglia che lo spostava fuori.
- [x] 2026-07-23 — **Fix "non passa alla Fase 2"** (D-020): `window.confirm`
      è bloccato in silenzio nel pannello preview → la conferma di
      rigenerazione inghiottiva il click. Sostituito con modale interna React.
      Regola: mai dialog nativi del browser nell'app.
- [x] 2026-07-23 — **Stondature asimmetriche a due bracci** (D-021): braccio
      `in` (prima del vertice) e `out` (dopo) indipendenti; Bézier quadratica
      tangente (C1); due maniglie per curva + guide; etichetta R~ (raggio
      minimo); braccio default 60 m in toolbar. Schema stage2 aggiornato:
      {defaultArmLength, cornerArms{in,out}}. 58 test verdi.
- [x] 2026-07-23 — **Fix definizione curve**: la mezzeria è ora disegnata con
      la geometria ESATTA (lineTo + quadraticCurveTo nativi, tassellati dal
      browser) → niente spezzate a nessuno zoom. I sample equidistanti restano
      solo per i calcoli; densità interna alzata (archi ~1 m, maxCount 5000).
- [x] 2026-07-23 — **Fase 3A implementata** (scope approvato: D-022, D-023):
      - `geometry/channel.js` — canali keyframe periodici step/linear/smoothstep
      - `geometry/trackNoise.js` — fBm periodico su cerchio (simplex-noise
        4.0.3 installato), limite pendenza per riscalo globale, spianamento
        start, deterministico (mulberry32)
      - `geometry/offset.js` — bordi tubo (offset mezzeria); ATTENZIONE
        semantica: percorrenza ccw → sinistra = interno curva
      - 26 test nuovi → tot **84 verdi**
      - Store: slice `stage3FlowTube` (section/bankingChannel/elevationNoise)
        + azioni; history estesa
      - UI: tab "3A · Tubo 2D", FlowTubeEditor (footprint erba/asfalto/righe,
        mezzeria termica per quota, legenda), BankingEditor (SVG, dblclick/
        drag/destro), ElevationProfile (SVG, colori per pendenza), pannello
        parametri sezione+rumore+statistiche, statusbar 3A
      - Schema stage3_flowTube riscritto (semplificato, rinvii documentati)
      - Collaudo e2e: 4920 m, limitatore pendenza aggancia esattamente il 10%
- [x] 2026-07-23 — **Banking rifatto PER CURVA** (D-024, UX a keyframe
      bocciata): click sul marker di curva nella mappa → popup angolo+rampe
      ritorno a zero; profilo C1 (rampe smoothstep, somma contributi, wrap
      periodico); grafico ora sola visualizzazione (BankingProfile);
      `geometry/banking.js` + 7 test (tot **91 verdi**); spline.js registra
      l'estensione s di ogni curva (sStart/sEnd); schema cornerBanking.
- [ ] Fase 3A: **validazione utente** in corso.
- ⚠ Punto dolente emergente: ogni reload/HMR perde il tracciato disegnato —
      valutare di anticipare import/export JSON (persistenza locale).
      Nota: i test con click sintetici via CDP sono inaffidabili (il pannello
      preview cambia dimensione e l'utente può interagire in parallelo) —
      collaudo via `window.__trackStore` + verifica interattiva manuale.

## In corso

- (niente)

## Prossimi passi (ordine sprint dal brief, §7)

1. ~~Setup repo~~ ✓ (manca solo lo scaffold backend, rinviato)
2. ~~Fase 1~~ ✓ · ~~Fase 2~~ ✓ → prossima: Fase 3 (tubo di flusso — NON ancora autorizzata)
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
