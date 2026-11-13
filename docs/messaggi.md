# Messaggi, template, messaggi automatici e traduzione – La Columbera

Ambito: chat tra ospite (area clienti) e titolare (Gestione → Messaggi), template, messaggi automatici programmati, messaggi programmati a mano, traduzione automatica. Codice: `api/_messaggi.js`, `api/_traduci.js`, azioni `msg_*` in `api/x.js`, pagina dell'ospite `js/area.js`, Gestione `js/admin-messaggi.js`. Prove: `tests/sim/messaggi.js` (M1–M22; foto e link: M14, M15; traduzione con Cloudflare: M16, M17, M18; traduzione dei messaggi automatici alla lettura: M19; lingua dell'ospite: avviso email a lingua non nota M20, lingua ricordata dall'area M21, sua cancellazione M22; link e variabili dentro gli indirizzi: M23; «Traduci» tolto: M24) e `tests/sim/ui.js` (U4j, U4o, W13, W31, W38, W40, W42, W43).

---

## 1. Chi scrive e dove

| Prenotazione | Chat nel sito | Come si comunica |
|---|---|---|
| Fatta sul sito e **confermata** | Sì: scheda **Messaggi** dell'area ospiti | Ospite e titolare si scrivono nel sito; i messaggi automatici arrivano lì |
| Booking.com / Airbnb (dal foglio) | No | L'ospite usa la chat della piattaforma. Nella scheda della prenotazione (Gestione → Prenotazioni) il titolare sceglie un template, «Prepara e copia» lo compila per quella prenotazione e lo incolla nella chat di Booking o Airbnb (per esempio il link all'area ospiti). I messaggi automatici non arrivano a questi ospiti |
| Annullata o non confermata | No | La conversazione già fatta resta leggibile in Gestione, ma non si scrive più |

- **Testo** di al massimo 2000 caratteri, mostrato sempre come testo (niente HTML). Diventano **link** (si aprono in un'altra scheda) gli indirizzi che iniziano con `http://`, `https://` o `www.` e, nei messaggi della struttura, i link con un testo scritti così: `[Prenota un tavolo](https://…)`. Se lo scrive un ospite, quella forma resta com'è con l'indirizzo cliccabile (un testo non può nascondere dove porta il link).
- **Foto** (solo dalla struttura): fino a **4** per messaggio, anche senza testo, nelle risposte, nei messaggi programmati e nei template (quindi anche nei messaggi automatici). L'ospite le vede nella conversazione (un tocco apre la foto intera) e nell'email di avviso. Gli ospiti scrivono solo testo.
- **Limite:** 20 messaggi l'ora per prenotazione (dalla parte dell'ospite).
- **L'ospite legge i messaggi quando apre l'area ospiti.** Per avvisarlo subito c'è l'opzione «Avvisa l'ospite via email» (paragrafo 5), attiva di partenza.

## 2. Gestione → Messaggi

- **Conversazioni:** prima quelle con messaggi non letti, poi le più recenti. Il numero dei non letti compare anche nel menu. «Scrivi per primo a un ospite» apre una conversazione con una prenotazione del sito confermata.
- **Conversazione:**
  - i messaggi dell'ospite in italiano (con «originale» se li ha scritti in un'altra lingua);
  - i tuoi con «inviato» / «✓✓ letto»;
  - «Inserisci un template» lo compila per questa prenotazione;
  - «Traduci anche in …» (se l'ospite usa l'area in inglese o tedesco e la traduzione è attiva): spuntata di partenza; se togli la spunta l'ospite legge il messaggio com'è scritto, senza traduzione nemmeno dopo (utile se gli scrivi tu nella sua lingua);
  - «Programma l'invio…» manda il messaggio al giorno e all'ora scelti;
  - **+ Foto** aggiunge fino a 4 foto (ridimensionate nel telefono o nel computer, come le altre foto della Gestione) e **🔗 Link** inserisce un link con il testo che scegli nel punto in cui stai scrivendo. Inserendo un template arrivano anche le sue foto (le togli con ✕).
