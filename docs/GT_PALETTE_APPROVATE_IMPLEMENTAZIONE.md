# Palette approvate — GymTrack

Aggiornamento della versione 68, approvato dopo le due tavole di confronto. Il tema già salvato dall’utente resta attivo: l’installazione non modifica preferenze o configurazione Studio pubblicata.

## Palette disponibili

| Palette | ID stabile | Pagina | Card | Accento | Gradiente primario |
| --- | --- | --- | --- | --- | --- |
| Blu Azzurro originale | `blu-azzurro` | `#040C19` | `#0C2036` | `#0DD9FF` | Finitura originale preservata |
| Viola Neon originale | `viola-neon` | `#151225` | `#28223D` | `#CC70FF` | Finitura originale preservata |
| Petrolio Lumina | `petrolio-lumina` | `#061A1D` | `#11363B` | `#2FE3CB` | `#55E8D6` → `#159AAA` |
| Smeraldo Sport | `smeraldo-sport` | `#081911` | `#16362A` | `#55D99C` | `#69E6B0` → `#1BA878` |
| Rubino Carbonio | `rubino-carbonio` | `#1B0D15` | `#351D2B` | `#F47A9F` | `#FF9BB9` → `#D84F80` |
| Oro Satinato | `oro-satinato` | `#14110B` | `#2E281B` | `#E1BF71` | `#F6DEA0` → `#BC9350` |
| Argento Artico | `argento-artico` | `#0B1420` | `#1A2B3D` | `#C1D6ED` | `#D8E9F7` → `#8DAFCE` |
| Prugna Rosé | `prugna-rose` | `#1B1120` | `#36243C` | `#E9A9D1` | `#F7C4DF` → `#BB7AAC` |

I due temi originali erano rimasti nel registro di compatibilità ma non nell’elenco selezionabile. Ora sono nuovamente selezionabili, con gli stessi ID, valori e specializzazioni CSS. Le sei proposte nuove sono implementate da componenti reali, con superfici scure, ombre leggere, bordi coordinati e accento più evidente sull’azione principale. Le tavole approvate sono concept; le schermate reali della verifica sono in `docs/qa/approved-palettes/`.

## Come usarle

- **Tema personale:** Profilo → Impostazioni → Tema e personalizzazione. Le otto palette approvate precedono i sette temi già disponibili; i temi legacy rimangono compatibili. Anteprima, Annulla, Salva tema e ripristino dei colori originali restano attivi.
- **Tema condiviso, solo Super Admin:** Profilo → GT Design Studio → Temi e preset. Le otto palette approvate sono in evidenza; le dodici palette factory precedenti sono conservate, immutabili, in “Altre 12 palette GT”. Gli override di pagina/istanza, preset personali, bozze e pubblicazione confermata funzionano anche con i nuovi ID.
- Le modifiche personali richiedono “Salva tema”; le modifiche condivise richiedono “Pubblica”. Se è pubblicato un tema Studio, i suoi override mantengono la precedenza prevista dall’architettura esistente.

## Compatibilità e implementazione

`shared/approved-palettes.js` è il catalogo comune, profondamente immutabile, per le otto palette approvate. Le impostazioni mantengono il formato esistente `palette/mode/background/accent`: nessuna migrazione di IndexedDB o D1. Sono stati allineati il validatore delle preferenze server, il validatore degli archivi server e lo schema Zod dei backup locali. I dati di allenamenti, piani, serie, profilo e permessi non sono modificati da questi cambiamenti.

I gradienti delle sei nuove palette sono token espliciti, utilizzati anche nelle anteprime. Un accento personalizzato sostituisce entrambi gli stop, evitando colori residui della palette originale. Il testo viene verificato sul colore primario e su entrambi gli stop; eventuali combinazioni non leggibili hanno un fallback sicuro. Le specializzazioni originali di blu/viola restano indipendenti dalle nuove finiture satinate.

Per i preset Studio approvati, le azioni principali mantengono il gradiente, gli altri controlli hanno superfici più discrete e i titoli non ricevono rettangoli glow. Lo stile della sezione settimanale preserva la distinzione fra intestazione e calendario. Un override pieno di una singola istanza viene rimosso correttamente per tornare al gradiente ereditato.

Il Worker autosufficiente incorpora il catalogo approvato prima dei moduli che lo utilizzano; la sua identità build comprende il nuovo sorgente. Nessuna dipendenza aggiunta, nessun asset remoto, nessuna modifica a navigazione, autenticazione, ruoli, handler, query o binding.

