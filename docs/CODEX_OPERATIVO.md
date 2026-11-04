# Lavorare su GymTrack con Codex

Questa guida copre ambiente e procedure dei punti 3, 6 e 8 del piano Codex.
Le regole del progetto rimangono in [AGENTS.md](../AGENTS.md), gli esiti in
[CODEX_VERIFICHE.md](CODEX_VERIFICHE.md), le analisi in [CODEX_AUDIT.md](CODEX_AUDIT.md).

## Inizio di un task

1. Leggere `AGENTS.md`, controllare `git status --short --branch` e
   `git log -1 --oneline`. Conservare modifiche già presenti; non usare il vecchio
   `main` locale come prova che quella sia la versione più aggiornata.
2. Leggere soltanto pagine, servizi, test e documento funzionale coinvolti.
   Specificare risultato osservabile, casi limite e file da modificare; evitare
   refactoring estranei. Per personalizzazioni partire da `src/app/design/`;
   per allenamenti da Store, componenti condivisi e test del flusso.
3. Eseguire i controlli pertinenti prima di intervenire e registrare eventuali
   fallimenti preesistenti. Distinguere dati sintetici e dati reali.

## Ambiente riproducibile

- Node 24 LTS, almeno 24.15.0, e npm. `.nvmrc` seleziona la serie 24;
  `engines` dichiara il requisito Angular. Il lockfile fissa le dipendenze.
- `.npmrc` colloca la cache in `.cache/npm`, scrivibile nel workspace e ignorata
  da Git. Non richiede modifiche a `$HOME`, permessi globali o TLS disabilitato.
- Installazione: `npm ci`. Non usare `npm install` per rigenerare il lockfile
  durante una preparazione ordinaria.
- Avvio: `npm start`, frontend su `http://localhost:4200` senza service worker.
  Produzione locale: `npm run build`, poi `npm run preview` su
  `http://localhost:4173`, soltanto asset statici.
- Per test, build e fixture locali non servono credenziali o database di produzione.
  Vitest usa fake IndexedDB, SQLite in memoria e sostituti R2. Le migrazioni eseguite
  dai test si applicano esclusivamente ai database temporanei.

### Configurazione manuale di Codex Cloud

Non sono state cambiate impostazioni Cloud o associazioni GitHub da questo task.
Quando si crea o aggiorna l'ambiente di Codex per questo repository:

1. Aprire le impostazioni degli ambienti di Codex e selezionare il repository privato
   `gichitandu/gymTandu`, con accesso al branch di lavoro scelto.
2. Usare un'immagine/runtime con Node 24 compatibile. Se è disponibile nvm,
   `nvm install` e `nvm use` leggono `.nvmrc`; altrimenti predisporre Node nell'immagine.
3. Impostare come script di preparazione, dalla root del checkout:

   ```sh
   node --version
   npm --version
   npm ci
   ```

4. Consentire HTTPS verso il registry e i tarball indicati nel lockfile
   (`registry.npmjs.org`) durante l'installazione, mantenendo proxy e CA dell'ambiente.
   L'esecuzione dei test essenziali non richiede i servizi reali dell'app.
5. Non aggiungere segreti di produzione. Le funzioni opzionali calendario/push
   richiedono il relay separato soltanto per l'uso reale: documentazione in
   `calendar-relay/README.md`, non configurazione necessaria ai test.

In questo ambiente il primo download con cache predefinita è fallito perché la
directory della cache non era scrivibile; il tentativo isolato con cache scrivibile
è riuscito. Le versioni e i risultati osservati sono nel registro verifiche.

## Verifiche e loro ambito

| Comando                                                  | Cosa controlla                                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                      | Angular e template strict senza emettere la build                                                    |
| `npm test -- tests/weekly-reuse-and-replacement.test.ts` | Esempio di selezione di test pertinenti                                                              |
| `npm run quality`                                        | Typecheck, tutti i test Vitest, build, PWA e due runner del Worker confezionato, in sequenza         |
| `npm run format:setup`                                   | Formattazione di AGENTS, README, AUTHENTICATION, documenti CODEX, package/lockfile e workflow        |
| `npm run format:check`                                   | Formattazione dell'intero ambito dello script storico `format`; segnala anche il debito preesistente |
| `npm run package:deploy -- /tmp/gymtrack-deploy.tar.gz`  | Crea e verifica un archivio completo; non lo pubblica                                                |

`quality` non include il controllo globale di formattazione: il controllo iniziale
ha rilevato 269 file preesistenti non conformi. Non sono stati ignorati o
riformattati in massa. Il controllo globale resta eseguibile e fallisce finché
quel debito non viene risolto in un task dedicato; non esiste un lint ESLint.
Non interpretare `quality` riuscito come audit di sicurezza superato o prova iPhone.

### Browser e runtime Worker

