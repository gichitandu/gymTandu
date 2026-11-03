# GT Fitness — GT Design Studio (solo Super Admin)

**Pacchetto di specifiche e riferimenti visivi per Codex, 03/11/2026.**

> **Attenzione:** questo archivio contiene istruzioni, immagini concettuali, palette e casi di test. **Non contiene l'app già modificata**. Codex deve analizzare e modificare il repository reale; senza accesso al codice non è possibile garantire integrazione o assenza di regressioni.

## Obiettivo approvato

Implementare **Personalizzazione Avanzata** dentro l'attuale app GT Fitness — Giacomo Tanduo, accessibile esclusivamente ai **Super Admin**, per configurare:

- l'aspetto globale dell'app;
- l'aspetto di una specifica pagina;
- l'aspetto **di una singola istanza di controllo già esistente** (es. *solo* il bottone «Allenamenti» nella Home, senza toccare gli altri bottoni);
- temi/palette predefiniti e temi personalizzati salvabili, applicabili e ripristinabili;
- sfumature, glow, neon, bordi, tipografia, icone, sfondi, microanimazioni, spaziature e dimensioni, dove tecnicamente supportati dal componente.

**In questa fase NON implementare** aggiunta, duplicazione, rimozione o riordino di componenti né un builder no-code di pagine. Il visual builder arriverà in una fase futura. I componenti attuali devono mantenere gli handler, la navigazione, gli stati e i dati collegati.

## Ordine di consultazione per Codex

1. `PROMPT_MASTER_CODEX.md` — **file principale: istruzioni operative da eseguire nel repository**.
2. `docs/SPEC_FUNZIONALE_E_ARCHITETTURA.md` — casi d'uso, perimetro, requisiti di sicurezza e architettura.
3. `docs/PIANO_CODEX_PLUS_MODELLI.md` — scelta modello/effort per fase e quota Plus.
4. `docs/TEST_DI_ACCETTAZIONE_E_REGRESSIONE.md` — verifiche obbligatorie.
5. `config/PALETTE_PREDEFINITE.json` — **12 palette con valori HEX esatti e token**.
6. `config/ESEMPIO_CONFIGURAZIONE_SOLO_STILE.json` — esempio di override su una sola istanza; **non è uno schema vincolante**.
7. `assets/anteprime/*.png` — esempi visivi non vincolanti in ogni dettaglio; evitare la funzionalità “aggiungi componente” eventualmente raffigurata in immagini storiche.
8. `assets/palette/TAVOLA_12_PALETTE.png` — campionario generato dai valori HEX del JSON.

## Come usare il pacchetto

1. Scarica ed estrai lo ZIP.
2. Copia la cartella `GT_DESIGN_STUDIO_CODEX_PLUS` **dentro la root del repository** della tua app, ad esempio `docs/gt-design-studio/` (non copiare dati sensibili nell'archivio).
3. Apri **Codex nel repository reale**.
4. Incolla il testo breve qui sotto in Codex:

```text
Apri e leggi integralmente GT_DESIGN_STUDIO_CODEX_PLUS/README_INIZIA_DA_QUI.md,
GT_DESIGN_STUDIO_CODEX_PLUS/PROMPT_MASTER_CODEX.md, tutti i file in
GT_DESIGN_STUDIO_CODEX_PLUS/docs/ e i due JSON in config/.
Consulta inoltre tutte le immagini in assets/anteprime/ e assets/palette/.

IMPLEMENTA la FASE 1 indicata nel prompt nel repository corrente: Design Studio
SOLO Super Admin, temi/palette e personalizzazione dei controlli GIA' esistenti,
a livello globale, pagina o SINGOLA ISTANZA. Non creare componenti nuovi e
NON alterare le funzioni attive. Analizza lo stack reale, modifica i file,
esegui i test e registra i risultati. Non limitarti a un mockup.
```

Se hai copiato i file in un'altra cartella, modifica il percorso nel messaggio.

## Limiti e garanzie

- Un semplice collegamento `sandbox:` di ChatGPT **non è un URL pubblico visitabile da Codex**: il modo affidabile è scaricare lo ZIP e inserirlo nel repository.
- La sicurezza Super Admin deve essere applicata **lato server/backend e lato storage**, non solo nascondendo pulsanti. Le modalità esatte dipendono dallo stack reale.
- L'assenza di regressioni è un *criterio di accettazione da verificare con test*, non una promessa verificabile da questo pacchetto in assenza del progetto.
- Nessuna immagine generata è codice sorgente, né rappresenta un layout pixel-perfect garantito.

## Riferimenti visivi

| Immagine | Cosa mostra |
|---|---|
| `01_SUPER_ADMIN_E_PRESET.png` | Accesso Super Admin,  palette, gradienti, neon e gestione preset |
| `02_EDITOR_SINGOLO_BOTTONE_HOME.png` | Selezione **della singola istanza** «Allenamenti» dalla gerarchia Home, con editor relativo |
| `03_EDITOR_GLOBALE_E_PER_PAGINA.png` | Design token globali, selezione pagine e tipologie di controlli |
| `04_CONTROLLI_E_ANTEPRIMA.png` | Navigazione dell'editor e anteprima dell'app |
| `05_ICONA_LOGO_GT.png` | Identità visiva blu/argento, solo come riferimento del logo |
| `TAVOLA_12_PALETTE.png` | I 12 preset precisi del JSON |

**Priorità in ordine:** sicurezza e funzionalità esistenti → personalizzazione reale della singola istanza → propagazione dei token e temi → fedeltà visiva ai concept.
