# GymTrack

Diario personale di palestra in italiano con Angular e TypeScript. L’archivio personale viene conservato in IndexedDB e copiato sul server quando rete e accesso sono disponibili. Il Worker usa D1 per account, revisioni e catalogo condiviso, e R2 per copie immutabili complete dell’archivio. Nessun allenamento dimostrativo viene inserito.

Per lavorare con Codex: [AGENTS.md](AGENTS.md) e [guida operativa](docs/CODEX_OPERATIVO.md).
Esiti delle verifiche in [CODEX_VERIFICHE.md](docs/CODEX_VERIFICHE.md);
analisi di sicurezza e prestazioni in [CODEX_AUDIT.md](docs/CODEX_AUDIT.md).

## Aggiornamenti e registrazione rapida

La scelta dello spazio locale o dell’account viene conservata tra riaperture. In Home, Piani e Profilo, **Ritrova piani ed esercizi** controlla gli altri archivi autorizzati di questa installazione e aggiunge i dati mancanti senza cancellare le copie originali. Safari e l’app installata possono usare contenitori separati: il controllo deve essere eseguito anche nell’ambiente dove erano stati inseriti i dati.

In **Profilo → Backup e ripristino**, Protezione dati mostra lo stato reale della copia server. Una copia popolata non viene sovrascritta da un archivio nuovo vuoto. Revisioni concorrenti vengono bloccate e le ultime dieci copie server restano conservate. Le modifiche offline restano locali finché la copia server non è confermata; l’aggiornamento esplicito dell’app attende anche tale conferma. La copia dello spazio senza account è legata all’identità ChatGPT verificata dal sito; quella dell’account richiede l’accesso allo stesso account GymTrack.

Le nuove versioni mantengono lo stesso indirizzo, gli stessi nomi degli archivi e i dati esistenti. Le migrazioni aggiungono le nuove strutture senza reinizializzare l’archivio. L’app mostra l’archivio locale appena letto e controlla copia server, catalogo e tema in background. Un ripristino arrivato dopo una modifica locale viene fermato e segnalato come conflitto. Le copie interrotte vengono ritentate al rientro e al ritorno della rete, con attese progressive. Una seconda finestra con dati vecchi non può sovrascrivere una modifica già salvata da un’altra finestra. Il browser riceve anche la richiesta di archiviazione persistente.

Le bozze di profilo, obiettivi, misurazioni, pasti, piani, catalogo e serie sono conservate per archivio in un database locale separato. Il cambio di sezione attende la loro scrittura; una bozza incompleta non viene aggiunta automaticamente ai dati confermati. Le foto e gli ingredienti dei pasti possono essere recuperati senza riavviare l’AI. Password e credenziali non vengono memorizzate nelle bozze. I moduli chiedono conferma prima di scartare modifiche; la rimozione di un esercizio dal piano è protetta. Il JSON standard e la copia server includono i dati confermati, non le bozze ancora incomplete. Cancellare i dati del sito elimina anche queste ultime.

In **Profilo → Impostazioni**, **Esci dall’app** conserva le bozze e completa i salvataggi prima di revocare la sessione. Il ricaricamento finale impedisce a un altro account di riutilizzare lo Store del precedente. L’uscita offline conserva la revoca da inviare prima di un nuovo accesso online. Il comando di aggiornamento congela temporaneamente i campi, verifica i salvataggi e la copia server, poi ricarica; un errore permette di riprovare senza cancellare lo stato dei dati.

Il Super Admin dispone di **Distribuisci ultima versione** nelle impostazioni: il server verifica il ruolo e registra la richiesta per la versione già pubblicata, identificata anche nel manifest del service worker. Il pulsante non realizza né pubblica nuovo codice. Ogni dispositivo controlla all’apertura, al rientro e al ritorno della connessione; applica una versione scaricata e verificata dopo i salvataggi, rinviando il ricaricamento durante un allenamento o la digitazione. Il logout controlla gli aggiornamenti prima della riapertura. L’app chiusa o offline controlla al successivo avvio utile; i client precedenti devono prima ricevere la versione che contiene questo meccanismo.

La selezione degli esercizi cerca tutte le parole digitate anche all’interno dei nomi, in qualsiasi ordine e senza distinguere maiuscole o accenti. I risultati mostrano foto personali, immagini del catalogo oppure illustrazioni locali del movimento, disponibili offline. Le illustrazioni indicano la famiglia del movimento; non rappresentano ogni variante di presa o macchina.

I messaggi di salvataggio, modifica ed errore compaiono come popup e scompaiono dopo 3 secondi; ogni nuovo messaggio, anche identico, riavvia la durata. Chiudere il popup non cancella lo stato di errore necessario a proteggere i salvataggi. I campi e le finestre dei moduli seguono l’area visibile sopra la tastiera; durante la digitazione i comandi flottanti lasciano spazio al contenuto. Le bozze di profilo e obiettivi conservano le modifiche ancora in corso anche quando altre sezioni aggiornano l’archivio.

