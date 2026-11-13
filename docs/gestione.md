# Gestione (pannello del titolare) – La Columbera

Ambito: la pagina `admin.html`, divisa in due aree. Codice: `js/admin.js` (nucleo: aree, menu, indirizzi, salvataggio), `js/admin-operativita.js` (Oggi, Prenotazioni, Guest Card), `js/admin-calendario.js` (Calendario e prezzi), `js/admin-pulizie.js` (Pulizie), `js/admin-sito.js` (sezioni del Sito); Messaggi in `js/admin-messaggi.js`, Adempimenti in `js/adempimenti.js` e `js/istat.js`. Server: `api/x.js` (azioni `cfg_admin`, `save`, `dintorni`, `adm`, `pul_info`, `pul_set`). Prove: `tests/sim/ui.js` (W14–W22, menu del telefono W14b), `tests/sim/sicurezza.js` (S18–S20), `tests/sim/sito.js` (app della Gestione S10, menu del telefono S11).

## 1. Le due aree

Da computer in alto c'è sempre il selettore **OPERATIVITÀ | SITO** e il menu delle sezioni è a sinistra. Il selettore ricorda l'ultima sezione aperta di ciascuna area. Un pallino dorato sull'altra area vuol dire che lì c'è qualcosa da guardare: prenotazioni da gestire o messaggi da leggere in Operatività, problemi di sincronizzazione in Sito.

**Su telefono** (schermi fino a 900 px, quindi anche tablet in verticale) in alto c'è una sola riga: il pulsante con la sezione aperta («OPERATIVITÀ · Oggi ⌄») ed **Esci**. Il pulsante apre il **menu a tendina** con tutte le sezioni delle due aree, due per riga, ognuna con la sua descrizione; la sezione aperta è in bordeaux, i numeri dorati sono le prenotazioni da gestire, i messaggi da leggere e i problemi di sincronizzazione. In fondo c'è **Vedi il sito ↗**. Il menu si chiude scegliendo una sezione, toccando fuori o con Esc. Un pallino dorato sul pulsante vuol dire che un'altra sezione ha qualcosa da guardare. Prima le sezioni stavano in una fila che scorreva di lato (se ne vedevano tre su sette) sotto il selettore, su due righe. In Gestione il menu ☰ del sito pubblico su telefono non compare, per non confonderlo con questo.

| Area | Sezione | Cosa ci trovi |
|---|---|---|
| Operatività | **Oggi** | Da gestire, messaggi da leggere, arrivi e partenze di oggi e domani, invii automatici di oggi e domani, i prossimi 7 giorni per appartamento, il **semaforo unico** «Stato del sistema» |
| | **Calendario e prezzi** | Un calendario per appartamento (schede Torre / Corte) e la vista **Entrambi**; prezzo del 1° ospite e ospiti in più, prezzi di stagione, notti minime, notti bloccate, chiusura |
| | **Prenotazioni** | Elenco unico (sito, Booking.com, Airbnb dal foglio) con ricerca e filtri; dettaglio di ogni prenotazione |
| | **Pulizie** | Per un periodo: chi esce e chi entra in ogni appartamento, ospiti, notti, letti (matrimoniale o singoli) e una nota; il testo da copiare per chi fa le pulizie |
| | **Messaggi** | Conversazioni, Template, Automatici (come prima) |
| | **Adempimenti** | Alloggiati Web e ISTAT (come prima) |
| | **Guest Card** | Emissione a mano e configurazione (come prima) |
| Sito | **Appartamenti** | Testi, CIN e CIPAT, approfondimento, servizi, ospiti massimi, testi dell'area ospiti, foto |
| | **Home** | Tutti i testi e le foto della homepage, sezione per sezione (vedi §7 bis) |
| | **Eventi** | Eventi inseriti a mano (si salvano subito) |
| | **Luoghi e convenzioni** | Le schede delle pagine «Luoghi di interesse» e «Convenzioni» (nuovo) |
| | **Regole di prenotazione** | Preavviso minimo, orari di check-in e check-out, Wi-Fi visibile da…, WhatsApp; fin dove si prenota |
| | **Sistema** | Sincronizzazione, pagamenti ed email, riconciliazione, registro; Calendari iCal |

## 1 bis. La Gestione come app sul telefono

Non serve un'app da App Store o Play Store: la Gestione si installa dal browser e si apre come un'app, a schermo intero e già sulla Gestione (manifest `gestione.webmanifest`, collegato solo da `admin.html`).

- **iPhone** (Safari): apri la Gestione (`admin.html` del sito) → tasto Condividi → **Aggiungi alla schermata Home** → «Gestione».
- **Android** (Chrome): apri `admin.html` → menu ⋮ → **Installa app** (o «Aggiungi a schermata Home»).

