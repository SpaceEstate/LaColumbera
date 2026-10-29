# Inventario dei trattamenti, dei servizi e della conservazione – La Columbera

Branch `gdpr/informativa`, terzo intervento (1: check-in, 2: sicurezza accessi, 3: informativa e documentazione).

Base di lavoro: `main` di **SpaceEstate/LaColumbera** (commit `bc26096`, che contiene già il Prompt 2) e `main` di **SpaceEstate/Checkin** (commit `431feb0`, che contiene già il Prompt 1 con le richieste successive: foglio Google, PDF di riepilogo, rimozione del riquadro finale).

Questo documento descrive **cosa fa il codice**. Non attesta la conformità al GDPR.

Ogni informazione è marcata così:

- **[CODICE]**: verificato leggendo il codice dei due repository.
- **[BROWSER]**: verificato con un browser automatico (Chromium) su un server locale.
- **[GESTORE]**: decisione o informazione comunicata dal gestore nelle conversazioni dei tre interventi. Non è verificabile dal codice.
- **[DA VERIFICARE]**: richiede l'accesso ad account, contratti o impostazioni reali.

---

## 0. Fonti lette (27/10/2026)

| Fonte | Cosa conta qui |
|---|---|
| Garante privacy, nota del 29/04/2026 sui documenti degli ospiti (docweb 10244289) | L'obbligo dell'art. 109 TULPS riguarda la **comunicazione** dei dati, non la conservazione: i dati restano per 5 anni nei sistemi del Ministero. Le copie dei documenti servono solo a inserire i dati in Alloggiati Web e vanno cancellate o distrutte appena il sistema genera la **ricevuta**. La **ricevuta va conservata 5 anni**. Il personale deve ricevere istruzioni per non fare né trattenere copie. Il Garante sconsiglia di fotografare i documenti con dispositivi mobili e di usare la messaggistica istantanea (l'**email non è citata**). Se si acquisiscono immagini, gli ospiti vanno informati che non saranno conservate. I fornitori vanno regolati con accordi ex art. 28. Le violazioni si notificano secondo gli artt. 33 e 34. |
| Consiglio di Stato, Sez. III, sent. 9101 del 21/11/2025 | Il gestore deve verificare **di persona** la corrispondenza tra gli ospiti e i documenti, almeno per la fotografia. Il "check-in da remoto" non basta. È ammesso un videocollegamento all'ingresso che accerti *hic et nunc* la corrispondenza (gli esempi citati sono uno spioncino digitale o un QR code con fermo immagine). La pagina non cita circolari ministeriali. |
| GDPR (EUR-Lex, testo consolidato) | Letti gli artt. 5, 6, 12, 13, 25, 28, 30, 32, 33 e 34. Il testo dell'art. 13 (contenuto dell'informativa) è la traccia di `privacy.html`. L'art. 30 par. 5 esonera dal registro dei trattamenti chi ha meno di 250 dipendenti, **salvo** che il trattamento possa presentare un rischio, **non sia occasionale** o riguardi dati particolari o penali. Qui il trattamento degli ospiti non è occasionale: **la tenuta del registro va valutata** (vedi § 8). |
| Garante privacy, FAQ cookie | Per i soli strumenti tecnici **non serve consenso e non serve banner**; l'informativa resta dovuta e può stare nella privacy policy. Gli strumenti non tecnici richiedono il consenso. Per le terze parti l'informativa deve contenere i link alle loro informative. |

**Discrepanza segnalata.** La nota del Garante non tratta la verifica *de visu*. È la sentenza del Consiglio di Stato a stabilirla, ed è coerente con quanto riassunto nei prompt.

---

## 1. Interessati

- Visitatori del sito e della pagina di check-in.
- Chi prenota direttamente sul sito.
- Ospiti che prenotano tramite Booking.com o Airbnb: i loro dati arrivano dalle piattaforme (art. 14 GDPR).
- Tutti gli ospiti di un soggiorno, compresi i minori. I loro dati sono inseriti nel check-in dal **responsabile del gruppo**, non dagli ospiti stessi.
- Chi richiede la Trentino Guest Card.
- Chi scrive o telefona.
- Autori di recensioni pubbliche su Google e Booking mostrate sul sito.
- Amministratore e gestore, per le credenziali del pannello.

