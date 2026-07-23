# TrackGen — Brief Tecnico Completo per Implementazione

> Documento di riferimento per Claude Code. Contiene architettura, struttura file,
> specifiche di ogni fase della pipeline, algoritmi e formati dati. Nessun database
> in questa fase: persistenza solo in-memory / file JSON locali, finché la pipeline
> non è stabile.

---

## 1. Visione generale

TrackGen è un tool full-stack per prototipare circuiti automobilistici partendo da
un editor 2D lineare fino alla generazione 3D completa del tracciato, inclusi
terreno circostante, vie di fuga non convenzionali e elementi artificiali (chicane).

La pipeline è composta da fasi sequenziali ma reversibili (l'utente può tornare
indietro e modificare uno stage precedente, rigenerando gli stage successivi):

1. **Editor poligonale 2D** — disegno di una poligonale chiusa su griglia
2. **Spline editing** — conversione poligono → spline con punti di controllo
3. **Fase "tubo di flusso"** — definizione per keyframe di: profilo sezione,
   banking, larghezza pista, lungo l'arc-length della spline
4. **Elementi artificiali** — innesto di chicane/tratti predeterminati
5. **Vie di fuga non convenzionali** — generazione assistita (inviluppo
   tangenti-velocità) + editing manuale
6. **Generazione terreno** — noise ancorato nativamente ai bordi del tubo di flusso
7. **Export/visualizzazione 3D** — render Three.js del circuito completo

Principio cardine di tutto il progetto: **ogni fase successiva deriva/si ancora
alla precedente per costruzione geometrica**, mai per "aggiustamento" o stitching
a posteriori. Continuità C1 (e dove possibile C2) è un requisito di progettazione,
non un dettaglio di rifinitura.

---

## 2. Struttura del repository

```
trackgen/
├── frontend/                      # React + Vite + react-three-fiber
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── state/
│   │   │   ├── trackStore.js      # Zustand store, unica fonte di verità
│   │   │   └── historyMiddleware.js  # undo/redo
│   │   ├── geometry/               # Logica pura, NO React, testabile isolata
│   │   │   ├── polygon.js          # validazione poligono, self-intersection
│   │   │   ├── spline.js           # Catmull-Rom, arc-length resampling
│   │   │   ├── frame.js            # parallel-transport frame lungo la curva
│   │   │   ├── curvature.js        # stima curvatura + euristica velocità
│   │   │   ├── sectionProfile.js   # profili trasversali, interpolazione
│   │   │   ├── widthChannel.js     # canale larghezza pista (step/lerp/smoothstep)
│   │   │   ├── bankingChannel.js   # canale banking
│   │   │   ├── elevationChannel.js # canale altitudine
│   │   │   ├── flowTubeMesh.js     # estrusione finale: spline+canali → mesh
│   │   │   ├── runoffEnvelope.js   # inviluppo tangenti-velocità per vie di fuga
│   │   │   ├── runoffPatch.js      # triangolazione patch vie di fuga (earcut)
│   │   │   ├── chicaneTemplates.js # libreria elementi artificiali parametrici
│   │   │   ├── splice.js           # innesto template su spline con continuità C1
│   │   │   └── terrainNoise.js     # fBm ancorato in coordinate (s,d)
│   │   ├── components/
│   │   │   ├── editor2d/
│   │   │   │   ├── GridCanvas.jsx      # fase 1: disegno poligono
│   │   │   │   ├── SplineEditor.jsx    # fase 2: punti di controllo
│   │   │   │   └── ChannelEditor.jsx   # fase 3: grafici s→width/bank/elevation
│   │   │   ├── viewer3d/
│   │   │   │   ├── Scene.jsx
│   │   │   │   ├── TrackMesh.jsx
│   │   │   │   ├── TerrainMesh.jsx
│   │   │   │   └── RunoffOverlay.jsx
│   │   │   └── panels/
│   │   │       ├── SectionProfilePanel.jsx
│   │   │       ├── ChicaneLibraryPanel.jsx
│   │   │       └── ExportPanel.jsx
│   │   └── io/
│   │       ├── exportJSON.js
│   │       └── importJSON.js
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── backend/                        # FastAPI, nessun DB per ora
│   ├── app/
│   │   ├── main.py
│   │   ├── routers/
│   │   │   ├── track.py            # CRUD in-memory / file JSON
│   │   │   ├── generation.py       # eventuali task pesanti (mesh export, AI prompt)
│   │   │   └── ai_assist.py        # endpoint per suggerimenti AI (profili, chicane)
│   │   ├── models/
│   │   │   └── track_schema.py     # Pydantic models — stesso schema del JSON frontend
│   │   ├── storage/
│   │   │   └── file_store.py       # persistenza su file locali .json, no DB
│   │   └── services/
│   │       ├── mesh_export_service.py  # export OBJ/GLTF lato server (opzionale)
│   │       └── ai_prompt_service.py
│   ├── requirements.txt
│   └── pyproject.toml
│
├── shared/
│   └── track_schema.json           # JSON Schema condiviso, single source of truth
│                                    # per validare sia i dati frontend che backend
│
└── TRACKGEN_BRIEF.md                # questo documento
```

