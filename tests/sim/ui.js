// La Columbera · prova del front-end (js/pages.js, js/admin.js) in un browser simulato.
// Carica le pagine VERE (torre.html, admin.html), esegue gli script VERI e collega fetch() allo stesso handler,
// allo stesso Redis finto e allo stesso orologio del banco di prova: si vede cosa vedrebbero ospite e titolare.
//
//   npm i jsdom --prefix /tmp/jsd && JSDOM_PATH=/tmp/jsd/node_modules/jsdom node tests/sim/ui.js [filtro]
//
// Senza jsdom il file esce senza errori (le prove UI vengono saltate).
const path = require('path'), fs = require('fs'), assert = require('assert');
let JSDOM;
try { ({ JSDOM } = require(process.env.JSDOM_PATH || 'jsdom')); }
catch (e) { console.log('jsdom non disponibile (npm i jsdom, oppure JSDOM_PATH=…): prove UI saltate'); process.exit(0); }
const H = require('./harness'), { kv, clock, MIN } = H;
const ROOT = path.join(__dirname, '..', '..');
const tick = (min = 11) => clock.advance(min * MIN);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T = '"La Columbera - Torre, Appartamento con 2 camere da letto"', C = '"La Columbera - Corte, Appartamento con 1 camere da letto"', HDR = ['Numero Prenotazione', 'Data Check-in', 'Appartamento', 'Numero Ospiti', 'Numero Notti'];

async function setup() {
  const env = await H.newEnv({ legacyRows: [HDR, ['HMSEDESZCW', H.romeMidnight(2026, 10, 5), C, 2, 6], [6877180932, '02/10/2026', T, 4, 2]] });
  H.setFeed('bookingTorre', [H.bookingEv('b1', '2026-10-02', '2026-10-04')]);
  H.setFeed('airbnbCorte', [H.airbnbEv('a1', '2026-10-05', '2026-10-11', 'HMSEDESZCW')]);
  await H.runGas(env.gas, 'setup'); await H.runGas(env.gas, 'migraRegistro'); await H.sync();
  return env;
}
const checkout = o => H.api('checkout', Object.assign({ id: 'torre', da: '2026-10-20', a: '2026-10-23', ospiti: 2, nome: 'Mario Rossi', email: 'mario@test.it' }, o));
const stato = code => JSON.parse(kv.exec(['HGET', 'bkh', code])).stato;

