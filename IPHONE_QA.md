# Matrice Safari iOS e PWA Home

Stato: **da eseguire su iPhone reale**. Il container di sviluppo non fornisce un dispositivo iOS né il browser previsto dalle istruzioni di Sites. I test Node/fake-indexeddb non certificano Safari.

## Preparazione

1. Prima dell’aggiornamento, esportare l’archivio esistente in File. Non cancellare i dati del sito.
2. Aprire la versione aggiornata online; attendere il precache. In Profilo → iPhone controllare Service worker attivo.
3. Eseguire “Test su questo dispositivo”. Il database di prova è separato dai dati personali e viene eliminato dopo la prova.
4. Se si usa l’account, abilitare esplicitamente l’archivio offline. In alternativa provare l’archivio separato senza account.
5. In Safari → Condividi → Aggiungi alla schermata Home. Se la PWA non mostra i dati di Safari, importare il JSON da File. Ripetere i test nella PWA.

| Prova | Safari verticale | Safari orizzontale | PWA Home | Esito atteso |
|---|---|---|---|---|
| iPhone con Dynamic Island/notch | Da provare | Da provare | Da provare | Titoli, pulsanti e modali fuori dalle zone occupate |
| Home indicator e barra inferiore | Da provare | Da provare | Da provare | 5 destinazioni, target almeno 44px, niente sotto l’indicatore |
| Tastiera su pesi, grammi, note e login | Da provare | Da provare | Da provare | Campo raggiungibile, nessuno zoom forzato, nav nascosta durante tastiera |
| Fotocamera | Da provare | Da provare | Da provare | Foto JPEG compressa ≤1280px e ≤500KB; nessun upload per i pasti |
| Galleria, JPEG/PNG/HEIC | Da provare | Da provare | Da provare | Formato compatibile compresso; fallback esplicito se HEIC illeggibile |
| Annullamento/negazione accesso foto | Da provare | Da provare | Da provare | Modulo manuale sempre utilizzabile |
| Foto molto grande / 48MP | Da provare | Da provare | Da provare | Richiesta immagine ridotta, nessun dato preesistente perso |
| File JSON v1/v2 | Da provare | Da provare | Da provare | Download/condivisione su File e selezione JSON da File; anteprima e conferma |
| Modalità aereo dopo precache | Da provare | Da provare | Da provare | Riapertura archivio locale, piano, serie, timer, storico, grafici e pasti funzionanti |
| Chiusura completa e riapertura offline | Da provare | Da provare | Da provare | Sessione draft, pasti/foto e tema presenti |
| Admin offline | Da provare | Da provare | Da provare | Nessuna modifica catalogo/utenti remoti; dati personali disponibili |
| Modello AI primo download | Da provare | Da provare | Da provare | Solo su richiesta; tempi reali CPU mostrati, nessuna foto inviata |
| AI dopo download in modalità aereo | Da provare | Da provare | Da provare | Pesi/runtime locali oppure chiaro fallback manuale, nessun valore auto-salvato |
| AI con WebGPU non disponibile | Da provare | Da provare | Da provare | CPU in Worker, nessuna dipendenza WebGPU |
| Interruzione, timeout e RAM limitata | Da provare | Da provare | Da provare | Worker terminato e modulo manuale funzionante |
| Rimuovi modello | Da provare | Da provare | Da provare | Soltanto modello eliminato, allenamenti e pasti conservati |
| Quota IndexedDB esaurita | Da provare | Da provare | Da provare | Messaggio leggibile e rollback senza perdita dei dati precedenti |
| Aggiornamento PWA durante una sessione | Da provare | Da provare | Da provare | Aggiornamento solo su azione esplicita, dopo salvataggio |

Annotare modello iPhone, versione iOS, Safari/PWA, tempi CPU, output del test locale e problemi. Non trasformare le righe “Da provare” in “Superato” senza prova reale.

## Riscontri eseguiti in sviluppo

- 37 test automatici di dominio, permessi, backup, migrazione e percorso locale.
- Inferenza reale MobileNet v1 0.25 su CPU Node (non Safari): output 1000 classi valido. Il tempo di Node non rappresenta quello di un iPhone.
- Build strict Angular, produzione e controllo del service worker/manifest passati; runtime AI incluso come risorsa facoltativa.

## Riferimenti primari

