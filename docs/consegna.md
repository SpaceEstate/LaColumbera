# Consegna: area clienti tipo app, messaggi, nuova Gestione – La Columbera

Riepilogo per il titolare del lavoro fatto in quattro fasi sul branch `claude/ecstatic-allen-x178x6` (un commit per fase). I dettagli tecnici sono nei documenti indicati.

| Fase | Commit | Documento |
|---|---|---|
| 1. Si entra con il solo codice della prenotazione | `35385c3` | `docs/gdpr/sicurezza-accessi.md` |
| 2. Area clienti tipo app | `f6b351b` | `docs/gdpr/sicurezza-accessi.md`, `privacy.html` |
| 3. Messaggi, template, automatici, traduzione | `7b2be8f` | `docs/messaggi.md` |
| 4. Gestione in due aree: Operatività \| Sito | `43be5a5` | `docs/gestione.md` |

## Cosa cambia per gli ospiti

- **Per entrare basta il codice** della prenotazione: niente email né data. I codici nuovi del sito sono di 13 caratteri casuali, mostrati a gruppi (`558R TE56 487A9`); per Booking.com e Airbnb vale il numero del portale, letto dal foglio. Si possono scrivere in minuscolo, con spazi o trattini. Il link della mail di conferma apre l'area con un tocco.
- **Area clienti tipo app** (si può aggiungere alla schermata Home del telefono): soggiorno con orari e indirizzo, aggiungi al calendario, riepilogo del pagamento riga per riga, informazioni della casa e Wi-Fi (solo nei giorni giusti), dintorni ed eventi, check-in online e Trentino Guest Card, in italiano, inglese e tedesco.
- **Messaggi con te** (solo prenotazioni confermate del sito; Booking e Airbnb scrivono sulla loro piattaforma), tradotti automaticamente nella loro lingua se attivi DeepL. Quando scrivi, all'ospite arriva un'email con il testo e il pulsante «Rispondi», che apre i messaggi senza chiedere il codice.

## Cosa cambia per te

- **Gestione in due aree**, con il selettore sempre in alto: **Operatività** (Oggi, Calendario e prezzi, Prenotazioni, Messaggi, Adempimenti, Guest Card) e **Sito** (Appartamenti, Home · Chi siamo, Eventi, Luoghi e convenzioni, Regole di prenotazione, Sistema).
- **Oggi**: cosa c'è da fare, chi arriva e chi parte oggi e domani, gli invii automatici, i prossimi 7 giorni e un semaforo unico per sincronizzazione, pagamenti ed email.
- **Calendario e prezzi**: tocchi le notti (anche «dal… al…») e in un colpo cambi prezzo, blocchi o fissi un minimo di notti.
- **Prenotazioni**: sito, Booking e Airbnb in un solo elenco con ricerca; nel dettaglio il codice e un messaggio pronto da copiare nella chat del portale.
- **Messaggi**: conversazioni, template, messaggi automatici (es. il giorno prima dell'arrivo) e programmati. Quando un ospite scrive ti arriva un'email con il testo e «Rispondi», che apre la conversazione.
- **Pulizie**: per il periodo che scegli, un testo per Corte e uno per Torre con entrate, uscite, ospiti, notti e letti (matrimoniale o singoli), da copiare e mandare a chi fa le pulizie. Senza nomi degli ospiti.
- **Luoghi e Convenzioni** ora si modificano dalla Gestione.
- **Salvataggio più sicuro**: la barra «Salva modifiche» compare solo quando serve e dice dove hai modificato; se hai salvato da un altro dispositivo nel frattempo, nulla viene sovrascritto senza chiedertelo.
- Tutti i vecchi indirizzi della Gestione e i link delle email continuano a funzionare.

## Cosa non è cambiato

Pagamento con Stripe e webhook, motore delle disponibilità (iCal, foglio, coda di ripresa), Alloggiati Web e ISTAT, Trentino Guest Card, calcolo dei prezzi, preavviso e orizzonte di 6 mesi. I dati già salvati non vengono convertiti: i campi nuovi sono facoltativi e, finché non li usi, il sito pubblico resta identico. Prenotazioni esistenti con codici più corti non ce ne sono (lo hai confermato): i codici del foglio Booking/Airbnb restano quelli del portale.

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
2. **Foglio**: controlla che lo script del foglio accetti e cerchi i codici nuovi di 13 caratteri (lo script non è nel repository, quindi non l'ho potuto provare).
3. **iPhone**: apri il link della mail dall'app Mail e il link `#k=…` da WhatsApp; prova «Aggiungi a Home».
4. **Messaggi**: segui i passi di `docs/messaggi.md` §9.
5. **Gestione**: segui i passi di `docs/gestione.md` §10 (calendario, vecchi indirizzi, due dispositivi, prenotazioni, pulizie, Luoghi).
6. **Sistema**: Sito → Sistema → «Pagamenti ed email» tutto verde; «Invia email di prova».

## Limiti noti

- Il codice di prenotazione vale come una chiave e non si può revocare: chi lo conosce vede date, appartamento e numero di ospiti (mai nome, email o importo per Booking e Airbnb). I numeri dei portali, più corti, sono protetti da limiti di tentativi e da una finestra di 7 giorni dopo il check-out.
- Le email dei messaggi contengono il testo (scelta tua): si spengono in Messaggi → Automatici. Niente allegati.
- **Notifiche push sul telefono: non attivate**, come chiesto. Richiedono chiavi apposite e il consenso dell'ospite nel browser: se le vuoi, decidiamolo prima.
- La Gestione non si aggiorna da sola (tranne i Messaggi): «Aggiorna» in Oggi o ricarica la pagina.
- Le 18 prove dello script del foglio restano saltate perché `google-apps-script.gs` non è nel repository (come prima di queste modifiche).

## Prove automatiche

`tests/sim/` (Redis finto con Lua vero, Stripe, email, foglio e DeepL finti, browser simulato): scenari 15 ok (18 saltati, vedi sopra), pagamenti 18, preavviso 12, sicurezza 20, messaggi 12, sito 8, ISTAT 30, adempimenti 40, informativa 5, interfaccia 72. Tutte verdi a ogni fase. I test cambiati di proposito perché controllavano una struttura dell'interfaccia cambiata sono dichiarati nei messaggi di commit.
