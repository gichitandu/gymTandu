# Account GymTrack

Gli accessi ChatGPT e la policy di condivisione Sites sono preservati. Il login GymTrack aggiunge email/password e ruoli applicativi; non sostituisce l'autorizzazione Sites. Per invitare un cliente occorre autorizzarlo anche nella condivisione del sito.

Il proprietario verificato `giacomotanduo004@gmail.com` può attivare una sola volta il proprio SuperAdmin impostando la password. La verifica avviene sul server usando gli header di identità forniti da Sites. La password non è preimpostata nel codice né inviata in chat.

Solo il SuperAdmin può elencare/creare/modificare/disattivare gli account e reimpostarne la password. I ruoli creati sono Admin o User (Cliente). Il proprietario non può essere disattivato né declassato. Admin e clienti gestiscono il proprio archivio locale; non hanno accesso agli archivi di altre persone.

D1 conserva account e sessioni. Password: PBKDF2 SHA-256, 100.000 iterazioni, sale casuale di 256 bit. Cookie Secure/HttpOnly/SameSite=Strict con durata di 30 giorni, legato all'identità ChatGPT del visitatore; in D1 viene salvato soltanto l'hash del token. Controlli origin per le scritture, limite di richieste login per visitatore, revoca delle sessioni su modifica/disattivazione/cambio password. Nessuna password in localStorage o IndexedDB. Non è previsto un recupero automatico via email: il SuperAdmin può reimpostare quelle di admin e clienti.

I moduli usano autocomplete username/current-password/new-password per il Portachiavi iOS. Safari decide quando proporre il salvataggio; Face ID è gestito dal sistema. Da provare sul dispositivo reale.

Gli allenamenti rimangono in IndexedDB. Il proprietario mantiene `gymtrack-v1`, conservando l'archivio precedente. Ogni altro account usa `gymtrack-user-<id>` sul medesimo dispositivo. Serve connessione per verificare il login al caricamento; gli asset PWA restano precachati, ma non è previsto un accesso offline persistente. I backup continuano a essere necessari per i dati di allenamento.

Verifica: 27 test (dominio, persistenza, autenticazione e permessi), build Angular strict e produzione, controllo manifest/precache PWA. Test backend con SQLite reale e adattatore D1; la pubblicazione applica le migrazioni D1. Nessun controllo visuale tramite browser o iPhone disponibile in questo ambiente.

Build: `npm ci`, `npm test`, `npm run build`, `npm run verify:build`. `postbuild` confeziona il Worker e gli asset Angular in `dist/server/index.js`, metadata e migrazioni in `dist/`. Il Worker serve gli asset incorporati per mantenere il deploy ESM autosufficiente.

## Catalogo condiviso e tema personale

Il catalogo viene letto da tutti gli account autenticati e può essere modificato solo da Admin e SuperAdmin: gli endpoint verificano il ruolo corrente sul server. Il catalogo di base include 97 esercizi in 8 zone muscolari con riferimenti video YouTube dal progetto MIT Open-Source Workout Database (attribuzione e licenza incluse negli asset). I video sono contenuti di terzi: non sono scaricati né copiati; il player dispone del link al video originale.

`catalog_exercises` conserva modifiche e nuovi esercizi; `catalog_groups` conserva gruppi aggiuntivi e rinominati. Le scelte di base vengono unite alle modifiche, senza sovrascrivere quelle già salvate. Un esercizio nuovo parte senza spunta Attivo: per attivarlo serve un video HTTPS. I clienti ricevono soltanto esercizi attivi dall'API. Le nuove assegnazioni ai piani ricontrollano il catalogo prima di salvare. I riferimenti precedenti restano negli archivi personali/storici; eventuali vecchi esercizi solo locali non diventano automaticamente pubblici o selezionabili.

`user_preferences` salva il colore dello sfondo per ID account. Default `#050b12`, selettore libero/HEX e ripristino. I colori chiari adattano il contrasto del testo. Nessuna preferenza viene applicata agli altri account. Grafica aggiornata con copertina originale generata per GymTrack, schede blu/nero, categorie scorrevoli e player video apribile anche in allenamento.

Verifica di questa modifica: 30 test (inclusi diniego scritture catalogo ai clienti, scritture admin, stato inattivo, riattivazione, libreria predefinita e isolamento del tema), build strict e controllo PWA. Browser e iPhone reale non disponibili per la verifica visiva; player di terzi e comportamento di Safari richiedono prova sul dispositivo.