---

## 2. Inventario dei trattamenti

| # | Trattamento | Dati | Dove (servizio) | Finalità | Base giuridica proposta | Conferimento | Fonte |
|---|---|---|---|---|---|---|---|
| T1 | Navigazione | IP, user agent, URL, data e ora nei log di hosting | Vercel (sito e API), GitHub Pages (pagina di check-in) | Erogare il sito, sicurezza | Legittimo interesse (6.1.f) | Necessario tecnicamente | [CODICE] per l'uso dei servizi; contenuto e durata dei log [DA VERIFICARE] |
| T2 | Protezione da abusi | Hash troncato dell'IP (`sha256('ip\|'+ip)`), hash del codice prenotazione, contatori | Upstash (KV), chiavi `rl:*` con scadenza | Rate limit su accesso, login e checkout | Legittimo interesse (6.1.f) | Automatico | [CODICE] `api/_accesso.js` |
| T3 | Prenotazione diretta | Nome e cognome, email, telefono (facoltativo), appartamento, date, notti, ospiti, importo, codice, stato, data di creazione, ID della sessione Stripe | Upstash (KV, hash `bkh`) | Gestire la prenotazione e il pagamento | Contratto e misure precontrattuali (6.1.b) | Nome ed email obbligatori; telefono facoltativo | [CODICE] `api/x.js` checkout |
| T4 | Pagamento della prenotazione | Email (`customer_email`), codice prenotazione, appartamento, date, importo. I dati della carta sono inseriti solo sulla pagina Stripe | Stripe Checkout | Incasso | 6.1.b | Obbligatorio per prenotare online | [CODICE] |
| T5 | Comunicazioni essenziali | Email all'ospite: codice, riepilogo, link con il token di accesso. Email al titolare/gestore: nome, email, telefono, riepilogo, riferimento Stripe | Gmail (SMTP, `GMAIL_USER` → `OWNER_EMAIL`) | Conferma e gestione del soggiorno | 6.1.b | — | [CODICE] `api/_mail.js`, `stripe-webhook.js` |
| T6 | Area clienti | Codice prenotazione (sito: 13 caratteri casuali; Booking/Airbnb: numero del portale dal foglio), confronto lato server; token (solo hash) | Upstash, foglio (registro) | Mostrare la prenotazione | 6.1.b | Facoltativo (servizio accessorio) | [CODICE] `api/_accesso.js` |
| T6b | Messaggi dell'area clienti (solo prenotazioni del sito) | Testo dei messaggi dell'ospite e del gestore, lingua, data e ora, letto/non letto; messaggi automatici compilati dai template; traduzioni (se DeepL attivo) | Upstash (`msg:*`), DeepL se `DEEPL_API_KEY`; email (Gmail) con il testo del messaggio all'ospite e al gestore, con il pulsante «Rispondi» | Comunicazioni sul soggiorno | 6.1.b | Facoltativo | [CODICE] `api/_messaggi.js`; cancellazione automatica N giorni dopo la partenza (predefinito 90) |
| T6c | Pulizie (Gestione) | Per ogni arrivo: come preparare i letti (matrimoniale o singoli) e una nota facoltativa, legate al codice della prenotazione; il testo copiato per chi fa le pulizie contiene solo giorni, orari, numero di ospiti, notti e letti, **senza nomi né contatti** | Upstash (`pul:info`), poi il canale scelto dal gestore (es. WhatsApp) per il testo | Organizzare le pulizie | 6.1.b | – | [CODICE] `api/x.js` (`pul_info`, `pul_set`), `js/admin-pulizie.js`; voce tolta da sola 60 giorni dopo la partenza |
| T6d | Annullamento con rimborso (solo prenotazioni del sito pagate) | Sulla prenotazione: stato «annullata», chi ha annullato (ospite o titolare), data, importo, stato e riferimento del rimborso Stripe (`re_…`); nota sul foglio | Stripe (Refunds API, chiave di idempotenza per prenotazione), Upstash `bkh`, foglio, Gmail (email all'ospite e, se annulla l'ospite, al titolare) | Rimborsare e liberare le notti | 6.1.b | Facoltativo | [CODICE] `api/_annulla.js`; nessun dato nuovo dell'ospite |
| T6e | Ricevuta su richiesta (area clienti) | Nome e cognome o ragione sociale, codice fiscale o numero fiscale estero, indirizzo, CAP, città, paese, email di invio (se diversa da quella della prenotazione; per Booking/Airbnb obbligatoria), nota, lingua; file della ricevuta allegato all'email ma **non conservato** | Upstash (hash `ric`), Gmail (email al titolare con i dati; email all'ospite con l'allegato) | Preparare e mandare la ricevuta richiesta | 6.1.b; per la ricevuta emessa 6.1.c | Facoltativo | [CODICE] `api/_ricevute.js`; all'area ospiti torna solo lo stato e l'email mascherata; cancellazione automatica 30 giorni dopo l'invio, 12 mesi se mai inviata |
| T7 | Trentino Guest Card (su richiesta) | Email, date, numero di persone, codice prenotazione. Risultato salvato: ID/QR della card, stato, date, ospiti, email | Sistema Trentino Guest Card (host `ricettivo.guestcard.info`, OAuth della struttura), Upstash `gc:<codice>`. Emissioni manuali dell'admin in `gc:manual` (ultime 300) | Emettere la card richiesta dall'ospite | 6.1.b (servizio richiesto) | Facoltativo: senza, nessuna card | [CODICE]; ruolo del gestore TGC [DA VERIFICARE] |
| T8 | Registro prenotazioni e disponibilità | Codice, fonte, appartamento, date, notti, ospiti, stato, note. **Nome, email e telefono NON vengono inviati al foglio** | Google Sheet tramite Apps Script (`SHEET_WEBAPP_URL`); copia del registro in KV (`reg`, 90 giorni) | Calendario unico, evitare doppie prenotazioni | 6.1.b, legittimo interesse organizzativo | — | [CODICE] `_avail.js` `regPayload`. Contenuto del foglio per le righe Booking/Airbnb [DA VERIFICARE]: lo script Apps Script non è nel repository |
| T9 | Sincronizzazione calendari | Date occupate; `SUMMARY` e `DESCRIPTION` degli eventi delle piattaforme (fino a 600 caratteri: possono contenere codice o link della prenotazione) | iCal Booking.com/Airbnb → KV (`ics:*`, 90 giorni, sostituito a ogni aggiornamento); export iCal verso le piattaforme con solo "Bloccato - La Columbera" | Disponibilità | Legittimo interesse / 6.1.b | — | [CODICE]. Contenuto reale delle descrizioni [DA VERIFICARE] |
| T10 | Check-in online: Alloggiati Web | Per ogni ospite: cognome, nome, sesso, data di nascita, cittadinanza, luogo di nascita (comune e provincia se in Italia). Per il responsabile: tipo, numero e luogo di rilascio del documento | Browser → Vercel (API Checkin) → Neon (`temporary_sessions`, temporaneo) → Google Sheet del check-in (`SHEET_ID`, una riga per ospite, con età e totale) → script del gestore → TXT su Google Drive ("Check-in › Polizia di Stato") → caricamento sul portale | Comunicazione obbligatoria degli alloggiati | Obbligo legale (6.1.c; art. 109 TULPS) | Obbligatorio | [CODICE] `Checkin/api/_sheet-checkin.js`, `_elabora-checkin.js`; script e TXT [GESTORE] |
| T11 | Check-in online: immagine del documento e riepilogo PDF | Immagine del documento del responsabile (fronte ed eventuale retro, compressa nel browser). PDF con i dati di tutti gli ospiti | Neon (temporaneo); email al gestore tramite Gmail (`EMAIL_USER` → `EMAIL_PROPRIETARIO`) con immagini e PDF; il PDF è generato da **Browserless** (riceve l'HTML con i dati anagrafici, **non** le immagini) | Controllare che i dati inseriti corrispondano al documento prima della comunicazione | 6.1.c (attività strumentale all'obbligo), modalità mantenuta su indicazione del gestore | Nel modulo attuale **la foto è obbligatoria** per completare il check-in online | [CODICE] `_email-gestore.js`, `_pdf-riepilogo.js`; scelta [GESTORE] |
| T12 | Imposta di soggiorno (check-in) | Date di nascita (età ≥ 4 anni), notti, totale; email e pagamento su Stripe; metadati Stripe senza anagrafiche | Stripe (pagamento), Neon, foglio del check-in (colonna Totale) | Riscossione dell'imposta | Obbligo legale (6.1.c) — riferimento normativo [DA COMPLETARE] | Obbligatorio | [CODICE] `crea-pagamento-stripe.js` |
| T13 | Email di benvenuto (check-in) | Email (da Stripe), nome e cognome del responsabile, dati del soggiorno, **codici della cassetta portachiavi** | Gmail SMTP | Accesso alla struttura | 6.1.b | — | [CODICE] `invia-email-ospite.js` |
| T14 | Invio Alloggiati dal pannello admin (facoltativo) | Schedine dal TXT o inserite a mano. **Non salvate**: restano nella pagina, sul server passano solo in memoria; in KV resta l'impronta per 7 giorni | Vercel → web service Alloggiati Web (Polizia di Stato) | Comunicazione obbligatoria | 6.1.c | — | [CODICE] `api/adempimenti.js` |
| T15 | Statistiche ISTAT | CIPAT, date di arrivo e partenza, provenienza, numero di persone (nessun nome). Non salvati; impronta in KV per 70 giorni | Vercel → servizio ISTAT Alloggi della Provincia autonoma di Trento (`statweb.provincia.tn.it`) | Rilevazione statistica obbligatoria | 6.1.c — riferimento normativo [DA COMPLETARE] | — | [CODICE] `api/istat.js` |
| T16 | Contatti | Ciò che l'interessato scrive o dice | Casella Gmail, telefono | Rispondere | 6.1.b o legittimo interesse | Facoltativo | [GESTORE] |
| T17 | Recensioni mostrate sul sito | Google: nome dell'autore, link al profilo, voto, testo, data (Places API, lato server, cache in KV ogni 24 h). Booking: autore, testo, voto inseriti a mano in `data/reviews-booking.json` | Google Places API, Upstash, repository | Mostrare recensioni pubbliche | Legittimo interesse (6.1.f) | — | [CODICE] `api/reviews.js`. La cache Google in KV non ha scadenza: viene sovrascritta |
| T18 | Pannello admin | Utente e password (variabili d'ambiente); token di sessione firmato valido 8 ore in sessionStorage `lc_t` | Vercel, browser | Gestione | Legittimo interesse | — | [CODICE] |
| T19 | Foto degli appartamenti caricate dall'admin | Nessun dato personale previsto | Vercel Blob (URL pubblici) | Contenuti del sito | — | — | [CODICE] `a==='up'` |

**Non usati, verificato nel codice:**

- Neon/PostgreSQL nel sito principale: è usato **solo** dal check-in.
- Analytics, pixel, tag manager, mappe incorporate, iframe.
- Cookie: nessuno impostato dal sito.
- Salvataggio diretto del TXT su Drive da parte del check-in: il modulo `_drive.js` esiste ma il flusso non lo usa.

---

## 3. Servizi e fornitori

Per ogni fornitore va verificato, sui contratti o sui termini accettati, il **ruolo** (responsabile ex art. 28 o titolare autonomo), l'**accordo sul trattamento dei dati (DPA)** e la **regione dei server**. Dal codice nessuno di questi aspetti è verificabile, salvo dove indicato.

| Servizio | Funzione | Dati coinvolti | Trasferimenti extra SEE verificabili dal codice |
|---|---|---|---|
| Vercel | Hosting del sito e delle API (sito e check-in), log, cron, Blob | Tutti quelli che transitano dalle API; IP nei log | Regione non indicata in `vercel.json` (nessun campo `regions`) → [DA VERIFICARE] |
| Upstash (Redis/KV) | Prenotazioni, Guest Card, token (hash), contatori, cache, messaggi dell'area clienti | T2–T9, T6b, T17 | URL nelle variabili d'ambiente → [DA VERIFICARE] |
| DeepL (DeepL SE, Germania) | Traduzione automatica dei messaggi, solo se è impostata `DEEPL_API_KEY` (piano Pro consigliato) | T6b | [DA VERIFICARE] condizioni del contratto |
| Neon (PostgreSQL) | Dati temporanei del check-in e registro tecnico | T10, T11 (immagini comprese) | Stringa di connessione nelle variabili → [DA VERIFICARE] |
| GitHub (GitHub Pages) | Ospita la pagina di check-in `spaceestate.github.io/Checkin` (indicata nel `successUrl` e nel link dell'area clienti) | IP dei visitatori | [DA VERIFICARE] |
| Google – Gmail (SMTP) | Invio di tutte le email | T5, T11, T13 | [DA VERIFICARE] |
| Google – Sheets / Apps Script / Drive | Foglio del check-in, foglio prenotazioni (lettura dal check-in), registro (Apps Script), TXT su Drive creati dallo script del gestore | T8, T10 | [DA VERIFICARE] |
| Google – Places API | Recensioni (chiamata dal server, nessun dato dei visitatori) | — | — |
| Google Maps | Solo link che si aprono su clic; nessuna mappa incorporata | — | — |
| Stripe | Pagamento delle prenotazioni e dell'imposta di soggiorno | T4, T12 | [DA VERIFICARE] |
| Browserless | Generazione del PDF di riepilogo del check-in | HTML con i dati anagrafici di tutti gli ospiti (senza immagini) | **Sì, verificabile:** l'endpoint nel codice è `production-sfo.browserless.io` (regione indicata "sfo", San Francisco, USA). Garanzia del trasferimento [DA VERIFICARE]. Alternativa tecnica: endpoint europeo del fornitore, se disponibile nel piano |
| Trentino Guest Card (Trentino Marketing) | Emissione della card | T7 | [DA VERIFICARE] |
| Polizia di Stato – Alloggiati Web | Destinatario istituzionale | T10, T14 | — |
| Provincia autonoma di Trento – ISTAT Alloggi | Destinatario istituzionale | T15 | — |
| Booking.com, Airbnb | Canali di prenotazione; scambio dei calendari iCal | T8, T9 | Titolari dei dati dei propri clienti secondo le proprie informative [DA VERIFICARE] |
| Siti turistici ufficiali (visittrentino.info, visittrento.it, ecc.) | Immagini di copertina di alcune schede di "Luoghi di interesse" e "Convenzioni": `api/x?a=og` risponde con un **redirect 302**, quindi il browser scarica l'immagine dal sito esterno | IP del visitatore | [DA VERIFICARE] |

**Non più presente:** il riquadro finale sulla verifica dell'identità nel check-in (rimosso su richiesta del gestore). Le chiavi `stepFinal.identita*` restano in `i18n.js` ma non sono usate.

---

## 4. Conservazione realmente applicata

| Dato | Durata applicata dal codice | Note |
|---|---|---|
| Prenotazioni del sito confermate o annullate (nome, email, telefono…) in KV `bkh` | **Nessuna cancellazione automatica** | Periodo da decidere [DA COMPLETARE]. Va considerato anche quanto serve a fini fiscali e contabili |
| Richieste di ricevuta (`ric`) | **30 giorni dopo l'invio**; 12 mesi se mai inviata (pulizia alla lettura dell'elenco in Gestione) | Il file della ricevuta non si conserva: parte solo in allegato |
| Checkout abbandonati (`in_attesa`) | Eliminati dopo **3 giorni**, alla prima sincronizzazione utile | `bkPurgePending` |
| Hold sulle notti | Circa 35 minuti (`holdTtlSec` 2110 s) | Contengono solo codice e date |
| Token di accesso (solo hash) | Fino a check-out + 30 giorni; sessione 4 ore | Prompt 2 |
| Contatori del rate limit | 10–30 minuti per IP; 24 ore per codice | |
| Guest Card (`gc:<codice>`, `gc:manual`) | **Nessuna scadenza** (`gc:manual`: ultime 300 voci) | Periodo da decidere [DA COMPLETARE] |
| Copia del registro (`reg`) e dei calendari (`ics:*`) | 90 giorni, sovrascritti a ogni aggiornamento | |
| Marcatori Alloggiati (admin) e ISTAT | 7 e 70 giorni, solo impronte | |
| Cache recensioni Google | Sovrascritta ogni 24 h, senza scadenza | |
| Check-in: dati temporanei su Neon | Non pagati: scadenza 2 h, cancellazione fisica entro circa 24 h (cron). Pagati: cancellati appena il foglio è scritto e l'email al gestore è partita; al massimo 72 h | Prompt 1 |
| Check-in: registro tecnico | 30 giorni | |
| Check-in: righe nel foglio Google, TXT su Drive, email con immagini e PDF (casella del gestore, "Posta inviata" del mittente, cestino, copie scaricate) | **Nessuna cancellazione automatica.** Il gestore ha deciso di cancellarli **entro 24 ore dalla registrazione** su Alloggiati Web [GESTORE] | La cancellazione è **manuale** (§ 6). Il Garante indica la cancellazione appena generata la ricevuta |
| Ricevuta di Alloggiati Web | 5 anni (nota del Garante) | Conservazione manuale; il sistema non la gestisce |
| Dati fiscali e contabili | [DA COMPLETARE] con il commercialista | La vecchia `privacy.html` indicava "10 anni (art. 2220 c.c.)": non è verificabile dal codice e dipende dal regime fiscale del titolare, quindi è stato sostituito da un segnaposto |
| Stripe, Gmail, Vercel (log), Upstash, Neon, GitHub | Secondo le impostazioni e i contratti dei fornitori [DA VERIFICARE] | |
| Browser | `sessionStorage` `lc_acc`, `lc_lang`, `lc_pwa_no` e `lc_t`: fino alla chiusura della scheda. Area clienti installabile: Cache Storage `lc-area-v1` con i soli file della pagina (nessun dato della prenotazione). Check-in: memoria locale `columbera_lingua` (solo la lingua scelta) senza scadenza | |

---

## 5. Controlli di sicurezza e accesso (dal codice)

- **Accesso degli ospiti:** codice + token (128 bit, hash su KV) oppure codice + data di arrivo + email; rate limit; risposte uniformi. Vedi `sicurezza-accessi.md`.
- **Pannello admin:**
  - login con utente e password da variabili d'ambiente;
  - token HMAC di 8 ore;
  - rate limit sui fallimenti.
- **Webhook Stripe** con firma verificata e passi idempotenti, in entrambi i repository.
- **Header di sicurezza** in `vercel.json` del sito.
- **Check-in:**
  - CORS limitata a `spaceestate.github.io`;
  - endpoint admin protetti da `x-admin-secret`;
  - immagini validate per tipo reale e dimensione;
  - metadati Stripe senza anagrafiche;
  - log senza dati personali nei moduli riscritti nel Prompt 1.
- **Segnalati e non corretti** (fuori ambito: qui si toccano solo testi e documenti):
  - `Checkin/api/verifica-prenotazione.js` scrive nei log il numero di prenotazione e i dati trovati, restituisce `error.message` al client e non ha un rate limit (chi prova codici può ottenere data, appartamento e numero di ospiti);
  - `get-session.js` restituisce `error.message`;
  - gli endpoint diagnostici del check-in (`check-webhook-config`, `diagnose-missing-emails`, `retry-email-from-stripe`, `test-email`) accettano la chiave admin anche nell'URL (`?key=`);
  - `successUrl` del check-in è fornita dal browser.

---

## 6. Procedure manuali rimaste a carico del titolare o del gestore

1. **Verifica dell'identità** all'arrivo, di persona o con un videocollegamento idoneo all'ingresso (CdS 9101/2025).

   L'email di benvenuto del check-in contiene i **codici della cassetta portachiavi**: il flusso permette quindi un ingresso senza incontro. Se la verifica non avviene, l'obbligo **non è assolto dal modulo**. È un **adempimento organizzativo da definire** [DA COMPLETARE: modalità adottata].
2. **Caricamento del TXT** su Alloggiati Web, oppure invio dal pannello admin, e **controllo della ricevuta**.
3. **Conservazione della ricevuta** per 5 anni.
4. **Entro 24 ore dalla registrazione** [GESTORE], da eseguire tutte:
   - cancellare le righe degli ospiti dal foglio del check-in;
   - cancellare il TXT dalla cartella Drive e dal cestino di Drive;
   - cancellare le email con le immagini e il PDF dalla casella del destinatario (`EMAIL_PROPRIETARIO`), da "Posta inviata" della casella mittente (`EMAIL_USER`), dai cestini di entrambe e da ogni copia scaricata o sincronizzata (telefono, computer, backup).
5. **Dati storici:**
   - righe del foglio del check-in precedenti a questa procedura;
   - email e PDF già ricevuti;
   - metadati `resp_*` delle vecchie sessioni Stripe;
   - prenotazioni e Guest Card in KV senza scadenza.
6. **Istruzioni scritte** a chi gestisce check-in e caselle email: non fare né trattenere copie dei documenti (nota del Garante).
7. **Gestione delle richieste** degli interessati (accesso, cancellazione, ecc.) e delle **violazioni di dati** (notifica al Garante entro 72 ore dove richiesto, comunicazione agli interessati se il rischio è elevato).

## 7. Rischi residui principali

- **Foto del documento via email** (modalità temporanea mantenuta su indicazione del gestore). Copie fuori dal controllo del sistema (casella, inviati, cestino, backup, dispositivi); transito via SMTP. La foto è **obbligatoria** nel modulo, anche se la legge non richiede copie dei documenti.

  Alternative in ordine di minor rischio:
  1. non raccoglierla più: i dati sono già inseriti e il documento va comunque visto all'arrivo;
  2. renderla facoltativa;
  3. tenerla cifrata nel database, visibile solo da una pagina admin, con cancellazione automatica.
- **Verifica *de visu*** non garantita dal processo attuale (codici della cassetta via email).
- **Dati anagrafici duplicati** nel foglio del check-in e nei TXT, con cancellazione solo manuale.
- **Browserless:** server di Amsterdam (UE, `production-ams`): nessun trasferimento extra SEE per il PDF. Resta da verificare il contratto di trattamento dati (DPA) con il fornitore.
- **Conservazione illimitata** di prenotazioni, Guest Card ed email nel KV e nelle caselle.
- **Fornitori senza DPA verificato** (art. 28) e regioni dei server non verificate.
- **Richieste a terzi dal browser:**
  - immagini dei siti turistici in alcune schede.

  Una possibile riduzione: font in self-hosting anche nel check-in, come già fatto per il sito, e immagini salvate in `img/`.
- **Registro dei trattamenti (art. 30):** il trattamento degli ospiti non è occasionale, quindi l'esenzione per chi ha meno di 250 dipendenti **probabilmente non si applica**. Da valutare con un professionista. Questo documento può servire come base, ma **non è** il registro.

## 8. Verifiche che richiedono accesso ad account reali

1. **Contratti e DPA** di Vercel, Upstash, Neon, GitHub, Google (Workspace o account personale: cambia il quadro contrattuale), Stripe, Browserless e Trentino Marketing. Per ciascuno vanno anche ricavati i link alle informative.
2. **Regioni e trasferimenti:** progetto Vercel (regione delle funzioni), database Upstash, progetto Neon, piano ed endpoint Browserless.
3. **Permessi su Drive e Sheets:**
   - fogli del check-in e delle prenotazioni e cartella "Check-in › Polizia di Stato" condivisi solo con le persone necessarie e con l'account di servizio;
   - mai "chiunque abbia il link".
4. **Gmail:**
   - accesso con verifica in due passaggi;
   - password per app limitate;
   - inoltri automatici;
   - dispositivi sincronizzati.
5. **Log di Vercel:** durata della conservazione prevista dal piano.
6. **Stripe:** conservazione, eventuali Radar o cookie della pagina Checkout, metadati storici.
7. **Script Apps Script** (non presente nel repository):
   - quali colonne legge e scrive;
   - dove salva il TXT;
   - se cancella qualcosa.
8. **Contenuto reale dei feed iCal** di Airbnb e Booking (descrizioni).
9. **Ruolo del gestore** rispetto al titolare: accordo ex art. 28 o altra forma.
10. **Riferimenti normativi** dell'imposta di soggiorno e della rilevazione ISTAT in provincia di Trento.