Durante una sessione, toccare un esercizio apre direttamente la prossima serie. Peso e ripetizioni hanno controlli vicini, i dettagli facoltativi sono richiudibili e il pulsante di conferma resta a portata di mano. I salvataggi ripetuti dello stesso modulo condividono la stessa operazione anziché creare nuove copie.

In **Piani**, ogni piano dispone di **Elimina piano**, con conferma del nome: vengono rimossi solo quel piano, i suoi giorni e gli esercizi programmati. Allenamenti e serie già registrati, catalogo, altri piani e voci del calendario rimangono conservati. Un piano con una sessione aperta richiede prima di riprenderla o concluderla. L’aggiornamento non modifica identità, nomi dei database o versioni dell’archivio personale.

Aprendo un giorno del piano, **Registra un allenamento passato** permette di scegliere la data effettiva prima di inserire le serie, anche per piani archiviati. La sessione mostra la data in evidenza e permette di indicare la durata effettiva. Le conferme passano direttamente alla serie successiva senza timer o notifiche di recupero. Dal calendario, le programmazioni passate vengono registrate nella loro data. Le sessioni aperte non vengono sostituite; date impossibili o future sono rifiutate e i riferimenti precedenti escludono gli allenamenti successivi alla data scelta.

Nello storico, i telefoni mostrano schede verticali per le serie anziché una tabella da scorrere lateralmente. Copiare i valori precedenti richiede conferma e conserva lo stato delle serie già completate o saltate. La navigazione rispetta la sezione richiesta all’apertura; i cambi di sezione partono dall’alto e Indietro ripristina la posizione. La data corrente e le statistiche settimanali si aggiornano anche quando l’app rimane aperta oltre mezzanotte, mantenendo le date scelte intenzionalmente nei moduli.

Gli avvisi del recupero fuori app sono attivi di default e disattivabili nelle impostazioni. iOS richiede il consenso alle notifiche da un tocco esplicito; ogni nuovo recupero mostra poi l’ora di fine. **Timer fuori app** apre anche Picture-in-Picture dove supportato. Il timer interattivo nella tendina con Pausa/Riprendi, come Orologio, richiede una versione iOS nativa con ActivityKit/WidgetKit: non è disponibile tramite le API web di questa PWA. Il tempo usa una scadenza assoluta e si riallinea al rientro.

In **Alimentazione**, scattare o scegliere una foto avvia il riconoscimento automaticamente. Il modello MobileNet gratuito è servito dallo stesso sito e viene caricato al primo utilizzo, senza preparazione manuale; il service worker conserva runtime e pesi per l’uso offline. La cache IndexedDB del modello è facoltativa: un errore della cache non interrompe l’analisi. Avanzamento, annullamento e ripetizione sono disponibili accanto alla foto; errori e timeout mantengono il pasto compilato. La foto viene preparata senza deformazioni e non è inviata a servizi AI. Il modello generico riconosce solo alcuni alimenti; le associazioni esatte escludono oggetti e animali omonimi, mentre quantità e valori rimangono sempre da confermare prima del salvataggio.

## Avvio rapido

Requisiti: Node.js 24 LTS (almeno 24.15.0, richiesto dalle dipendenze Angular) e npm. `.nvmrc` seleziona la serie 24; `.npmrc` usa la cache scrivibile `.cache/npm`, esclusa da Git. È necessaria una connessione per installare le dipendenze. Il diario personale funziona offline dopo il primo caricamento; account e catalogo condiviso richiedono la connessione.

```bash
npm ci
npm start
```

Apri `http://localhost:4200`. Il service worker è disabilitato nella modalità sviluppo. Da un telefono sulla stessa rete puoi usare l'indirizzo LAN del computer per provare il layout; l'installazione PWA e il service worker richiedono HTTPS, salvo l'eccezione localhost sul dispositivo stesso.

```bash
npm test          # Vitest, logica e IndexedDB simulato
npm run typecheck # Angular e template strict senza generare la build
npm run check    # compilazione Angular strict in sviluppo
npm run build    # build ottimizzata + service worker
npm run quality  # typecheck, test, build, verifica PWA e Worker confezionato
npm run preview  # serve dist/gymtrack/browser su http://localhost:4173
```

La build viene generata in `dist/gymtrack/browser` ed è esclusa da Git. Non aprire `index.html` con `file://`: usa un server statico o un hosting HTTPS. L'anteprima statica non espone le API Worker; per provarle con dati sintetici usare la fixture descritta nella guida operativa. `tools/sandbox-compat.cjs` è un adattamento opzionale per ambienti limitati che non espongono le statistiche di memoria di Node; `npm run build:sandbox` lo abilita, ma richiede poi `npm run postbuild` per confezionare il Worker. Non viene incluso nell'app e normalmente non serve.