- **Template:** testi pronti con le variabili qui sotto, con **+ Foto** e **🔗 Link** come nelle risposte (un template può avere solo foto). Per ogni template si sceglie l'**invio automatico** (paragrafo 3): «No, lo uso a mano», «Appena la prenotazione è confermata», oppure N giorni prima o dopo il check-in o il check-out (o il giorno stesso), all'ora scelta. Nella scelta c'è il caso semplice, una regola per tutti gli appartamenti; se un template ha più regole o una regola con i filtri (appartamento, notti) si vede il riepilogo e si modifica in Automatici. «No» spegne la regola, che resta in Automatici. Eliminare un template toglie anche le sue regole, nello stesso salvataggio (chiede conferma). Il testo per una prenotazione di Booking o Airbnb si prepara dalla scheda della prenotazione («Prepara e copia»): «Compila per una prenotazione» qui non c'è più. Nel testo copiato i link diventano «testo: indirizzo» e le foto del template i loro indirizzi, da aprire (le chat dei portali non ricevono foto dal sito).
- **Automatici:**
  - le regole;
  - i prossimi invii (7 giorni) con «Salta» per un singolo invio;
  - i messaggi programmati a mano (con «Annulla»);
  - le impostazioni.

Messaggi, template e regole **si salvano subito** (pulsanti «Salva template», che salva i template con il loro invio automatico, «Salva regole», «Salva impostazioni»): sono separati dalla configurazione del sito, la barra «Salva modifiche» non li tocca. Se si passa a un'altra vista dei Messaggi con modifiche non salvate, la pagina chiede conferma.

### Variabili dei template

| Variabile | Diventa | Nota |
|---|---|---|
| `{nome}` | Nome dell'ospite | Solo prenotazioni del sito. Vuota per Booking/Airbnb: sparisce insieme allo spazio prima («Ciao {nome}!» → «Ciao!») |
| `{appartamento}` | Torre o Corte | |
| `{checkin}`, `{checkout}` | Giorno di arrivo e di partenza («giovedì 10 dicembre») | Nella lingua del messaggio |
| `{ora_checkin}`, `{ora_checkout}` | Orari (Prenotazioni → Preavviso / Area ospiti) | `{ora_checkout}` vuota se l'orario non è impostato |
| `{notti}`, `{ospiti}` | Numeri della prenotazione | |
| `{codice}` | Codice di prenotazione (a gruppi) | Per Booking/Airbnb il numero del portale |
| `{link_area}` | `…/area-clienti.html#k=CODICE` | Apre l'area ospiti con un tocco: il codice è nel frammento `#`, che non arriva ai server |
| `{wifi}` | Wi-Fi e informazioni riservate dell'appartamento | Usala solo nei messaggi vicini all'arrivo |
| `{indirizzo}` | Via Centrale 48, 38123 Ravina (Trento) | |

## 3. Messaggi automatici

Una regola è: template + **momento** + filtri. Si crea in Automatici («+ Nuova regola») oppure direttamente nel template («Invio automatico»): è la stessa regola, visibile in entrambi i posti.

| Momento | Quando parte |
|---|---|
| Appena la prenotazione è confermata | Appena il pagamento è ricevuto |
| N giorni prima del check-in / il giorno del check-in / N giorni dopo il check-in | Quel giorno, all'ora scelta (ora di Trento, ora legale compresa) |
| N giorni prima del check-out / il giorno del check-out / N giorni dopo il check-out | Idem (es. «grazie e recensione» il giorno dopo) |

Filtri: appartamento, soggiorni di almeno N notti.

Regole del motore (`esegui` in `api/_messaggi.js`), pensate per non sbagliare mai verso l'ospite:

