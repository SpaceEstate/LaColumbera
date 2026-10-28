# Sicurezza degli accessi degli ospiti – La Columbera

Branch: `gdpr/sicurezza-accessi`. Ambito: API in `api/` e pagine dell'area clienti e della Guest Card.
Sono esclusi l'informativa privacy e il flusso di check-in (repository `Checkin`).

Questo documento descrive le misure tecniche applicate al codice. Non è una valutazione di conformità al GDPR.

---

## 1. Modello di accesso

Scelta del titolare (ottobre 2026): **per entrare basta il codice della prenotazione**, senza data di arrivo né email.

| Elemento | Ruolo | Dà accesso da solo? |
|---|---|---|
| **Codice di una prenotazione del sito** (13 caratteri casuali, es. `558R TE56 487A9`) | Riferimento della prenotazione e chiave dell'area clienti | Sì, fino a **30 giorni dopo il check-out** |
| **Numero di prenotazione Booking.com / Airbnb** (dal foglio, es. `6877180932`, `HMSEDESZCW`) | Riferimento del portale, letto dal registro del foglio | Sì, fino a **7 giorni dopo il check-out** |
| **Token di accesso** (128 bit casuali) | Arriva nel link della mail di conferma e nella risposta del checkout; dopo l'accesso con il codice il server rilascia un token di sessione (4 ore) | Sì, solo per quella prenotazione e fino alla scadenza |

- **Codice del sito:** `newBookingCode()` in `api/_accesso.js`: 13 caratteri dall'alfabeto di Crockford (`0-9` e lettere maiuscole senza `I`, `L`, `O`, `U`), da `crypto.randomBytes`, circa **65 bit**. Con i limiti di frequenza del paragrafo 3 non si indovina. Resta l'identificativo usato ovunque (KV, foglio, Stripe, Gestione): il vecchio codice di 6 caratteri esadecimali non esiste più per le prenotazioni nuove e non c'erano prenotazioni del sito con quel formato.
- **Numero del portale:** è più corto e non l'abbiamo scelto noi (Booking: 10 cifre). Lo proteggono i limiti per IP, il tetto generale sui codici sbagliati e la finestra di validità più breve. Chi lo conosce (un compagno di viaggio, chi ha visto la conferma di Booking) vede date, appartamento e numero di ospiti, nessun dato personale.
- **Come si scrive:** maiuscole o minuscole, con o senza spazi, punti e trattini (`6877.180.932` come lo mostra Booking, `558r-te56-487a9`); per un codice del sito anche `O` al posto di `0` e `I`/`L` al posto di `1` (`codeCandidates()`). Si cercano al massimo 3 varianti, prima in KV e nell'istantanea del foglio, poi **una sola** domanda in diretta allo script del foglio.
- **Dove si cerca** (`findByCode` in `api/_avail.js`): prima le prenotazioni del sito in KV (hanno stato del pagamento e importo), poi il registro del foglio (Booking, Airbnb, manuali; anche le prenotazioni del sito vi sono copiate), infine lo script del foglio in diretta per un codice appena arrivato.
- **Prenotazioni non confermate o annullate:** l'area clienti risponde come per un codice inesistente.

Il controllo avviene **sul server**, in `api/_accesso.js` → `authorize()`. Lo usano le azioni di `api/x.js`:

- `mie`: area clienti;
- `gc_check` e `gc_issue`: Trentino Guest Card;
- `checkout_cancel` e `checkout_status`: richiedono il token del checkout (invariato).

La CORS non viene usata come controllo di accesso.

Ogni fallimento produce **la stessa risposta**: 404 con il messaggio "Prenotazione non trovata…". Non è quindi possibile capire se un codice esiste.

### Flusso per l'ospite