**Nota architetturale**: il backend in questa fase NON è indispensabile al
funzionamento — tutta la pipeline geometrica gira lato client. Il backend serve
solo per: (a) salvare/caricare file JSON di progetto su disco condiviso, (b)
ospitare eventuali endpoint di assistenza AI (es. generazione automatica di un
primo layout tracciato, suggerimento profili), (c) export mesh pesante se si
decide di spostare calcoli lato server in futuro. Va scritto in modo che sia
facilmente estendibile a un DB reale in seguito senza toccare gli schemi.

---

## 3. Modello dati (schema condiviso frontend/backend)

Questo è lo schema centrale. Ogni fase della pipeline legge/scrive un
sottoinsieme di questa struttura.

```json
{
  "id": "track_uuid",
  "name": "string",
  "stage1_polygon": {
    "points": [{"x": 0, "y": 0}],
    "gridSize": 1.0,
    "closed": true
  },
  "stage2_spline": {
    "controlPoints": [
      {"id": "cp_1", "x": 0, "y": 0, "tension": 0.5}
    ],
    "resampledArcLength": {
      "totalLength": 0,
      "sampleCount": 0,
      "samples": []
    }
  },
  "stage3_flowTube": {
    "widthChannel": [
      {"s": 0.0, "value": 12.0, "transition": "step"},
      {"s": 0.35, "value": 9.0, "transition": "smoothstep"}
    ],
    "bankingChannel": [
      {"s": 0.0, "angleDeg": 0.0, "transition": "smoothstep"}
    ],
    "elevationChannel": [
      {"s": 0.0, "height": 0.0, "transition": "smoothstep"}
    ],
    "sectionProfiles": [
      {
        "s": 0.0,
        "profileType": "wall_edge",
        "wallHeight": 1.0,
        "secondarySurface": null
      },
      {
        "s": 0.2,
        "profileType": "secondary_surface",
        "wallHeight": 0.0,
        "secondarySurface": {"material": "gravel", "width": 8.0}
      }
    ],
    "marshalGates": [
      {"s": 0.5, "width": 4.0, "side": "outer"}
    ]
  },
  "stage4_artificialElements": [
    {
      "id": "chicane_1",
      "type": "chicane",
      "insertAt": {"sStart": 0.42, "sEnd": 0.46},
      "params": {
        "entrySpeedKph": 180,
        "lateralOffset": 6.0,
        "severity": 0.7
      }
    }
  ],
  "stage5_runoffAreas": [
    {
      "id": "runoff_1",
      "sRange": [0.40, 0.48],
      "side": "outer",
      "generatedEnvelope": [{"s": 0.40, "d": 15.0}],
      "manualOverride": [{"x": 120.3, "y": 45.1}],
      "surfaceType": "gravel"
    }
  ],
  "stage6_terrain": {
    "falloffDistance": 40.0,
    "falloffDistanceCurve": [{"s": 0.0, "value": 40.0}],
    "noiseParams": {
      "baseFrequencyS": 0.01,
      "baseFrequencyD": 0.02,
      "octaves": 5,
      "persistence": 0.5,
      "lacunarity": 2.0,
      "seed": 12345
    }
  },
  "metadata": {
    "createdAt": "iso-datetime",
    "updatedAt": "iso-datetime",
    "version": "0.1.0"
  }
}
```

