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

## Pubblicazione da GitHub (senza Terminale, anche da telefono)

Il flusso `.github/workflows/cloudflare-deploy.yml` fa tutto sui server di GitHub:
verifiche, creazione di database e bucket, migrazioni, pubblicazione e codice di
setup. Servono solo tre segreti nel repository (Settings, Secrets and variables,
Actions, New repository secret):

- `CLOUDFLARE_ACCOUNT_ID`: l'ID dell'account, visibile nella panoramica del
  pannello Cloudflare.
- `CLOUDFLARE_API_TOKEN`: una chiave creata da Cloudflare (Profilo, API Tokens,
  Create Token) con permessi di modifica su Workers Scripts, D1 e R2.
- `SETUP_CODE`: il codice di setup che hai scelto (almeno 16 caratteri).

Prima attiva R2 dal pannello Cloudflare. Poi, in GitHub, apri la scheda Actions,
scegli "Pubblica su Cloudflare" e premi "Run workflow". Gli stessi passi si
ripetono per ogni aggiornamento.

## Avvisi sullo spazio R2 (email a 8, 9 e 9,5 GB)

Il Worker controlla ogni giorno (alle 06:00 UTC, cioè le 07:00 o 08:00 in Italia)
lo spazio occupato nel bucket R2 e invia una mail a giacomotanduo004@gmail.com
quando supera 8, 9 e 9,5 GB. Il piano gratuito include 10 GB. Gli avvisi usano GB
decimali (1 GB = 1.000.000.000 byte), quindi sono leggermente prudenti. Ogni
soglia avvisa una sola volta; se lo spazio scende e poi risale, riavvisa.

Cloudflare non permette di spedire email da un Worker senza un dominio tuo, quindi
l'invio passa da Resend (gratuito):

1. Registrati su resend.com **con lo stesso indirizzo email degli avvisi**
   (giacomotanduo004@gmail.com): senza un dominio verificato, Resend consegna solo
   a quell'indirizzo.
2. In Resend crea una chiave (API Keys, Create API Key, permesso "Sending access")
   e copiala.
3. Su GitHub crea il segreto `RESEND_API_KEY` con quella chiave.
4. Rilancia "Pubblica su Cloudflare": il flusso imposta la chiave sul Worker.

Senza la chiave il controllo gira ma non invia nulla (solo una riga nel registro
del Worker). L'indirizzo si può cambiare con la variabile `ALERT_EMAIL`.

## Lettura delle foto dei pasti con Workers AI (gratuita, con blocco automatico)

In **Pasti**, con l'account online, la foto del piatto o di un'etichetta viene letta da
Workers AI di Cloudflare (modello `@cf/google/gemma-4-26b-a4b-it`, disponibile anche sul
piano Workers Free): l'app propone alimenti, grammi e valori, da controllare prima di
salvare. Per l'analisi viene inviata una copia ridotta della foto; il modello è indicato da
Cloudflare come "zero data retention".

Workers AI include **10.000 Neuron al giorno**, con ripristino alle **00:00 UTC** (le 01:00
o le 02:00 in Italia). Per non superarli mai:

- prima di ogni lettura il Worker prenota in D1 (tabella `ai_usage`, migrazione `0013`) il
  costo massimo della richiesta, con una sola istruzione SQL atomica. Se il totale
  supererebbe il **95%** dell'allocazione (9.500 Neuron) il modello non viene chiamato e
  l'app mostra **«Attendere ripristino»** con l'orario;
- dopo la risposta la prenotazione viene sostituita dal consumo reale (token dichiarati dal
  modello, maggiorati del 20% per prudenza). Se il consumo non è dichiarato o la richiesta
  fallisce in modo incerto, resta contata l'intera prenotazione;
- se Cloudflare risponde che l'allocazione è esaurita (errore 3036), il giorno viene
  bloccato comunque fino al ripristino;
- se il database non risponde o la migrazione non è applicata, la lettura con AI resta
  spenta: senza una prenotazione riuscita non parte alcuna richiesta;
- quando riceve il blocco, l'app lo ricorda sul dispositivo e fino all'orario di ripristino
  non invia più nulla, nemmeno la richiesta dello stato. Resta il riconoscimento sul
  dispositivo, che non usa Cloudflare, e l'inserimento a mano.

