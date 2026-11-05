# Test selettivi per GymTrack

Questa è una **ottimizzazione del ciclo di sviluppo**, non una modifica dell'applicazione.
Non cambia componenti, dati, API, migrazioni, worker o comportamento PWA.

## Uso

- Modifiche locali non ancora committate, più ultimo commit: `npm run test:affected`
- Confronto esplicito con un branch/ref: `npm run test:affected -- --base origin/NOME_BRANCH`
- Anteprima senza avviare Vitest: `npm run test:affected -- --base HEAD --list`
- Verifica dei tipi (per codice TS/Angular): `npm run typecheck`
- **Prima di merge/release:** `npm run quality` e controlli browser/Worker/iPhone pertinenti.

L'opzione `--base` confronta quel commit con il working tree corrente, includendo
modifiche non committate e file non tracciati. Se omessa, usa `HEAD^`
(quindi l'ultimo commit più le modifiche locali); su un repository con
un solo commit usa `HEAD`. Per PR con più commit specificare esplicitamente
la base corretta, dopo averla scaricata con Git.

## Criteri di selezione

Lo script `tools/test-affected.mjs`:
1. Ricava i percorsi modificati da Git, compresi file non tracciati.
2. Costruisce un grafo conservativo dagli import relativi e dai collegamenti
   Angular `templateUrl`, `styleUrl` e `styleUrls`.
3. Cerca i test Vitest che dipendono dai file modificati e aggiunge test di
   contratto del dominio (es. calendario, progressi, allenamenti).
4. Esegue **tutti** i test se tocca file trasversali o non riconosciuti,
   file di configurazione, Worker, database, Store, PWA, design system,
   modelli comuni o strumenti.
5. Non avvia Vitest per modifiche solo documentali; i test di regressione
   completi restano comunque obbligatori prima del merge.

La selezione è prudente ma **non prova l'assenza di regressioni**: gli import
dinamici non letterali, i riferimenti runtime e i flussi browser possono sfuggire
a un'analisi statica. Le prove su iPhone e offline restano manuali quando
pertinenti. `npm run test:affected` non sostituisce `npm run quality`.

## Esempi

| Modifica | Atteso |
| --- | --- |
| `src/app/features/calendar.component.css` | Test calendario e dipendenze |
| `src/app/features/progress.component.ts` | Test del dominio e dipendenze |
| `src/app/services/store.ts` | Suite Vitest completa |
| `src/app/core/database.ts` | Suite Vitest completa |
| `worker/calendar.js` | Suite Vitest completa, poi prove Worker pertinenti |
| Solo documentazione | Nessun test Vitest locale |

## Principio operativo

Limitare **analisi e modifiche** al dominio interessato; ampliare il raggio
quando il codice condiviso viene effettivamente cambiato. Dopo una modifica
di codice eseguire inoltre `npm run typecheck`, e prima dell'integrazione
eseguire `npm run quality`. I controlli GitHub Actions esistenti rimangono
invariati e continuano a eseguire la suite completa su push e pull request.
