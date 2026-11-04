# Registro delle verifiche del setup Codex

Data: 4 novembre 2026. Base Git `2262ee0`, branch
`chore/github-publication-v74`, codice applicativo v74 derivato da `5738928`.
`AGENTS.md`, creato nel punto 2 e ancora non committato, era già presente all'inizio;
è stato aggiornato, non scartato. Questo registro riguarda i punti 3–8.

## Ambiente osservato

- Node `v24.19.0`, npm `11.9.0`; dipendenze presenti coerenti con `npm ls --depth=0`.
- Ambiente cloud con osservazioni attuali, rete HTTP unrestricted/enforced e VPN
  non configurata. Nessun segreto o identità esterna necessario a queste prove.
  Nessuna impostazione Cloud, credenziale o servizio di produzione modificato.
- Lockfile v3, 649 voci inclusa la root. Nessuna dipendenza applicativa aggiunta o
  aggiornata; la modifica al lockfile riguarda soltanto il requisito Node della root.
- Le prove backend creano SQLite in memoria e sostituti R2; IndexedDB viene simulato
  nei test o creato in contesti browser temporanei con profili sintetici.
- Log, sonde diagnostiche, strumenti QA e screenshot nuovi sono in
  `/tmp/gymtrack-codex-setup/`, fuori dal repository. I vecchi log QA non sono
  stati sovrascritti. Quel percorso è temporaneo, non un archivio di lungo periodo.

## Baseline prima delle modifiche al setup

| Comando                                                                | Esito osservato                                                                    |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `npm test`                                                             | PASS: 91 suite, 801 test                                                           |
| `npm run check`                                                        | PASS: build Angular strict sviluppo                                                |
| `npm run build`                                                        | PASS: produzione e postbuild; warning preesistenti sotto                           |
| `npm run verify:build`                                                 | PASS: manifest/hash/icone e 51 bundle in precache                                  |
| `node tests/runtime/design-studio-package-check.mjs`                   | PASS: sessione, migrazioni, draft, pubblicazione e rollback con SQLite isolato     |
| `node tests/runtime/packaged-training-upgrades.mjs`                    | PASS: quattro gruppi di controlli su login, preferenze, protezione storico e icone |
| `prettier --check src tests tools *.json *.md .github/workflows/*.yml` | FAIL preesistente: 269 file non conformi                                           |

### Preparazione da lockfile

La prima installazione in una directory temporanea ha fallito con ENOENT sulla
cache npm predefinita `/home/agent/.npm/_cacache`; i warning sui tarball precedevano
l'errore di scrittura. Non è stato cancellato il `node_modules` funzionante dell'app.
Il tentativo con cache scrivibile ha installato 472 pacchetti per questa piattaforma.
La configurazione `.npmrc` risolve il percorso della cache per i checkout futuri.
Sono stati verificati separatamente installazione e controlli in una copia pulita.

## Controlli del risultato