1. **Prenotazione dal sito.** Il checkout restituisce `{code, url, t}`. La pagina salva `{c, t}` in `sessionStorage` (chiave `lc_acc`) e apre Stripe. Al ritorno la pagina mostra il codice a gruppi.
2. **Mail di conferma** (webhook Stripe, oppure conferma admin di una prenotazione "da verificare"). Contiene il codice a gruppi e il link `…/area-clienti.html#c=CODICE&t=TOKEN`. Il frammento `#…` **non viene inviato** al server, ai log di Vercel o ai siti esterni (Referer). La pagina lo legge, lo sposta in `sessionStorage` e lo cancella dall'indirizzo con `history.replaceState`.
3. **Codice digitato.** Un solo campo. Se il codice è giusto il server restituisce la prenotazione, il codice registrato e un token di sessione di 4 ore, che la pagina conserva in `sessionStorage` per le richieste successive (Guest Card). A sessione scaduta la pagina rientra da sola con il codice.
4. **Messaggio di benvenuto** (Booking/Airbnb, WhatsApp): link `…/area-clienti.html#k=CODICE`. Come per il link della mail, il codice è nel frammento e sparisce dall'indirizzo.
5. **Guest Card.** Dall'area clienti la prenotazione è già riconosciuta (token in sessione); altrimenti basta il codice.

### Compatibilità

- Le prenotazioni esistenti non vanno modificate e non serve alcuna migrazione dei dati in KV.
- I link già inviati per email (`#c=…&t=…`) continuano a funzionare.
- I link con il codice nell'indirizzo (`area-clienti.html?code=XXX`, `guest-card.html?code=XXX`) aprono la pagina con il codice precompilato e lo tolgono dall'indirizzo; non entrano da soli (un codice nella query arriverebbe ai log del server).
- Campi in più inviati da pagine vecchie (data di arrivo, email) vengono ignorati.
- La vecchia chiave `sessionStorage.lc_code` viene cancellata al caricamento della pagina.

---

## 2. Token: generazione, conservazione e scadenza

