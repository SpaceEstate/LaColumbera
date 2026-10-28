# Sicurezza degli accessi degli ospiti – La Columbera

Branch: `gdpr/sicurezza-accessi`. Ambito: API in `api/` e pagine dell'area clienti e della Guest Card.
Sono esclusi l'informativa privacy e il flusso di check-in (repository `Checkin`).

Questo documento descrive le misure tecniche applicate al codice. Non è una valutazione di conformità al GDPR.

---

## 1. Modello di accesso

| Elemento | Ruolo | Dà accesso da solo? |
|---|---|---|
| **Codice prenotazione** (`LC-…`, o il codice Booking/Airbnb del foglio) | Identificativo leggibile, da comunicare a voce o per telefono | **No** |
| **Token di accesso** (128 bit casuali) | Arriva nel link della mail di conferma e nella risposta del checkout | Sì, solo per quella prenotazione e fino alla scadenza |
| **Codice, data di arrivo ed email della prenotazione** | Accesso manuale: prenotazioni dal foglio, prenotazioni create prima di questa versione, link perso | Sì, solo se tutti i dati corrispondono, entro 7 giorni dal check-out. Rilascia un token di sessione |

L'email è richiesta solo se la prenotazione ne ha una. Le righe del foglio Booking/Airbnb di solito non ce l'hanno, quindi bastano codice e data di arrivo.

Il controllo avviene **sul server**, in `api/_accesso.js` → `authorize()`. Lo usano le azioni di `api/x.js`:

- `mie`: area clienti;
- `gc_check` e `gc_issue`: Trentino Guest Card;
- `checkout_cancel`: richiede il token; senza token risponde `{ok:1}` e non fa nulla.

La CORS non viene usata come controllo di accesso.

Ogni fallimento produce **la stessa risposta**: 404 con il messaggio "Prenotazione non trovata…". Non è quindi possibile capire se un codice esiste.

### Flusso per l'ospite

1. **Prenotazione dal sito.** Il checkout restituisce `{code, url, t}`. La pagina salva `{c, t}` in `sessionStorage` (chiave `lc_acc`) e apre Stripe. Al ritorno l'area clienti si apre già autenticata.
2. **Mail di conferma** (webhook Stripe, oppure conferma admin di una prenotazione "da verificare"). Il link è `…/area-clienti.html#c=CODICE&t=TOKEN`. Il frammento `#…` **non viene inviato** al server, ai log di Vercel o ai siti esterni (Referer). La pagina lo legge, lo sposta in `sessionStorage` e lo cancella dall'indirizzo con `history.replaceState`.
3. **Accesso manuale.** Form con codice, data di arrivo ed email (facoltativa). Se il controllo riesce, il server restituisce un token di sessione di 4 ore, che la pagina conserva in `sessionStorage`.
4. **Guest Card.** Il link dall'area clienti non contiene più il codice nell'URL. Il token viene letto dalla sessione. In alternativa si usa lo stesso form con codice e data di arrivo.

### Compatibilità e migrazione

- Le prenotazioni esistenti non vanno modificate e non serve alcuna migrazione dei dati in KV.
- Le prenotazioni create prima di questa versione non hanno un token. Si usa l'accesso manuale con codice, data di arrivo ed email.
- I vecchi link `area-clienti.html?code=XXX` e `guest-card.html?code=XXX` continuano ad aprire la pagina. Il codice viene precompilato e rimosso dall'URL. L'ospite inserisce la data di arrivo.
- La vecchia chiave `sessionStorage.lc_code` viene cancellata al caricamento della pagina.
- Le mail già inviate con il vecchio link portano all'area clienti con il form manuale.

---

## 2. Token: generazione, conservazione e scadenza

- **Generazione:** `crypto.randomBytes(16)` (128 bit), codificato in base64url.
- **Conservazione sul server:** solo l'hash SHA-256 del token. Chiave KV `tok:<sha256>`, valore `{c: CODICE, k: tipo}`, con `EX`. Il token in chiaro non viene salvato né registrato nei log.
- **Scadenze:**
  - token della mail o del checkout: fino a **30 giorni dopo il check-out**, con un minimo di 1 giorno e un massimo di 400 giorni;
  - token di sessione (accesso manuale): **4 ore**;
  - accesso manuale consentito solo fino a **7 giorni dopo il check-out**.
- **Verifica:** formato `^[A-Za-z0-9_-]{22,64}$`, poi lettura di `tok:<hash>` e confronto del codice. Un token valido per la prenotazione A non funziona per la prenotazione B.
- **Email nell'accesso manuale:** confrontata con `timingSafeEqual` sugli hash, senza distinzione tra maiuscole e minuscole.
- **Lato client:** solo `sessionStorage`, che si cancella alla chiusura della scheda. Niente `localStorage` e niente cookie.

---

## 3. Rate limit (Upstash/KV già in uso, nessun servizio aggiuntivo)

I contatori usano una finestra fissa: `SET k 0 EX finestra NX` seguito da `INCR k`, in un'unica pipeline. L'IP è salvato come hash troncato (`sha256('ip|'+ip)`), mai in chiaro. Il codice prenotazione è anch'esso salvato come hash.

