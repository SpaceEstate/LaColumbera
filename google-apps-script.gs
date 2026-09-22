/**
 * La Columbera — Web App per aggiungere le prenotazioni del sito al Foglio Google.
 *
 * COME INSTALLARLO (una volta sola):
 * 1) Apri il Foglio Google delle prenotazioni.
 * 2) Menu: Estensioni > Apps Script.
 * 3) Cancella il codice presente e incolla TUTTO questo file. Salva.
 * 4) In alto: Distribuisci > Nuova distribuzione.
 *      - Tipo (icona ingranaggio): App web
 *      - Esegui come: Me stesso
 *      - Chi ha accesso: Chiunque
 *    Distribuisci e AUTORIZZA con il tuo account Google.
 * 5) Copia l'URL che finisce con /exec.
 * 6) Su Vercel > Settings > Environment Variables aggiungi:
 *      SHEET_WEBAPP_URL = <l'URL /exec copiato>
 *    (facoltativo, per sicurezza) SHEET_SECRET = una-parola-segreta
 *    e metti la stessa parola qui sotto in SECRET.
 * 7) Redeploy del sito su Vercel.
 *
 * Le colonne del foglio (prima riga = intestazioni) devono essere, in ordine:
 *   Numero Prenotazione | Data Check-in | Appartamento | Numero Ospiti | Numero Notti
 */

var SECRET = ''; // lascia '' oppure metti la stessa stringa di SHEET_SECRET su Vercel

function doPost(e) {
  try {
    var b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (SECRET && String(b.secret || '') !== SECRET) return out({ error: 'unauthorized' });
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    sh.appendRow([
      b.code || '',
      b.checkin || '',
      b.appartamento || '',
      b.ospiti || '',
      b.notti || ''
    ]);
    return out({ ok: true });
  } catch (err) {
    return out({ error: String(err) });
  }
}

function doGet() {
  return out({ ok: true, service: 'La Columbera bookings' });
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