## Primo utilizzo

1. In **Profilo**, scegli nome, unità di peso e preferenze.
2. In **Piani**, crea un piano e uno o più giorni. I giorni possono essere una rotazione libera o avere un giorno della settimana indicativo.
3. Aggiungi gli esercizi dal catalogo: serie, intervallo di ripetizioni, carico, recupero, RPE e note. Puoi riordinare, duplicare giorni e piani, modificare o archiviare.
4. Inizia un allenamento. Registra i valori e conferma ogni serie con la spunta. Puoi copiare l'ultima sessione o abilitare la precompilazione in Profilo.
5. Le modifiche vengono salvate su IndexedDB. La Home consente di riprendere una sessione interrotta. Concludi per inserirla nello storico e nei grafici.
6. In **Allenamenti**, filtra, apri e modifica lo storico. Le modifiche sono automatiche e aggiornano statistiche e record. L'eliminazione richiede conferma.
7. In **Progressi**, cambia piano, esercizio, metrica e periodo. In **Profilo → Gestisci catalogo** aggiungi e modifica gli esercizi e le immagini.

Il “prossimo allenamento” segue l'ordine dei giorni del piano attivo dopo l'ultima sessione completata. Il giorno settimanale è informativo: non blocca la rotazione e non crea una pianificazione automatica. È ammessa una sola sessione in corso. Il catalogo usa disattivazione, i piani archiviazione: lo storico resta disponibile. Le serie non completate sono conservate ma escluse dai calcoli. La durata iniziale è il tempo trascorso tra inizio e conclusione e può essere corretta nello storico.

## Grafici e carichi

- Volume = somma di peso × ripetizioni delle serie completate, **solo per carichi esterni**.
- Stima Epley = peso × (1 + ripetizioni / 30), solo carichi esterni. Non equivale a un massimale testato.
- Corpo libero: si registrano le ripetizioni; il volume non è stimato a zero né confrontato con un bilanciere.
- Zavorra: il campo peso rappresenta il peso aggiunto. Assistito: rappresenta l'assistenza (meno assistenza può indicare un miglioramento).
- Volume settimanale aggregato dal lunedì. Filtro temporale calcolato dalla data corrente del dispositivo.
- Il peso viene memorizzato in kg; la visualizzazione e gli input vengono convertiti in lb quando scelto.
- La card Home conta gli **esercizi con un record**, non un conteggio artificiale di trofei o nuovi record raggiunti.
- Le statistiche di un esercizio e i valori precedenti si riferiscono alla sua modalità di carico attuale. Cambiare modalità nel catalogo non riscrive i log: gli snapshot storici restano consultabili. Per seguire due modalità in parallelo, crea due esercizi distinti.
- Il confronto mostra carico massimo e migliori ripetizioni a quel carico nelle ultime due sessioni compatibili. Non dichiara un miglioramento complessivo a parità di altre condizioni.

## Backup e ripristino

In **Profilo → Esporta backup**, scarica il JSON e verifica che il browser l'abbia salvato. Contiene tutte le tabelle, impostazioni e immagini Blob codificate Base64. Conservalo con cura: include informazioni personali e non è cifrato.

**Importa backup** legge il file senza modificare il database, verifica intestazione/versione, forme dei dati, numeri, date, duplicati, riferimenti e formato/dimensione delle immagini. Mostra quindi una conferma con conteggi. Solo dopo la conferma sostituisce tutte le tabelle in una transazione Dexie: un errore provoca rollback. Non vengono fusi archivi diversi. Limite file 50 MB; singola immagine 2 MB, JPEG/PNG/WebP.

Schema iniziale `schemaVersion: 1`. La mappa `migrations` in `backup.ts` è il punto di estensione per future trasformazioni pure vN → vN+1, da aggiungere con test quando cambia lo schema. Le versioni future o senza migrazione disponibile vengono rifiutate. Le versioni IndexedDB si evolvono separatamente in `database.ts`.

Per pubblicare, dopo la build usare `npm run package:deploy`: l’archivio include anche `drizzle/` alla radice, con SQL e journal necessari alle migrazioni del database ospitato. Dopo il deploy controllare che siano presenti `archive_heads` e `archive_versions` prima di considerare disponibile la copia server.

## Architettura

```text
src/app/
  core/          database Dexie, seed iniziale, routing lazy
  models/        entità e tipi TypeScript
  repositories/  GymRepository, token DI, implementazione IndexedDB
  services/      Store con Signals, statistiche, integrità, backup, PWA
  guards/        permessi UI; autorizzazioni API verificate nel Worker
  layouts/       shell responsive e navigazione
  shared/        icone SVG locali, messaggi, grafici, editor serie
  features/      Home, piani, sessione, storico, progressi, profilo, catalogo
```

