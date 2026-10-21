# GymTrack

Diario personale di palestra in italiano con Angular e TypeScript. L’archivio personale viene conservato in IndexedDB e copiato sul server quando rete e accesso sono disponibili. Il Worker usa D1 per account, revisioni e catalogo condiviso, e R2 per copie immutabili complete dell’archivio. Nessun allenamento dimostrativo viene inserito.

## Aggiornamenti e registrazione rapida

La scelta dello spazio locale o dell’account viene conservata tra riaperture. In Home, Piani e Profilo, **Ritrova piani ed esercizi** controlla gli altri archivi autorizzati di questa installazione e aggiunge i dati mancanti senza cancellare le copie originali. Safari e l’app installata possono usare contenitori separati: il controllo deve essere eseguito anche nell’ambiente dove erano stati inseriti i dati.

In **Profilo → Backup e ripristino**, Protezione dati mostra lo stato reale della copia server. Una copia popolata non viene sovrascritta da un archivio nuovo vuoto. Revisioni concorrenti vengono bloccate e le ultime dieci copie server restano conservate. Le modifiche offline restano locali finché la copia server non è confermata; l’aggiornamento esplicito dell’app attende anche tale conferma. La copia dello spazio senza account è legata all’identità ChatGPT verificata dal sito; quella dell’account richiede l’accesso allo stesso account GymTrack.

Le nuove versioni mantengono lo stesso indirizzo, gli stessi nomi degli archivi e i dati esistenti. Le migrazioni aggiungono le nuove strutture senza reinizializzare l’archivio. Il comando di aggiornamento conserva la bozza attiva e attende il completamento dei salvataggi; un errore sospende il ricaricamento. Una seconda finestra con dati vecchi non può sovrascrivere una modifica già salvata da un’altra finestra. Il browser riceve anche la richiesta di archiviazione persistente. I dati personali restano locali: eliminare i dati del sito o usare un dispositivo, browser o archivio diverso richiede un backup per recuperarli.

La selezione degli esercizi cerca tutte le parole digitate anche all’interno dei nomi, in qualsiasi ordine e senza distinguere maiuscole o accenti. I risultati mostrano foto personali, immagini del catalogo oppure illustrazioni locali del movimento, disponibili offline. Le illustrazioni indicano la famiglia del movimento; non rappresentano ogni variante di presa o macchina.

I messaggi di salvataggio, modifica ed errore compaiono come popup e scompaiono dopo 3 secondi; ogni nuovo messaggio, anche identico, riavvia la durata. Chiudere il popup non cancella lo stato di errore necessario a proteggere i salvataggi. I campi e le finestre dei moduli seguono l’area visibile sopra la tastiera; durante la digitazione i comandi flottanti lasciano spazio al contenuto. Le bozze di profilo e obiettivi conservano le modifiche ancora in corso anche quando altre sezioni aggiornano l’archivio.

Durante una sessione, toccare un esercizio apre direttamente la prossima serie. Peso e ripetizioni hanno controlli vicini, i dettagli facoltativi sono richiudibili e il pulsante di conferma resta a portata di mano. I salvataggi ripetuti dello stesso modulo condividono la stessa operazione anziché creare nuove copie.

Gli avvisi del recupero fuori app sono attivi di default e disattivabili nelle impostazioni. iOS richiede il consenso alle notifiche da un tocco esplicito; ogni nuovo recupero mostra poi l’ora di fine. **Timer fuori app** apre anche Picture-in-Picture dove supportato. Il timer interattivo nella tendina con Pausa/Riprendi, come Orologio, richiede una versione iOS nativa con ActivityKit/WidgetKit: non è disponibile tramite le API web di questa PWA. Il tempo usa una scadenza assoluta e si riallinea al rientro.

In **Alimentazione**, scattare o scegliere una foto avvia il riconoscimento automaticamente. Il modello MobileNet gratuito è servito dallo stesso sito e viene caricato al primo utilizzo, senza preparazione manuale; il service worker conserva runtime e pesi per l’uso offline. La cache IndexedDB del modello è facoltativa: un errore della cache non interrompe l’analisi. Avanzamento, annullamento e ripetizione sono disponibili accanto alla foto; errori e timeout mantengono il pasto compilato. La foto viene preparata senza deformazioni e non è inviata a servizi AI. Il modello generico riconosce solo alcuni alimenti; le associazioni esatte escludono oggetti e animali omonimi, mentre quantità e valori rimangono sempre da confermare prima del salvataggio.

## Avvio rapido

Requisiti: Node.js 24 LTS e npm. È necessaria una connessione per installare le dipendenze. Il diario personale funziona offline dopo il primo caricamento; account e catalogo condiviso richiedono la connessione.

```bash
npm ci
npm start
```

