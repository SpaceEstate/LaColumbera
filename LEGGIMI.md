# La Columbera — sito statico (HTML + CSS + JS)

Versione solo HTML/CSS/JavaScript del sito: nessun framework, nessuna build.
Le prenotazioni, l'area clienti e la gestione usano la funzione serverless
`api/x.js` (JavaScript per Vercel), esattamente come prima.

## File
- `index.html` — home (schede appartamento interamente cliccabili, menu mobile
  con App. Torre / App. Corte / Area personale, sezione contatti aggiornata)
- `torre.html`, `corte.html` — pagine appartamento nello stile della home, con
  galleria foto, calendario disponibilità con prezzi e richiesta di prenotazione
- `area-clienti.html` — area personale (email + codice prenotazione)
- `admin.html` — gestione contenuti, foto, prezzi, periodi e prenotazioni
- `css/main.css` — tutto lo stile del sito
- `js/site.js` — header, menu mobile, animazioni
- `js/pages.js` — logica di appartamenti, area clienti e gestione
- `api/x.js` — funzione serverless Vercel (prenotazioni, login admin, upload foto)
- `data/default.json` — contenuti di partenza (usati finché non salvi dall'admin)
- `img/` — tutte le foto

## Prova in locale
Basta un server statico qualsiasi, ad esempio:
```
python3 -m http.server 8080
```
e apri http://localhost:8080 — in locale il calendario mostra il messaggio
"prenotazione online non attiva" perché l'API gira solo su Vercel.

## Pubblicazione (come prima)
1. Copia questi file nel repository GitHub (sovrascrivi i vecchi).
2. Vercel > Storage: database **Upstash Redis** e **Blob** collegati al progetto.
3. Vercel > Settings > Environment Variables:
   - `ADMIN_USER` e `ADMIN_PASSWORD` (credenziali gestione; NON scriverle nei file)
   - `ICAL_CORTE` e `ICAL_TORRE`: link iCal di Booking e Airbnb separati da virgola
4. Redeploy. Gestione: `/admin.html`

## Modifiche rapide
- Testi della home: direttamente in `index.html`.
- Testi/prezzi/foto appartamenti: da `admin.html` (salva su Redis) oppure in
  `data/default.json` per i valori iniziali.