**Regola di consistenza**: tutti i canali (`widthChannel`, `bankingChannel`,
`elevationChannel`, `sectionProfiles`) sono parametrizzati sulla stessa variabile
`s` normalizzata `[0,1]` sull'arc-length totale della spline. Nessun canale usa
indici di punti di controllo direttamente — sempre arc-length normalizzato, per
garantire che l'interpolazione sia indipendente dalla densità di campionamento.

---

## 4. Specifiche dettagliate per fase

### Fase 1 — Editor poligonale 2D (`GridCanvas.jsx`, `geometry/polygon.js`)

- Canvas 2D con griglia snap-to-grid (dimensione griglia configurabile)
- Disegno poligono chiuso tramite click sequenziali; chiusura automatica al click
  vicino al primo punto (tolleranza in pixel configurabile)
- Validazione self-intersection **in tempo reale** durante il disegno (algoritmo
  sweep-line semplice o brute-force O(n²) dato che n è tipicamente piccolo,
  <100 punti — non serve Bentley-Ottmann ottimizzato)
- Se il poligono si autointerseca, evidenziare visivamente il segmento in
  conflitto e impedire la chiusura finché non risolto
- Output: array di punti `{x, y}` in coordinate griglia

### Fase 2 — Spline editing (`SplineEditor.jsx`, `geometry/spline.js`)

- Conversione poligono → `CatmullRomCurve3` (Three.js), chiusa (`closed: true`)
- Editing punti di controllo: drag per spostare, click per aggiungere, canc per
  rimuovere; ogni punto ha un parametro `tension` locale (0 = molto arrotondato,
  1 = quasi angoloso) se si usa una variante di Catmull-Rom con tensione
  regolabile per punto
- **Ricampionamento arc-length obbligatorio dopo ogni modifica**: la spline va
  ricampionata a `N` punti equidistanti lungo la lunghezza reale della curva
  (non equidistanti nel parametro `t` originale) — implementare tramite tabella
  di lookup `t → arcLength` costruita per integrazione numerica (es. Simpson a
  passi fitti) e poi inversione per interpolazione
- Output: `resampledArcLength.samples`, ognuno con `{t, s, x, y}` dove `s` è
  arc-length normalizzato `[0,1]`

### Fase 3 — Tubo di flusso (`ChannelEditor.jsx`, `flowTubeMesh.js`, `frame.js`)

**Frame di riferimento**: implementare **parallel transport frame**, non
Frenet-Serret classico (che flippa nei punti di flesso/rettilineo). Algoritmo:

```
frame[0] = frame iniziale arbitrario ortogonale alla tangente[0]
per ogni step i da 1 a N:
    t_prev = tangente[i-1], t_curr = tangente[i]
    asse_rotazione = t_prev × t_curr (cross product)
    se |asse_rotazione| è trascurabile: frame[i] = frame[i-1] (nessuna rotazione)
    altrimenti: ruota normal[i-1] e binormal[i-1] attorno ad asse_rotazione
                dell'angolo tra t_prev e t_curr
    frame[i] = normal e binormal ruotati
```

**Applicazione banking**: dopo aver calcolato il parallel-transport frame,
applicare una rotazione aggiuntiva attorno alla tangente stessa, di angolo
`bankingChannel(s)` interpolato — il banking è un input diretto dell'utente
in questa fase, MAI derivato da curvatura o altre proprietà geometriche.

**Applicazione larghezza**: il profilo di sezione trasversale (definito in
`sectionProfile.js` come polyline 2D nel piano normale) va scalato lateralmente
per `widthChannel(s)` prima di essere posizionato nel frame 3D. Se si supportano
larghezze asimmetriche, usare due valori `widthLeft(s)` / `widthRight(s)` rispetto
alla mezzeria.

**Tipi di transizione tra keyframe** (per width, banking, elevation — stesso
meccanismo per tutti e tre i canali):
- `step`: valore costante fino al prossimo keyframe, poi salto (usare solo se
  seguito da un raccordo esplicito, altrimenti C0 discontinuo — sconsigliato
  salvo casi voluti)
