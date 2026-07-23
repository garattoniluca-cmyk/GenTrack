# CLAUDE.md — TrackGen

> File di orientamento per Claude Code. Leggere questo file per primo, poi
> consultare i file di memoria indicati sotto in base al task.
> Documento di progetto completo: [TRACKGEN_BRIEF.md](TRACKGEN_BRIEF.md)

## Cos'è TrackGen

Tool full-stack per prototipare circuiti automobilistici: da editor 2D lineare
fino alla generazione 3D completa (pista, terreno, vie di fuga, chicane).
Pipeline a 7 fasi sequenziali ma reversibili. Nessun database: persistenza
in-memory / file JSON locali.

**Principio cardine**: ogni fase deriva/si ancora alla precedente **per
costruzione geometrica**, mai per aggiustamento o stitching a posteriori.
Continuità C1 (dove possibile C2) è requisito di progettazione.

## Stato attuale

- ⏳ **PRE-CODING** — solo documentazione. Nessun file sorgente ancora creato.
- Prossimo passo: sprint 1 (setup repo, schema condiviso, store Zustand vuoto).

## File di memoria (aggiornare a ogni sessione rilevante)

| File | Contenuto | Quando consultarlo |
|---|---|---|
| [MEMORY.md](MEMORY.md) | Stato corrente, progressi, prossimi passi | Sempre, a inizio sessione |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Pipeline, fasi, flusso dati, modello dati | Prima di toccare la struttura |
| [FILES.md](FILES.md) | Mappa file ↔ responsabilità | Prima di creare/modificare file |
| [DECISIONS.md](DECISIONS.md) | Decisioni tecniche e vincoli (con motivazioni) | Prima di scelte architetturali |
| [API.md](API.md) | Endpoint backend e schema dati condiviso | Lavoro su backend/schema |
| [INTEGRATION.md](INTEGRATION.md) | Contratti frontend↔backend, formato JSON | Lavoro cross-stack |
| [TESTING.md](TESTING.md) | Strategia test, invarianti geometrici | Prima di scrivere test |
| [GLOSSARY.md](GLOSSARY.md) | Terminologia del dominio (s, frame, banking…) | Dubbi sui termini |
| [QUICKSTART.md](QUICKSTART.md) | Comandi per avviare/buildare | Setup ambiente |

## Regole non negoziabili (dettagli in DECISIONS.md)

1. **NO stitching terreno**: il rumore nasce dal bordo del tubo di flusso in
   coordinate (s, d), mai in coordinate mondo con cucitura a posteriori.
2. **Banking = input utente esplicito**, mai derivato da curvatura.
3. **Parallel transport frame**, mai Frenet-Serret classico (flippa).
4. **NO marching cubes/voxel** — solo mesh esplicite da estrusione/griglia.
5. **NO database** in questa fase — file JSON locali.
6. Tutti i canali parametrizzati su `s` arc-length normalizzato [0,1], mai
   su indici di punti di controllo.
7. Ricampionamento arc-length obbligatorio dopo ogni modifica alla spline.

## Stack

- **Frontend**: React + Vite, zustand, three.js, @react-three/fiber + drei,
  Konva.js (o canvas nativo), earcut, simplex-noise. La pipeline geometrica
  gira **interamente lato client**.
- **Backend**: FastAPI + Pydantic, minimale (persistenza JSON, AI assist
  opzionale, export mesh opzionale). Non indispensabile al funzionamento.
- **Codice geometrico** in `frontend/src/geometry/`: logica pura, NO React,
  testabile in isolamento.

## Convenzioni di lavoro

- Aggiornare i file di memoria al termine di ogni blocco di lavoro
  significativo (MEMORY.md sempre; gli altri se toccati dall'attività).
- Le decisioni nuove vanno registrate in DECISIONS.md con data e motivazione.
- Lingua della documentazione: italiano. Codice e identificatori: inglese.
