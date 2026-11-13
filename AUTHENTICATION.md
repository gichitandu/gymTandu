# Account GymTrack

Stato corrente e comandi: [README.md](README.md) e
[guida operativa Codex](docs/CODEX_OPERATIVO.md). Questo documento conserva anche
note delle implementazioni precedenti: versioni di backup, conteggi dei test,
caricamento AI e limitazioni descritti nelle sezioni storiche si riferiscono a
quelle fasi, non alla configurazione attuale. Il registro delle nuove verifiche è
[CODEX_VERIFICHE.md](docs/CODEX_VERIFICHE.md).

Gli accessi ChatGPT e la policy di condivisione Sites sono preservati. Il login GymTrack aggiunge email/password e ruoli applicativi; non sostituisce l'autorizzazione Sites. Per invitare un cliente occorre autorizzarlo anche nella condivisione del sito.

Il proprietario verificato `giacomotanduo004@gmail.com` può attivare una sola volta il proprio SuperAdmin impostando la password. La verifica avviene sul server usando gli header di identità forniti da Sites. La password non è preimpostata nel codice né inviata in chat.

Solo il SuperAdmin può elencare/creare/modificare/disattivare gli account e reimpostarne la password. I ruoli creati sono Admin o User (Cliente). Il proprietario non può essere disattivato né declassato. Admin e clienti gestiscono il proprio archivio locale; non hanno accesso agli archivi di altre persone.

D1 conserva account e sessioni. Password: PBKDF2 SHA-256, 100.000 iterazioni, sale casuale di 256 bit. Cookie Secure/HttpOnly/SameSite=Strict con durata di 30 giorni, legato all'identità ChatGPT del visitatore; in D1 viene salvato soltanto l'hash del token. Controlli origin per le scritture, limite di richieste login per visitatore, revoca delle sessioni su modifica/disattivazione/cambio password. Nessuna password in localStorage o IndexedDB. Non è previsto un recupero automatico via email: il SuperAdmin può reimpostare quelle di admin e clienti.

I moduli usano autocomplete username/current-password/new-password per il Portachiavi iOS. Safari decide quando proporre il salvataggio; Face ID è gestito dal sistema. Da provare sul dispositivo reale.

Gli allenamenti rimangono in IndexedDB. Il proprietario mantiene `gymtrack-v1`, conservando l'archivio precedente. Ogni altro account usa `gymtrack-user-<id>` sul medesimo dispositivo. Il login viene verificato online; la riapertura offline dell'archivio può essere abilitata esplicitamente e non concede permessi alle API condivise. Le copie server confermate sono separate per identità e includono i dati del backup personale, comprese le foto. Safari e PWA possono avere contenitori locali distinti: restano importanti le copie esportate e la verifica della sincronizzazione.

Verifica storica della prima implementazione: 27 test (dominio, persistenza, autenticazione e permessi), build Angular strict e produzione, controllo manifest/precache PWA. Test backend con SQLite reale e adattatore D1; la pubblicazione applica le migrazioni D1. Allora non erano state eseguite prove visuali browser o iPhone; per gli esiti successivi consultare i registri QA.

Build: `npm ci`, `npm test`, `npm run build`, `npm run verify:build`. `postbuild` confeziona il Worker e gli asset Angular in `dist/server/index.js`, metadata e migrazioni in `dist/`. Il Worker serve gli asset incorporati per mantenere il deploy ESM autosufficiente.

## Catalogo condiviso e tema personale

Il catalogo viene letto da tutti gli account autenticati e può essere modificato solo da Admin e SuperAdmin: gli endpoint verificano il ruolo corrente sul server. Il catalogo di base include 97 esercizi in 8 zone muscolari con riferimenti video YouTube dal progetto MIT Open-Source Workout Database (attribuzione e licenza incluse negli asset). I video sono contenuti di terzi: non sono scaricati né copiati; il player dispone del link al video originale.

`catalog_exercises` conserva modifiche e nuovi esercizi; `catalog_groups` conserva gruppi aggiuntivi e rinominati. Le scelte di base vengono unite alle modifiche, senza sovrascrivere quelle già salvate. Un esercizio nuovo parte senza spunta Attivo: per attivarlo serve un video HTTPS. I clienti ricevono soltanto esercizi attivi dall'API. Le nuove assegnazioni ai piani ricontrollano il catalogo prima di salvare. I riferimenti precedenti restano negli archivi personali/storici; eventuali vecchi esercizi solo locali non diventano automaticamente pubblici o selezionabili.

