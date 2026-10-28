# Messaggi, template, messaggi automatici e traduzione – La Columbera

Ambito: chat tra ospite (area clienti) e titolare (Gestione → Messaggi), template, messaggi automatici programmati, messaggi programmati a mano, traduzione automatica. Codice: `api/_messaggi.js`, `api/_traduci.js`, azioni `msg_*` in `api/x.js`, pagina dell'ospite `js/area.js`, Gestione `js/admin-messaggi.js`. Prove: `tests/sim/messaggi.js` (M1–M11) e `tests/sim/ui.js` (U4j, W13).

---

## 1. Chi scrive e dove

| Prenotazione | Chat nel sito | Come si comunica |
|---|---|---|
| Fatta sul sito e **confermata** | Sì: scheda **Messaggi** dell'area ospiti | Ospite e titolare si scrivono nel sito; i messaggi automatici arrivano lì |
| Booking.com / Airbnb (dal foglio) | No | L'ospite usa la chat della piattaforma. In Gestione → Messaggi → **Template** il titolare compila un testo per quella prenotazione e lo copia nella chat di Booking o Airbnb (per esempio il link all'area ospiti) |
| Annullata o non confermata | No | La conversazione già fatta resta leggibile in Gestione, ma non si scrive più |

- **Solo testo**, al massimo 2000 caratteri. Si mostra sempre come testo: niente HTML; gli indirizzi `http(s)://…` diventano link (si aprono in un'altra scheda).
- **Limite:** 20 messaggi l'ora per prenotazione (dalla parte dell'ospite).
- **L'ospite legge i messaggi quando apre l'area ospiti.** Per avvisarlo subito c'è l'opzione «Avvisa l'ospite via email» (paragrafo 5), spenta di partenza.

## 2. Gestione → Messaggi

- **Conversazioni:** prima quelle con messaggi non letti, poi le più recenti. Il numero dei non letti compare anche nel menu. «Scrivi per primo a un ospite» apre una conversazione con una prenotazione del sito confermata.
- **Conversazione:**
  - i messaggi dell'ospite in italiano (con «originale» se li ha scritti in un'altra lingua);
  - i tuoi con «inviato» / «✓✓ letto»;
  - «Inserisci un template» lo compila per questa prenotazione;
  - «Traduci anche in …» (se l'ospite usa l'area in inglese o tedesco e la traduzione è attiva);
  - «Programma l'invio…» manda il messaggio al giorno e all'ora scelti.
- **Template:** testi pronti con le variabili qui sotto. «Compila e copia» li riempie per una prenotazione (del sito o di Booking/Airbnb) e copia il risultato. Un template usato da una regola automatica non si può cancellare finché la regola lo usa.
- **Automatici:**
  - le regole;
  - i prossimi invii (7 giorni) con «Salta» per un singolo invio;
  - i messaggi programmati a mano (con «Annulla»);
  - le impostazioni.

Messaggi, template e regole **si salvano subito** (pulsanti «Salva template», «Salva regole», «Salva impostazioni»): sono separati dalla configurazione del sito, la barra «Salva modifiche» non li tocca.

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

Una regola è: template + **momento** + filtri.

| Momento | Quando parte |
|---|---|
| Alla conferma | Appena la prenotazione è confermata (pagamento ricevuto) |
| N giorni prima dell'arrivo / il giorno dell'arrivo / N giorni dopo l'arrivo | Quel giorno, all'ora scelta (ora di Trento, ora legale compresa) |
| N giorni prima della partenza / il giorno della partenza / N giorni dopo la partenza | Idem (es. «grazie e recensione» il giorno dopo) |

Filtri: appartamento, soggiorni di almeno N notti.

Regole del motore (`esegui` in `api/_messaggi.js`), pensate per non sbagliare mai verso l'ospite:

- **Una volta sola** per prenotazione e regola: prima dell'invio si prende un marcatore su KV (`SET NX`), quindi due sincronizzazioni insieme non mandano lo stesso messaggio due volte (test M5).
- **Mai arretrati:** una regola vale dal momento in cui la attivi (o cambi il momento d'invio). Attivarla oggi non manda messaggi «di ieri» alle prenotazioni già esistenti (test M6).
- **In ritardo** («Se la prenotazione arriva quando quel momento è già passato, invia subito»): per una prenotazione dell'ultimo minuto il promemoria parte subito, ma solo finché ha senso (un messaggio prima dell'arrivo non parte dopo la fine del giorno di arrivo).
- **Sincronizzazione ferma:** se per oltre 36 ore non gira nessuna sincronizzazione, i messaggi che dovevano partire in quel periodo non partono più (meglio niente che un «ci vediamo domani» il giorno dopo).
- **Solo prenotazioni confermate:** mai alle annullate, alle «da verificare» o ai pagamenti non completati.
- **Quando gira:** dentro l'azione `sync`, che lo script del foglio chiama ogni pochi minuti (e «Sincronizza ora» in Gestione). Niente servizi o cron nuovi. Ha un tempo massimo (~6 secondi) e non lancia mai: se i messaggi falliscono (KV, DeepL, email) la sincronizzazione delle date continua uguale (test M9) e nel registro eventi resta «Messaggi automatici: N invii non riusciti».

## 4. Traduzione automatica (DeepL)