- **Una volta sola** per prenotazione e regola: prima dell'invio si prende un marcatore su KV (`SET NX`), quindi due sincronizzazioni insieme non mandano lo stesso messaggio due volte (test M5).
- **Mai arretrati:** una regola vale dal momento in cui la attivi (o cambi il momento d'invio). Attivarla oggi non manda messaggi «di ieri» alle prenotazioni già esistenti (test M6).
- **In ritardo** («Se la prenotazione arriva quando quel momento è già passato, invia subito»): per una prenotazione dell'ultimo minuto il promemoria parte subito, ma solo finché ha senso (un messaggio prima dell'arrivo non parte dopo la fine del giorno di arrivo).
- **Sincronizzazione ferma:** se per oltre 36 ore non gira nessuna sincronizzazione, i messaggi che dovevano partire in quel periodo non partono più (meglio niente che un «ci vediamo domani» il giorno dopo).
- **Solo prenotazioni confermate:** mai alle annullate, alle «da verificare» o ai pagamenti non completati.
- **Quando gira:** dentro l'azione `sync`, che lo script del foglio chiama ogni pochi minuti (e «Sincronizza ora» in Gestione). Niente servizi o cron nuovi. Ha un tempo massimo (~6 secondi) e non lancia mai: se i messaggi falliscono (KV, DeepL, email) la sincronizzazione delle date continua uguale (test M9) e nel registro eventi resta «Messaggi automatici: N invii non riusciti».

## 4. Traduzione automatica (Cloudflare gratuito, oppure DeepL)

- **Come si attiva:** con le variabili d'ambiente su Vercel, **`CLOUDFLARE_ACCOUNT_ID`** e **`CLOUDFLARE_API_TOKEN`** (Cloudflare, gratuito, senza carta) oppure **`DEEPL_API_KEY`** (DeepL, a pagamento). Se ci sono tutte e due vale DeepL, come prima. Senza, la traduzione è spenta e tutto funziona in italiano. In Gestione → Messaggi → Automatici, in fondo, si legge quale servizio traduce.
- **Cloudflare Workers AI (gratuito):** non è un traduttore classico ma un modello di linguaggio (di partenza **Mistral Small 3.1**, di Mistral AI, licenza Apache 2.0) istruito a tradurre e basta. Per attivarlo:
  1. crea un account gratuito su dash.cloudflare.com (basta l'email, non serve la carta);
  2. nel menu cerca **AI → Workers AI** e scegli **Use REST API**: la pagina mostra il tuo **Account ID** (32 caratteri) e il pulsante **Create a Workers AI API Token**; crealo e copia subito il token, che si vede una volta sola (i nomi dei pulsanti possono cambiare: serve un token con il permesso «Workers AI» sul tuo account);
  3. su Vercel → Settings → Environment Variables: **`CLOUDFLARE_ACCOUNT_ID`** = l'Account ID, **`CLOUDFLARE_API_TOKEN`** = il token (per provare prima su un'anteprima, anche nell'ambiente Preview); poi nuovo deploy;
  4. prova come al paragrafo 9, punto 4.
- **Quota e costi:** il piano gratuito dà **10.000 «neuron» al giorno** (si azzerano a mezzanotte UTC). Un messaggio breve ne usa circa 15–40 (stima: il conto dipende dalla lunghezza), quindi bastano per centinaia di messaggi al giorno. Se la quota finisce Cloudflare risponde con errore 429: i messaggi partono lo stesso nella lingua originale e la traduzione riprende il giorno dopo. Finché non passi tu al piano a pagamento di Cloudflare non si paga nulla.
- **Qualità:** buona per italiano, inglese, tedesco e le altre lingue europee, più incerta per le lingue rare; essendo un modello di linguaggio può sbagliare. Per questo il titolare vede sempre l'originale accanto alla traduzione e l'ospite può aprire il testo originale. Il codice scarta le risposte non valide (testo mancante, di lunghezza assurda, parti protette toccate): in quel caso il messaggio parte in originale. Più lento di DeepL: di solito 1–4 secondi; il limite è 10 secondi per richiesta (chi scrive aspetta al massimo quel tempo, poi il messaggio parte comunque).
- **Modello:** di partenza `@cf/mistralai/mistral-small-3.1-24b-instruct`; si può cambiare con la variabile facoltativa **`CLOUDFLARE_AI_MODEL`** (per esempio se Cloudflare ritira quel modello). Se compare un errore 403 dopo un cambio di modello, alcuni modelli chiedono di accettare la licenza una volta (vedi la pagina del modello su Cloudflare).
- **Se non traduce:** il registro eventi della Gestione riporta una riga «Traduzione automatica (Cloudflare): …» con il motivo (chiave o permessi non validi, account o modello non trovato, quota finita, nessuna risposta, risposta non valida), al massimo una ogni 30 minuti per motivo (una ogni 6 ore per la quota finita) e senza mai i testi dei messaggi. Con un Account ID non valido (non di 32 caratteri esadecimali) la traduzione resta spenta.
- **Privacy:** Cloudflare dichiara di non usare i contenuti elaborati da Workers AI per addestrare modelli e di conservarli solo il tempo necessario; esegue però la traduzione sulla sua rete mondiale, quindi i testi possono essere elaborati anche fuori dall'Unione europea. **Prima di usarla con gli ospiti veri** controlla i termini e l'accordo sul trattamento dei dati (DPA) accettati con l'account Cloudflare e aggiorna, se serve, il registro dei trattamenti (`docs/gdpr/inventario-trattamenti.md`, riga Cloudflare); l'informativa (`privacy.html`) nomina già DeepL e Cloudflare.
- **DeepL:** variabile **`DEEPL_API_KEY`**. Le chiavi che finiscono con `:fx` sono del piano gratuito (api-free.deepl.com), le altre del piano Pro (api.deepl.com). Per i messaggi degli ospiti usare **DeepL API Pro**: per contratto DeepL non conserva i testi tradotti con il piano Pro. **Prima di attivarla verificare le condizioni del contratto** e aggiornare, se serve, il registro dei trattamenti (`docs/gdpr/inventario-trattamenti.md`, riga DeepL).
- **Cosa si traduce:**
  - messaggio dell'ospite → italiano (il servizio riconosce la lingua);
  - risposta del titolare → lingua dell'area ospiti (inglese o tedesco), se è spuntato «Traduci»;
  - alla lettura, nella lingua che l'ospite ha scelto, ciò che manca. Se l'ospite cambia lingua, la pagina richiede l'elenco per intero e i messaggi compaiono nella lingua nuova (test W42). Fanno eccezione le risposte mandate togliendo la spunta «Traduci»: restano come sono state scritte (test M24).
  
  Ogni traduzione si fa una volta e resta salvata (`msg:tr:<codice>`). Indirizzi dei link e variabili non vanno mai al servizio da tradurre; se uno è dentro l'altro (l'indirizzo `https://www.…` di un link con il testo, una variabile dentro un indirizzo) resta una sola parte protetta, quella più esterna (test M23).