| Regola | Soglia | Cosa conta |
|---|---|---|
| `lookupIp` | 60 ogni 10 min per IP | tutte le consultazioni (`mie`, `gc_check`, `gc_issue`) |
| `failIp` | 10 ogni 15 min per IP | tentativi falliti |
| `failCode` | 10 ogni 24 h per codice | tentativi falliti **senza token** sullo stesso codice. Il token resta utilizzabile |
| `checkoutIp` | 10 ogni 30 min per IP | avvii di pagamento (evita l'accumulo di blocchi sulle notti) |
| `loginIp` | 10 ogni 15 min per IP | login admin falliti |
| `statusIp` | 60 ogni 10 min per IP | controlli «com'è andato il pagamento» (`checkout_status`, richiede il token del pagamento) |

- Superata una soglia la risposta è **429**, con `Retry-After` e un messaggio uniforme che invita ad aprire il link della mail.
- Il backoff è la finestra stessa: non si riprova prima della scadenza.
- **Utente legittimo:** chi usa il link della mail non consuma il contatore `failCode`. Un errore di battitura costa un solo tentativo su 10.
- **Fail-open:** se KV non risponde, i limiti non bloccano e viene scritto un log senza dati. Le prenotazioni dipendono comunque da KV.

Per modificare le soglie si interviene sull'oggetto `RL` in `api/_accesso.js`.

---

## 4. Risposte, log ed errori

- **`mie`:** `{t, prenotazioni:[{code, id, da, a, ospiti, notti, stato}]}`. Le prenotazioni non confermate rispondono 404. Nessun nome, email, telefono o importo di altri ospiti.
- **`gc_check` / `gc_issue`:** prenotazione ridotta a `{id, da, a, notti, ospiti, needsEmail}`. Card ridotta a `{gc_id, stato, valid_from, valid_to, ospiti, email mascherata "ma***@dominio"}`. La risposta grezza di TGC (QR e dati personali) non viene salvata e non viene restituita.
- **Errori verso il client:** generici ("Errore interno: riprova tra qualche minuto.", "Non è stato possibile avviare il pagamento…", "Webhook Error: firma non valida"). I messaggi di Stripe e le eccezioni interne non vengono più restituiti.
- **Log:** solo l'azione e un messaggio tecnico troncato a 160 caratteri. Per Stripe si registra solo `e.type` o `e.code`. Nessun codice, token, email, data o IP.
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

## 6. Cookie, storage e risorse esterne (dopo le modifiche)

| Tipo | Nome | Dove | Scopo |
|---|---|---|---|
| sessionStorage | `lc_acc` | area clienti, Guest Card, checkout | codice e token di accesso dell'ospite, fino alla chiusura della scheda |
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
| `sicurezza.js` S1–S14 (nuovo) | 14 ok |
| `ui.js` | 41 ok (prima 38) |
| `scenarios.js` | 15 ok; 18 SKIP perché nel repository manca `google-apps-script.gs`, come già prima delle modifiche |
| `preavviso.js` | 12 ok |
| `adempimenti.js` | 40 ok |
| `istat.js` | 30 ok |

Test di mutazione: con `verify` che restituisce sempre vero falliscono 2 test; con l'annullo senza controllo del token fallisce S8.

**Nel browser (Chromium headless, server statico locale, 390 px e 1280 px):**

- font caricati dal sito, **zero richieste esterne**;
- nessun overflow orizzontale su index, area clienti e Guest Card.

**Non verificato: serve un controllo su account o dispositivo reale.**

- Safari su iPhone/iPad: link `#c=…&t=…` dalla app Mail, campo data, `sessionStorage` dopo il ritorno da Stripe.
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
3. **Codice da solo** (senza data): deve comparire "Prenotazione non trovata". Con codice e data di una prenotazione del foglio deve funzionare.
4. **Rate limit:** 11 tentativi errati in 15 minuti dallo stesso dispositivo devono dare il messaggio "Troppi tentativi…". Il link della mail deve continuare a funzionare.
5. **Header:** DevTools → Network → risposta di una pagina, oppure un servizio come securityheaders.com sull'URL di anteprima.
6. **Ospiti con prenotazioni già confermate:** il vecchio link chiede ora la data di arrivo. Valutare se avvisarli.

## 9. Rischi residui

- **Accesso manuale con codice e data** per le prenotazioni del foglio senza email. Chi conosce entrambi (per esempio un compagno di viaggio o chi ha visto la conferma di Booking) vede date e numero di ospiti e può richiedere la Guest Card verso un'email a sua scelta. Il rischio è limitato dai rate limit e dalla finestra di 7 giorni.
- **Limiti per IP:** sulle reti condivise (Wi-Fi di hotel, CGNAT degli operatori mobili) più ospiti condividono lo stesso contatore. Il messaggio indirizza al link della mail.
- **Fail-open dei limiti** se KV non è raggiungibile.
- **Il link della mail inoltrato** a terzi dà accesso fino a 30 giorni dopo il check-out. La mail avvisa di non inoltrarlo.
- **Nessuna Content-Security-Policy:** le pagine usano script e stili inline, quindi una CSP rigida richiede un intervento separato. In caso di XSS il `sessionStorage` sarebbe leggibile.
- **Token admin `lc_t` in `sessionStorage`:** invariato.
- **Pagina `privacy.html`:** aggiornata nel Prompt 3 (branch `gdpr/informativa`): font del sito locali, `sessionStorage` con codice e chiave di accesso. Vedi `inventario-trattamenti.md`.
- **Segnalati e non modificati** (fuori ambito o in un altro repository):
  - messaggi diagnostici di `gc_oauth_callback` (raggiungibili solo con uno `state` valido);
  - repository Checkin: `ADMIN_SECRET` accettato anche via `?key=`, `successUrl` fornita dal client (ora limitata agli indirizzi del check-in). Google Fonts è stato sostituito da caratteri sul sito.
