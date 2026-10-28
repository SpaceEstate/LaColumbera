# Pagamenti e conferma delle prenotazioni

Come funziona e come controllare che una prenotazione pagata arrivi davvero (a te, all'ospite, sul foglio e sul calendario).

## Cosa succede quando un ospite paga

1. L'ospite sceglie le date: le notti vengono **trattenute** per 35 minuti mentre paga su Stripe.
2. Pagamento riuscito → la prenotazione diventa **confermata**, le notti si **chiudono** (sito e calendario iCal per Booking/Airbnb), la riga va sul **foglio**, ti arriva l'**email di nuova prenotazione**, all'ospite arriva la **conferma** con il link all'area clienti.
3. Se l'ospite non paga, le notti tornano libere da sole.

La conferma parte da **tre strade**, tutte con lo stesso percorso (nessun doppione se arrivano insieme):

| Strada | Quando |
|---|---|
| Webhook di Stripe | Normalmente, pochi secondi dopo il pagamento |
| Pagina di ritorno dopo il pagamento | L'ospite torna sul sito: la pagina chiede lo stato e, se serve, il sito controlla direttamente su Stripe |
| Sincronizzazione automatica (ogni pochi minuti) | Ricontrolla su Stripe le prenotazioni rimaste «in attesa» da più di 3 minuti |

Se il pagamento arriva quando le date non sono più libere (o non si possono verificare), la prenotazione resta **«da verificare»**: ti arriva un'email, all'ospite non scrive nessuno e decidi tu da Gestione → Prenotazioni (conferma o annulla/rimborsa). Un pagamento ripetuto non la conferma mai da solo.

## Controllo in un colpo d'occhio

**Gestione → Sincronizzazione → «Pagamenti ed email»**: semaforo per Stripe, webhook, email, foglio e prenotazioni rimaste a metà. «Invia email di prova» manda un messaggio al tuo indirizzo per verificare l'invio.

## Impostazioni su Vercel (Settings → Environment Variables)

| Variabile | A cosa serve |
|---|---|
| `STRIPE_SECRET_KEY` | Incassi (chiave segreta del tuo account Stripe) |
| `STRIPE_WEBHOOK_SECRET` | «Signing secret» del webhook di **questo sito** |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Invio delle email (password per le app di Gmail) |
| `OWNER_EMAIL` | Dove ricevi gli avvisi (se manca: l'indirizzo predefinito) |
| `REPLY_TO` | A chi risponde l'ospite (se manca: lacolumbera@gmail.com) |
| `SHEET_WEBAPP_URL`, `SHEET_SECRET` | Foglio prenotazioni |
| `SYNC_SECRET` | Sincronizzazione automatica (script del foglio) |

## Webhook su Stripe (Sviluppatori → Webhook)

- **Questo sito**: indirizzo `https://la-columbera.vercel.app/api/stripe-webhook`, eventi `checkout.session.completed` e `checkout.session.expired`.
- **App di check-in** (tassa di soggiorno): `https://checkin-six-coral.vercel.app/api/stripeWebhook`, evento `checkout.session.completed`.
- Ogni webhook ha il proprio «signing secret», da copiare nella variabile del progetto giusto. Con un solo account Stripe i due sistemi ricevono gli eventi l'uno dell'altro e ognuno ignora quelli che non sono suoi.

## Prova completa (una volta, e dopo ogni modifica alle chiavi)

1. Gestione → Sincronizzazione → «Pagamenti ed email»: tutto verde; «Invia email di prova» e controlla la posta (anche lo spam).
2. Fai una prenotazione di prova per una data lontana pagando con una carta vera (poi rimborsala da Stripe) oppure, con le chiavi di prova, con la carta `4242 4242 4242 4242`.
3. Controlla: email a te, email all'ospite, riga sul foglio, notti chiuse sul sito, «Ultimo avviso da Stripe» compilato nella scheda.
4. Annulla la prenotazione di prova da Gestione → Prenotazioni.

## Limiti da conoscere

- I calendari iCal non sono istantanei: Booking e Airbnb rileggono il tuo calendario ogni alcune ore, e il sito rilegge i loro ogni circa 10 minuti. Nella finestra tra due letture una stessa notte può essere prenotata su due canali: è un limite del formato iCal (solo un gestionale con collegamento diretto lo elimina).
- Su Booking e Airbnb si inserisce il link «solo sito» (Gestione → appartamento → Calendari iCal, `...&for=site`): contiene soltanto le prenotazioni fatte dal sito, quindi non c'è rischio di «blocchi fantasma». I blocchi manuali di Gestione → Disponibilità valgono solo sul sito: le stesse notti vanno chiuse a mano anche su Booking e Airbnb.
- Per te c'è un calendario separato con tutto (sito, Booking, Airbnb, Torre e Corte, nomi degli ospiti): `...?a=ical&for=all&id=all&k=<ICAL_PERSONAL_KEY>`. Non va mai dato a Booking o Airbnb.
