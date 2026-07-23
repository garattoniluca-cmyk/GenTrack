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
- **Tasto destro riservato all'app** (context menu del browser soppresso sul
  canvas): il destro su un vertice apre un **menu contestuale grafico**
  (voce unica per ora: "Elimina punto" — disabilitata se il poligono chiuso
  ha solo 3 punti). Il menu si chiude con click altrove, Esc, wheel.
  Nuove voci future si aggiungono a questo menu.
- **Vista iniziale**: fit dell'intera area 5000×5000 m nel viewport (95% del
  lato corto), centrata sull'origine.
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

### D-015 — Start su segmento e verso di percorrenza definiti in Fase 1
**Data**: 2026-07-23 (richiesta utente)
**Decisione**: lo start/finish è un **segmento** del poligono chiuso, scelto
col tasto destro → "Imposta come start" (menu contestuale sui segmenti).
Il **verso di percorrenza** (`direction`: 'cw' orario | 'ccw' antiorario) si
sceglie dal toggle in toolbar; il default alla chiusura è il winding con cui
l'utente ha disegnato (area con segno, y-up: positiva = antiorario).
Entrambi salvati in `stage1_polygon` (schema aggiornato: `startSegment`,
`direction`). Render: linea a scacchi bianco/nero + etichetta START + freccia
gialla del verso. Gli indici di startSegment vengono **rimappati** a ogni
inserimento/rimozione di punti.
**Motivazione**: il verso determina il lato esterno (vie di fuga), il segno
del banking e l'orientamento delle chicane nelle fasi successive; va fissato
alla fonte. Lo start dà l'origine dell'ascissa curvilinea s=0 in Fase 2.
**Vincolo lunghezza** (aggiunta 2026-07-23): il segmento start deve essere
lungo almeno `minStartLength` (default **700 m**, campo "Start min" in
toolbar). La voce di menu è disabilitata sui segmenti troppo corti (con
lunghezza mostrata); se un editing successivo accorcia lo start sotto il
minimo, la statusbar mostra un errore ma lo start non viene rimosso
automaticamente.

### D-016 — ~~Catmull-Rom centripeta~~ (SUPERATA da D-018)
**Data**: 2026-07-23 · **Superata**: 2026-07-23 stesso giorno
**Storia**: prima implementazione della Fase 2 con Catmull-Rom centripeta
passante per i vertici. **Bocciata dall'utente al primo collaudo**: la spline
arrotondava TUTTO, distruggendo i rettilinei ("circuito gommosetto tutto in
curvatura"). Lezione: i rettilinei sono un vincolo duro del dominio, non un
caso particolare. → vedi D-018. P-003 (tension) resta chiusa/rinviata.

### D-018 — Mezzeria = rettilinei esatti + raccordi ad arco (fillet)
**Data**: 2026-07-23 (da feedback utente su D-016)
**Decisione**: la mezzeria della Fase 2 segue ESATTAMENTE i segmenti del
poligono; a ogni vertice un **arco tangente** (fillet) di raggio regolabile:
default globale (60 m, toolbar) + override per-curva trascinando la maniglia
sull'arco (lungo la bisettrice; etichetta "R xx"; gialla = personalizzata;
tasto destro = reset al default). Il raggio è clampato automaticamente dalla
lunghezza degli spigoli adiacenti (t = R/tan(φ/2) ≤ 0.49·spigolo). Vertici
collineari → nessun arco. Continuità C1 per costruzione (arco tangente alle
rette); C2 (clothoidi) eventualmente in futuro. Schema: `stage2_spline =
{defaultCornerRadius, cornerRadii{vertexIndex: R}, resampledArcLength}`.
**Motivazione**: è come si progettano i circuiti reali — i rettilinei sono
sacri, le curve hanno raggio costante e controllabile. Una spline passante
per i vertici non può garantirlo.
**Scartato**: Catmull-Rom con CP collineari extra per irrigidire i
rettilinei (approssimazione, bowing residuo ai bordi).