- **Messaggi automatici:** si traduce il **template** in inglese e tedesco, con le variabili protette (`<x>{nome}</x>`); le variabili si riempiono dopo. Quando il messaggio parte, al servizio di traduzione non arrivano mai nome, codice, Wi-Fi o date della prenotazione (test M7 e M16; a Cloudflare al posto delle variabili vanno gettoni `[[1]]`, `[[2]]`… che devono tornare uguali). Se in quel momento il servizio non risponde (o la traduzione era spenta), alla lettura successiva dell'ospite il messaggio si traduce **di nuovo dal template**, sempre con le variabili protette, e le variabili si riempiono dopo: nome, codice e Wi-Fi non arrivano mai al servizio. Il template si ritrova dalla regola che ha mandato il messaggio e deve rifare esattamente il testo partito: se nel frattempo il template è stato modificato, la regola è stata tolta o i dati della prenotazione sono cambiati (anche il dominio del sito, per i template con `{link_area}`), quel messaggio resta in italiano (test M19). Le traduzioni dei template restano salvate 60 giorni.
- **Se il servizio non risponde** (6 secondi per DeepL, 10 per Cloudflare), dà errore o ha finito la quota: il messaggio parte comunque e si legge in originale; la traduzione mancante si completa alla lettura successiva (test M8 per DeepL, M17 per Cloudflare). Con Cloudflare una conversazione lunga arriva a gruppi (al massimo 6 messaggi e 2.500 caratteri per richiesta) e un gruppo sbagliato si rifà un messaggio alla volta (test M17, M18).

## 5. Avvisi email

