# Immagini — come interpretarle correttamente

Le immagini in `assets/anteprime/` sono **concept grafici**, non screenshot del codice reale e non prove di funzionalità. La loro funzione è guidare component spacing, gerarchia, gradiente, pannelli, rounded corners, feedback selezione e look-and-feel.

**Immagine 01:** Design Studio accessibile solo a Super Admin, presets e palette, editor colore e gradienti, anteprima Home. Usa HEX esatti dei JSON, anche se la grafica mostra valori diversi o incompletezze.

**Immagine 02:** centrale per il requisito di **singola istanza**. Nella Home si seleziona il solo bottone «Allenamenti» dall'albero e si modificano le sue proprietà; la logica del bottone non cambia. **Ignora** l'eventuale pulsante «Aggiungi componente» visibile nel mockup: fuori scope.

**Immagine 03:** inventario di categorie (bottoni, badge, card, progress, slider, ecc.), token globali, pagina specifica e anteprima di esempio. Non promettere supporto per tipi non trovati nel repository.

**Immagine 04:** flusso editor, controlli e live preview. Se la grafica illustra scope «tutti i bottoni», la modifica globale è un'opzione separata; **lo scope predefinito dell'editor instance è solo il controllo selezionato**.

**Immagine 05:** ispirazione per il monogramma GT argento + azzurro elettrico. Non cambiare il logo attuale o la brand identity senza valutarne l'integrazione col progetto.

**Tavola palette:** illustrazione precision-coded; JSON fonte ufficiale per i colori; nomi e colori devono essere preservati o migrati compatibilmente se già presenti.

Se le immagini contengono testo tecnicamente errato (vecchi nomi di modelli, stime di tempo, funzionalità di builder): **vince sempre PROMPT_MASTER_CODEX.md e la specifica funzionale**, mai il testo renderizzato all'interno dell'immagine.