- **Generazione:** `crypto.randomBytes(16)` (128 bit), codificato in base64url.
- **Conservazione sul server:** solo l'hash SHA-256 del token. Chiave KV `tok:<sha256>`, valore `{c: CODICE, k: tipo}`, con `EX`. Il token in chiaro non viene salvato né registrato nei log.
- **Scadenze:**
  - token della mail o del checkout: fino a **30 giorni dopo il check-out**, con un minimo di 1 giorno e un massimo di 400 giorni;
  - token di sessione (dopo l'accesso con il codice): **4 ore**.
- **Verifica:** formato `^[A-Za-z0-9_-]{22,64}$`, poi lettura di `tok:<hash>` e confronto del codice. Un token valido per la prenotazione A non funziona per la prenotazione B.
- **Lato client:** solo `sessionStorage`, che si cancella alla chiusura della scheda. Niente `localStorage` e niente cookie.

---

## 3. Rate limit (Upstash/KV già in uso, nessun servizio aggiuntivo)

I contatori usano una finestra fissa: `SET k 0 EX finestra NX` seguito da `INCR k`, in un'unica pipeline. L'IP è salvato come hash troncato (`sha256('ip|'+ip)`), mai in chiaro.

| Regola | Soglia | Cosa conta |
|---|---|---|
| `lookupIp` | 60 ogni 10 min per IP | tutte le consultazioni (`mie`, `gc_check`, `gc_issue`) |
| `failIp` | 10 ogni 15 min per IP | tentativi falliti (codice sbagliato o token non valido) |
| `failAll` | 300 l'ora, **tutti gli IP insieme** | codici sbagliati (non i token): ferma i tentativi distribuiti su molti indirizzi. Superato il tetto, l'accesso con il solo codice aspetta la fine dell'ora; chi ha un token (link della mail, sessione aperta) entra comunque |
| `checkoutIp` | 10 ogni 30 min per IP | avvii di pagamento (evita l'accumulo di blocchi sulle notti) |
| `loginIp` | 10 ogni 15 min per IP | login admin falliti |
| `statusIp` | 60 ogni 10 min per IP | controlli «com'è andato il pagamento» (`checkout_status`, richiede il token del pagamento) |

- Superata una soglia la risposta è **429**, con `Retry-After` e un messaggio uniforme.
- Il backoff è la finestra stessa: non si riprova prima della scadenza.
- **Utente legittimo:** un errore di battitura costa un solo tentativo su 10.
- **Fail-open:** se KV non risponde, i limiti non bloccano e viene scritto un log senza dati. Le prenotazioni dipendono comunque da KV.

Per modificare le soglie si interviene sull'oggetto `RL` in `api/_accesso.js`; le finestre di validità sono `CODE_DAYS_SITO` e `CODE_DAYS_PORTALE`.

---

## 4. Risposte, log ed errori

- **`mie`:** `{t, code, prenotazioni:[{code, id, da, a, ospiti, notti, stato}], soggiorno}`. `code` è il codice registrato (la pagina lo usa con il token). Le prenotazioni non confermate rispondono 404. Nessun nome, email, telefono o importo di altri ospiti.
- **`soggiorno`** (area ospiti, `soggiornoOut` in `api/x.js`): appartamento (nome, sottotitolo, prima foto), date, notti, ospiti, origine (sito, booking, airbnb, manuale), orari di check-in e check-out, pagamento (solo prenotazioni del sito: totale, pagato sì/no e data, conto salvato al checkout), testi per l'ospite dell'appartamento, numero WhatsApp. Le **informazioni riservate** (Wi-Fi) arrivano solo da `infoGiorni` giorni prima dell'arrivo fino al giorno della partenza; prima c'è solo la data da cui compariranno. I testi per gli ospiti e le informazioni riservate **non** sono nella configurazione pubblica (`a=cfg`, test S17). I codici della cassetta delle chiavi non passano dall'area clienti: li manda il check-in online, dopo la registrazione degli ospiti.
- **`gc_check` / `gc_issue`:** prenotazione ridotta a `{id, da, a, notti, ospiti, needsEmail}`. Card ridotta a `{gc_id, stato, valid_from, valid_to, ospiti, email mascherata "ma***@dominio"}`. La risposta grezza di TGC (QR e dati personali) non viene salvata e non viene restituita.
- **Errori verso il client:** generici ("Errore interno: riprova tra qualche minuto.", "Non è stato possibile avviare il pagamento…", "Webhook Error: firma non valida"). I messaggi di Stripe e le eccezioni interne non vengono più restituiti.
- **Log:** solo l'azione e un messaggio tecnico troncato a 160 caratteri. Per Stripe si registra solo `e.type` o `e.code`. Nessun codice, token, email, data o IP (lo verifica il test S7, anche con un codice sbagliato).
- **Calendario per Booking e Airbnb** (`?for=site`): il codice è la chiave dell'area clienti e non deve arrivare alle piattaforme. L'UID dell'evento è un'impronta SHA-256 del codice (`sito-<20 cifre esadecimali>@lacolumbera`), stabile nel tempo (test S16). Il calendario personale del titolare, protetto dalla chiave, mostra il codice.
- **Indirizzo di ritorno da Stripe:** contiene il codice nella query (`?pagamento=successo&code=…`), come prima. Lo vedono Stripe (che lo ha già nei metadati) e i log di Vercel del titolare; la pagina lo toglie subito dall'indirizzo. La Referrer-Policy impedisce che arrivi ad altri siti.
- **Body:** oltre 20.000 caratteri risponde 413, tranne le azioni admin `save` e `up`. Per nome, email e telefono del checkout viene controllato il tipo.

## 5. Altri controlli

- **Webhook Stripe** (`api/stripe-webhook.js`):
  - firma verificata con `constructEvent`;
  - idempotenza a passi, con `SET NX` e marcatori di completamento, quindi nessuna mail duplicata se Stripe ripete l'evento;
  - il token della mail viene creato dentro il passo dell'invio.
- **iCal personale:** la chiave è confrontata in modo timing-safe.
- **Login admin:** rate limit sui fallimenti e confronto timing-safe di utente e password.
- **Header** (`vercel.json`, nuovo):
  - `X-Content-Type-Options: nosniff`;
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - `X-Frame-Options: SAMEORIGIN`;
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`;
  - cache di 30 giorni su `/fonts/`.
- **Link esterni dall'area clienti:** `rel="noopener noreferrer"`.
- **Segreti nel frontend:** nessuno. Lo verifica il test S14, che cerca chiavi Stripe `sk_`, `rk_`, `whsec_` e token in `js/` e nelle pagine.
- **Gestione, salvataggio delle impostazioni** (`api/x.js`, azione `save`): il salvataggio porta la versione aperta (`cfg:rev`); controllo e scrittura avvengono in un solo script Lua, quindi un salvataggio più vecchio non sovrascrive mai uno più recente (409), anche con due richieste nello stesso istante. Le foto non più usate si cancellano solo dopo un salvataggio riuscito. Test S18.
- **Email dei messaggi**: contengono il testo del messaggio (scelta del titolare). Il pulsante «Rispondi» dell'ospite porta un token nuovo nel frammento `#` (`…#c=…&t=…&s=messaggi`, mai nell'indirizzo che arriva al server) e apre solo i messaggi di quella prenotazione; quello del titolare apre la Gestione, che chiede il login se il dispositivo non ce l'ha. Un avviso per il primo messaggio non letto, poi al massimo uno ogni 15 minuti per conversazione. Test M3, M12, W22.
- **Pulizie**: il testo da mandare a chi pulisce non contiene nomi, email, telefoni né codici (test W21); letti e note solo con il login (test S20).
- **Luoghi e Convenzioni** (contenuto pubblico modificabile dal titolare): il server salva solo testo; link solo `http(s)://` o pagine del sito (niente `javascript:`); foto solo `img/…` del sito o caricate su Vercel Blob; l'azione pubblica `a=dintorni` restituisce solo quelle schede. Le pagine le scrivono con `esc()` e ricontrollano link e foto. Test S19 e W19.

## 6. Cookie, storage e risorse esterne (dopo le modifiche)

| Tipo | Nome | Dove | Scopo |
|---|---|---|---|
| sessionStorage | `lc_acc` | area clienti, Guest Card, checkout | codice e token di accesso dell'ospite, fino alla chiusura della scheda |
| sessionStorage | `lc_lang`, `lc_pwa_no` | area clienti | lingua scelta; invito «Aggiungi alla schermata Home» chiuso |
| Cache Storage | `lc-area-v1` | area clienti (service worker `sw.js`, ambito `/area-clienti`) | solo i file della pagina (HTML, CSS, JS, logo) per aprirla senza rete. Le risposte di `api/` non vengono mai salvate |
| sessionStorage | `lc_t` | admin | token della sessione admin (invariato) |
| Cookie | nessuno | – | – |
| localStorage | nessuno | – | – |
| Tracking/analytics | nessuno | – | – |
| Font | Fraunces, Manrope, Pinyon Script | `/fonts/`, `css/fonts.css` | self-hosting da @fontsource 5.3.0. Licenza SIL OFL 1.1, testi in `fonts/OFL-*.txt` |

- **Risorse esterne ancora presenti:**
  - pagina di pagamento Stripe (hosted Checkout, aperta solo su azione dell'utente);
  - link testuali a siti turistici e a Google (recensioni e mappe), senza script né iframe caricati.

---

## 7. Cosa è stato verificato e dove

**Nel codice (test automatici, `tests/sim/`, KV simulato).** Comandi: `node tests/sim/<nome>.js`, con `NODE_PATH` che punta a wasmoon e, per `ui.js`, `JSDOM_PATH` che punta a jsdom.

| Test | Esito |
|---|---|
| `sicurezza.js` S1–S20 (S2, S4, S5 riscritti per l'accesso con il solo codice; S15–S20 nuovi) | 20 ok |
| `ui.js` (U4c, U4d riscritti: un solo campo; U4e, U4f: codice a gruppi; U5, U11, W12, W14 adattati alla nuova Gestione; W14–W22 nuovi) | 72 ok |
| `messaggi.js` (M3 riscritto: le email ora hanno il testo e «Rispondi»; M12 nuovo) | 12 ok |
| `sito.js`, `informativa.js` | 8 ok, 5 ok |
| `scenarios.js` | 15 ok; 18 SKIP perché nel repository manca `google-apps-script.gs`, come già prima delle modifiche |
| `pagamenti.js` | 18 ok |
| `preavviso.js` | 12 ok |
| `adempimenti.js` | 40 ok |
| `istat.js` | 30 ok |

Test di mutazione: con `verify` che restituisce sempre vero falliscono 2 test; con l'annullo senza controllo del token fallisce S8.

**Nel browser (Chromium headless, server statico locale, 390 px e 1280 px):**

- font caricati dal sito, **zero richieste esterne**;
- nessun overflow orizzontale su index, area clienti e Guest Card.

**Non verificato: serve un controllo su account o dispositivo reale.**

- Safari su iPhone/iPad: link `#c=…&t=…` dalla app Mail, link `#k=…` da WhatsApp o dall'app Booking/Airbnb, `sessionStorage` dopo il ritorno da Stripe.
- Header effettivi dopo il deploy di anteprima su Vercel.
- Stripe in modalità test: checkout, webhook firmato e mail con il nuovo link.
- Upstash reale (comandi della pipeline `SET NX` + `INCR`).
- Invio reale delle email, emissione reale della Guest Card con TGC, lettura del foglio Booking/Airbnb.

## 8. Procedure manuali

1. **Deploy di anteprima** del branch su Vercel. Le variabili di produzione non vanno toccate.
2. **Prenotazione di prova con Stripe in modalità test**, con dati sintetici e un indirizzo email di prova sotto il proprio controllo. Verificare:
   - ritorno all'area clienti già autenticata;
   - mail con il link `#c=…&t=…`;
   - apertura del link su iPhone (Safari) e su desktop, con l'URL ripulito dopo il caricamento.
3. **Codice da solo:** il codice della mail (anche in minuscolo o con gli spazi) e il numero di una prenotazione Booking/Airbnb del foglio aprono l'area; un codice sbagliato dà "Prenotazione non trovata".
4. **Rate limit:** 11 tentativi errati in 15 minuti dallo stesso dispositivo devono dare il messaggio "Troppi tentativi…". Il link della mail deve continuare a funzionare.
5. **Header:** DevTools → Network → risposta di una pagina, oppure un servizio come securityheaders.com sull'URL di anteprima.
6. **Calendario per Booking e Airbnb:** aprire `…/api/x?a=ical&id=torre&for=site` e controllare che non compaia nessun codice di prenotazione.

## 9. Rischi residui

- **Accesso con il solo codice** (scelta del titolare). Chi conosce il codice (un compagno di viaggio, chi ha visto la mail o la conferma di Booking) vede date, appartamento e numero di ospiti e, per una prenotazione del foglio senza email, può richiedere la Guest Card verso un'email a sua scelta. Per il codice del sito indovinare è impraticabile (~65 bit); per il numero Booking/Airbnb (più corto) il rischio è limitato da limiti per IP, tetto generale e finestra di 7 giorni. Il codice non si può revocare: è l'identificativo della prenotazione.
- **Tetto generale sui codici sbagliati:** chi provasse molti codici da molti indirizzi può rallentare per un'ora l'accesso con il solo codice anche agli ospiti veri; il link della mail e le sessioni già aperte restano utilizzabili.
- **Limiti per IP:** sulle reti condivise (Wi-Fi di hotel, CGNAT degli operatori mobili) più ospiti condividono lo stesso contatore.
- **Fail-open dei limiti** se KV non è raggiungibile.
- **Il link o il codice della mail inoltrati** a terzi danno accesso fino a 30 giorni dopo il check-out. La mail e l'area clienti avvisano che valgono come una chiave.
- **Nessuna Content-Security-Policy:** le pagine usano script e stili inline, quindi una CSP rigida richiede un intervento separato. In caso di XSS il `sessionStorage` sarebbe leggibile.
- **Token admin `lc_t` in `sessionStorage`:** invariato.
- **Pagina `privacy.html`:** aggiornata nel Prompt 3 (branch `gdpr/informativa`): font del sito locali, `sessionStorage` con codice e chiave di accesso. Vedi `inventario-trattamenti.md`.
- **Segnalati e non modificati** (fuori ambito o in un altro repository):
  - messaggi diagnostici di `gc_oauth_callback` (raggiungibili solo con uno `state` valido);
  - repository Checkin: `ADMIN_SECRET` accettato anche via `?key=`, `successUrl` fornita dal client (ora limitata agli indirizzi del check-in). Google Fonts è stato sostituito da caratteri sul sito.
