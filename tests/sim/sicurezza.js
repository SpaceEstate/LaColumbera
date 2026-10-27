'use strict';
// La Columbera · prove di SICUREZZA DEGLI ACCESSI (area clienti, Guest Card, annullo pagamento, login, checkout).
// Stesso banco di prova di scenarios.js: codice REALE di Vercel, Redis finto, Stripe e SMTP finti, nessuna rete. Dati di fantasia.
//
//   cd <repo> && node tests/sim/sicurezza.js [filtro]      (serve wasmoon, come per scenarios.js)
const assert = require('assert'), fs = require('fs'), path = require('path'), H = require('./harness'), { clock, kv, MIN } = H;
const ROOT = path.resolve(__dirname, '..', '..');
const T = '"La Columbera - Torre, Appartamento con 2 camere da letto"', C = '"La Columbera - Corte, Appartamento con 1 camere da letto"', HDR = ['Numero Prenotazione', 'Data Check-in', 'Appartamento', 'Numero Ospiti', 'Numero Notti'];
const eq = (a, b, m) => assert.deepStrictEqual(a, b, m);

async function base() {
  const rows = [HDR, ['HMSEDESZCW', H.romeMidnight(2026, 10, 5), C, 2, 6], [6877180932, '02/10/2026', T, 4, 2]];
  const env = await H.newEnv({ legacyRows: rows, env: { ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw-di-prova', ICAL_PERSONAL_KEY: 'chiave-ical-di-prova' } });
  H.setFeed('bookingTorre', [H.bookingEv('b1', '2026-10-02', '2026-10-04')]);
  H.setFeed('airbnbCorte', [H.airbnbEv('a1', '2026-10-05', '2026-10-11', 'HMSEDESZCW')]);
  await H.runGas(env.gas, 'setup'); await H.runGas(env.gas, 'migraRegistro');
  await H.sync();
  // registro (foglio): se lo stub dello script non lo popola, si scrive la stessa istantanea che produrrebbe la sincronizzazione
  const snap = JSON.parse(kv.exec(['GET', 'reg:snap']) || '{"rows":[]}');
  if (!(snap.rows || []).some(r => r.codice === 'HMSEDESZCW')) {
    const riga = (fonte, codice, apt, checkin, checkout, notti, ospiti) => ({ id: fonte + '|' + codice, fonte, codice, apt, checkin, checkout, notti, ospiti, stato: 'CONFERMATA', uid: '', motivo: '', creata: '', aggiornata: '', ultimoSeen: '', annullata: '', note: '', flags: [] });
    snap.rows = [riga('AIRBNB', 'HMSEDESZCW', 'corte', '2026-10-05', '2026-10-11', 6, 2), riga('BOOKING', '6877180932', 'torre', '2026-10-02', '2026-10-04', 2, 4)];
    kv.exec(['SET', 'reg:snap', JSON.stringify(Object.assign({ invalid: [], count: 2, lastAttempt: clock.iso(), lastSuccess: clock.iso(), status: 'OK' }, snap))]);
  }
  return env;
}
let ipN = 0;
const ip = () => '198.51.100.' + (++ipN % 250);           // un IP diverso per ogni "utente" (indirizzi di documentazione)
const as = addr => ({ headers: { 'x-real-ip': addr } });
const checkout = (o, addr) => H.api('checkout', Object.assign({ id: 'torre', da: '2026-12-10', a: '2026-12-13', ospiti: 2, nome: 'Mario Prova', email: 'mario.prova@esempio.it', tel: '+39 000 0000000' }, o), as(addr || ip()));
async function confermata(o) {        // prenotazione del sito pagata e confermata; ritorna { code, t } (token del checkout)
  const c = await checkout(o); eq(c.status, 200, JSON.stringify(c.body));
  await H.webhook('checkout.session.completed', H.paidSession(c.body.code));
  return c.body;
}
// cattura i log del server durante fn
async function logs(fn) {
  const out = [], o = {}; for (const k of ['log', 'warn', 'error', 'info']) { o[k] = console[k]; console[k] = (...a) => out.push(a.map(String).join(' ')); }
  try { await fn(); } finally { Object.assign(console, o); }
  return out.join('\n');
}

const tests = [], test = (n, f) => tests.push({ n, f });

test('S1  accesso autorizzato: il token del checkout e quello della mail aprono area clienti e Guest Card', async () => {
  await base();
  const c = await confermata();
  assert(/^[A-Za-z0-9_-]{22}$/.test(c.t), 'token di 128 bit (base64url) nella risposta del checkout');
  let r = await H.api('mie', { code: c.code, t: c.t }, as(ip()));
  eq(r.status, 200); eq(r.body.prenotazioni[0].code, c.code);
  r = await H.api('gc_check', { code: c.code.toLowerCase(), t: c.t }, as(ip()));
  eq(r.status, 200, 'codice in minuscolo accettato'); eq(r.body.booking.needsEmail, false);
  const mail = global.__mails.find(m => m.to === 'mario.prova@esempio.it');
  const m = /area-clienti\.html#c=([A-Z0-9]+)&t=([A-Za-z0-9_-]+)/.exec(mail.text);
  assert(m && m[1] === c.code, 'la mail contiene il link con codice e token nel frammento "#"');
  assert(!/area-clienti\.html\?code=/.test(mail.text + mail.html), 'nessun link con il codice in query');
  eq((await H.api('mie', { code: c.code, t: m[2] }, as(ip()))).status, 200, 'il token della mail funziona');
});

test('S2  il codice da solo non basta: senza token né data → rifiutato, sempre con la stessa risposta', async () => {
  await base();
  const c = await confermata();
  const risposte = [];
  for (const a of ['mie', 'gc_check', 'gc_issue']) {
    const r = await H.api(a, { code: c.code }, as(ip())); eq(r.status, 404, a); risposte.push(r.body);
  }
  const inesistente = await H.api('mie', { code: 'ZZZZZZ' }, as(ip()));
  eq(inesistente.status, 404); eq(inesistente.body, risposte[0], 'codice esistente e inesistente: stessa risposta (niente enumerazione)');
  eq(new Set(risposte.map(x => JSON.stringify(x))).size, 1);
});

test('S3  token manomesso, di un\'altra prenotazione o scaduto → rifiutato', async () => {
  await base();
  const a = await confermata(), b = await confermata({ da: '2026-12-20', a: '2026-12-23', email: 'altra@esempio.it' });
  const flip = a.t.slice(0, -1) + (a.t.slice(-1) === 'A' ? 'B' : 'A');
  eq((await H.api('mie', { code: a.code, t: flip }, as(ip()))).status, 404, 'token manomesso');
  eq((await H.api('mie', { code: a.code, t: b.t }, as(ip()))).status, 404, 'token valido ma di un\'altra prenotazione');
  eq((await H.api('gc_check', { code: b.code, t: a.t }, as(ip()))).status, 404);
  eq((await H.api('mie', { code: a.code, t: '<script>' }, as(ip()))).status, 404, 'formato non valido');
  clock.advance((90 + 31) * 24 * 60 * MIN); await H.sync();
  eq((await H.api('mie', { code: a.code, t: a.t }, as(ip()))).status, 404, 'scaduto (30 giorni dopo il check-out)');
});

test('S4  senza token: codice + data di arrivo + email (sito) oppure codice + data (Booking/Airbnb); rilascia un token di sessione', async () => {
  await base();
  const c = await confermata();
  let r = await H.api('mie', { code: c.code, da: '2026-12-10', email: 'MARIO.PROVA@esempio.it ' }, as(ip()));
  eq(r.status, 200, 'email senza differenze di maiuscole/spazi'); assert(/^[A-Za-z0-9_-]{22}$/.test(r.body.t), 'token di sessione');
  eq((await H.api('gc_check', { code: c.code, t: r.body.t }, as(ip()))).status, 200, 'il token di sessione vale per la Guest Card');
  eq((await H.api('mie', { code: c.code, da: '2026-12-10', email: 'altro@esempio.it' }, as(ip()))).status, 404, 'email sbagliata');
  eq((await H.api('mie', { code: c.code, da: '2026-12-10' }, as(ip()))).status, 404, 'prenotazione del sito: l\'email serve');
  eq((await H.api('mie', { code: c.code, da: '2026-12-11', email: 'mario.prova@esempio.it' }, as(ip()))).status, 404, 'data sbagliata');
  r = await H.api('gc_check', { code: 'hmsedeszcw', da: '2026-10-05' }, as(ip()));
  eq(r.status, 200, 'prenotazione Airbnb dal foglio: codice + data'); eq(r.body.booking.needsEmail, true);
  eq((await H.api('gc_check', { code: 'HMSEDESZCW', da: '2026-10-06' }, as(ip()))).status, 404);
  clock.advance(14 * 24 * 60 * MIN); await H.sync();
  eq((await H.api('gc_check', { code: 'HMSEDESZCW', da: '2026-10-05' }, as(ip()))).status, 404, 'soggiorno concluso da più di 7 giorni: niente accesso senza token');
});

test('S5  tentativi ripetuti: limitati per IP e per codice; l\'utente legittimo non resta bloccato', async () => {
  await base();
  const c = await confermata(), att = ip();
  for (let i = 0; i < 10; i++) eq((await H.api('mie', { code: 'AAAA' + i, da: '2026-12-10', email: 'x@esempio.it' }, as(att))).status, 404);
  let r = await H.api('mie', { code: c.code, t: c.t }, as(att));
  eq(r.status, 429, 'dopo 10 errori lo stesso IP si ferma (anche con dati giusti)'); assert(+r.headers['retry-after'] > 0, 'Retry-After');
  eq((await H.api('mie', { code: c.code, t: c.t }, as(ip()))).status, 200, 'un altro IP (l\'ospite vero) continua a entrare');
  // tentativi distribuiti su più IP contro lo STESSO codice (indovinare la data): dopo 10 il codice si blocca per il solo accesso senza token
  for (let i = 0; i < 10; i++) eq((await H.api('mie', { code: c.code, da: '2026-11-0' + (i % 9 + 1), email: 'mario.prova@esempio.it' }, as(ip()))).status, 404);
  eq((await H.api('mie', { code: c.code, da: '2026-12-10', email: 'mario.prova@esempio.it' }, as(ip()))).status, 429, 'codice bloccato per l\'accesso senza token');
  eq((await H.api('mie', { code: c.code, t: c.t }, as(ip()))).status, 200, 'con il link (token) l\'ospite entra comunque');
  clock.advance(16 * MIN);
  eq((await H.api('mie', { code: c.code, t: c.t }, as(att))).status, 200, 'trascorsa la finestra l\'IP torna libero');
  // consultazioni lecite ripetute: 60 ogni 10 minuti per IP
  const u = ip(); for (let i = 0; i < 60; i++) eq((await H.api('mie', { code: c.code, t: c.t }, as(u))).status, 200);
  eq((await H.api('mie', { code: c.code, t: c.t }, as(u))).status, 429, 'oltre 60 consultazioni in 10 minuti');
});

test('S6  risposte minime: nessun nome, email completa, telefono o risposta grezza della Guest Card', async () => {
  await base();
  const c = await confermata();
  kv.exec(['SET', 'gc:' + c.code, JSON.stringify({ gc_id: 'QR-FINTO', stato: 'richiesta_inviata', valid_from: '2026-12-10', valid_to: '2026-12-13', ospiti: 2, email: 'mario.prova@esempio.it', creato: clock.iso(), raw: { segreto: 'dato-interno' } })]);
  const m = await H.api('mie', { code: c.code, t: c.t }, as(ip()));
  eq(Object.keys(m.body.prenotazioni[0]).sort(), ['a', 'code', 'da', 'id', 'notti', 'ospiti', 'stato']);
  const g = await H.api('gc_check', { code: c.code, t: c.t }, as(ip())), s = JSON.stringify(g.body);
  assert(!/Mario|Prova|mario\.prova|0000000|dato-interno/.test(s), 'niente dati personali o interni: ' + s);
  eq(g.body.card.email, 'ma***@esempio.it'); eq(g.body.card.gc_id, 'QR-FINTO');
  const i = await H.api('gc_issue', { code: c.code, t: c.t }, as(ip()));
  eq(i.status, 200); assert(!/raw|dato-interno|mario\.prova/.test(JSON.stringify(i.body)));
  const pub = await H.api('cfg', {}, { method: 'GET' });
  assert(!/ical\.booking|mario/.test(JSON.stringify(pub.body)), 'configurazione pubblica senza URL iCal né dati ospiti');
});

test('S7  log: niente token, email, nomi o telefoni (anche negli errori); errori generici verso il client', async () => {
  await base();
  let c, tok;
  const out = await logs(async () => {
    c = await confermata();
    tok = (await H.api('mie', { code: c.code, da: '2026-12-10', email: 'mario.prova@esempio.it' }, as(ip()))).body.t;
    await H.api('mie', { code: c.code, t: 'manomesso' + c.t }, as(ip()));
    global.__stripeFail = true;
    const e = await checkout({ da: '2027-01-10', a: '2027-01-13' });
    eq(e.status, 500); assert(!/stripe giù/.test(JSON.stringify(e.body)), 'il messaggio interno non arriva al client');
    global.__stripeFail = false;
  });
  for (const s of [c.t, tok, 'mario.prova@esempio.it', 'Mario Prova', '0000000']) assert(!out.includes(s), 'nei log non deve comparire: ' + s);
});

test('S8  annullo del pagamento: senza il token del checkout non libera le notti di nessuno', async () => {
  await base();
  const c = await checkout(); eq(c.status, 200);
  const held = () => kv.exec(['HGETALL', 'holds:torre']).length > 0;
  assert(held());
  eq((await H.api('checkout_cancel', { code: c.body.code }, as(ip()))).body, { ok: 1 }); assert(held(), 'senza token: nulla cambia');
  await H.api('checkout_cancel', { code: c.body.code, t: 'x'.repeat(22) }, as(ip())); assert(held(), 'token falso: nulla cambia');
  await H.api('checkout_cancel', { code: c.body.code, t: c.body.t }, as(ip())); assert(!held(), 'con il token del checkout: notti liberate');
});

test('S9  login amministratore: 10 tentativi falliti per IP, poi pausa; gli altri IP no', async () => {
  await base();
  const a = ip();
  for (let i = 0; i < 10; i++) eq((await H.api('login', { u: 'admin', p: 'sbagliata' + i }, as(a))).status, 401);
  eq((await H.api('login', { u: 'admin', p: 'pw-di-prova' }, as(a))).status, 429, 'IP in pausa anche con la password giusta');
  const ok = await H.api('login', { u: 'admin', p: 'pw-di-prova' }, as(ip()));
  eq(ok.status, 200); assert(ok.body.t);
  clock.advance(16 * MIN);
  eq((await H.api('login', { u: 'admin', p: 'pw-di-prova' }, as(a))).status, 200, 'finita la pausa');
});

test('S10 checkout: al massimo 10 avvii di pagamento ogni 30 minuti per IP (gli hold non si possono accumulare da un solo IP)', async () => {
  await base();
  const a = ip();
  for (let i = 0; i < 10; i++) { const r = await checkout({ da: '2027-02-' + String(1 + i * 2).padStart(2, '0'), a: '2027-02-' + String(3 + i * 2).padStart(2, '0') }, a); eq(r.status, 200, JSON.stringify(r.body)); }
  eq((await checkout({ da: '2027-03-01', a: '2027-03-04' }, a)).status, 429);
  eq((await checkout({ da: '2027-03-01', a: '2027-03-04' }, ip())).status, 200, 'un altro utente prenota normalmente');
});

test('S11 ingressi: corpo troppo grande, tipi sbagliati, email non valida → rifiutati senza effetti', async () => {
  await base();
  eq((await H.api('mie', { code: 'X', pad: 'x'.repeat(25000) }, as(ip()))).status, 413);
  eq((await checkout({ nome: { $gt: '' } })).status, 400);
  eq((await checkout({ email: 'non-una-email' })).status, 400);
  eq((await checkout({ email: ['a@b.it'] })).status, 400);
  eq((await H.api('gc_check', { code: ['A'], t: { x: 1 } }, as(ip()))).status, 404);
  eq(kv.exec(['HGETALL', 'bkh']).length, 0, 'nessuna prenotazione creata');
});

test('S12 webhook Stripe: firma obbligatoria, risposta generica; consegne doppie non duplicano mail', async () => {
  await base();
  const c = await checkout(); const raw = JSON.stringify({ id: 'evt_x', type: 'checkout.session.completed', data: { object: H.paidSession(c.body.code) } });
  const V = H.V();
  const mk = (sig) => new Promise(res => { const out = { status: 200 }; const { Readable } = require('stream'); const req = Readable.from([Buffer.from(raw)]); Object.assign(req, { method: 'POST', headers: { 'stripe-signature': sig, host: 'www.lacolumbera.test' } });
    const r = { status(s) { out.status = s; return r; }, send(b) { out.body = b; res(out); return r; }, json(b) { out.body = b; res(out); return r; }, end() { res(out); return r; }, setHeader() {} }; V.webhook(req, r); });
  const bad = await mk('firma-falsa'); eq(bad.status, 400); assert(!/firma non valida/.test(String(bad.body).replace('Webhook Error: firma non valida', '')), 'risposta generica');
  eq(JSON.parse(kv.exec(['HGET', 'bkh', c.body.code])).stato, 'in_attesa', 'nessuna conferma senza firma');
  await H.webhook('checkout.session.completed', H.paidSession(c.body.code)); await H.webhook('checkout.session.completed', H.paidSession(c.body.code));
  eq(global.__mails.filter(m => m.to === 'mario.prova@esempio.it').length, 1, 'una sola mail all\'ospite');
});

test('S13 token conservati solo come hash, con scadenza; calendario personale con chiave sbagliata → 403', async () => {
  await base();
  const c = await confermata();
  const keys = [...kv.d.keys()].filter(k => k.startsWith('tok:'));
  assert(keys.length >= 2 && keys.every(k => /^tok:[0-9a-f]{64}$/.test(k)), 'chiave = SHA-256 del token');
  const dump = JSON.stringify([...kv.d.entries()]);
  assert(!dump.includes(c.t), 'il token in chiaro non è su KV');
  assert(keys.every(k => kv.d.get(k).exp), 'ogni token ha una scadenza');
  assert(![...kv.d.keys()].some(k => k.startsWith('rl:') && /198\.51\.100/.test(k)), 'IP non in chiaro nelle chiavi dei contatori');
  eq((await H.api('ical', {}, { method: 'GET', query: { for: 'all', k: 'sbagliata' } })).status, 403);
  eq((await H.api('ical', {}, { method: 'GET', query: { for: 'all', k: 'chiave-ical-di-prova' } })).status, 200);
});

test('S14 sito: nessun tracciamento, nessun cookie, nessun font o script da server esterni; header di sicurezza', async () => {
  const html = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')), js = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
  for (const f of html) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert(!/fonts\.googleapis|fonts\.gstatic|googletagmanager|google-analytics|gtag\(|fbq\(|facebook\.net|hotjar|clarity\.ms|plausible|matomo/i.test(s), f + ': risorsa esterna o tracciamento');
    for (const m of s.matchAll(/<script[^>]*src="([^"]+)"/g)) assert(!/^https?:/.test(m[1]), f + ': script esterno ' + m[1]);
    assert(!/document\.cookie|localStorage/.test(s), f + ': cookie o localStorage');
  }
  for (const f of js) assert(!/document\.cookie|localStorage/.test(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8').replace(/\/\/.*$/gm, '')), 'js/' + f + ': cookie o localStorage');
  const fontsCss = fs.readFileSync(path.join(ROOT, 'css', 'fonts.css'), 'utf8');
  for (const m of fontsCss.matchAll(/url\(\.\.\/fonts\/([^)]+)\)/g)) assert(fs.existsSync(path.join(ROOT, 'fonts', m[1])), 'font presente: ' + m[1]);
  for (const l of ['OFL-Fraunces.txt', 'OFL-Manrope.txt', 'OFL-PinyonScript.txt']) assert(fs.existsSync(path.join(ROOT, 'fonts', l)), 'licenza ' + l);
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')), all = v.headers.find(h => h.source === '/(.*)').headers.map(h => h.key);
  for (const k of ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Permissions-Policy']) assert(all.includes(k), 'header ' + k);
  assert(!/STRIPE_SECRET|sk_live|sk_test_[A-Za-z0-9]{10}|AIza[0-9A-Za-z_-]{20}/.test(js.map(f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')).join('')), 'nessuna chiave nel frontend');
});

/* ===================== esecuzione ===================== */
(async () => {
  const only = process.argv[2]; let pass = 0, fail = 0; const t0 = process.hrtime.bigint();
  for (const t of tests) {
    if (only && !t.n.startsWith(only)) continue;
    try { await t.f(); console.log('  ✔ ' + t.n); pass++; }
    catch (e) { console.log('  ✘ ' + t.n + '\n      → ' + String(e.stack || e.message).split('\n').slice(0, only ? 40 : 4).join('\n        ')); fail++; }
    finally { kv.after = null; global.__stripeFail = false; }
  }
  console.log('\n' + pass + ' ok, ' + fail + ' falliti  (' + (Number(process.hrtime.bigint() - t0) / 1e9).toFixed(1) + ' s)'); process.exit(fail ? 1 : 0);
})();
