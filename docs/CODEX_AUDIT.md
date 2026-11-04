# Audit di sicurezza, affidabilità e prestazioni

Analisi del 4 novembre 2026, codice applicativo derivato dal commit `5738928`,
HEAD iniziale `2262ee0`. I punti 5 e 7 del piano sono analisi: nessuna correzione
applicativa, migrazione remota o ottimizzazione è stata eseguita. Prove soltanto
locali con dati sintetici; non sono stati usati account o archivi di produzione.
Il registro completo dei comandi è in [CODEX_VERIFICHE.md](CODEX_VERIFICHE.md).

## Confini verificati

- [worker/index.js](../worker/index.js): identità verificata Sites richiesta, sessione
  legata al visitatore, cookie Secure/HttpOnly/SameSite, limiti tentativi di login,
  Origin/formato per le scritture e query con parametri. La sola presenza degli
  header non dimostra la sicurezza di un hosting diverso da Sites.
- [worker/design-studio.js](../worker/design-studio.js): lettura della configurazione
  pubblicata per account autenticati, operazioni amministrative solo SuperAdmin;
  versioni concorrenti, bozze e pubblicazioni controllate sul server.
- [worker/archive.js](../worker/archive.js): ambito derivato dall'identità corrente,
  digest degli oggetti R2, confronto atomico della revisione, checkpoint e rifiuto
  della riduzione dello storico senza intenzione esplicita.
- [database.ts](../src/app/core/database.ts), [store.ts](../src/app/services/store.ts),
  [archive-sync.ts](../src/app/services/archive-sync.ts): transazioni, coda locale,
  revisioni e protezione dai ripristini regressivi. I test esistenti coprono anche
  errori dopo un commit server e conflitti fra finestre.
- [worker/calendar.js](../worker/calendar.js): URL relay configurato dal server,
  redirect manuali rifiutati e segreto non restituito al client. Il solo feed
  calendario usa un link personale con token: non va incluso nei log o condiviso.

Queste sono verifiche di codice e test isolati, non una certificazione del sistema
pubblicato. Non è stato trovato nei flussi esaminati un bypass dimostrato del ruolo
SuperAdmin o dell'isolamento degli archivi; restano i problemi e i limiti seguenti.

## Problemi ordinati per rischio effettivo

### A1 — Backup accettato dal server ma rifiutato dal client

- **Classificazione:** difetto confermato di affidabilità, gravità media; interessa
  l'archivio dell'identità autorizzata, non dimostra accesso ai dati altrui.
- **Percorso:** `archiveValidate`, `worker/archive.js:30`, confrontato con
  `importBackup`, `src/app/services/backup.ts:225`.
- **Evidenza riprodotta:** una copia valida generata da `exportBackup(seed())`, con
  il solo `schemaVersion` cambiato a `999`, riceve HTTP 200 e crea la revisione 1
  nel server isolato; il client la rifiuta come versione più recente. Una seconda
  copia v11 con workout storico e `date: "not-a-date"` riceve 200 sul server ma
  viene rifiutata dal client. Tre sonde diagnostiche temporanee sono passate,
  includendo A2; non sono test che affermano la correttezza di questo comportamento.
- **Conseguenza:** un client difettoso o una scrittura manuale autorizzata può far
  diventare corrente una copia inutilizzabile per il ripristino ordinario. Le
  revisioni e i checkpoint precedenti attenuano il danno ma non allineano gli schemi.
- **Correzione minima proposta:** rifiutare versioni non supportate prima del commit;
  allineare almeno date, campi obbligatori e invarianti di dominio fra i due confini,
  mantenendo la compatibilità dei backup precedenti.
- **Rischio di regressione:** rifiuto di copie legacy valide; non cancellare o
  riscrivere automaticamente copie esistenti durante la correzione.
- **Test di soluzione:** aggiungere a `tests/archive-worker.test.ts` e `tests/domain.test.ts`
  una matrice client/server di versioni e date, aspettandosi HTTP 400 e testa/R2
  invariati per copie rifiutate; mantenere i roundtrip di backup supportati.

### A2 — Limite dei body ordinari verificato dopo la lettura completa

- **Classificazione:** difetto confermato del limite di lettura; gravità media,
  possibile consumo eccessivo di memoria, senza prova di indisponibilità reale.