### D-019 — Inserimento punto su segmento: proiezione, non snap
**Data**: 2026-07-23 (bug segnalato dall'utente)
**Decisione**: il punto inserito con click su un segmento viene PROIETTATO
sul segmento (risoluzione 1 cm), non snappato alla griglia: lo snap poteva
spostarlo fuori dal segmento (specie con griglia ispessita dallo zoom out).
**Motivazione**: un punto inserito su un segmento deve rimanere sul segmento
— altrimenti il rettilineo si spezza in due tratti non collineari.

### D-017 — Ancoraggio s=0 e derivazione Fase 1 → Fase 2
**Data**: 2026-07-23 (approvata dall'utente; aggiornata con D-018)
**Decisione**: il path della mezzeria parte dalla **metà del rettilineo di
start** → s=0 cade esattamente lì; il path percorre i vertici nel **verso di
percorrenza** scelto. Rigenerazione: entrando in Fase 2, se l'impronta dello
stage1 (punti+start+verso) è cambiata, i raggi personalizzati decadono (con
conferma) perché gli indici dei vertici non sono più affidabili — pipeline
derivativa, brief §1. `resampledArcLength` NON vive nello store: è derivato
puro (useMemo nei componenti) — undo/redo sempre coerente.
**Motivazione**: s=0 esatto sulla linea del traguardo; lo start ha ≥700 m
(D-015) quindi la metà del rettilineo è sempre su un tratto rettilineo.

### D-020 — Mai dialog nativi del browser (confirm/alert/prompt)
**Data**: 2026-07-23 (bug segnalato dall'utente: "non passa alla fase 2")
**Decisione**: vietato `window.confirm/alert/prompt` in tutta l'app — negli
ambienti embedded (es. pannello preview) i dialog nativi sono bloccati e
falliscono IN SILENZIO (confirm ritorna false senza mostrare nulla): il
click sembrava non fare niente. Usare sempre modali interne React
(`.modal-overlay`/`.modal` in index.css).
**Sintomo osservato**: tab "2 · Spline" cliccabile ma inerte quando serviva
la conferma di rigenerazione — il confirm bloccato inghiottiva l'azione.

### D-021 — Stondature ASIMMETRICHE a due bracci (evoluzione di D-018)
**Data**: 2026-07-23 (richiesta utente)
**Decisione**: ogni curva è definita da DUE bracci indipendenti: `in`
(distanza del punto di tangenza dal vertice sullo spigolo PRIMA, nel verso
di percorrenza) e `out` (spigolo DOPO). La curva è una **Bézier quadratica**
con punto di controllo sul vertice: tangente ai due bracci → C1 con i
rettilinei per costruzione. Bracci uguali = stondatura simmetrica; diversi =
asimmetrica (ingresso/uscita di curva controllati separatamente, es. corda
tardiva). Il raggio non è più costante: si mostra il raggio MINIMO (`R~`).
UI: due maniglie quadrate per curva (su T1 e T2) trascinabili lungo il
proprio spigolo, guide tratteggiate vertice→maniglie, gialle se
personalizzate, destro = reset. Braccio default in toolbar (60 m), clamp a
0.49·spigolo, minimo 2 m. Schema: `stage2_spline = {defaultArmLength,
cornerArms{idx: {in, out}}, resampledArcLength}`.
**Motivazione**: un arco di cerchio tangente a due rette ha per forza
bracci uguali — l'asimmetria richiede una curva a raggio variabile; la
Bézier quadratica è la più semplice che garantisce C1.
**Nota**: l'arco circolare simmetrico (D-018) resta il caso particolare
bracci uguali (la Bézier quadratica simmetrica è una parabola ≈ arco per
angoli non estremi — differenza trascurabile a queste scale).

### D-022 — L'altimetria di Fase 3A è la VERITÀ altimetrica del circuito
**Data**: 2026-07-23 (principio posto dall'utente)
**Decisione**: le quote z(s) definite dal rumore in Fase 3A sono le quote
reali della pista. Le fasi successive cuciranno il terreno procedurale DAL
tubo di flusso VERSO l'esterno — mai il contrario (coerente con D-001).
Il rumore è: fBm simplex 2D campionato lungo un CERCHIO (periodicità e
derivabilità garantite per costruzione, nessuna cucitura a s=0), media
sottratta, maschera smoothstep di spianamento start, ampiezza riscalata
GLOBALMENTE se la pendenza supera il limite (mai clamping locale: creerebbe
punti di non-derivabilità). Deterministico dal seed (mulberry32).
**Motivazione**: i parametri del rumore vanno regolati ora, in 2D, con
profilo altimetrico e statistiche (pendenza max, dislivello) compatibili
con un circuito F1 (limite default 10%).

### D-023 — Fase 3 divisa in 3A (dati, 2D) e 3B (estrusione 3D)
**Data**: 2026-07-23 (richiesta utente)
**Decisione**: 3A = sezione trasversale FISSA ([erba SX][riga][pista][riga]
[erba DX], larghezze costanti su tutto il tracciato), banking a keyframe
(editor grafico, D-002 rispettata), altimetria (D-022), footprint 2D del
tubo con mezzeria colorata per quota. 3B = estrusione 3D del tubo con muri
verticali a fine erba. RINVIATI: marshal gates, larghezze variabili,
profili sezione variabili, Fase 4 (chicane) e Fase 5 (vie di fuga).
Defaults sezione: pista 12 m (min FIA), riga 0.2 m, erba 8+8 m.
**Motivazione**: semplificare per arrivare presto al 3D con dati solidi;
i canali variabili si reintroducono quando la pipeline regge.

### D-024 — Banking impostato PER CURVA sulla mappa (non a keyframe liberi)
**Data**: 2026-07-23 (correzione UX richiesta dall'utente)
**Decisione**: il banking si imposta sulla MAPPA a livello di curva: click
sul marker al centro di ogni stondatura → popup con angolo (±30°) e rampe
di ritorno a zero prima/dopo (m, default 100). Bank COSTANTE lungo
l'estensione s della curva (registrata da resampleFilletPath), rampe
smoothstep (derivata nulla agli estremi → profilo C1).
**Rampe che si intersecano → PONTE DIRETTO** (scelta utente 2026-07-23,
sostituisce la somma iniziale): se la rampa di uscita di una curva si
sovrappone a quella di ingresso della successiva, il bank transita
direttamente da A° a B° con una smoothstep sull'intero gap — non torna a
zero, mai sopra il valore più alto né sotto il più basso, sempre C1.
Caso limite: rampe che coprono tutto il giro → bank costante ovunque.
Gli indicatori sulla mappa fanno incontrare i tratteggi a metà gap.
Il grafico banking è SOLA VISUALIZZAZIONE
del profilo risultante. Sostituisce il canale a keyframe liberi (UX bocciata:
scollegata dalle curve reali). Marker giallo + etichetta gradi = curva con
bank. Schema: `cornerBanking{idx: {angleDeg, rampBefore, rampAfter}}`.
**Motivazione**: il banking è una proprietà della CURVA, non di ascisse
astratte; l'editing sulla mappa lo lega a ciò che si vede.

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
