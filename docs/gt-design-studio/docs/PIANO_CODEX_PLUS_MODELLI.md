# Piano consigliato per Codex con il piano ChatGPT Plus

**Rilevazione: 03 novembre 2026.** La disponibilità effettiva dei modelli e dei livelli di ragionamento dipende dal selettore del tuo account Codex. Queste sono indicazioni di uso, **non** garanzie di quota, prezzo fisso o qualità. Con ChatGPT Plus puoi usare Codex; la quota dipende da modello, effort e attività.

## Modello ed effort consigliati per ciascuna tranche

| Tranche (una richiesta Codex distinta) | Modello preferito | Effort | Perché |
|---|---|---|---|
| 0. Inventario repository, componenti, baseline test | **GPT-6 Luna** | Low o Medium | Esplorazione e riepilogo, risparmia quota |
| 1. Progettazione architettura/theme tokens e identità stabili | **GPT-6.1 Sol** | High | Serve ragionamento sulle dipendenze esistenti |
| 2. Autorizzazione Super Admin e policy backend | **GPT-6 Astra** | Medium o High | Parte più critica, sicurezza e access control; revisionare a mano |
| 3. Primo vertical slice: editor di un singolo bottone Home, preview e persistenza | **GPT-6.1 Sol** | High | Integrazione end-to-end con comportamento preesistente |
| 4. Palette, gradienti, glow, preset e restore | **GPT-6.1 Sol** | Medium | Design system e form configurazioni |
| 5. Applicazione global/page/instance ad altre tipologie | **GPT-6.1 Sol** | Medium o High | Scoperta e integrazione con componenti reali |
| 6. Test unitari / snapshot / lint, codemod e piccoli bug semplici | **GPT-6 Luna** | Low o Medium | Ripetitivo e circoscritto |
| 7. Audit finale sicurezza, regressione, migrazioni, rollback | **GPT-6 Astra** | Medium o High | Analisi trasversale dei rischi |

**Fallback:** se GPT-6.1 Sol non è nel tuo selettore, usa **GPT-6 Sol o il Sol disponibile più recente**, Medium/High; se Astra non è disponibile o la quota è insufficiente, **Sol High** e revisione manuale rafforzata. Non usare GPT-4o o modelli deprecati sulla base di vecchie infografiche: fai fede al selettore attuale e alla documentazione aggiornata.

## Per contenere l'uso di Plus

- Usa **Standard**, non ultrafast, e sessioni concise con il repository e i file già aperti.
- NON inviare il prompt gigante a ogni micro-correzione: lascia i `.md` nel progetto e fai riferimento ai path.
- Lavora su una tranche verificabile per volta. Ogni tranche deve includere le modifiche + test del proprio perimetro.
- Usa Luna per revisioni meccaniche e test ben circoscritti; usa Astra solo su accessi privilegiati, design decision complesse e audit finale.
- Prima di far riscrivere ampie parti dell'app, imponi di trovare adapter e punti di estensione esistenti.
- Non usare effort massimo per ogni passaggio: High non è sempre migliore per compiti banali, e consuma più quota.
- Controlla **Impostazioni → Utilizzo** in ChatGPT o `/status` nella CLI per la quota residua. La quota reale varia e può esaurirsi.
- Se Codex non può leggere i file nel repository o non possiede permessi, non può proseguire solo aumentando l'effort.

## Sviluppo in tranche e verifiche richieste

**Tranche 0 — Ricognizione:** output di inventario + test baseline + punti di rischio; nessuna modifica business logic.

**Tranche 1 — Controlli di sicurezza:** gate UI/route/backend, audit e test negativo. In assenza di fonte di ruolo affidabile, blocca la pubblicazione e segnala.

**Tranche 2 — Primo use case reale:** una sola istanza `Home/Allenamenti` configurabile, anteprima, bozza, publish, restore e test.

**Tranche 3 — Preset & effetti:** 12 palette, gradiente/neon, picker, preview, restore originale, contrasto.

**Tranche 4 — Coverage:** altri componenti reali e altre schermate senza alterare funzionamento.

**Tranche 5 — Stabilizzazione:** regressione completa, performance, migrazioni, rollback, documentazione.

## Fonti ufficiali verificate in data 03/11/2026

- Guida italiana OpenAI — Codex con piano ChatGPT: https://help.openai.com/it-it/articles/11369540-using-codex-with-your-chatgpt-plan
- Gestione uso Astra/Codex e scelte modello/effort: https://help.openai.com/it-it/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex
- ChatGPT Work e Codex e disponibilità di Astra in Plus: https://help.openai.com/it-it/articles/20001275-chatgpt-work-and-codex
- Guida tecnica sulla selezione dei modelli: https://developers.openai.com/api/docs/guides/model-selection

Non confondere i modelli/API con i modelli offerti dal selettore Codex del tuo piano. Se i nomi cambiano, usa il modello più vicino al ruolo indicato sopra.
