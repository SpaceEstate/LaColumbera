# La Columbera — sito statico (HTML + CSS + JS)

Versione solo HTML/CSS/JavaScript del sito: nessun framework, nessuna build.
Le prenotazioni, l'area clienti, gli eventi e la gestione usano la funzione
serverless `api/x.js` (JavaScript per Vercel).

## Novità di questa versione
- **Area clienti con solo codice**: basta il **codice di prenotazione**, non serve
  più l'email. I codici vengono letti automaticamente dal tuo **Foglio Google**
  (Booking, Airbnb e prenotazioni dal sito).
- **Prenotazioni scritte sul Foglio Google**: quando un cliente prenota dal sito,
  la prenotazione viene aggiunta al foglio con i dati richiesti
  (Numero Prenotazione, Data Check-in, Appartamento, Numero Ospiti, Numero Notti).
- **Calendario iCal per ogni appartamento**: link `.ics` da inserire su Booking e
  Airbnb così le date prenotate dal sito (e quelle già presenti sul foglio) vengono
  riservate anche sui portali. Trovi il link pronto nell'admin, per ogni appartamento:
  `https://IL-TUO-DOMINIO/api/x?a=ical&id=torre`
  `https://IL-TUO-DOMINIO/api/x?a=ical&id=corte`
- **Chiudi appartamento**: dall'admin puoi chiudere del tutto un appartamento
  (blocca tutte le prenotazioni dal sito) con una spunta.
- **Eventi**: link agli eventi corretti (URL assoluti, si aprono sempre).

## Collegamento al Foglio Google
- **Lettura** (codici / prenotazioni): automatica. Il foglio deve essere condiviso
  come "Chiunque abbia il link può visualizzare" (di default lo è già per la lettura CSV).
  Puoi cambiare il foglio impostando su Vercel `SHEET_ID` (e `SHEET_GID`, default 0).
- **Scrittura** (aggiungere prenotazioni dal sito): usa lo script `google-apps-script.gs`
  incluso. Segui le istruzioni dentro al file, poi imposta su Vercel
  `SHEET_WEBAPP_URL` con l'URL `/exec` ottenuto. (Facoltativo `SHEET_SECRET`.)
  Se non imposti `SHEET_WEBAPP_URL`, il sito funziona lo stesso ma non scrive sul foglio.

## File
- `index.html` — home
- `torre.html`, `corte.html` — pagine appartamento (galleria, calendario, prenotazione)
- `eventi.html` — eventi automatici + manuali
- `mappa.html` — mappa illustrata
- `area-clienti.html` — area personale (solo codice prenotazione)
- `guest-card.html` — Trentino Guest Card
- `admin.html` — gestione: contenuti, foto, calendario prezzi, iCal, chiusura app, eventi, prenotazioni
- `css/main.css` — stile del sito
- `js/site.js` — header, menu mobile, animazioni
- `js/pages.js` — logica appartamenti, area clienti, gestione, eventi
- `api/x.js` — funzione serverless Vercel
- `google-apps-script.gs` — script per scrivere le prenotazioni sul Foglio Google
- `data/default.json` — contenuti di partenza (usati finché non salvi dall'admin)
- `img/` — foto

## Variabili d'ambiente su Vercel
- `ADMIN_USER`, `ADMIN_PASSWORD` — credenziali gestione (`/admin.html`)
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` (o `UPSTASH_REDIS_REST_URL` / `..._TOKEN`) — database
- `BLOB_READ_WRITE_TOKEN` — storage foto (Vercel Blob)
- `SHEET_WEBAPP_URL` — (per scrivere le prenotazioni sul foglio) URL /exec dell'Apps Script
- `SHEET_SECRET` — (facoltativo) parola segreta condivisa con l'Apps Script
- `SHEET_ID`, `SHEET_GID` — (facoltativo) per usare un foglio diverso da quello predefinito
- `ICAL_CORTE`, `ICAL_TORRE` — (facoltativo) iCal Booking/Airbnb, anche dall'admin

## Prova in locale
```
python3 -m http.server 8080
```
apri http://localhost:8080 — in locale calendario/eventi mostrano un messaggio
perché l'API `api/x.js` gira solo su Vercel.