Per ripetere le prove del browser dopo la build, avviare in un terminale
`node tests/runtime/design-studio-qa-server.mjs`. Ascolta soltanto su loopback,
simula l'identità e usa SQLite/R2 in memoria: non pubblicarlo e non riusarlo in
produzione. Occorrono Playwright e un Chromium locale già disponibili come strumenti
QA; non sono dipendenze dell'app. In un secondo terminale:

```sh
GYMTRACK_QA_OUTPUT=/tmp/gymtrack-training node tests/runtime/training-upgrades-browser.mjs
GYMTRACK_QA_OUTPUT=/tmp/gymtrack-recovery node tests/runtime/workout-data-safety-browser.mjs
```

Se il modulo Playwright non è risolvibile dal checkout, impostare
`GYMTRACK_PLAYWRIGHT_MODULE` al percorso assoluto del suo `index.mjs`;
`GYMTRACK_CHROMIUM` seleziona l'eseguibile (default `/usr/bin/chromium`).
La directory di output evita di sovrascrivere prove QA storiche. Riavviare la fixture
tra i runner: ciascuno assume un database in memoria inizialmente vuoto. Eseguirli
in sequenza con fixture nuove e chiudere il server al termine. Nel sandbox può essere
necessario abilitare l'accesso di rete per l'ascolto locale.

Per i due test workerd seguire [tests/runtime/README.md](../tests/runtime/README.md).
La versione verificata in questo task è `workerd@1.20261104.1`; installarla come
strumento QA separato se necessario. Sono test locali senza notifiche reali.
Nessuna di queste prove sostituisce Safari o l'app installata su iPhone:
usare anche [IPHONE_QA.md](../IPHONE_QA.md).

## Cinque procedure riutilizzabili

| Task         | Contesto e accettazione                                                                                                      | Confini e controlli                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Funzionalità | Pagina/servizio e documento funzionale; descrivere comportamento, stati vuoto/caricamento/errore, ruoli e offline pertinenti | Riutilizzare controlli e operazioni esistenti; test di dominio e flusso interessati, typecheck; build/PWA se cambiano runtime o asset            |
| Bug          | Passi riproducibili, risultato atteso/attuale e log redatti; stabilire la causa verificabile                                 | Prima test o esperimento che mostra il problema, poi correzione minima e prova che passa; preservare checkpoint e copie originali                |
| Code review  | Diff rispetto alla base esplicita, requisiti e risultati disponibili                                                         | Leggere anche i chiamanti; ordinare rilievi per impatto con file/riga, evidenza e test proposto; non modificare il codice durante la sola review |
| Refactoring  | Comportamento da mantenere e test che lo descrivono                                                                          | Delimitare un modulo; verifiche prima/dopo, nessuna variazione involontaria di API, schema, ID o UI; separare eventuali correzioni funzionali    |
| Rilascio     | Branch/base aggiornati, diff approvato, hosting e storage esistenti                                                          | `quality`, `format:setup`, pacchetto completo e prove pertinenti iPhone; controllare migrazioni e protezione dati prima dell'attivazione         |

Per ogni procedura: controllare `git diff --check`, leggere il diff finale, includere
anche i nuovi file di `git status`, dichiarare controlli realmente eseguiti e limiti.
Un task puramente documentale richiede verifica di comandi, collegamenti e diff,
non una ripetizione completa di test già validi. Non sono necessarie skill separate
o un file di prompt per ciascuna operazione: i modelli 9 e 10 dello ZIP si applicano
usando rispettivamente le righe Funzionalità e Bug, approfondendo prima la diagnosi
se il problema è critico.

## Revisione e integrazione

Il workflow `quality.yml` verifica push e pull request su tutti i branch, senza
segreti e senza deploy, e conserva per sette giorni l'artefatto completo della
build. `pages.yml` è soltanto un'anteprima statica manuale con conferma esplicita.
Per l'app completa restano necessari hosting Sites, D1, R2 e il confine di identità
attuale; non usare Pages come sostituzione automatica della distribuzione esistente.

Prima di integrare: esaminare diff e registro verifiche, approvare commit/branch
di destinazione e confrontare i riferimenti remoti aggiornati. Integrare con merge
o pull request senza riscrivere la storia, eliminare branch o sovrascrivere contenuti.
Non includere `dist/`, cache, backup personali o strumenti QA temporanei.
Il setup non cambia codice applicativo, schema o dati reali; non recupera di per sé
la seduta precedentemente segnalata come persa.

Tre task successivi prioritari, separati dal setup: allineare la validazione dei
backup server/client; limitare i body API durante la lettura; valutare aggiornamenti
mirati delle dipendenze segnalate dall'audit. Evidenze e rischi sono nel report audit.
Le attività indipendenti possono sovrapporsi (lettura e test isolati); build sviluppo,
build produzione, confezionamento e runner che condividono fixture devono restare
sequenziali. Questa guida non introduce una configurazione multi-agent.
