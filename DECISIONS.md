# DECISIONS.md — Registro decisioni tecniche

> Ogni decisione: ID, data, decisione, motivazione, alternative scartate.
> Le D-001…D-008 derivano dal brief (vincoli fondativi, §8 e sparsi).
> Ultimo aggiornamento: 2026-07-23

## Vincoli fondativi (dal brief — NON rinegoziabili senza il proprietario del progetto)

### D-001 — Terreno ancorato al bordo, mai stitching
**Data**: 2026-07-23 (dal brief)
**Decisione**: il rumore del terreno nasce in coordinate (s, d) ancorate al
bordo esterno effettivo del tubo di flusso; l'ampiezza è pesata da
smoothstep sul falloff. Mai generare terreno in coordinate mondo e cucirlo.
**Motivazione**: lo stitching a posteriori è la fonte primaria dei problemi
già riscontrati in passato dal proprietario del progetto con questo approccio.
**Scartato**: heightmap globale + blending sui bordi.

### D-002 — Banking sempre input utente esplicito
**Data**: 2026-07-23 (dal brief)
**Decisione**: `bankingChannel` è definito dall'utente per keyframe; mai
derivato da curvatura o altre proprietà geometriche.
**Motivazione**: controllo creativo esplicito; evitare accoppiamenti impliciti
tra fasi.

### D-003 — Parallel transport frame, non Frenet-Serret
**Data**: 2026-07-23 (dal brief)
**Decisione**: frame lungo la spline via parallel transport (rotazione
incrementale attorno a t_prev × t_curr).
**Motivazione**: Frenet-Serret flippa nei punti di flesso/rettilineo →
twist della mesh.

### D-004 — Mesh esplicite, no marching cubes/voxel
**Data**: 2026-07-23 (dal brief)
**Decisione**: pista = estrusione di sezioni (strip triangolare); terreno =
griglia regolare con altezza per vertice.
**Motivazione**: più precise e meno costose; voxel non necessari.

### D-005 — No database in questa fase
**Data**: 2026-07-23 (dal brief)
**Decisione**: persistenza su file JSON locali (`./data/tracks/{id}.json`)
dietro `file_store.py` con interfaccia repository (save/load/list_all/delete).
**Motivazione**: schema non ancora stabile; l'interfaccia permette lo swap
1:1 con un DB in futuro senza toccare gli schemi.

### D-006 — Parametrizzazione universale su arc-length normalizzato
**Data**: 2026-07-23 (dal brief)
**Decisione**: tutti i canali (width, banking, elevation, sectionProfiles,
runoff, falloff) usano `s ∈ [0,1]` sull'arc-length totale; mai indici di
control point.
**Motivazione**: interpolazione indipendente dalla densità di campionamento.
**Corollario**: lo splice di una chicane (fase 4) cambia la lunghezza totale
→ rimappatura esplicita degli `s > s2` di tutti i keyframe.

### D-007 — Pipeline geometrica interamente client-side
**Data**: 2026-07-23 (dal brief)
**Decisione**: tutta la geometria gira nel browser; backend solo per
persistenza, AI assist, export pesante opzionale.
**Motivazione**: iterazione rapida, backend non bloccante per l'MVP.

### D-008 — Euristica velocità dichiarata come stima, non simulazione
**Data**: 2026-07-23 (dal brief)
**Decisione**: `v_max = sqrt(a_lat_max/κ)` con `a_lat_max` configurabile
(default 15–20 m/s²), clampata a v_max rettilineo. La UI deve dichiararla
come stima approssimativa.
**Motivazione**: serve solo per dimensionare vie di fuga e chicane, non per
simulazione fisica accurata.

## Decisioni operative (prese durante lo sviluppo)

### D-009 — Sistema di file di memoria
**Data**: 2026-07-23
**Decisione**: documentazione di lavoro in 10 file markdown in root
(CLAUDE.md + 9 file di memoria), aggiornati a ogni sessione. Doc in
italiano, codice in inglese.
**Motivazione**: continuità tra sessioni Claude Code.