- **Come si attiva:** variabile d'ambiente **`DEEPL_API_KEY`** su Vercel. Le chiavi che finiscono con `:fx` sono del piano gratuito (api-free.deepl.com), le altre del piano Pro (api.deepl.com). Senza la variabile la traduzione è spenta e tutto funziona in italiano.
- **Quale piano:** per i messaggi degli ospiti usare **DeepL API Pro**: per contratto DeepL non conserva i testi tradotti con il piano Pro. **Prima di attivarla verificare le condizioni del contratto** e aggiornare, se serve, il registro dei trattamenti (`docs/gdpr/inventario-trattamenti.md`, riga DeepL).
- **Cosa si traduce:**
  - messaggio dell'ospite → italiano (DeepL riconosce la lingua);
  - risposta del titolare → lingua dell'area ospiti (inglese o tedesco), se è spuntato «Traduci»;
  - alla lettura, nella lingua che l'ospite ha scelto, ciò che manca.
  
  Ogni traduzione si fa una volta e resta salvata (`msg:tr:<codice>`).
- **Messaggi automatici:** si traduce il **template** in inglese e tedesco, con le variabili protette (`<x>{nome}</x>`); le variabili si riempiono dopo. A DeepL non arrivano mai nome, codice, Wi-Fi o date della prenotazione (test M7). Le traduzioni dei template restano salvate 60 giorni.
- **Se DeepL non risponde** (6 secondi) o dà errore: il messaggio parte comunque e si legge in originale; la traduzione mancante si completa alla lettura successiva (test M8).

## 5. Avvisi email

| Avviso | A chi | Quando | Cosa contiene |
|---|---|---|---|
| Nuovo messaggio da un ospite | Titolare (`OWNER_EMAIL`) | Al massimo uno ogni 15 minuti per conversazione. Attivo di partenza | Chi ha scritto e il link a Gestione → Messaggi. **Non** il testo del messaggio |
| Nuovo messaggio dalla struttura | Ospite (solo prenotazioni del sito, con email) | Solo se attivato in Automatici → Impostazioni. Al massimo uno ogni 6 ore | Il link che apre l'area ospiti (token nel frammento `#`). Non il testo |

## 6. Dati e conservazione

Tutto su Upstash (KV), separato dalla configurazione:

- `msg:<codice>`: i messaggi (al massimo 300 per conversazione);
- `msg:tr:<codice>`: le traduzioni;
- `msg:idx`, `msg:nh`, `msg:no`, `msg:lo`, `msg:lingua`: indice e stato di lettura;
- `msg:tpl`, `msg:auto`, `msg:prog`, `msg:imp`: template, regole, messaggi programmati, impostazioni;
- `msg:fatto:*`: invii fatti o saltati (400 giorni).

L'elenco completo è in testa ad `api/_messaggi.js`.

- **Conservazione:** le conversazioni si cancellano da sole **90 giorni dopo la partenza** (si cambia in Automatici → Impostazioni, da 7 a 730 giorni). Il controllo gira al massimo una volta ogni 20 ore, dentro la sincronizzazione (test M10). Se l'elenco delle prenotazioni non arriva (KV non risponde) non si cancella nulla; una conversazione senza prenotazione si cancella solo se è ferma da quel numero di giorni (test M11).
- **Log:** nessun testo, nome o codice.
- **Informativa:** `privacy.html` (trattamento «Messaggi con la struttura», fornitore DeepL se attivo, conservazione).

## 7. Costo su KV e sul browser

- L'area ospiti controlla i messaggi nuovi ogni 20 secondi **solo** con la scheda Messaggi aperta e la pagina in primo piano, per al massimo 10 minuti senza attività. Il controllo (`a=msg_v`) vuole il token della sessione e legge una sola chiave piccola (`msg:v:<codice>`): al massimo 5 comandi KV (test M11). L'elenco intero (`a=msg_list`) si scarica solo se la versione è cambiata.
- `msg_v` ha un limite suo (240 ogni 10 minuti per IP) e non consuma le 60 consultazioni dell'area clienti: una famiglia con due telefoni sulla stessa rete non resta bloccata.
- La Gestione controlla ogni 30 secondi, solo con Messaggi aperto e la pagina in primo piano.

## 8. Variabili d'ambiente nuove

| Variabile | Obbligatoria | Cosa fa |
|---|---|---|
| `DEEPL_API_KEY` | No | Attiva la traduzione automatica (vedi paragrafo 4) |

Restano quelle di sempre: `GMAIL_USER` e `GMAIL_APP_PASSWORD` per gli avvisi email, `OWNER_EMAIL` per il destinatario degli avvisi.

## 9. Verifica manuale (dopo il deploy di anteprima)

1. Prenotazione di prova con Stripe in modalità test; apri l'area ospiti dal link della mail → scheda **Messaggi** → scrivi un messaggio.
2. Deve arrivarti l'email «Nuovo messaggio da …» (senza il testo). In Gestione → Messaggi la conversazione è in cima, con il numero dei non letti.
3. Rispondi; nell'area ospiti (cambia scheda o ricarica) compare la risposta, e in Gestione «✓✓ letto».
4. Con `DEEPL_API_KEY`: area ospiti in inglese, scrivi in inglese → in Gestione la traduzione italiana; rispondi in italiano → l'ospite legge in inglese con «Mostra originale».
5. Automatici: regola «Alla conferma» con il template «Benvenuto», attiva → nuova prenotazione di prova → dopo la sincronizzazione successiva il messaggio è nella conversazione.
6. Template → «Per Booking.com e Airbnb» → compila per una prenotazione del foglio → incolla il testo nella chat della piattaforma (il link apre l'area ospiti).

## 10. Limiti noti

- L'ospite vede i messaggi quando apre l'area ospiti; senza l'avviso via email (spento di partenza) non sa che gli hai scritto.
- Niente allegati (foto, PDF): le foto del sito stanno su un archivio pubblico, non adatto ai documenti degli ospiti.
- Niente notifiche push sul telefono: richiederebbero chiavi VAPID e un consenso del browser (fase facoltativa, da decidere).
- Gli ospiti di Booking e Airbnb non hanno chat nel sito, per scelta: scrivono sulla piattaforma.
