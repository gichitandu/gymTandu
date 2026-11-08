# Pubblicare GymTrack su Cloudflare (modalità autonoma)

Questa guida pubblica GymTrack su un account Cloudflare tuo, senza dipendere
dall'hosting Sites di ChatGPT. Gli utenti accedono solo con gli account creati
nell'app (nome utente o email e password) e i loro dati si sincronizzano tra i
dispositivi tramite il backup sul server. Il piano gratuito di Cloudflare basta
per una ventina di utenti.

## Come funziona la modalità autonoma

- La variabile `SELF_HOSTED=1` (già in `wrangler.jsonc`) fa ignorare al Worker gli
  header `oai-*` della piattaforma Sites, anche se un client li invia.
- L'account proprietario (Super Admin) si attiva una sola volta con il segreto
  `SETUP_CODE`: senza il codice nessuno può reclamarlo. Sono ammessi al massimo
  10 tentativi ogni 15 minuti per indirizzo.
- Gli altri utenti li crei tu dall'app (Profilo, Gestione utenti) con ruolo Cliente
  o Admin. Non esiste registrazione libera.
- I file statici dell'app (circa 49 MB) sono serviti da Workers Static Assets, non
  dal bundle del Worker, che altrimenti supererebbe i limiti di Cloudflare.
- Lo spazio "senza account" non ha copia sul server in questa modalità: chi vuole
  la sincronizzazione deve usare un account.

## Prerequisiti

- Un account Cloudflare (gratuito) e Node.js 24 LTS.
- R2 va abilitato nel pannello Cloudflare (Storage e database, R2): può chiedere
  un metodo di pagamento anche usando il piano gratuito.

## Passi (dalla cartella del repository)

1. Installa le dipendenze e crea la build:

   ```bash
   npm ci
   npm run build
   ```

   La build crea `dist/cloudflare/index.js` (Worker) e `dist/gymtrack/browser`
   (file statici).

2. Accedi a Cloudflare:

   ```bash
   npx wrangler login
   ```

3. Crea il database e copia l'`database_id` mostrato in `wrangler.jsonc`, al posto
   di `REPLACE_WITH_D1_DATABASE_ID`:

   ```bash
   npx wrangler d1 create gymtrack-accounts
   ```

4. Crea il bucket per le copie dei dati:

   ```bash
   npx wrangler r2 bucket create gymtrack-archives
   ```

5. Scegli il codice di setup (almeno 16 caratteri, casuale) e salvalo come segreto.
   Non scriverlo nel repository:

   ```bash
   npx wrangler secret put SETUP_CODE
   ```

   Se il comando dice che il Worker non esiste ancora, esegui prima il passo 7 e
   ripeti questo.

6. Applica le migrazioni del database:

   ```bash
   npx wrangler d1 migrations apply gymtrack-accounts --remote
   ```

7. Pubblica:

   ```bash
   npx wrangler deploy
   ```

   Il comando stampa l'indirizzo `https://gymtrack.<tuo-sottodominio>.workers.dev`.
   Un dominio tuo si può collegare dal pannello Cloudflare.

## Primo accesso

1. Apri l'indirizzo, nella schermata di attivazione inserisci il codice di setup,
   scegli nome utente e password del Super Admin.
2. Dal Profilo apri "Gestione utenti" e crea gli account degli altri utenti (fino a 20) e consegna a
   ciascuno nome utente e password. Possono poi cambiare la password dal Profilo.
3. Su iPhone: apri l'indirizzo in Safari e aggiungi l'app alla schermata Home.

## Aggiornamenti

Dopo ogni modifica al codice: `npm run build`, poi `npx wrangler deploy`. Le
migrazioni nuove si applicano con il comando del passo 6. Dalle impostazioni, il
Super Admin può usare "Distribuisci ultima versione" perché i dispositivi si
aggiornino.

## Backup e sicurezza

- I dati degli utenti stanno in D1 (account) e R2 (copie complete). Esegui ogni
  tanto un'esportazione: `npx wrangler d1 export gymtrack-accounts --remote --output backup.sql`.
- Non perdere il codice di setup finché l'account proprietario non è attivato;
  dopo l'attivazione non serve più, ma tienilo al sicuro.
- Per modificare un utente, resettare una password o disattivarlo usa la gestione
  utenti dell'app (solo Super Admin).

## Cosa non è incluso

- Il Worker del calendario con le notifiche push (`calendar-relay/`) è separato e
  facoltativo; in questa guida non è configurato.
- La verifica visiva su iPhone reale va rifatta con l'indirizzo Cloudflare
  (vedi `IPHONE_QA.md`).