File principali: `shared/approved-palettes.{js,d.ts}`, `shared/design-system.{js,d.ts}`, servizi `theme-palettes.ts`, `theme.ts` e `backup.ts`, selettore `theme-picker.component.*`, editor `design-studio.component.*`, `src/theme-finishes.css`, `worker/index.js`, `worker/archive.js` e `tools/package-worker.mjs`.

## Verifiche

| Verifica | Esito | Evidenza |
| --- | --- | --- |
| Baseline prima delle modifiche | PASS | 87 suite / 726 test |
| Regressione completa | PASS | 88 suite / **743 test** |
| Palette, preferenze, backup, sessioni e Studio | PASS | 130 verifiche mirate; successivo controllo finale del renderer e guardie: 45 test |
| Preferenze delle otto palette per Super Admin, Admin e User | PASS | SQLite e API reali in fixture; account/permessi invariati |
| Backup locali e server di tutte le otto palette | PASS | Roundtrip con dati del resto dell’archivio confrontati prima/dopo |
| Originali blu e viola, assenza di ID duplicati e vecchi temi conservati | PASS | Test del catalogo e delle classi di finitura |
| Contrasto sui gradienti, modi scuro/chiaro/sistema e colori personalizzati | PASS | Test dei token, di tutti gli stop e dei fallback |
| Anteprima/reset/salvataggio/ricaricamento delle otto palette | PASS | 12 scenari del runner palette nel browser Chromium |
| Navigazione, istanza singola, bozza, pubblicazione/rollback, ruoli e import malizioso | PASS | 15 scenari di regressione del Design Studio nel browser |
| Selettore a 390 px, senza overflow orizzontale | PASS | Browser Chromium |
| Errori JavaScript nel browser | PASS | Nessuna eccezione applicativa nei due runner |
| Confronto schermate originali recuperate dal codice | PASS | Blu: 100% dei pixel coincidenti; viola: 99,56% nella fixture, con valori e specializzazioni CSS originali preservati |
| Build produzione strict, sintassi Worker, manifest e precache PWA | PASS | Build riuscita; 48 bundle JS verificati; `node --check` |
| API del Worker già confezionato | PASS | Preferenze di tutte le otto palette e pubblicazione/rollback con nuovo ID in SQLite isolato |
| Safari/PWA e iPhone fisico | NON ESEGUITO | Verificati renderer e Chromium; nessun test hardware dichiarato |

I test browser usano esclusivamente `http://localhost:4173`, sessioni e SQLite/R2 di prova in memoria. Nessuna preferenza o bozza di produzione viene scritta durante la verifica. Runner: `tests/runtime/approved-palettes-browser.mjs` e `tests/runtime/design-studio-browser.mjs`.

Comandi di verifica e confezionamento:

```sh
npm test
npm run build
npm run verify:build
node --check dist/server/index.js
node tests/runtime/design-studio-package-check.mjs
npm run package:deploy -- /workspace/gymtrack-approved-palettes-deploy.tar.gz
```

Gli avvisi di budget iniziale e CommonJS di ExcelJS/JSZip erano già presenti nella baseline; non sono stati disabilitati. La build resta sotto il limite di errore di 2 MB.

Ripristino: scegliere il tema o il preset precedente, oppure usare la cronologia Studio. Per il ripristino del codice, la versione precedente è la 68; non sono necessarie cancellazioni o migrazioni inverse di dati.

## Schermate reali

- [Blu originale](qa/approved-palettes/blu-azzurro-home.png)
- [Viola originale](qa/approved-palettes/viola-neon-home.png)
- [Petrolio Lumina](qa/approved-palettes/petrolio-lumina-home.png)
- [Smeraldo Sport](qa/approved-palettes/smeraldo-sport-home.png)
- [Rubino Carbonio](qa/approved-palettes/rubino-carbonio-home.png)
- [Oro Satinato](qa/approved-palettes/oro-satinato-home.png)
- [Argento Artico](qa/approved-palettes/argento-artico-home.png)
- [Prugna Rosé](qa/approved-palettes/prugna-rose-home.png)
- [Selettore personale](qa/approved-palettes/personal-theme-picker.png)
- [Palette nel Design Studio](qa/approved-palettes/studio-approved-presets.png)
