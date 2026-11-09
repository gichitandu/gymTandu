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

## Analisi foto dei pasti (Workers AI, a costo zero)

Il Worker ha il collegamento `AI` (in `wrangler.jsonc`) e l'endpoint
`/api/ai/meal-scan`, che stima alimenti e valori di una foto con Gemma 3 12B
(`@cf/google/gemma-3-12b-it`). Non serve nessuna chiave: usa la quota gratuita di
Cloudflare, **10.000 neuroni al giorno**, azzerata a mezzanotte UTC. La foto non
viene salvata sul server.

Non usare i modelli Llama 3.2 con visione: la licenza di Meta non concede i diritti
a chi è domiciliato nell'Unione Europea. Per Gemma leggi i
[termini di Google](https://ai.google.dev/gemma/terms).

Limiti, pensati per non superare mai la quota gratuita:

- **Tetto globale:** il Worker stima i neuroni consumati. Al **90%** segnala un
  avviso (nella risposta dell'API e con una email al proprietario, una volta al
  giorno); prima di superare il **95%** si ferma per tutti fino al giorno dopo.
  Ogni richiesta riserva il caso peggiore prima di partire, quindi la soglia non
  viene scavalcata nemmeno con più richieste insieme. La stima è prudente: la
  misura ufficiale è nel pannello Workers AI di Cloudflare.
- **Limite per account:** 5 analisi al giorno per utente, così una sola persona non
  consuma la quota di tutti.
- Un'analisi fallita per un errore del servizio non conta nel limite dell'utente.

Variabili facoltative (Impostazioni del Worker, Variables):

- `AI_DAILY_LIMIT`: analisi al giorno per account (1-100, predefinito 5).
- `AI_DAILY_NEURONS`: quota giornaliera da considerare (100-1.000.000, predefinito
  10.000). Riducila se l'account usa Workers AI anche per altro.
- `AI_VISION_MODEL`: altro modello `@cf/…` con visione. Se non è nella tabella di
  `worker/ai.js` si usano tariffe prudenti.
- `ALERT_EMAIL`: destinatario degli avvisi (predefinito il proprietario). L'email
  usa `RESEND_API_KEY`, come gli avvisi dello spazio R2; senza chiave non parte.

Se il piano è "Workers Free" Cloudflare ferma da solo le richieste oltre la quota,
senza addebiti; sul piano a pagamento il tetto del 95% resta comunque sotto la
quota gratuita.

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