- `linear`: interpolazione lineare tra due keyframe
- `smoothstep`: `3t²-2t³`, derivata nulla agli estremi — default consigliato per
  tutte le transizioni "naturali" (allargamenti, restringimenti, variazioni di
  banking)

**Profili di sezione** (`sectionProfile.js`): ogni keyframe di sezione definisce
un `profileType`:
- `wall_edge`: muro a filo pista, altezza configurabile
- `secondary_surface`: superficie laterale (erba/sabbia/ghiaia), con `material` e
  `width` propri, seguita da muro esterno opzionale
- Interpolare tra due profili adiacenti quando il `profileType` cambia: se sono
  dello stesso tipo, interpolare i parametri numerici; se il tipo cambia (es. da
  `wall_edge` a `secondary_surface`), usare una transizione netta a un `s`
  preciso (non ha senso "interpolare" tra un muro e un prato) — il progetto
  UI deve permettere di scegliere il punto esatto di switch

**Aperture commissari** (`marshalGates`): trattate come caso speciale di
`sectionProfiles` — nell'intervallo `[s - halfWidth, s + halfWidth]` il muro
esterno viene omesso, sostituito da un varco. Implementare come override locale
che ha priorità sul profilo di base in quell'intervallo, non come modifica
permanente del canale.

**Mesh finale del tubo**: per ogni sample `s_i` lungo la spline, calcolare frame
(con banking applicato), profilo di sezione scalato per width, generare i
vertici della sezione trasversale in 3D; collegare sezioni consecutive con
triangoli standard (strip triangolare). Output: geometria Three.js
(`BufferGeometry` con vertici, normali, UV).

### Fase 4 — Elementi artificiali (`chicaneTemplates.js`, `splice.js`)

**Libreria template**: ogni template è una funzione pura che, dati i parametri
(velocità di ingresso stimata, offset laterale, severità/lunghezza), genera una
sotto-spline locale di pochi punti di controllo (tipicamente 4-6 per una
chicane singola tipo esse).

**Vincoli geometrici da rispettare nel generatore**:
- Distanza minima tra i due apici della chicane in funzione della velocità
  (usare la stessa euristica curvatura↔velocità di `curvature.js`, applicata
  in modo inverso: dato `v`, calcolare raggio minimo plausibile e quindi
  spaziatura minima)
- Offset laterale configurabile ma vincolato dalla larghezza pista disponibile
  in quel tratto (leggere `widthChannel` per non generare una chicane più larga
  della pista stessa)

**Innesto (`splice.js`)**:
1. Prendere tangente e velocità stimata al punto di innesto `s1` sulla spline
   host
2. Generare il template con quei vincoli al bordo
3. Applicare **Hermite blending** ai due estremi dell'innesto: la tangente del
   template in ingresso/uscita deve combaciare esattamente con la tangente
   della spline host in `s1`/`s2` — non lasciare all'utente il compito di
   allineare manualmente
4. Sostituire il tratto `[s1, s2]` della spline originale con la sotto-spline
   generata
5. Invalidare e ricalcolare `resampledArcLength` da `s1` in poi (shift di tutti
   i keyframe successivi se la lunghezza del tratto cambia)

**Importante**: l'innesto altera la lunghezza totale della pista — tutti i
keyframe di width/banking/elevation con `s > s2` vanno ri-espressi in coordinate
arc-length aggiornate. Implementare come trasformazione esplicita di rimappatura
degli `s`, non ricalcolo implicito.

### Fase 5 — Vie di fuga non convenzionali (`runoffEnvelope.js`, `runoffPatch.js`)

**Stima velocità** (`curvature.js`):
```
curvatura(s) = |derivata_seconda(s)| / |derivata_prima(s)|³   (formula standard)
v_max(s) = sqrt(a_lat_max / curvatura(s))     — clampato a v_max_rettilineo
```
`a_lat_max` configurabile (default ragionevole: 15-20 m/s² come euristica, non
fisicamente rigorosa — va dichiarato chiaramente come stima approssimativa nella
UI, non come simulazione fisica accurata).

