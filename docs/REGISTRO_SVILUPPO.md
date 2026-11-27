# Registro sviluppo

Agenda di errori, bug, migliorie e idee dell'app, con la cronologia delle correzioni.
Per ora raccoglie solo gli errori dell'account **Super Admin**. Claude lo legge prima di
lavorare (skill `registro-sviluppo`) per non ripetere correzioni già fatte o già smentite.

## Cosa viene registrato in automatico

| Origine | Da dove | Priorità iniziale |
| --- | --- | --- |
| Errore dell'app | `ErrorHandler` di Angular, `window.onerror`, promesse rifiutate | media |
| Messaggio di errore mostrato | ogni `FeedbackService.show('error', …)` | bassa |
| Errore del server | eccezioni inattese del Worker (risposta 503) nelle richieste del Super Admin | alta |

- Lo stesso errore (origine + pagina + messaggio senza numeri) diventa **una sola voce** con contatore.
  Vengono conservati solo gli ultimi 20 casi per voce.
- Il testo viene ripulito sul dispositivo e di nuovo nel Worker: niente email, token, cookie,
  valori nelle query, id lunghi o immagini. Non vengono mai inviati dati dell'archivio.
- Sul dispositivo la coda vive nel database `gymtrack-devlog-v1`, separato dall'archivio
  personale, al massimo 50 casi. Viene inviata ogni 30 secondi, al ritorno online e quando
  l'app passa in background. Se l'account non è Super Admin la coda viene svuotata.
- Insieme agli errori l'app invia quante volte ogni build è stata aperta e quali pagine
  (come definite nelle route, per esempio `/piano/:id`) sono state visitate.

## Stati di una voce

`Aperto` → `In corso` → `Da verificare` (correzione fatta, con riassunto, commit e test) →
`Risolto`. Da qualsiasi stato si può `Riaprire`; il Super Admin può `Scartare`.

**Chiusura automatica da parte di Claude.** Una voce *da verificare* può essere chiusa da
Claude solo quando il Worker conferma che:

1. una build pubblicata **dopo** la correzione è stata aperta almeno 2 volte;
2. se la voce riguarda una pagina dell'app, quella pagina è stata visitata almeno 2 volte con
   la nuova build (per gli errori del server basta il punto 1);
3. nel frattempo l'errore non è ricomparso.

Il controllo è nel Worker (`devLogVerification` in `worker/dev-log.js`), quindi vale anche se
lo script viene usato male. Claude non può scartare voci.

**Regressione.** Se un errore già corretto o risolto ricompare da una build pubblicata dopo la
correzione, la voce torna *Aperto* con l'etichetta *Regressione* e una nota nella cronologia.
I casi che arrivano da build vecchie ancora aperte su un dispositivo vengono solo contati.
Una voce scartata conta i nuovi casi ma non si riapre.

## Dove si trova

- Pagina: Profilo → Amministrazione → **Registro sviluppo** (`#/registro`).
- Worker: `worker/dev-log.js` (API `/api/dev-log/…`), collegato in `worker/index.js` e
  composto in `tools/package-worker.mjs`.
- App: `src/app/services/dev-log.ts` (raccolta, coda, guard),
  `src/app/features/dev-log.component.ts` (pagina).
- D1: tabelle `dev_items`, `dev_item_events`, `dev_occurrences`, `dev_build_usage`
  (migrazione `drizzle/0015_dev_log.sql`, schema in `db/schema.ts`).
- Claude: script `tools/dev-log.mjs` (`npm run devlog -- …`) e skill
  `.claude/skills/registro-sviluppo/SKILL.md`.

## Attivazione su Cloudflare

1. Applica la migrazione (crea solo tabelle nuove, non tocca quelle esistenti):

   ```sh
   npx wrangler d1 migrations apply gymtrack-accounts --remote
   ```

2. Crea il segreto per Claude, una stringa casuale di almeno 24 caratteri:

   ```sh
   openssl rand -hex 32   # copia il risultato
   npx wrangler secret put DEVLOG_TOKEN
   ```

   Senza `DEVLOG_TOKEN` la pagina e la raccolta funzionano lo stesso, ma Claude riceve
   «Registro per Claude non configurato».

3. Pubblica la nuova versione come di consueto.

### Accesso di Claude

Lo script legge due variabili, mai salvate nel repository:

- `DEVLOG_URL`: indirizzo dell'app pubblicata (per esempio `https://gymtrack.<account>.workers.dev`).
- `DEVLOG_TOKEN`: lo stesso valore del segreto del Worker.

Nelle sessioni cloud di Claude Code il token si salva come **credenziale dell'ambiente** per
l'host dell'app (Claude lo chiede con il modulo sicuro, mai in chat); il proxy lo aggiunge alle
richieste e lo script può fare a meno di `DEVLOG_TOKEN`. `DEVLOG_URL` va nelle variabili
dell'ambiente e l'host dell'app tra quelli consentiti dalla rete.

L'API per Claude (`/api/dev-log/agent/…`) accetta solo il token: non usa cookie, non apre
archivi o account e i tentativi con token sbagliato sono limitati come i login.

## Verifiche

- `tests/dev-log-worker.test.ts`: permessi, raggruppamento, limiti, pulizia dei dati, regola
  di chiusura, regressione, voci scartate, router del Worker ed errori del server.
- `tests/dev-log-client.test.ts`: raccolta, deduplica, invio, coda in caso di errore, account
  diversi dal Super Admin.
- Su iPhone (manuale): da offline provoca un errore, torna online e controlla che compaia una
  sola volta nella pagina Registro.
