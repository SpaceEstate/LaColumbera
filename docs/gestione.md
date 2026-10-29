# Gestione (pannello del titolare) – La Columbera

Ambito: la pagina `admin.html`, divisa in due aree. Codice: `js/admin.js` (nucleo: aree, menu, indirizzi, salvataggio), `js/admin-operativita.js` (Oggi, Prenotazioni, Guest Card), `js/admin-calendario.js` (Calendario e prezzi), `js/admin-pulizie.js` (Pulizie), `js/admin-sito.js` (sezioni del Sito); Messaggi in `js/admin-messaggi.js`, Adempimenti in `js/adempimenti.js` e `js/istat.js`. Server: `api/x.js` (azioni `cfg_admin`, `save`, `dintorni`, `adm`, `pul_info`, `pul_set`). Prove: `tests/sim/ui.js` (W14–W22), `tests/sim/sicurezza.js` (S18–S20).

## 1. Le due aree

In alto c'è sempre il selettore **OPERATIVITÀ | SITO**. Su telefono, sotto il selettore, il menu delle sezioni scorre in orizzontale; da computer è a sinistra. Il selettore ricorda l'ultima sezione aperta di ciascuna area. Un pallino dorato sull'altra area vuol dire che lì c'è qualcosa da guardare: prenotazioni da gestire o messaggi da leggere in Operatività, problemi di sincronizzazione in Sito.

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
| | **Home · Chi siamo** | Il testo della home |
| | **Eventi** | Eventi inseriti a mano (si salvano subito) |
| | **Luoghi e convenzioni** | Le schede delle pagine «Luoghi di interesse» e «Convenzioni» (nuovo) |
| | **Regole di prenotazione** | Preavviso minimo, orari di check-in e check-out, Wi-Fi visibile da…, WhatsApp; fin dove si prenota |
| | **Sistema** | Sincronizzazione, pagamenti ed email, riconciliazione, registro; Calendari iCal |

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

