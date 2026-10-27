# Attivare il calendario iPhone di GymTrack

L'integrazione nell'app e il servizio sono pronti nel codice. Il calendario NON è attivo finché questo servizio non è pubblicato e le due variabili server non sono configurate. Non occorre l'abbonamento Apple Developer. Questa procedura usa Cloudflare Workers Free e D1 Free; non attivare il piano Paid. I limiti gratuiti si applicano: https://developers.cloudflare.com/workers/platform/pricing/ .

## Avvio guidato Windows

1. Installa Node.js LTS 22 o successivo da https://nodejs.org .
2. Estrai TUTTO lo ZIP, poi apri la cartella `calendar-relay`.
3. Fai doppio clic su `AVVIA-WINDOWS.cmd`. Non servono privilegi di amministratore e non va cambiata la policy PowerShell.
4. Autorizza Cloudflare nel browser quando richiesto. Se hai più account, seleziona quello destinato a GymTrack.
5. La procedura crea o riusa il database `gymtrack-calendar`, prepara lo schema senza cancellare record e pubblica il Worker. Se Cloudflare chiede di scegliere un sottodominio `workers.dev`, segui il prompt; non occorre acquistare domini o piani.
6. Quando richiesto, copia l'URL HTTPS `workers.dev` mostrato da Wrangler e incollalo nella finestra della procedura.
7. Alla prima configurazione viene generata una chiave tecnica casuale: viene copiata negli appunti Windows, MA NON stampata o salvata nei file. Conservala nel tuo gestore password, poi premi Invio. La chiave viene caricata come segreto su Cloudflare e gli appunti vengono svuotati. Non inviarla in chat.
8. Segui la sezione “Collegare GymTrack” sotto: la sola pubblicazione Cloudflare NON attiva ancora la sincronizzazione nell’app. Comunica solo l’URL pubblico del Worker; la chiave va inserita nel campo protetto dell’app.

Se riesegui la procedura e trova già `CALENDAR_RELAY_SECRET`, la mantiene e non può leggerla né ricopiarla negli appunti. Usa la copia conservata nel tuo gestore password. La cartella `.installer` contiene gli strumenti npm scaricati sul tuo PC; l'autorizzazione Cloudflare resta gestita da Wrangler sul tuo PC. Nessun dato di allenamento viene letto durante questa configurazione.

Verifica tecnica eseguita con comandi Cloudflare simulati; l'avvio su Windows e la pubblicazione sul tuo account richiedono ancora la tua esecuzione. Il programma non attiva piani Paid. Restano applicabili i limiti gratuiti del provider.

## 1. Account e pubblicazione (sul proprio computer)

1. Crea l'account gratuito su https://dash.cloudflare.com/sign-up .
2. Installa Node.js LTS se manca. Apri il terminale nella cartella `calendar-relay` del pacchetto.
3. Esegui `npx wrangler@4 login` e autorizza il TUO account nel browser. Non inviare password o token nella chat.
4. Esegui `npx wrangler@4 d1 create gymtrack-calendar`.
5. Copia il `database_id` restituito al posto di `REPLACE_WITH_CREATED_DATABASE_ID` in `wrangler.jsonc`. Mantieni il binding `DB`.
6. Esegui `npx wrangler@4 d1 execute gymtrack-calendar --remote --file=schema.sql`.
7. Genera una chiave casuale di 64 caratteri esadecimali (0–9, a–f); la procedura Windows lo fa automaticamente. Questa è una chiave tecnica condivisa solo tra i due server, diversa dalla password del tuo account.
8. Esegui `npx wrangler@4 secret put CALENDAR_RELAY_SECRET` e incolla la chiave nel prompt nascosto. Conservala nel gestore password, non nei sorgenti.
9. Esegui `npx wrangler@4 deploy`. Conserva l'URL HTTPS `https://gymtrack-calendar.<tuo-sottodominio>.workers.dev` restituito.

## 2. Collegare GymTrack

L'indirizzo del Worker viene configurato dal gestore dell'hosting come `CALENDAR_RELAY_URL`. Comunica in chat SOLO l'URL pubblico del tuo Worker, senza la chiave.

Dopo la pubblicazione dell'aggiornamento di GymTrack:

1. Accedi come Super Admin, con “Visualizza come cliente” disattivato.
2. Apri Profilo → Impostazioni → Calendario iPhone.
3. Nel campo “Chiave del servizio calendario” incolla la chiave salvata nel tuo gestore password durante la procedura Windows.
4. Premi “Verifica e attiva servizio”. GymTrack controlla l'accesso al Worker prima di conservarla sul proprio server. Il campo viene svuotato e la chiave non viene restituita nelle risposte o inclusa nei backup personali.
5. Premi “Collega il mio calendario” per creare il tuo abbonamento personale.

