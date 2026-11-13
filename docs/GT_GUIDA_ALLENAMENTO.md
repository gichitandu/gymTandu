# Guida allenamento serie per serie

Motore di regole deterministico: niente AI, LLM, machine learning o servizi esterni.
Stessi dati e stesse impostazioni producono gli stessi suggerimenti, ognuno con la
regola applicata (`rule`) e una motivazione leggibile.

## File

- `src/app/services/coach-config.ts`: preset, soglie e default prudenti (unico punto da modificare).
- `src/app/services/coach-engine.ts`: funzioni pure (`planExercise`, `adviseSet`, `compareSessions`, `globalTrend`).
- `src/app/services/coach-data.ts`: lettura dell'archivio, snapshot e validatori condivisi.
- UI: `shared/active-workout.component.*` (card "Guida · suggerito", RIR, segnalazioni, preferenze per esercizio) e `features/profile.component.ts` (pannello "Guida allenamento").
- Test: `tests/coach-engine.test.ts`, `tests/archive-worker.test.ts`.

## Dati salvati (campi facoltativi, nessuna migrazione)

- `settings[0].coach`: abilitazione, obiettivo, esperienza, fase, cedimento, dropset.
- `exercisePreferences[].coach`: tipo (multiarticolare/isolamento), carico minimo, adatto a RIR 0 / dropset. L'incremento resta `weightStep`.
- `sets[].flag`: "più dura del previsto" o "tecnica peggiorata", segnalati dall'utente.
- `sets[].coach`: prescrizione mostrata al momento della registrazione (suggerito), separata da peso, ripetizioni e RPE registrati.
  Il RIR dichiarato è salvato come RPE (RIR = 10 − RPE) per compatibilità con lo storico.

Validazione in `integrity.ts`, `backup.ts` e `worker/archive.js`.

## Regole principali

1. Prescrizione: valori della scheda; dove mancano, preset per obiettivo e tipo di esercizio; principianti +1 RIR.
2. Senza storico: calibrazione con carico scelto dall'utente, corretta dopo la prima serie.
3. Doppia progressione: aumento minimo solo se tutte le serie previste arrivano al massimo con RIR ≥ obiettivo − 1 e senza tecnica peggiorata; senza RIR servono 2 sedute di conferma. Incremento > 10% del carico: prima più ripetizioni.
4. Sedute difficili: 1 = stesso carico; 2 di fila = un incremento in meno; 3 = anche una serie in meno.
5. Stallo (3 sedute stesso carico senza più ripetizioni totali): +30 s di recupero; alla 4ª, ripartenza circa −10%.
6. Peggioramento su più esercizi (≥ metà di almeno 3, in 2 sedute di fila): proposta di scarico, senza attribuire cause.
7. Durante la seduta: correzioni solo per differenze evidenti, valide solo per quel giorno; nessuna inversione di direzione.
8. Cedimento e dropset: disattivati di default; solo ultima serie, esercizi compatibili, esperienza intermedia+, mai in scarico o dopo serie problematiche.