Apri `http://localhost:4200`. Il service worker è disabilitato nella modalità sviluppo. Da un telefono sulla stessa rete puoi usare l'indirizzo LAN del computer per provare il layout; l'installazione PWA e il service worker richiedono HTTPS, salvo l'eccezione localhost sul dispositivo stesso.

```bash
npm test          # Vitest, logica e IndexedDB simulato
npm run check    # compilazione Angular strict in sviluppo
npm run build    # build ottimizzata + service worker
npm run preview  # serve dist/gymtrack/browser su http://localhost:4173
```

È inclusa anche una build pronta in `dist/gymtrack/browser`. Non aprire `index.html` con `file://`: usa un server statico o un hosting HTTPS. `tools/sandbox-compat.cjs` è un adattamento opzionale per ambienti limitati che non espongono le statistiche di memoria di Node; `npm run build:sandbox` lo abilita. Non viene incluso nell'app e normalmente non serve.

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
  guards/        interfaccia permessi locale per evoluzioni future
  layouts/       shell responsive e navigazione
  shared/        icone SVG locali, messaggi, grafici, editor serie
  features/      Home, piani, sessione, storico, progressi, profilo, catalogo
```

Componenti standalone, Reactive Forms per gli editor, Signals per lo stato e Angular Material per i controlli delle preferenze. La shell non contiene la logica dei domini. `GymRepository` astrae lettura e scrittura dello stato; un'implementazione REST potrà sostituirlo tramite DI, ampliando l'interfaccia per paginazione e sincronizzazione quando necessarie.

Dodici tabelle: profili, ruoli, piani, giorni, esercizi del piano, esercizi, gruppi, sessioni, esercizi delle sessioni, serie e impostazioni. Chiavi e indici sono dichiarati in Dexie. Le scritture della versione personale sono serializzate e atomiche sull'intero dataset, una scelta semplice per archivi personali. Per dataset molto grandi o più schede/browser concorrenti occorre passare a transazioni mirate e coordinamento: utilizzare una sola scheda per modificare i dati in questa versione.

I log conservano snapshot di nome piano, nome giorno, nome esercizio e modalità di carico. Cancellare un giorno non invalida lo storico. La validazione referenziale impone i riferimenti correnti dei piani, ma consente riferimenti storici a giorni non più presenti.

Il Worker verifica identità ChatGPT, sessioni dell’account e permessi prima delle operazioni condivise. I ruoli presenti in un backup locale non concedono permessi sul server. Catalogo e copie personali usano ambiti distinti; un visitatore non può scegliere l’identità o la chiave di archivio di un altro utente.

## PWA e offline

Manifest, icone 192/512, service worker Angular e precache delle risorse statiche, inclusi i chunk lazy, sono configurati. Dopo una prima apertura completa della build di produzione via HTTPS, attendi il completamento della registrazione e della cache prima di togliere la connessione. La registrazione avviene dopo la stabilizzazione dell'app o entro 3 secondi. I dati restano in IndexedDB, separati dalla cache del service worker.

Installazione: usa il pulsante in Profilo se il browser lo espone; altrimenti il menu del browser. Su iPhone: Safari → Condividi → Aggiungi alla schermata Home. Splash screen e prompt dipendono da browser/sistema. Nessuna risorsa essenziale richiede CDN o font remoti.

La verifica su un telefono reale e il test offline con browser non sono stati eseguiti in questo ambiente. Segui `QA_CHECKLIST.md` prima di affidare all'app dati importanti.

## Pubblicazione statica

L'app usa routing hash (`/#/piani`) e base relativa, così può essere servita in una sottocartella senza rewrite backend.

### GitHub Pages

Crea un repository e carica i sorgenti. È incluso `.github/workflows/pages.yml`: nelle impostazioni del repository seleziona **Pages → GitHub Actions**, poi esegui il workflow o fai push su `main`. Il workflow installa, esegue test, compila e pubblica soltanto `dist/gymtrack/browser`.

In alternativa pubblica manualmente il contenuto di quella cartella con il tuo metodo abituale per Pages. Non includere `node_modules`. Non sono richieste API o database. Il codice non attiva abbonamenti o risorse a pagamento.

### Cloudflare Pages

Puoi caricare la cartella `dist/gymtrack/browser` con un progetto statico oppure collegare il repository usando `npm run build` e directory di output `dist/gymtrack/browser`, con Node 24. Non servono Workers, binding di storage o backend. Nessuna pubblicazione esterna è stata eseguita durante questo lavoro.

## Limiti dell'archiviazione locale

Le copie locali restano separate per browser, installazione, profilo e dominio. La copia server confermata consente il recupero dallo stesso ambito di identità, ma non può recuperare retroattivamente dati mai caricati o mai esportati. Conserva anche un JSON in File. La richiesta di persistenza al browser non è una garanzia contro la cancellazione locale. Copie concorrenti diverse vengono conservate e segnalate per il recupero, senza una fusione automatica distruttiva.