| Avviso | A chi | Quando | Cosa contiene |
|---|---|---|---|
| Nuovo messaggio da un ospite | Titolare (`OWNER_EMAIL`) | Attivo di partenza | Chi ha scritto, appartamento e arrivo, **il testo del messaggio** (con la traduzione automatica in italiano se l'ospite ha scritto in un'altra lingua) e il pulsante **Rispondi**, che apre la conversazione in Gestione (`admin.html#messaggi/c/<codice>`; senza accesso su quel dispositivo prima chiede la password) |
| Nuovo messaggio dalla struttura (anche automatico o programmato) | Ospite (solo prenotazioni del sito, con email) | Attivo di partenza | **Il testo**, nella lingua scelta dall'ospite nell'area (it, en, de) se c'è la traduzione, con l'originale italiano sotto. **Lingua non nota** (l'ospite non ha ancora aperto l'area): cornice in italiano e inglese e il testo in italiano con **sotto il testo in inglese** («English translation»), se la traduzione inglese c'è già; i messaggi automatici la portano con sé, quindi il benvenuto arriva in due lingue (test M20). Senza traduzione inglese (traduzione spenta, servizio che non risponde con un template mai tradotto, messaggio scritto a mano) l'email resta in italiano con la cornice bilingue. Il pulsante **Rispondi** apre la scheda Messaggi dell'area ospiti senza chiedere il codice (`area-clienti.html#c=…&t=…&s=messaggi`, token nel frammento `#`). Reply-To: `REPLY_TO` |

- **Come si conosce la lingua dell'ospite:** l'area ospiti la comunica al server appena l'ospite entra (qualsiasi scheda, anche senza aprire Messaggi), a ogni nuovo accesso e quando si rilegge dopo il check-in; il server la ricorda (`msg:lingua`) solo per le prenotazioni del sito confermate e scrive solo se è cambiata (test M21, U4o). Il cambio di lingua dentro l'area, da solo, non chiama il server: la nuova lingua arriva alla rilettura o all'apertura dei messaggi. Il messaggio di benvenuto «appena confermata» parte con la sincronizzazione dopo il pagamento (pochi minuti), spesso prima che l'ospite apra l'area: per questo, a lingua non nota, l'email porta anche il testo in inglese (vedi sopra).
- **Cosa cambia sapere la lingua prima:** la usano anche la casella «Traduci anche in…» della Gestione, la traduzione delle risposte del titolare e dei messaggi programmati, l'email di annullo e rimborso fatto dal titolare (Prenotazioni → «Annulla e rimborsa»): tutti nella lingua dell'area ospiti, italiano se non è nota. Per «niente di nuovo» (`msg_list` con la versione già mostrata) conta solo la versione, non la lingua: nulla è cambiato. È la pagina dell'ospite che, quando cambia lingua, chiede l'elenco per intero (test W42).
- **Niente raffiche:** un avviso per il primo messaggio non letto; se ne arrivano altri prima che il destinatario li legga, al massimo uno ogni 15 minuti per conversazione. Appena il destinatario legge, il messaggio successivo avvisa di nuovo subito (test M3).
- Si spengono, separatamente, in Messaggi → Automatici → Impostazioni. Un'email che non parte non blocca il messaggio: l'avviso si riprova al messaggio successivo.
- Se un'impostazione era già stata salvata con l'avviso all'ospite spento, resta spenta: va riaccesa a mano.
- Il testo dei messaggi passa da Gmail (come le email di conferma): l'informativa lo dice (`privacy.html`, «Messaggi con la struttura»).

## 6. Dati e conservazione

Tutto su Upstash (KV), separato dalla configurazione:

- `msg:<codice>`: i messaggi (al massimo 300 per conversazione), con gli indirizzi delle eventuali foto;
- `msg:tr:<codice>`: le traduzioni;
- `msg:idx`, `msg:nh`, `msg:no`, `msg:lo`: indice e stato di lettura;
- `msg:lingua`: la lingua dell'area ospiti (it, en, de) per prenotazione, scritta all'ingresso nell'area (anche prima del primo messaggio) e quando l'ospite apre i messaggi;
- `msg:tpl`, `msg:auto`, `msg:prog`, `msg:imp`: template, regole, messaggi programmati, impostazioni;
- `msg:fatto:*`: invii fatti o saltati (400 giorni).

L'elenco completo è in testa ad `api/_messaggi.js`.