**Generazione inviluppo tangenti**:
1. Per ogni sample `s_i`, calcolare `v(s_i)` come sopra
2. Lunghezza tangente: `L(s_i) = k * v(s_i)²` (proporzionale all'energia
   cinetica — costante `k` configurabile/calibrabile)
3. Proiettare il segmento perpendicolarmente alla tangente, verso l'esterno
   della curva (usare il segno della curvatura per determinare il lato esterno)
4. L'inviluppo è la polyline che unisce gli estremi esterni di questi segmenti;
   applicare smoothing (media mobile o Catmull-Rom sui punti estremi) per
   evitare un contorno frastagliato

Questo inviluppo è generato come **suggerimento visualizzato**
(`generatedEnvelope`), non applicato direttamente. L'utente lo rifinisce
manualmente producendo `manualOverride` — un poligono libero. Se
`manualOverride` è presente, ha priorità sul generato per quell'area.

**Triangolazione patch** (`runoffPatch.js`): ogni via di fuga è una patch
poligonale che si aggancia al bordo esterno del tubo di flusso in due punti
(ingresso e uscita lungo `sRange`). Usare `earcut` per triangolare il poligono
risultante (bordo pista + contorno via di fuga + eventuale raccordo). Gestire
il caso: il poligono della via di fuga deve condividere esattamente i vertici
del bordo pista nei punti di aggancio (stessa posizione, non solo vicina) per
evitare micro-gap nella mesh finale.

### Fase 6 — Generazione terreno (`terrainNoise.js`)

Implementazione secondo il principio "il rumore nasce dal bordo, non viene
cucito al bordo":

```js
// Per ogni vertice della griglia terreno:
function terrainHeight(worldX, worldY, trackSpline) {
  const { s, d, closestPoint, tangent } = projectToSpline(worldX, worldY, trackSpline);
  // d: distanza laterale con segno dal bordo ESTERNO del tubo di flusso
  //    (non dalla mezzeria — il punto di riferimento è il bordo erba/sabbia)

  const baseHeight = closestPoint.height + d * closestPoint.lateralSlope;
  // lateralSlope include banking + eventuale svaso via di fuga in quel punto

  const falloff = evalFalloffCurve(s);  // da stage6_terrain.falloffDistanceCurve
  const weight = smoothstep(0, falloff, Math.max(0, d));

  const noise = fBmWeighted(s, d, weight, noiseParams);
  // fBm con ampiezza per-ottava scalata da weight (vedi sotto)

  return baseHeight + noise;
}

function fBmWeighted(s, d, weight, params) {
  let amplitude = 1.0, frequency = 1.0, sum = 0, maxAmp = 0;
  for (let i = 0; i < params.octaves; i++) {
    sum += weight * amplitude * simplex2(
      s * params.baseFrequencyS * frequency,
      d * params.baseFrequencyD * frequency
    );
    maxAmp += amplitude;
    amplitude *= params.persistence;
    frequency *= params.lacunarity;
  }
  return sum / maxAmp;
}
```

**Punto critico da implementare con attenzione**: `projectToSpline` deve
restituire il punto più vicino sul **bordo esterno effettivo** del tubo di
flusso (che include già larghezza variabile e vie di fuga), non sulla mezzeria
con un offset costante — altrimenti nei tratti a larghezza variabile o nelle
vie di fuga il riferimento sarebbe sbagliato. Serve quindi che il bordo esterno
sia precalcolato come propria polyline/curva densa (derivata dalla mesh del
tubo di flusso + eventuali patch vie di fuga) su cui fare la proiezione, non
ricalcolato analiticamente ogni volta dalla spline di mezzeria.

**Performance**: la proiezione punto-su-curva per ogni vertice della griglia
terreno è O(n) per vertice se fatta brute-force (confronto con tutti i sample
del bordo). Per griglie terreno grandi, costruire una struttura di accelerazione
spaziale (griglia uniforme o k-d tree sui sample del bordo) per limitare la
ricerca ai sample vicini.

**Mesh terreno**: generare come griglia regolare (plane geometry) limitata a
un'area che copre tutto il tracciato + margine, con `terrainHeight` applicato
per vertice. Evitare marching cubes o voxel — non necessari e più costosi.