`user_preferences` salva il colore dello sfondo per ID account. Default `#050b12`, selettore libero/HEX e ripristino. I colori chiari adattano il contrasto del testo. Nessuna preferenza viene applicata agli altri account. Grafica aggiornata con copertina originale generata per GymTrack, schede blu/nero, categorie scorrevoli e player video apribile anche in allenamento.

Verifica di questa modifica: 30 test (inclusi diniego scritture catalogo ai clienti, scritture admin, stato inattivo, riattivazione, libreria predefinita e isolamento del tema), build strict e controllo PWA. Browser e iPhone reale non disponibili per la verifica visiva; player di terzi e comportamento di Safari richiedono prova sul dispositivo.

## iPhone, funzionamento locale e alimentazione (21 ottobre 2026)

Le funzioni personali non richiedono un account o un backend: nella schermata iniziale è disponibile “Usa GymTrack senza account”, con archivio Dexie separato `gymtrack-user-device-local`. Il catalogo di base è incluso nella build. Il sito pubblicato mantiene la policy privata attuale per il primo accesso; la build statica `dist/gymtrack/browser` è autonoma e può essere servita su qualsiasi hosting statico HTTPS. Il caricamento iniziale/installatione PWA richiede una connessione. Dopo il precache dell’app le funzioni personali sono locali. Non cambiano condivisione né policy di accesso del sito.

Gli account e il catalogo condiviso restano opzioni online. Un utente può abilitare espressamente la riapertura offline del proprio archivio da login o Profilo. Il descrittore locale non contiene password o token; l’accesso locale usa sempre il ruolo User e non autorizza API condivise. Chi usa questo iPhone può accedere a un archivio abilitato per offline: l’interfaccia lo esplicita prima dell’abilitazione. La modalità senza account non accede al vecchio archivio del proprietario. Il logout rimuove il descrittore locale. La copia catalogo salvata consente nuove schede offline; le modifiche condivise e i video esterni richiedono internet.

Dexie versione 2 aggiunge `meals` mantenendo tutte le tabelle precedenti. Backup JSON v2: aggiunta di pasti e foto; i backup v1 vengono migrati con pasti inizialmente vuoti. Il tema è salvato anche in un archivio preferenze Dexie per account e incluso nel backup personale. È disponibile il download JSON e, ove Web Share files sia supportato, una seconda azione esplicita “Condividi JSON → Salva su File”. Safari e la PWA possono avere archivi separati: esportare prima del passaggio e importare dal File se necessario. Non si presume trasferimento automatico di IndexedDB.

Fotocamera e galleria: input distinti, `accept=image/*`, capture environment per fotocamera. Le immagini vengono decodificate sul dispositivo e ridisegnate su canvas, JPEG senza metadati originali, lato massimo 1280px e massimo 500KB prima di essere scritte in IndexedDB o inviate al catalogo condiviso. JPEG/PNG vengono controllati quando possibile prima della decodifica; oltre 25 megapixel, file oltre 20MB o formati non decodificabili richiedono immagine ridotta/JPEG o inserimento senza foto. Archivio foto pasti limitato a 15MB; backup con immagini oltre 25MB rifiutato prima della conversione, per limitare picchi di memoria. IndexedDB mantiene le transazioni atomiche e segnala quota esaurita.

AI facoltativa: TensorFlow.js 4.22.0 vendorizzato, MobileNet v1 0.25 (modello ImageNet generico, non food-specific), pesi scaricati solo dopo richiesta esplicita dal bucket pubblico Google e salvati tramite TensorFlow in IndexedDB. Runtime JavaScript conservato dal service worker su richiesta. Inferenza CPU in Web Worker, nessuna dipendenza da WebGPU, nessuna foto inviata alla rete, timeout 45s/interruzione esplicita/terminazione Worker. Rimozione del modello separata dai dati personali. Sui dispositivi che dichiarano <2GB di memoria, o con spazio noto insufficiente, percorso manuale. Su iOS dove la quantità di RAM non è esposta, nessuna quantità viene inventata: si usano riduzione input, modello piccolo, worker e timeout. Sono misurati durata inferenza, caricamento e byte dei tensori (che non equivalgono alla RAM totale). I suggerimenti non determinano peso/calorie; l’utente sceglie alimento, quantità e valori modificabili, o usa la propria etichetta. Ricette composte/condimenti non sono deducibili con affidabilità da una singola foto. Nessun servizio AI a pagamento, telemetria o abbonamento introdotto.

