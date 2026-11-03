# Checklist di accettazione e regressione

Codex deve registrare `PASS` / `FAIL` / `NON ESEGUITO` e la prova (comando/log/screenshot) per ogni test. NON dichiarare `PASS` senza averlo eseguito. Prima di ogni modifica registrare la baseline.

## A. Autorizzazioni Super Admin (bloccanti)

- [ ] Utente anonimo: editor non visibile, route negata, API privilegiate 401/403.
- [ ] Utente normale: editor non visibile, route negata, API privilegiate 403.
- [ ] Admin normale **non** superadmin: editor non visibile, route negata, API privilegiate 403.
- [ ] Super Admin valido: editor apre e permette preview, modifica, publish, restore.
- [ ] Manipolare ruolo nel payload/localStorage/URL NON conferisce privilegi.
- [ ] Bozze, import/export e cronologia non esposte a utenti normali.
- [ ] Pubblicazione genera audit log e revisione reversibile.

## B. Singola istanza (bloccante)

- [ ] Seleziona Home → elemento univoco «Allenamenti».
- [ ] Modifica SOLO radius, height, colore del bottone selezionato.
- [ ] Il bottone Home → «Programmi» resta immutato.
- [ ] Eventuali altri bottoni «Allenamenti» in altre pagine restano immutati.
- [ ] L'azione originale di «Allenamenti» continua a navigare allo stesso punto.
- [ ] La label visualizzata cambia senza alterare l'identità tecnica.
- [ ] Riavvio dell'app preserva il layout pubblicato, se persistito.
- [ ] Annulla rimuove modifiche in bozza non pubblicate.
- [ ] Ripristina proprietà ereditata non resetta le altre istanze.

## C. Preset, colori ed effetti

- [ ] Tutti i 12 preset caricano correttamente token HEX del file JSON.
- [ ] Switch tra preset aggiorna preview senza pubblicare prematuramente.
- [ ] Personalizzo preset, salvo copia, ricarico: impostazioni identiche.
- [ ] Ripristina factory riapplica ESATTAMENTE i valori base.
- [ ] Se un tema factory è personalizzato, il factory originale resta disponibile.
- [ ] Gradient stops, angolo, neon glow, blur, shadow e opacity accettano input validi.
- [ ] Input HEX invalido o gradient overflow viene bloccato senza crash.
- [ ] Testo rimane leggibile, con warning per contrasto insufficiente.
- [ ] Reduced motion disabilita animazioni superflue.
- [ ] Test palette chiara e scura su Home, Allenamenti, Progressi, Profilo.

## D. Funzioni storiche (bloccanti)

- [ ] Login/logout e refresh sessione inalterati.
- [ ] Ruoli / permessi prima e dopo identici fuori dal Design Studio.
- [ ] Navigazione Home → Allenamenti → Progressi → Profilo e indietro funziona.
- [ ] Avvio allenamento e salvataggio di una serie restano funzionanti.
- [ ] Dati dei progressi, grafici e statistiche non alterati.
- [ ] Calendar, date/eventi/azioni non alterati se presenti.
- [ ] Input e form funzionali, validazioni preservate.
- [ ] Nessuna regressione nei caricamenti API / errori / offline.
- [ ] Tutti gli altri test preesistenti continuano a passare, oppure vengono documentati i failure preesistenti.

## E. Resilienza e deployment

- [ ] Config sconosciuta/obsoleta/invalidata → fallback sicuro e nessun crash.
- [ ] Compatibilità e migrazione per preferenze tema precedenti.
- [ ] Revisioni A → B → rollback A senza perdita dati applicativi.
- [ ] Super Admin modifica in bozza mentre utenti normali vedono la versione pubblicata.
- [ ] Feature flag spegne editor senza disabilitare l'app.
- [ ] Accessibilità: screen reader, contrasto, dimensione testo, touch target.
- [ ] Display piccolo, safe area, landscape/tablet se supportati.
- [ ] Memoria / render performance su liste e chart con effetti glow.

## Report finale obbligatorio

Creare un report con: ambiente/test device; commit/base branch; test suite eseguite e loro risultati; screenshot reali della funzionalità; file modificati; regressioni trovate e risolte; limitazioni; rischi; rollback; tabella dei componenti effettivamente coperti; attività rinviate alla futura fase builder. Distinguere chiaramente «implementato», «parzialmente implementato» e «non implementato».
