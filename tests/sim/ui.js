// La Columbera · prova del front-end (js/pages.js, js/admin.js) in un browser simulato.
// Carica le pagine VERE (torre.html, admin.html), esegue gli script VERI e collega fetch() allo stesso handler,
// allo stesso Redis finto e allo stesso orologio del banco di prova: si vede cosa vedrebbero ospite e titolare.
//
//   npm i jsdom --prefix /tmp/jsd && JSDOM_PATH=/tmp/jsd/node_modules/jsdom node tests/sim/ui.js [filtro]
//
// Senza jsdom il file esce senza errori (le prove UI vengono saltate).
const path = require('path'), fs = require('fs'), assert = require('assert');
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require(process.env.JSDOM_PATH || 'jsdom')); }
catch (e) { console.log('jsdom non disponibile (npm i jsdom, oppure JSDOM_PATH=…): prove UI saltate'); process.exit(0); }
const H = require('./harness'), { kv, clock, MIN } = H;
const ROOT = path.join(__dirname, '..', '..');
const tick = (min = 11) => clock.advance(min * MIN);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T = '"La Columbera - Torre, Appartamento con 2 camere da letto"', C = '"La Columbera - Corte, Appartamento con 1 camere da letto"', HDR = ['Numero Prenotazione', 'Data Check-in', 'Appartamento', 'Numero Ospiti', 'Numero Notti'];

