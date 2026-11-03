# Specifica funzionale e architetturale — Design Studio v1

## Decisioni di prodotto

1. **Solo Super Admin** può aprire e usare l'editor. Un admin normale è utente non autorizzato.
2. **Si personalizzano soltanto i componenti esistenti**. Niente aggiunta, duplicazione, rimozione, riordino o mutazione del tipo in questa versione.
3. L'editor opera a tre scope distinti: globale, pagina, **singola istanza identificata stabilmente**. Il default quando si seleziona un controllo dalla pagina è la singola istanza.
4. La personalizzazione non muta business logic, routing, onPress, fetch, validazione, permessi, hook e stato operativo.
5. Le modifiche sono prima bozze private, poi pubblicate esplicitamente dal Super Admin. Una revisione precedente è ripristinabile.
6. Le palette predefinite sono factory immutable; le versioni personalizzate sono preset salvati dall'admin.

## Mappa schermate

**Profilo**: per Super Admin compare «Design Studio». Per altri ruoli la voce è assente, con protezione anche per la route.

**Design Studio**: tab/entry «Pagine», «Stile globale», «Temi», «Preset», «Cronologia». Mostra revisione pubblicata, stato bozza e un'anteprima.

**Pagine**: elenco schermate esistenti; aprendo Home, overlay di selezione e pannello gerarchico; cliccando «Allenamenti» si apre l'editor soltanto di quell'istanza (es. `home.quick_actions.workouts`).

**Editor istanza**: proprietà in gruppi `Testo`, `Icona`, `Colori`, `Stile`, `Dimensioni`, `Bordi`, `Effetti`, `Animazioni`; controlli non supportati sono chiaramente disabilitati e motivati. Pulsanti `Ripristina proprietà`, `Annulla`, `Salva bozza`, `Pubblica`.

**Preset**: 12 factory più preset dell'admin, filtro/ricerca, applica, copia, ripristina originale, import/export JSON validato, preview.

## Precedenza deterministica

`factory preset → globalOverrides → pageOverrides[pageId] → instanceOverrides[stableId]`.

Un override `null` non deve produrre un reset ambivalente: usare operazione di rimozione chiave per tornare a ereditare. Le mutazioni devono essere atomiche, validate e reversibili. Non ricalcolare override su indici d'array o testi visualizzati.

## Identità delle istanze

| Esempio | Scope | Effetto |
|---|---|---|
| `global.button.primary` | Variante globale | Bottoni che ereditano la variante |
| `home` | Pagina | Soltanto i controlli che ereditano da Home |
| `home.quick_actions.workouts` | Singola istanza | SOLO bottone Allenamenti della griglia Home |
| `home.quick_actions.programs` | Singola istanza | SOLO bottone Programmi |
| `workouts.session.save_set` | Singola istanza | SOLO bottone Salva serie in quel contesto logico |

I nomi sopra sono **esempi**, da ricondurre alle route e ID reali. Per componenti in liste, l'istanza può essere per singola entità stabile; l'editor deve dire esplicitamente se l'override colpisce un template ripetuto o uno specifico item. Non riutilizzare accidentalmente lo stesso ID per più controlli.

## Editor delle proprietà per tipo

| Tipo componente | Proprietà visive | Proprietà che DEVONO restare invariate |
|---|---|---|
| Button | label visualizzata, icona, background, gradient, padding, radius, width/height, font, glow, shadow | onPress, disabilitato in base a business logic, route, submit, analytics |
| Badge | bg, testo, icona, tipo visuale, radius, padding | valore dinamico e sua logica |
| Card / container | sfondo, bordo, padding, ombra, opacità, min/max dimensions | figli, rendering dati, comportamento |
| Text / Label | font, dimensione, peso, colore, allineamento, display label statica sicura | dati dinamici, localizzazione obbligatoria, form feedback |
| Input / Form | bordo, radius, background, placeholder decorativo, font | name/field key, validation, focus, binding, submit |
| Checkbox/Radio/Switch | dimensione visiva, colore attivo, radius, track | value, onChange, permessi, enabled |
| Slider / Progress | track, fill, thickness, radius, gradient | valore, min/max funzionali, handler |
| Charts | palette, tipo di linee/barre se compatibile, spessore, legend, grid, height | dataset, filtri, trasformazioni, tooltip essenziali |
| Calendar | celle, indicatori, selezione visuale, typography, spacing | eventi, date, locale/semantica e handlers |
| Tabs / Navigation | bordi, stili attivo/inattivo, icone decorative, font | tab IDs, routing, permission gates |
| Image / background | aspect, overlay, opacity, blur, fitting | URL/sorgenti business se funzionali |

