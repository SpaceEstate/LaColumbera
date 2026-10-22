// STUB MINIMO dello script Apps Script, usato dal banco di prova SOLO se nella radice del repo manca il vero google-apps-script.gs.
// Espone soltanto quello che serve per scaricare un registro vuoto e accettare gli upsert: i test che dipendono dallo script vero vengono saltati.
function setup() {}
function migraRegistro() {}
function _json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.action) return _json({ version: 2 });
  if (p.action === 'export') return _json({ ok: true, schema: 2, rows: [], total: 0, tz: 'Europe/Rome', generatedAt: new Date().toISOString() });
  if (p.action === 'find') return _json({ ok: true, row: null });
  return _json({ ok: false, error: 'azione non supportata' });
}
function doPost(e) { return _json({ ok: true, result: 'created' }); }
