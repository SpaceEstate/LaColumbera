# Pagamenti e conferma delle prenotazioni

Come funziona e come controllare che una prenotazione pagata arrivi davvero (a te, all'ospite, sul foglio e sul calendario).

## Dove paga l'ospite

1. Nella pagina dell'appartamento sceglie le date e gli ospiti: **adulti** e **bambini sotto i 4 anni** (gratis: non pagano il supplemento degli ospiti in più, ma contano per il massimo dell'appartamento). «Prenota» apre la **pagina di prenotazione** del sito (`prenota.html`), con il riepilogo a lato: foto, date, ospiti, il conto riga per riga e la regola di annullamento.
2. Scrive **nome, cognome, email e telefono** (facoltativo) e preme «Continua al pagamento»: la prenotazione si registra e le notti vengono trattenute.
3. Sotto compaiono i **campi della carta**, con i colori e il carattere del sito (anche Apple Pay e Google Pay, se attivi su Stripe). I numeri della carta li riceve solo Stripe: il sito non li vede mai. Se la banca chiede una conferma (codice via SMS o app) compare una finestra della banca, oppure si passa per un attimo dalla pagina della banca e si torna su quella del sito.
4. Pagamento riuscito: la stessa pagina dice «Prenotazione confermata» con il codice.

L'ospite può tornare ai dati («Modifica») o alle date («← Modifica date e ospiti»): le notti trattenute si liberano subito, così come se lascia la pagina senza pagare. Una carta rifiutata mostra il messaggio della banca e si riprova. Dopo 30 minuti senza pagare la pagina torna ai dati (già scritti) e le notti non sono più trattenute.

**Senza la chiave pubblicabile** (`STRIPE_PUBLISHABLE_KEY`, vedi sotto) tutto funziona come prima: dopo i dati l'ospite paga sulla pagina di Stripe e poi torna sulla pagina di prenotazione. Gestione → Sito → Sistema → «Pagamenti ed email» lo segnala («Pagamento nella pagina del sito»).

## Cosa succede quando un ospite paga

1. L'ospite sceglie le date: le notti vengono **trattenute** per 35 minuti mentre paga.
2. Pagamento riuscito → la prenotazione diventa **confermata**, le notti si **chiudono** (sito e calendario iCal per Booking/Airbnb), la riga va sul **foglio**, ti arriva l'**email di nuova prenotazione**, all'ospite arriva la **conferma** con il link all'area clienti.
3. Se l'ospite non paga, le notti tornano libere da sole.

La conferma parte da **tre strade**, tutte con lo stesso percorso (nessun doppione se arrivano insieme):

| Strada | Quando |
|---|---|
| Webhook di Stripe | Normalmente, pochi secondi dopo il pagamento |
| Pagina di prenotazione, appena pagato (o al ritorno dalla pagina della banca o di Stripe) | La pagina chiede lo stato e, se serve, il sito controlla direttamente su Stripe. Se la banca non ha confermato il pagamento lo dice e si può riprovare |
| Sincronizzazione automatica (ogni pochi minuti) | Ricontrolla su Stripe le prenotazioni rimaste «in attesa» da più di 3 minuti |

Se il pagamento arriva quando le date non sono più libere (o non si possono verificare), la prenotazione resta **«da verificare»**: ti arriva un'email, all'ospite non scrive nessuno e decidi tu da Gestione → Prenotazioni (conferma o annulla/rimborsa). Un pagamento ripetuto non la conferma mai da solo.

## Controllo in un colpo d'occhio

**Gestione → Sito → Sistema → «Pagamenti ed email»**: semaforo per Stripe, webhook, email, foglio e prenotazioni rimaste a metà. «Invia email di prova» manda un messaggio al tuo indirizzo per verificare l'invio. Lo stesso controllo, riassunto in un semaforo unico insieme alla sincronizzazione, è in **Gestione → Operatività → Oggi** («Stato del sistema»).

## Impostazioni su Vercel (Settings → Environment Variables)

