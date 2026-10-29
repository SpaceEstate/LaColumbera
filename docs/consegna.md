# Consegna: area clienti tipo app, messaggi, nuova Gestione – La Columbera

Riepilogo per il titolare del lavoro fatto in quattro fasi sul branch `claude/ecstatic-allen-x178x6` (un commit per fase). I dettagli tecnici sono nei documenti indicati.

| Fase | Commit | Documento |
|---|---|---|
| 1. Si entra con il solo codice della prenotazione | `35385c3` | `docs/gdpr/sicurezza-accessi.md` |
| 2. Area clienti tipo app | `f6b351b` | `docs/gdpr/sicurezza-accessi.md`, `privacy.html` |
| 3. Messaggi, template, automatici, traduzione | `7b2be8f` | `docs/messaggi.md` |
| 4. Gestione in due aree: Operatività \| Sito | `43be5a5` | `docs/gestione.md` |

## Cosa cambia per gli ospiti

- **Per entrare basta il codice** della prenotazione: niente email né data. I codici nuovi del sito sono di 13 caratteri casuali, mostrati a gruppi (`558R TE56 487A9`); per Booking.com e Airbnb vale il numero del portale, letto dal foglio. Si possono scrivere in minuscolo, con spazi o trattini. Il link della mail di conferma apre l'area con un tocco. L'area resta aperta fino a **7 giorni dopo il check-out** (per tutti: codice e link); dopo, chi apre il link legge «Il soggiorno è finito».
- **Area clienti tipo app** (si può aggiungere alla schermata Home del telefono): soggiorno con orari e indirizzo, aggiungi al calendario, riepilogo del pagamento riga per riga, informazioni della casa e Wi-Fi (solo nei giorni giusti), dintorni ed eventi, check-in online e Trentino Guest Card, in italiano, inglese e tedesco.
- **Messaggi con te** (solo prenotazioni confermate del sito; Booking e Airbnb scrivono sulla loro piattaforma), tradotti automaticamente nella loro lingua se attivi DeepL. Quando scrivi, all'ospite arriva un'email con il testo e il pulsante «Rispondi», che apre i messaggi senza chiedere il codice. Le conversazioni si cancellano 7 giorni dopo la partenza (in Messaggi → Automatici → Impostazioni puoi allungare il periodo).
- **Foto degli appartamenti a tutto schermo**: si tocca la foto (o ⤢) e si apre grande, con lo sfondo sfocato; si scorre col dito, con le frecce o con la tastiera, e si chiude con ×, Esc, un tocco fuori dalla foto o trascinando in giù. Le foto verticali si vedono intere.
- **Come trovarci riorganizzata**: in alto indirizzo, parcheggio e fermata con i pulsanti per il navigatore; poi la mappa, come arrivare in auto, in treno e in aereo passo per passo, gli autobus con gli orari subito in vista e le foto, e il numero da chiamare se ci si perde.
- **Annullamento con rimborso**: l'ospite annulla da solo dall'area clienti fino a 7 giorni prima dell'arrivo e riceve il rimborso totale sulla carta, in automatico; la regola si legge prima di pagare e nell'email di conferma. Dopo, o per chi prenota a meno di 7 giorni dall'arrivo, non è rimborsabile.
- **Ricevuta su richiesta**: l'ospite la chiede dall'area clienti con i suoi dati e la riceve via email quando la mandi tu.
- **Luoghi di interesse**: le 4 foto delle convenzioni ora si vedono intere; Garda, Val di Non, i meli in fiore, il Bondone d'estate, gli eventi d'estate e Trento d'inverno prendono la foto da pagine ufficiali dedicate (vedi i limiti).

## Cosa cambia per te