Come funziona e cosa resta uguale:

- È la stessa pagina `admin.html`: ogni modifica pubblicata sul sito vale subito anche nell'app, non c'è niente da aggiornare a parte.
- **Ambito solo `admin.html`**: i link al sito (es. «Vedi il sito») si aprono nel browser e, su Android, i link del sito ricevuti per WhatsApp o email non finiscono dentro l'app della Gestione.
- **Nessun service worker** e nessuna copia salvata: prenotazioni, messaggi e impostazioni arrivano sempre dalla rete. Senza rete l'app non mostra dati vecchi.
- **Accesso**: come nel browser. L'accesso vale 8 ore e resta solo finché l'app è aperta (`sessionStorage`): se il telefono la chiude, si rientra con utente e password (il portachiavi del telefono li propone). Nessuna regola di sicurezza è cambiata.
- L'app dell'area clienti per gli ospiti (`manifest.webmanifest`, `sw.js`) non cambia.

## 2. Salvare

- Le modifiche a prezzi, blocchi, testi, regole, calendari iCal e schede dei dintorni restano nella pagina finché non premi **Salva modifiche**. La barra in basso compare solo quando c'è qualcosa da salvare e dice dove: «Modifiche non salvate: Calendario e prezzi · Torre, Regole di prenotazione».
- La barra resta visibile anche se cambi sezione, e lampeggia per ricordartelo. **Annulla** riporta le impostazioni salvate. Se esci («Esci») o chiudi la pagina con modifiche non salvate, ti viene chiesta conferma.
- Si salvano **subito**, senza la barra: messaggi, template e automatici, adempimenti, eventi, Guest Card, stato delle prenotazioni.
- **Due dispositivi.** Ogni salvataggio porta il numero di versione delle impostazioni che avevi aperto (chiave `cfg:rev`). Se nel frattempo hai salvato da un altro dispositivo o da un'altra scheda, il server non sovrascrive: la barra lo dice e propone **Ricarica le impostazioni salvate** (lasci perdere le modifiche di questa pagina) oppure **Salva comunque le mie** (sostituisci quelle dell'altro dispositivo). Controllo e scrittura avvengono in un solo passo (script Lua su Upstash): anche due salvataggi nello stesso istante non si sovrascrivono.
- Se all'apertura le impostazioni salvate non arrivano (errore di rete), la pagina mostra quelle di partenza ma **non salva**: chiede di ricaricare. Prima avrebbe potuto sostituire le impostazioni vere con quelle di partenza.

## 3. Indirizzi vecchi

I segnalibri e i link delle email continuano a funzionare: portano alla sezione nuova (senza aggiungere passi alla cronologia).

| Prima | Adesso |
|---|---|
| `#panoramica` (o nessun indirizzo) | `#oggi` |
| `#sync` | `#sistema` |
| `#torre`, `#torre/testi` | `#appartamenti/torre` |
| `#torre/foto` | `#appartamenti/torre/foto` |
| `#torre/prezzi`, `#torre/disponibilita` | `#calendario/torre` |
| `#torre/calendari` | `#sistema/ical` |
| `#prenotazioni`, `#messaggi…`, `#adempimenti…`, `#guestcard`, `#eventi`, `#home` | invariati |
| indirizzo sconosciuto | `#oggi` |

Lo stesso vale per Corte. Il preavviso minimo e le impostazioni dell'area ospiti, prima in Prenotazioni, ora sono in **Sito → Regole di prenotazione** (`#regole`).

## 4. Calendario e prezzi

