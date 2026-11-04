# Istruzioni per Codex — GymTrack

## Scopo e architettura

GymTrack è il diario di allenamento esistente: piani, serie, progressi, calendario,
alimentazione e GT Design Studio. È una PWA installabile su iPhone, non un progetto
iOS nativo. Estendere l'app attuale preservando navigazione, login e dati.

Stack: Angular 22 standalone, TypeScript strict, Signals, Angular Material e routing
hash; Dexie/IndexedDB per i dati locali; Worker Cloudflare con D1 e R2 per account,
configurazioni e copie server. Versioni e comandi fanno fede in `package.json` e
`package-lock.json`. Il calendario usa anche il Worker separato `calendar-relay/`.

## Dove intervenire e cosa riutilizzare

- `src/app/features/`, `src/app/layouts/`, `src/app/core/routes.ts`: pagine, shell e navigazione lazy.
- `src/app/shared/`: editor serie, conferme, grafici, selettori e controlli PWA.
- `src/app/services/store.ts`: stato e operazioni; `src/app/repositories/repository.ts`
  e `src/app/core/database.ts`: accesso all'archivio e transazioni.
- `src/app/services/`: cercare prima logica esistente, in particolare `statistics.ts`,
  `weekly-reuse.ts`, `exercise-replacement.ts`, `workout-safety.ts` e `backup.ts`.
- `src/app/design/` e `shared/design-system.js`: direttive, controlli registrati,
  palette e contratto condiviso con il server.
- `worker/`: API; `db/schema.ts` e `drizzle/`: schema D1 e migrazioni;
  `tools/`: build, verifiche e pacchetto di distribuzione.

Seguire i componenti standalone, Signals, dependency injection e form già adottati
nella sezione modificata. Usare i componenti condivisi prima di duplicarli; evitare
riformattazioni o refactoring estranei al task. Per Design Studio mantenere gli ID
stabili e gli ambiti globale/pagina/istanza; gli adattatori di presentazione non
devono cambiare handler, route, form, stati disabled o valori calcolati.

## Dati, API e sicurezza

- Passare dalle operazioni dello Store per modificare l'archivio; rispettare la coda
  di scrittura, la validazione e i controlli di revisione locale/server. Non mutare
  direttamente il dataset pubblicato dai Signals.
- Aggiornamenti e deploy non devono ricreare o azzerare archivi. Preservare nomi e
  separazione per account definiti nel repository, migrazioni compatibili, snapshot
  storici e checkpoint. Non aggirare i conflitti con sovrascritture automatiche.
- Salvaguardare il flush delle bozze prima di navigazione/aggiornamento e la copia
  protetta prima del reload in `src/app/services/pwa.ts`. Usare dati sintetici nelle prove; non
  dichiarare recuperata una seduta reale sulla base dei soli test.
- Le API sono relative a `/api/`. Conservare identità verificata dall'hosting Sites,
  sessioni con cookie protetti e controlli Origin/formato in `worker/index.js`.
  Ruoli locali e visibilità dei pulsanti non autorizzano operazioni server;
  l'accesso amministrativo a Design Studio va verificato anche nel Worker.
- Se cambia il formato dell'archivio, verificare insieme `src/app/models/domain.ts`,
  `src/app/core/database.ts`, `src/app/services/backup.ts`, `src/app/services/integrity.ts` e
  `worker/archive.js`. Per D1 aggiornare schema e migrazioni coerentemente;
  `npm run db:generate` genera file, non applica migrazioni al database.
- Riutilizzare `src/app/services/feedback.ts`: la chiusura del popup non deve cancellare lo stato di
  errore che blocca un salvataggio o aggiornamento. Mostrare gli errori all'utente,
  senza fingere riuscite o stampare credenziali, cookie e archivi personali.
- Non aggiungere segreti o dati di produzione a codice, fixture, log o documenti.
  Mantenere le esclusioni di `.gitignore` per credenziali, backup e file generati.

## Comandi dalla root

Usare Node.js 24 LTS (almeno 24.15.0) e npm con il lockfile esistente.
`.nvmrc` seleziona Node 24; `.npmrc` usa la cache ignorata `.cache/npm`.

| Operazione                                      | Comando                  |
| ----------------------------------------------- | ------------------------ |
| Installazione                                   | `npm ci`                 |
| Sviluppo                                        | `npm start`              |
| Test Vitest                                     | `npm test`               |
| Angular e template strict senza emissione       | `npm run typecheck`      |
| Compilazione Angular strict in sviluppo         | `npm run check`          |
| Build produzione e Worker tramite postbuild     | `npm run build`          |
| Verifica artefatti dopo la build                | `npm run verify:build`   |
| Test del Worker dopo la build                   | `npm run test:package`   |
| Verifiche essenziali complete, in sequenza      | `npm run quality`        |
| Formattazione dei file del setup                | `npm run format:setup`   |
| Anteprima statica della build, senza API Worker | `npm run preview`        |
| Creazione archivio di deploy, senza pubblicarlo | `npm run package:deploy` |

Non esiste uno script `lint`. `typecheck` usa `ngc --noEmit`; `check` genera una
build di sviluppo. `npm run format:check` controlla l'ambito storico completo e
segnala debito preesistente, distinto da `format:setup` e da `quality`.
`npm run format` riscrive i file, non è un controllo. Usare
`npm run build:sandbox` solo per i limiti dell'ambiente descritti nel README:
non esegue automaticamente il postbuild di `npm run build`.

Vitest esegue `tests/**/*.test.ts` in Node; non comprende i runner browser/runtime
in `tests/runtime/`. Per calendario e push consultare `tests/runtime/README.md`;
per iPhone e offline usare anche `QA_CHECKLIST.md` con il dispositivo reale.

## Task completato

1. Diff limitato alla richiesta, senza perdita di dati o modifiche preesistenti.
2. Per codice eseguibile: test pertinenti e `npm run typecheck`; prima di una release,
   `npm run quality` e `npm run format:setup`, più le prove pertinenti al flusso.
   Per modifiche solo documentali
   controllare accuratezza, percorsi e diff, senza build superflue.
3. Per modifiche al Worker/import/asset verificare anche il pacchetto generato:
   `tools/package-worker.mjs` compone esplicitamente i moduli. Il workflow
   `quality.yml` verifica push/PR e prepara l'artefatto, senza deploy. `pages.yml`
   pubblica solo un'anteprima statica su richiesta manuale; non distribuisce API,
   D1 e R2. Entrambi sono in `.github/workflows/`.
4. Riportare file cambiati, controlli realmente eseguiti e limiti rimasti; distinguere
   test sintetici, prove browser e verifica su iPhone. Non presentare log precedenti
   come nuove verifiche. Commit, push e deploy richiedono autorizzazione esplicita
   per il task, se non già concessa;
   preservare la cronologia, senza push forzati o eliminazione di branch/modifiche.

Dettagli da consultare senza duplicarli qui:
[guida operativa Codex](docs/CODEX_OPERATIVO.md),
[verifiche e limiti del setup](docs/CODEX_VERIFICHE.md),
[protezione e recupero allenamenti](docs/GT_PROTEZIONE_E_RECUPERO_ALLENAMENTI.md),
[Design Studio](docs/GT_DESIGN_STUDIO_IMPLEMENTAZIONE.md),
[testi e obiettivo settimanale](docs/GT_LOGO_TESTI_OBIETTIVO_SETTIMANALE.md).