### Fase 7 — Export/visualizzazione 3D

- `TrackMesh.jsx`: renderizza la mesh del tubo di flusso (materiali diversi per
  asfalto, cordoli, muri, superfici secondarie — usare vertex colors o multi-
  material groups)
- `TerrainMesh.jsx`: renderizza la mesh terreno con shading basato su altezza/
  pendenza (utile per verificare visivamente la continuità nei bordi)
- `RunoffOverlay.jsx`: evidenzia le aree vie di fuga con colore distintivo e
  mostra l'inviluppo generato vs l'override manuale per confronto durante
  l'editing
- Export finale: OBJ o GLTF (usare `GLTFExporter` di Three.js), con opzione di
  export lato client (immediato) o delega al backend (`mesh_export_service.py`)
  se si vogliono post-processing pesanti (decimazione, UV unwrapping) non
  pratici in browser

---

## 5. Backend — dettagli implementativi

Dato che non c'è DB, il backend è volutamente minimale:

- `file_store.py`: legge/scrive file JSON in una cartella locale
  (`./data/tracks/{id}.json`), con lock semplice su file per evitare scritture
  concorrenti corrotte. Interfaccia pensata per essere sostituita 1:1 da un
  repository DB in futuro (stesso metodo `save(track)`, `load(id)`,
  `list_all()`, `delete(id)`) — non esporre dettagli di file system oltre
  questo layer.
- `track_schema.py`: modelli Pydantic che rispecchiano esattamente lo schema
  condiviso in `shared/track_schema.json`. Validare ogni richiesta in ingresso
  con questi modelli prima di salvare.
- `ai_prompt_service.py`: endpoint opzionale per chiamare un modello (Claude via
  API) per suggerire, ad esempio, un primo layout di poligono dato un set di
  vincoli (lunghezza target, numero curve, stile circuito) — utile come feature
  futura ma non bloccante per l'MVP geometrico.
- Nessuna autenticazione/multi-utente in questa fase — è un tool locale di
  prototipazione.

---

## 6. Librerie da usare

| Scopo | Libreria |
|---|---|
| State management frontend | zustand |
| Editor 2D | Konva.js o canvas nativo |
| Spline/geometria 3D | three.js (`CatmullRomCurve3` come base) |
| React + 3D | @react-three/fiber, @react-three/drei |
| Triangolazione poligoni irregolari | earcut |
| Rumore procedurale | simplex-noise (npm) |
| Backend API | FastAPI + Pydantic |
| Build frontend | Vite |

---

## 7. Ordine di implementazione consigliato (per sprint)

1. Setup repo (struttura sopra), schema condiviso, store Zustand vuoto
2. Fase 1+2: editor poligono → spline con arc-length resampling (senza 3D ancora)
3. Fase 3 senza banking/width variabile: estrusione flat con profilo fisso,
   validare frame di riferimento e mesh strip triangolare
4. Aggiungere canali width/banking/elevation con keyframe e interpolazione
5. Fase 6 terreno (versione base, falloff costante, senza vie di fuga irregolari)
6. Fase 5 vie di fuga (inviluppo + editing manuale + integrazione col terreno)
7. Fase 4 elementi artificiali (chicane splice)
8. Export GLTF/OBJ, pannelli UI di rifinitura, persistenza file JSON

---

## 8. Cosa NON fare (vincoli espliciti da rispettare)

- Non generare il terreno in coordinate mondo globali indipendenti dalla pista
  e poi tentare stitching — è la fonte primaria dei problemi già riscontrati
  in passato con questo approccio
- Non derivare il banking da curvatura o altre proprietà — è sempre un input
  utente esplicito nella fase tubo di flusso
- Non usare Frenet-Serret classico per il frame lungo la spline — usare
  parallel transport per evitare flip/twist
- Non usare marching cubes/voxel per la mesh (né pista né terreno) — mesh
  esplicite generate da estrusione/griglia sono sufficienti e più precise
- Non introdurre un database in questa fase — file JSON locali sono sufficienti
  finché lo schema non è stabile