Il binding è già in `wrangler.jsonc` (`"ai": { "binding": "AI" }`): basta pubblicare e
applicare le migrazioni D1. Per disattivare la funzione togli quel blocco e ripubblica.

Variabili facoltative, che possono solo **restringere** il limite:
`AI_DAILY_NEURON_LIMIT` (meno di 10.000) e `AI_RESERVE_PERCENT` (più di 5).

Cose da sapere:

- Il contatore vede solo le letture fatte da GymTrack. Se nello stesso account Cloudflare
  altri Worker usano Workers AI, i loro consumi si sommano senza essere contati qui: in quel
  caso abbassa `AI_DAILY_NEURON_LIMIT`.
- La garanzia più forte resta il piano: con **Workers Free** Cloudflare rifiuta le richieste
  oltre l'allocazione e non addebita nulla. Con Workers Paid i Neuron in più si pagano: il
  blocco al 95% serve proprio a non arrivarci.
- Anche `wrangler dev` usa il vero Workers AI e consuma l'allocazione dell'account.
- I Super Admin e gli Admin vedono consumo, soglia e orario di ripristino in Pasti, nel
  riquadro "Lettura foto con AI".

## GT Garage: dati automatici della Golf (facoltativo, gratuito)

Il Worker legge ogni 30 minuti (cron `*/30 * * * *`) il pacchetto di dati più recente dal
portale ufficiale Volkswagen EU Data Act (`worker/vw.js`): livello carburante, autonomia,
chilometri, consumo medio, tagliando e cambio olio. Senza i segreti qui sotto non fa nulla.

1. Sul portale `https://eu-data-act.drivesomethinggreater.com/` accedi con il Volkswagen ID
   (l'auto deve risultare tua come utente principale) e in *Data clusters → Vehicle overview*
   crea una richiesta continua ogni 15 minuti con *All Data*.
2. Su GitHub crea i segreti `VW_ID_EMAIL` e `VW_ID_PASSWORD`.
3. Avvia di nuovo **Pubblica su Cloudflare**: il workflow li copia come segreti del Worker.

Dettagli: la sessione del portale è conservata in R2 (`garage/vw-session.json`) per non rifare
l'accesso a ogni controllo; con credenziali rifiutate il collegamento si ferma per 6 ore; lo
stato (senza cookie né telaio completo) è in `GET /api/hub/vw`, solo per il Super Admin, e
`POST /api/hub/vw/sync` chiede un controllo subito (al massimo uno ogni 3 minuti). I dati
non sono in tempo reale: arrivano quando l'auto li trasmette.

## Aggiornamenti

Dopo ogni modifica al codice: `npm run build`, poi `npx wrangler deploy`. Le
migrazioni nuove si applicano con il comando del passo 6. Dalle impostazioni, il
Super Admin può usare "Distribuisci ultima versione" perché i dispositivi si
aggiornino.

## Backup e sicurezza

- I dati degli utenti stanno in D1 (account) e R2 (copie complete). Esegui ogni
  tanto un'esportazione: `npx wrangler d1 export gymtrack-accounts --remote --output backup.sql`.
- Conserva il codice di setup anche dopo l'attivazione: serve per reimpostare la
  password del proprietario se viene dimenticata (schermata di accesso →
  "Password dimenticata?" → "Sei il proprietario? Reimposta la password"). Il
  reset chiude le sessioni aperte e non tocca i dati. Se hai perso anche il
  codice, impostane uno nuovo con `npx wrangler secret put SETUP_CODE`.
- I log del Worker (errori dei controlli programmati compresi) sono attivi
  (`observability` in `wrangler.jsonc`) e si leggono nella dashboard Cloudflare.
- `public/_headers` applica ai file statici la Content-Security-Policy e gli altri
  header di sicurezza. Se dopo un aggiornamento di Angular `npm run verify:build`
  segnala un hash diverso per lo script in linea, copialo in quel file.
- Per modificare un utente, resettare una password o disattivarlo usa la gestione
  utenti dell'app (solo Super Admin).

## Cosa non è incluso

- Il Worker del calendario con le notifiche push (`calendar-relay/`) è separato e
  facoltativo; in questa guida non è configurato.
- La verifica visiva su iPhone reale va rifatta con l'indirizzo Cloudflare
  (vedi `IPHONE_QA.md`).