// Adempimenti → Alloggiati Web: stessa funzione di Vercel (api/adempimenti.js) con servizio SOAP finto, la stessa KV e lo stesso orologio dei test.
let adp = null;
function makeAdp(o) {
  o = o || {};
  const ADP = require('../../api/adempimenti.js'), { makeSoapMock } = require('./soap-mock.js'), soap = makeSoapMock(o.soapOpts);
  const env = Object.assign({ ALLOGGIATI_UTENTE: 'XX002458', ALLOGGIATI_PASSWORD: 'pw-prova', ALLOGGIATI_WSKEY: 'KEY-PROVA', ALLOGGIATI_SEND_ENABLED: 'true', VERCEL_ENV: 'production', SESSION_SECRET: 'sess' }, o.env);      // stesso segreto di sessione del login (l'invio richiede la prova firmata con quel segreto)
  const handler = ADP.make({ env, kv: (...c) => kv.run(c), kvp: cmds => Promise.all(cmds.map(c => kv.run(c))), auth: H.V().handler.auth, fetch: (...a) => soap.fetch(...a), now: () => clock.now() });
  return { soap, handler, forceSend: null };
}
const callAdp = (handler, a, body, headers) => new Promise((resolve, reject) => {
  const out = { status: 200, text: '' }, req = { method: 'POST', query: { a }, headers: Object.assign({ host: 'www.lacolumbera.test' }, headers), body };
  const res = { setHeader() { return res; }, status(s) { out.status = s; return res; }, json(o) { out.text = JSON.stringify(o); resolve(out); return res; } };
  Promise.resolve(handler(req, res)).catch(reject);
});
// fetch() del browser → handler di Vercel (stesse regole: metodo, query, intestazioni, corpo JSON)
function bridge(w, log) {
  const resp = (status, text) => ({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(text), text: async () => text });
  return async (url, init = {}) => {
    const u = new URL(String(url), w.location.href), a = u.searchParams.get('a');
    if (u.pathname.endsWith('/data/default.json')) return resp(200, fs.readFileSync(path.join(ROOT, 'data', 'default.json'), 'utf8'));
    if (u.pathname.endsWith('/api/adempimenti') && a && adp) {
      const headers = {}; for (const [k, v] of Object.entries(init.headers || {})) headers[k.toLowerCase()] = v;
      if (a === 'al_send' && adp.forceSend) { if (adp.forceSend.throw) throw new TypeError('Failed to fetch'); log.calls.push({ a, status: adp.forceSend.status, q: {} }); return resp(adp.forceSend.status, adp.forceSend.text); }
      const out = await callAdp(adp.handler, a, init.body ? JSON.parse(init.body) : {}, headers);
      log.calls.push({ a, status: out.status, q: {} }); return resp(out.status, out.text || '');
    }
    if (!u.pathname.endsWith('/api/x') || !a) return resp(404, '{}');
    const q = Object.fromEntries(u.searchParams.entries()); delete q.a;
    const headers = {}; for (const [k, v] of Object.entries(init.headers || {})) headers[k.toLowerCase()] = v;
    const out = await H.api(a, init.body ? JSON.parse(init.body) : {}, { method: init.method || 'GET', query: q, headers });
    log.calls.push({ a, status: out.status, q }); return resp(out.status, out.text || '');
  };
}
async function load(file, { search = '', hash = '', token = '', scripts, confirmAnswer = false } = {}) {
  const log = { calls: [], alerts: [], confirms: [], confirmAnswer };
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');      // gli script si eseguono a mano, nell'ordine voluto
  const dom = new JSDOM(html, { url: 'https://www.lacolumbera.test/' + file + search + hash, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.__now = () => clock.now();
  w.eval('(function(){const R=Date;class F extends R{constructor(...a){a.length?super(...a):super(window.__now())} static now(){return window.__now()}};window.Date=F})()');      // stessa data simulata del server
  w.fetch = bridge(w, log); w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = function () {}; w.structuredClone = x => JSON.parse(JSON.stringify(x));      // API dei browser veri che jsdom non ha
  w.alert = m => { log.alerts.push(String(m)); }; w.confirm = m => { log.confirms.push(String(m)); return log.confirmAnswer; };
  if (token) w.sessionStorage.setItem('lc_t', token);
  for (const s of scripts) w.eval(fs.readFileSync(path.join(ROOT, s), 'utf8'));
  return { w, doc: w.document, log };
}
// Errori JavaScript della pagina (eccezioni non gestite, promesse rifiutate negli script): in un browser vero la pagina si romperebbe,
// qui fanno fallire il test in corso invece di far terminare il processo.
const pageErrors = [];
process.on('unhandledRejection', e => { pageErrors.push(e); });
process.on('uncaughtException', e => { pageErrors.push(e); });
const pageError = () => new Error('errore JavaScript nella pagina: ' + String(pageErrors[0] && pageErrors[0].message || pageErrors[0]));
async function waitFor(fn, what, tries = 150) {
  for (let i = 0; i < tries; i++) {
    if (pageErrors.length) throw pageError();
    let v; try { v = fn(); } catch (e) { v = null; }
    if (v) return v; await sleep(20);
  }
  if (pageErrors.length) throw pageError();
  throw new Error('timeout in attesa di: ' + what);
}
const text = el => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
const adminToken = async () => (await H.api('login', { u: 'admin', p: 'pw' })).body.t;
const loadAdmin = async (hash = '', extra = {}) => { const r = await load('admin.html', Object.assign({ hash, token: await adminToken(), scripts: ['js/site.js', 'js/adempimenti.js', 'js/admin.js'] }, extra)); await waitFor(() => r.doc.querySelector('#adm-body .admin-card'), 'pannello admin'); return r; };
const goto = async (r, hash, sel) => { r.w.location.hash = hash; await waitFor(() => r.doc.querySelector(sel), 'sezione ' + hash); };

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

/* ===================== pagina pubblica (pages.js) ===================== */
test('U1 appartamento: il calendario mostra le notti occupate (formato v2) e quelle passate', async () => {
  await setup();
  const { doc } = await load('torre.html', { scripts: ['js/site.js', 'js/pages.js'] });
  await waitFor(() => doc.querySelector('#cal .d'), 'calendario');
  const x = [...doc.querySelectorAll('#cal .d.x')].map(c => c.dataset.d);
  assert(x.includes('2026-10-02') && x.includes('2026-10-03'), 'occupate dal calendario Booking: ' + x.join(','));
  assert(x.includes('2026-10-01'), 'il passato non è prenotabile');
  assert(!x.includes('2026-10-20'), 'una data libera resta libera');
  assert(!doc.querySelector('[data-testid=booking-offline]'), 'nessun avviso di indisponibilità');
});
test('U2 appartamento: se la disponibilità non è verificabile NON appare alcun calendario, ma come contattarci', async () => {
  await setup();
  H.breakFeed('bookingTorre', { status: 500 }); tick(200); await H.sync();
  const { doc, log } = await load('torre.html', { scripts: ['js/site.js', 'js/pages.js'] });
  const box = await waitFor(() => doc.querySelector('[data-testid=booking-offline]'), 'avviso');
  assert(!doc.querySelector('#cal') && !doc.querySelector('[data-testid=booking-form]'), 'né calendario né modulo di prenotazione');
  assert(/non riesco a verificare la disponibilità/.test(text(box)) && /lacolumbera@gmail\.com/.test(text(box)) && /351 704 3594/.test(text(box)), text(box));
  assert(log.calls.some(c => c.a === 'busy' && c.status === 503), 'il server ha risposto 503');
});
test('U3 appartamento: Corte resta prenotabile anche se un feed di Torre è fermo', async () => {
  await setup();
  H.breakFeed('bookingTorre', { status: 500 }); tick(200); await H.sync();
  const { doc } = await load('corte.html', { scripts: ['js/site.js', 'js/pages.js'] });
  await waitFor(() => doc.querySelector('#cal .d'), 'calendario di Corte');
  const x = [...doc.querySelectorAll('#cal .d.x')].map(c => c.dataset.d);
  assert(x.includes('2026-10-09') && x.includes('2026-10-10') && !x.includes('2026-10-11'), 'Airbnb 5→11 ott: ' + x.join(','));
});
test('U4 pagamento annullato: le notti trattenute si liberano subito (checkout_cancel)', async () => {
  await setup();
  const c = (await checkout({ da: '2026-12-10', a: '2026-12-12' })).body.code;
  assert(kv.exec(['HGETALL', 'holds:torre']).length > 0, 'prima: notti trattenute');
  const { log, doc } = await load('torre.html', { search: '?pagamento=annullato&code=' + c, scripts: ['js/site.js', 'js/pages.js'] });
  await waitFor(() => log.calls.some(x => x.a === 'checkout_cancel'), 'checkout_cancel');
  await waitFor(() => kv.exec(['HGETALL', 'holds:torre']).length === 0, 'hold liberati');
  await waitFor(() => /Pagamento annullato/.test(text(doc.querySelector('#e'))), 'messaggio');
});

/* ===================== pannello admin (admin.js) ===================== */
test('U5 admin · Sincronizzazione: stato per appartamento, calendari, riconciliazione e matrice per data', async () => {
  await setup();
  const r = await loadAdmin();
  assert(/Tutto ok/.test(text(r.doc.querySelector('[data-testid=admin-sync-card]'))), 'Panoramica: tutto ok');
  await goto(r, '#sync', '[data-testid=admin-sync]');
  assert(/Verificata/.test(text(r.doc.querySelector('[data-testid=admin-sync-apt-torre]'))) && /Verificata/.test(text(r.doc.querySelector('[data-testid=admin-sync-apt-corte]'))));
  const rows = [...r.doc.querySelectorAll('[data-testid=admin-sync] tbody tr')];
  assert.equal(rows.length, 4, 'quattro calendari (Booking e Airbnb × Torre e Corte): ' + rows.length);
  assert(rows.every(x => /Aggiornato/.test(text(x))), 'tutti aggiornati');
  r.doc.querySelector('[data-testid=admin-recon-now]').click();
  await waitFor(() => r.doc.querySelector('[data-testid=admin-matrix]'), 'matrice');
  assert.equal(r.doc.querySelectorAll('[data-testid=admin-matrix] tbody tr').length, 45, '45 giorni');
  const riga = [...r.doc.querySelectorAll('[data-testid=admin-matrix] tbody tr')].find(x => /5 ott 2026/.test(text(x.firstElementChild)));
  const col = nome => [...r.doc.querySelectorAll('[data-testid=admin-matrix] thead th')].findIndex(th => text(th) === nome);      // l'ordine delle colonne segue la configurazione
  assert(/Airbnb/.test(text(riga.children[col('Corte')])) && /libera/.test(text(riga.children[col('Torre')])), 'il 5 ott: Corte occupata da Airbnb, Torre libera → ' + text(riga));
  assert(/Eseguita/.test(text(r.doc.querySelector('#sync-rec'))), 'esito della riconciliazione');
});
test('U6 admin · un calendario fermo: badge nel menu, appartamento "non verificabile", motivo leggibile', async () => {
  await setup();
  H.breakFeed('airbnbTorre', { status: 503 }); tick(200); await H.sync();
  const r = await loadAdmin('#sync');
  await waitFor(() => r.doc.querySelector('[data-testid=admin-sync]'), 'sezione');
  assert(/Non verificabile/.test(text(r.doc.querySelector('[data-testid=admin-sync-apt-torre]'))), text(r.doc.querySelector('[data-testid=admin-sync-apt-torre]')));
  assert(/Verificata/.test(text(r.doc.querySelector('[data-testid=admin-sync-apt-corte]'))), 'Corte non è coinvolta');
  assert(/Scaduto|Mai scaricato/.test(text(r.doc.querySelector('[data-testid=admin-sync]'))), 'il calendario è segnalato');
  const badge = [...r.doc.querySelectorAll('#adm-nav a')].find(a => /Sincronizzazione/.test(text(a)));
  assert(badge && r.doc.querySelector('#adm-nav a .adm-badge') && /\d/.test(text(badge)), 'badge nel menu: ' + text(badge));
  r.doc.querySelector('[data-testid=admin-sync-now]').click();
  await waitFor(() => /completata|errori/i.test(text(r.doc.querySelector('[data-testid=admin-sync-msg]'))), 'esito sincronizzazione');
});
test('U7 admin · da_verificare: segnalata, con nota; la conferma con sovrapposizione chiede conferma esplicita', async () => {
  await setup();
  const c2 = (await checkout({ da: '2026-12-27', a: '2026-12-29', email: 'primo@t.it' })).body.code; tick(40);
  const c3 = (await checkout({ da: '2026-12-27', a: '2026-12-29', email: 'altro@t.it' })).body.code;
  await H.webhook('checkout.session.completed', H.paidSession(c3)); await H.webhook('checkout.session.completed', H.paidSession(c2));
  assert.equal(stato(c2), 'da_verificare');
  const r = await loadAdmin();
  assert(/1/.test(text(r.doc.querySelector('.adm-stat'))), 'Panoramica: 1 da gestire');
  await goto(r, '#prenotazioni', '[data-testid=admin-bookings]');
  const sel = r.doc.querySelector(`select[data-code="${c2}"]`);
  assert.deepEqual([...sel.options].map(o => o.value || o.textContent), ['da_verificare', 'confermata', 'annullata']);
  assert.equal(sel.value, 'da_verificare', 'il menu mostra lo stato reale, non «richiesta»');
  assert(/⚠.*SOVRAPPOSIZIONE|⚠/.test(text(sel.closest('tr').querySelector('.td-cliente'))), 'nota di avviso visibile: ' + text(sel.closest('tr')));
  // 1) il titolare prova a confermare, c'è sovrapposizione: il sito mostra il dettaglio e lui dice di no
  sel.value = 'confermata'; sel.dispatchEvent(new r.w.Event('change', { bubbles: true }));
  await waitFor(() => r.log.confirms.length === 1, 'richiesta di conferma');
  assert(/27 dic/.test(r.log.confirms[0]) && /Sito/.test(r.log.confirms[0]) && /Confermare comunque/.test(r.log.confirms[0]), r.log.confirms[0]);
  await waitFor(() => r.doc.querySelector(`select[data-code="${c2}"]`) && r.doc.querySelector(`select[data-code="${c2}"]`).value === 'da_verificare', 'menu riallineato');
  assert.equal(stato(c2), 'da_verificare', 'rifiutando, nulla cambia');
  // 2) ci riprova e conferma comunque
  r.log.confirmAnswer = true; global.__mails.length = 0;
  const sel2 = r.doc.querySelector(`select[data-code="${c2}"]`); sel2.value = 'confermata'; sel2.dispatchEvent(new r.w.Event('change', { bubbles: true }));
  await waitFor(() => stato(c2) === 'confermata', 'conferma forzata');
  assert(/CONFERMATA A MANO/.test(JSON.parse(kv.exec(['HGET', 'bkh', c2])).note), 'resta traccia della decisione');
  await waitFor(() => global.__mails.some(m => m.to === 'primo@t.it'), 'mail di conferma all\'ospite');
});

/* ===================== preavviso minimo di prenotazione ===================== */
const saveNotice = async (giorni, ora) => { const c = (await H.adminApi('cfg_admin', {})).body; Object.assign(c, { preavvisoGiorni: giorni, checkinOra: ora }); assert.equal((await H.adminApi('save', c)).status, 200); };
test('U8 appartamento con preavviso: giorni entro il limite non selezionabili, avviso con il primo arrivo, messaggio chiaro al clic', async () => {
  await setup(); await saveNotice(2, '15:00');
  clock.set('2026-10-15T09:00:00Z'); await H.sync();                               // 11:00 a Roma: il primo arrivo prenotabile è il 17/10
  const { doc } = await load('torre.html', { scripts: ['js/site.js', 'js/pages.js'] });
  await waitFor(() => doc.querySelector('#cal .d'), 'calendario');
  const x = [...doc.querySelectorAll('#cal .d.x')].map(c => c.dataset.d);
  assert(x.includes('2026-10-15') && x.includes('2026-10-16') && !x.includes('2026-10-17'), 'giorni non selezionabili: ' + x.join(','));
  const note = doc.querySelector('[data-testid=notice-note]');
  assert(note && /almeno 2 giorni di preavviso/.test(text(note)) && /17 ott 2026/.test(text(note)), text(note));
  doc.querySelector('#cal .d[data-d="2026-10-16"]').click();
  assert(/almeno 2 giorni di preavviso/.test(text(doc.querySelector('#e'))) && !doc.querySelector('#cal .d.s'), 'messaggio al clic: ' + text(doc.querySelector('#e')));
  doc.querySelector('#cal .d[data-d="2026-10-17"]').click();
  assert(doc.querySelector('#cal .d.s[data-d="2026-10-17"]') && text(doc.querySelector('#e')) === '', 'il primo arrivo si seleziona e il messaggio sparisce');
});
test('U9 appartamento senza preavviso (0 giorni, default): nessun avviso e nessun giorno in più bloccato', async () => {
  await setup(); clock.set('2026-10-15T09:00:00Z'); await H.sync();
  const { doc } = await load('torre.html', { scripts: ['js/site.js', 'js/pages.js'] });
  await waitFor(() => doc.querySelector('#cal .d'), 'calendario');
  assert(!doc.querySelector('[data-testid=notice-note]'), 'nessun avviso');
  const x = [...doc.querySelectorAll('#cal .d.x')].map(c => c.dataset.d);
  assert(x.includes('2026-10-14') && !x.includes('2026-10-15') && !x.includes('2026-10-16'), 'oggi e domani selezionabili: ' + x.join(','));
});
test('U10 appartamento: se il limite scade mentre si compila il modulo il server rifiuta e il messaggio è chiaro (nessun hold, nessun pagamento)', async () => {
  await setup(); await saveNotice(1, '15:00');
  clock.set('2026-10-15T12:55:00Z'); await H.sync();                               // 14:55 a Roma: il 16 è ancora prenotabile (limite 15:00)
  const { doc } = await load('torre.html', { scripts: ['js/site.js', 'js/pages.js'] });
  await waitFor(() => doc.querySelector('#cal .d'), 'calendario');
  doc.querySelector('#cal .d[data-d="2026-10-16"]').click(); doc.querySelector('#cal .d[data-d="2026-10-18"]').click();
  assert(/2 notti/.test(text(doc.querySelector('#q'))), text(doc.querySelector('#q')));
  doc.querySelector('[data-testid=booking-name]').value = 'Mario Rossi'; doc.querySelector('[data-testid=booking-email]').value = 'mario@test.it';
  clock.advance(10 * MIN);                                                          // 15:05: il limite è passato mentre l'ospite compilava
  const stripeBefore = global.__stripeSessions.length;
  doc.querySelector('#f').requestSubmit();
  await waitFor(() => /Preavviso minimo non rispettato/.test(text(doc.querySelector('#e'))), 'messaggio del server');
  const btn = doc.querySelector('[data-testid=booking-submit]');
  assert(!btn.disabled && !btn.classList.contains('is-loading'), 'il pulsante torna utilizzabile');
  assert.equal(global.__stripeSessions.length, stripeBefore, 'nessuna sessione Stripe'); assert.equal(kv.exec(['HGETALL', 'holds:torre']).length, 0, 'nessun hold');
});
test('U11 admin · Preavviso minimo: si imposta, si salva e resta dopo il ricaricamento; un valore non valido non parte', async () => {
  await setup();
  const r = await loadAdmin('#prenotazioni');
  const days = await waitFor(() => r.doc.querySelector('[data-testid=admin-notice-days]'), 'campo preavviso'), hour = r.doc.querySelector('[data-testid=admin-checkin-time]');
  assert.deepEqual([days.value, hour.value], ['0', '16:00'], 'valori iniziali: nessun preavviso, check-in 16:00');
  assert(/0 giorni non c/.test(text(r.doc.querySelector('[data-testid=admin-notice-example]'))), 'spiega che 0 = last minute');
  const set = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  set(r.w, days, '3'); set(r.w, hour, '16:30');
  const ex = text(r.doc.querySelector('[data-testid=admin-notice-example]'));
  assert(/Esempio/.test(ex) && /16:30/.test(ex) && /ora di Roma/.test(ex), ex);
  assert(/non salvate/.test(text(r.doc.querySelector('[data-testid=admin-save-msg]'))), 'avvisa che manca il salvataggio');
  r.doc.querySelector('[data-testid=admin-save]').click();
  await waitFor(() => /Salvato/.test(text(r.doc.querySelector('[data-testid=admin-save-msg]'))), 'salvataggio');
  const st = JSON.parse(kv.exec(['GET', 'cfg'])); assert.deepEqual([st.preavvisoGiorni, st.checkinOra], [3, '16:30'], 'salvato in KV');
  const r2 = await loadAdmin('#prenotazioni');                                       // pagina nuova, come dopo un riavvio
  const d2 = r2.doc.querySelector('[data-testid=admin-notice-days]');
  assert.deepEqual([d2.value, r2.doc.querySelector('[data-testid=admin-checkin-time]').value], ['3', '16:30'], 'i valori ci sono ancora');
  set(r2.w, d2, '-1');
  r2.doc.querySelector('[data-testid=admin-save]').click();
  await waitFor(() => /Controlla il preavviso minimo/.test(text(r2.doc.querySelector('[data-testid=admin-save-msg]'))), 'rifiuto già nella pagina');
  assert.equal(JSON.parse(kv.exec(['GET', 'cfg'])).preavvisoGiorni, 3, 'sul server non è cambiato nulla');
  set(r2.w, d2, '1.5'); r2.doc.querySelector('[data-testid=admin-save]').click();
  await waitFor(() => /Controlla il preavviso minimo/.test(text(r2.doc.querySelector('[data-testid=admin-save-msg]'))), 'anche i decimali sono respinti');
});

test('U12 appartamento: a mezzanotte italiana (in UTC è ancora ieri) il giorno appena passato non è selezionabile', async () => {
  await setup(); clock.set('2026-10-15T22:30:00Z'); await H.sync();                 // 16/10 ore 00:30 a Roma, in UTC è ancora il 15
  const { doc } = await load('torre.html', { scripts: ['js/site.js', 'js/pages.js'] });
  await waitFor(() => doc.querySelector('#cal .d'), 'calendario');
  const x = [...doc.querySelectorAll('#cal .d.x')].map(c => c.dataset.d);
  assert(x.includes('2026-10-15') && !x.includes('2026-10-16'), 'il 15 per Roma è già ieri: ' + x.join(','));
});

/* ===================== Adempimenti → Alloggiati Web (js/adempimenti.js) ===================== */
const FX = n => fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'alloggiati', n), 'utf8');
const fire = (el, type) => el.dispatchEvent(new el.ownerDocument.defaultView.Event(type, { bubbles: true, cancelable: true }));
const setv = (el, v, type) => { el.value = v; fire(el, type || 'input'); };
const pickFile = (r, txt, name) => { const input = r.doc.querySelector('input[data-file]'), file = new r.w.File([txt], name || 'prova.txt', { type: 'text/plain' }); Object.defineProperty(input, 'files', { value: [file], configurable: true }); fire(input, 'change'); };
const openAdp = async (o, wait) => { await setup(); adp = makeAdp(o); const r = await loadAdmin('#adempimenti'); if (wait !== false) await waitFor(() => /Configurazione valida/.test(text(r.doc.querySelector('[data-testid=adp-status]'))), 'configurazione valida'); return r; };
const goCheck = async (r, file) => { pickFile(r, FX(file || 'famiglia.txt'), file || 'famiglia.txt'); await waitFor(() => r.doc.querySelector('[data-testid=adp-ready]'), 'pronto'); r.doc.querySelector('[data-testid=adp-check]').click(); await waitFor(() => r.doc.querySelector('[data-testid=adp-check-ok]'), 'verifica ok'); };
const goSend = async (r, file) => { await goCheck(r, file); const c = r.doc.querySelector('[data-testid=adp-confirm]'); c.checked = true; fire(c, 'change'); await waitFor(() => { const b = r.doc.querySelector('[data-testid=adp-send]'); return b && !b.disabled; }, 'invio abilitato'); r.doc.querySelector('[data-testid=adp-send]').click(); };
const resultOf = (r, st) => r.doc.querySelector('[data-testid=adp-result][data-stato=' + st + ']');