- **Percorso:** `api`, `worker/index.js:143`, `request.text()` seguito dal controllo
  `raw.length`. Diversamente, archivio, push e Design Studio limitano lo streaming.
- **Evidenza riprodotta:** richiesta sintetica a `/api/auth/login` senza Content-Length,
  stream di 256 KiB in blocchi di 4 KiB; il server risponde correttamente 413 ma
  soltanto dopo aver consumato tutti i 262.144 byte, pur avendo limite 8.192.
  Il conteggio successivo usa caratteri, non byte UTF-8.
- **Conseguenza:** l'identità verificata dell'hosting è necessaria, ma non limita
  l'allocazione prima della verifica. Non è stato inviato traffico al sito reale.
- **Correzione minima proposta:** lettore condiviso con limite in byte, cancellazione
  appena superato e decodifica controllata, riutilizzando i pattern già esistenti.
- **Rischio di regressione:** immagini catalogo, caratteri multibyte e body vuoti
  possono cambiare esito se i limiti non restano specifici per endpoint.
- **Test di soluzione:** stream senza Content-Length oltre soglia, cancellazione
  anticipata, limite esatto, multibyte, JSON malformato e immagini valide; verificare
  che autenticazione, setup e cambio password conservino gli esiti previsti.

### A3 — Advisory delle dipendenze da valutare senza aggiornamenti automatici

- **Classificazione:** advisory confermati dal registry sul lockfile, non exploit
  dimostrati nell'app; priorità media, con severità massima dichiarata dal registry
  alta. `npm audit --json` ha restituito 26 pacchetti segnalati: 3 high, 23 moderate,
  nessun critical. I conteggi includono propagazioni della stessa advisory.
- **Percorso:** [package-lock.json](../package-lock.json); catene Angular CLI/build,
  Vite, Zod transitivo, ExcelJS e Drizzle Kit.
- **Evidenza:** i tre high sono `@angular/cli`, Vite transitivo del builder e Zod
  transitivo della CLI. Quest'ultimo è 4.6.5, mentre il runtime Zod diretto è 4.6.7.
  Riferimenti del registry: GHSA-mrhx-c7xc-m3w5 per Zod e GHSA-587h-7wmj-h5pm fra
  quelli Vite. ExcelJS risulta moderate attraverso dipendenze transitive.
  Il controllo separato `npm audit --omit=dev --json` riporta 9 moderate e nessuna
  high/critical; anche questo non prova la raggiungibilità di ogni advisory.
- **Conseguenza:** esposizione da stabilire per percorso, sistema operativo e input;
  un advisory del server di sviluppo non prova vulnerabilità del Worker distribuito.
- **Correzione minima proposta:** aggiornamenti compatibili e mirati delle catene
  effettivamente interessate, dopo verifica della raggiungibilità e delle versioni
  disponibili; non `npm audit fix --force` né override indiscriminati.
- **Rischio di regressione:** import Excel, compiler Angular, bundling e runtime di test.
- **Test di soluzione:** nuova installazione da lockfile, audit prima/dopo, `quality`
  e fixture Excel valide/malformate; non usare la sola riduzione del conteggio come
  prova della sicurezza di tutti i flussi.

### A4 — Crescita delle copie protette senza un budget complessivo

- **Classificazione:** meccanismo confermato, rischio plausibile di quota/prestazioni;
  gravità media per archivi grandi, nessun esaurimento misurato in questo task.
- **Percorso:** `GymDatabase.putCheckpoint`, `src/app/core/database.ts:108`;
  `completedCheckpointStatements` e `archiveCleanup`, `worker/archive.js:97`.
- **Evidenza:** i checkpoint locali `completed-workout` conservano dataset completi
  e non sono sottoposti alla potatura delle altre categorie. I riferimenti R2
  protetti sono esclusi dalla pulizia delle dieci revisioni ordinarie; modifiche
  successive dei grafi completati possono aggiungere riferimenti permanenti.
- **Conseguenza:** crescita di storage e lavoro di serializzazione; una quota locale
  piena può bloccare nuovi salvataggi. Questo non giustifica togliere le protezioni.