Se è già configurato il segreto server `CALENDAR_RELAY_SECRET` tramite l'hosting, quello ha precedenza e il campo di attivazione non compare. La configurazione esistente non viene sovrascritta. Il sito principale resta privato: non cambiare il suo pubblico. Non inviare mai la chiave in chat.

## 3. Abbonamento su iPhone (ogni utente)

1. Aggiorna GymTrack da Profilo → Impostazioni → Aggiornamenti dell'app.
2. Accedi online al tuo account. Apri Calendario → Calendario iPhone, oppure Profilo → Impostazioni → Calendario iPhone.
3. Premi “Collega il mio calendario”: prima vengono salvati i dati online, poi viene creato il link personale.
4. Premi “Apri in Calendario iPhone” e conferma l'abbonamento. Se il passaggio dalla PWA non funziona, usa “Copia link” e aggiungilo nelle impostazioni dell'app Calendario come calendario in abbonamento. I percorsi delle impostazioni dipendono dalla versione iOS.

Gli eventi sono giornalieri perché GymTrack attualmente pianifica per data, senza orario. Sono esclusi note, peso, serie, pasti, profilo e gli eventi collegati ad allenamenti già completati. Se cambi la data o rimuovi una programmazione, il calendario si aggiorna al successivo salvataggio online e al successivo aggiornamento di iOS; non è immediato. La modifica da iOS è disabilitata.

“Disattiva collegamento” revoca subito il link sul server e rimuove i dati del feed. iOS potrebbe conservare una copia già scaricata: per toglierla dal dispositivo elimina anche il calendario in abbonamento. Ricollegandolo viene creato un nuovo link. Non condividere il link: chi lo possiede può leggere quel calendario.

## Verifica prima dell'uso reale

Usa due account di prova e programmazioni sintetiche. Controlla sottoscrizione su iPhone reale, spostamento data, eliminazione programma, completamento allenamento, isolamento dei due link, revoca e nuovo collegamento. Non è stata eseguita una prova reale iPhone durante lo sviluppo. I test automatici usano un database SQLite separato, mai i dati di Tandu.

Se il servizio esterno è irraggiungibile, il salvataggio dell'archivio GymTrack rimane riuscito; viene ritentato l'aggiornamento al prossimo salvataggio online. “Aggiorna collegamento” permette un tentativo manuale e mantiene lo stesso link. “Ultima pubblicazione” indica lo stato inviato al servizio, non l'ultimo aggiornamento effettuato dall'iPhone.

Il Worker esterno non ha un elenco pubblico e non accetta scritture anonime. Gli accessi ai feed richiedono un token casuale di 256 bit; la gestione richiede il segreto server. La configurazione disabilita i log automatici per evitare di registrare i link personali. Se abiliti altri strumenti di logging, oscura sempre i percorsi `/calendar/…`.

## Promemoria push alle 08:30

Il calendario in abbonamento e il promemoria push sono funzioni indipendenti. Per il promemoria occorre aggiornare il Worker esterno con `AGGIORNA-PUSH.cmd` e i file elencati in `ISTRUZIONI-PUSH.txt`, mantenendo la configurazione e la chiave calendario originali. La chiave VAPID viene generata e salvata automaticamente su Cloudflare, senza copie in chat o nel browser. Il Cron Trigger controlla le scadenze ogni minuto.

Ogni utente, di qualsiasi ruolo, deve poi consentire le notifiche sul proprio dispositivo. Orario iniziale 08:30, fuso Europe/Rome, solo giorni con allenamenti programmati; può scegliere un altro orario, fuso o gli avvisi ogni giorno. Su iPhone usare l'app installata nella Home, con iOS 16.4 o successivo. Il logout disattiva gli avvisi sul dispositivo; la semplice chiusura dell'app li mantiene attivi. Il badge usa la Badging API, se consentita.

I messaggi sono Web Push senza contenuto personale: il service worker compone localmente un messaggio generico. Il server memorizza solo le date e gli indirizzi tecnici di iscrizione necessari, in tabelle separate dal calendario; nessuna modifica a profili o allenamenti. TTL 15 minuti, topic stabile per dispositivo/giorno, controllo dei doppioni tramite lease e ultima data inviata; errori temporanei vengono ritentati al massimo due volte, iscrizioni scadute 404/410 rimosse. I risultati HTTP 2xx indicano accettazione del provider, non conferma di visualizzazione su iPhone. Nei cambi d'ora un orario inesistente viene spostato in avanti; gli avvisi già inviati non vengono ripetuti nello stesso giorno.

La consegna con app chiusa non è verificabile senza consenso su un dispositivo reale: usare “Invia prova” dopo l'aggiornamento. Rete, Full immersion, impostazioni Notifiche e limiti Cloudflare Free possono ritardare o impedire la visualizzazione. Il codice non abilita piani a pagamento.