test('U13 Adempimenti: voce di menu, stato della configurazione e tabelle ufficiali; configurazione incompleta spiegata', async () => {
  const r = await openAdp();
  const nav = [...r.doc.querySelectorAll('#adm-nav a')].find(a => /Adempimenti/.test(text(a)));
  assert(nav && nav.classList.contains('on'), 'voce di menu attiva'); assert(r.doc.body.classList.contains('adp-active'), 'barra "Salva modifiche" nascosta in questa sezione');
  const st = text(r.doc.querySelector('[data-testid=adp-status]')); assert(/XX\u2022\u2022\u2022\u202258/.test(st) && /Luoghi: 7 righe/.test(st) && /Invio reale attivo/.test(st) && /Ambiente production/.test(st), st);
  assert(!/pw-prova|KEY-PROVA|TOKEN-/.test(r.doc.documentElement.outerHTML), 'nessun segreto nella pagina');
  assert.deepEqual(r.log.calls.filter(c => c.a.startsWith('al_')).map(c => c.a), ['al_status', 'al_lookup'], 'stato e tabella dei documenti');
  assert(!r.doc.querySelector('[data-testid=adp-list]'), 'nessun elenco finché non si carica qualcosa'); assert(r.doc.querySelector('[data-testid=adp-origine]'));
  const r2 = await openAdp({ env: { ALLOGGIATI_WSKEY: '' } }, false);
  await waitFor(() => /Mancano variabili/.test(text(r2.doc.querySelector('[data-testid=adp-status]'))), 'variabili mancanti');
  const t2 = text(r2.doc.querySelector('[data-testid=adp-status]')); assert(/ALLOGGIATI_WSKEY/.test(t2) && !/Configurazione valida/.test(t2), t2); assert(r2.doc.querySelector('[data-testid=adp-status] details').open, 'con un problema la sezione si apre da sola');
});
test('U14 Adempimenti: carico il TXT → anteprima per nucleo con nomi decodificati, controlli superati, nessuna chiamata di verifica o invio', async () => {
  const r = await openAdp(); pickFile(r, FX('famiglia.txt'), 'famiglia.txt');
  await waitFor(() => r.doc.querySelectorAll('[data-testid^=adp-row-]').length === 4, 'quattro schede'); await waitFor(() => r.doc.querySelector('[data-testid=adp-ready]'), 'controlli superati');
  const nu = r.doc.querySelectorAll('.adp-nu'); assert.equal(nu.length, 1); assert(/Famiglia/.test(text(nu[0].querySelector('header'))) && /4 schedine/.test(text(nu[0].querySelector('header'))));
  const row0 = text(r.doc.querySelector('[data-testid=adp-row-0]')); assert(/Capo famiglia/.test(row0) && /Neri Giulia/.test(row0) && /ESTERIA/.test(row0) && /CARTA DI IDENTITA/.test(row0) && /partenza 19\/10\/2026/.test(row0), row0);
  assert(/Familiare/.test(text(r.doc.querySelector('[data-testid=adp-row-1]'))), 'i componenti sono familiari');
  assert(/nessun errore/.test(text(r.doc.querySelector('[data-testid=adp-summary]'))) && /File caricato: famiglia.txt/.test(text(r.doc.querySelector('[data-testid=adp-origine]'))));
  assert(!r.doc.querySelector('.adp-row .adp-iss'), 'nessun problema segnalato'); assert(!r.doc.querySelector('[data-testid=adp-check]').disabled, 'verifica disponibile');
  assert(r.doc.querySelector('[data-testid=adp-invio]').classList.contains('adp-off'), 'il passo 4 non è ancora disponibile');
  assert.equal(adp.soap.count('Test') + adp.soap.count('Send'), 0, 'la sola anteprima non chiama il servizio per verifica o invio');
  assert.deepEqual([...r.doc.querySelectorAll('.adp-steps li')].map(l => l.className), ['done', 'done', 'cur', ''], 'avanzamento');
});
test('U15 Adempimenti: riga ricostruita da un file difettoso = errore e nucleo bloccato; correggendo la scheda a mano tutto si sblocca', async () => {
  const r = await openAdp(), lines = FX('famiglia.txt').split('\n'); lines[2] = lines[2].slice(0, 150); pickFile(r, lines.join('\n'), 'difettoso.txt');
  await waitFor(() => r.doc.querySelectorAll('[data-testid^=adp-row-]').length === 4, 'schede'); await waitFor(() => r.doc.querySelector('[data-testid=adp-notready]'), 'elenco non pronto');
  const row2 = text(r.doc.querySelector('[data-testid=adp-row-2]')); assert(/1 errore/.test(row2) && /168/.test(row2), row2);
  assert(/nucleo bloccato/.test(text(r.doc.querySelector('.adp-nu'))), 'nucleo bloccato'); assert(r.doc.querySelector('[data-testid=adp-check]').disabled, 'verifica spenta con errori');
  r.doc.querySelector('[data-testid=adp-edit-2]').click(); const form = await waitFor(() => r.doc.querySelector('[data-testid=adp-form]'), 'finestra di modifica');
  assert(form.querySelector('#f-cognome').value.length > 0, 'campi precompilati'); assert(form.querySelector('[data-fld=doc]').hidden, 'familiare: niente documento');
  form.requestSubmit();      // salvare senza cambiare nulla = confermare a mano la riga ricostruita
  await waitFor(() => !r.doc.querySelector('[data-testid=adp-modal]'), 'finestra chiusa'); await waitFor(() => r.doc.querySelector('[data-testid=adp-ready]'), 'ora pronto');
  assert(!r.doc.querySelector('.adp-row .adp-iss'), 'nessun problema residuo');
});
test('U16 Adempimenti: inserimento a mano con menu a ricerca (stato, comune, documento); un testo non scelto dall\'elenco non passa', async () => {
  const r = await openAdp(); r.doc.querySelector('[data-testid=adp-add]').click(); const form = await waitFor(() => r.doc.querySelector('[data-testid=adp-form]'), 'finestra');
  const f = id => form.querySelector('#' + id), list = k => form.querySelector('#lb-' + k), pickFirst = async k => { const li = await waitFor(() => list(k).querySelector('li[data-code]'), 'risultati ' + k); li.click(); };
  assert(form.querySelector('[data-fld=comune]').hidden, 'comune nascosto finché non si sceglie lo stato');
  assert.deepEqual([...f('f-tipodoc').options].map(o => o.value), ['', 'IDENT', 'PASOR', 'PATEN'], 'tipi di documento dal servizio');
  setv(f('f-stato'), 'ital'); await waitFor(() => list('stato').querySelector('li[data-code]'), 'risultati'); setv(f('f-cognome'), 'Rossi'); form.requestSubmit();
  assert(/Scegli lo stato di nascita/.test(text(form.querySelector('#adp-ferr'))) && r.doc.querySelector('[data-testid=adp-modal]'), 'testo non scelto: non si salva');
  list('stato').querySelector('li[data-code="100000100"]').click();
  assert.equal(f('f-stato').value, 'ITALIA'); assert(!form.querySelector('[data-fld=comune]').hidden, 'comune visibile per l\'Italia'); assert.equal(f('f-cittad').value, 'ITALIA', 'cittadinanza proposta');
  setv(f('f-comune'), 'borgo'); await pickFirst('comune'); assert.equal(f('f-prov').value, 'RM', 'provincia dal comune');
  setv(f('f-giorni'), '3'); setv(f('f-arrivo'), '2026-10-20'); setv(f('f-nome'), 'Mario'); setv(f('f-sesso'), '1', 'change'); setv(f('f-nascita'), '1980-02-01'); setv(f('f-tipodoc'), 'IDENT', 'change'); setv(f('f-numdoc'), 'AA1234567');
  setv(f('f-luogo'), 'borgo'); await pickFirst('luogo'); form.requestSubmit();
  await waitFor(() => !r.doc.querySelector('[data-testid=adp-modal]'), 'finestra chiusa'); await waitFor(() => r.doc.querySelector('[data-testid=adp-ready]'), 'controlli superati');
  const row = text(r.doc.querySelector('[data-testid=adp-row-0]')); assert(/Rossi Mario/.test(row) && /Ospite singolo/.test(row) && /BORGO D'ESEMPIO \(RM\)/.test(row) && /CARTA DI IDENTITA AA1234567/.test(row) && /partenza 23\/10\/2026/.test(row), row);
  r.doc.querySelector('[data-testid=adp-edit-0]').click(); const f2 = await waitFor(() => r.doc.querySelector('[data-testid=adp-form]'), 'riapro la scheda');
  setv(f2.querySelector('#f-tipo'), '19', 'change'); assert(f2.querySelector('[data-fld=doc]').hidden, 'passando a familiare il documento si nasconde');
  setv(f2.querySelector('#f-stato'), 'terz'); const li = await waitFor(() => f2.querySelector('#lb-stato li[data-code]'), 'stati'); li.click(); assert(f2.querySelector('[data-fld=comune]').hidden && f2.querySelector('#f-comune').value === '', 'estero: comune e provincia spariscono');
  r.doc.querySelector('[data-testid=adp-cancel]').click(); assert(!r.doc.querySelector('[data-testid=adp-modal]'), 'annulla chiude senza salvare'); assert(/BORGO D'ESEMPIO/.test(text(r.doc.querySelector('[data-testid=adp-row-0]'))), 'scheda invariata');
});
test('U17 Adempimenti: percorso completo (verifica → conferma → invio): nessun Send prima della conferma, un solo Send anche con doppio clic, elenco bloccato dopo, stesso file rifiutato', async () => {
  const r = await openAdp(); await goCheck(r);
  const ok = text(r.doc.querySelector('[data-testid=adp-check-ok]')); assert(/accettato tutte le 4 schedine/.test(ok) && /Nulla è stato inviato/.test(ok) && /valida fino alle/.test(ok), ok);
  assert.equal(adp.soap.count('Test'), 1); assert.equal(adp.soap.sent.length, 0, 'il Test non invia'); const send = () => r.doc.querySelector('[data-testid=adp-send]'), conf = () => r.doc.querySelector('[data-testid=adp-confirm]');
  assert(send().disabled, 'senza conferma il bottone è spento'); send().click(); await sleep(60); assert.equal(adp.soap.count('Send'), 0, 'clic su un bottone spento: nessun invio');
  conf().checked = true; fire(conf(), 'change'); await waitFor(() => !send().disabled, 'invio abilitato dopo la conferma');
  const btn = send(); btn.click(); btn.click();      // doppio clic
  await waitFor(() => resultOf(r, 'inviato'), 'inviato'); assert.equal(adp.soap.count('Send'), 1, 'un solo Send'); assert.deepEqual(adp.soap.sent, FX('famiglia.txt').split('\n'), 'inviate esattamente le righe verificate');
  const res = text(resultOf(r, 'inviato')); assert(/Inviato: 4 schedine acquisite/.test(res) && /Neri Giulia: acquisita/.test(res), res);
  assert(!r.doc.querySelector('[data-testid=adp-edit-0]') && !r.doc.querySelector('[data-testid=adp-del-0]') && !r.doc.querySelector('[data-testid=adp-send]') && !r.doc.querySelector('[data-testid=adp-add]:not([disabled])'), 'elenco bloccato dopo l\'invio');
  assert.equal(r.doc.querySelectorAll('.adp-steps li.done').length, 4);
  r.doc.querySelector('[data-testid=adp-res-newlist]').click(); await waitFor(() => !r.doc.querySelector('[data-testid=adp-list]'), 'nuovo elenco vuoto');
  pickFile(r, FX('famiglia.txt')); await waitFor(() => /già acquisita dal servizio/.test(text(r.doc.querySelector('[data-testid=adp-row-0]'))), 'schede già inviate');
  assert(r.doc.querySelector('[data-testid=adp-notready]') && r.doc.querySelector('[data-testid=adp-check]').disabled, 'lo stesso file non si può rimandare'); assert.equal(adp.soap.count('Send'), 1);
});
test('U18 Adempimenti: invio reale disattivato (ambiente preview): la verifica funziona, l\'invio resta spento e spiegato', async () => {
  const r = await openAdp({ env: { VERCEL_ENV: 'preview' } }); await goCheck(r);
  const off = text(r.doc.querySelector('[data-testid=adp-send-off]')); assert(/Invio reale disattivato/.test(off) && /preview/.test(off), off);
  assert(r.doc.querySelector('[data-testid=adp-confirm]').disabled && r.doc.querySelector('[data-testid=adp-send]').disabled); r.doc.querySelector('[data-testid=adp-send]').click(); await sleep(60);
  assert.equal(adp.soap.count('Send'), 0); assert.equal(adp.soap.count('Test'), 1);
});
test('U19 Adempimenti: esito incerto (il servizio non risponde all\'invio): istruzioni chiare, niente ritentativi, elenco bloccato finché non si sceglie', async () => {
  const r = await openAdp({ soapOpts: { modo: { Send: 'abort' } } }); await goSend(r); await waitFor(() => resultOf(r, 'esito_incerto'), 'esito incerto');
  const res = text(resultOf(r, 'esito_incerto')); assert(/NON inviare di nuovo/.test(res) && /portale Alloggiati Web/.test(res), res);
  assert.equal(adp.soap.count('Send'), 1); assert(!r.doc.querySelector('[data-testid=adp-send]') && !r.doc.querySelector('[data-testid=adp-edit-0]'), 'niente bottone di invio, elenco bloccato');
  r.doc.querySelector('[data-testid=adp-res-unlock]').click(); assert.equal(r.log.confirms.length, 1); assert(/NON risultano comunicate/.test(r.log.confirms[0])); assert(resultOf(r, 'esito_incerto'), 'senza conferma resta bloccato');
  r.log.confirmAnswer = true; r.doc.querySelector('[data-testid=adp-res-unlock]').click(); await waitFor(() => !r.doc.querySelector('[data-testid=adp-result]'), 'sbloccato');
  assert(r.doc.querySelector('[data-testid=adp-edit-0]'), 'si può modificare'); assert(/Ripeti la verifica/.test(text(r.doc.querySelector('[data-testid=adp-msg]')))); assert(r.doc.querySelector('[data-testid=adp-invio]').classList.contains('adp-off'), 'serve una nuova verifica prima di inviare'); assert.equal(adp.soap.count('Send'), 1);
});
test('U20 Adempimenti: 504 o risposta non JSON durante l\'invio = esito incerto (mai "non inviato"); un rifiuto chiaro (400) è un errore normale', async () => {
  let r = await openAdp(); adp.forceSend = { status: 504, text: '<html>Gateway Timeout</html>' }; await goSend(r); await waitFor(() => resultOf(r, 'esito_incerto'), 'esito incerto');
  assert(/NON inviare di nuovo/.test(text(resultOf(r, 'esito_incerto')))); assert(!r.doc.querySelector('[data-testid=adp-send]'), 'nessun secondo invio dal pulsante');
  r = await openAdp(); adp.forceSend = { status: 500, text: JSON.stringify({ err: 'Errore interno: nessun dato è stato conservato' }) }; await goSend(r); await waitFor(() => resultOf(r, 'esito_incerto'), 'esito incerto per errore 500 senza stato'); assert(/NON inviare di nuovo/.test(text(resultOf(r, 'esito_incerto'))), '500 JSON senza stato: incerto');
  r = await openAdp(); adp.forceSend = { status: 200, text: '{}' }; await goSend(r); await waitFor(() => resultOf(r, 'esito_incerto'), 'esito incerto per risposta 200 sconosciuta');
  r = await openAdp(); adp.forceSend = { throw: true }; await goSend(r); await waitFor(() => resultOf(r, 'esito_incerto'), 'esito incerto per rete caduta'); assert(/NON inviare di nuovo/.test(text(resultOf(r, 'esito_incerto'))), 'connessione persa durante l\'invio: esito incerto');
  r = await openAdp(); adp.forceSend = { status: 400, text: JSON.stringify({ err: 'Richiesta rifiutata dal server di prova' }) }; await goSend(r); await waitFor(() => resultOf(r, 'errore'), 'errore');
  assert(/Richiesta rifiutata dal server di prova/.test(text(resultOf(r, 'errore')))); assert(r.doc.querySelector('[data-testid=adp-edit-0]'), 'con un rifiuto chiaro l\'elenco resta modificabile');
  r.doc.querySelector('[data-testid=adp-res-dismiss]').click(); assert(!r.doc.querySelector('[data-testid=adp-result]'));
});
test('U21 Adempimenti: sessione scaduta → si torna al login senza perdere l\'elenco; dopo l\'accesso i dati ci sono ancora', async () => {
  const r = await openAdp(); pickFile(r, FX('famiglia.txt')); await waitFor(() => r.doc.querySelector('[data-testid=adp-ready]'), 'pronto'); clock.advance(9 * 60 * MIN);
  r.doc.querySelector('[data-testid=adp-check]').click(); await waitFor(() => r.doc.querySelector('[data-testid=admin-login-form]'), 'login'); assert(!r.doc.querySelector('[data-testid=adp-list]'));
  r.doc.querySelector('#au').value = 'admin'; r.doc.querySelector('#ap').value = 'pw'; r.doc.querySelector('#l').requestSubmit();
  await waitFor(() => r.doc.querySelectorAll('[data-testid^=adp-row-]').length === 4, 'elenco ancora presente'); assert.equal(adp.soap.count('Test') + adp.soap.count('Send'), 0, 'nessuna chiamata al servizio con la sessione scaduta');
});
test('U22 Adempimenti: ciò che si scrive nelle schede non diventa mai HTML (tag, apici, virgolette)', async () => {
  const r = await openAdp(), evil = '<img src=x onerror="window.__xss=1">'; r.doc.querySelector('[data-testid=adp-add]').click(); const form = await waitFor(() => r.doc.querySelector('[data-testid=adp-form]'), 'finestra');
  setv(form.querySelector('#f-cognome'), evil); setv(form.querySelector('#f-nome'), '"><script>window.__xss=2</script>'); form.requestSubmit(); await waitFor(() => r.doc.querySelector('[data-testid=adp-row-0]'), 'scheda');
  await waitFor(() => /1\d? err/.test(text(r.doc.querySelector('[data-testid=adp-row-0]'))), 'errori sulla scheda');
  assert(!r.doc.querySelector('[data-testid=adp-list] img, [data-testid=adp-list] script'), 'nessun elemento creato dal testo'); assert.equal(r.w.__xss, undefined); assert(text(r.doc.querySelector('[data-testid=adp-row-0]')).includes(evil), 'il testo compare così com\'è');
  r.doc.querySelector('[data-testid=adp-edit-0]').click(); const f2 = await waitFor(() => r.doc.querySelector('[data-testid=adp-form]'), 'riapro'); assert.equal(f2.querySelector('#f-cognome').value, evil, 'nel campo il valore è identico');
});
test('U23 Adempimenti: riga ricostruita dalla pagina identica a quella del server; dettaglio tecnico; ordine ed eliminazione ricalcolano i nuclei', async () => {
  const r = await openAdp(), AL = require('../../api/_alloggiati.js');
  for (const f of ['ospite-singolo.txt', 'famiglia.txt', 'gruppo.txt']) for (const rec of AL.parseText(FX(f)).records) assert.equal(r.w.LCAdempimenti.lineOf(rec), AL.recordToLine(rec).line, f);
  const e = AL.emptyRecord('17', '16/10/2026'); assert.equal(r.w.LCAdempimenti.lineOf(e), AL.recordToLine(e).line); const g = Object.assign({}, AL.parseText(FX('ospite-singolo.txt')).records[0], { giorni: '5' }); assert.equal(r.w.LCAdempimenti.lineOf(g), AL.recordToLine(g).line, 'giorni a una cifra');
  pickFile(r, FX('famiglia.txt')); await waitFor(() => r.doc.querySelector('[data-testid=adp-ready]'), 'pronto');
  r.doc.querySelector('[data-testid=adp-tech-0]').click(); const pre = await waitFor(() => r.doc.querySelector('[data-testid=adp-line]'), 'dettaglio tecnico');
  assert.equal(pre.textContent.replace(/\u00b7/g, ' '), FX('famiglia.txt').split('\n')[0]); assert(/168 caratteri/.test(text(r.doc.querySelector('[data-testid=adp-tech]'))));
  assert(r.doc.querySelector('[data-testid=adp-row-0] [data-a=up]').disabled && !r.doc.querySelector('[data-testid=adp-row-1] [data-a=up]').disabled, '↑ spenta sulla prima scheda');
  r.log.confirmAnswer = true; r.doc.querySelector('[data-testid=adp-del-0]').click(); await waitFor(() => r.doc.querySelectorAll('[data-testid^=adp-row-]').length === 3, 'tre schede');
  await waitFor(() => /Senza capo/.test(text(r.doc.querySelector('[data-testid=adp-list]'))), 'familiari senza capo'); assert(r.doc.querySelector('[data-testid=adp-notready]')); assert.equal(adp.soap.count('Test') + adp.soap.count('Send'), 0);
});

test('U24 Adempimenti: modificare un dato dopo la verifica annulla la verifica (passo 4 spento); una verifica scaduta non si può usare', async () => {
  const r = await openAdp(); await goCheck(r); assert(r.doc.querySelector('[data-testid=adp-send]'), 'dopo la verifica il passo 4 è disponibile');
  r.doc.querySelector('[data-testid=adp-edit-1]').click(); const form = await waitFor(() => r.doc.querySelector('[data-testid=adp-form]'), 'finestra'); setv(form.querySelector('#f-nome'), 'Luka'); form.requestSubmit();
  await waitFor(() => !r.doc.querySelector('[data-testid=adp-modal]'), 'finestra chiusa'); await waitFor(() => r.doc.querySelector('[data-testid=adp-ready]'), 'ricontrollato');
  assert(!r.doc.querySelector('[data-testid=adp-check-ok]') && !r.doc.querySelector('[data-testid=adp-send]') && r.doc.querySelector('[data-testid=adp-invio]').classList.contains('adp-off'), 'la verifica non vale più');
  r.doc.querySelector('[data-testid=adp-check]').click(); await waitFor(() => r.doc.querySelector('[data-testid=adp-check-ok]'), 'nuova verifica'); assert.equal(adp.soap.count('Test'), 2);
  const c = r.doc.querySelector('[data-testid=adp-confirm]'); c.checked = true; fire(c, 'change'); await waitFor(() => { const b = r.doc.querySelector('[data-testid=adp-send]'); return b && !b.disabled; }, 'invio abilitato');
  clock.advance(21 * MIN); r.doc.querySelector('[data-testid=adp-send]').click(); await waitFor(() => /scaduta/.test(text(r.doc.querySelector('[data-testid=adp-msg]'))), 'verifica scaduta');
  assert(!r.doc.querySelector('[data-testid=adp-send]'), 'serve una nuova verifica'); assert.equal(adp.soap.count('Send'), 0); assert(!r.log.calls.some(x => x.a === 'al_send'), 'il server non è stato nemmeno interpellato');
});

test('U25 Adempimenti: cambiando sezione con la finestra di modifica aperta la finestra si chiude e l\'elenco resta', async () => {
  const r = await openAdp(); pickFile(r, FX('famiglia.txt')); await waitFor(() => r.doc.querySelector('[data-testid=adp-ready]'), 'pronto');
  r.doc.querySelector('[data-testid=adp-edit-0]').click(); await waitFor(() => r.doc.querySelector('[data-testid=adp-modal]'), 'finestra aperta');
  r.w.location.hash = '#prenotazioni'; await waitFor(() => !r.doc.querySelector('[data-testid=adp-modal]'), 'finestra chiusa'); assert(!r.doc.body.classList.contains('adp-noscroll'), 'scorrimento della pagina ripristinato');
  r.w.location.hash = '#adempimenti'; await waitFor(() => r.doc.querySelectorAll('[data-testid^=adp-row-]').length === 4, 'elenco ancora presente'); assert(r.doc.body.classList.contains('adp-active'));
});

/* ===================== esecuzione ===================== */
(async () => {
  const only = process.argv[2]; let pass = 0, fail = 0; const t0 = process.hrtime.bigint();
  for (const [name, fn] of tests) {
    if (only && !name.startsWith(only)) continue;
    pageErrors.length = 0;
    try { await fn(); await sleep(40); if (pageErrors.length) throw pageError(); pass++; console.log('  ✔ ' + name); }
    catch (e) { fail++; console.log('  ✘ ' + name + '\n      → ' + String(e && e.stack || e).split('\n').slice(0, only ? 14 : 4).join('\n        ')); }
  }
  console.log('\n' + pass + ' ok, ' + fail + ' falliti  (' + (Number(process.hrtime.bigint() - t0) / 1e9).toFixed(1) + ' s)');
  process.exit(fail ? 1 : 0);
})();