- **Gestione in due aree**, con il selettore sempre in alto: **Operatività** (Oggi, Calendario e prezzi, Prenotazioni, Messaggi, Adempimenti, Guest Card) e **Sito** (Appartamenti, Home · Chi siamo, Eventi, Luoghi e convenzioni, Regole di prenotazione, Sistema).
- **Oggi**: cosa c'è da fare, chi arriva e chi parte oggi e domani, gli invii automatici, i prossimi 7 giorni e un semaforo unico per sincronizzazione, pagamenti ed email.
- **Calendario e prezzi**: tocchi le notti (anche «dal… al…») e in un colpo cambi prezzo, blocchi o fissi un minimo di notti.
- **Prenotazioni**: sito, Booking e Airbnb in un solo elenco con ricerca; nel dettaglio il codice e un messaggio pronto da copiare nella chat del portale.
- **Messaggi**: conversazioni, template, messaggi automatici (es. il giorno prima dell'arrivo) e programmati. In ogni template scegli se parte da solo (appena la prenotazione è confermata, oppure qualche giorno prima o dopo il check-in o il check-out) o se lo usi a mano. Quando un ospite scrive ti arriva un'email con il testo e «Rispondi», che apre la conversazione.
- **Pulizie**: per il periodo che scegli, un testo per Corte e uno per Torre con entrate, uscite, ospiti, notti e letti (quanti matrimoniali e quanti singoli, combinabili, più la culla; senza l'orario d'ingresso), da copiare e mandare a chi fa le pulizie. Senza nomi degli ospiti. Con la spunta «Nel testo» togli le prenotazioni lette male o doppie; quelle che si accavallano sono segnalate.
- **Luoghi e Convenzioni** ora si modificano dalla Gestione.
- **Prenotazioni manuali** (telefono, di persona): le scrivi nel foglio Prenotazioni senza numero, con data, appartamento, ospiti, notti e una nota (per esempio il prezzo). Il foglio mette il codice da solo; le notti si chiudono sul sito e in Gestione la vedi come «Manuale», con la nota. Con il codice l'ospite entra nell'area clienti.
- **Foglio più corto**: ogni notte lo script cancella le prenotazioni concluse da più di 7 giorni (le manuali spariscono del tutto, nota compresa); l'ultima resta finché non ne arriva un'altra. Va installata la revisione nuova dello script: `docs/foglio-prenotazioni.md`.
- **Annulla e rimborsa** nel dettaglio della prenotazione, in qualsiasi momento (rimborso totale su Stripe, notti libere, foglio, email all'ospite). Quando annulla l'ospite ti arriva un'email.
- **Ricevute**: quando un ospite la chiede ti arriva un'email con i dati; la emetti come fai di solito e in Gestione carichi il PDF, che parte all'ospite. In Oggi trovi quelle da mandare.
- **Salvataggio più sicuro**: la barra «Salva modifiche» compare solo quando serve e dice dove hai modificato; se hai salvato da un altro dispositivo nel frattempo, nulla viene sovrascritto senza chiedertelo.
- Tutti i vecchi indirizzi della Gestione e i link delle email continuano a funzionare.

## Cosa non è cambiato

Pagamento con Stripe e webhook, motore delle disponibilità (iCal, foglio, coda di ripresa; dello script del foglio cambiano solo le prenotazioni manuali e la pulizia notturna, la sincronizzazione è identica), Alloggiati Web e ISTAT, Trentino Guest Card, calcolo dei prezzi, preavviso e orizzonte di 6 mesi. I dati già salvati non vengono convertiti: i campi nuovi sono facoltativi e, finché non li usi, il sito pubblico resta identico. Prenotazioni esistenti con codici più corti non ce ne sono (lo hai confermato): i codici del foglio Booking/Airbnb restano quelli del portale.

## Variabili su Vercel

| Variabile | Serve | Note |
|---|---|---|
| `DEEPL_API_KEY` | **Nuova, facoltativa**: traduzione automatica dei messaggi | Per i messaggi degli ospiti usa il piano **Pro** (i testi non vengono conservati da DeepL); le chiavi che finiscono con `:fx` sono del piano gratuito. Senza la variabile tutto funziona in italiano |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Email (come prima), anche gli avvisi dei messaggi | – |
| `OWNER_EMAIL` | Dove ricevi avvisi e messaggi (come prima) | – |
| `OG_HOSTS` | Facoltativa: siti in più da cui prendere la foto di una scheda di Luoghi o Convenzioni | es. `sun7caffe.it,bistro.it` |

Nessun altro servizio esterno è stato aggiunto (DeepL solo se imposti la chiave).

## Verifica a mano (dopo il deploy di anteprima)

1. **Accesso**: prenotazione di prova con Stripe in modalità test → il link della mail apre l'area clienti; poi in un'altra finestra entra scrivendo solo il codice (anche in minuscolo, con gli spazi). Prova anche il numero di una prenotazione Booking o Airbnb del foglio.
2. **Foglio**: installa la revisione nuova dello script (`docs/foglio-prenotazioni.md` §1). Poi scrivi una prenotazione manuale di prova e controlla codice, calendario e Gestione; dopo le 3 di notte controlla in Apps Script → Esecuzioni quali righe ha cancellato la pulizia.
3. **iPhone**: apri il link della mail dall'app Mail e il link `#k=…` da WhatsApp; prova «Aggiungi a Home».
4. **Messaggi**: segui i passi di `docs/messaggi.md` §9.
5. **Gestione**: segui i passi di `docs/gestione.md` §10 (calendario, vecchi indirizzi, due dispositivi, prenotazioni, pulizie, Luoghi).
6. **Sistema**: Sito → Sistema → «Pagamenti ed email» tutto verde; «Invia email di prova».

## Limiti noti

- Il codice di prenotazione vale come una chiave e non si può revocare: chi lo conosce vede date, appartamento e numero di ospiti (mai nome, email o importo per Booking e Airbnb). I numeri dei portali, più corti, sono protetti da limiti di tentativi e da una finestra di 7 giorni dopo il check-out.
- Le email dei messaggi contengono il testo (scelta tua): si spengono in Messaggi → Automatici. Niente allegati.
- **Notifiche push sul telefono: non attivate**, come chiesto. Richiedono chiavi apposite e il consenso dell'ospite nel browser: se le vuoi, decidiamolo prima.
- La Gestione non si aggiorna da sola (tranne i Messaggi): «Aggiorna» in Oggi o ricarica la pagina.
- Lo script del foglio non è nel repository, che è pubblico: le 20 prove che lo richiedono si saltano, a meno di indicarlo con `LC_GAS_FILE`. Con lo script che mi hai mandato, e con la revisione nuova, passano tutte e 35.
- Stripe non restituisce la sua commissione sui pagamenti rimborsati. L'imposta di soggiorno pagata con il check-in online non si rimborsa da qui (è un altro sistema). Il sito non emette ricevute né fatture: le emetti tu, il sito raccoglie i dati e le manda.
- Le foto nuove di Luoghi e stagioni arrivano dalla copertina di pagine ufficiali (VisitTrentino e il sito del Natale di Trento): da qui non le ho potute vedere, perché la rete di prova blocca quei siti. Controllale sull'anteprima. Per Garda e Val di Non puoi sempre caricare una foto tua in Gestione → Sito → Luoghi e convenzioni («Carica foto»): ha la precedenza. La foto degli eventi d'estate è quella della pagina delle Feste Vigiliane: se un anno la pagina sparisce, la scheda mostra il segnaposto finché non la si cambia in `js/dintorni.js`.

## Prove automatiche

`tests/sim/` (Redis finto con Lua vero, Stripe, email, foglio e DeepL finti, browser simulato): scenari 15 ok (20 saltati senza lo script del foglio; con lo script 35 ok), pagamenti 25, preavviso 12, sicurezza 23, messaggi 13, sito 8, ISTAT 30, adempimenti 40, informativa 5, interfaccia 84. Tutte verdi a ogni fase. I test cambiati di proposito perché controllavano una struttura dell'interfaccia cambiata sono dichiarati nei messaggi di commit.