Se un tipo di componente non esiste nel repository, non crearlo solo per farlo apparire nell'elenco. Generare inventario e feature coverage reale.

## Proprietà avanzate da esporre dove supportate

- **Colori:** color picker HEX + RGBA per trasparenze, foreground, background, text, placeholder, border, selected, disabled, hover/focus quando applicabili.
- **Gradienti:** linear e radial, 2-5 stop, offset 0-1, angolo o centro; fallback colore singolo, valida input.
- **Neon/Glow:** color, intensity 0-100%, blur/spread in unità logiche, shadow/glow quality; default cauto, spegnibile globalmente.
- **Bordi:** colore, spessore, 4 angoli separati dove supportati, dashed/solid se supportato.
- **Dimensioni:** auto/intrinsic/relative %, min/max, width, height, vertical/horizontal padding, safe areas, responsive constraints.
- **Tipografia:** font family installate, size, weight, line height, letter spacing, align, max lines (senza nascondere informazioni critiche).
- **Sfondi:** colore, gradient, asset approvato, overlay, blur, contrast guard, static/dynamic con reduced motion.
- **Animazioni:** duration, easing, on-press visual, transizioni di colore; nessuna animazione indispensabile per utilizzare la funzione.
- **Icone:** scelta da libreria già disponibile, size, tint, alignment; non cambiare la semantica dei comandi critici.

Evitare valori arbitrariamente grandi che rompano layout o coprano altre funzionalità. Verificare touch target 44 pt/48 dp o equivalente del framework e contrasto WCAG per testo quando praticabile. Non esporre editing di ID tecnici, action names, query, URL arbitrari, permission checks o binding nel v1.

## Persistenza consigliata (adattare allo stack)

- `ThemeFactory` immutabile e versionata.
- `UserDesignDraft` privata ai Super Admin autorizzati, a livello di progetto o tenant secondo sistema attuale.
- `PublishedDesignRevision` condivisa con l'app in sola lettura per utenti normali, con versione, timestamp, publisher, checksum.
- `DesignAuditEvent` con actor, timestamp, revision, delta e decisione di pubblicazione.
- Cache lato client e schema-validation all'ingresso; fallback a factory se dati invalidi/offline.
- Publish con operazione atomica / compare-and-swap contro conflitti, se il backend consente.
- Su progetti multi-tenant rispettare esplicitamente il tenant corrente.

Se l'app è locale e senza backend adatto, consegnare editor/preset locali, ma NON affermare che ogni utente vede la pubblicazione globale. Segnalare cosa occorre per questo traguardo.

## Sicurezza (non opzionale)

Il gate di accesso client non è una misura sufficiente. Utilizzare la fonte **server-authoritative** dei ruoli già presente. Endpoint e dati di draft, edit, preset, publish, rollback, export/import: accesso solo a Super Admin. Un admin normale NON equivale a Super Admin. Mai leggere ruoli da variabili impostabili da un utente (localStorage/config JSON). Non aggiungere account, password, ruoli o admin predefiniti. Non mettere segreti nelle configurazioni. Applica ACL/RLS/backend rules ai record persistiti e alle funzioni esposte.

Se il backend non espone un ruolo sicuro, non bypassare: blocca write/publish e spiega il vincolo. Aggiungere test con utente anonimo, user, admin e superadmin.

## Protezione delle funzioni esistenti

Prima e dopo ogni tranche confrontare: route navigation, session/auth, permessi, add/edit/delete workout, saving sets, views dei progressi, charts, calendario, configurazioni già salvate, temi esistenti, richieste di rete e gestione errori. Usare wrapper di sola presentazione, non forkare interamente componenti funzionali. Per la pubblicazione globale prevedere feature flag, rollback, schema migration e monitor errori.

## Risultato minimo accettabile

Un Super Admin entra, seleziona `Home → Bottone Allenamenti`, modifica **solo** raggio/altezza/colore/label visualizzata, vede preview live, salva, pubblica, riavvia e ritrova il cambiamento; gli altri bottoni e le loro azioni sono invariati. Un admin normale non può aprire la route né chiamare le API. Un preset factory ripristina colori e glow originali e resta disponibile per sempre. Test documentati.
