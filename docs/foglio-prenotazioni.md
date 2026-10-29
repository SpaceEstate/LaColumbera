# Foglio «Prenotazioni»: prenotazioni manuali e pulizia notturna – La Columbera

Ambito: lo script Apps Script del foglio Google **Prenotazioni** (registro di tutte le prenotazioni, sincronizzazione con il sito). Revisione **2026-10-29**: prenotazioni manuali senza numero e cancellazione delle righe 7 giorni dopo il check-out. Prove: `tests/sim/scenarios.js` (X19, X20 e le altre 18 prove dello script) e `tests/sim/ui.js` (W32).

Lo script **non è nel repository**, che è pubblico: il titolare l'aveva tolto il 15/10/2026. La versione nuova si consegna come file (`google-apps-script.gs`) da incollare in Apps Script.

---

## 1. Installare la versione nuova (5 minuti)

1. Apri il foglio Google **Prenotazioni** → **Estensioni → Apps Script**.
2. Nel file del codice seleziona tutto (Ctrl+A) e sostituiscilo con il contenuto di `google-apps-script.gs`. Salva (icona del disco o Ctrl+S).
3. Fine. **Non serve un nuovo deployment** e non serve rifare i trigger:
   - la web app (`doGet`/`doPost`, quella che usa il sito) non è cambiata;
   - i trigger già installati (sincronizzazione ogni 5 minuti, completa ogni ora, pulizia alle 3) usano da soli il codice salvato.
4. Controllo: dopo 5 minuti, nella scheda **SyncStatus**, la riga **APPS SCRIPT** dice `v2 (2026-10-29)`. Se vuoi, esegui una volta `diagnostica`: nel registro compare la riga «pulizia notturna del registro: cancella le prenotazioni 7 giorni dopo il check-out».

## 2. Prenotazioni manuali (telefono, di persona)

In fondo al foglio scrivi una riga nuova **senza «Numero Prenotazione»**:

| Colonna | Cosa scrivi |
|---|---|
| B · Data Check-in | il giorno di arrivo (gg/mm/aaaa) |
| C · Appartamento | dal menu: Torre o Corte |
| D · Numero Ospiti | quanti sono |
| E · Numero Notti | quante notti |
| Q · NOTE | quello che vuoi ricordare: nome, prezzo, acconto… (per esempio «Rossi, 300 € contanti») |

Entro 5 minuti lo script:

- mette in A un **codice** `M` + 9 caratteri (per esempio `MK7Q2M9XW4`): casuale, non si indovina, non si confonde con Booking (10 cifre) né con Airbnb (`HM…`);
- scrive FONTE = `MANUALE`, STATO = `CONFERMATA`, CHECK_OUT, ID e le date di sistema, come per le altre righe.

Poi, alla sincronizzazione successiva, il sito:

- **chiude quelle notti** sul calendario del sito;
- mostra la prenotazione in **Gestione** come «Manuale», con la nota, in Prenotazioni, Oggi e Pulizie.

Con il codice l'ospite entra nell'**area clienti** (check-in online, Guest Card, informazioni) fino a 7 giorni dopo la partenza. Nel dettaglio in Gestione c'è il messaggio pronto da mandargli per WhatsApp, SMS o email.

Altre regole:

- **Booking e Airbnb**: le notti chiudile sui portali come prima. Il sito passa ai portali solo le sue prenotazioni (`?for=site`), per scelta.
- **Righe incomplete**: se manca la data, l'appartamento o le notti, lo script non tocca la riga finché non la completi.
- **Righe dubbie**: una riga senza numero ma con ID o FONTE già scritti (per esempio un numero cancellato per sbaglio) non riceve un codice nuovo. Rimetti il numero.
- **Numero scritto da te** (per esempio `TEL1`): funziona come prima. La FONTE si deduce dal formato e nella nota compare «FONTE dedotta dal formato del codice».
- **Annullare**: scrivi `ANNULLATA` nella colonna STATO (I) e le notti tornano libere sul sito.

## 3. Pulizia notturna del foglio

Ogni notte, nel trigger `pulizia` delle 3, prima della pulizia delle email, lo script cancella le prenotazioni **concluse da più di 7 giorni**:

| Riga | Quando si cancella |
|---|---|
| Con check-out (o check-in + notti) | dall'8° giorno dopo il check-out |
| Senza notti | un mese dopo il check-in + 7 giorni (non si sa quando finisce: prudenza) |
| Annullata senza date (cancellazione arrivata per email prima della conferma) | 7 giorni dopo l'annullamento |
| Senza codice | mai (potresti essere ancora a scriverla) |

- **Perché 7 giorni**: fino a 7 giorni dopo la partenza l'ospite Booking/Airbnb (e quello manuale) entra ancora nell'area clienti con il suo numero, e Gestione mostra il soggiorno.
- **Cosa resta**:
  - le prenotazioni del sito restano nel sito (Gestione, ricevute, messaggi);
  - quelle di Booking e Airbnb restano sui portali;
  - quelle **manuali spariscono del tutto, nota compresa**. Scelta del titolare: se ti serve uno storico, copia la riga altrove prima.
- **Protezione**: l'ultima prenotazione rimasta non si cancella finché non ne arriva un'altra. Se il registro passa di colpo da diverse righe a nessuna, il sito sospetta un errore del foglio (`REGISTRO_VUOTO_SOSPETTO`) e, per sicurezza, smette di fidarsi: il calendario diventerebbe «non verificabile» finché non arriva una prenotazione nuova.
- **Sicurezza delle cancellazioni**:
  - si cancella sotto il lock dello script, quindi nessun'altra scrittura gira nel frattempo;
  - si parte dal basso, a blocchi, così le righe sopra non si spostano;
  - la sincronizzazione (ogni 5 minuti e ogni ora) non cancella mai nulla.
- **Spegnerla**: nelle Proprietà script (Impostazioni progetto) metti `ELIMINA_DOPO_GIORNI` = `0`. Con un altro numero cambia l'attesa: 7 è il valore di partenza.
- Il registro dello script (Esecuzioni) dice ogni notte quali numeri ha cancellato.
- La scheda `Prenotazioni_backup_20261015` non si tocca.

## 4. Prove

Il banco di prova usa lo script vero se lo trova nella radice del repository (`google-apps-script.gs`) oppure dove indica `LC_GAS_FILE`. Senza lo script le 20 prove che lo richiedono si saltano.

```bash
LC_GAS_FILE=/percorso/google-apps-script.gs node tests/sim/scenarios.js
```

- Con lo script: **35 ok**.
- X19 copre le prenotazioni manuali:
  - codice e colonne scritte dallo script;
  - righe incomplete o dubbie lasciate com'erano;
  - notti chiuse sul sito, nota in Gestione, accesso dell'ospite con il codice;
  - annullamento dalla colonna STATO.
- X20 copre la pulizia notturna:
  - il confine del 7° giorno, righe annullate senza date, righe senza notti, righe senza codice;
  - proprietà a `0` e lock occupato;
  - l'ultima prenotazione che resta, con il sito che continua a fidarsi del registro.
- Le altre 33 prove dello script passano uguali. X4 («il registro non cancella mai») vale ancora per la sincronizzazione: cancella solo la pulizia notturna.
- La suite dell'interfaccia (`ui.js`) va lanciata senza `LC_GAS_FILE`. Quattro prove (W15, W17, W21, W30) scrivono una prenotazione Airbnb direttamente nella copia del registro, come farebbe la sincronizzazione con lo stub; con lo script vero la sincronizzazione la riscrive. Succede uguale con lo script originale: è un limite del banco di prova, non del codice.
