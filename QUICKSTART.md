# QUICKSTART.md — Setup e avvio

> Frontend attivo e verificato. Backend non ancora scaffoldato (rinviato).
> Ultimo aggiornamento: 2026-07-23

## Prerequisiti

- Node.js ≥ 20 (frontend Vite)
- Python ≥ 3.11 (backend FastAPI)
- Ambiente: Windows 11 (dev primario) — usare comandi cross-platform

## Frontend (verificato ✓)

```bash
cd frontend
npm install
npm run dev        # Vite dev server su http://localhost:5173
```

Build produzione:

```bash
npm run build
```

Test (Vitest — 25 test su geometry/):

```bash
npm test
```

In Claude Code la preview si avvia con la config `trackgen-frontend`
(`.claude/launch.json`).

## Backend (previsto, non ancora scaffoldato)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate     # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Test:

```bash
pytest
```

## Note

- Il frontend funziona **anche senza backend** (pipeline tutta client-side;
  fallback download/upload JSON dal browser).
- I progetti salvati dal backend finiscono in `backend/data/tracks/{id}.json`.
- Nessun DB da configurare (D-005).

## Checklist setup iniziale (sprint 1 — da spuntare quando fatto)

- [x] `git init` + .gitignore + repo GitHub collegato
      (https://github.com/garattoniluca-cmyk/GenTrack, branch `main`)
- [x] Scaffold frontend: Vite + React
- [x] Dipendenze fase 1: zustand, konva, react-konva, vitest
      (three, @react-three/fiber, drei, earcut, simplex-noise: si installano
      quando servono, dalle fasi 2-3 in poi)
- [ ] Scaffold backend: FastAPI + Pydantic, struttura cartelle da FILES.md
      (rinviato allo sprint persistenza)
- [x] `shared/track_schema.json` (prima versione, da brief §3)
- [x] `trackStore.js` + historyMiddleware
- [x] Aggiornare questo file con i comandi reali verificati
