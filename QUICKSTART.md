# QUICKSTART.md — Setup e avvio

> Stato: **pianificato** — il progetto non è ancora inizializzato. I comandi
> sotto sono quelli previsti; verificare e correggere al momento del setup
> (sprint 1).
> Ultimo aggiornamento: 2026-07-23

## Prerequisiti

- Node.js ≥ 20 (frontend Vite)
- Python ≥ 3.11 (backend FastAPI)
- Ambiente: Windows 11 (dev primario) — usare comandi cross-platform

## Frontend (previsto)

```bash
cd frontend
npm install
npm run dev        # Vite dev server, tipicamente http://localhost:5173
```

Build produzione:

```bash
npm run build
```

Test (Vitest, da confermare):

```bash
npm test
```

## Backend (previsto)

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

- [ ] `git init` + .gitignore (node_modules, .venv, data/, dist/)
- [ ] Scaffold frontend: Vite + React
- [ ] Dipendenze: zustand, three, @react-three/fiber, @react-three/drei,
      earcut, simplex-noise (+ konva se P-001 → Konva)
- [ ] Scaffold backend: FastAPI + Pydantic, struttura cartelle da FILES.md
- [ ] `shared/track_schema.json` (prima versione, da brief §3)
- [ ] `trackStore.js` vuoto + historyMiddleware
- [ ] Aggiornare questo file con i comandi reali verificati