- **Correzione minima proposta:** prima misurare uso e crescita; progettare checkpoint
  compatti per seduta o deduplicazione, conservando possibilità e verifica di recupero.
- **Rischio di regressione:** alto se si introduce pulizia che elimina l'unica copia
  utile; mantenere migrazione reversibile e nessuna potatura automatica iniziale.
- **Test di soluzione:** molte sedute/modifiche con quota simulata, recupero oltre
  dieci revisioni, riapertura e conservazione di sessioni/profilo/piano estranei.

### A5 — Trasferire il Worker su un hosting diverso richiede un nuovo confine di identità

- **Classificazione:** rischio condizionale alto in caso di distribuzione diretta;
  non vulnerabilità confermata dell'hosting Sites attuale.
- **Percorso:** `worker/index.js:89`, `session`, bootstrap proprietario;
  `.openai/hosting.json` e procedure di distribuzione.
- **Evidenza:** il Worker si affida agli header di identità inseriti dall'hosting;
  non verifica da solo una firma ChatGPT. Gli header delle fixture sono simulati
  appositamente soltanto su loopback. Pubblicare direttamente questo handler senza
  un ingresso fidato ne cambia il modello di sicurezza.
- **Conseguenza:** su un endpoint raggiungibile che lasci controllare quegli header,
  il chiamante potrebbe impersonare l'identità verificata richiesta dal codice.
- **Correzione minima proposta:** mantenere il percorso hosting attuale; qualsiasi
  migrazione richiede autenticazione verificata e rimozione/sostituzione degli
  header non fidati all'ingresso. Il setup rende Pages esplicitamente solo statico.
- **Rischio di regressione:** alto per bootstrap, sessioni e ambiti degli archivi.
- **Test di soluzione:** ambiente di staging isolato con header falsificati rifiutati,
  poi login, ruoli e separazione utenti; mai verifiche invasive sulla produzione.

### A6 — Uscita rapida e salvataggi locali molto lenti

- **Classificazione:** scelta di comportamento confermata, rischio residuo plausibile,
  gravità media per input ancora in scrittura; non causa accertata dell'incidente.
- **Percorso:** `prepareExit('logout')`, `src/app/services/pwa.ts:62`, e
  `finishLogoutUpdate`, seguito dal reload; `AuthService.logout` conserva l'intenzione
  di uscita per impedire la riapertura involontaria dell'account.
- **Evidenza:** l'uscita dà al salvataggio locale fino a un secondo, poi procede;
  diversamente dall'aggiornamento non dipende dal completamento del backup.
- **Conseguenza:** una scrittura/draft eccezionalmente lenta può non terminare prima
  della chiusura. Bloccare indefinitamente il logout introdurrebbe un diverso rischio
  di accesso al precedente account.
- **Correzione minima proposta:** riprodurre con salvataggio ritardato e rendere
  durevole l'intenzione/input necessario prima del reload, mantenendo l'uscita rapida.
- **Rischio di regressione:** logout bloccato, riapertura offline o esposizione
  dell'account precedente.
- **Test di soluzione:** scrittura >1 secondo, quota esaurita, offline, ritorno
  online e account successivo, senza perdere dati già confermati o riaprire l'identità.

I primi tre interventi applicativi raccomandati sono A1, A2 e aggiornamenti mirati A3.
A5 è un vincolo bloccante prima di una futura migrazione di hosting. Non sono stati
corretti durante l'audit; richiedono task separati con i test indicati.

## Prestazioni: quattro interventi, senza ottimizzazioni speculative

Le misure seguenti derivano dalla build di questo task, non da un iPhone. Nessun
numero di latenza, frame rate, memoria mobile o risparmio percentuale è stato inventato.

### P1 — Ridurre il peso del precache iniziale mantenendo l'offline

- **Misurato:** bundle iniziale 1,44 MB, stima trasferimento Angular 302,51 kB;
  warning oltre budget 1 MB. Il gruppo `app` del manifest precache contiene
  146 file, 52 JavaScript e 33.229.799 byte su disco; il verificatore conta 51
  bundle, con esclusione dei file service worker indicati nel suo filtro.
- **Percorso:** [ngsw-config.json](../ngsw-config.json), asset `public/`,
  `tools/package-worker.mjs`, `tools/verify-build.mjs`.
