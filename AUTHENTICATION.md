# Account GymTrack

Gli accessi ChatGPT e la policy di condivisione Sites sono preservati. Il login GymTrack aggiunge email/password e ruoli applicativi; non sostituisce l'autorizzazione Sites. Per invitare un cliente occorre autorizzarlo anche nella condivisione del sito.

Il proprietario verificato `giacomotanduo004@gmail.com` può attivare una sola volta il proprio SuperAdmin impostando la password. La verifica avviene sul server usando gli header di identità forniti da Sites. La password non è preimpostata nel codice né inviata in chat.

Solo il SuperAdmin può elencare/creare/modificare/disattivare gli account e reimpostarne la password. I ruoli creati sono Admin o User (Cliente). Il proprietario non può essere disattivato né declassato. Admin e clienti gestiscono il proprio archivio locale; non hanno accesso agli archivi di altre persone.

D1 conserva account e sessioni. Password: PBKDF2 SHA-256, 100.000 iterazioni, sale casuale di 256 bit. Cookie Secure/HttpOnly/SameSite=Strict con durata di 30 giorni, legato all'identità ChatGPT del visitatore; in D1 viene salvato soltanto l'hash del token. Controlli origin per le scritture, limite di richieste login per visitatore, revoca delle sessioni su modifica/disattivazione/cambio password. Nessuna password in localStorage o IndexedDB. Non è previsto un recupero automatico via email: il SuperAdmin può reimpostare quelle di admin e clienti.

I moduli usano autocomplete username/current-password/new-password per il Portachiavi iOS. Safari decide quando proporre il salvataggio; Face ID è gestito dal sistema. Da provare sul dispositivo reale.

Gli allenamenti rimangono in IndexedDB. Il proprietario mantiene `gymtrack-v1`, conservando l'archivio precedente. Ogni altro account usa `gymtrack-user-<id>` sul medesimo dispositivo. Serve connessione per verificare il login al caricamento; gli asset PWA restano precachati, ma non è previsto un accesso offline persistente. I backup continuano a essere necessari per i dati di allenamento.

Verifica: 27 test (dominio, persistenza, autenticazione e permessi), build Angular strict e produzione, controllo manifest/precache PWA. Test backend con SQLite reale e adattatore D1; la pubblicazione applica le migrazioni D1. Nessun controllo visuale tramite browser o iPhone disponibile in questo ambiente.

Build: `npm ci`, `npm test`, `npm run build`, `npm run verify:build`. `postbuild` confeziona il Worker e gli asset Angular in `dist/server/index.js`, metadata e migrazioni in `dist/`. Il Worker serve gli asset incorporati per mantenere il deploy ESM autosufficiente.