async function setup(envExtra) {
  const env = await H.newEnv({ env: envExtra, legacyRows: [HDR, ['HMSEDESZCW', H.romeMidnight(2026, 10, 5), C, 2, 6], [6877180932, '02/10/2026', T, 4, 2]] });
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
// ISTAT: stessa funzione di Vercel (api/istat.js) con servizio ISTAT simulato (tests/sim/istat-mock.js, segue il protocollo del PDF) e archivio proprio (serve INCRBY/EXPIRE).
let ist = null;
function makeIstKv() {
  const d = new Map(), live = k => { const e = d.get(k); if (!e) return null; if (e.exp && e.exp <= clock.now()) { d.delete(k); return null; } return e; };
  const kvf = async (...c) => {
    const [op, k, v, ...o] = c, O = String(op).toUpperCase();
    if (O === 'GET') { const e = live(k); return e ? e.v : null; }
    if (O === 'SET') { let nx = false, ex = 0; for (let i = 0; i < o.length; i++) { const u = String(o[i]).toUpperCase(); if (u === 'NX') nx = true; else if (u === 'EX') ex = +o[++i]; } if (nx && live(k)) return null; d.set(k, { v: String(v), exp: ex ? clock.now() + ex * 1000 : 0 }); return 'OK'; }
    if (O === 'DEL') return d.delete(k) ? 1 : 0;
    if (O === 'INCRBY') { const e = live(k), n = (e ? parseInt(e.v, 10) : 0) + parseInt(v, 10); d.set(k, { v: String(n), exp: e ? e.exp : 0 }); return n; }
    if (O === 'EXPIRE') { const e = live(k); if (!e) return 0; e.exp = clock.now() + parseInt(v, 10) * 1000; return 1; }
    throw new Error('KV non simulato: ' + op);
  };
  kvf.d = d; return kvf;
}
function makeIst(o) {
  o = o || {};
  const IST = require('../../api/istat.js'), { makeIstatMock } = require('./istat-mock.js'), svc = makeIstatMock(Object.assign({ now: () => clock.now() }, o.svcOpts)), k = makeIstKv();
  const env = Object.assign({ ISTAT_CIPAT: '022001-AT-012345', ISTAT_WS_USER: 'ws-user', ISTAT_WS_PASSWORD: 'ws-pass', ISTAT_SEND_ENABLED: 'true', VERCEL_ENV: 'production', SESSION_SECRET: 'sess' }, o.env);      // stesso segreto di sessione del login (la conferma è firmata con quel segreto)
  const handler = IST.make({ env, kv: k, auth: H.V().handler.auth, fetch: (...a) => svc.fetch(...a), now: () => clock.now() });
  return { svc, handler, kv: k, forceSend: null };
}
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
    if (u.pathname.endsWith('/api/istat') && a && ist) {
      const headers = {}; for (const [k, v] of Object.entries(init.headers || {})) headers[k.toLowerCase()] = v;
      if (a === 'is_send' && ist.forceSend) { if (ist.forceSend.throw) throw new TypeError('Failed to fetch'); log.calls.push({ a, status: ist.forceSend.status, q: {} }); return resp(ist.forceSend.status, ist.forceSend.text); }
      const out = await callAdp(ist.handler, a, init.body ? JSON.parse(init.body) : {}, headers);
      log.calls.push({ a, status: out.status, q: {} }); return resp(out.status, out.text || '');
    }
    if (!u.pathname.endsWith('/api/x') || !a) return resp(404, '{}');
    const q = Object.fromEntries(u.searchParams.entries()); delete q.a;
    const headers = {}; for (const [k, v] of Object.entries(init.headers || {})) headers[k.toLowerCase()] = v;
    const out = await H.api(a, init.body ? JSON.parse(init.body) : {}, { method: init.method || 'GET', query: q, headers });
    log.calls.push({ a, status: out.status, q }); return resp(out.status, out.text || '');
  };
}
async function load(file, { search = '', hash = '', token = '', session = {}, scripts, confirmAnswer = false, lang = 'it-IT' } = {}) {
  const log = { calls: [], alerts: [], confirms: [], confirmAnswer };
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');      // gli script si eseguono a mano, nell'ordine voluto
  // Gli errori di jsdom restano visibili, tranne il cambio di pagina (location.href = pagina di pagamento Stripe): jsdom non naviga e lo segnala, ma è il comportamento giusto della pagina.
  const vc = new VirtualConsole(); for (const k of ['log', 'info', 'warn', 'error', 'debug']) vc.on(k, (...a) => console[k](...a)); vc.on('jsdomError', e => { if (!/Not implemented: navigation/.test(e.message)) console.error(e.stack || e.message); });      // senza sendTo/forwardTo: il nome cambia da una versione di jsdom all'altra
  const dom = new JSDOM(html, { url: 'https://www.lacolumbera.test/' + file + search + hash, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.__now = () => clock.now();
  w.eval('(function(){const R=Date;class F extends R{constructor(...a){a.length?super(...a):super(window.__now())} static now(){return window.__now()}};window.Date=F})()');      // stessa data simulata del server
  w.fetch = bridge(w, log); w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = function () {}; w.structuredClone = x => JSON.parse(JSON.stringify(x));      // API dei browser veri che jsdom non ha
  w.alert = m => { log.alerts.push(String(m)); }; w.confirm = m => { log.confirms.push(String(m)); return log.confirmAnswer; };
  Object.defineProperty(w.navigator, 'language', { value: lang, configurable: true }); Object.defineProperty(w.navigator, 'languages', { value: [lang, lang.slice(0, 2)], configurable: true });      // il browser simulato parla italiano, come il sito (salvo prove sulle altre lingue)
  if (token) w.sessionStorage.setItem('lc_t', token);
  for (const [k, v] of Object.entries(session)) w.sessionStorage.setItem(k, v);      // stato della scheda (es. token del checkout salvato prima di andare su Stripe)
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
const loadAdmin = async (hash = '', extra = {}) => { const r = await load('admin.html', Object.assign({ hash, token: await adminToken(), scripts: ['js/site.js', 'js/adempimenti.js', 'js/istat.js', 'js/admin-messaggi.js', 'js/admin.js'] }, extra)); await waitFor(() => r.doc.querySelector('#adm-body .admin-card'), 'pannello admin'); return r; };
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
  const co = (await checkout({ da: '2026-12-10', a: '2026-12-12' })).body, c = co.code;
  assert(kv.exec(['HGETALL', 'holds:torre']).length > 0, 'prima: notti trattenute');
  // la stessa scheda che ha avviato il pagamento ha il token del checkout in sessionStorage
  const { log, doc } = await load('torre.html', { search: '?pagamento=annullato&code=' + c, session: { lc_acc: JSON.stringify({ c, t: co.t }) }, scripts: ['js/site.js', 'js/pages.js'] });
  await waitFor(() => log.calls.some(x => x.a === 'checkout_cancel'), 'checkout_cancel');
  await waitFor(() => kv.exec(['HGETALL', 'holds:torre']).length === 0, 'hold liberati');
  await waitFor(() => /Pagamento annullato/.test(text(doc.querySelector('#e'))), 'messaggio');
});

test('U4e ritorno dal pagamento: la pagina chiede lo stato al server e dice la verità (webhook perso → il server controlla Stripe e conferma)', async () => {
  await setup();
  const co = (await checkout({ da: '2026-12-10', a: '2026-12-12' })).body, c = co.code, sess = JSON.parse(kv.exec(['HGET', 'bkh', c])).sessione;
  global.__stripeState[sess] = { paid: true };                                                  // ha pagato su Stripe ma il webhook non è mai arrivato
  assert.equal(stato(c), 'in_attesa');
  const { doc, log, w } = await load('torre.html', { search: '?pagamento=successo&code=' + c, session: { lc_acc: JSON.stringify({ c, t: co.t }) }, scripts: ['js/site.js', 'js/pages.js'] });
  await waitFor(() => doc.querySelector('[data-testid=booking-success][data-stato=confermata]'), 'conferma mostrata');
  const t = text(doc.querySelector('[data-testid=booking-success]'));
  assert(/Prenotazione confermata/.test(t) && t.replace(/ /g, '').includes(c) && /ma\*\*\*@test\.it/.test(t) && /spam/.test(t), t);
  assert(t.includes(c.slice(0, 4) + ' ' + c.slice(4, 8) + ' ' + c.slice(8)), 'codice a gruppi, leggibile');
  assert(!/mario@test\.it/.test(t), 'l\'email intera non compare nella pagina');
  assert.equal(stato(c), 'confermata'); assert(global.__mails.some(m => m.to === 'owner@test') && global.__mails.some(m => m.to === 'mario@test.it'), 'email partite');
  assert(log.calls.some(x => x.a === 'checkout_status' && x.status === 200)); assert.equal(w.location.search, '', 'indirizzo ripulito');
});
test('U4f ritorno dal pagamento: da un altro browser (senza token) o con il server giù non si promette nulla di falso, ma si dice cosa fare', async () => {
  await setup();
  const co = (await checkout({ da: '2026-12-10', a: '2026-12-12' })).body, c = co.code;
  const a = await load('torre.html', { search: '?pagamento=successo&code=' + c, scripts: ['js/site.js', 'js/pages.js'] });      // nessun token nella scheda
  await waitFor(() => a.doc.querySelector('[data-testid=booking-success]'), 'messaggio');
  const t = text(a.doc.querySelector('[data-testid=booking-success]'));
  assert(/stiamo registrando/.test(t) && t.replace(/ /g, '').includes(c) && /lacolumbera@gmail\.com/.test(t) && !/confermata 🎉/.test(t), t);
  assert(!a.log.calls.some(x => x.a === 'checkout_status'), 'senza token non si chiede nulla');
  global.__stripeRetrieveFail = true; global.__stripeState[JSON.parse(kv.exec(['HGET', 'bkh', c])).sessione] = { paid: true };
  const b = await load('torre.html', { search: '?pagamento=successo&code=' + c, session: { lc_acc: JSON.stringify({ c, t: co.t }) }, scripts: ['js/site.js', 'js/pages.js'] });
  await waitFor(() => b.log.calls.filter(x => x.a === 'checkout_status').length >= 2, 'secondo tentativo', 400);
  assert(/stiamo registrando/.test(text(b.doc.querySelector('[data-testid=booking-success]'))), 'finché non è sicuro, nessuna conferma finta');
  assert.equal(stato(c), 'in_attesa'); assert.equal(global.__mails.length, 0);
});
test('U4g ritorno dal pagamento: il webhook arriva mentre la pagina controlla → compare la conferma; se le date sono andate perse: "stiamo verificando"', async () => {
  await setup();
  const co = (await checkout({ da: '2026-12-10', a: '2026-12-12' })).body, c = co.code;
  const { doc } = await load('torre.html', { search: '?pagamento=successo&code=' + c, session: { lc_acc: JSON.stringify({ c, t: co.t }) }, scripts: ['js/site.js', 'js/pages.js'] });
  await waitFor(() => /stiamo registrando/.test(text(doc.querySelector('[data-testid=booking-success]'))), 'prima: in registrazione');
  await H.webhook('checkout.session.completed', H.paidSession(c));
  await waitFor(() => doc.querySelector('[data-testid=booking-success][data-stato=confermata]'), 'dopo il webhook: confermata', 400);
  // pagamento tardivo con date perse
  const x1 = (await checkout({ da: '2026-12-20', a: '2026-12-22' })).body; tick(40);
  const x2 = (await checkout({ da: '2026-12-20', a: '2026-12-22', email: 'altro@t.it' })).body; await H.webhook('checkout.session.completed', H.paidSession(x2.code));
  await H.webhook('checkout.session.completed', H.paidSession(x1.code)); assert.equal(stato(x1.code), 'da_verificare');
  const d = await load('torre.html', { search: '?pagamento=successo&code=' + x1.code, session: { lc_acc: JSON.stringify({ c: x1.code, t: x1.t }) }, scripts: ['js/site.js', 'js/pages.js'] });
  await waitFor(() => d.doc.querySelector('[data-testid=booking-success][data-stato=da_verificare]'), 'in verifica');
  const t = text(d.doc.querySelector('[data-testid=booking-success]')); assert(/Stiamo verificando/.test(t) && /lacolumbera@gmail\.com/.test(t) && !/confermata 🎉/.test(t), t);
});

test('U4b area clienti dal link della mail (#c=…&t=…): entra subito, il token sparisce dall\'indirizzo e passa alla Guest Card', async () => {
  await setup();
  const c = (await checkout({ da: '2026-12-10', a: '2026-12-12' })).body;
  await H.webhook('checkout.session.completed', H.paidSession(c.code));
  const m = /area-clienti\.html(#c=[A-Z0-9]+&t=[A-Za-z0-9_-]+)/.exec(global.__mails.find(x => x.to === 'mario@test.it').text);
  assert(m, 'link con token nella mail');
  const r = await load('area-clienti.html', { hash: m[1], scripts: ['js/site.js', 'js/pages.js', 'js/area.js'] });
  await waitFor(() => r.doc.querySelector('[data-testid=mie-card-' + c.code + ']'), 'prenotazione mostrata');
  assert.equal(r.w.location.hash, '', 'il token non resta nella barra degli indirizzi');
  assert(JSON.parse(r.w.sessionStorage.getItem('lc_acc')).t, 'token solo in sessionStorage');
  assert(r.log.calls.some(x => x.a === 'mie' && x.status === 200));
  const href = r.doc.querySelector('[data-testid=gc-link-' + c.code + ']').getAttribute('href');
  assert.equal(href, 'guest-card.html', 'nessun codice nell\'URL della Guest Card');
  const g = await load('guest-card.html', { session: { lc_acc: r.w.sessionStorage.getItem('lc_acc') }, scripts: ['js/site.js', 'js/pages.js'] });
  await waitFor(() => g.doc.querySelector('[data-testid=gc-confirm]'), 'Guest Card: prenotazione riconosciuta senza ridigitare nulla');
});
test('U4c area clienti senza link: basta il codice (anche minuscolo e a gruppi); codice sbagliato = messaggio chiaro; ?code= precompila soltanto; #k= entra e sparisce', async () => {
  await setup();
  const c = (await checkout({ da: '2026-12-10', a: '2026-12-12' })).body;
  await H.webhook('checkout.session.completed', H.paidSession(c.code));
  const r = await load('area-clienti.html', { search: '?code=' + c.code, scripts: ['js/site.js', 'js/pages.js', 'js/area.js'] });
  await sleep(60);
  assert.equal(r.doc.querySelector('#cd').value, c.code, 'codice precompilato'); assert.equal(r.w.location.search, '', 'codice tolto dall\'indirizzo');
  assert(!r.log.calls.some(x => x.a === 'mie'), 'dal link con ?code= non parte nessuna richiesta da sola');
  assert(!r.doc.querySelector('#cda') && !r.doc.querySelector('#cem') && !r.doc.querySelector('input[type=date]') && !r.doc.querySelector('input[type=email]'), 'nessuna data né email da inserire');
  r.doc.querySelector('#cd').value = c.code.slice(0, 12) + 'Z';
  r.doc.querySelector('#f').dispatchEvent(new r.w.Event('submit', { cancelable: true }));
  await waitFor(() => /Prenotazione non trovata/.test(text(r.doc.querySelector('#r'))), 'errore con il codice sbagliato');
  r.doc.querySelector('#cd').value = (c.code.slice(0, 4) + ' ' + c.code.slice(4, 8) + ' ' + c.code.slice(8)).toLowerCase();
  r.doc.querySelector('#f').dispatchEvent(new r.w.Event('submit', { cancelable: true }));
  await waitFor(() => r.doc.querySelector('[data-testid=mie-card-' + c.code + ']'), 'prenotazione mostrata');
  const acc = JSON.parse(r.w.sessionStorage.getItem('lc_acc'));
  assert(acc.t && acc.c === c.code, 'token di sessione salvato per il codice registrato (non per come è stato scritto)');
  // messaggio di benvenuto (Booking/Airbnb, WhatsApp): area-clienti.html#k=CODICE apre subito l'area e il codice sparisce dall'indirizzo
  const k = await load('area-clienti.html', { hash: '#k=' + c.code.toLowerCase(), scripts: ['js/site.js', 'js/pages.js', 'js/area.js'] });
  await waitFor(() => k.doc.querySelector('[data-testid=mie-card-' + c.code + ']'), 'entra con #k=');
  assert.equal(k.w.location.hash, '', 'il codice non resta nella barra degli indirizzi');
  // sessione scaduta nella stessa scheda: si rientra con il solo codice, senza errori
  const old = await load('area-clienti.html', { session: { lc_acc: JSON.stringify({ c: c.code, t: 'x'.repeat(22) }) }, scripts: ['js/site.js', 'js/pages.js', 'js/area.js'] });
  await waitFor(() => old.doc.querySelector('[data-testid=mie-card-' + c.code + ']'), 'rientra con il codice');
  assert.notEqual(JSON.parse(old.w.sessionStorage.getItem('lc_acc')).t, 'x'.repeat(22), 'token nuovo');
});
test('U4d Guest Card per una prenotazione Airbnb del foglio: basta il codice, poi email per la card', async () => {
  await setup();
  const snap = JSON.parse(kv.exec(['GET', 'reg:snap']) || '{"rows":[]}');
  if (!(snap.rows || []).some(x => x.codice === 'HMSEDESZCW')) {      // lo stub dello script non popola il registro: si scrive la stessa istantanea
    snap.rows = [{ id: 'AIRBNB|HMSEDESZCW', fonte: 'AIRBNB', codice: 'HMSEDESZCW', apt: 'corte', checkin: '2026-10-05', checkout: '2026-10-11', notti: 6, ospiti: 2, stato: 'CONFERMATA', uid: '', motivo: '', creata: '', aggiornata: '', ultimoSeen: '', annullata: '', note: '', flags: [] }];
    kv.exec(['SET', 'reg:snap', JSON.stringify(Object.assign({ invalid: [], count: 1, lastAttempt: clock.iso(), lastSuccess: clock.iso(), status: 'OK' }, snap))]);
  }
  const g = await load('guest-card.html', { scripts: ['js/site.js', 'js/pages.js'] });
  await waitFor(() => g.log.calls.some(x => x.a === 'cfg'), 'pagina pronta'); await sleep(40);
  assert(!g.doc.querySelector('#gc-da') && !g.doc.querySelector('#gc-em'), 'nessuna data né email per riconoscere la prenotazione');
  g.doc.querySelector('#gc-code').value = 'hmsedeszcw';
  g.doc.querySelector('#f').dispatchEvent(new g.w.Event('submit', { cancelable: true }));
  await waitFor(() => g.doc.querySelector('[data-testid=gc-confirm]') || (g.log.calls.find(x => x.a === 'gc_check') && text(g.doc.querySelector('#e'))), 'risposta');
  assert(g.doc.querySelector('[data-testid=gc-confirm]'), 'prenotazione riconosciuta: ' + text(g.doc.querySelector('#e')) + ' ' + JSON.stringify(g.log.calls));
  assert(g.doc.querySelector('[data-testid=gc-email]'), 'chiede l\'email per la card (la prenotazione del foglio non ne ha)');
  assert.equal(JSON.parse(g.w.sessionStorage.getItem('lc_acc')).c, 'HMSEDESZCW', 'sessione per il codice registrato');
});

/* ===================== area ospiti (js/area.js) ===================== */
const AREA = ['js/site.js', 'js/pages.js', 'js/area.js'];
const regAirbnb = () => {      // lo stub dello script non popola il registro: si scrive la stessa istantanea che produrrebbe la sincronizzazione
  const snap = JSON.parse(kv.exec(['GET', 'reg:snap']) || '{"rows":[]}');
  if (!(snap.rows || []).some(x => x.codice === 'HMSEDESZCW')) {
    snap.rows = [{ id: 'AIRBNB|HMSEDESZCW', fonte: 'AIRBNB', codice: 'HMSEDESZCW', apt: 'corte', checkin: '2026-10-05', checkout: '2026-10-11', notti: 6, ospiti: 2, stato: 'CONFERMATA', uid: '', motivo: '', creata: '', aggiornata: '', ultimoSeen: '', annullata: '', note: '', flags: [] }];
    kv.exec(['SET', 'reg:snap', JSON.stringify(Object.assign({ invalid: [], count: 1, lastAttempt: clock.iso(), lastSuccess: clock.iso(), status: 'OK' }, snap))]);
  }
};
const saveArea = async () => {      // testi per gli ospiti di Torre e Corte, check-out alle 10, informazioni riservate da 2 giorni prima
  const c = (await H.adminApi('cfg_admin', {})).body;
  for (const p of c.apts) { p.infoOspiti = '## Regole della casa\n- Niente feste <b>dopo</b> le 22\n\n## Raccolta differenziata\nCarta il martedì.'; p.infoRiservate = 'Rete: Columbera-' + p.id + '\nPassword: segreta-' + p.id; }
  Object.assign(c, { checkoutOra: '10:00', infoGiorni: 2, whatsapp: '+39 351 704 3594' });
  assert.equal((await H.adminApi('save', c)).status, 200);
};
const tabOf = (r, k) => { r.doc.querySelector('[data-testid=ga-tab-' + k + ']').click(); return r.doc.querySelector('#ga-p-' + k); };
test('U4h area ospiti: riepilogo con orari, azioni, pagamento con il conto, informazioni (riservate solo vicino all\'arrivo), eventi nelle date, calendario', async () => {
  await setup(); await saveArea();
  assert.equal((await H.adminApi('event_add', { title: 'Mercatino <i>di</i> Natale', date: '2026-12-11', time: '10:00', location: 'Trento' })).status, 200);
  assert.equal((await H.adminApi('event_add', { title: 'Fuori dalle date', date: '2026-12-20', location: 'Trento' })).status, 200);
  const c = (await checkout({ da: '2026-12-10', a: '2026-12-13' })).body;
  await H.webhook('checkout.session.completed', H.paidSession(c.code));
  const r = await load('area-clienti.html', { hash: '#k=' + c.code, scripts: AREA });
  const app = await waitFor(() => r.doc.querySelector('[data-testid=guest-app]'), 'area ospiti');
  assert(r.doc.querySelector('#login').hidden, 'il modulo di accesso sparisce');
  assert(/Arrivi tra 69 giorni/.test(text(r.doc.querySelector('[data-testid=ga-count]'))), text(r.doc.querySelector('[data-testid=ga-count]')));
  const card = text(r.doc.querySelector('[data-testid=mie-card-' + c.code + ']'));
  assert(card.includes(c.code.slice(0, 4) + ' ' + c.code.slice(4, 8)) && /dalle 16:00/.test(card) && /entro le 10:00/.test(card) && /Torre/.test(card), card);
  assert.equal(r.doc.querySelector('[data-testid=gc-link-' + c.code + ']').getAttribute('href'), 'guest-card.html');
  assert(r.doc.querySelector('[data-testid=checkin-link-' + c.code + ']') && r.doc.querySelector('[data-testid=ga-route]') && r.doc.querySelector('[data-testid=ga-wa]').href.endsWith('wa.me/393517043594'), 'azioni');
  const pay = text(r.doc.querySelector('[data-testid=ga-pay]'));
  assert(/3 notti × €\s?180/.test(pay) && /€\s?540/.test(text(r.doc.querySelector('[data-testid=ga-pay-total]'))) && /Pagato online con carta il ven 2 ott 2026/.test(pay) && /imposta di soggiorno/i.test(pay), pay);
  assert(!/Mario|Rossi|mario@test\.it/.test(text(app)), 'nessun dato personale nella pagina');
  const mie = r.log.calls.find(x => x.a === 'mie' && x.status === 200); assert(mie, 'risposta del server');
  const info = tabOf(r, 'info'), it = text(info);
  assert(/Regole della casa/.test(it) && /Niente feste <b>dopo<\/b> le 22/.test(it) && !info.querySelector('b b, li b'), 'testi della struttura come testo, mai HTML: ' + it);
  assert(/Carta il martedì/.test(it) && /Via Val Gola 22/.test(it) && /check-in online/.test(it), it);
  assert(!/segreta-torre/.test(it) && /dal mar 8 dic 2026/.test(text(r.doc.querySelector('[data-testid=ga-riservate-dal]'))), 'Wi-Fi non ancora visibile: ' + it);
  const dint = tabOf(r, 'dintorni');
  await waitFor(() => r.doc.querySelector('[data-testid="ga-ev-2026-12-11"]'), 'evento nelle date');
  assert(!r.doc.querySelector('[data-testid="ga-ev-2026-12-20"]') && !dint.querySelector('#ga-ev i'), 'solo gli eventi del soggiorno, titoli come testo');
  const ics = r.w.LCArea.ics(JSON.parse(JSON.stringify({ code: c.code, da: '2026-12-10', a: '2026-12-13', apt: { nome: 'La Columbera Torre' }, orari: { checkin: '16:00', checkout: '10:00' } })));
  assert(/DTSTART;TZID=Europe\/Rome:20261210T160000/.test(ics) && /DTEND;TZID=Europe\/Rome:20261213T100000/.test(ics) && /BEGIN:VTIMEZONE/.test(ics) && !ics.includes(c.code), 'calendario: ' + ics);
  // tre giorni prima dell'arrivo compare il Wi-Fi; dopo la partenza "grazie"
  clock.set('2026-12-08T09:00:00Z'); await H.sync();
  const r2 = await load('area-clienti.html', { hash: '#k=' + c.code, scripts: AREA });
  await waitFor(() => r2.doc.querySelector('[data-testid=guest-app]'), 'area ospiti');
  assert(/Arrivi tra 2 giorni/.test(text(r2.doc.querySelector('[data-testid=ga-count]'))));
  assert(/Password: segreta-torre/.test(text(tabOf(r2, 'info').querySelector('[data-testid=ga-riservate]'))), 'Wi-Fi visibile 2 giorni prima');
  clock.set('2026-12-14T09:00:00Z'); await H.sync();
  const r3 = await load('area-clienti.html', { hash: '#k=' + c.code, scripts: AREA });
  await waitFor(() => r3.doc.querySelector('[data-testid=guest-app]'), 'area ospiti');
  assert(/Grazie per aver soggiornato/.test(text(r3.doc.querySelector('[data-testid=ga-count]'))) && !/segreta/.test(text(r3.doc.querySelector('#ga-p-info'))), 'dopo la partenza niente Wi-Fi');
});
test('U4i area ospiti: lingua del browser (inglese, tedesco) e scelta manuale; Booking/Airbnb senza conto (pagamento sulla piattaforma); uscita', async () => {
  await setup(); await saveArea();
  clock.set('2026-10-04T09:00:00Z'); await H.sync(); regAirbnb();
  const r = await load('area-clienti.html', { lang: 'de-DE', scripts: AREA });
  await waitFor(() => /Ihre Buchung/.test(text(r.doc.querySelector('h1'))), 'pagina in tedesco');
  assert.equal(r.doc.documentElement.lang, 'de'); assert(/Buchungscode/.test(text(r.doc.querySelector('label[for=cd]'))));
  r.doc.querySelector('#cd').value = 'NONESISTE1'; r.doc.querySelector('#f').dispatchEvent(new r.w.Event('submit', { cancelable: true }));
  await waitFor(() => /Buchung nicht gefunden/.test(text(r.doc.querySelector('#r'))), 'errore in tedesco');
  r.doc.querySelector('[data-testid=ga-lang-en]').click();
  assert(/Your booking/.test(text(r.doc.querySelector('h1'))) && r.w.sessionStorage.getItem('lc_lang') === 'en', 'scelta manuale');
  r.doc.querySelector('#cd').value = 'hmsedeszcw'; r.doc.querySelector('#f').dispatchEvent(new r.w.Event('submit', { cancelable: true }));
  await waitFor(() => r.doc.querySelector('[data-testid=guest-app]'), 'area ospiti (Airbnb)');
  assert(/You arrive tomorrow/.test(text(r.doc.querySelector('[data-testid=ga-count]'))), text(r.doc.querySelector('[data-testid=ga-count]')));
  assert(/You booked through Airbnb/.test(text(r.doc.querySelector('[data-testid=ga-pay]'))) && !r.doc.querySelector('[data-testid=ga-pay-total]'), 'pagamento sulla piattaforma');
  assert(/Password: segreta-corte/.test(text(tabOf(r, 'info'))), 'il giorno prima dell\'arrivo il Wi-Fi c\'è');
  assert(/Written in Italian/.test(text(r.doc.querySelector('#ga-p-info'))), 'i testi della struttura sono in italiano: lo dice');
  r.doc.querySelector('[data-testid=ga-lang-it]').click();
  assert(/Arrivi domani/.test(text(r.doc.querySelector('[data-testid=ga-count]'))), 'cambio lingua dentro l\'area');
  r.doc.querySelector('[data-testid=ga-logout]').click();
  assert(!r.doc.querySelector('#login').hidden && !r.doc.querySelector('[data-testid=guest-app]') && !r.w.sessionStorage.getItem('lc_acc'), 'uscita: sessione cancellata');
});

test('U4j area ospiti · Messaggi: si scrive e si legge (testo, mai HTML), la risposta arriva tradotta con l\'originale; Booking/Airbnb senza scheda Messaggi', async () => {
  await setup({ DEEPL_API_KEY: 'chiave-prova' });
  const c = (await checkout({ da: '2026-12-10', a: '2026-12-13' })).body; await H.webhook('checkout.session.completed', H.paidSession(c.code));
  const r = await load('area-clienti.html', { hash: '#k=' + c.code, lang: 'en-GB', scripts: AREA });
  await waitFor(() => r.doc.querySelector('[data-testid=guest-app]'), 'area ospiti');
  const panel = tabOf(r, 'messaggi');
  await waitFor(() => r.doc.querySelector('[data-testid=ga-chat-vuota]'), 'nessun messaggio');
  r.doc.querySelector('[data-testid=ga-testo]').value = 'Hi! <img src=x onerror="window.__x=1"> Can we check in at 6pm?';
  r.doc.querySelector('#ga-send').requestSubmit();
  await waitFor(() => panel.querySelector('.ga-msg.me'), 'messaggio inviato');
  assert(!panel.querySelector('.ga-bubble img') && /<img src=x/.test(text(panel.querySelector('.ga-msg.me'))) && !r.w.__x, 'il testo resta testo');
  assert.equal(r.doc.querySelector('[data-testid=ga-testo]').value, '', 'campo svuotato');
  const th = (await H.adminApi('msg_thread', { code: c.code })).body;
  assert.equal(th.messaggi[0].tradotto, '[IT] Hi! <img src=x onerror="window.__x=1"> Can we check in at 6pm?', 'il titolare legge in italiano');
  await H.adminApi('msg_reply', { code: c.code, testo: 'Certo, alle 18 va benissimo: https://www.lacolumbera.test/mappa.html' });
  tabOf(r, 'soggiorno'); tabOf(r, 'messaggi');
  const them = await waitFor(() => panel.querySelector('.ga-msg.them'), 'risposta del titolare');
  assert(/\[EN\] Certo, alle 18 va benissimo/.test(text(them)) && them.querySelector('.ga-bubble a[href="https://www.lacolumbera.test/mappa.html"][rel~=noopener]'), 'tradotta, link cliccabile: ' + them.innerHTML);
  const ob = them.querySelector('[data-orig]'); assert(/Show original/.test(text(ob)));
  const orig = r.doc.querySelector('#ga-o-' + ob.dataset.orig); assert(orig.hidden); ob.click(); assert(!orig.hidden && /^Certo, alle 18/.test(text(orig)), 'mostra l\'originale');
  // Airbnb: niente chat nel sito (scrive sulla piattaforma)
  regAirbnb();
  const a = await load('area-clienti.html', { hash: '#k=HMSEDESZCW', scripts: AREA });
  await waitFor(() => a.doc.querySelector('[data-testid=guest-app]'), 'area ospiti Airbnb');
  assert(!a.doc.querySelector('[data-testid=ga-tab-messaggi]'), 'nessuna scheda Messaggi per Airbnb');
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
test('U5b admin · Pagamenti ed email: semaforo (webhook, email, foglio), email di prova, prenotazioni rimaste a metà', async () => {
  await setup();
  const r = await loadAdmin('#sync'), card = () => text(r.doc.querySelector('[data-testid=admin-pay]')), summary = () => text(r.doc.querySelector('[data-testid=admin-pay-summary]'));
  await waitFor(() => r.doc.querySelector('[data-testid=admin-pay-rows]'), 'scheda pagamenti');
  assert(/Su Stripe non risulta nessun webhook/.test(card()) && /da sistemare/.test(summary()), 'senza webhook registrato: ' + card());
  global.__stripeWebhooks = [{ url: 'https://www.lacolumbera.test/api/stripe-webhook', status: 'enabled', enabled_events: ['checkout.session.completed', 'checkout.session.expired'] }];
  r.doc.querySelector('[data-testid=admin-pay-check]').click();
  await waitFor(() => /Tutto a posto/.test(summary()), 'tutto a posto');
  assert(r.doc.querySelector('[data-testid=admin-pay-summary]').classList.contains('adm-ok'));
  assert(!/sk_test|whsec_|sync-test-secret|sheet-test-secret|info@test/.test(card()), 'nessun segreto in pagina'); assert(/ow\*\*\*@test/.test(card()), 'destinatario mascherato');
  r.doc.querySelector('[data-testid=admin-pay-mail]').click();
  await waitFor(() => /Email di prova inviata a ow\*\*\*@test/.test(text(r.doc.querySelector('[data-testid=admin-pay-msg]'))), 'esito email di prova');
  assert.equal(global.__mails.length, 1); assert.equal(global.__mails[0].to, 'owner@test');
  // prenotazione pagata ma con l'email non partita → compare tra le prenotazioni a metà
  const c = (await checkout({ da: '2026-12-10', a: '2026-12-12' })).body; global.__mailFail = true;
  assert.equal((await H.webhook('checkout.session.completed', H.paidSession(c.code))).status, 500); global.__mailFail = false;
  r.doc.querySelector('[data-testid=admin-pay-check]').click();
  await waitFor(() => /Prenotazioni a metà/.test(card()), 'prenotazione a metà');
  assert(card().includes(c.code) && /email a te/.test(card()) && /email all'ospite/.test(card()) && /da sistemare/.test(summary()), card());
});
test('U5c admin · email non configurata: lo dice chiaramente, anche con l\'email di prova', async () => {
  await setup({ GMAIL_USER: '', GMAIL_APP_PASSWORD: '' });
  const r = await loadAdmin('#sync'), card = () => text(r.doc.querySelector('[data-testid=admin-pay]'));
  await waitFor(() => r.doc.querySelector('[data-testid=admin-pay-rows]'), 'scheda pagamenti');
  assert(/NON configurata/.test(card()) && /GMAIL_USER/.test(card()), card());
  r.doc.querySelector('[data-testid=admin-pay-mail]').click();
  await waitFor(() => /Email non configurata/.test(text(r.doc.querySelector('[data-testid=admin-pay-msg]'))), 'esito'); assert.equal(global.__mails.length, 0);
});
test('U5d admin · Calendari iCal: il link per Booking e Airbnb è quello «solo sito»; il calendario personale è separato e chiede la chiave', async () => {
  await setup();
  const r = await loadAdmin('#torre/calendari'); await waitFor(() => r.doc.querySelector('[data-testid=admin-ical-export-site-torre]'), 'link per Booking e Airbnb');
  assert.equal(r.doc.querySelector('[data-testid=admin-ical-export-site-torre]').value, 'https://www.lacolumbera.test/api/x?a=ical&id=torre&for=site');
  assert(!r.doc.querySelector('[data-testid=admin-ical-export-booking-torre]') && !r.doc.querySelector('[data-testid=admin-ical-export-airbnb-torre]'), 'niente link separati per piattaforma');
  assert.equal(r.doc.querySelector('[data-testid=admin-ical-personal]').value, 'https://www.lacolumbera.test/api/x?a=ical&for=all&id=all&k=LA_TUA_CHIAVE');
  const n = text(r.doc.querySelector('[data-testid=admin-ical-note]')); assert(/ICAL_PERSONAL_KEY/.test(n) && /non inserirlo su Booking o Airbnb/.test(n), n);
  const q = new URL(r.doc.querySelector('[data-testid=admin-ical-export-site-torre]').value).searchParams, ic = await H.api('ical', {}, { method: 'GET', query: { id: q.get('id'), for: q.get('for') } }); assert.equal(ic.status, 200);
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
  doc.querySelector('[data-testid=booking-continue]').click();                       // passo 2: compaiono i campi
  doc.querySelector('[data-testid=booking-name]').value = 'Mario'; doc.querySelector('[data-testid=booking-surname]').value = 'Rossi'; doc.querySelector('[data-testid=booking-email]').value = 'mario@test.it';
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

/* ===================== prenotazione in due passi, orizzonte, servizi, codici, prezzi, eventi ===================== */
const NIGHTS = { da: '2026-10-20', a: '2026-10-23' };      // 3 notti, tutte libere in setup()
const pickDates = (doc, da, a) => { doc.querySelector('#cal .d[data-d="' + da + '"]').click(); doc.querySelector('#cal .d[data-d="' + a + '"]').click(); };
const fill = (doc, v) => { for (const [k, x] of Object.entries(v)) doc.querySelector('[data-testid=booking-' + k + ']').value = x; };
test('W1 prenotazione: prima date e importo (nessun prezzo per notte), poi i campi; "Modifica" riporta alle date senza perderle', async () => {
  await setup();
  const { doc, log, w } = await load('torre.html', { scripts: ['js/site.js', 'js/pages.js'] }), $ = s => doc.querySelector(s);
  await waitFor(() => $('#cal .d'), 'calendario');
  assert(!/€/.test($('#cal').textContent) && !$('#cal small'), 'nessun prezzo sotto i giorni del calendario');
  assert(!/€|inclus|dal \d/.test(text($('#note'))) && /minimo 2 notti/.test(text($('#note'))) && /fino a 5 ospiti/.test(text($('#note'))), 'niente costi per ospite sopra il calendario: ' + text($('#note')));
  assert(!/inclus/.test(text($('#chips'))), 'nemmeno nelle etichette: ' + text($('#chips')));
  assert($('#tot').hidden && $('#go').hidden, 'senza date: niente importo e niente pulsante Prenota');
  assert($('#p2').hidden, 'senza date: i campi non ci sono');
  assert(/Scegli arrivo e partenza/.test(text($('#q'))), text($('#q')));
  doc.querySelector('#cal .d[data-d="2026-10-20"]').click();
  assert(/Ora scegli il giorno di partenza/.test(text($('#q'))) && $('#tot').hidden, 'dopo l\'arrivo si chiede la partenza');
  doc.querySelector('#cal .d[data-d="2026-10-23"]').click();
  assert(!$('#tot').hidden && !$('#go').hidden, 'con le date compaiono importo e Prenota');
  assert.equal(text($('[data-testid=booking-total]')), '€540', '3 notti × €180, 2 ospiti');
  assert(/3 notti · 2 ospiti/.test(text($('#q'))), text($('#q')));
  assert(/20 ott/i.test(text($('#v-in'))) && /23 ott/i.test(text($('#v-out'))), 'arrivo e partenza scritti nei riquadri: ' + text($('#v-in')) + ' / ' + text($('#v-out')));
  // ospiti: il totale segue (Torre: +€20 a notte dal 3° ospite), minimo 1, massimo 5
  const plus = $('[data-testid=booking-guests-plus]'), minus = $('[data-testid=booking-guests-minus]');
  plus.click(); assert.equal(text($('[data-testid=booking-total]')), '€600'); assert.equal(text($('[data-testid=booking-guests]')), '3');
  plus.click(); plus.click(); assert.equal(text($('[data-testid=booking-total]')), '€720', '5 ospiti: 3 × (180 + 60)'); assert(plus.disabled, 'oltre il massimo non si sale');
  for (let i = 0; i < 4; i++) minus.click(); assert(minus.disabled && text($('[data-testid=booking-guests]')) === '1', 'sotto 1 non si scende'); assert.equal(text($('[data-testid=booking-total]')), '€540', '1 ospite costa come 2 (€180 a notte)');
  plus.click(); assert.equal(text($('[data-testid=booking-guests]')), '2');
  // passo 2
  $('[data-testid=booking-continue]').click();
  assert($('#p1').hidden && !$('#p2').hidden, 'si passa ai dati');
  const rc = text($('[data-testid=booking-recap]'));
  assert(/Torre/.test(rc) && /3 notti/.test(rc) && /2 ospiti/.test(rc) && /€540/.test(rc), rc);
  assert($('.bk-steps li[data-s="2"]').classList.contains('on') && $('.bk-steps li[data-s="1"]').classList.contains('done') && text($('.bk-steps li[data-s="1"] span')) === '✓', 'indicatore dei passi');
  for (const t of ['name', 'surname', 'email', 'phone', 'submit']) assert($('[data-testid=booking-' + t + ']'), 'campo ' + t);
  assert(/privacy\.html/.test($('[data-testid=booking-form]').innerHTML), 'informativa accanto ai campi');
  // Modifica: si torna alle date, scelte e ospiti restano
  $('[data-testid=booking-back]').click(); await sleep(20);
  assert(!$('#p1').hidden && $('#p2').hidden && $('#cal .d.s[data-d="2026-10-20"]') && $('#cal .d.s[data-d="2026-10-23"]'), 'date ancora scelte');
  assert.equal(text($('[data-testid=booking-total]')), '€540');
  // si completa il modulo: parte la richiesta di pagamento con nome e cognome uniti e gli ospiti scelti
  $('[data-testid=booking-continue]').click(); fill(doc, { name: 'Mario', surname: 'Rossi', email: 'mario@test.it', phone: '333 1234567' });
  const before = global.__stripeSessions.length; $('#f').requestSubmit();
  await waitFor(() => log.calls.some(c => c.a === 'checkout' && c.status === 200), 'checkout');
  const ss = global.__stripeSessions[before]; assert(ss, 'sessione Stripe creata');
  assert.equal(ss.params.line_items[0].price_data.unit_amount, 54000, 'importo = quello mostrato');
  const acc = JSON.parse(w.sessionStorage.getItem('lc_acc')), bk = JSON.parse(kv.exec(['HGET', 'bkh', acc.c]));
  assert.deepEqual([bk.nome, bk.email, bk.tel, bk.ospiti, bk.totale, bk.da, bk.a, bk.stato], ['Mario Rossi', 'mario@test.it', '333 1234567', 2, 540, '2026-10-20', '2026-10-23', 'in_attesa']);
});
test('W2 prenotazione: errore del server (date non più libere) → messaggio chiaro; "Modifica" ricarica il calendario e toglie le date prese', async () => {
  await setup();
  const { doc, log } = await load('torre.html', { scripts: ['js/site.js', 'js/pages.js'] }), $ = s => doc.querySelector(s);
  await waitFor(() => $('#cal .d'), 'calendario');
  pickDates(doc, NIGHTS.da, NIGHTS.a); $('[data-testid=booking-continue]').click(); fill(doc, { name: 'Anna', surname: 'Verdi', email: 'anna@test.it' });
  assert.equal((await checkout({ da: '2026-10-21', a: '2026-10-23', email: 'altro@test.it' })).status, 200);         // nel frattempo un altro ospite prende due notti
  $('#f').requestSubmit();
  await waitFor(() => /non più disponibili/.test(text($('#e'))), 'messaggio del server');
  assert(!$('[data-testid=booking-submit]').disabled, 'il pulsante torna utilizzabile');
  $('[data-testid=booking-back]').click();
  await waitFor(() => /non sono più disponibili/.test(text($('#e'))), 'avviso dopo il ricaricamento');
  assert(!$('#cal .d.s') && $('#cal .d[data-d="2026-10-21"].x'), 'date sbarrate e scelta azzerata');
  assert(log.calls.filter(c => c.a === 'busy').length >= 2, 'calendario riscaricato');
});
test('W3 orizzonte: si vede e si prenota al massimo 6 mesi avanti (pagina e server)', async () => {
  await setup();                                                                      // oggi = 2 ott 2026 → ultimo giorno 2 apr 2027
  const b = await H.busy('torre'); assert.equal(b.status, 200);
  assert.deepEqual(b.body.limit, { mesi: 6, ultimoGiorno: '2027-04-02' });
  assert(b.body.dates.includes('2027-04-02') && !b.body.dates.includes('2027-04-01'), 'dal 2 aprile la notte non è prenotabile, quella prima sì');
  const { doc } = await load('torre.html', { scripts: ['js/site.js', 'js/pages.js'] }), $ = s => doc.querySelector(s), month = () => text($('[data-testid=cal-month]')).toLowerCase();
  await waitFor(() => $('#cal .d'), 'calendario');
  assert(/2 apr 2027/.test(text($('[data-testid=booking-limit]'))), text($('[data-testid=booking-limit]')));
  assert($('#pv').disabled && /ottobre 2026/.test(month()), 'indietro oltre il mese in corso non si va');
  for (let i = 0; i < 6; i++) { assert(!$('#nx').disabled, 'avanti possibile al mese ' + i); $('#nx').click(); }
  assert(/aprile 2027/.test(month()) && $('#nx').disabled, 'si ferma ad aprile 2027');
  $('#nx').click(); assert(/aprile 2027/.test(month()), 'il clic su un pulsante spento non fa nulla');
  assert($('#cal .d[data-d="2027-04-03"]').classList.contains('f') && $('#cal .d[data-d="2027-04-30"]').classList.contains('f'), 'dopo il limite i giorni sono spenti');
  assert(!$('#cal .d[data-d="2027-04-01"]').classList.contains('f'), 'il giorno prima del limite no');
  // partenza fino al 2 aprile compreso: 30 mar → 2 apr = 3 notti
  $('#pv').click(); pickDates(doc, '2027-03-30', '2027-03-31'); assert(/Soggiorno minimo/.test(text($('#e'))), 'una notte sola non basta'); doc.querySelector('#cal .d[data-d="2027-03-30"]').click();
  $('#nx').click(); doc.querySelector('#cal .d[data-d="2027-04-03"]').click();
  assert(/fino al 2 apr 2027/.test(text($('#e'))) && !$('#cal .d.s[data-d="2027-04-03"]'), 'oltre il limite: messaggio e nessuna selezione: ' + text($('#e')));
  doc.querySelector('#cal .d[data-d="2027-04-02"]').click();
  assert(/3 notti/.test(text($('#q'))) && text($('#e')) === '', 'il 2 aprile come partenza va bene: ' + text($('#q')));
  // il server fa rispettare lo stesso limite anche a chi non usa la pagina
  const ok = await checkout({ da: '2027-03-30', a: '2027-04-02' }); assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const no1 = await checkout({ da: '2027-04-01', a: '2027-04-03', email: 'b@t.it' }); assert.equal(no1.status, 409); assert.equal(no1.body.code, 'OLTRE_ORIZZONTE'); assert.equal(no1.body.ultimoGiorno, '2027-04-02'); assert(/2 aprile 2027/.test(no1.body.err), no1.body.err);
  const no2 = await checkout({ da: '2027-06-10', a: '2027-06-12', email: 'c@t.it' }); assert.equal(no2.status, 409); assert.equal(no2.body.code, 'OLTRE_ORIZZONTE');
  assert.equal(global.__stripeSessions.length, 1, 'nessun pagamento avviato per le date oltre il limite'); assert.equal(kv.exec(['HGETALL', 'holds:torre']).length > 0, true);
});
test('W4 servizi e approfondimento: testo sotto la descrizione, otto servizi in evidenza, finestra con tutti (Esc, X e clic fuori la chiudono)', async () => {
  await setup();
  const def = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'default.json'), 'utf8')).apts.find(a => a.id === 'torre'), tot = def.servizi.split('\n').filter(l => l.startsWith('- ')).length, grp = def.servizi.split('\n').filter(l => l.startsWith('## ')).length;
  const { doc, w } = await load('torre.html', { scripts: ['js/site.js', 'js/pages.js'] }), $ = s => doc.querySelector(s);
  await waitFor(() => !$('#srv').hidden, 'servizi');
  assert(!$('#more').hidden && [...doc.querySelectorAll('#more h2')].map(x => text(x)).includes('Gli spazi') && /travi in legno/.test(text($('#more'))), 'testo di approfondimento');
  assert.equal(doc.querySelectorAll('#srv-top li').length, 8, 'otto servizi in evidenza');
  const open = $('[data-testid=services-open]'); assert.equal(text(open), 'Mostra tutti i servizi (' + tot + ')');
  assert(!$('[data-testid=modal]'), 'finestra chiusa');
  open.focus(); open.click();
  const m = $('[data-testid=modal]'); assert(m && doc.body.classList.contains('modal-open'), 'finestra aperta e pagina bloccata');
  assert.equal(m.querySelectorAll('.srv-group').length, grp, 'tutti i gruppi'); assert.equal(m.querySelectorAll('.srv-list li').length, tot, 'tutti i servizi');
  assert(/Servizi · Torre/.test(text(m.querySelector('h2'))) && m.querySelector('[role=dialog][aria-modal=true]'), 'titolo e ruolo accessibile');
  assert.equal(doc.activeElement, m.querySelector('[data-testid=modal-close]'), 'il focus entra nella finestra');
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert(!$('[data-testid=modal]') && !doc.body.classList.contains('modal-open') && doc.activeElement === open, 'Esc chiude e il focus torna al pulsante');
  open.click(); $('[data-testid=modal-close]').click(); assert(!$('[data-testid=modal]'), 'la X chiude');
  open.click(); $('[data-testid=modal]').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); assert(!$('[data-testid=modal]'), 'il clic fuori chiude');
  open.click(); $('.modal-box').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); assert($('[data-testid=modal]'), 'il clic dentro la finestra non la chiude');
  // il testo scritto in Gestione non diventa mai HTML
  const c = (await H.adminApi('cfg_admin', {})).body; c.apts.find(a => a.id === 'torre').servizi = '## <b>Gruppo</b>\n- <img src=x onerror=alert(1)>\n- Voce & altra'; c.apts.find(a => a.id === 'torre').dettagli = '## <i>Titolo</i>\n<script>alert(1)</script>';
  assert.equal((await H.adminApi('save', c)).status, 200);
  const r2 = await load('torre.html', { scripts: ['js/site.js', 'js/pages.js'] }); await waitFor(() => !r2.doc.querySelector('#srv').hidden, 'servizi (2)');
  r2.doc.querySelector('[data-testid=services-open]').click();
  assert(!r2.doc.querySelector('.modal img, .modal b, #more i, #more script, #srv-top img') && /<img src=x/.test(text(r2.doc.querySelector('.modal'))) && /Voce & altra/.test(text(r2.doc.querySelector('.modal'))), 'tutto resta testo');
});
test('W5 servizi mancanti nella configurazione salvata: valgono quelli di default.json; un salvataggio da una pagina di gestione vecchia non li cancella', async () => {
  await setup();
  const old = JSON.parse(kv.exec(['GET', 'cfg'])); old.apts.forEach(a => { delete a.servizi; delete a.dettagli; delete a.cin; delete a.cipat; }); kv.exec(['SET', 'cfg', JSON.stringify(old)]);      // configurazione salvata prima di questa versione
  const def = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'default.json'), 'utf8')).apts.find(a => a.id === 'corte');
  let pub = (await H.api('cfg', {}, { method: 'GET' })).body; assert.equal(pub.apts.find(a => a.id === 'corte').servizi, def.servizi, 'default per i servizi');
  assert.equal(pub.apts.find(a => a.id === 'corte').dettagli, def.dettagli);
  // la pagina di gestione di prima non invia i campi nuovi: quelli già presenti restano
  let full = (await H.adminApi('cfg_admin', {})).body; full.apts.find(a => a.id === 'corte').servizi = '## Solo\n- Questo'; assert.equal((await H.adminApi('save', full)).status, 200);
  full = (await H.adminApi('cfg_admin', {})).body; for (const a of full.apts) { delete a.servizi; delete a.dettagli; delete a.cin; delete a.cipat; }
  assert.equal((await H.adminApi('save', full)).status, 200);
  assert.equal(JSON.parse(kv.exec(['GET', 'cfg'])).apts.find(a => a.id === 'corte').servizi, '## Solo\n- Questo', 'servizi già salvati non cancellati');
  pub = (await H.api('cfg', {}, { method: 'GET' })).body; assert.equal(pub.apts.find(a => a.id === 'corte').servizi, '## Solo\n- Questo');
  assert.equal(pub.apts.find(a => a.id === 'torre').servizi.split('\n')[0], '## Essenziali', 'Torre: ancora il default');
});
test('W6 CIN e CIPAT: sotto la descrizione e nelle schede della home; il CIN di default c\'è, il CIPAT arriva dalla struttura o dal singolo appartamento', async () => {
  const CIN = 'IT022205C2QX58MEMK';
  await setup({ ISTAT_CIPAT: '022205-AT-012345' });
  // 1) CIN di default per entrambi, CIPAT della struttura (ISTAT_CIPAT)
  let r = await load('torre.html', { scripts: ['js/site.js', 'js/pages.js'] }); await waitFor(() => !r.doc.querySelector('[data-testid=apt-codes]').hidden, 'codici');
  assert.equal(text(r.doc.querySelector('[data-testid=apt-codes]')), 'CIN: ' + CIN + ' · CIPAT: 022205-AT-012345');
  // 2) il titolare imposta un CIN proprio per Torre e un CIPAT proprio per Corte da Gestione
  const c = (await H.adminApi('cfg_admin', {})).body; c.apts.find(a => a.id === 'torre').cin = ' IT022205C2TORRE001 '; c.apts.find(a => a.id === 'corte').cipat = '022205-AT-999999'; assert.equal((await H.adminApi('save', c)).status, 200);
  r = await load('torre.html', { scripts: ['js/site.js', 'js/pages.js'] }); await waitFor(() => !r.doc.querySelector('[data-testid=apt-codes]').hidden, 'codici Torre');
  assert.equal(text(r.doc.querySelector('[data-testid=apt-codes]')), 'CIN: IT022205C2TORRE001 · CIPAT: 022205-AT-012345', 'CIN (senza spazi) e CIPAT della struttura');
  r = await load('corte.html', { scripts: ['js/site.js', 'js/pages.js'] }); await waitFor(() => !r.doc.querySelector('[data-testid=apt-codes]').hidden, 'codici Corte');
  assert.equal(text(r.doc.querySelector('[data-testid=apt-codes]')), 'CIN: ' + CIN + ' · CIPAT: 022205-AT-999999', 'il CIPAT proprio ha la precedenza');
  const home = await load('index.html', { scripts: ['js/site.js'] });
  await waitFor(() => !home.doc.querySelector('[data-testid=card-torre-codici]').hidden && !home.doc.querySelector('[data-testid=card-corte-codici]').hidden, 'codici nella home');
  assert.equal(text(home.doc.querySelector('[data-testid=card-torre-codici]')), 'CIN: IT022205C2TORRE001 · CIPAT: 022205-AT-012345'); assert.equal(text(home.doc.querySelector('[data-testid=card-corte-codici]')), 'CIN: ' + CIN + ' · CIPAT: 022205-AT-999999');
  // 3) senza ISTAT_CIPAT compare il solo CIN; un campo vuoto non produce mai segnaposto né punti
  await setup(); const r3 = await load('torre.html', { scripts: ['js/site.js', 'js/pages.js'] }); await waitFor(() => !r3.doc.querySelector('[data-testid=apt-codes]').hidden, 'codici');
  assert.equal(text(r3.doc.querySelector('[data-testid=apt-codes]')), 'CIN: ' + CIN);
  const f = r3.w.lcCodici; assert.equal(f({}, ''), ''); assert.equal(f({ cin: '  ', cipat: '' }, undefined), ''); assert.equal(f({ cin: '', cipat: '' }, '022205-AT-012345'), 'CIPAT: <b>022205-AT-012345</b>'); assert.equal(f({ cin: '<b>x</b>' }, ''), 'CIN: <b>&lt;b&gt;x&lt;/b&gt;</b>', 'i codici non diventano HTML');
  // 4) un ISTAT_CIPAT malformato non finisce mai sul sito
  await H.newEnv({ legacyRows: [HDR], env: { ISTAT_CIPAT: '<script>x' } }); assert.equal((await H.api('cfg', {}, { method: 'GET' })).body.cipat, '');
});
test('W7 Gestione · Testi: CIN, CIPAT, approfondimento e servizi si modificano e si salvano; lo spazio attorno ai codici viene tolto', async () => {
  await setup();
  const r = await loadAdmin('#torre/testi'), $ = s => r.doc.querySelector(s), set = (el, v) => { el.value = v; el.dispatchEvent(new r.w.Event('input', { bubbles: true })); };
  await waitFor(() => $('[data-testid=admin-cin-torre]'), 'campi');
  assert.equal($('[data-testid=admin-cin-torre]').value, 'IT022205C2QX58MEMK', 'il CIN di default è già nel campo'); assert(/^## Essenziali/.test($('[data-testid=admin-servizi-torre]').value), 'servizi di default già nel campo'); assert(/^## Gli spazi/.test($('[data-testid=admin-dettagli-torre]').value));
  set($('[data-testid=admin-cin-torre]'), '  IT022205C2AAAA1111 '); set($('[data-testid=admin-cipat-torre]'), '022205-AT-012345'); set($('[data-testid=admin-servizi-torre]'), '## Extra\n- Culla\n- Seggiolone'); set($('[data-testid=admin-dettagli-torre]'), '## Novità\nCucina nuova.');
  $('[data-testid=admin-save]').click(); await waitFor(() => /Salvato/.test(text($('[data-testid=admin-save-msg]'))), 'salvataggio');
  const t = JSON.parse(kv.exec(['GET', 'cfg'])).apts.find(a => a.id === 'torre');
  assert.deepEqual([t.cin, t.cipat, t.servizi, t.dettagli], ['IT022205C2AAAA1111', '022205-AT-012345', '## Extra\n- Culla\n- Seggiolone', '## Novità\nCucina nuova.']);
  const pub = await load('torre.html', { scripts: ['js/site.js', 'js/pages.js'] }); await waitFor(() => !pub.doc.querySelector('#srv').hidden, 'pagina aggiornata');
  assert.equal(pub.doc.querySelectorAll('#srv-top li').length, 2); assert(/Cucina nuova/.test(text(pub.doc.querySelector('#more'))) && /IT022205C2AAAA1111/.test(text(pub.doc.querySelector('#codes'))));

  // un CIN lasciato vuoto per sbaglio non fa sparire il codice dal sito: vale quello di default
  const c2 = (await H.adminApi('cfg_admin', {})).body; c2.apts.find(x => x.id === 'torre').cin = ''; assert.equal((await H.adminApi('save', c2)).status, 200);
  assert.equal(JSON.parse(kv.exec(['GET', 'cfg'])).apts.find(x => x.id === 'torre').cin, '', 'salvato vuoto');
  assert.equal((await H.api('cfg', {}, { method: 'GET' })).body.apts.find(x => x.id === 'torre').cin, 'IT022205C2QX58MEMK', 'ma il sito mostra il CIN di default');
});
test('W8 Gestione · Prezzi: il prezzo parte dal 1° ospite; i prezzi di prima restano identici per 1…5 ospiti e il server calcola lo stesso', async () => {
  await setup();                                                                      // configurazione vecchia: €180 con 2 ospiti inclusi, +€20 dal 3°
  const quote = async n => { const { doc } = await load('torre.html', { scripts: ['js/site.js', 'js/pages.js'] }); await waitFor(() => doc.querySelector('#cal .d'), 'calendario'); pickDates(doc, NIGHTS.da, NIGHTS.a); for (let i = 2; i < n; i++) doc.querySelector('[data-testid=booking-guests-plus]').click(); for (let i = 2; i > n; i--) doc.querySelector('[data-testid=booking-guests-minus]').click(); return text(doc.querySelector('[data-testid=booking-total]')); };
  const prima = []; for (const n of [1, 2, 3, 4, 5]) prima.push(await quote(n));
  assert.deepEqual(prima, ['€540', '€540', '€600', '€660', '€720']);
  const r = await loadAdmin('#torre/prezzi'), $ = s => r.doc.querySelector(s), set = (el, v) => { el.value = v; el.dispatchEvent(new r.w.Event('input', { bubbles: true })); };
  const base = await waitFor(() => $('[data-testid=admin-base-torre]'), 'prezzo del 1° ospite');
  assert(/1° ospite/.test(text($('[data-testid=admin-apt-torre]'))) && !/Ospiti inclusi nel prezzo/.test(text($('[data-testid=admin-apt-torre]'))), 'il campo c\'è e "ospiti inclusi" non serve più');
  assert.equal(base.value, '180'); assert.deepEqual([...r.doc.querySelectorAll('[data-step]')].map(x => x.value), ['0', '20'], 'il 2° ospite non costa di più, dal 3° +€20');
  assert(/Dal 2° ospite/.test(text($('[id^=steps-]'))) && /Dal 3° ospite in poi/.test(text($('[id^=steps-]'))), 'supplementi dal 2° ospite');
  const pv = () => text($('[id^=prev-]'));
  assert(/1 ospite €180/.test(pv()) && /2 ospiti €180/.test(pv()) && /3 ospiti €200/.test(pv()) && /5 ospiti €240/.test(pv()), pv());
  // il titolare abbassa il prezzo del 1° ospite e fa pagare di più il 2°
  set(base, '150'); set(r.doc.querySelector('[data-step]'), '30');
  assert(/1 ospite €150/.test(pv()) && /2 ospiti €180/.test(pv()) && /3 ospiti €200/.test(pv()) && /4 ospiti €220/.test(pv()), pv());
  $('[data-testid=admin-save]').click(); await waitFor(() => /Salvato/.test(text($('[data-testid=admin-save-msg]'))), 'salvataggio');
  const st = JSON.parse(kv.exec(['GET', 'cfg'])).apts.find(a => a.id === 'torre'); assert.deepEqual([st.base, st.inclusi, st.extraSteps], [150, 1, [30, 20]]);
  const dopo = []; for (const n of [1, 2, 3, 4, 5]) dopo.push(await quote(n)); assert.deepEqual(dopo, ['€450', '€540', '€600', '€660', '€720'], 'la pagina mostra i nuovi importi');
  // il server calcola gli stessi importi (2 notti ciascuna: il minimo è 2)
  for (const [n, da, al, euro] of [[1, '2026-11-01', '2026-11-03', 300], [2, '2026-11-04', '2026-11-06', 360], [5, '2026-11-07', '2026-11-09', 480]]) {
    const before = global.__stripeSessions.length, co = await checkout({ da, a: al, ospiti: n, email: 'p' + n + '@t.it' });
    assert.equal(co.status, 200, JSON.stringify(co.body)); assert.equal(global.__stripeSessions[before].params.line_items[0].price_data.unit_amount, euro * 100, 'importo Stripe con ' + n + ' ospiti');
  }
});
test('W9 Gestione · Prezzi: una configurazione con più ospiti inclusi si converte senza cambiare nessun importo', async () => {
  await H.newEnv({ legacyRows: [HDR] }); const c = JSON.parse(kv.exec(['GET', 'cfg'])); const t = c.apts.find(a => a.id === 'torre'); Object.assign(t, { base: 100, inclusi: 3, extra: 0, extraSteps: [15, 25], max: 5 }); kv.exec(['SET', 'cfg', JSON.stringify(c)]); await H.sync();
  const r = await loadAdmin('#torre/prezzi'), prev = () => text(r.doc.querySelector('[id^=prev-]'));
  await waitFor(() => r.doc.querySelector('[data-testid=admin-base-torre]'), 'prezzi');
  assert(/1 ospite €100/.test(prev()) && /2 ospiti €100/.test(prev()) && /3 ospiti €100/.test(prev()) && /4 ospiti €115/.test(prev()) && /5 ospiti €140/.test(prev()), 'prima 3 inclusi, poi +15 e +25: ' + prev());
  assert.deepEqual([...r.doc.querySelectorAll('[data-step]')].map(x => x.value), ['0', '0', '15', '25'], 'i 3 ospiti inclusi diventano due supplementi a 0');
});
test('W10 pagina Eventi: eventi automatici e inseriti a mano, raggruppati per mese in ordine; niente più eventi in Luoghi di interesse', async () => {
  await setup();
  assert.equal((await H.adminApi('event_add', { title: 'Serata in cantina', date: '2026-11-05', time: '21:00', location: 'Ravina' })).status, 200);
  assert.equal((await H.adminApi('event_add', { title: 'Cena di Natale <b>x</b>', date: '2026-12-20', location: 'Trento' })).status, 200);
  const { doc } = await load('eventi.html', { scripts: ['js/site.js', 'js/pages.js'] }), $ = s => doc.querySelector(s);
  await waitFor(() => doc.querySelector('#events .ev-card'), 'eventi');
  assert(doc.querySelectorAll('#events .ev-month').length >= 2, 'titoli dei mesi');
  const kids = [...$('#events').children], mesi = []; let cur = '';
  for (const k of kids) { if (k.classList.contains('ev-month')) { cur = k.dataset.testid.replace('ev-month-', ''); mesi.push(cur); } else assert(k.dataset.testid.replace('ev-', '').startsWith(cur), 'ogni scheda sta sotto il suo mese: ' + k.dataset.testid + ' / ' + cur); }
  assert.deepEqual(mesi, [...mesi].sort(), 'mesi in ordine'); assert.equal(new Set(mesi).size, mesi.length, 'un titolo per mese');
  assert(/Serata in cantina/.test(text($('[data-testid="ev-2026-11-05"]'))) && /21:00/.test(text($('[data-testid="ev-2026-11-05"]'))), 'evento a mano');
  assert(!$('#events b') && /Cena di Natale <b>x<\/b>/.test(text($('[data-testid="ev-2026-12-20"]'))), 'il titolo resta testo');
  const all = [...doc.querySelectorAll('#events .ev-card')].map(c => c.dataset.testid.replace('ev-', '')); assert.deepEqual(all, [...all].sort(), 'schede in ordine di data');
  // la pagina Luoghi di interesse non ha più la sezione e non carica il codice degli eventi
  const html = fs.readFileSync(path.join(ROOT, 'dintorni.html'), 'utf8'); assert(!/id="eventi"|id="events"|data-p="eventi"|js\/pages\.js/.test(html), 'dintorni.html senza eventi');
});
test('W11 Convenzioni: niente etichetta "Convenzionato" su Pizzeria Da Mimmo, Bistò e Palestra Juta', async () => {
  const { doc } = await load('convenzioni.html', { scripts: ['js/dintorni.js', 'js/site.js'] });
  await waitFor(() => doc.querySelector('[data-testid=partner-card-bisto]'), 'schede');
  const tag = id => { const t = doc.querySelector('[data-testid=partner-card-' + id + '] .apt-tag'); return t ? text(t) : null; };
  assert.deepEqual(['pizzeria-da-mimmo', 'bisto', 'palestra-juta'].map(tag), [null, null, null], 'nessuna etichetta');
  assert.equal(tag('sun7-caffe'), 'Convenzionato', 'le altre schede non cambiano'); assert.equal(tag('forst-biergarten'), 'Solo estate');
  assert.equal(doc.querySelectorAll('[data-testid^=partner-card-]').length, 5);
});

test('W12 Gestione · Area ospiti: testi per gli ospiti in ogni appartamento, check-out, giorni per il Wi-Fi e WhatsApp si salvano; valori sbagliati non partono', async () => {
  await setup();
  const r = await loadAdmin('#torre/testi'), $ = s => r.doc.querySelector(s), set = (el, v) => { el.value = v; el.dispatchEvent(new r.w.Event('input', { bubbles: true })); };
  await waitFor(() => $('[data-testid=admin-info-ospiti-torre]'), 'campi area ospiti');
  assert(/non compaiono sul sito pubblico/.test(text($('[data-testid=admin-apt-torre]'))) && /cassetta delle chiavi/.test(text($('[data-testid=admin-apt-torre]'))), 'spiega chi vede i testi e cosa non scrivere');
  set($('[data-testid=admin-info-ospiti-torre]'), '## Regole\n- Niente feste'); set($('[data-testid=admin-info-riservate-torre]'), 'Password: prova');
  await goto(r, '#prenotazioni', '[data-testid=admin-area-ospiti]');
  assert.deepEqual([$('[data-testid=admin-checkout-time]').value, $('[data-testid=admin-info-giorni]').value, $('[data-testid=admin-whatsapp]').value], ['', '2', '+39 351 704 3594'], 'valori iniziali');
  set($('[data-testid=admin-checkout-time]'), '10:30'); set($('[data-testid=admin-info-giorni]'), '45');
  $('[data-testid=admin-save]').click();
  await waitFor(() => /Controlla i giorni per le informazioni riservate/.test(text($('[data-testid=admin-save-msg]'))), 'rifiuto nella pagina');
  set($('[data-testid=admin-info-giorni]'), '3'); set($('[data-testid=admin-whatsapp]'), '');
  $('[data-testid=admin-save]').click(); await waitFor(() => /Salvato/.test(text($('[data-testid=admin-save-msg]'))), 'salvataggio');
  const st = JSON.parse(kv.exec(['GET', 'cfg'])), t = st.apts.find(a => a.id === 'torre');
  assert.deepEqual([t.infoOspiti, t.infoRiservate, st.checkoutOra, st.infoGiorni, st.whatsapp], ['## Regole\n- Niente feste', 'Password: prova', '10:30', 3, ''], 'salvato in KV');
  const c = (await checkout({ da: '2026-12-10', a: '2026-12-12' })).body; await H.webhook('checkout.session.completed', H.paidSession(c.code));
  const g = await load('area-clienti.html', { hash: '#k=' + c.code, scripts: AREA });
  await waitFor(() => g.doc.querySelector('[data-testid=guest-app]'), 'area ospiti');
  assert(/entro le 10:30/.test(text(g.doc.querySelector('[data-testid=mie-card-' + c.code + ']'))) && !g.doc.querySelector('[data-testid=ga-wa]'), 'check-out mostrato, WhatsApp nascosto');
});

test('W13 Gestione · Messaggi: casella con i non letti, conversazione, risposta con un template, programmazione; template compilati per Airbnb; regola automatica e «salta»', async () => {
  await setup(); regAirbnb();
  const c = (await checkout({ da: '2026-12-10', a: '2026-12-13' })).body; await H.webhook('checkout.session.completed', H.paidSession(c.code));
  await H.api('msg_send', { code: c.code, t: c.t, testo: 'Buongiorno, c\'è il parcheggio? <b>grazie</b>' });
  const r = await loadAdmin('#panoramica'), $ = s => r.doc.querySelector(s), set = (el, v) => { el.value = v; el.dispatchEvent(new r.w.Event('input', { bubbles: true })); };
  assert.equal(text($('[data-testid=admin-msg-badge]')), '1', 'badge nel menu');
  await goto(r, '#messaggi', '[data-testid=msg-conv-' + c.code + ']');
  assert(r.doc.body.classList.contains('adp-active'), 'niente barra «Salva modifiche»');
  const row = $('[data-testid=msg-conv-' + c.code + ']'); assert(row.classList.contains('unread') && /Mario Rossi/.test(text(row)) && /parcheggio\? <b>grazie<\/b>/.test(text(row)), text(row));
  await goto(r, '#messaggi/c/' + c.code, '[data-testid=msg-thread]');
  await waitFor(() => $('[data-testid=msg-messages] .ga-msg'), 'messaggi');
  assert(!$('[data-testid=msg-messages] b') && /<b>grazie<\/b>/.test(text($('[data-testid=msg-messages]'))), 'testo, mai HTML');
  await waitFor(() => !$('[data-testid=admin-msg-badge]'), 'letta: il badge sparisce');
  const pick = $('[data-testid=msg-tpl-pick]'); pick.value = 'promemoria'; pick.dispatchEvent(new r.w.Event('change', { bubbles: true }));
  await waitFor(() => /ci vediamo giovedì 10 dicembre/.test($('[data-testid=msg-testo]').value), 'template compilato nella risposta');
  $('#msg-reply').requestSubmit();
  await waitFor(() => r.doc.querySelectorAll('[data-testid=msg-messages] .ga-msg.me').length === 1, 'risposta inviata');
  assert(/inviato/.test(text($('[data-testid=msg-messages] .ga-msg.me'))), 'non ancora letto');
  // programmata per domani
  $('[data-testid=msg-testo]').value = 'Promemoria programmato';
  $('[data-testid=msg-prog-open]').click(); $('[data-testid=msg-quando]').value = '2026-10-03T10:00'; $('[data-testid=msg-prog-ok]').click();
  await waitFor(() => /Programmato per/.test(text($('[data-testid=msg-out]'))), 'programmato');
  // template: compila per la prenotazione Airbnb (testo da incollare nella chat di Airbnb)
  await goto(r, '#messaggi/template', '[data-testid=msg-tpl]');
  const box = [...r.doc.querySelectorAll('.msg-tpl')].find(x => /area ospiti/.test(x.querySelector('[data-tf=nome]').value)); assert(box, 'template per Booking e Airbnb');
  const i = box.dataset.i;
  const sel = r.doc.querySelector('[data-tprev="' + i + '"]'); sel.value = 'HMSEDESZCW';
  $('[data-testid=msg-tpl-fill-' + i + ']').click();
  await waitFor(() => !$('[data-testid=msg-tpl-prev-' + i + ']').hidden, 'anteprima');
  assert(/area-clienti\.html#k=HMSEDESZCW/.test(text($('[data-testid=msg-tpl-prev-' + i + ']'))), text($('[data-testid=msg-tpl-prev-' + i + ']')));
  set(r.doc.querySelector('[data-tf=nome][data-i="0"]'), 'Benvenuto rinominato'); $('[data-testid=msg-tpl-save]').click();
  await waitFor(() => /Template salvati/.test(text($('[data-testid=msg-tpl-out]'))), 'salvati');
  assert.equal(JSON.parse(kv.exec(['GET', 'msg:tpl']))[0].nome, 'Benvenuto rinominato');
  // regola: due giorni prima dell'arrivo alle 10, attiva; compare tra i prossimi invii quando manca meno di una settimana
  await goto(r, '#messaggi/automatici', '[data-testid=msg-auto]');
  $('[data-testid=msg-rule-add]').click();
  const q = await waitFor(() => $('[data-testid=msg-rule-quando-0]'), 'nuova regola'); q.value = 'prima'; q.dispatchEvent(new r.w.Event('change', { bubbles: true }));
  const n = await waitFor(() => $('[data-testid=msg-rule-n-0]'), 'giorni'); n.value = '2'; n.dispatchEvent(new r.w.Event('change', { bubbles: true }));
  const at = $('[data-testid=msg-rule-attiva-0]'); at.checked = true; at.dispatchEvent(new r.w.Event('change', { bubbles: true }));
  $('[data-testid=msg-auto-save]').click();
  await waitFor(() => /Regole salvate/.test(text($('[data-testid=msg-auto-out]'))), 'regole salvate');
  const reg = JSON.parse(kv.exec(['GET', 'msg:auto']))[0]; assert.deepEqual([reg.attiva, reg.base, reg.giorni, reg.ora], [true, 'arrivo', -2, '10:00']);
  clock.set('2026-12-03T09:00:00Z');
  const r2 = await loadAdmin('#messaggi/automatici');
  const sk = await waitFor(() => r2.doc.querySelector('[data-testid=msg-skip-' + reg.id + '-' + c.code + ']'), 'prossimo invio');
  sk.click(); await waitFor(() => /saltato/.test(text(r2.doc.querySelector('[data-testid=msg-next-' + reg.id + '-' + c.code + ']'))), 'saltato');
  assert.equal(kv.exec(['GET', 'msg:fatto:' + reg.id + ':' + c.code]), 'saltato');
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

/* ===================== Adempimenti → ISTAT (js/istat.js) ===================== */
const ISTF = n => fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'istat', n), 'utf8');
const cell = (r, i, f) => r.doc.querySelector('input.ist-in[data-i="' + i + '"][data-f="' + f + '"]');
const typeIn = (r, i, f, v) => { const el = cell(r, i, f); el.value = v; fire(el, 'input'); fire(el, 'change'); return el; };
const nRows = r => r.doc.querySelectorAll('[data-testid^=ist-row-]').length;
const IST_CIPAT = '022001-AT-012345';
const openIst = async (o, wait) => { await setup(); clock.set((o && o.now) || '2026-09-26T10:00:00Z'); ist = makeIst(o); const r = await loadAdmin('#adempimenti/istat'); if (wait !== false) await waitFor(() => /Configurazione completa/.test(text(r.doc.querySelector('[data-testid=ist-status]'))), 'configurazione completa'); return r; };
const istLoad = async (r, txt, name) => { pickFile(r, txt === undefined ? ISTF('movimenti.csv') : txt, name || 'movimenti.csv'); await waitFor(() => nRows(r) > 0 && r.doc.querySelector('[data-testid=ist-seg], [data-testid=ist-ready], [data-testid=ist-notready]'), 'tabella'); };
const istCheck = async r => { r.doc.querySelector('[data-testid=ist-check]').click(); await waitFor(() => r.doc.querySelector('[data-testid=ist-riepilogo]'), 'riepilogo'); };
const istSend = async r => { await istCheck(r); const c = r.doc.querySelector('[data-testid=ist-confirm]'); c.checked = true; fire(c, 'change'); await waitFor(() => { const b = r.doc.querySelector('[data-testid=ist-send]'); return b && !b.disabled; }, 'invio abilitato'); r.doc.querySelector('[data-testid=ist-send]').click(); };
const istRes = (r, st) => r.doc.querySelector('[data-testid=ist-result][data-stato=' + st + ']');

test('U26 ISTAT: scheda accanto ad Alloggiati Web, stato della configurazione senza segreti, nessuna chiamata ad Alloggiati; configurazione incompleta spiegata', async () => {
  const r = await openIst();
  const tabs = [...r.doc.querySelectorAll('[data-testid=adp-tabs] a')]; assert.deepEqual(tabs.map(a => text(a) + ':' + a.classList.contains('on')), ['Alloggiati Web:false', 'ISTAT:true']);
  assert(r.doc.body.classList.contains('adp-active'), 'barra "Salva modifiche" nascosta in questa sezione');
  const st = text(r.doc.querySelector('[data-testid=ist-status]')); assert(/022001-AT-012345/.test(st) && /presenti \(ws\u2022\u2022\u2022er\)/.test(st) && /Invio reale attivo/.test(st) && /statweb\.provincia\.tn\.it/.test(st) && /249 stati e 111 province/.test(st), st);
  assert(!/ws-pass|ws-user/.test(r.doc.documentElement.outerHTML), 'nessun segreto nella pagina'); assert.deepEqual(r.log.calls.filter(c => /^(al|is)_/.test(c.a)).map(c => c.a), ['is_status'], 'solo lo stato ISTAT: niente Alloggiati, niente servizio');
  assert.equal(ist.svc.requests.length, 0); assert(!r.doc.querySelector('[data-testid=ist-table]'), 'nessuna tabella finché non si carica qualcosa');
  const r2 = await openIst({ env: { ISTAT_CIPAT: '', ISTAT_WS_PASSWORD: '' } }, false); await waitFor(() => /Configurazione incompleta/.test(text(r2.doc.querySelector('[data-testid=ist-status]'))), 'configurazione incompleta');
  const t2 = text(r2.doc.querySelector('[data-testid=ist-status]')); assert(/non configurato/.test(t2) && /mancanti: ISTAT_WS_PASSWORD/.test(t2) && r2.doc.querySelector('[data-testid=ist-status] details').open, t2);
});
test('U27 ISTAT: carico il CSV → tabella con CIPAT, arrivo, partenza, notti, provenienza (codice e descrizione) e persone; riepilogo; controlli superati; nessuna chiamata al servizio', async () => {
  const r = await openIst(); await istLoad(r); assert.equal(nRows(r), 20); await waitFor(() => r.doc.querySelector('[data-testid=ist-ready]'), 'controlli superati');
  const head = [...r.doc.querySelectorAll('[data-testid=ist-table] thead th')].map(th => text(th)); assert.deepEqual(head, ['N.', 'CIPAT', 'Arrivo', 'Partenza', 'Notti', 'Provenienza', 'Persone', 'Stato', '']);
  const row0 = r.doc.querySelector('[data-testid=ist-row-0]'); assert.deepEqual(['cipat', 'arrivo', 'partenza', 'sigla', 'persone'].map(f => cell(r, 0, f).value), [IST_CIPAT, '20260808', '20260811', 'PG', '3']);
  assert(/Perugia/.test(text(row0)) && /provincia/.test(text(row0)) && /08\/08\/2026/.test(text(row0)) && /11\/08\/2026/.test(text(row0)) && text(row0.querySelector('.ist-notti')) === '3', text(row0));
  assert(/Spagna|SPAGNA/.test(text(r.doc.querySelector('[data-testid=ist-row-1]'))), 'stato estero con descrizione');
  const sum = text(r.doc.querySelector('[data-testid=ist-summary]')); assert(/20 movimenti/.test(sum) && /40 persone/.test(sum) && /CIPAT 022001-AT-012345/.test(sum) && /dal 08\/08\/2026 al 25\/09\/2026/.test(sum) && /nessun errore/.test(sum), sum);
  assert(!r.doc.querySelector('[data-testid=ist-row-0] .ist-in.bad') && !r.doc.querySelector('.ist-iss-row'), 'nessuna segnalazione; stesso CIPAT e stesso arrivo non sono segnalati');
  assert(/File caricato: movimenti\.csv/.test(text(r.doc.querySelector('[data-testid=ist-origine]')))); assert(!r.doc.querySelector('[data-testid=ist-check]').disabled, 'validazione finale disponibile'); assert.equal(ist.svc.requests.length, 0, 'il caricamento non chiama il servizio');
  assert.deepEqual([...r.doc.querySelectorAll('.ist-steps li')].map(l => l.className), ['done', 'done', 'cur', '']);
});
test('U28 ISTAT: errori sulle righe giuste con riga, campo e motivo (CIPAT diverso blocca); avvisi distinti e non bloccanti; riga ricostruita da confermare', async () => {
  const r = await openIst(); const t = ISTF('movimenti.csv').split('\n'); t[4] = t[4].replace(IST_CIPAT, '022001-AT-999999'); t[6] = t[6].split(';').map((x, i) => i === 3 ? 'pg' : x).join(';'); t[8] = t[8].replace(/;\d+$/, ';0'); t[9] = t[9].replace(/;[^;]*$/, '');
  await istLoad(r, t.join('\n'), 'difettoso.csv'); await waitFor(() => r.doc.querySelector('[data-testid=ist-notready]'), 'errori');
  assert(/5 errori/.test(text(r.doc.querySelector('[data-testid=ist-summary]'))) && r.doc.querySelectorAll('tr.ist-row.bad').length === 4, 'quattro righe con problemi (la riga con 4 colonne ha due errori: colonne e CIPAT mancante)');
  const seg = text(r.doc.querySelector('[data-testid=ist-seg]')); assert(/Errore · riga 5 · CIPAT:.*diverso da quello della struttura/.test(seg) && /Errore · riga 7 · Provenienza:.*non è nell'elenco ufficiale/.test(seg) && /Errore · riga 9 · Numero di persone:/.test(seg) && /Errore · riga 10:.*4 colonne/.test(seg), seg);
  assert(cell(r, 4, 'cipat').classList.contains('bad') && cell(r, 6, 'sigla').classList.contains('bad') && cell(r, 8, 'persone').classList.contains('bad') && !cell(r, 0, 'cipat').classList.contains('bad'), 'solo i campi sbagliati sono evidenziati');
  assert(/1 errore/.test(text(r.doc.querySelector('[data-testid=ist-row-4]'))) && /ok/.test(text(r.doc.querySelector('[data-testid=ist-row-0]')))); assert(r.doc.querySelector('[data-testid=ist-check]').disabled, 'con errori il riepilogo e l\'invio sono bloccati');
  assert.equal(cell(r, 6, 'sigla').value, 'pg', 'la sigla minuscola non viene convertita da sola'); assert(/PG \(Perugia\)/.test(text(r.doc.querySelector('[data-testid=ist-row-6]').nextElementSibling)), 'suggerimento, non correzione');
  // riga ricostruita (4 colonne): serve la conferma a mano
  assert(r.doc.querySelector('[data-testid=ist-okrow-9]'), 'riga ricostruita: serve la conferma a mano'); assert.equal(cell(r, 9, 'cipat').value, IST_CIPAT); assert.equal(cell(r, 9, 'persone').value, '', 'riga con 4 colonne: le colonne restano al loro posto e manca l\'ultima'); assert.equal(cell(r, 9, 'arrivo').value.length, 8);
  r.doc.querySelector('[data-testid=ist-okrow-9]').click(); await waitFor(() => !r.doc.querySelector('[data-testid=ist-okrow-9]') && /Errore · riga 10 · Numero di persone:.*mancante/.test(text(r.doc.querySelector('[data-testid=ist-seg]'))), 'dopo la conferma resta solo l\'errore vero (persone mancanti)'); assert(!/4 colonne|ricostruita/.test(text(r.doc.querySelector('[data-testid=ist-seg]'))));
  // avvisi non bloccanti, distinti dagli errori: con la data di ottobre gli arrivi di agosto sono fuori periodo
  const w = await openIst({ now: '2026-10-05T10:00:00Z' }); await istLoad(w); await waitFor(() => r.doc.querySelector('[data-testid=ist-n-warn]') || w.doc.querySelector('[data-testid=ist-n-warn]'), 'avvisi');
  assert(/6 avvisi/.test(text(w.doc.querySelector('[data-testid=ist-n-warn]'))) && /nessun errore/.test(text(w.doc.querySelector('[data-testid=ist-n-err]'))), 'avvisi e errori sono distinti'); assert(/Avviso · riga 1 · Data di arrivo:.*fuori dal periodo/.test(text(w.doc.querySelector('[data-testid=ist-seg]'))));
  assert(w.doc.querySelector('[data-testid=ist-ready]') && !w.doc.querySelector('[data-testid=ist-check]').disabled, 'gli avvisi non bloccano'); assert(w.doc.querySelector('[data-testid=ist-row-0] .ist-in.warn'));
});
test('U29 ISTAT: ogni campo si modifica nella tabella, i controlli si rifanno da soli senza togliere il cursore; la provenienza si cerca nell\'elenco ufficiale senza conversioni automatiche', async () => {
  const r = await openIst(); await istLoad(r); await waitFor(() => r.doc.querySelector('[data-testid=ist-ready]'), 'pronto');
  let el = cell(r, 0, 'persone'); el.focus(); el.value = '0'; fire(el, 'input'); await waitFor(() => /1 errore/.test(text(r.doc.querySelector('[data-testid=ist-row-0]'))), 'errore dopo la modifica'); assert.strictEqual(r.doc.activeElement, el, 'il campo che si sta scrivendo resta lo stesso (tastiera e cursore non si perdono)'); assert(el.isConnected);
  assert(/Errore · riga 1 · Numero di persone/.test(text(r.doc.querySelector('[data-testid=ist-seg]'))) && /1 errore/.test(text(r.doc.querySelector('[data-testid=ist-summary]')))); assert(r.doc.querySelector('[data-testid=ist-check]').disabled);
  typeIn(r, 0, 'persone', '5'); await waitFor(() => /nessun errore/.test(text(r.doc.querySelector('[data-testid=ist-summary]'))) && /42 persone/.test(text(r.doc.querySelector('[data-testid=ist-summary]'))), 'riepilogo aggiornato (42 persone)');
  typeIn(r, 0, 'partenza', '20260813'); await waitFor(() => text(r.doc.querySelector('[data-testid=ist-row-0] .ist-notti')) === '5', 'notti ricalcolate'); assert(/13\/08\/2026/.test(text(r.doc.querySelector('[data-testid=ist-row-0]'))));
  typeIn(r, 0, 'arrivo', '20260814'); await waitFor(() => /Errore · riga 1 · Data di partenza:.*dopo l'arrivo/.test(text(r.doc.querySelector('[data-testid=ist-seg]'))), 'partenza non dopo l\'arrivo');
  typeIn(r, 0, 'arrivo', '20260808'); typeIn(r, 0, 'cipat', '022001-AT-111111'); await waitFor(() => /CIPAT:.*diverso/.test(text(r.doc.querySelector('[data-testid=ist-seg]'))), 'CIPAT diverso'); typeIn(r, 0, 'cipat', IST_CIPAT);
  typeIn(r, 0, 'sigla', 'FR'); await waitFor(() => /Frosinone/.test(text(r.doc.querySelector('[data-testid=ist-row-0] .ist-desc'))), 'FR = Frosinone'); assert.equal(cell(r, 0, 'sigla').value, 'FR');
  typeIn(r, 0, 'sigla', 'fr'); await waitFor(() => /FR \(Frosinone\)/.test(text(r.doc.querySelector('[data-testid=ist-seg]'))), 'minuscola: suggerimento'); assert.equal(cell(r, 0, 'sigla').value, 'fr', 'nessuna conversione automatica');
  r.doc.querySelector('[data-testid=ist-find-0]').click(); const q = await waitFor(() => r.doc.querySelector('#ist-q'), 'finestra di ricerca'); setv(q, 'germ'); const li = await waitFor(() => r.doc.querySelector('#ist-lb li[data-code="DEU"]'), 'risultati'); assert(/Germania|GERMANIA/i.test(text(li))); li.click();
  await waitFor(() => !r.doc.querySelector('[data-testid=ist-search]') && cell(r, 0, 'sigla').value === 'DEU' && /GERMANIA/i.test(text(r.doc.querySelector('[data-testid=ist-row-0] .ist-desc'))), 'sigla scelta dall\'elenco con descrizione'); await waitFor(() => r.doc.querySelector('[data-testid=ist-ready]'), 'di nuovo senza errori');
  r.doc.querySelector('[data-testid=ist-find-1]').click(); const q2 = await waitFor(() => r.doc.querySelector('#ist-q'), 'ricerca'); setv(q2, 'fr'); await waitFor(() => r.doc.querySelector('#ist-lb li[data-code="FR"]') && r.doc.querySelector('#ist-lb li[data-code="FRA"]'), 'FR e FRA sono voci distinte'); r.doc.querySelector('[data-testid=ist-search-cancel]').click(); assert(!r.doc.querySelector('[data-testid=ist-search]'), 'annulla chiude senza scegliere'); assert.equal(cell(r, 1, 'sigla').value, 'ESP');
  el = cell(r, 2, 'persone'); el.focus(); fire(el, 'input'); const ke = new r.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }); el.dispatchEvent(ke); assert.strictEqual(r.doc.activeElement, cell(r, 3, 'persone'), 'Invio passa alla riga sotto');
  assert.equal(adp === null || true, true); assert.equal(ist.svc.requests.length, 0, 'nessuna chiamata al servizio');
});
test('U30 ISTAT: aggiungo e elimino movimenti; la tabella e il riepilogo seguono i dati correnti; bozza solo in memoria', async () => {
  const r = await openIst(); await istLoad(r); await waitFor(() => r.doc.querySelector('[data-testid=ist-ready]'), 'pronto');
  r.doc.querySelector('[data-testid=ist-add2]').click(); await waitFor(() => nRows(r) === 21, 'riga aggiunta'); assert.equal(cell(r, 20, 'cipat').value, IST_CIPAT, 'CIPAT della struttura già inserito'); assert.strictEqual(r.doc.activeElement, cell(r, 20, 'arrivo'), 'il cursore è sulla data di arrivo');
  await waitFor(() => /5 errori|4 errori/.test(text(r.doc.querySelector('[data-testid=ist-summary]'))) && /Errore · riga 21 · Data di arrivo: Data di arrivo mancante|Errore · riga 21/.test(text(r.doc.querySelector('[data-testid=ist-seg]'))), 'riga vuota = errori sulla riga 21');
  typeIn(r, 20, 'arrivo', '20260926'); typeIn(r, 20, 'partenza', '20260929'); typeIn(r, 20, 'sigla', 'DEU'); typeIn(r, 20, 'persone', '4');
  await waitFor(() => /21 movimenti/.test(text(r.doc.querySelector('[data-testid=ist-summary]'))) && /44 persone/.test(text(r.doc.querySelector('[data-testid=ist-summary]'))) && /nessun errore/.test(text(r.doc.querySelector('[data-testid=ist-summary]'))), 'movimento aggiunto a mano valido: 21 movimenti, 44 persone');
  r.doc.querySelector('[data-testid=ist-del-0]').click(); assert.equal(nRows(r), 21, 'senza conferma non si elimina'); r.log.confirmAnswer = true; r.doc.querySelector('[data-testid=ist-del-0]').click();
  await waitFor(() => nRows(r) === 20 && /20 movimenti/.test(text(r.doc.querySelector('[data-testid=ist-summary]'))) && /41 persone/.test(text(r.doc.querySelector('[data-testid=ist-summary]'))), 'eliminato: 20 movimenti, 41 persone'); assert.equal(cell(r, 0, 'arrivo').value, '20260819', 'la prima riga è ora la seconda del file');
  r.doc.querySelector('[data-testid=ist-clear]').click(); await waitFor(() => !r.doc.querySelector('[data-testid=ist-table]'), 'tabella svuotata'); assert.equal(ist.svc.requests.length, 0);
  const o = await r.doc.querySelector('[data-testid=ist-origine]'); assert(/non viene salvata né sul sito né nel browser/.test(text(o))); assert(!/localStorage|sessionStorage/.test(fs.readFileSync(path.join(ROOT, 'js', 'istat.js'), 'utf8').replace(/\/\/.*$/gm, '')), 'nessun salvataggio nel browser');
});
test('U31 ISTAT: percorso completo — validazione finale, riepilogo, conferma, invio; nessuna trasmissione prima della conferma, una sola anche con doppio clic, tabella bloccata, stesso file rifiutato', async () => {
  const r = await openIst(); await istLoad(r); await waitFor(() => r.doc.querySelector('[data-testid=ist-ready]'), 'pronto'); assert(!r.doc.querySelector('[data-testid=ist-riepilogo]') && !r.doc.querySelector('[data-testid=ist-send]'), 'prima della validazione finale non c\'è il pulsante di invio');
  await istCheck(r); const rs = text(r.doc.querySelector('[data-testid=ist-riepilogo]')); assert(/Movimenti 20/.test(rs) && /Persone in totale 40/.test(rs) && /CIPAT 022001-AT-012345/.test(rs) && /dal 08\/08\/2026 al 25\/09\/2026/.test(rs) && /Avvisi 0/.test(rs) && /valida fino alle/.test(rs), rs);
  assert.equal(ist.svc.count('upload'), 0, 'il riepilogo non trasmette nulla'); const send = () => r.doc.querySelector('[data-testid=ist-send]'), conf = () => r.doc.querySelector('[data-testid=ist-confirm]');
  assert(/Conferma e invia all'ISTAT/.test(text(send())) && send().disabled, 'senza conferma il pulsante è spento'); send().click(); await sleep(60); assert.equal(ist.svc.count('upload'), 0, 'clic su un pulsante spento: nessuna trasmissione');
  conf().checked = true; fire(conf(), 'change'); await waitFor(() => !send().disabled, 'invio abilitato dopo la conferma'); const btn = send(); btn.click(); btn.click();      // doppio clic
  await waitFor(() => istRes(r, 'inviato'), 'inviato'); assert.equal(ist.svc.count('upload'), 1, 'una sola trasmissione'); const q = ist.svc.requests[0];
  assert.deepEqual([q.method, q.url, q.headers.username, q.headers.password, q.headers['content-type']], ['POST', 'https://statweb.provincia.tn.it/istatAlloggi/upload.aspx?ws', 'ws-user', 'ws-pass', 'application/json']); assert.deepEqual(JSON.parse(q.raw), require('../../api/_istat.js').toServiceBody(require('../../api/_istat.js').parseText(ISTF('movimenti.csv')).rows), 'trasmessi esattamente i movimenti confermati'); assert.deepEqual(ist.svc.protocolErrors, []);
  const res = text(istRes(r, 'inviato')); assert(/Inviato: il servizio ha acquisito 20 movimenti su 20/.test(res) && /20\/20 movimenti caricati/.test(res), res); assert(/20\/20 movimenti caricati/.test(text(r.doc.querySelector('[data-testid=ist-info]'))), 'esito realmente restituito dal servizio');
  assert(!r.doc.querySelector('[data-testid=ist-send]') && !r.doc.querySelector('[data-testid=ist-del-0]') && !r.doc.querySelector('[data-testid=ist-add]:not([disabled])') && cell(r, 0, 'persone').readOnly, 'tabella bloccata dopo l\'invio'); assert.equal(r.doc.querySelectorAll('.ist-steps li.done').length, 4);
  r.doc.querySelector('[data-testid=ist-res-newlist]').click(); await waitFor(() => !r.doc.querySelector('[data-testid=ist-table]'), 'nuovo elenco vuoto');
  await istLoad(r); await waitFor(() => /già acquisito dal servizio/.test(text(r.doc.querySelector('[data-testid=ist-row-0]').nextElementSibling || r.doc.body)), 'movimenti già acquisiti'); assert(r.doc.querySelector('[data-testid=ist-notready]') && r.doc.querySelector('[data-testid=ist-check]').disabled, 'lo stesso file non si può rimandare'); assert.equal(ist.svc.count('upload'), 1);
});
test('U32 ISTAT: modificare un dato dopo il riepilogo annulla la conferma; una conferma scaduta non si può usare', async () => {
  const r = await openIst(); await istLoad(r); await istCheck(r); assert(r.doc.querySelector('[data-testid=ist-send]'));
  const tot = 40 - +require('../../api/_istat.js').parseText(ISTF('movimenti.csv')).rows[3].persone + 9; typeIn(r, 3, 'persone', '9'); await waitFor(() => !r.doc.querySelector('[data-testid=ist-riepilogo]') && !r.doc.querySelector('[data-testid=ist-send]'), 'riepilogo e conferma annullati'); await waitFor(() => r.doc.querySelector('[data-testid=ist-ready]') && new RegExp(tot + ' persone').test(text(r.doc.querySelector('[data-testid=ist-summary]'))), 'ricontrollato');
  await istCheck(r); assert(new RegExp('Persone in totale ' + tot).test(text(r.doc.querySelector('[data-testid=ist-riepilogo]'))), 'il riepilogo riflette i dati modificati'); const c = r.doc.querySelector('[data-testid=ist-confirm]'); c.checked = true; fire(c, 'change'); await waitFor(() => { const b = r.doc.querySelector('[data-testid=ist-send]'); return b && !b.disabled; }, 'invio abilitato');
  clock.advance(21 * MIN); r.doc.querySelector('[data-testid=ist-send]').click(); await waitFor(() => /scaduta/.test(text(r.doc.querySelector('[data-testid=ist-msg]'))), 'conferma scaduta'); assert(!r.doc.querySelector('[data-testid=ist-send]'), 'serve un nuovo riepilogo'); assert.equal(ist.svc.count('upload'), 0); assert(!r.log.calls.some(x => x.a === 'is_send'), 'il server non è stato nemmeno interpellato');
});
test('U33 ISTAT: esito parziale (testo del servizio mostrato com\'è), rifiutato, e verifica con l\'elenco sul portale', async () => {
  let r = await openIst({ svcOpts: { rowCheck: (x, i) => i === 3 ? 'provenienza incorretta ' + x.CIPAT + '(' + x.siglaProvenienza + ')' : null } }); await istLoad(r); await istSend(r); await waitFor(() => istRes(r, 'parziale'), 'parziale');
  const res = text(istRes(r, 'parziale')); assert(/Invio parziale: acquisiti 19 movimenti su 20/.test(res) && /19\/20 movimenti caricati – provenienza incorretta 022001-AT-012345\(/.test(text(r.doc.querySelector('[data-testid=ist-info]'))) && /NON rinviare l'intero elenco/.test(res), res);
  assert(!istRes(r, 'inviato') && !r.doc.querySelector('[data-testid=ist-send]') && cell(r, 0, 'persone').readOnly, 'mai "inviato" per un esito parziale; tabella bloccata'); assert.equal(ist.svc.count('upload'), 1);
  r.doc.querySelector('[data-testid=ist-res-list]').click(); const l = await waitFor(() => r.doc.querySelector('[data-testid=ist-result] [data-testid=ist-list]'), 'elenco'); assert(/19 element/.test(text(l)) && /"siglaProvenienza":"PG"/.test(text(l)), text(l)); assert.equal(ist.svc.count('list'), 1);
  r = await openIst({ svcOpts: { rowCheck: () => 'respinto di prova' } }); await istLoad(r); await istSend(r); await waitFor(() => istRes(r, 'rifiutato'), 'rifiutato');
  assert(/Nessun movimento acquisito/.test(text(istRes(r, 'rifiutato'))) && /0\/20 movimenti caricati – respinto di prova/.test(text(r.doc.querySelector('[data-testid=ist-info]'))), 'motivo del servizio'); assert(cell(r, 0, 'persone') && !cell(r, 0, 'persone').readOnly, 'dopo un rifiuto totale la tabella resta modificabile'); r.doc.querySelector('[data-testid=ist-res-dismiss]').click(); assert(!r.doc.querySelector('[data-testid=ist-result]'));
});
test('U34 ISTAT: esito incerto (il servizio non risponde): istruzioni chiare, nessun ritentativo, tabella bloccata finché non si sceglie; l\'elenco sul portale dice cosa è arrivato', async () => {
  const r = await openIst({ svcOpts: { modo: { upload: 'dopo-abort' } } }); await istLoad(r); await istSend(r); await waitFor(() => istRes(r, 'esito_incerto'), 'esito incerto');
  const res = text(istRes(r, 'esito_incerto')); assert(/NON inviare di nuovo/.test(res) && /Elenco movimenti sul portale/.test(res), res); assert.equal(ist.svc.count('upload'), 1, 'nessun ritentativo'); assert(!r.doc.querySelector('[data-testid=ist-send]') && cell(r, 0, 'persone').readOnly, 'niente pulsante di invio, tabella bloccata');
  r.doc.querySelector('[data-testid=ist-res-list]').click(); const l = await waitFor(() => r.doc.querySelector('[data-testid=ist-result] [data-testid=ist-list]'), 'elenco'); assert(/20 element/.test(text(l)), 'il servizio aveva già acquisito i movimenti: l\'elenco lo mostra');
  r.doc.querySelector('[data-testid=ist-res-unlock]').click(); assert.equal(r.log.confirms.length, 1); assert(/NON risultano caricati/.test(r.log.confirms[0])); assert(istRes(r, 'esito_incerto'), 'senza conferma resta bloccato');
  r.log.confirmAnswer = true; r.doc.querySelector('[data-testid=ist-res-unlock]').click(); await waitFor(() => !r.doc.querySelector('[data-testid=ist-result]'), 'sbloccata'); assert(!cell(r, 0, 'persone').readOnly && /Ripeti il controllo/.test(text(r.doc.querySelector('[data-testid=ist-msg]')))); assert(!r.doc.querySelector('[data-testid=ist-send]'), 'serve un nuovo riepilogo'); assert.equal(ist.svc.count('upload'), 1);
});
test('U35 ISTAT: 504, risposta non JSON, rete caduta durante l\'invio = esito incerto (mai "non inviato"); un rifiuto chiaro è un errore normale; credenziali rifiutate non trasmettono nulla', async () => {
  let r = await openIst(); await istLoad(r); ist.forceSend = { status: 504, text: '<html>Gateway Timeout</html>' }; await istSend(r); await waitFor(() => istRes(r, 'esito_incerto'), 'incerto per 504'); assert(/NON inviare di nuovo/.test(text(istRes(r, 'esito_incerto')))); assert(!r.doc.querySelector('[data-testid=ist-send]'));
  r = await openIst(); await istLoad(r); ist.forceSend = { status: 500, text: JSON.stringify({ err: 'Errore interno: nessun dato è stato conservato' }) }; await istSend(r); await waitFor(() => istRes(r, 'esito_incerto'), 'incerto per 500 senza stato');
  r = await openIst(); await istLoad(r); ist.forceSend = { status: 200, text: '{}' }; await istSend(r); await waitFor(() => istRes(r, 'esito_incerto'), 'incerto per risposta sconosciuta');
  r = await openIst(); await istLoad(r); ist.forceSend = { throw: true }; await istSend(r); await waitFor(() => istRes(r, 'esito_incerto'), 'incerto per rete caduta');
  r = await openIst(); await istLoad(r); ist.forceSend = { status: 400, text: JSON.stringify({ err: 'Richiesta rifiutata dal server di prova' }) }; await istSend(r); await waitFor(() => istRes(r, 'errore'), 'errore'); assert(/Richiesta rifiutata dal server di prova/.test(text(istRes(r, 'errore')))); assert(!cell(r, 0, 'persone').readOnly, 'con un rifiuto chiaro la tabella resta modificabile'); r.doc.querySelector('[data-testid=ist-res-dismiss]').click(); assert(!r.doc.querySelector('[data-testid=ist-result]'));
  r = await openIst({ env: { ISTAT_WS_PASSWORD: 'sbagliata' } }); await istLoad(r); await istSend(r); await waitFor(() => istRes(r, 'credenziali_non_valide'), 'credenziali'); const cr = text(istRes(r, 'credenziali_non_valide')); assert(/Credenziali non accettate/.test(cr) && /Non è stato trasmesso nulla/.test(cr) && !/sbagliata/.test(r.doc.documentElement.outerHTML), cr); assert(!cell(r, 0, 'persone').readOnly);
});
test('U36 ISTAT: invio reale disattivato (preview) o credenziali mancanti: il riepilogo funziona, l\'invio resta spento e spiegato', async () => {
  let r = await openIst({ env: { VERCEL_ENV: 'preview' } }); await istLoad(r); await istCheck(r); const off = text(r.doc.querySelector('[data-testid=ist-send-off]')); assert(/Invio reale disattivato/.test(off) && /preview/.test(off), off);
  assert(r.doc.querySelector('[data-testid=ist-confirm]').disabled && r.doc.querySelector('[data-testid=ist-send]').disabled); r.doc.querySelector('[data-testid=ist-send]').click(); await sleep(60); assert.equal(ist.svc.count('upload'), 0);
  r = await openIst({ env: { ISTAT_WS_USER: '' } }, false); await waitFor(() => /Configurazione incompleta/.test(text(r.doc.querySelector('[data-testid=ist-status]'))), 'stato'); await istLoad(r); await istCheck(r); assert(/Mancano le credenziali del servizio ISTAT \(ISTAT_WS_USER\)/.test(text(r.doc.querySelector('[data-testid=ist-cred-off]')))); assert(r.doc.querySelector('[data-testid=ist-send]').disabled && ist.svc.count('upload') === 0);
  r = await openIst({ env: { ISTAT_CIPAT: '' } }, false); await waitFor(() => /Configurazione incompleta/.test(text(r.doc.querySelector('[data-testid=ist-status]'))), 'stato'); await istLoad(r); await waitFor(() => r.doc.querySelector('[data-testid=ist-notready]'), 'errore'); assert(/CIPAT della struttura non è configurato/.test(text(r.doc.querySelector('[data-testid=ist-seg]'))) && r.doc.querySelector('[data-testid=ist-check]').disabled, 'senza CIPAT configurato non si procede');
});
test('U37 ISTAT: sessione scaduta → si torna al login senza perdere la tabella; passando da una scheda all\'altra i dati restano; ciò che si scrive non diventa mai HTML', async () => {
  const r = await openIst(); await istLoad(r); const evil = '<img src=x onerror="window.__xss=1">'; typeIn(r, 0, 'cipat', evil); await waitFor(() => /CIPAT/.test(text(r.doc.querySelector('[data-testid=ist-seg]'))) && r.doc.querySelector('[data-testid=ist-row-0] .ist-in.bad'), 'errore sul CIPAT');
  assert(!r.doc.querySelector('[data-testid=ist-table] img, [data-testid=ist-seg] img, script'), 'nessun elemento creato dal testo'); assert.equal(r.w.__xss, undefined); assert.equal(cell(r, 0, 'cipat').value, evil, 'nel campo il valore è identico'); typeIn(r, 0, 'cipat', IST_CIPAT);
  // il testo scritto finisce anche nei messaggi del server (che lo riportano) e negli attributi quando la tabella viene ridisegnata: mai come HTML
  const ev2 = '"><script>window.__xss=2</script><u>', ev3 = '<i onmouseover="window.__xss=3">x</i>'; typeIn(r, 1, 'arrivo', ev2); typeIn(r, 1, 'sigla', ev3); typeIn(r, 1, 'persone', evil);
  await waitFor(() => /Errore · riga 2 · Data di arrivo/.test(text(r.doc.querySelector('[data-testid=ist-seg]'))), 'errori sulla riga 2'); const seg = r.doc.querySelector('[data-testid=ist-seg]'), tr = r.doc.querySelector('[data-testid=ist-row-1]');
  assert(!r.doc.querySelector('[data-testid=ist-table] img, [data-testid=ist-table] u, [data-testid=ist-table] i, [data-testid=ist-seg] u, [data-testid=ist-seg] i, [data-testid=ist-seg] img, script'), 'messaggi e segnalazioni: nessun elemento creato dal testo');
  assert(/<script>|<i onmouseover|<img src=x/.test(text(seg) + text(tr.nextElementSibling)), 'il testo compare così com\'è nelle segnalazioni');
  r.doc.querySelector('[data-testid=ist-add2]').click(); await waitFor(() => nRows(r) === 21, 'riga aggiunta: la tabella viene ridisegnata');
  assert.deepEqual([cell(r, 1, 'arrivo').value, cell(r, 1, 'sigla').value, cell(r, 1, 'persone').value], [ev2, ev3, evil], 'dopo il ridisegno i valori sono identici (attributi protetti)'); assert(!r.doc.querySelector('[data-testid=ist-table] img, [data-testid=ist-table] u, [data-testid=ist-table] i, script'), 'nessun elemento creato nell\'attributo value'); assert.equal(r.w.__xss, undefined);
  r.log.confirmAnswer = true; r.doc.querySelector('[data-testid=ist-del-20]').click(); await waitFor(() => nRows(r) === 20, 'riga di prova eliminata'); typeIn(r, 1, 'arrivo', '20260819'); typeIn(r, 1, 'sigla', 'ESP'); typeIn(r, 1, 'persone', '3');
  await waitFor(() => r.doc.querySelector('[data-testid=ist-ready]'), 'a posto'); await goto(r, '#adempimenti', '[data-testid=adp-root] [data-testid=adp-head]'); assert(!r.doc.querySelector('[data-testid=ist-table]'), 'scheda Alloggiati Web'); await goto(r, '#adempimenti/istat', '[data-testid=ist-table]'); assert.equal(nRows(r), 20, 'la tabella ISTAT è ancora lì');
  clock.advance(9 * 60 * MIN); r.doc.querySelector('[data-testid=ist-check]').click(); await waitFor(() => r.doc.querySelector('[data-testid=admin-login-form]'), 'login'); assert(!r.doc.querySelector('[data-testid=ist-table]'));
  r.doc.querySelector('#au').value = 'admin'; r.doc.querySelector('#ap').value = 'pw'; r.doc.querySelector('#l').requestSubmit(); await waitFor(() => nRows(r) === 20, 'tabella ancora presente'); assert.equal(ist.svc.count('upload'), 0, 'nessuna trasmissione con la sessione scaduta');
});
test('U38 ISTAT: la scheda ISTAT non cambia Alloggiati Web e viceversa (stato separato)', async () => {
  const r = await openIst(); await istLoad(r); await goto(r, '#adempimenti', '[data-testid=adp-head]'); adp = makeAdp(); r.w.location.hash = '#adempimenti'; await sleep(40);
  assert(r.doc.querySelector('[data-testid=adp-tab-alloggiati]').classList.contains('on') && !r.doc.querySelector('[data-testid=adp-tab-istat]').classList.contains('on')); assert(r.doc.querySelector('[data-testid=adp-origine]'), 'compare la scheda Alloggiati Web'); assert(!r.doc.querySelector('[data-testid=ist-origine]'));
  await goto(r, '#adempimenti/istat', '[data-testid=ist-table]'); assert.equal(nRows(r), 20); assert(r.doc.querySelector('[data-testid=adp-tab-istat]').classList.contains('on'));
});

/* ===================== esecuzione ===================== */
(async () => {
  const only = process.argv[2]; let pass = 0, fail = 0; const t0 = process.hrtime.bigint();
  for (const [name, fn] of tests) {
    if (only && !only.split(',').some(f => name.startsWith(f))) continue;      // più filtri separati da virgola, es. U26,U27
    pageErrors.length = 0;
    try { await fn(); await sleep(40); if (pageErrors.length) throw pageError(); pass++; console.log('  ✔ ' + name); }
    catch (e) { fail++; console.log('  ✘ ' + name + '\n      → ' + String(e && e.stack || e).split('\n').slice(0, only ? 14 : 4).join('\n        ')); }
  }
  console.log('\n' + pass + ' ok, ' + fail + ' falliti  (' + (Number(process.hrtime.bigint() - t0) / 1e9).toFixed(1) + ' s)');
  process.exit(fail ? 1 : 0);
})();
