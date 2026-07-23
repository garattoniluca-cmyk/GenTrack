# TESTING.md — Strategia di test

> Stato: pianificato — nessun test esiste ancora. Il codice in
> `frontend/src/geometry/` è progettato apposta come logica pura (NO React)
> per essere testabile in isolamento.
> Ultimo aggiornamento: 2026-07-23

## Strumenti (da confermare al setup)

- Frontend: **Vitest** (nativo Vite) per unit test su `geometry/`.
- Backend: **pytest** + httpx TestClient per router e file_store.
- Test visivi 3D: verifica manuale nel viewer (TerrainMesh con shading
  altezza/pendenza serve proprio a ispezionare la continuità dei bordi).

## Priorità: unit test sulla geometria pura

Ogni modulo di `geometry/` va coperto da test sugli **invarianti**, non solo
su casi puntuali.

### Invarianti per modulo

**polygon.js**
- Poligono semplice valido → nessuna self-intersection rilevata.
- Poligono a farfalla → intersezione rilevata, segmenti in conflitto corretti.
- Chiusura entro tolleranza dal primo punto.

**spline.js**
- Spline chiusa: sample[0] ≡ sample[N] (posizione).
- Ricampionamento arc-length: distanza euclidea tra sample consecutivi
  ~costante (tolleranza %); `s` monotono crescente in [0,1];
  `totalLength` ≈ somma delle distanze tra sample.

**frame.js (parallel transport)**
- Frame ortonormale a ogni step (dot products ≈ 0, norme ≈ 1).
- Nessun flip su rettilinei e punti di flesso (test con curva a S:
  continuità del normal tra step consecutivi, dot(n_i, n_{i+1}) > 0).
- Curva chiusa: gestire/misurare il mismatch angolare tra frame iniziale e
  finale (da distribuire o documentare).

**curvature.js**
- Cerchio di raggio R → curvatura ≈ 1/R ovunque.
- Rettilineo → curvatura ≈ 0, v_max = clamp al massimo.

**Canali (width/banking/elevation)**
- Interpolazione: valore esatto sui keyframe; `smoothstep` con derivata ≈ 0
  agli estremi; `linear` lineare; `step` costante a tratti.
- Query fuori dai keyframe estremi (canale chiuso: wrap su s).

**sectionProfile.js**
- Stesso profileType → parametri interpolati; tipo diverso → switch netto
  all'`s` dichiarato.
- marshalGates: il muro è omesso SOLO in [s−halfWidth, s+halfWidth],
  profilo base intatto altrove.

**splice.js**
- Continuità C1: tangente del template in ingresso/uscita ≡ tangente host
  in s1/s2 (entro tolleranza).
- Rimappatura s: keyframe con s > s2 ricollocati coerentemente con la nuova
  lunghezza totale; keyframe con s < s1 invariati.
- Chicane non più larga della pista (rispetta widthChannel nel tratto).

**runoffEnvelope.js / runoffPatch.js**
- Inviluppo sul lato esterno della curva (segno curvatura).
- Patch triangolata: nessun triangolo degenere; vertici di aggancio
  **identici** (===, non solo vicini) ai vertici del bordo pista.

**terrainNoise.js**
- d = 0 (sul bordo) → noise pesato = 0 → altezza terreno ≡ altezza bordo
  (continuità C0 esatta al bordo, il cuore del progetto).
- Peso monotono crescente in d fino a falloff, poi 1.
- Stesso seed → output deterministico.
- fBm normalizzato: |output| ≤ 1.

**flowTubeMesh.js**
- Mesh chiusa: prima e ultima sezione condividono i vertici.
- Nessuna normale invertita (orientamento triangoli coerente).

## Backend

- file_store: roundtrip save→load identico; list_all; delete; lock su
  scritture concorrenti.
- Router: validazione Pydantic (422 su payload malformato), 404 su id
  inesistente.
- Roundtrip schema: JSON valido per `shared/track_schema.json` accettato
  dai Pydantic model e viceversa.

## Regola di lavoro

Ogni modulo geometry nuovo si accompagna ai suoi test sugli invarianti
**nello stesso sprint** — la fase 3 dello sprint plan ("validare frame e
mesh") è esplicitamente un milestone di validazione.