**Foto:** stanno su **Vercel Blob**, lo stesso archivio pubblico delle foto del sito (indirizzi lunghi e casuali, che non si indovinano), nelle cartelle `foto/msg/` (foto di un solo messaggio) e `foto/msgtpl/` (foto dei template). Il server accetta solo indirizzi di quelle cartelle, al massimo 4 per messaggio o template. Le foto di un messaggio si cancellano da Blob con la sua conversazione, o subito se un messaggio programmato viene annullato o non parte; quelle dei template restano, come le altre foto del sito (le usano anche i messaggi già mandati). Una foto caricata e poi tolta prima dell'invio resta su Blob (come per le altre foto della Gestione). **Non mandare foto di documenti o di persone:** l'archivio è pubblico.

- **Conservazione:** le conversazioni si cancellano da sole **7 giorni dopo la partenza** (dall'ottavo giorno; si allunga in Automatici → Impostazioni, fino a 730 giorni). Anche l'area clienti si chiude 7 giorni dopo il check-out, per il codice e per i link delle email. Se in Impostazioni avevi già salvato un altro numero, vale quello: rimettilo a 7. Il controllo gira al massimo una volta ogni 20 ore, dentro la sincronizzazione (test M10). Se l'elenco delle prenotazioni non arriva (KV non risponde) non si cancella nulla; una conversazione senza prenotazione si cancella solo se è ferma da quel numero di giorni (test M11). Con la conversazione si cancella anche la lingua dell'ospite (`msg:lingua`); se non c'è mai stata una conversazione la lingua si cancella con lo stesso criterio (partenza + periodo di conservazione), o subito se la prenotazione non esiste più; un guasto in questo passaggio non cambia le conversazioni cancellate (test M22).
- **Log:** nessun testo, nome o codice.
- **Email:** il testo dei messaggi è nelle email di avviso (titolare e ospite), vedi il paragrafo 5.
- **Informativa:** `privacy.html` (trattamento «Messaggi con la struttura», fornitore DeepL se attivo, conservazione).

## 7. Costo su KV e sul browser

- L'area ospiti controlla i messaggi nuovi ogni 20 secondi **solo** con la scheda Messaggi aperta e la pagina in primo piano, per al massimo 10 minuti senza attività. Il controllo (`a=msg_v`) vuole il token della sessione e legge una sola chiave piccola (`msg:v:<codice>`): al massimo 5 comandi KV (test M11). L'elenco intero (`a=msg_list`) si scarica solo se la versione è cambiata.
- `msg_v` ha un limite suo (240 ogni 10 minuti per IP) e non consuma le 60 consultazioni dell'area clienti: una famiglia con due telefoni sulla stessa rete non resta bloccata.
- La Gestione controlla ogni 30 secondi, solo con Messaggi aperto e la pagina in primo piano.

## 8. Variabili d'ambiente nuove

| Variabile | Obbligatoria | Cosa fa |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Con `CLOUDFLARE_API_TOKEN` | L'Account ID del tuo account Cloudflare (32 caratteri): attiva la traduzione automatica gratuita (vedi paragrafo 4) |
| `CLOUDFLARE_API_TOKEN` | Con `CLOUDFLARE_ACCOUNT_ID` | Token API di Cloudflare con il permesso «Workers AI» (segreto: mai nel repository) |
| `CLOUDFLARE_AI_MODEL` | No | Modello di Cloudflare da usare al posto di quello di partenza (vedi paragrafo 4) |
| `DEEPL_API_KEY` | No | Attiva la traduzione automatica con DeepL (vedi paragrafo 4); se c'è, vale al posto di Cloudflare |

Restano quelle di sempre: `GMAIL_USER` e `GMAIL_APP_PASSWORD` per gli avvisi email, `OWNER_EMAIL` per il destinatario degli avvisi.

## 9. Verifica manuale (dopo il deploy di anteprima)

1. Prenotazione di prova con Stripe in modalità test; apri l'area ospiti dal link della mail → scheda **Messaggi** → scrivi un messaggio.
2. Deve arrivarti l'email «Nuovo messaggio da …» con il testo. Premi **Rispondi**: si apre la conversazione in Gestione (se il dispositivo non ha l'accesso, prima la password).
3. Rispondi; all'ospite arriva l'email con la tua risposta: il suo **Rispondi** apre l'area ospiti già sulla scheda Messaggi, senza codice. In Gestione compare «✓✓ letto».
4. Con `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_API_TOKEN` (o con `DEEPL_API_KEY`): area ospiti in inglese, scrivi in inglese → in Gestione la traduzione italiana; rispondi in italiano → l'ospite legge in inglese con «Mostra originale».
5. Template → «Benvenuto» → Invio automatico «Appena la prenotazione è confermata» → «Salva template» → nuova prenotazione di prova → dopo la sincronizzazione successiva il messaggio è nella conversazione. In Automatici la stessa regola compare attiva.
6. Prenotazioni → una prenotazione del foglio (Booking o Airbnb) → «Messaggio da mandare»: «Per Booking.com e Airbnb» → «Prepara e copia» → incolla il testo nella chat della piattaforma (il link apre l'area ospiti).
7. Lingua non nota: con la traduzione attiva e la regola «Appena la prenotazione è confermata», fai una prenotazione di prova e **non** aprire l'area ospiti. Dopo la sincronizzazione l'email «Nuovo messaggio da La Columbera · New message» ha il testo in italiano e sotto «English translation» con la versione inglese.
8. Lingua dall'area: con un'altra prenotazione di prova apri l'area ospiti dal link della mail, con il telefono in inglese, **senza** aprire la scheda Messaggi. In Gestione → Messaggi → quella prenotazione compare «Traduci anche in inglese» e la tua risposta arriva all'ospite in inglese (email in inglese).

## 10. Limiti noti

- Se spegni l'avviso via email all'ospite, l'ospite vede i tuoi messaggi solo quando apre l'area ospiti.
- Finché l'ospite non apre l'area la sua lingua non è nota: un messaggio scritto a mano parte solo in italiano (la traduzione si fa nella lingua dell'area), e un messaggio automatico ha l'inglese sotto l'italiano solo se la traduzione c'è (traduzione attiva, e servizio che risponde oppure template già tradotto negli ultimi 60 giorni). L'ospite tedesco trova comunque il messaggio nella sua lingua nell'area ospiti, se la traduzione è attiva.
- In una conversazione «dal vivo» (l'altro legge subito) ogni messaggio porta un'email: è la regola del primo messaggio non letto.
- Le email contengono il testo dei messaggi: chi ha accesso alla casella le legge (vale anche per le conferme di prenotazione).
- Le foto le manda solo la struttura, e niente PDF: le foto stanno su un archivio pubblico, non adatto ai documenti degli ospiti. Per lo stesso motivo gli ospiti non possono mandare foto dal sito.
- Niente notifiche push sul telefono: richiederebbero chiavi VAPID e un consenso del browser (fase facoltativa, da decidere).
- Gli ospiti di Booking e Airbnb non hanno chat nel sito, per scelta: scrivono sulla piattaforma.
- **Email nell'app Gmail con il telefono in modalità scura:** Gmail capovolge i colori dell'email (il fondo crema diventa scuro). Intestazione bordeaux e riga oro restano come sul sito (il colore è ripetuto come immagine a tinta unita, che Gmail non tocca; `api/_mail.js`, prova P21). Pulsante e piè di pagina (dello stesso bordeaux dell'intestazione, in tutti i programmi) restano bordeaux con le scritte chiare grazie a regole che valgono solo in Gmail (tinta unita più due livelli di fusione, *screen* e *difference*; prova P22); dove Gmail non legge quelle regole (account non Google nell'app Gmail) tornano più chiari, rosati ma leggibili. Le scritte di risalto (codice di prenotazione, importi, link, numeri dei passaggi, nomi nei titoli delle email al titolare) sono in oro scuro (#806120, leggibile su tutti i fondi chiari delle email: contrasto da 4,8 a 5,7:1; prova P23); in Gmail scuro diventano oro chiaro. Prima erano bordeaux e in Gmail scuro diventavano rosa. Yahoo, Apple Mail, Outlook e Gmail in modalità chiara le mostrano come sempre. L'email del check-in (progetto Checkin) usa le stesse regole (`api/invia-email-ospite.js`).
