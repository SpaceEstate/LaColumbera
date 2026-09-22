# La Columbera — sito statico (HTML + CSS + JS)

Versione solo HTML/CSS/JavaScript del sito: nessun framework, nessuna build.
Le prenotazioni, l'area clienti, gli eventi e la gestione usano la funzione
serverless `api/x.js` (JavaScript per Vercel), esattamente come prima.

## Novità di questa versione
- **Menu semplificato**: in alto ora ci sono solo `Home · Appartamenti · Eventi ·
  Mappa · Area clienti` (le vecchie voci La dimora/Ravina/Contatti erano ancore
  interne alla home e sono state tolte; la home è rimasta identica).
- **Pagina Eventi automatica**: gli eventi principali di Trento e del territorio
  vengono estratti automaticamente da VisitTrentino (`api/x?a=events_feed`), con un
  elenco di riserva sempre aggiornato; mostra solo gli eventi in arrivo, ordinati.
  Dall'admin puoi aggiungere eventi manuali che compaiono insieme a quelli automatici.
- **Mappa illustrata**: nuova mappa stilizzata con il castello su La Columbera, il
  segnale **P** del parcheggio e lo svincolo verde dell'autostrada A22 (uscita
  Trento Sud), con il fiume Adige.
- **Galleria appartamenti**: freccia avanti/indietro sulla foto grande + striscia di
  anteprime scorrevoli sotto (non tutte in colonna).
- **Gestione (admin) rinnovata**:
  - **Calendario prezzi tipo Airbnb**: per ogni appartamento un calendario mensile
    grande dove selezionare i giorni e impostare il **prezzo per notte**; i giorni
    con prezzo personalizzato sono evidenziati in oro, quelli occupati (prenotazioni
    o iCal) sono bloccati.
  - **Foto riordinabili**: trascina le foto (drag & drop) o usa le frecce ‹ ›,
    imposta la copertina ★, rimuovi o carica nuove foto.
  - Campo **iCal Booking/Airbnb** per ogni appartamento (chiude automaticamente le
    date sincronizzate).

## File
- `index.html` — home
- `torre.html`, `corte.html` — pagine appartamento con galleria (frecce + anteprime),
  calendario disponibilità con prezzi e richiesta di prenotazione
- `eventi.html` — eventi automatici + manuali
- `mappa.html` — mappa illustrata
- `area-clienti.html` — area personale (email + codice prenotazione)
- `guest-card.html` — Trentino Guest Card
- `admin.html` — gestione contenuti, foto, calendario prezzi, iCal, eventi, prenotazioni
- `css/main.css` — tutto lo stile del sito
- `js/site.js` — header, menu mobile, animazioni
- `js/pages.js` — logica di appartamenti, area clienti, gestione, eventi
- `api/x.js` — funzione serverless Vercel
- `data/default.json` — contenuti di partenza (usati finché non salvi dall'admin)
- `img/` — tutte le foto

## Prova in locale
```
python3 -m http.server 8080
```
e apri http://localhost:8080 — in locale il calendario e gli eventi mostrano un
messaggio perché l'API `api/x.js` gira solo su Vercel.

## Pubblicazione (come prima)
1. Copia questi file nel repository GitHub (sovrascrivi i vecchi).
2. Vercel > Storage: database **Upstash Redis** e **Blob** collegati al progetto.
3. Vercel > Settings > Environment Variables:
   - `ADMIN_USER` e `ADMIN_PASSWORD` (credenziali gestione; NON scriverle nei file)
   - `ICAL_CORTE` e `ICAL_TORRE`: link iCal di Booking e Airbnb separati da virgola
     (facoltativi: ora puoi inserirli anche dall'admin, per appartamento)
4. Redeploy. Gestione: `/admin.html`