- [Apple: configurazione web app](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)
- [WebKit: policy di archiviazione](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [WebKit: Safari 17.2 e differenze degli archivi Home](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/)
- [TensorFlow.js: salvataggio modelli in IndexedDB](https://www.tensorflow.org/js/guide/save_load)

## Aggiornamento foto profilo e username

Da provare sul telefono: scegliere/scattare la foto, verificare anteprima senza salvataggio, confermare con Salva profilo, controllare avatar in alto e persistenza alla riapertura; rimuovere e verificare il backup v3/importazione da File. Per l’account online scegliere un username nel Profilo, uscire e accedere sia con username sia con email. Provare un duplicato con diversa capitalizzazione: deve essere rifiutato. I 40 test automatici attuali includono queste regole lato logica/API e il roundtrip del backup; non sostituiscono la prova Safari.

## Calendario e nuova interfaccia

Il calendario offre Giorno, Settimana (predefinita) e Mese. Verificare su Safari e PWA: cambio periodo, programmazione/modifica/rimozione, avvio della sessione e collegamento allo storico. La rimozione di una programmazione conserva l'allenamento registrato. Provare il nuovo flusso elenco → dettaglio → serie → recupero → riepilogo, con tastiera e uso con una mano.

Verificare inoltre le schede Peso/Forza/Corpo/Alimentazione, gli obiettivi personali, le misurazioni e il backup JSON v4 da File. La migrazione IndexedDB v3 conserva gli archivi precedenti e aggiunge calendario e misurazioni. Sono passati 44 test automatici; le prove su un iPhone reale restano da eseguire.

## Rifinitura UI su riferimento

Palette predefinita: sfondo #050E17, schede #102230, azioni #0675FF. I temi personali salvati restano disponibili. Le miniature usano la foto associata all'esercizio; se non caricabile mostrano un'icona, senza una fotografia sportiva attribuita all'esercizio sbagliato. Le immagini/video remoti richiedono connettività se non già disponibili.

La schermata esercizio mostra uno schema indicativo per zona muscolare e gli ultimi valori prima della registrazione. La sostituzione di serie già completate richiede conferma. La conferma pasti permette più alimenti con quantità e valori correggibili; i totali vengono sommati e verificati prima del salvataggio. Il dettaglio degli alimenti è facoltativo e conservato nel backup v4; i pasti precedenti restano utilizzabili.

47 test automatici verificano anche il percorso reale del componente allenamento (dettaglio, serie, pausa/ripresa, riepilogo, persistenza), la modifica di un pasto composto e il suo roundtrip JSON. Il timer usa timestamp assoluti, quindi il conteggio recupera il tempo trascorso quando i callback vengono sospesi. Il timer non prosegue dopo la chiusura completa della pagina.

Non sono stati eseguiti test visivi del browser o di un dispositivo iOS reale in questa sessione: il controllo browser previsto dall'ambiente non è disponibile. Restano da verificare fisicamente navigazione e layout a 320/375/390/430 px, tastiera, safe area, selezione foto, timer dopo blocco schermo, scorrimento del calendario sugli schermi più stretti e PWA installata. Non sono presenti pulsanti di social login o biometria applicativa; Face ID può essere usato dal gestore Password di iOS per compilare le credenziali.

## Varianti esercizi e ripristino login

Catalogo predefinito: 161 esercizi, incluse 64 nuove varianti. Panca con manubri: piana 0°, inclinata 15°/30°/45°/60°, declinata −15°/−30°, presa neutra 0°/30°/45°, alternata, unilaterale, a terra e squeeze press. Altre varianti per bilanciere, multipower e gruppi muscolari. Gli ID preesistenti restano validi e le serie storiche conservano i nomi registrati.

Migrazione IndexedDB v4: pulizia dei riferimenti YouTube preesistenti, aggiunta delle nuove varianti mancanti, conservazione di immagini locali, campi personalizzati e flag Attivo. Migrazione D1 0003: stessa pulizia dei riferimenti del catalogo condiviso, senza eliminare esercizi o dati personali. Il link video è ora facoltativo anche per esercizi attivi. I nuovi link inseriti dagli amministratori dopo l'aggiornamento vengono conservati.

Solo il foglio di stile della schermata di accesso torna alla versione con logo argentato/blu, sfondo geometrico e pulsante sfumato. Non sono aggiunte registrazione pubblica, social login o biometria applicativa. Nessuna variazione alla UI delle altre sezioni.

50 test automatici e build strict passati, incluse migrazioni del catalogo locale/condiviso e accessibilità degli esercizi attivi senza video. Il confronto visivo e il test Safari/PWA su iPhone reale restano da eseguire.

## Estensione lat machine, petto e braccia

Aggiunte 92 varianti, per 253 esercizi predefiniti totali: 23 voci di lat machine, 15 chest press, 13 croci ai cavi, 38 bicipiti e 31 tricipiti, oltre alle altre zone. Le varianti distinguono prese, attrezzatura, inclinazione e uso unilaterale; i video predefiniti restano vuoti. Le dip assistite e con zavorra usano rispettivamente le modalità di carico assisted e weighted-bodyweight.

Un componente riutilizzabile offre filtri rapidi per queste cinque famiglie nel catalogo e nel selettore dei piani. La ricerca nei piani comprende anche i tag. La migrazione IndexedDB v5 aggiunge le voci mancanti e i tag di famiglia senza sostituire nomi personalizzati, flag di visibilità, immagini, nuovi link degli admin o collegamenti delle schede. Il catalogo online riceve le stesse definizioni; non richiede una nuova migrazione D1.

52 test automatici passati, inclusi aggiornamento da archivio v4, parità del catalogo locale/server e modalità di carico. Su iPhone restano da provare lo scorrimento orizzontale dei filtri e la selezione degli esercizi nelle schede: nessun test visivo Safari è stato eseguito in questa sessione.

## Nuovo calendario: UI e uso con una mano

Riepilogo del periodo con conteggi reali e anello di avanzamento (obiettivo personale soltanto nella vista Settimana); giorni settimanali a schede scorrevoli, selezione portata in vista senza scorrimento verticale della pagina; mese con indicatori per programmazioni, sessioni e pasti. Le viste Giorno, Settimana predefinita e Mese restano disponibili. Il riepilogo mensile esclude i giorni dei mesi adiacenti mostrati nella griglia.

Agenda con filtri Tutto/Da fare/Svolti, schede colorate per stato, esercizi/serie del piano, avvio/ripresa e accesso allo storico. Menu per modificare la programmazione o duplicarla dopo 7 giorni. Barra Programma raggiungibile sopra la navigazione inferiore, safe area e layout per tastiera e orientamento orizzontale. Su iPhone il modulo è una finestra dal basso; nessuna modifica allo stile delle altre sezioni.

Nel modulo è possibile creare 1, 2, 4 o 8 appuntamenti settimanali indipendenti. Il salvataggio è atomico: se una data contiene già lo stesso allenamento, nessuna nuova data viene aggiunta. Le programmazioni esistenti, i collegamenti allo storico e il formato dei backup restano validi; non occorre una migrazione del database. Le sessioni svolte sono conteggiate nella loro data effettiva, evitando duplicati con gli eventi del calendario.

56 test automatici passati, inclusi ripetizioni, conflitti/rollback, filtri, duplicazione, collegamenti alle sessioni e confini mese/anno. Build strict e verifica PWA passate. Verifiche da eseguire su iPhone reale: menu e finestra con tastiera, ritorno del focus, selezione con una mano, date picker nativo, safe area a 320/375/390/430 px, animazioni con Riduci movimento e riapertura offline. Il browser di QA dell'ambiente non è disponibile: nessun test visivo Safari è stato eseguito in questa sessione.

## Comodità in palestra: preferiti, ripresa, configurazioni e superset

IndexedDB v6 aggiunge due tabelle personali, exercisePreferences e workoutUi, senza riscrivere allenamenti o schede esistenti. Il backup JSON v5 le conserva; i backup v1–v4 vengono migrati con tabelle inizialmente vuote. Non cambiano il catalogo condiviso o i ruoli amministrativi. Preferiti e Recenti sono disponibili nel catalogo e nella selezione degli esercizi: Recenti deriva dalle sessioni personali, incluse quelle in corso.

La ripresa conserva esercizio, serie, scheda Serie/Storico/Note, valori inseriti, tipo di serie e stato del timer. Un piccolo registro sincrono nel browser, separato per archivio/account, affianca IndexedDB per gli inserimenti recenti; se non scrivibile, viene usato subito IndexedDB. I timer usano timestamp assoluti: dopo una riapertura riprendono dal tempo effettivamente rimasto o mostrano recupero terminato. Un timer in pausa conserva i secondi rimanenti. Non sono previste notifiche o suoni quando iOS sospende l’app. Se la riapertura parte dalla Home ed esiste un punto di ripresa, l’app riapre la sessione; i collegamenti diretti ad altre sezioni sono rispettati. Alla conclusione/scarto viene eliminato il punto di ripresa; il ripristino JSON elimina il registro locale precedente.

Ogni esercizio può avere macchina/modello, sedile, schienale, maniglia/presa e note personali. La sessione conserva una copia della configurazione: modificarla dopo aver registrato serie vale per le sessioni future e non cambia lo storico. Gli ultimi valori vengono cercati nella stessa configurazione quando impostata. Grafici e record permettono di filtrare per configurazione; i carichi di macchine diverse possono non essere confrontabili. I moduli del catalogo sono creati soltanto quando vengono aperti, per contenere l’uso di memoria su iPhone.

Nella scheda si possono assegnare due esercizi allo stesso superset A/B/C/D e impostare 0–5 riscaldamenti. Durante l’allenamento l’app alterna le serie allenanti e propone recupero dopo la coppia; i gruppi con un solo esercizio mantengono recupero normale. Le serie R sono conservate ma escluse da record e volume allenante. Le serie storiche prive del campo tipo restano allenanti, quindi i risultati precedenti non cambiano. È possibile aggiungere o cambiare il tipo di serie anche nel dettaglio; la copia degli ultimi valori conserva i riscaldamenti.

Backup: la data di generazione del JSON è distinta dalla conferma dell’utente di averlo trovato in File. Il promemoria appare nell’app ogni 7/14/30 giorni, si può rimandare di 3 giorni o disattivare. Non presume il salvataggio del download e non invia notifiche push.

Profilo → Informazioni app e iPhone include una checklist persistente di 8 prove fisiche, con esito dichiarato dall’utente, note, modello e versione iOS, più rapporto JSON esportabile senza dati di allenamento o foto. I test locali isolati verificano anche il salvataggio del punto di ripresa e l’esclusione del riscaldamento dal volume. Non sono una prova di chiusura reale della PWA.

La sessione di sviluppo verifica migrazioni, isolamento degli archivi, ripresa con timer attivo/in pausa, fallback IndexedDB, statistiche, alternanza dei superset, configurazioni, promemoria e backup. La verifica reale su un iPhone resta DA ESEGUIRE: aprire la checklist sul telefono e provare blocco schermo, chiusura completa, modalità aereo, tastiera, fotocamera, File e safe area. Non sono stati eseguiti test visivi Safari in questo ambiente.

Verifica finale di questa versione: 65 test automatici superati, build Angular strict/produzione e controllo manifest/service worker superati. La prova fisica Safari/PWA sul telefono resta da completare con la checklist.

## Identità visiva interna e progressione guidata dei carichi

Ridisegnate Home, navigazione, piani, sessione, alimentazione, progressi, profilo, calendario, catalogo, storico e gestione utenti. Il nuovo foglio della shell è interamente limitato a `gt-shell`: i file della login e gli stili globali esistenti non cambiano. La Home offre avvio/ripresa in primo piano, dati personali e traccia settimanale con accesso ai giorni. Nessun punteggio di forma o di recupero è inventato. Le preferenze di sfondo restano disponibili, con contrasto adattato per i temi chiari. Le illustrazioni di zona muscolare restano indicative e le miniature senza foto conservano il fallback, senza attribuire foto di altri esercizi.

La progressione compare nel dettaglio dell’esercizio. L’incremento è scelto nell’unità personale (kg/lb); la proposta usa l’ultima seduta completata dello stesso esercizio, modalità di carico e configurazione fisica registrata. Non salta una seduta recente incompleta per cercarne una precedente migliore. Le serie di riscaldamento sono escluse. L’aumento richiede tutte le serie previste dal piano, carico omogeneo, ripetizioni al limite alto e RPE presente, massimo 8. Se nella seduta corrente ci sono serie allenanti con RPE alto o sotto il minimo previsto, l’aumento è bloccato. Una configurazione assente viene segnalata esplicitamente. Corpo libero e assistenza restano a scelta manuale.

Solo il pulsante Conferma applica la proposta, alle serie allenanti ancora da completare. La verifica viene ripetuta nella coda di salvataggio: una proposta diventata obsoleta non sovrascrive le nuove informazioni. Storico, riscaldamento, serie già completate e carico target del piano restano conservati. Non richiede AI, servizi esterni o modifiche allo schema dell’archivio.

Da provare fisicamente su Safari/PWA: composizione a 320/375/390/430 px, accesso ai giorni della traccia settimanale (scorribile su schermi stretti), temi personali chiari e scuri, navigazione e tastiera, moduli sovrapposti e barra Programma, cinque fasi della sessione, scelta incremento 1,25 kg e in lb, conferma e riapertura offline. Non sono stati eseguiti test visivi browser o su iPhone reale in questa sessione. Le prove automatiche non sostituiscono questi controlli.

Verifica automatica della versione: 77 test superati in 9 file, inclusi 12 controlli specifici della progressione e del suo pulsante di conferma. Login, schema IndexedDB e formato backup verificati invariati. Build produzione e verifica dei bundle PWA completate; test fisici Safari/PWA ancora da eseguire.