1. Scegli l'appartamento (Torre / Corte) oppure **Entrambi** per vedere le prossime 8 settimane in una tabella: chi c'è, le notti bloccate, il prezzo delle notti libere.
2. Seleziona le notti: **giorno per giorno** (tocchi le notti una alla volta; da computer Maiusc + clic per un intervallo) oppure **dal… al…** (tocchi la prima e l'ultima notte). C'è anche «Oppure scrivi le date».
3. Nel riquadro sotto il calendario scegli cosa fare sulle notti selezionate:
   - **Prezzo a notte del 1° ospite** → «Applica»; «Prezzo normale» toglie il prezzo messo a mano e torna a quello di stagione o al prezzo base;
   - **Blocca** / **Sblocca** (vale solo sul sito: le stesse notti vanno chiuse anche su Booking e Airbnb);
   - **Notti minime per chi arriva in questi giorni** → «Applica» o «Togli». Se quei giorni erano dentro un periodo con un altro minimo, il periodo viene spezzato attorno a loro.
4. **Salva modifiche.**

Nelle caselle: il prezzo del 1° ospite (in oro se messo a mano), «bloccato», il nome di chi occupa la notte (o Booking / Airbnb) e «min N» quando il minimo è diverso dal solito. Una notte occupata da una prenotazione si apre con un tocco. Sotto il calendario restano prezzo base e ospiti in più, prezzi di stagione, notti minime, notti bloccate (anche per mese intero) e la chiusura dell'appartamento. I dati salvati sono gli stessi di prima (`prices`, `periodi`, `blocked`, `minPeriodi`, `closed`): sito e server calcolano esattamente come prima.

## 5. Prenotazioni e Oggi

- **Fonti, senza doppioni.** Prenotazioni del sito (con nome, email, importo); Booking.com e Airbnb dal foglio, con il loro numero ma senza nome né importo; i calendari iCal per ciò che il foglio non ha ancora («solo calendario»). Il foglio contiene anche le prenotazioni del sito: queste si mostrano una volta sola, con i dati del sito.
- **Ricerca** per codice (anche a gruppi o minuscolo), nome, email, telefono. **Filtri**: Tutte, Da gestire, Prossime, Passate, Annullate; origine (Sito, Booking.com, Airbnb, Manuale).
- **Dettaglio**: arrivo con l'orario di check-in, partenza con il check-out, notti, ospiti; contatti con telefono e WhatsApp; pagamento riga per riga come lo vede l'ospite, con il link al pagamento su Stripe; il **codice per l'area ospiti** da copiare e un **messaggio pronto** (benvenuto per il sito, link all'area ospiti per Booking e Airbnb: si incolla nella chat del portale); messaggi e invii programmati; stato, Guest Card precompilata, «Vedi nel calendario», «Rimuovi dallo storico». Aprire il dettaglio non segna i messaggi come letti.
- **Annulla e rimborsa** (nel dettaglio, per le prenotazioni del sito pagate, confermate o «da verificare»): dopo la conferma rimborsa l'intero importo su Stripe, annulla la prenotazione (notti di nuovo libere sul sito e, alla prossima lettura del calendario, su Booking e Airbnb), aggiorna il foglio e manda l'email all'ospite. Vale in qualsiasi momento; l'ospite invece annulla da solo dall'area clienti solo fino a 7 giorni prima dell'arrivo (ti arriva un'email). Per un rimborso parziale usa la dashboard di Stripe e poi cambia lo stato. Vedi `docs/pagamenti.md` §«Annullamento e rimborso».
- **Ricevuta** (nel dettaglio): se l'ospite l'ha chiesta dall'area clienti trovi i dati per intestarla (con «Copia i dati»); emetti la ricevuta come fai di solito, poi carichi il PDF (o una foto JPG/PNG, al massimo 3 MB) e parte all'ospite in allegato, con un messaggio facoltativo. Il file non resta sul sito. In alternativa «Segna come mandata» o «Togli la richiesta». Alle prenotazioni del sito la puoi mandare anche senza richiesta. In **Oggi → Da fare** compaiono le ricevute da mandare.
- **Prenotazioni manuali** (prese da te per telefono o di persona): nel foglio Google **Prenotazioni** scrivi una riga nuova lasciando vuoto «Numero Prenotazione»: data di check-in, appartamento (menu), numero di ospiti, numero di notti e, nella colonna **NOTE** (Q), quello che vuoi ricordare (per esempio «Rossi, 300 € contanti»). Entro 5 minuti lo script del foglio le dà un codice (`M` + 9 caratteri, non si indovina), FONTE «MANUALE» e STATO «CONFERMATA»: le notti si chiudono sul sito e la prenotazione compare qui come **Manuale**, con la nota, in Prenotazioni, Oggi e Pulizie. Con quel codice l'ospite entra nell'area clienti (check-in online, Guest Card, informazioni): nel dettaglio c'è il messaggio pronto da mandargli per WhatsApp, SMS o email. Su Booking e Airbnb le notti chiudile tu come prima (il sito passa ai portali solo le sue prenotazioni). Per annullarla scrivi ANNULLATA nella colonna STATO. Una riga a cui manca la data, l'appartamento o le notti resta com'è finché non la completi.
- **Pulizia del foglio**: ogni notte (alle 3) lo script cancella dal foglio le prenotazioni concluse da più di **7 giorni** (dall'ottavo giorno dopo il check-out); quelle senza notti un mese dopo il check-in, quelle annullate senza date una settimana dopo l'annullamento. Nel sito restano le prenotazioni del sito; per Booking e Airbnb restano i portali; le manuali spariscono del tutto, nota compresa. L'ultima prenotazione rimasta non si cancella finché non ne arriva un'altra (il sito, se il foglio si svuota di colpo, smette di fidarsi e blocca il calendario). Proprietà dello script `ELIMINA_DOPO_GIORNI` (7; `0` = non cancellare). Dettagli e installazione: [`foglio-prenotazioni.md`](foglio-prenotazioni.md).
- **Semaforo unico** in Oggi: sincronizzazione (subito) più pagamenti ed email (controllo su Stripe, al massimo ogni 5 minuti; «Aggiorna» lo rifà). Verde «Tutto ok», giallo «Da guardare», rosso «Da sistemare», con il motivo; un tocco apre Sito → Sistema.

## 6. Pulizie

1. Scegli il periodo (Dal / al, oppure «7 giorni», «14 giorni», «Un mese»; di partenza le prossime due settimane, al massimo tre mesi).
2. Per ogni appartamento, giorno per giorno: chi **esce** (ospiti, entro l'orario di check-out) e chi **entra** (ospiti, notti, dall'orario di check-in); «cambio» quando nello stesso giorno uno esce e uno entra. Le prenotazioni sono le stesse di Oggi: sito, Booking e Airbnb dal foglio, calendari iCal.
3. Per ogni arrivo scegli **Matrimoniale** o **Singoli** (toccarla di nuovo la toglie) e, se serve, una **nota** (culla, letto aggiuntivo…). Si salvano subito, senza «Salva modifiche» (KV `pul:info`; la voce si toglie da sola 60 giorni dopo la partenza).
4. **Nel testo**: ogni entrata e uscita ha la spunta. Togliila a una prenotazione letta male o doppia (per esempio un blocco del calendario di Airbnb, o la stessa prenotazione arrivata dal foglio e dal calendario con date diverse): esce dal testo con la sua entrata e la sua uscita, resta nella pagina in grigio («Tolta dal testo») e la scelta vale anche le volte successive. **⚠ Si sovrappone a…** segnala due prenotazioni dello stesso appartamento che si accavallano (arrivare il giorno in cui un altro parte va bene): di solito una delle due è da togliere. Per le prenotazioni viste solo nel calendario compare anche il titolo dell'evento («Reserved», «Airbnb (Not available)», «CLOSED - Not available»), che aiuta a capire cos'è.
5. Sotto ogni appartamento c'è il testo pronto: **Copia il testo** e incollalo nella chat con chi fa le pulizie (da telefono anche «Condividi…»). Nel testo non ci sono nomi, email, telefoni né codici: solo giorni, orari, persone, notti e letti. I nomi li vedi solo tu, nella pagina.
5. Un arrivo senza scelta compare come «letti da confermare»; una prenotazione vista solo nel calendario iCal (senza numero di ospiti) come «ospiti da confermare».

## 7. Luoghi e convenzioni

- Finché non le modifichi, le pagine pubbliche mostrano le schede scritte in `js/dintorni.js`, identiche a prima. Alla prima modifica la Gestione ne fa una copia nelle impostazioni (`cfg.luoghi`, `cfg.convenzioni`). **Ripristina le schede di partenza** la toglie.
- Per ogni scheda: nome, due righe brevi (distanza, in breve) oppure tipo e zona, descrizione, link, etichetta e «solo d'estate» per le convenzioni, foto. Le schede si spostano con ↑ ↓ e si tolgono con ✕.
- **Foto**: «Carica foto» (ridimensionata nel browser e salvata su Vercel Blob). Senza foto la scheda usa quella della pagina ufficiale del link, se il sito è tra quelli ammessi (variabile `OG_HOSTS`), altrimenti un segnaposto. Le foto tolte si cancellano da Blob solo dopo un salvataggio riuscito.
- **Sicurezza**: il server salva solo testo (le pagine lo mostrano come testo, mai come HTML); i link solo `http(s)://…` o una pagina del sito (`eventi.html`); le foto solo `img/…` del sito o caricate su Blob. La pagina pubblica chiede le schede con `api/x?a=dintorni`, che restituisce solo quelle; se il server non risponde entro 1,5 secondi mostra quelle di partenza.
- Le proposte «Cosa fare per stagione» restano in `js/dintorni.js`.

## 8. Regole di prenotazione

Preavviso minimo e orario di check-in, orario di check-out, giorni prima dell'arrivo da cui si vedono Wi-Fi e informazioni riservate, numero WhatsApp: come prima, ora in un'unica sezione. **Fin dove si prenota** (6 mesi) è una regola fissa del sistema di disponibilità (`GUEST_MONTHS` in `api/_avail.js`): si legge qui ma non si cambia dalla Gestione.

## 9. Dati salvati

- `cfg`: stessi campi di prima; nuovi e facoltativi `luoghi` e `convenzioni` (assenti finché non li salvi). Nessun dato già salvato viene convertito o riscritto all'apertura.
- `cfg:rev`: numero di versione delle impostazioni (nuovo; assente = 0).
- `pul:info`: letti e note delle Pulizie, una voce per arrivo (nuovo); `fuori: true` quando la prenotazione è stata tolta dal testo.
- `bkh` (prenotazioni del sito): quando una prenotazione si annulla con il rimborso si aggiungono `annullata_da` (ospite o titolare) e `rimborso` (importo, stato, riferimento Stripe, data). Le altre prenotazioni non cambiano.
- `ric`: richieste di ricevuta, una voce per prenotazione (nuovo), cancellate 30 giorni dopo l'invio.
- Dati personali nuovi solo per la ricevuta (chiesta dall'ospite): vedi `docs/gdpr/inventario-trattamenti.md` (T6e).

## 10. Verifica a mano (telefono e computer)

1. Apri `admin.html`: si apre su **Oggi**; il selettore OPERATIVITÀ | SITO resta in alto scorrendo.
2. Calendario e prezzi → Torre → «dal… al…» → tocca due notti → metti un prezzo → Applica → Salva. Ricarica la pagina: il prezzo c'è; la pagina dell'appartamento lo mostra.
3. Blocca una notte e controlla che sul sito non sia prenotabile; sbloccala e salva.
4. Apri un vecchio segnalibro (`admin.html#torre/prezzi`): deve aprirsi Calendario e prezzi di Torre.
5. Due dispositivi: apri la Gestione su telefono e computer, salva da uno, poi prova a salvare dall'altro: deve comparire l'avviso con «Ricarica» e «Salva comunque».
6. Prenotazioni → cerca un ospite per nome; apri il dettaglio di una prenotazione Airbnb → «Prepara e copia» → incolla il testo nella chat di Airbnb.
7. Sito → Luoghi e convenzioni → cambia un titolo → Salva → apri `dintorni.html`: deve comparire il nuovo titolo. Poi «Ripristina le schede di partenza» → Salva.
8. Pulizie → scegli le prossime due settimane → per un arrivo «Matrimoniale» → «Copia il testo» → incollalo in WhatsApp: ci sono giorni, persone e letti, nessun nome.
9. Rimborso (con le chiavi di prova di Stripe, carta `4242 4242 4242 4242`): prenota una data lontana, apri l'area clienti con il codice → «Annulla la prenotazione» → «Sì, annulla e rimborsa». Su Stripe il pagamento risulta rimborsato; in Gestione la prenotazione è «annullata» con «Rimborsati …»; la data è di nuovo prenotabile; ti arriva l'avviso e all'ospite l'email. Ripeti con «Annulla e rimborsa» dalla Gestione.
10. Ricevuta: dall'area clienti «Richiedi la ricevuta» con dati di prova → ti arriva l'email; in Gestione apri la prenotazione → carica un PDF → «Manda la ricevuta»: all'ospite arriva con l'allegato e nell'area risulta «inviata».

## 11. Limiti noti

- La Gestione non si aggiorna da sola: per vedere prenotazioni e messaggi arrivati nel frattempo premi «Aggiorna» in Oggi o ricarica la pagina (la sezione Messaggi si aggiorna da sola).
- Le pagine pubbliche di Luoghi e Convenzioni fanno una richiesta in più al server; se risponde dopo 1,5 secondi si vedono le schede di partenza fino al caricamento successivo.
- Le foto caricate per una scheda e poi abbandonate senza salvare restano su Blob (come già per le foto degli appartamenti).
- «Salva comunque» sostituisce tutte le impostazioni con quelle della pagina: va usato solo quando sai che le modifiche dell'altro dispositivo non servono.