| Variabile | A cosa serve |
|---|---|
| `STRIPE_SECRET_KEY` | Incassi (chiave segreta del tuo account Stripe) |
| `STRIPE_PUBLISHABLE_KEY` | **Nuova.** Campi della carta nella pagina del sito: Stripe → Sviluppatori → Chiavi API → «Chiave pubblicabile» (`pk_live_…`; per le prove `pk_test_…`, insieme alla chiave segreta di prova). Deve essere dello stesso tipo della chiave segreta. Senza, si paga sulla pagina di Stripe come prima |
| `STRIPE_WEBHOOK_SECRET` | «Signing secret» del webhook di **questo sito** |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Invio delle email (password per le app di Gmail) |
| `OWNER_EMAIL` | Dove ricevi gli avvisi (se manca: l'indirizzo predefinito) |
| `REPLY_TO` | A chi risponde l'ospite (se manca: lacolumbera@gmail.com) |
| `SHEET_WEBAPP_URL`, `SHEET_SECRET` | Foglio prenotazioni |
| `SYNC_SECRET` | Sincronizzazione automatica (script del foglio) |

## Webhook su Stripe (Sviluppatori → Webhook)

- **Questo sito**: indirizzo `https://la-columbera.vercel.app/api/stripe-webhook`, eventi `checkout.session.completed` e `checkout.session.expired`.
- **App di check-in** (tassa di soggiorno): `https://checkin-six-coral.vercel.app/api/stripeWebhook`, evento `checkout.session.completed`.
- Ogni webhook ha il proprio «signing secret», da copiare nella variabile del progetto giusto. Con un solo account Stripe i due sistemi ricevono gli eventi l'uno dell'altro: il check-in ignora i pagamenti delle prenotazioni; questo sito, dai pagamenti del check-in, prende solo il numero di prenotazione per sapere che il check-in è fatto (vedi sotto).

## Check-in online e area clienti

- **Dall'area clienti** il riquadro «Check-in online» apre il modulo del check-in con il codice della prenotazione e la lingua dell'area già dentro (nel frammento `#` dell'indirizzo, che non arriva a nessun server): il modulo verifica da solo la prenotazione e parte dai dati del soggiorno, senza chiedere il numero. Lo stesso per la **Trentino Guest Card**: arrivando dall'area la prenotazione è già riconosciuta e il campo del codice non si mostra («Usa un altro codice» lo riapre).
- **Quando il check-in conta come fatto:** l'ospite l'ha aperto con il numero di prenotazione (dall'area clienti o scrivendolo nel primo passo) e il pagamento dell'imposta di soggiorno è riuscito. Chi sceglie «Non ho il numero di prenotazione» fa il check-in come prima, ma l'area clienti non lo sa.
- **Come lo sa il sito:** il pagamento del check-in porta nei metadati di Stripe il numero della prenotazione; il webhook di questo sito (lo stesso di sempre, nessuna impostazione nuova) lo registra. Se il webhook non arriva, la sincronizzazione ricontrolla su Stripe, al più ogni 10 minuti, i pagamenti del check-in degli ultimi 3 giorni e nel registro eventi resta l'avviso.
- **Nell'area clienti**, dopo il check-in: il riquadro diventa «Check-in completato» (sbiadito, non si tocca più) e compare il **codice della cassetta delle chiavi**, negli stessi giorni del Wi-Fi (da quanti giorni prima dell'arrivo lo decidi in Gestione → Sito → Regole di prenotazione) fino al giorno della partenza; prima compare il giorno da cui lo troverà. Se l'ospite torna sull'area mentre il check-in è aperto in un'altra scheda, la pagina si aggiorna da sola.
- **Il codice della cassetta** lo scrivi in Gestione → Sito → Appartamenti → Area ospiti («Codice della cassetta delle chiavi»). È lo stesso che il check-in manda via email, che invece lo legge dalle variabili `CODICE_CASSETTA_TORRE` e `CODICE_CASSETTA_CORTE` del progetto Check-in su Vercel: **se cambi il codice, cambialo in tutti e due i posti**. Se il campo in Gestione è vuoto, l'area usa quelle stesse variabili, se le imposti anche in questo progetto; senza nessuna delle due, l'area dice solo che il codice è nell'email del check-in.
- **Chi vede il codice:** chi entra nell'area con il codice della prenotazione (come per il Wi-Fi), solo dopo il check-in pagato e solo nei giorni del soggiorno. Prima arrivava soltanto con l'email del check-in.

## Apple Pay e Google Pay (facoltativi)

Compaiono tra i campi della carta se sono attivi in Stripe → Impostazioni → Metodi di pagamento. **Apple Pay** nella pagina del sito richiede anche il dominio registrato: Stripe → Impostazioni → Domini dei metodi di pagamento → aggiungi il dominio del sito (es. `la-columbera.vercel.app` e, se c'è, il dominio tuo). Google Pay non richiede altro.

## Prova completa (una volta, e dopo ogni modifica alle chiavi)

1. Gestione → Sito → Sistema → «Pagamenti ed email»: tutto verde; «Invia email di prova» e controlla la posta (anche lo spam).
2. Fai una prenotazione di prova per una data lontana pagando con una carta vera (poi rimborsala da Stripe) oppure, con le chiavi di prova (segreta e pubblicabile), con la carta `4242 4242 4242 4242`; con la carta `4000 0025 0000 3155` vedi anche la conferma della banca. Prova un'altra volta con 1 bambino: il prezzo non cambia e l'email dice «di cui 1 bambino sotto i 4 anni».
3. Controlla: email a te, email all'ospite, riga sul foglio, notti chiuse sul sito, «Ultimo avviso da Stripe» compilato nella scheda.
4. Annulla la prenotazione di prova da Gestione → Prenotazioni.

## Annullamento e rimborso

- **L'ospite** annulla da solo dall'area clienti (scheda «Il soggiorno» → «Annullamento») **fino a 7 giorni prima dell'arrivo** (giorni di calendario, ora di Roma: per un arrivo il 20 si annulla fino al 13 compreso). Due passi: il pulsante, poi la conferma con l'importo. Rimborso **totale**, sulla carta con cui ha pagato. Dopo quel giorno l'area mostra solo la regola; chi prenota a meno di 7 giorni dall'arrivo non è rimborsabile. La regola è scritta nella pagina dell'appartamento prima di pagare e nell'email di conferma.
- **Tu**, da Gestione → Prenotazioni → dettaglio → «Annulla e rimborsa», in qualsiasi momento, anche per le prenotazioni «da verificare».
- **Cosa succede:** prima il rimborso su Stripe; poi la prenotazione diventa «annullata», le notti tornano libere sul sito e spariscono dal calendario «solo sito» che leggono Booking e Airbnb (alla loro prossima lettura, di solito entro qualche ora); la riga del foglio diventa ANNULLATA (con la coda di ripresa se il foglio non risponde); all'ospite arriva l'email con l'importo rimborsato e, se ha annullato lui, a te arriva l'avviso. Le chat e i messaggi automatici si fermano.
- **Sicurezza dei soldi:** se Stripe non risponde non cambia nulla e si può riprovare; ogni prenotazione ha una chiave di idempotenza (`lc-rimborso-<codice>`), quindi un doppio tocco o un nuovo tentativo dopo un errore a metà non rimborsano due volte; se il pagamento era già stato rimborsato dalla dashboard, la prenotazione si annulla senza un secondo rimborso.
- **Costi:** il rimborso non costa nulla, ma Stripe **non restituisce la sua commissione** sul pagamento originale. Nessun servizio aggiuntivo.
- **Non coperti:** le prenotazioni di Booking.com e Airbnb (si annullano sulla piattaforma), le prenotazioni senza pagamento online (cambia lo stato), i rimborsi parziali (dalla dashboard di Stripe), l'imposta di soggiorno pagata con il check-in online (è un altro sistema: va rimborsata a parte, se serve); una Trentino Guest Card già emessa resta valida (non si revoca dal sito).

## Ricevuta su richiesta

Il sito non emette documenti fiscali (servirebbe un servizio a pagamento). L'ospite chiede la ricevuta dall'area clienti con nome, codice fiscale (controllato; facoltativo per chi non risiede in Italia) e indirizzo; a te arriva un'email con i dati. La emetti come fai di solito, poi da Gestione → Prenotazioni → dettaglio → «Ricevuta» carichi il PDF e parte all'ospite in allegato. All'area ospiti tornano solo lo stato e l'email mascherata, mai i dati inseriti; i dati si cancellano 30 giorni dopo l'invio (richieste mai evase: dopo un anno). Al massimo 5 richieste valide al giorno per prenotazione. La richiesta si fa dall'area clienti, che resta aperta fino a 7 giorni dopo la partenza: dopo, l'ospite ti scrive.

## Limiti da conoscere

- I calendari iCal non sono istantanei: Booking e Airbnb rileggono il tuo calendario ogni alcune ore, e il sito rilegge i loro ogni circa 10 minuti. Nella finestra tra due letture una stessa notte può essere prenotata su due canali: è un limite del formato iCal (solo un gestionale con collegamento diretto lo elimina).
- Su Booking e Airbnb si inserisce il link «solo sito» (Gestione → Sito → Sistema → Calendari iCal, `...&for=site`): contiene soltanto le prenotazioni fatte dal sito, quindi non c'è rischio di «blocchi fantasma». I blocchi manuali di Gestione → Operatività → Calendario e prezzi valgono solo sul sito: le stesse notti vanno chiuse a mano anche su Booking e Airbnb.
- Per te c'è un calendario separato con tutto (sito, Booking, Airbnb, Torre e Corte, nomi degli ospiti): `...?a=ical&for=all&id=all&k=<ICAL_PERSONAL_KEY>`. Non va mai dato a Booking o Airbnb.
