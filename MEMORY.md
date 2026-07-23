# MEMORY.md — Stato del progetto TrackGen

> Snapshot dello stato corrente. Aggiornare a ogni sessione di lavoro.
> Ultimo aggiornamento: **2026-07-23**

## Stato: PRE-CODING

Nessun codice sorgente esiste ancora. Creata solo la documentazione di
progetto (questo sistema di file di memoria + TRACKGEN_BRIEF.md).

## Fatto

- [x] 2026-07-23 — Ricevuto e analizzato TRACKGEN_BRIEF.md (documento di progetto)
- [x] 2026-07-23 — Creato sistema di file di memoria (CLAUDE.md + 9 file)
- [x] 2026-07-23 — `git init`, primo commit, repo GitHub creato e collegato:
      https://github.com/garattoniluca-cmyk/GenTrack (pubblico, branch `main`).
      GitHub CLI installato e autenticato (account garattoniluca-cmyk).
      Identità git repo-locale: garattoniluca-cmyk (la globale resta mc12027).
- [x] 2026-07-23 — Presentata analisi/recap Fase 1 (setup + editor poligonale):
      **in attesa di approvazione** — l'utente vuole discuterne prima.
      P-001 (Konva vs canvas) ancora aperta.

## In corso

- (niente)

## Prossimi passi (ordine sprint dal brief, §7)

1. Setup repo: struttura cartelle, `shared/track_schema.json`, store Zustand vuoto
2. Fase 1+2: editor poligono → spline con arc-length resampling (senza 3D)
3. Fase 3 base: estrusione flat con profilo fisso (validare frame + strip triangolare)
4. Canali width/banking/elevation con keyframe e interpolazione
5. Fase 6: terreno base (falloff costante, senza vie di fuga)
6. Fase 5: vie di fuga (inviluppo + editing manuale + integrazione terreno)
7. Fase 4: elementi artificiali (chicane splice)
8. Export GLTF/OBJ, pannelli UI, persistenza file JSON

## Problemi aperti / decisioni pendenti

- Scelta editor 2D: Konva.js vs canvas nativo (da decidere allo sprint 2)
- Larghezza asimmetrica (`widthLeft`/`widthRight`): supportarla da subito o
  partire simmetrici? (brief la cita come opzione)

## Note di contesto

- Il progetto nasce da esperienze passate negative con lo stitching del
  terreno a posteriori — è il motivo del principio "il rumore nasce dal
  bordo" (vedi DECISIONS.md, D-001).
- Remote GitHub: `origin` → https://github.com/garattoniluca-cmyk/GenTrack
