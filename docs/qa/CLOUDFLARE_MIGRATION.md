# Migrazione GymTrack → Cloudflare Workers (ambiente di prova)

Stato: **preparazione soltanto**. Nessun deploy, nessuna migrazione dei dati, nessun collegamento alla produzione autorizzato da questo documento.

## Inventario verificato nel repository

- App Angular 22/PWA, API `worker/index.js`, archivio locale Dexie/IndexedDB.
- Il pacchetto `npm run build` genera `dist/server/index.js` e `dist/server/wrangler.json` tramite `tools/package-worker.mjs`.
- Il `wrangler.json` generato contiene `database_id: "DB"`: **segnaposto**, non ID Cloudflare utilizzabile. Non eseguire `wrangler deploy` con tale configurazione.
- `.openai/hosting.json` identifica il progetto Sites e i binding `DB` e `BUCKET`, non le risorse nell'account Cloudflare personale.
- Il Worker calendario `gymtrack-calendar` è un servizio separato: non sovrascriverlo.
- `worker/index.js` associa le sessioni a `oai-authenticated-user-id` e la documentazione richiede l'identità verificata da Sites. **Non esporre le API su un Worker pubblico senza sostituire questa fiducia con autenticazione verificata lato server**.
- `drizzle/meta/_journal.json` elenca 12 migrazioni. Non eseguire migrazioni sul database Sites.
- Le copie server R2, le bozze locali e l'archivio IndexedDB richiedono un piano di trasferimento e rollback dedicato.

## Gate 1 — Sicurezza (bloccante)

1. Scegliere e implementare un provider di identità verificabile dal Worker, con validazione crittografica server-side, protezione delle API e ruoli.
2. Eliminare la dipendenza di sicurezza dall'header `oai-authenticated-user-id` non verificato; mantenere cookie sicuri e controlli Origin/CSRF.
3. Testare richieste anonime, header falsificati, sessioni scadute e isolamento tra utenti.
4. Non usare account reali né dati di produzione in staging.

## Gate 2 — Risorse staging isolate

1. Creare in Cloudflare un D1 **nuovo e vuoto**, e un bucket R2 **nuovo e vuoto**, con nomi distinti da quelli della produzione.
2. Registrare gli ID effettivi soltanto in configurazioni staging o segreti GitHub, mai nei file di configurazione Sites.
3. Creare un Worker staging distinto da `gymtrack-calendar`; associare esclusivamente le risorse staging.
4. Applicare le migrazioni solo al D1 staging, dopo revisione; verificare schema e test con dati sintetici.
5. Verificare dimensione Worker e limiti del piano Cloudflare; il pacchetto attuale incorpora asset frontend in base64.

## Gate 3 — CI/CD

1. Mantenere `.github/workflows/quality.yml` come controllo di qualità.
2. Aggiungere un workflow **manuale** (`workflow_dispatch`) limitato a un GitHub Environment staging protetto, con token Cloudflare a privilegi minimi, account ID e resource ID come segreti/variabili.
3. Il workflow deve fallire se i binding D1/R2 sono assenti o puntano a risorse non approvate, e se i test di autenticazione non passano.
4. Vietare deploy automatici in produzione, applicazioni automatiche di migrazioni su database reali e aggiornamenti di `gymtrack-calendar`.

## Gate 4 — Prove e dati

1. Test end-to-end su staging: login, separazione utenti, backup, recupero, calendario, PWA, offline, aggiornamento su iPhone.
2. Verificare se l'hosting Sites permette un'esportazione **completa** di D1 e R2; non presumerlo dal fatto che l'app possa esportare il JSON personale.
3. Preparare backup, inventario account/archivi, import idempotente, controllo integrità, congelamento scritture e rollback.
4. Solo dopo verifica e **nuova autorizzazione esplicita** pianificare il passaggio degli utenti reali al nuovo dominio. Il cambio origine web può separare i dati IndexedDB/PWA: prevedere esportazione e import guidati.

## Comandi di verifica locali (non pubblicano)

```sh
npm ci
npm run quality
npm run package:deploy
```

## Condizioni di arresto

**Non pubblicare** se manca anche uno dei seguenti: autenticazione indipendente da Sites verificata; ID reali delle risorse staging; isolamento D1/R2; controlli CI superati; piano di ripristino dei dati. Non modificare il branch di produzione o il sito `chatgpt.site` per completare la prova.
