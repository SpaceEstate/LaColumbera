# Regole di lavoro – La Columbera

Questo file vale per chiunque modifichi il repository (persone e assistenti). Il progetto gemello è **Checkin** (`SpaceEstate/Checkin`): stesso foglio Prenotazioni, account Stripe **diverso** (vedi «Collegamenti con Checkin»); ha un file con le stesse regole.

## 9. Preservare il codice e non introdurre regressioni

È fondamentale preservare il funzionamento attuale di entrambi i siti.

- Non riscrivere da zero file, funzioni o intere sezioni di codice che già funzionano correttamente.
- Non modificare funzionalità, flussi operativi o interfacce che non presentano problemi e che non richiedono interventi.
- Non eliminare, sostituire o semplificare codice senza averne prima compreso le dipendenze e le conseguenze.
- Non modificare API, nomi di variabili d'ambiente, configurazioni, database, webhook o integrazioni senza una motivazione tecnica precisa.
- Prima di ogni modifica, verificare quali altri componenti potrebbero essere interessati (anche nell'altro sito: vedi «Collegamenti con Checkin»).
- Mantenere la compatibilità con l'architettura e le integrazioni esistenti.
- Evitare modifiche che possano compromettere prenotazioni, pagamenti Stripe, check-in, sincronizzazioni o dati già presenti.
- Non introdurre nuove dipendenze se non sono strettamente necessarie.
- Non modificare configurazioni di produzione, credenziali o variabili d'ambiente.
- Non effettuare deploy in produzione senza l'autorizzazione del titolare.

Ogni modifica deve essere circoscritta, motivata e accompagnata dai test necessari.

Prima di modificare una parte critica, verificare che il comportamento attuale sia documentato o coperto da test, così da poterlo preservare (tabella qui sotto). Se non lo è, scrivere prima la prova del comportamento attuale, poi la modifica.

Se non si è sicuri che una modifica sia sicura o possa introdurre regressioni, **non procedere autonomamente**: descrivere il problema e proporre la soluzione.

Priorità assoluta: migliorare sicurezza, privacy, affidabilità e prestazioni senza compromettere ciò che attualmente funziona.

Al termine di ogni intervento verificare che:

- i test precedenti continuino a passare (stessi numeri della baseline, più quelli nuovi);
- i flussi non modificati continuino a funzionare;
- non siano state introdotte regressioni;
- le modifiche siano limitate a quanto strettamente necessario.

Un test cambiato o tolto va dichiarato e motivato nel messaggio di commit; un test non si salta né si indebolisce per farlo passare.

## Parti critiche: dove stanno e chi le prova

| Parte | Codice | Prove | Documento |
|---|---|---|---|
| Disponibilità e prenotazioni (iCal, hold atomici in Lua, coda di ripresa) | `api/_avail.js`, `api/x.js` | `tests/sim/scenarios.js`, `tests/sim/preavviso.js`, `tests/sim/lua51_check.py` | – |
| Pagamenti Stripe, conferma, annullo e rimborso | `api/stripe-webhook.js`, `api/_pagato.js`, `api/_annulla.js` | `tests/sim/pagamenti.js` | `docs/pagamenti.md` |
| Foglio Prenotazioni (script Apps Script, **non** nel repository) | – | `tests/sim/scenarios.js` con `LC_GAS_FILE` | `docs/foglio-prenotazioni.md` |
| Accessi (area clienti, Guest Card, login della Gestione, link con la chiave personale) | `api/_accesso.js`, `api/x.js` | `tests/sim/sicurezza.js` | `docs/gdpr/sicurezza-accessi.md` |
| Check-in online fatto (collegamento con Checkin) | `api/_checkin.js`, `api/stripe-webhook.js` | `tests/sim/pagamenti.js` (C1–C7), `tests/sim/ui.js` (U5e) | `docs/pagamenti.md` |
| Messaggi, template, traduzione | `api/_messaggi.js`, `api/_traduci.js` | `tests/sim/messaggi.js` | `docs/messaggi.md` |
| Alloggiati Web e ISTAT | `api/_alloggiati*.js`, `api/_istat*.js`, `api/adempimenti.js`, `api/istat.js` | `tests/sim/adempimenti.js`, `tests/sim/istat.js` | – |
| Gestione e pagine del sito (anche il Da fare per l'app Promemoria) | `js/*.js`, `*.html`, `api/_dafare.js` | `tests/sim/ui.js` (W15e), `tests/sim/sito.js`, `tests/sim/informativa.js` | `docs/gestione.md` |

## Collegamenti con Checkin

Una modifica a uno di questi punti va verificata anche nel repository Checkin.

- **Pagamenti del check-in (Stripe).** Il sito e Checkin hanno account Stripe **diversi** (02/11/2026: il sito ancora con le chiavi di prova, Checkin con quelle reali). I pagamenti del check-in arrivano al sito da un secondo webhook registrato sull'account di Checkin verso `api/stripe-webhook.js` (segreto `STRIPE_CHECKIN_WEBHOOK_SECRET`; da lì si registra solo il check-in fatto) e la rete di sicurezza legge quell'account con `STRIPE_CHECKIN_SECRET_KEY`; senza le due variabili il codice funziona anche con un account solo, come prima. I pagamenti del check-in si riconoscono dai metadati `dataCheckin` e `numeroPrenotazione` (letti in `api/_checkin.js`). Il webhook di Checkin ignora i pagamenti di questo sito. Nomi e significato dei metadati non vanno cambiati da una parte sola.
- **Foglio Prenotazioni.** Checkin lo legge (verifica del numero, abbinamento per data e appartamento): colonne e formato dei numeri vanno mantenuti.
- **Alloggiati Web.** Il modulo del tracciato in Checkin è un porting di `api/_alloggiati.js`; il test di Checkin lo confronta con questo file se si imposta `LACOLUMBERA_DIR`.

## Come verificare (nessuna rete, nessun servizio reale)

Le stesse prove partono da sole su GitHub a ogni push e a ogni pull request (`.github/workflows/prove.yml`, scheda «Actions»): una spunta rossa vuol dire che qualcosa si è rotto e va sistemato prima di unire o pubblicare.

Le dipendenze di prova si installano **fuori** dal repository: `node_modules` del repository non serve (nodemailer, stripe e `@vercel/blob` sono sostituiti da finti in `tests/sim/stubs`).

```bash
npm install --prefix /tmp/testdeps wasmoon jsdom
set -o pipefail
for f in scenarios pagamenti preavviso sicurezza messaggi sito istat adempimenti informativa ui; do
  printf '%-12s ' "$f"
  NODE_PATH=/tmp/testdeps/node_modules JSDOM_PATH=/tmp/testdeps/node_modules/jsdom node "tests/sim/$f.js" 2>/dev/null | tail -1 || echo "  ↑ FALLITO: $f"
done
```

Ogni riga deve riportare gli stessi numeri della baseline. Per i dettagli di una prova fallita, rieseguire il singolo file senza filtri: le righe di errore come «KV giù», «smtp giù» o «api_connection_error» sono guasti simulati di proposito dalle prove, non problemi.

Attenzione: senza jsdom `tests/sim/ui.js` esce con successo saltando tutte le prove dell'interfaccia; controllare che il numero sia quello della baseline. Le 23 prove dello script del foglio richiedono `LC_GAS_FILE=/percorso/google-apps-script.gs`, da impostare solo per `scenarios`: `ui.js` è scritto per lo stub del foglio (registro vuoto) e con lo script vero dà 5 falsi errori.

Controllo degli script Lua sulla versione di Redis (Lua 5.1), in un ambiente Python separato:

```bash
python3 -m venv /tmp/luavenv && /tmp/luavenv/bin/pip install lupa
node -e "const A=require('./api/_avail.js');require('fs').writeFileSync('/tmp/lua_scripts.json',JSON.stringify({acquire:A.LUA_ACQUIRE,release:A.LUA_RELEASE}))"
/tmp/luavenv/bin/python tests/sim/lua51_check.py      # deve finire con «COMPATIBILE CON LUA 5.1»
```

## Baseline (02/11/2026; partenza commit `6336695`, sicurezza +2 con S25 e S26, pagamenti +5 con P20, P21, P22, P23 e C7, ui +9 con W15c, W15d, W30b, W1v, W39, W14b, U5e, W15e e W16b, sito +2 con S10 e S11, scenarios +3 con X21, X22 e X23)

| Prova | Risultato |
|---|---|
| scenarios | 15 ok, 0 falliti, 23 saltati senza `LC_GAS_FILE` (20 fino a `4b472a6`, 22 fino a `a6d403b`); con lo script vero (`LC_GAS_FILE` o segreto `GAS_SCRIPT` su GitHub, revisione 2026-11-02b) 38 ok, 0 falliti (37 fino a `a6d403b`) |
| pagamenti | 40 ok (35 fino a `6336695`, 36 fino a `e4af913`, 37 fino a `f88f23e`, 38 fino a `a86a543`, 39 fino a `0124e23`) |
| preavviso | 12 ok |
| sicurezza | 26 ok (24 fino a `6336695`, 25 fino a `97368a3`) |
| messaggi | 15 ok |
| sito | 11 ok (9 fino a `930c8df`) |
| istat | 30 ok |
| adempimenti | 40 ok |
| informativa | 5 ok |
| ui | 110 ok (101 fino a `0761b7a`, 104 fino a `fa9b43f`, 105 fino a `8e09aa1`, 106 fino a `930c8df`, 107 fino a `0124e23`, 108 fino a `97368a3`, 109 fino a `7036859`) |
| lua51_check | compatibile con Lua 5.1 |

Quando un intervento aggiunge prove, aggiornare questa tabella nello stesso commit.