### D-010 — Konva.js per gli editor 2D (chiude P-001)
**Data**: 2026-07-23 (approvata dall'utente)
**Decisione**: tutti gli editor 2D (poligono, spline, canali, vie di fuga)
usano Konva.js + react-konva.
**Motivazione**: le fasi 2/3/5 sono manipolazione diretta di maniglie
trascinabili (drag, hit-testing, hover) — esattamente ciò che Konva risolve;
il canvas nativo richiederebbe di riscrivere questa infrastruttura 4 volte.
**Scartato**: canvas nativo (zero dipendenze ma +2-3 giorni di codice
infrastrutturale e più superficie di bug).

### D-011 — Convenzione coordinate: metri, y-up
**Data**: 2026-07-23
**Decisione**: 1 unità griglia = 1 metro; asse y verso l'alto (coerente con
Three.js). Lo Stage Konva usa `scaleY` negativa per la conversione dal sistema
schermo (y-down); le etichette testo ri-flippano con `scaleY=-1` locale.
La tolleranza di chiusura è in **pixel schermo** (indipendente dallo zoom).
**Motivazione**: un'unica convenzione da fase 1 fino al 3D senza conversioni.

### D-012 — Interazioni editing Fase 1
**Data**: 2026-07-23
**Decisione**:
- Poligono **aperto** = modalità disegno: click aggiunge in coda; è consentito
  creare intersezioni (evidenziate in rosso), ma la **chiusura è bloccata**
  finché esistono conflitti (da brief §4.1).
- Poligono **chiuso** = modalità editing: click su un segmento inserisce un
  punto; i vertici sono trascinabili in entrambe le modalità (drag fluido,
  snap alla griglia al rilascio).
- Un drag = **un solo entry di undo** (batching nel historyMiddleware).
- I valori derivati (conflitti, lunghezze) si calcolano nei componenti con
  `useMemo` da funzioni pure — MAI selettori zustand che costruiscono nuovi
  oggetti (causano loop infiniti di re-render con getSnapshot).
**Motivazione**: separare disegno/editing evita ambiguità del click; il
batching evita centinaia di undo-step per un singolo trascinamento.

### D-013 — Area di lavoro 5000×5000 m, griglia default 10 m
**Data**: 2026-07-23 (richiesta utente)
**Decisione**: il canvas copre ±2500 m dall'origine (bordo tratteggiato
visibile); i punti sono clampati dentro l'area. Griglia default 10 m
(auto-ispessita ×5 quando a schermo scenderebbe sotto 8 px). Zoom
0.08–200 px/m (al minimo l'intera area è visibile). Barra di scala stile
cartina in basso a destra (lunghezze "tonde" 1-2-5×10ⁿ, in m o km).
Costanti centralizzate in `frontend/src/config.js`.
**Lo snap segue la griglia visibile**: quando la griglia si ispessisce
(zoom out), anche lo snap usa il passo ispessito — ciò che si vede è ciò a
cui ci si aggancia (aggiunta 2026-07-23 su richiesta utente).
**Motivazione**: scala realistica per circuiti (km), riferimento visivo di
distanza indipendente dallo zoom.

### D-014 — Distanza minima punti nuovi (default 50 m, configurabile)
**Data**: 2026-07-23 (richiesta utente)
**Decisione**: un punto NUOVO (aggiunta in coda o inserimento su segmento)
viene rifiutato se dista meno di `minClearance` (default 50 m, campo
"Dist. min" in toolbar, 0 = disattivato) da qualunque punto o segmento
esistente. Per l'inserimento su segmento si esclude il segmento ospite dal
controllo, ma NON i suoi estremi (inserire su un segmento più corto di 2×D
resta impossibile). Feedback: cursore e segmento elastico rossi + cerchio
tratteggiato del raggio di rispetto. Lo spostamento (drag) di punti
esistenti non è soggetto al vincolo.
**Motivazione**: spaziatura minima garantisce qualità della spline in Fase 2
(niente cluster di control point né passaggi ravvicinati).

<!-- Template nuova decisione:
### D-0XX — Titolo
**Data**: YYYY-MM-DD
**Decisione**: ...
**Motivazione**: ...
**Scartato**: ...
-->

## Decisioni pendenti

- **P-002**: larghezza simmetrica singola vs `widthLeft`/`widthRight` fin
  dall'inizio (il brief cita l'asimmetria come opzione).
- **P-003**: tensione per punto nella Catmull-Rom: variante custom o parametro
  ignorato nell'MVP.

## Chiuse

- ~~P-001~~ → D-010 (Konva.js).