Verifiche automatiche: 37 test su migrazione Dexie v1→v2 con conservazione piani/storico, backup v1→v2, foto nei backup, calcolo porzioni, rifiuto input immagini grandi, diniego API in accesso offline e registrazione piano/allenamento/pasto senza chiamate al server; oltre ai test precedenti di dominio, sessione e permessi. Modello reale caricato e inferenza CPU verificata su Node: output di 1000 classi, ~1.9MB di tensori (dati specifici dell’ambiente di sviluppo, non benchmark iOS).

Safari iOS / PWA reale: NON ESEGUITO qui (nessun browser iPhone o controllo browser previsto disponibile). L’app include in Profilo “iPhone · Stato dell’app” un test sul dispositivo in database temporaneo isolato: JPEG, Dexie riaperto, backup roundtrip, stato standalone; mantiene esplicitamente “DA PROVARE” i test reali di rete, tastiera, fotocamera e AI. La matrice manuale è in IPHONE_QA.md. Non presentare questi test come eseguiti su un telefono reale fino a raccolta dei risultati.

## Nome utente univoco e foto profilo (21 ottobre 2026)

Il login accetta email o nome utente nello stesso campo con autocomplete username. Il nome utente è distinto dal nome visualizzato: 3–30 caratteri ASCII, primo carattere alfanumerico, poi lettere/numeri/punto/trattino/underscore; viene normalizzato in minuscolo e controllato sul server. Un indice UNIQUE di D1 garantisce l’unicità anche in concorrenza. Gli account preesistenti restano con username nullo fino alla scelta personale, conservando login email e password. I nuovi account creati dal SuperAdmin richiedono username; il proprietario può scegliere il proprio dal Profilo → Account e sicurezza. Ogni utente può modificare solo il proprio username attraverso l’endpoint dedicato; le modifiche degli altri account restano riservate al SuperAdmin.

Foto profilo personale: galleria/fotocamera, compressione JPEG locale con gli stessi limiti 1280px/500KB, anteprima e rimozione da confermare con Salva profilo. La foto viene conservata nel profilo Dexie dello specifico archivio, mostrata nel profilo e nell’avatar dell’intestazione. Gli object URL sono revocati quando l’immagine cambia o il componente viene distrutto. Non viene caricata sul server. Backup v3 aggiunge la foto del profilo; importazione v1/v2 mantenuta attraverso migrazioni compatibili.

Verifica: 40 test superati, inclusi login via username/email, normalizzazione, duplicati da API e vincolo DB, cambi username e conservazione della foto nei backup. La prova visiva/fotocamera su iPhone reale resta parte della matrice IPHONE_QA.md.

## Schermata di ingresso e identità visiva

Schermata di accesso ridisegnata dal riferimento fornito: emblema GT cromato/blu ricostruito dalla foto, wordmark GymTrack, sfondo nero con dettagli blu elettrico, campi iconici e pulsante sfumato. Presentazione introduttiva accessibile dal pulsante indietro, con aree Allenamento/Nutrizione/Risultati. Accesso Account con username o email e spazio locale in due sezioni; attivazione SuperAdmin mantiene il flusso esistente. Il controllo “Ricordami su questo iPhone” abilita lo stesso accesso locale esplicito già previsto e ne espone la conseguenza prima del login. Il recupero password mostra il percorso di supporto attualmente disponibile. Logo nell’intestazione/sidebar, favicon e icone PWA; asset precaricato per offline. La prova visiva su Safari reale resta da eseguire, con build production e 40 test automatici passati.

## Allenamento in gruppo e registrazione su invito (13 novembre 2026)

Da Schede → «Allenamento in gruppo» (`/gruppo`) un account crea un gruppo a partire
dalla propria seduta aperta e riceve un codice di 6 cifre, un QR e un link di invito
(`/#/gruppo?invito=…`). Il gruppo dura al massimo 8 ore o finché chi lo ha creato lo
chiude. Il server (`worker/group.js`, tabelle `group_sessions` e `group_members`)
conserva solo esercizi e avanzamento della seduta in corso: le serie restano
nell'archivio personale di ognuno.

- Chi ha già un account entra con il codice; i tentativi sono limitati per account.
- Chi non ha un account può crearlo solo dal link di invito di un gruppo ancora
  aperto (`POST /api/auth/register`): ruolo sempre Cliente, al massimo 5 nuovi
  account per invito, tentativi limitati. Senza invito valido la registrazione
  resta riservata al Super Admin.
- Chi entra sceglie tra «stessi esercizi» (seduta copiata da chi invita, carichi dal
  proprio storico) e «il mio allenamento» (gli esercizi in comune vengono allineati
  nell'ordine alla seduta di chi invita).

Prima del deploy va applicata la migrazione D1 `drizzle/0013_group_workouts.sql`.