- **Ipotesi:** installazione/aggiornamento più pesanti del solo caricamento iniziale,
  dato che immagini e chunk lazy inclusi nel gruppo `app` sono comunque prefetched.
  Questi byte non equivalgono a traffico HTTP reale o durata su rete mobile.
- **Misura riproducibile:** build pulita; sommare `stat.size` dei percorsi in
  `ngsw.json → assetGroups[name=app].urls`; registrare installazione e aggiornamento
  con cache fredda/calda e rete controllata, poi ripetere su Safari installato.
- **Intervento proposto:** individuare asset grandi e spostare solo quelli non
  essenziali in cache lazy; beneficio atteso alto se il precache è il collo di
  bottiglia, complessità media e rischio offline medio/alto.
- **Prima/dopo:** stessa build/funzionalità, byte e richieste installazione,
  apertura offline di ogni pagina prevista, icone, figure e import Excel.

### P2 — Ridurre copie e scritture dell'archivio locale

- **Verificato nel codice, latenza non misurata:** `Store.change` clona il dataset,
  `GymDatabase.replace` valida e riscrive tutte le raccolte; i checkpoint completati
  possono copiare e confrontare JSON dell'intero archivio.
- **Percorso:** `src/app/services/store.ts:200`, `src/app/core/database.ts:72`.
- **Misura riproducibile:** profili sintetici con quantità crescenti di sedute,
  serie e foto; misurare conferma serie, scrittura IndexedDB e riapertura con mediane
  e p95 su iPhone, registrando quota e dimensioni. fake-indexeddb non misura Safari.
- **Intervento proposto:** transazioni mirate e checkpoint compatti soltanto dopo
  il profilo; beneficio potenzialmente alto su archivi grandi, complessità alta,
  rischio di regressione dati alto.
- **Prima/dopo:** stessi dataset e operazioni; nessuna perdita in crash, conflitto,
  aggiornamento, eliminazione intenzionale e recupero selettivo.

### P3 — Evitare lavoro ripetuto nella sincronizzazione completa

- **Verificato nel codice, costo non misurato:** `ArchiveSyncService.changed` clona
  snapshot, il backup converte immagini e il server ricostruisce/hash tutti i grafi
  completati prima di verificare quali checkpoint siano già noti. La debounce di un
  secondo limita frequenza, non dimensione della singola copia.
- **Percorso:** `src/app/services/archive-sync.ts:263`,
  `src/app/services/backup.ts:195`, `worker/archive.js:113`.
- **Misura riproducibile:** stessa modifica e archivi sintetici crescenti; contare
  byte upload, conversioni, letture R2, CPU e query D1 in ambiente isolato. Separare
  salvataggio locale e conferma server; non usare i dati reali dell'utente.
- **Intervento proposto:** indici dei grafi, fingerprint riutilizzabili e deduplicazione
  di lavoro prima di progettare eventuali delta di rete; beneficio da misurare,
  complessità media/alta e rischio medio/alto sul protocollo delle revisioni.
- **Prima/dopo:** stessi hash e archivi risultanti, CAS concorrenti, risposta persa
  dopo commit, riduzione intenzionale dello storico e checkpoint protetti.

### P4 — Valutare il costo degli asset incorporati nel Worker

- **Misurato:** `dist/server/index.js` occupa 65.985.532 byte; il packager incorpora
  168 asset in Base64. Non è una misura della RAM o del tempo di avvio del runtime.
- **Percorso:** `tools/package-worker.mjs:53`, `worker/index.js:249`.
- **Misura riproducibile:** dimensione del file e dell'artefatto compresso, avvio a
  freddo e risposta degli asset sotto il runtime effettivo, senza cambiare hosting.
- **Intervento proposto:** valutare soltanto con il contratto dell'hosting se usare
  asset statici separati o decodifica/cache più efficiente; beneficio incerto,
  complessità alta e rischio alto per ingresso privato, icone e coerenza della build.
- **Prima/dopo:** stesse risposte e hash, login, cache, icone iPhone, aggiornamenti
  e caricamento offline; non separare gli asset se aggira il confine di accesso.

Nessun intervento P1–P4 è stato applicato. Il task successivo sulle prestazioni
dovrebbe misurare P1 sul dispositivo prima di scegliere un cambiamento.
