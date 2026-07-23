// historyMiddleware.js — undo/redo generico per zustand.
// Traccia snapshot della porzione di stato `partialize(state)`; espone
// undo/redo/clearHistory come azioni e historyPast/historyFuture (contatori
// reattivi) per la UI.

export const withHistory =
  (config, { partialize, limit = 200 }) =>
  (set, get, api) => {
    const past = [];
    const future = [];
    let batchStart = null; // snapshot di inizio batch (drag): un solo undo-entry

    const syncCounters = () => {
      set({ historyPast: past.length, historyFuture: future.length });
    };

    const pushPast = (snapshot) => {
      past.push(snapshot);
      if (past.length > limit) past.shift();
      future.length = 0;
    };

    // set() tracciato: snapshot del prima se la porzione osservata cambia.
    // Durante un batch (drag in corso) non si accumula storia.
    const trackedSet = (partial, replace) => {
      const before = partialize(get());
      set(partial, replace);
      if (batchStart !== null) return;
      const after = partialize(get());
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        pushPast(before);
        syncCounters();
      }
    };

    const state = config(trackedSet, get, api);

    return {
      ...state,
      historyPast: 0,
      historyFuture: 0,

      undo: () => {
        if (past.length === 0) return;
        future.push(partialize(get()));
        set(past.pop()); // set "crudo": undo/redo non generano storia
        syncCounters();
      },

      redo: () => {
        if (future.length === 0) return;
        past.push(partialize(get()));
        set(future.pop());
        syncCounters();
      },

      clearHistory: () => {
        past.length = 0;
        future.length = 0;
        batchStart = null;
        syncCounters();
      },

      /** Inizia un batch (es. drag): le modifiche fino a endBatch = 1 undo-entry. */
      beginBatch: () => {
        if (batchStart === null) batchStart = partialize(get());
      },

      /** Chiude il batch; registra la storia solo se qualcosa è cambiato. */
      endBatch: () => {
        if (batchStart === null) return;
        const now = partialize(get());
        if (JSON.stringify(batchStart) !== JSON.stringify(now)) {
          pushPast(batchStart);
        }
        batchStart = null;
        syncCounters();
      },
    };
  };
