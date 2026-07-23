# GLOSSARY.md — Terminologia del dominio

> Termini usati in TRACKGEN_BRIEF.md, nel codice e nella documentazione.
> Ultimo aggiornamento: 2026-07-23

## Parametrizzazione

- **s (arc-length normalizzato)** — posizione lungo la pista come frazione
  [0,1] della lunghezza reale totale della spline. Variabile di
  parametrizzazione universale di TUTTI i canali (D-006). Indipendente dalla
  densità di campionamento.
- **t (parametro spline)** — parametro nativo della Catmull-Rom. NON
  proporzionale alla distanza percorsa: serve la tabella lookup t→arcLength
  per convertire.
- **d (distanza laterale)** — distanza con segno dal **bordo esterno
  effettivo** del tubo di flusso (non dalla mezzeria). Seconda coordinata del
  sistema (s,d) in cui vive il rumore del terreno.
- **Arc-length resampling** — ricampionamento della spline a N punti
  equidistanti lungo la lunghezza reale (non nel parametro t). Obbligatorio
  dopo ogni modifica.

## Geometria della pista

- **Poligonale** — poligono chiuso disegnato in fase 1, input grezzo della pipeline.
- **Spline** — Catmull-Rom chiusa derivata dalla poligonale; mezzeria della pista.
- **Tension (per punto)** — parametro 0–1 del control point: 0 = molto
  arrotondato, 1 = quasi angoloso.
- **Tubo di flusso (flow tube)** — il volume della pista: spline + canali
  (width/banking/elevation) + profili di sezione, estrusi lungo il frame.
- **Frame (parallel transport)** — terna tangente/normale/binormale propagata
  lungo la curva per rotazione incrementale, senza i flip di Frenet-Serret (D-003).
- **Banking** — inclinazione trasversale della pista (gradi), rotazione
  attorno alla tangente. Sempre input utente (D-002).
- **Canale (channel)** — sequenza di keyframe {s, valore, transition} che
  definisce una proprietà lungo la pista (width, banking, elevation, falloff).
- **Keyframe** — punto di controllo di un canale a un certo s.
- **Transizione** — legge di interpolazione tra due keyframe:
  `step` (costante, poi salto — C0 discontinuo, sconsigliato),
  `linear`, `smoothstep` (3t²−2t³, derivata nulla agli estremi — default).
- **Profilo di sezione (section profile)** — polyline 2D nel piano normale
  che definisce la forma trasversale. Tipi: `wall_edge` (muro a filo pista),
  `secondary_surface` (superficie laterale erba/sabbia/ghiaia + muro opzionale).
- **Marshal gate (apertura commissari)** — varco nel muro esterno in
  [s−halfWidth, s+halfWidth]; override locale del profilo, non modifica permanente.
- **Mezzeria** — linea centrale della pista (la spline stessa).
- **Start (segmento di)** — segmento del poligono scelto come linea di
  start/finish (`stage1_polygon.startSegment`); in Fase 2 diventa l'origine
  dell'ascissa curvilinea (s = 0).
- **Verso di percorrenza (direction)** — 'cw' (orario) o 'ccw' (antiorario);
  determina il lato esterno delle curve, il segno del banking e
  l'orientamento degli elementi nelle fasi successive.
- **Winding** — ordine di avvolgimento dei punti disegnati, calcolato con
  l'area con segno (shoelace); default del verso alla chiusura.
- **Bordo esterno effettivo** — polyline densa precalcolata del bordo esterno
  reale (larghezza variabile + vie di fuga incluse); riferimento per la
  proiezione del terreno.

## Elementi artificiali e vie di fuga

- **Chicane** — sequenza di curve strette artificiale; generata da template
  parametrico (velocità ingresso, offset laterale, severità).
- **Template** — funzione pura parametri → sotto-spline locale (4–6 control point).
- **Splice (innesto)** — sostituzione del tratto [s1,s2] della spline host
  con la sotto-spline del template, con Hermite blending agli estremi.
- **Hermite blending** — raccordo che impone tangenti identiche ai due
  estremi dell'innesto → continuità C1 garantita per costruzione.
- **Rimappatura s** — trasformazione esplicita dei keyframe con s > s2 dopo
  uno splice che cambia la lunghezza totale.
- **Via di fuga (runoff area)** — zona di sicurezza esterna alla pista.
- **Inviluppo tangenti-velocità (runoff envelope)** — contorno suggerito:
  per ogni sample, tangente di lunghezza L = k·v² proiettata verso l'esterno
  curva; la polyline smoothed degli estremi è il suggerimento (`generatedEnvelope`).
- **Manual override** — poligono libero disegnato dall'utente che ha
  priorità sull'inviluppo generato.
- **Patch** — mesh triangolata (earcut) della via di fuga, agganciata al
  bordo pista con vertici esattamente condivisi.
- **Euristica velocità** — v_max(s) = sqrt(a_lat_max/κ(s)), clampata;
  stima dichiarata, non simulazione fisica (D-008).
- **κ (curvatura)** — |r''|/|r'|³; il suo segno determina il lato esterno
  della curva.
- **a_lat_max** — accelerazione laterale massima assunta (default 15–20 m/s²).

## Terreno

- **fBm (fractional Brownian motion)** — somma di ottave di simplex noise
  con persistence/lacunarity; qui valutato in coordinate (s,d), mai (x,y) mondo.
- **Falloff** — distanza (eventualmente variabile in s via
  `falloffDistanceCurve`) entro cui l'ampiezza del rumore cresce da 0 a piena.
- **Weight** — smoothstep(0, falloff(s), d): scala l'ampiezza per-ottava;
  garantisce rumore nullo sul bordo (continuità pista-terreno).
- **projectToSpline** — proiezione di un punto mondo sul bordo esterno
  effettivo → restituisce {s, d, closestPoint, tangent}.
- **lateralSlope** — pendenza laterale al bordo (banking + svaso via di
  fuga); estende la superficie della pista nel terreno vicino.
- **Struttura di accelerazione** — griglia uniforme o k-d tree sui sample
  del bordo per rendere la proiezione sub-O(n) per vertice.

## Architettura

- **Stage** — una delle 7 fasi della pipeline; ognuna legge/scrive il proprio
  sottoinsieme dello schema (`stage1_polygon` … `stage6_terrain`).
- **Reversibilità** — modificare uno stage precedente rigenera i successivi.
- **C0 / C1 / C2** — continuità di posizione / tangente / curvatura.
  Requisito di progettazione: C1 ovunque, C2 dove possibile.
- **Single source of truth** — `shared/track_schema.json` per i dati;
  `trackStore.js` (zustand) per lo stato runtime frontend.
