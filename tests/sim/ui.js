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

// fetch() del browser → handler di Vercel (stesse regole: metodo, query, intestazioni, corpo JSON)
function bridge(w, log) {
  const resp = (status, text) => ({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(text), text: async () => text });
  return async (url, init = {}) => {
    const u = new URL(String(url), w.location.href), a = u.searchParams.get('a');
    if (u.pathname.endsWith('/data/default.json')) return resp(200, fs.readFileSync(path.join(ROOT, 'data', 'default.json'), 'utf8'));
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
const loadAdmin = async (hash = '', extra = {}) => { const r = await load('admin.html', Object.assign({ hash, token: await adminToken(), scripts: ['js/site.js', 'js/admin.js'] }, extra)); await waitFor(() => r.doc.querySelector('#adm-body .admin-card'), 'pannello admin'); return r; };
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