| Comando/prova                                                                | Esito                                                                                                    |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `npm run quality` nel checkout principale                                    | PASS: typecheck senza emissione, 91 suite/801 test, build produzione, verifica PWA e Worker confezionato |
| `npm ci --no-audit --no-fund` nella copia isolata con `.npmrc`               | PASS: 472 pacchetti installati, con script di installazione abilitati                                    |
| `npm run quality` nella copia isolata installata da lockfile                 | PASS: 91 suite/801 test, typecheck, build, PWA e Worker; buildId identico al checkout principale         |
| `npm run format:setup`                                                       | PASS: formattazione dei file del setup                                                                   |
| `npm run format:check`                                                       | FAIL preesistente: stessi 269 file della baseline                                                        |
| `npm start -- --port 4200` e richiesta HTTP locale                           | PASS: compilazione e HTTP 200; server chiuso dopo la prova                                               |
| `npm run preview` e richiesta HTTP locale                                    | PASS: HTTP 200 su loopback; server chiuso dopo la prova                                                  |
| `npm run package:deploy -- /tmp/gymtrack-codex-setup/gymtrack-deploy.tar.gz` | PASS: archivio completo, 12 migrazioni alla root, nessun database personale                              |
| Runner browser `training-upgrades-browser.mjs`                               | PASS: 10 scenari su fixture locale, larghezze 320/390 px, nessuna eccezione applicativa                  |
| Runner browser `workout-data-safety-browser.mjs` su fixture nuova            | PASS: 8 scenari, recupero selettivo, carichi e percentuale Home con dati sintetici                       |
| `workerd test tests/runtime/calendar.capnp`                                  | PASS sul runtime reale isolato                                                                           |
| `workerd test tests/runtime/push.capnp`                                      | PASS: firma VAPID e compatibilità richieste, senza notifiche reali                                       |
| Tre sonde diagnostiche temporanee dell'audit                                 | PASS nel riprodurre A1 (due casi) e A2, non una correzione dei difetti                                   |
| Collegamenti documentali, script, YAML, lockfile e diff                      | PASS: controllo locale dei percorsi, workflow e integrità; nessuna modifica applicativa                  |

Per i runner browser sono stati usati Playwright `1.58.2` e Chromium locale,
installando gli strumenti QA fuori dal progetto. Runtime aggiuntivo verificato:
`workerd@1.20261104.1`; `nodejs_compat` produce un avviso perché è già predefinito
nel runtime attuale. Non è un fallimento del test.

Un primo avvio della fixture senza accesso rete nel sandbox ha restituito EPERM
sull'ascolto loopback; con il permesso di rete locale è partito. La prima prova di
recupero dopo il runner allenamenti ha trovato la revisione server 1 anziché 0:
il server in memoria era stato riutilizzato. La procedura ora richiede una fixture
nuova per ciascun runner. Questo errore di isolamento è registrato separatamente
dalle regressioni applicative; l'esito della ripetizione è nella tabella.

## Risultati audit e prestazioni

| Verifica                                  | Esito                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `npm audit --json`                        | Exit 1: 26 pacchetti segnalati, 3 high e 23 moderate, zero critical       |
| `npm audit --omit=dev --json`             | Exit 1: 9 moderate, zero high/critical                                    |
| Backup futuro e data workout invalida     | Server accetta, client rifiuta: difetti confermati A1                     |
| Stream API ordinaria senza Content-Length | 256 KiB consumati prima del 413: difetto confermato A2                    |
| Build produzione                          | 1,44 MB iniziali; stima Angular 302,51 kB trasferiti; warning budget 1 MB |
| Manifest precache gruppo `app`            | 146 file, 52 JavaScript, 33.229.799 byte su disco                         |
| Worker autosufficiente                    | 168 asset incorporati, file di 65.985.532 byte                            |

Rimangono anche i warning CommonJS di ExcelJS e JSZip. Non sono stati aumentati
i budget né disattivati controlli per nascondere questi esiti. L'audit non prova
exploit in produzione e non applica aggiornamenti automatici alle dipendenze.
Le misure di file non equivalgono a latenza, memoria o traffico di un iPhone.

## Limiti e integrazione

- Nessuna prova su iPhone fisico, fotocamera, installazione Safari, rete mobile o
  consegna push reale. Le prove Chromium con service worker bloccato nei runner
  non sostituiscono una verifica PWA offline sul dispositivo.
- Nessun accesso ai contenuti dell'archivio dell'utente e nessuna dichiarazione di
  recupero della seduta reale precedentemente persa.
- La configurazione GitHub Actions è stata controllata localmente, non eseguita da
  GitHub: richiede che le modifiche vengano pubblicate e che Actions sia abilitato.
- I problemi applicativi A1–A6 e le opportunità P1–P4 restano nel report, con task
  separati consigliati. La formattazione globale preesistente non è stata corretta.
- Nessun commit, push, merge o deploy fa parte delle verifiche locali. Il punto 8
  del piano richiede revisione del diff prima di integrare la configurazione approvata.