1. Scegli l'appartamento (Torre / Corte) oppure **Entrambi** per vedere le prossime 8 settimane in una tabella: chi c'è, le notti bloccate (con il loro prezzo), il prezzo delle notti libere.
2. Seleziona le notti: **giorno per giorno** (tocchi le notti una alla volta; da computer Maiusc + clic per un intervallo) oppure **dal… al…** (tocchi la prima e l'ultima notte), o **Tutto il mese**. C'è anche «Oppure scrivi le date». Si selezionano anche le notti **bloccate** e quelle **occupate** (prenotazioni del sito, Booking, Airbnb, foglio).
3. Il riquadro delle notti selezionate è sempre a portata, senza scorrere: da computer (schermi da 1240 px) sta **accanto al calendario** e resta in vista; su telefono e tablet compare **fisso in basso** appena scegli una notte, al posto della barra «Salva modifiche» (che torna da sola dopo «Applica» o «Deseleziona»), e la pagina sale quanto basta perché il calendario resti sopra. Con «dal… al…», dopo il primo tocco il riquadro resta basso («Ora tocca l'ultima notte») finché non tocchi l'ultima notte, o di nuovo la stessa per una notte sola. Su telefono le azioni stanno in tre schede (**Prezzo**, **Blocco**, **Notti minime**):
   - **Prezzo a notte del 1° ospite** → «Applica» (o Invio); sotto c'è il prezzo di adesso («Ora: €180» o «da €180 a €230») e **Prezzo normale**, che toglie il prezzo messo a mano e torna a quello di stagione o al prezzo base. Vale **anche per le notti bloccate e occupate**: prendono il prezzo e **restano chiuse**; se si aprono (le sblocchi, o la prenotazione viene annullata) hanno già il prezzo giusto (il riquadro lo dice: «2 sono bloccate: prendono il prezzo e restano bloccate», «3 sono occupate: prendono il prezzo; se si liberano, hanno già questo prezzo»);
   - **Blocca** / **Sblocca** (vale solo sul sito: le stesse notti vanno chiuse anche su Booking e Airbnb); bloccare e sbloccare non cambia i prezzi e vale solo per le notti libere della selezione: una notte occupata resta com'è (con sole notti occupate i due pulsanti sono spenti);
   - **Notti minime per chi arriva in questi giorni** → «Applica» (o Invio) o **Minimo generale**. Vale anche per le notti occupate (conta se si liberano). Se quei giorni erano dentro un periodo con un altro minimo, il periodo viene spezzato attorno a loro.

   Quello che scrivi nei campi resta mentre aggiungi o togli notti dalla selezione.
4. **Salva modifiche.**

**Bambini sotto i 4 anni:** l'ospite li indica a parte nella scheda di prenotazione («Bambini · sotto i 4 anni · gratis»). Non pagano e non contano tra gli ospiti in più, ma contano per il numero massimo di ospiti dell'appartamento; li vedi nel dettaglio della prenotazione, nelle email e nel testo per le pulizie («3 ospiti (di cui 1 bambino sotto i 4 anni)»).

Nelle caselle: il prezzo del 1° ospite (in oro se messo a mano), «bloccato» con il prezzo che la notte avrà quando la sblocchi (su telefono «bloc.»), il nome di chi occupa la notte (o Booking / Airbnb) e «min N» quando il minimo è diverso dal solito. Anche una notte occupata mostra il prezzo (e «min N») che avrà se si libera; toccandola la selezioni come le altre, e la sua prenotazione si apre dal link «Occupata: …» nel riquadro (prima si apriva toccando la casella). Sotto il calendario restano prezzo base e ospiti in più, prezzi di stagione, notti minime, notti bloccate (anche per mese intero) e la chiusura dell'appartamento. I dati salvati sono gli stessi di prima (`prices`, `periodi`, `blocked`, `minPeriodi`, `closed`): sito e server calcolano esattamente come prima. I prezzi possono avere i centesimi (per esempio 95,50): le pagine del sito (prezzo «da … a notte», totale, riepilogo e pulsante «Paga») li mostrano con due decimali solo quando servono (€180, €95,50) e Stripe addebita esattamente la cifra mostrata (prova W41).

## 5. Prenotazioni e Oggi

- **Fonti, senza doppioni.** Prenotazioni del sito (con nome, email, importo); Booking.com e Airbnb dal foglio, con il loro numero ma senza nome né importo; i calendari iCal per ciò che il foglio non ha ancora («solo calendario»). Il foglio contiene anche le prenotazioni del sito: queste si mostrano una volta sola, con i dati del sito.
- **Ricerca** per codice (anche a gruppi o minuscolo), nome, email, telefono. **Filtri**: Tutte, Da gestire, Prossime, Passate, Annullate; origine (Sito, Booking.com, Airbnb, Manuale).
- **Dettaglio**: arrivo con l'orario di check-in, partenza con il check-out, notti, ospiti; contatti con telefono e WhatsApp; pagamento riga per riga come lo vede l'ospite, con il link al pagamento su Stripe; il **codice per l'area ospiti** da copiare e un **messaggio pronto** (benvenuto per il sito, link all'area ospiti per Booking e Airbnb: si incolla nella chat del portale); messaggi e invii programmati; stato, Guest Card precompilata, «Vedi nel calendario», «Rimuovi dallo storico». Aprire il dettaglio non segna i messaggi come letti.
- **Booking/Airbnb «da verificare»**: quando una prenotazione sparisce dal calendario di Booking o Airbnb senza un'email di cancellazione, il foglio la mette DA_VERIFICARE (le notti restano bloccate). Qui compare con lo stato **da verificare** e il motivo, anche in **Oggi → Da gestire**; finché resta così l'ospite **non entra nell'area clienti** con quel numero. Controlla sul portale: se l'ospite c'è, nel dettaglio premi **«Conferma: l'ospite c'è»** e da subito vale come confermata (area clienti, check-in online, Guest Card), senza toccare il foglio («confermata da te»; si può rimettere da verificare). Se invece è stata cancellata, annullala sul portale o metti ANNULLATA nel foglio: un'annullata nel foglio vince sempre sulla conferma.
- **Annulla e rimborsa** (nel dettaglio, per le prenotazioni del sito pagate, confermate o «da verificare»): dopo la conferma rimborsa l'intero importo su Stripe, annulla la prenotazione (notti di nuovo libere sul sito e, alla prossima lettura del calendario, su Booking e Airbnb), aggiorna il foglio e manda l'email all'ospite. Vale in qualsiasi momento; l'ospite invece annulla da solo dall'area clienti solo fino a 7 giorni prima dell'arrivo (ti arriva un'email). Per un rimborso parziale usa la dashboard di Stripe e poi cambia lo stato. Vedi `docs/pagamenti.md` §«Annullamento e rimborso».
- **Ricevuta** (nel dettaglio): se l'ospite l'ha chiesta dall'area clienti trovi i dati per intestarla (con «Copia i dati»); emetti la ricevuta come fai di solito, poi carichi il PDF (o una foto JPG/PNG, al massimo 3 MB) e parte all'ospite in allegato, con un messaggio facoltativo. Il file non resta sul sito. In alternativa «Segna come mandata» o «Togli la richiesta». Alle prenotazioni del sito la puoi mandare anche senza richiesta. In **Oggi → Da fare** compaiono le ricevute da mandare.
- **Prenotazioni manuali** (prese da te per telefono o di persona): nel foglio Google **Prenotazioni** scrivi una riga nuova lasciando vuoto «Numero Prenotazione»: data di check-in, appartamento (menu), numero di ospiti, numero di notti e, nella colonna **NOTE** (Q), quello che vuoi ricordare (per esempio «Rossi, 300 € contanti»). Entro 5 minuti lo script del foglio le dà un codice (`M` + 9 caratteri, non si indovina), FONTE «MANUALE» e STATO «CONFERMATA»: le notti si chiudono sul sito e la prenotazione compare qui come **Manuale**, con la nota, in Prenotazioni, Oggi e Pulizie. Con quel codice l'ospite entra nell'area clienti (check-in online, Guest Card, informazioni): nel dettaglio c'è il messaggio pronto da mandargli per WhatsApp, SMS o email. Su Booking e Airbnb le notti chiudile tu come prima (il sito passa ai portali solo le sue prenotazioni). Per annullarla scrivi ANNULLATA nella colonna STATO. Una riga a cui manca la data, l'appartamento o le notti resta com'è finché non la completi.
- **Pulizia del foglio**: ogni notte (alle 3) lo script cancella dal foglio le prenotazioni concluse da più di **7 giorni** (dall'ottavo giorno dopo il check-out); quelle senza notti un mese dopo il check-in, quelle annullate senza date una settimana dopo l'annullamento. Nel sito restano le prenotazioni del sito; per Booking e Airbnb restano i portali; le manuali spariscono del tutto, nota compresa. L'ultima prenotazione rimasta non si cancella finché non ne arriva un'altra (il sito, se il foglio si svuota di colpo, smette di fidarsi e blocca il calendario). Proprietà dello script `ELIMINA_DOPO_GIORNI` (7; `0` = non cancellare). Dettagli e installazione: [`foglio-prenotazioni.md`](foglio-prenotazioni.md).
- **Semaforo unico** in Oggi: sincronizzazione (subito) più pagamenti ed email (controllo su Stripe, al massimo ogni 5 minuti; «Aggiorna» lo rifà). Verde «Tutto ok», giallo «Da guardare», rosso «Da sistemare», con il motivo; un tocco apre Sito → Sistema.
- **Oggi → Da fare · Registra ospiti** (Alloggiati Web): una voce per ogni arrivo a Torre e Corte, con la spunta (spuntata resta sbiadita fino a sera, poi sparisce).
- **Chi arriva, chi parte, chi è in casa** (Oggi: liste di oggi e domani, contatore «arrivi · partenze», e Da fare): contano le prenotazioni del sito e del foglio; un evento visto solo nel calendario iCal conta solo se è una prenotazione: non i blocchi di Airbnb («Airbnb (Not available)»: preavviso, tempo di preparazione, notti chiuse da altri calendari) e non un evento che si accavalla a una prenotazione già nota dello stesso appartamento. Airbnb esporta solo da oggi in poi (e un calendario può riportare la stessa prenotazione con date diverse), quindi un soggiorno o un blocco in corso nel calendario «comincia» ogni giorno: senza questa regola sembrerebbe ogni giorno un arrivo nuovo (e chiederebbe di registrare ospiti mai entrati). Una prenotazione Airbnb («Reserved») non ancora nel foglio compare come «Airbnb (solo calendario)». Prossimi 7 giorni e Calendario mostrano invece tutto quello che dicono i calendari: le notti chiuse su Airbnb restano occupate. In Pulizie non ci sono i blocchi di Airbnb, ma restano le sovrapposizioni con l'avviso (vedi §6).

## 5 bis. Da fare nell'app Promemoria (iPhone e iPad)

Le cose ancora aperte di **Oggi → Da fare** possono arrivare da sole nell'app **Promemoria**, in una lista «La Columbera», con un comando rapido che le legge dal sito ogni mattina.

**Cosa arriva.** Le stesse voci di Da fare non ancora spuntate:
- «Registra ospiti su Alloggiati Web · Torre, arrivo del 5 novembre»;
- «Registra ospiti ISTAT · movimento di ottobre 2026»;
- «Manda la ricevuta · Torre, arrivo del 10 novembre»;
- le cose scritte a mano.

Non arrivano le prenotazioni da gestire e i messaggi, per cui c'è già l'email. Nei titoli non ci sono nomi né codici delle prenotazioni, solo appartamento e giorno: il titolo resta uguale anche quando una prenotazione vista prima solo nel calendario di Airbnb entra nel foglio, e i dati degli ospiti non finiscono su iCloud. Le cose scritte a mano arrivano come le hai scritte.

**In una sola direzione.** Il comando crea un promemoria solo se nella lista non ce n'è già uno con lo stesso titolo, spuntato o no:
- spuntare in Gestione non spunta il promemoria; spuntare il promemoria non spunta la voce in Gestione;
- una voce spuntata sul telefono non ricompare;
- ogni lato si spunta per conto suo: le voci automatiche spariscono da Gestione da sole quando la cosa è fatta, oppure con la spunta.

**Il link.** Gestione → Sito → Sistema → Calendari iCal → «Da fare per l'app Promemoria»: `https://<sito>/api/x?a=dafare&k=LA_TUA_CHIAVE`.
- Al posto di `LA_TUA_CHIAVE` va il valore di **`ICAL_PERSONAL_KEY`** su Vercel, la stessa chiave del calendario personale.
- Senza la chiave giusta il sito risponde «forbidden» e nessuna voce. Il comando quindi non crea promemoria sbagliati.
- La risposta è JSON: `{"oggi":"2026-11-02","voci":["…","…"]}`. Il link si può aprire nel browser per controllarlo.
- Sola lettura: non spunta e non cambia nulla in Gestione.
- Non darlo a nessuno, come il calendario personale.

**Creare il comando (una volta sola, sull'iPhone).**
1. App **Promemoria** → «Aggiungi elenco» → nome **La Columbera**.
2. App **Comandi** → «+» (nuovo comando) → nome **Da fare La Columbera**.
3. Azione **«Ottieni contenuti dell'URL»** (in inglese «Get Contents of URL»): come URL incolla il link con la chiave. Metodo GET, come già impostato.
4. Azione **«Ottieni valore dizionario»** («Get Dictionary Value»): «Ottieni **Valore** per **voci** in **Contenuti dell'URL**». Scrivi `voci` come chiave.
5. Azione **«Ripeti con ognuno»** («Repeat with Each»), su **Valore dizionario**. Le azioni 6 e 7 vanno *dentro* la ripetizione, prima di «Fine ripetizione».
6. Azione **«Trova promemoria»** («Find Reminders»):
   - con «Aggiungi filtro»: **Elenco** è **La Columbera**;
   - secondo filtro: **Titolo** è **Elemento ripetuto** (la variabile, non il testo scritto).
7. Azione **«Se»** («If»): **Promemoria** «non ha alcun valore». Dentro il «Se», azione **«Aggiungi nuovo promemoria»** («Add New Reminder»): testo **Elemento ripetuto**, elenco **La Columbera**. Il ramo «Altrimenti» resta vuoto.
8. Prova con ▶︎. La prima volta Comandi chiede il permesso di collegarsi al sito e di usare Promemoria: «Consenti sempre». Esegui di nuovo: non devono comparire doppioni. Spunta un promemoria ed esegui ancora: non deve ricomparire.

**Farlo partire da solo.** Comandi → **Automazione** → «+» → **Ora del giorno** (per esempio 8:00, ogni giorno) → **Esegui immediatamente** → scegli «Da fare La Columbera».
- Si può aggiungere una seconda automazione, per esempio alle 14.
- L'automazione va creata **solo sull'iPhone**. I promemoria arrivano sull'iPad da iCloud.
- Il comando c'è anche sull'iPad (Comandi si sincronizza) e si può eseguire a mano. Due automazioni alla stessa ora creerebbero doppioni prima che iCloud allinei i dispositivi.

**Se qualcosa non va.**
- Aprire il link nel browser: `{"err":"forbidden"}` vuol dire chiave sbagliata o assente su Vercel; `{"err":"Da fare temporaneamente non disponibile"}` vuol dire che il sito non legge i dati in quel momento, e il comando riprova alla volta dopo.
- Un titolo cambiato crea un promemoria nuovo, perché il comando confronta i titoli. Succede, per esempio, con una cosa scritta a mano tolta e riscritta diversa: il vecchio promemoria si spunta o si cancella a mano.
- Prove: W15e (stesse voci della pagina, giorno per giorno), S26 (solo con la chiave, sola lettura).

## 6. Pulizie

1. Scegli il periodo (Dal / al, oppure «7 giorni», «14 giorni», «Un mese»; di partenza le prossime due settimane, al massimo tre mesi).
2. Per ogni appartamento, giorno per giorno: chi **esce** (ospiti, entro l'orario di check-out) e chi **entra** (ospiti, notti; l'orario d'ingresso non c'è, a chi pulisce non serve); «cambio» quando nello stesso giorno uno esce e uno entra. Le prenotazioni sono le stesse di Oggi: sito, Booking e Airbnb dal foglio, calendari iCal.
3. Per ogni arrivo indica i **letti** con i due contatori − / +: quanti **matrimoniali** (fino a 3) e quanti **singoli** (fino a 6), da combinare come serve: 3 ospiti = 1 matrimoniale e 1 singolo, 2 ospiti = 2 singoli, e così via. Poi la spunta **Culla** e, se serve, una **nota** (seggiolone, asciugamani in più…). Se i posti letto sono meno degli ospiti compare «⚠ 2 posti per 3 ospiti» (la culla conta come un posto). Si salvano subito, senza «Salva modifiche» (KV `pul:info`; la voce si toglie da sola 60 giorni dopo la partenza). Le scelte fatte prima dei contatori valgono ancora: «Matrimoniale» diventa 1 matrimoniale, «Singoli» resta «letti singoli» finché non usi i contatori.
4. **Nel testo**: ogni entrata e uscita ha la spunta. Togliila a una prenotazione letta male o doppia (per esempio la stessa prenotazione arrivata dal foglio e dal calendario con date diverse): esce dal testo con la sua entrata e la sua uscita, resta nella pagina in grigio («Tolta dal testo») e la scelta vale anche le volte successive. **⚠ Si sovrappone a…** segnala due prenotazioni dello stesso appartamento che si accavallano (arrivare il giorno in cui un altro parte va bene): di solito una delle due è da togliere. Per le prenotazioni viste solo nel calendario compare anche il titolo dell'evento («Reserved», «CLOSED - Not available»), che aiuta a capire cos'è. I blocchi di Airbnb («Airbnb (Not available)»: preavviso, tempo di preparazione, notti chiuse da altri calendari) non sono ospiti e qui non compaiono: Airbnb li esporta da oggi in poi, quindi «cominciavano» ogni giorno e andavano tolti ogni giorno. Le prenotazioni vere di Airbnb («Reserved») restano, anche quando il foglio non le ha ancora.
5. Sotto ogni appartamento c'è il testo pronto: **Copia il testo** e incollalo nella chat con chi fa le pulizie (da telefono anche «Condividi…»). Nel testo non ci sono nomi, email, telefoni né codici, e nemmeno il periodo scelto («dal … al …»): dopo il nome dell'appartamento vengono subito i giorni, con orari, persone, notti e letti. I nomi li vedi solo tu, nella pagina.
5. Un arrivo senza scelta compare come «letti da confermare»; una prenotazione vista solo nel calendario iCal (senza numero di ospiti) come «ospiti da confermare».

## 7. Luoghi e convenzioni

- Finché non le modifichi, le pagine pubbliche mostrano le schede scritte in `js/dintorni.js`, identiche a prima. Alla prima modifica la Gestione ne fa una copia nelle impostazioni (`cfg.luoghi`, `cfg.convenzioni`). **Ripristina le schede di partenza** la toglie.
- Per ogni scheda: nome, due righe brevi (distanza, in breve) oppure tipo e zona, descrizione, link, etichetta e «solo d'estate» per le convenzioni, foto. Le schede si spostano con ↑ ↓ e si tolgono con ✕.
- **Foto**: «Carica foto» (ridimensionata nel browser e salvata su Vercel Blob). Senza foto la scheda usa quella della pagina ufficiale del link, se il sito è tra quelli ammessi (variabile `OG_HOSTS`), altrimenti un segnaposto. Le foto tolte si cancellano da Blob solo dopo un salvataggio riuscito.
- **Sicurezza**: il server salva solo testo (le pagine lo mostrano come testo, mai come HTML); i link solo `http(s)://…` o una pagina del sito (`eventi.html`); le foto solo `img/…` del sito o caricate su Blob. La pagina pubblica chiede le schede con `api/x?a=dintorni`, che restituisce solo quelle; se il server non risponde entro 1,5 secondi mostra quelle di partenza.
- Le proposte «Cosa fare per stagione» restano in `js/dintorni.js`.

## 7 bis. Home

- Ogni testo visibile della homepage e le sue 4 foto (prima schermata, schede di Torre e di Corte, dimora e posizione), divisi come nella pagina: Prima schermata · Appartamenti · Scheda di Torre · Scheda di Corte · Informazioni pratiche · La dimora e la posizione · Prenotazione e contatti. L'elenco dei campi, con le lunghezze massime, è in `data/home.json`.
- **Testo di partenza**: è quello scritto in `index.html` (anche per chi apre la pagina senza JavaScript e per i motori di ricerca). La Gestione lo legge da lì, quindi non c'è una seconda copia da tenere allineata. Nelle impostazioni (`cfg.home`) finiscono **solo i campi cambiati**: un campo svuotato o riportato al testo di partenza non si salva.
- **Ripristina** riporta un testo o una foto (con la sua descrizione) a quelli di partenza; **Ripristina tutta la home** riporta tutta la home, senza toccare appartamenti, prezzi, calendari e il resto. Come sempre, vale dopo «Salva modifiche».
- **Una sola fonte**: nome, sottotitolo e ospiti massimi degli appartamenti vengono da **Appartamenti → Testi** e compaiono anche nella home. Nei testi si usano come segnaposto: `{nome}` e `{max}`; nei contatti `{email}` e `{telefono}` diventano i collegamenti. Collegamenti e pulsanti portano sempre dove devono: dalla Gestione si cambia solo il loro testo.
- **Foto**: «Sostituisci la foto» usa lo stesso caricamento delle altre foto (ridimensionata nel browser fino a 1600 px, salvata su Vercel Blob). La Gestione chiede la descrizione della nuova foto: finché manca, sul sito la foto resta senza descrizione (mai quella della foto di prima). La foto sostituita si cancella da Blob dopo un salvataggio riuscito, solo se nessun'altra sezione la usa. Le foto nuove non hanno le versioni ridotte per il telefono di quelle di partenza. Se il caricamento non riesce perché Vercel Blob non è collegato o non risponde (store non collegato, store privato, chiave non valida, store eliminato o sospeso; le foto del sito vanno in uno store Blob **pubblico**, collegato al progetto con `BLOB_STORE_ID` o `BLOB_READ_WRITE_TOKEN`), la Gestione dice cosa sistemare su Vercel invece del generico «Errore interno».
- **Sul sito**: la home legge i campi cambiati con la stessa richiesta dei codici CIN/CIPAT (`api/x?a=cfg`, mai in cache) e li scrive come testo, mai come HTML. Finché la risposta non arriva si vedono per un istante i testi di partenza.
- **Sicurezza**: il server accetta solo le chiavi di `data/home.json`, salva testo semplice tagliato alla lunghezza massima e foto solo `img/…` del sito o caricate su Blob; la configurazione pubblica contiene solo questi testi e foto. Una pagina di Gestione non aggiornata (che non manda `home`) non li cancella.
- Il vecchio testo «Chi siamo» (`cfg.chi`) non compariva sul sito: resta salvato com'è e la sezione Home lo mostra, chiuso, per poterlo copiare.

## 8. Regole di prenotazione

Preavviso minimo e orario di check-in, orario di check-out, giorni prima dell'arrivo da cui si vedono Wi-Fi e informazioni riservate, numero WhatsApp: come prima, ora in un'unica sezione. **Fin dove si prenota** (6 mesi) è una regola fissa del sistema di disponibilità (`GUEST_MONTHS` in `api/_avail.js`): si legge qui ma non si cambia dalla Gestione.

## 9. Dati salvati

- `cfg`: stessi campi di prima; nuovi e facoltativi `luoghi`, `convenzioni` e `home` (assenti finché non li salvi; `home` contiene solo i campi della homepage cambiati). Nessun dato già salvato viene convertito o riscritto all'apertura o con un nuovo deploy.
- `cfg:rev`: numero di versione delle impostazioni (nuovo; assente = 0).
- `pul:info`: letti e note delle Pulizie, una voce per arrivo (nuovo): `mat` e `sing` (numero di letti matrimoniali e singoli, solo se almeno uno), `culla: true`, `nota`; `letto` m/s è la scelta di prima, che resta valida; `fuori: true` quando la prenotazione è stata tolta dal testo.
- `bkh` (prenotazioni del sito): quando una prenotazione si annulla con il rimborso si aggiungono `annullata_da` (ospite o titolare) e `rimborso` (importo, stato, riferimento Stripe, data). Le altre prenotazioni non cambiano.
- `ric`: richieste di ricevuta, una voce per prenotazione (nuovo), cancellate 30 giorni dopo l'invio.
- Dati personali nuovi solo per la ricevuta (chiesta dall'ospite): vedi `docs/gdpr/inventario-trattamenti.md` (T6e).

## 10. Verifica a mano (telefono e computer)

1. Apri `admin.html`: si apre su **Oggi**; il selettore OPERATIVITÀ | SITO resta in alto scorrendo.
2. Calendario e prezzi → Torre → «dal… al…» → tocca due notti → metti un prezzo → Applica → Salva. Ricarica la pagina: il prezzo c'è; la pagina dell'appartamento lo mostra. Su telefono il riquadro con il prezzo compare in basso appena tocchi la prima notte, senza scorrere; da computer sta accanto al calendario.
3. Blocca una notte e controlla che sul sito non sia prenotabile; mettile un prezzo diverso: la casella resta «bloccato» e mostra il nuovo prezzo. Sbloccala e salva: sul sito quella notte costa il prezzo che le hai dato. Lo stesso con una notte occupata: prende il prezzo e resta occupata; dal riquadro «Occupata: …» apri la prenotazione.
4. Apri un vecchio segnalibro (`admin.html#torre/prezzi`): deve aprirsi Calendario e prezzi di Torre.
5. Due dispositivi: apri la Gestione su telefono e computer, salva da uno, poi prova a salvare dall'altro: deve comparire l'avviso con «Ricarica» e «Salva comunque».
6. Prenotazioni → cerca un ospite per nome; apri il dettaglio di una prenotazione Airbnb → «Prepara e copia» → incolla il testo nella chat di Airbnb.
7. Sito → Luoghi e convenzioni → cambia un titolo → Salva → apri `dintorni.html`: deve comparire il nuovo titolo. Poi «Ripristina le schede di partenza» → Salva.
8. Pulizie → scegli le prossime due settimane → per un arrivo «Matrimoniale» → «Copia il testo» → incollalo in WhatsApp: ci sono giorni, persone e letti, nessun nome.
9. Rimborso (con le chiavi di prova di Stripe, carta `4242 4242 4242 4242`): prenota una data lontana, apri l'area clienti con il codice → «Annulla la prenotazione» → «Sì, annulla e rimborsa». Su Stripe il pagamento risulta rimborsato; in Gestione la prenotazione è «annullata» con «Rimborsati …»; la data è di nuovo prenotabile; ti arriva l'avviso e all'ospite l'email. Ripeti con «Annulla e rimborsa» dalla Gestione.
10. Ricevuta: dall'area clienti «Richiedi la ricevuta» con dati di prova → ti arriva l'email; in Gestione apri la prenotazione → carica un PDF → «Manda la ricevuta»: all'ospite arriva con l'allegato e nell'area risulta «inviata».
11. Telefono: apri la Gestione → tocca il pulsante in alto («OPERATIVITÀ · Oggi») → compaiono tutte le sezioni di Operatività e Sito → tocca «Pulizie»: si apre e il menu si chiude; riapri e tocca fuori dal menu: si chiude. Da computer il selettore e il menu a sinistra sono come prima.
12. App: da iPhone «Aggiungi alla schermata Home» (da Android «Installa app») su `admin.html` → l'icona «Gestione» apre la Gestione a schermo intero; «Vedi il sito» si apre nel browser.

## 11. Limiti noti

- La Gestione non si aggiorna da sola: per vedere prenotazioni e messaggi arrivati nel frattempo premi «Aggiorna» in Oggi o ricarica la pagina (la sezione Messaggi si aggiorna da sola).
- Le pagine pubbliche di Luoghi e Convenzioni fanno una richiesta in più al server; se risponde dopo 1,5 secondi si vedono le schede di partenza fino al caricamento successivo.
- Le foto caricate per una scheda e poi abbandonate senza salvare restano su Blob (come già per le foto degli appartamenti).
- «Salva comunque» sostituisce tutte le impostazioni con quelle della pagina: va usato solo quando sai che le modifiche dell'altro dispositivo non servono.
