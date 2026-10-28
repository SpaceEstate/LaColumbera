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

test('S2  basta il codice: quello del sito e il numero Booking/Airbnb del foglio aprono area clienti e Guest Card; un codice sbagliato ha sempre la stessa risposta', async () => {
  await base();
  const c = await confermata();
  let r = await H.api('mie', { code: c.code }, as(ip()));
  eq(r.status, 200, 'codice del sito da solo'); eq(r.body.code, c.code); eq(r.body.prenotazioni[0].code, c.code);
  assert(/^[A-Za-z0-9_-]{22}$/.test(r.body.t), 'token di sessione per le richieste successive');
  eq((await H.api('gc_check', { code: c.code, t: r.body.t }, as(ip()))).status, 200, 'il token di sessione vale per la Guest Card');
  eq((await H.api('gc_check', { code: c.code }, as(ip()))).status, 200, 'Guest Card con il solo codice');
  r = await H.api('mie', { code: 'hmsedeszcw' }, as(ip()));
  eq(r.status, 200, 'Airbnb (foglio), anche in minuscolo'); eq([r.body.code, r.body.prenotazioni[0].id], ['HMSEDESZCW', 'corte']);
  r = await H.api('gc_check', { code: '6877.180.932' }, as(ip()));
  eq(r.status, 200, 'Booking scritto come lo mostra Booking (con i punti)'); eq(r.body.code, '6877180932'); eq(r.body.booking.needsEmail, true);
  const risposte = [];
  for (const [a, code] of [['mie', 'ZZZZZZZZZZZZZ'], ['gc_check', 'ZZZZZZ'], ['gc_issue', '1234567890'], ['mie', c.code.slice(0, 12)], ['mie', c.code + 'X']]) {
    const x = await H.api(a, { code }, as(ip())); eq(x.status, 404, a + ' ' + code); risposte.push(JSON.stringify(x.body));
  }
  const nc = await checkout({ da: '2027-01-10', a: '2027-01-13' });              // pagamento non completato: la prenotazione esiste ma non si vede
  const x = await H.api('mie', { code: nc.body.code }, as(ip())); eq(x.status, 404); risposte.push(JSON.stringify(x.body));
  eq(new Set(risposte).size, 1, 'codice inesistente, troncato o non confermato: stessa risposta (niente enumerazione)');
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

test('S4  codice del sito: 13 caratteri casuali senza lettere ambigue; si scrive anche minuscolo, a gruppi, con trattini, O per 0 e I/L per 1', async () => {
  await base();
  const A = require(path.join(ROOT, 'api', '_accesso.js')), RE = /^[0-9A-HJKMNP-TV-Z]{13}$/, seen = new Set();
  for (let i = 0; i < 5000; i++) { const k = A.newBookingCode(); assert(RE.test(k), 'alfabeto di Crockford: ' + k); assert(/[A-DF-HJKMNP-TV-Z]/.test(k), 'almeno una lettera (il foglio non lo trasforma in un numero): ' + k); seen.add(k); }
  eq(seen.size, 5000, 'nessun doppione');
  const chars = new Set([...seen].join('')); eq(chars.size, 32, 'tutti i 32 caratteri dell\'alfabeto compaiono');
  eq(A.codeCandidates('558r te56-487a9'), ['558RTE56487A9', '558RTE56-487A9'], 'prima senza spazi e trattini');
  eq(A.codeCandidates(' 55OR TE5I 487L9 '), ['55ORTE5I487L9', '550RTE5148719'], 'O→0, I/L→1 solo come ultima prova');
  eq(A.codeCandidates('6877.180.932'), ['6877180932'], 'Booking con i punti');
  eq(A.codeCandidates('AB-12'), ['AB12', 'AB-12'], 'un codice manuale con trattino si prova anche così com\'è');
  eq(A.codeCandidates('<script>'), [], 'caratteri non ammessi'); eq(A.codeCandidates(''), []);
  const c = await confermata();
  assert(RE.test(c.code), 'il checkout usa il codice lungo: ' + c.code);
  const g = c.code.slice(0, 4) + ' ' + c.code.slice(4, 8) + ' ' + c.code.slice(8);
  for (const v of [c.code.toLowerCase(), g, g.replace(/ /g, '-'), '  ' + g.toLowerCase() + ' ']) {
    const r = await H.api('mie', { code: v }, as(ip())); eq(r.status, 200, 'variante: ' + v); eq(r.body.code, c.code, 'risponde con il codice registrato');
  }
  if (/[01]/.test(c.code)) {
    const v = c.code.replace(/0/g, 'O').replace(/1/g, 'I');
    eq((await H.api('mie', { code: v }, as(ip()))).status, 200, 'O e I scritti al posto di 0 e 1');
  }
  const mail = global.__mails.find(m => m.to === 'mario.prova@esempio.it');
  assert(mail.text.includes(g) && mail.html.includes(c.code.slice(8)), 'la mail mostra il codice a gruppi');
  assert(/area-clienti\.html#c=[0-9A-Z]{13}&t=/.test(mail.text), 'il link della mail con token resta');
});

test('S5  tentativi ripetuti: 10 codici sbagliati per IP, poi pausa; tetto di 300 l\'ora su tutti gli IP (chi ha il token entra comunque)', async () => {
  await base();
  const c = await confermata(), att = ip();
  for (let i = 0; i < 10; i++) eq((await H.api('mie', { code: 'AAAABBBBCCCC' + i }, as(att))).status, 404);
  let r = await H.api('mie', { code: c.code }, as(att));
  eq(r.status, 429, 'dopo 10 errori lo stesso IP si ferma (anche con il codice giusto)'); assert(+r.headers['retry-after'] > 0, 'Retry-After');
  eq((await H.api('mie', { code: c.code }, as(ip()))).status, 200, 'un altro IP (l\'ospite vero) continua a entrare');
  clock.advance(16 * MIN);
  eq((await H.api('mie', { code: c.code }, as(att))).status, 200, 'trascorsa la finestra l\'IP torna libero');
  // tentativi distribuiti su molti IP: ogni codice sbagliato conta anche nel totale; un token sbagliato no (non è un tentativo di indovinare un codice)
  const before = +kv.exec(['GET', 'rl:fa:tutti']) || 0;
  for (let i = 0; i < 5; i++) eq((await H.api('mie', { code: 'ZZZZ' + i + 'YYYYXXXX' }, as(ip()))).status, 404);
  await H.api('mie', { code: c.code, t: 'x'.repeat(22) }, as(ip()));
  eq(+kv.exec(['GET', 'rl:fa:tutti']) - before, 5, 'contatore totale');
  kv.exec(['SET', 'rl:fa:tutti', '299', 'EX', '3600']);
  eq((await H.api('mie', { code: 'ZZZZZZZZZZZZZ' }, as(ip()))).status, 404, 'il 300° errore');
  r = await H.api('mie', { code: c.code }, as(ip()));
  eq(r.status, 429, 'oltre il tetto: anche un codice giusto aspetta'); assert(+r.headers['retry-after'] > 0);
  eq((await H.api('mie', { code: c.code, t: c.t }, as(ip()))).status, 200, 'con il token (link della mail, sessione aperta) si entra comunque');
  clock.advance(61 * MIN);
  eq((await H.api('mie', { code: c.code }, as(ip()))).status, 200, 'dopo un\'ora il tetto si azzera');
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
    tok = (await H.api('mie', { code: c.code }, as(ip()))).body.t;
    await H.api('mie', { code: c.code.slice(0, 12) + 'Z' }, as(ip()));                // codice sbagliato: nemmeno lui finisce nei log
    await H.api('mie', { code: c.code, t: 'manomesso' + c.t }, as(ip()));
    global.__stripeFail = true;
    const e = await checkout({ da: '2027-01-10', a: '2027-01-13' });
    eq(e.status, 500); assert(!/stripe giù/.test(JSON.stringify(e.body)), 'il messaggio interno non arriva al client');
    global.__stripeFail = false;
  });
  for (const s of [c.t, tok, c.code, c.code.slice(0, 12) + 'Z', 'mario.prova@esempio.it', 'Mario Prova', '0000000']) assert(!out.includes(s), 'nei log non deve comparire: ' + s);
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
  // nessun VALORE segreto nel frontend: formati delle chiavi e assegnazioni di un valore ai nomi delle variabili. Il solo NOME di una variabile
  // (es. nel messaggio «Manca STRIPE_SECRET_KEY su Vercel» della scheda Pagamenti) non è un segreto.
  assert(!/sk_live|sk_test_[A-Za-z0-9]{10}|whsec_[A-Za-z0-9]{10}|AIza[0-9A-Za-z_-]{20}|(?:STRIPE_[A-Z_]+|SESSION_SECRET|SYNC_SECRET|SHEET_SECRET|GMAIL_APP_PASSWORD|ADMIN_PASSWORD)\s*[:=]\s*['"`][^'"`\s]{6,}/.test(js.map(f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')).join('')), 'nessuna chiave nel frontend');
});

test('S15 finestra di accesso con il codice: sito fino a 30 giorni dopo il check-out, Booking/Airbnb fino a 7; annullate e non confermate mai', async () => {
  await base();
  const c = await confermata();                                                     // check-out 13/12/2026
  clock.set('2027-01-11T10:00:00Z');
  eq((await H.api('mie', { code: c.code }, as(ip()))).status, 200, '29 giorni dopo il check-out');
  clock.set('2027-01-13T10:00:00Z');
  eq((await H.api('mie', { code: c.code }, as(ip()))).status, 404, 'oltre i 30 giorni');
  await base();
  clock.set('2026-10-17T10:00:00Z');                                                // Airbnb: check-out 11/10
  eq((await H.api('gc_check', { code: 'HMSEDESZCW' }, as(ip()))).status, 200, '6 giorni dopo il check-out');
  clock.set('2026-10-19T10:00:00Z');
  eq((await H.api('gc_check', { code: 'HMSEDESZCW' }, as(ip()))).status, 404, 'oltre i 7 giorni');
  await base();
  const d = await confermata();
  eq((await H.adminApi('stato', { code: d.code, stato: 'annullata' })).status, 200);
  eq((await H.api('mie', { code: d.code }, as(ip()))).status, 404, 'annullata');
  eq((await H.api('gc_check', { code: d.code }, as(ip()))).status, 409, 'Guest Card: lo dice chiaramente (prenotazione annullata)');
});

test('S16 calendario per Booking e Airbnb (for=site): nessun codice di prenotazione, solo un\'impronta stabile', async () => {
  await base();
  const c = await confermata(), get = async () => (await H.api('ical', {}, { method: 'GET', query: { id: 'torre', for: 'site' } })).text;
  const a = await get(), uid = (/UID:(\S+)/.exec(a) || [])[1];
  assert(!a.includes(c.code) && !a.toLowerCase().includes(c.code.toLowerCase()), 'il codice (chiave dell\'area clienti) non va alle piattaforme');
  assert(/^sito-[0-9a-f]{20}@lacolumbera$/.test(uid || ''), 'UID: ' + uid);
  eq((/UID:(\S+)/.exec(await get()) || [])[1], uid, 'stesso UID a ogni lettura: le piattaforme aggiornano, non duplicano');
  const all = (await H.api('ical', {}, { method: 'GET', query: { for: 'all', k: 'chiave-ical-di-prova' } })).text;
  assert(all.includes(c.code), 'il calendario personale (con chiave) mostra il codice al titolare');
});

test('S17 area ospiti: il soggiorno senza dati personali; istruzioni e Wi-Fi mai nella configurazione pubblica e solo nei giorni giusti; una Gestione vecchia non li cancella', async () => {
  await base();
  let c = (await H.adminApi('cfg_admin', {})).body;
  for (const p of c.apts) { p.infoOspiti = '## Casa\n- Regola ' + p.id; p.infoRiservate = 'WIFI-SEGRETO-' + p.id; }
  Object.assign(c, { checkoutOra: '10:30', infoGiorni: 3 });
  eq((await H.adminApi('save', c)).status, 200);
  const pub = JSON.stringify((await H.api('cfg', {}, { method: 'GET' })).body);
  assert(!/WIFI-SEGRETO|Regola torre|infoOspiti|infoRiservate/.test(pub), 'configurazione pubblica senza testi per gli ospiti: ' + pub.slice(0, 200));
  const k = await confermata();                                                     // 10 → 13 dicembre, Torre
  let r = await H.api('mie', { code: k.code }, as(ip())), sg = r.body.soggiorno, js = JSON.stringify(r.body);
  eq(r.status, 200); assert(!/Mario|Prova|mario\.prova|0000000/.test(js), 'nessun nome, email o telefono: ' + js);
  eq([sg.code, sg.id, sg.da, sg.a, sg.notti, sg.ospiti, sg.origine, sg.orari], [k.code, 'torre', '2026-12-10', '2026-12-13', 3, 2, 'sito', { checkin: '16:00', checkout: '10:30' }]);
  eq(sg.pagamento.totale, 540); eq(sg.pagamento.pagato, true); eq(sg.pagamento.data, '2026-10-02'); eq(sg.pagamento.conto, { righe: [{ dal: '2026-12-10', notti: 3, prezzo: 180 }], supplemento: 0 });
  eq([sg.info.testo, sg.info.riservate, sg.info.riservateDal], ['## Casa\n- Regola torre', '', '2026-12-07'], 'Wi-Fi non ancora: dal 7 dicembre (3 giorni prima)');
  clock.set('2026-12-07T08:00:00Z');
  sg = (await H.api('mie', { code: k.code, t: k.t }, as(ip()))).body.soggiorno; eq(sg.info.riservate, 'WIFI-SEGRETO-torre', 'dal 7 dicembre sì');
  clock.set('2026-12-14T08:00:00Z');
  sg = (await H.api('mie', { code: k.code, t: k.t }, as(ip()))).body.soggiorno; eq([sg.info.riservate, sg.info.riservateDal], ['', ''], 'dopo la partenza no');
  // il conto resta quello pagato anche se poi cambiano i prezzi
  c = (await H.adminApi('cfg_admin', {})).body; c.apts.find(p => p.id === 'torre').base = 999; eq((await H.adminApi('save', c)).status, 200);
  eq((await H.api('mie', { code: k.code, t: k.t }, as(ip()))).body.soggiorno.pagamento.conto.righe[0].prezzo, 180);
  // una pagina di Gestione di prima (non invia i campi nuovi) non li cancella
  c = (await H.adminApi('cfg_admin', {})).body; for (const p of c.apts) { delete p.infoOspiti; delete p.infoRiservate; } delete c.checkoutOra; delete c.infoGiorni; delete c.whatsapp;
  eq((await H.adminApi('save', c)).status, 200);
  const st = JSON.parse(kv.exec(['GET', 'cfg']));
  eq([st.apts.find(p => p.id === 'corte').infoRiservate, st.checkoutOra, st.infoGiorni], ['WIFI-SEGRETO-corte', '10:30', 3]);
  // valori non validi: rifiutati senza cambiare nulla
  eq((await H.adminApi('save', Object.assign({}, st, { checkoutOra: '25:00' }))).status, 400);
  eq((await H.adminApi('save', Object.assign({}, st, { infoGiorni: 99 }))).status, 400);
  eq(JSON.parse(kv.exec(['GET', 'cfg'])).checkoutOra, '10:30');
  // Booking/Airbnb (foglio): nessun importo, la piattaforma
  clock.set('2026-10-03T08:00:00Z');
  sg = (await H.api('mie', { code: 'HMSEDESZCW' }, as(ip()))).body.soggiorno;
  eq([sg.origine, sg.portale, sg.pagamento], ['airbnb', 'Airbnb', null]);
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