Componenti standalone, Reactive Forms per gli editor, Signals per lo stato e Angular Material per i controlli delle preferenze. La shell non contiene la logica dei domini. `GymRepository` astrae lettura e scrittura dello stato; un'implementazione REST potrà sostituirlo tramite DI, ampliando l'interfaccia per paginazione e sincronizzazione quando necessarie.

Il dataset personale contiene 17 raccolte, elencate in `src/app/models/domain.ts`; Dexie conserva anche metadati di revisione e checkpoint separati. Chiavi, indici e migrazioni sono in `src/app/core/database.ts`. Le scritture sono serializzate e atomiche sull'intero dataset; il controllo della revisione blocca una finestra rimasta indietro invece di sovrascrivere una modifica successiva. Il costo su archivi grandi va misurato prima di introdurre transazioni mirate.

I log conservano snapshot di nome piano, nome giorno, nome esercizio e modalità di carico. Cancellare un giorno non invalida lo storico. La validazione referenziale impone i riferimenti correnti dei piani, ma consente riferimenti storici a giorni non più presenti.

Il Worker verifica identità ChatGPT, sessioni dell’account e permessi prima delle operazioni condivise. I ruoli presenti in un backup locale non concedono permessi sul server. Catalogo e copie personali usano ambiti distinti; un visitatore non può scegliere l’identità o la chiave di archivio di un altro utente.

## PWA e offline

Manifest, icone 192/512, service worker Angular e precache delle risorse statiche, inclusi i chunk lazy, sono configurati. Dopo una prima apertura completa della build di produzione via HTTPS, attendi il completamento della registrazione e della cache prima di togliere la connessione. La registrazione avviene dopo la stabilizzazione dell'app o entro 3 secondi. I dati restano in IndexedDB, separati dalla cache del service worker.

Installazione: usa il pulsante in Profilo se il browser lo espone; altrimenti il menu del browser. Su iPhone: Safari → Condividi → Aggiungi alla schermata Home. Splash screen e prompt dipendono da browser/sistema. Nessuna risorsa essenziale richiede CDN o font remoti.

Le verifiche automatiche e browser effettivamente eseguite sono registrate nei documenti QA, con i rispettivi limiti. La prova su iPhone reale resta separata: seguire `QA_CHECKLIST.md` e `IPHONE_QA.md`, senza considerare una simulazione Chromium equivalente a Safari installato.

## Distribuzione completa e anteprima statica

L'app completa richiede il Worker con binding D1 `DB` e R2 `BUCKET`, oltre agli asset Angular. `npm run build` prepara il Worker in `dist/server/`; `npm run package:deploy` crea l'archivio con `.openai/hosting.json`, `drizzle/` alla root e `dist/`. Questi comandi non pubblicano né applicano migrazioni a database remoti. Preservare progetto, dominio, storage e policy di accesso dell'hosting esistente. Il codice server si affida all'identità verificata da Sites: non esporlo direttamente su un altro hosting senza progettare un confine di autenticazione equivalente.

Il workflow `.github/workflows/quality.yml` verifica push e pull request e prepara un artefatto completo; non esegue deploy. Il pulsante interno “Distribuisci ultima versione” attiva sui dispositivi una versione già pubblicata, non compila il repository.

L'app usa routing hash (`/#/piani`) e base relativa, così può essere servita in una sottocartella senza rewrite backend.

### GitHub Pages

Il workflow `.github/workflows/pages.yml` è un'anteprima statica facoltativa, avviabile solo manualmente confermando `confirm_static_only`. Richiede Pages già configurato nel repository e pubblica soltanto `dist/gymtrack/browser`: account, API e backup server non vengono distribuiti.

In alternativa pubblica manualmente quella cartella su un hosting statico HTTPS. Le funzioni personali locali restano disponibili; questa operazione non migra gli account o gli archivi server dell'app esistente. Non includere `node_modules` o dati personali.

### Cloudflare Pages

Con la sola directory `dist/gymtrack/browser` si ottiene la medesima anteprima statica. Per tutte le funzionalità servono anche backend, binding e identità verificata descritti sopra; il solo caricamento su Pages non li configura.

## Limiti dell'archiviazione locale

Le copie locali restano separate per browser, installazione, profilo e dominio. La copia server confermata consente il recupero dallo stesso ambito di identità, ma non può recuperare retroattivamente dati mai caricati o mai esportati. Conserva anche un JSON in File. La richiesta di persistenza al browser non è una garanzia contro la cancellazione locale. Copie concorrenti diverse vengono conservate e segnalate per il recupero, senza una fusione automatica distruttiva.
