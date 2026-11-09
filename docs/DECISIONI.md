# Decisioni di progetto

Una riga per decisione: cosa si è scelto e perché. Serve a non rimettere in discussione scelte già fatte
e a non rileggere documenti lunghi per capirle. Aggiungi in cima le più recenti.

Formato: `AAAA-MM-GG — decisione — motivo (eventuale riferimento)`

## Decisioni

- 2026-11-09 — Task per pagina in `docs/tasks/<pagina>.md`, una voce per bug/richiesta — ridurre il contesto da rileggere a ogni sessione.

## Vincoli già stabiliti (da AGENTS.md)

- GymTrack è una PWA installabile su iPhone, non un'app iOS nativa.
- Angular 22 standalone con Signals; dati locali in Dexie/IndexedDB; account e copie server su Worker Cloudflare con D1 e R2.
- Le modifiche ai dati passano dallo Store; aggiornamenti e deploy non devono mai azzerare o ricreare archivi.
- Commit, push e deploy solo con autorizzazione esplicita.
