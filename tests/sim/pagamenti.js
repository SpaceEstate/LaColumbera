'use strict';
// La Columbera · prove dei PAGAMENTI: dal checkout alla prenotazione confermata, con le date chiuse e le email al titolare e all'ospite,
// e le RETI DI SICUREZZA quando qualcosa non arriva (webhook perso, email che non parte, date perse durante il pagamento).
// Stesso banco di prova di scenarios.js: codice REALE di Vercel (api/x.js, _pagato.js, stripe-webhook.js), Redis finto con Lua vero,
// Stripe, SMTP e foglio finti, nessuna rete. Le prove non dipendono dallo script Apps Script vero (nel repo c'è solo lo stub).
//
//   cd <repo> && node tests/sim/pagamenti.js [filtro]      (serve wasmoon, come per scenarios.js)
const assert = require('assert'), fs = require('fs'), path = require('path'), H = require('./harness'), { clock, MIN, kv } = H;
const eq = (a, b, m) => assert.deepStrictEqual(a, b, m);
const HDR = ['Numero Prenotazione', 'Data Check-in', 'Appartamento', 'Numero Ospiti', 'Numero Notti'];
const tests = [], test = (n, f) => tests.push({ n, f });

async function base(env) {
  const e = await H.newEnv({ env, legacyRows: [HDR] });
  await H.runGas(e.gas, 'setup'); await H.runGas(e.gas, 'migraRegistro'); await H.sync(); return e;
}
const checkout = o => H.api('checkout', Object.assign({ id: 'torre', da: '2026-10-20', a: '2026-10-23', ospiti: 2, nome: 'Mario Rossi', email: 'mario@test.it', tel: '333 1234567' }, o));
const bk = code => JSON.parse(kv.exec(['HGET', 'bkh', code]));
const sessionOf = code => global.__stripeSessions.find(s => s.id === bk(code).sessione);
const paid = code => { global.__stripeState[bk(code).sessione] = { paid: true }; };
const holds = id => kv.exec(['HGETALL', 'holds:' + id]).length / 2;
const upserts = () => H.webapp.calls.filter(c => c.method === 'POST').length;
const wh = (code, type) => H.webhook(type || 'checkout.session.completed', Object.assign(H.paidSession(code), { id: bk(code).sessione, payment_intent: 'pi_' + code, metadata: { code }, customer_email: bk(code).email }));
const dts = t => (t.match(/DTSTART;VALUE=DATE:(\d{8})/g) || []).map(x => x.slice(-8));
const logTxt = () => (kv.exec(['LRANGE', 'sync:log', '0', '30']) || []).join('\n');
const mailsTo = to => global.__mails.filter(m => m.to === to);
const SECRETI = ['sk_test', 'whsec_test', 'sync-test-secret', 'sheet-test-secret', 'info@test', 'owner@test'];   // valori che non devono mai uscire da 'health'

test('P1 pagamento completato: prenotazione confermata, date chiuse (sito e iCal per Booking/Airbnb), foglio, email al titolare e all\'ospite; ripetere l\'evento non duplica nulla', async () => {
  await base();
  const c = await checkout(); eq(c.status, 200); const code = c.body.code;
  eq(bk(code).stato, 'in_attesa'); assert(holds('torre') > 0, 'durante il pagamento le notti sono trattenute');
  assert((await H.busyDates('torre')).includes('2026-10-21'), 'e già non prenotabili da altri');
  const u0 = upserts();
  eq((await wh(code)).status, 200);
  const b = bk(code); eq([b.stato, b.pagamento, b.totale, b.ospiti, b.notti], ['confermata', 'pi_' + code, 540, 2, 3]);
  eq(holds('torre'), 0, 'hold rilasciati dopo la conferma'); assert(b.confermata_il, 'data di conferma');
  eq((await H.busyDates('torre')).filter(d => d >= '2026-10-19' && d < '2026-10-25'), ['2026-10-20', '2026-10-21', '2026-10-22'], 'le notti restano chiuse, il giorno della partenza è libero');
  assert(upserts() > u0, 'riga scritta sul foglio');
  eq(global.__mails.length, 2, 'una email al titolare e una all\'ospite');
  const own = mailsTo('owner@test')[0], gst = mailsTo('mario@test.it')[0];
  assert(own && /Nuova prenotazione/.test(own.subject) && own.text.includes(code) && own.text.includes('Mario Rossi') && own.text.includes('€ 540') && own.replyTo === 'mario@test.it', 'email al titolare: ' + (own && own.subject));
  assert(gst && /Prenotazione confermata/.test(gst.subject) && gst.text.includes(code) && /area-clienti\.html#c=[A-Z0-9]+&t=[A-Za-z0-9_-]{20,}/.test(gst.text) && gst.html.includes('€ 540') && gst.replyTo === 'lacolumbera@gmail.com', 'email all\'ospite con link all\'area personale; se risponde, scrive all\'indirizzo pubblicato sul sito');
  const ic = await H.api('ical', {}, { method: 'GET', query: { id: 'torre', for: 'site' } });
  eq(dts(ic.text), ['20261020'], 'iCal da dare a Booking/Airbnb: la prenotazione c\'è, così chiudono le stesse date');
  eq(JSON.parse(kv.exec(['GET', 'stripe:ultimo'])).tipo, 'checkout.session.completed', 'ultimo evento del webhook registrato (lo mostra Gestione)');
  // lo stesso evento ripetuto (Stripe lo fa) e l'evento "async" non cambiano nulla
  const u1 = upserts();
  for (const t of ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.completed']) eq((await wh(code, t)).status, 200);
  eq([global.__mails.length, upserts(), bk(code).stato], [2, u1, 'confermata'], 'nessuna email, riga o conferma in più');
});

test('P1b il webhook accetta solo richieste firmate da Stripe: firma sbagliata o assente = rifiutata e non cambia nulla; con altri metodi 405', async () => {
  await base();
  const code = (await checkout()).body.code, raw = JSON.stringify({ id: 'evt_x', type: 'checkout.session.completed', data: { object: H.paidSession(code) } });
  const call = (headers, method) => new Promise(ok => { const out = { status: 200 }; const r = { setHeader() { return r; }, status(s) { out.status = s; return r; }, json() { ok(out); return r; }, send() { ok(out); return r; }, end() { ok(out); return r; } };
    const { Readable } = require('stream'), req = Object.assign(Readable.from([Buffer.from(raw)]), { method: method || 'POST', headers: headers || {} }); H.V().webhook(req, r); });
  eq((await call({})).status, 400, 'senza firma'); eq((await call({ 'stripe-signature': 'valid-whsec_sbagliato' })).status, 400, 'firma di un altro segreto');
  eq(bk(code).stato, 'in_attesa', 'una richiesta non firmata non conferma nulla'); eq(global.__mails.length, 0);
  eq((await call({ 'stripe-signature': 'valid-' + H.SECRETS.STRIPE_WEBHOOK_SECRET }, 'GET')).status, 405);
  eq((await call({ 'stripe-signature': 'valid-' + H.SECRETS.STRIPE_WEBHOOK_SECRET })).status, 200, 'con la firma giusta passa'); eq(bk(code).stato, 'confermata');
});

test('P2 email che non parte: il webhook risponde 500 (Stripe riprova), la prenotazione è già confermata e le date chiuse; al nuovo tentativo partono SOLO le email mancanti', async () => {
  await base();
  const code = (await checkout()).body.code;
  global.__mailFail = true;
  eq((await wh(code)).status, 500, 'errore: Stripe riprova');
  eq(bk(code).stato, 'confermata', 'la prenotazione è confermata comunque'); assert((await H.busyDates('torre')).includes('2026-10-21'), 'date chiuse');
  eq(global.__mails.length, 0); const u = upserts();
  const h = (await H.adminApi('health', {})).body; eq(h.incompleti.map(x => x.code), [code], 'Gestione segnala la prenotazione con i passi mancanti'); eq(h.incompleti[0].mancano, ['mail_titolare', 'mail_ospite']);
  global.__mailFail = false;
  eq((await wh(code)).status, 200, 'al secondo tentativo tutto torna');
  eq([mailsTo('owner@test').length, mailsTo('mario@test.it').length, upserts()], [1, 1, u], 'una email a testa e il foglio non riscritto');
  eq((await H.adminApi('health', {})).body.incompleti, [], 'e ora non manca più nulla');
});

test('P3 email NON configurata (mancano le variabili su Vercel): la prenotazione si conferma lo stesso e Gestione lo dice (registro eventi e controllo)', async () => {
  await base({ GMAIL_USER: '', GMAIL_APP_PASSWORD: '' });
  const code = (await checkout()).body.code;
  eq((await wh(code)).status, 200); eq(bk(code).stato, 'confermata'); eq(global.__mails.length, 0, 'nessuna email partita');
  assert(/EMAIL NON CONFIGURATA/.test(logTxt()) && /GMAIL_USER/.test(logTxt()), 'segnalato nel registro eventi: ' + logTxt().slice(0, 200));
  const h = (await H.adminApi('health', {})).body; eq(h.ambiente.email, false);
  const t = (await H.adminApi('test_mail', {})).body; eq(t.esito, 'non_configurata');
});

test('P4 webhook perso: quando l\'ospite torna sul sito la pagina chiede a Stripe e la prenotazione si conferma (stesso percorso del webhook)', async () => {
  await base();
  const c = await checkout(), code = c.body.code, t = c.body.t;
  paid(code);                                                                        // l'ospite ha pagato, ma il webhook NON arriva
  eq(bk(code).stato, 'in_attesa'); eq(global.__mails.length, 0);
  eq((await H.api('checkout_status', { code, t: 'token-sbagliato-0123456789' })).status, 404, 'con un token sbagliato non si sa nulla');
  eq((await H.api('checkout_status', { code })).status, 404, 'e senza token neppure');
  const s = await H.api('checkout_status', { code, t }); eq(s.status, 200); eq(s.body.stato, 'confermata'); assert(/^ma\*\*\*@test\.it$/.test(s.body.email), 'email mascherata: ' + s.body.email);
  eq([bk(code).stato, holds('torre'), global.__mails.length, mailsTo('owner@test').length, mailsTo('mario@test.it').length], ['confermata', 0, 2, 1, 1]);
  assert((await H.busyDates('torre')).includes('2026-10-21'), 'date chiuse');
  // richiamarlo non duplica nulla, e il webhook che arriva dopo non cambia niente
  const u = upserts(); eq((await H.api('checkout_status', { code, t })).body.stato, 'confermata'); eq((await wh(code)).status, 200);
  eq([global.__mails.length, upserts()], [2, u]);
});

test('P5 ritorno sul sito senza pagamento: la prenotazione resta in attesa (nessuna conferma a caso); sessione scaduta o Stripe non raggiungibile non rompono la risposta', async () => {
  await base();
  const c = await checkout(), code = c.body.code, t = c.body.t;
  eq((await H.api('checkout_status', { code, t })).body.stato, 'in_attesa', 'non pagato: in attesa'); eq(global.__mails.length, 0);
  global.__stripeRetrieveFail = true;
  const e = await H.api('checkout_status', { code, t }); eq([e.status, e.body.stato], [200, 'in_attesa'], 'Stripe giù: si dice lo stato attuale, nessun errore alla pagina');
  global.__stripeRetrieveFail = false;
  global.__stripeState[bk(code).sessione] = { status: 'expired' };
  eq((await H.api('checkout_status', { code, t })).body.stato, 'in_attesa'); eq(holds('torre'), 0, 'sessione scaduta: notti liberate subito'); assert(bk(code).scaduta, 'e non più ricontrollata');
});

test('P6 webhook perso e ospite che chiude la scheda: la sincronizzazione ricontrolla su Stripe e conferma (mai prima di 3 minuti, mai ciò che non è pagato)', async () => {
  await base();
  const a = (await checkout({ da: '2026-10-20', a: '2026-10-22' })).body.code, b = (await checkout({ da: '2026-11-03', a: '2026-11-05', email: 'b@test.it', nome: 'Anna Verdi' })).body.code;
  paid(a);                                                                           // A ha pagato (webhook perso), B no
  let s = (await H.sync()).body; eq(s.pagamenti, { controllate: 0, recuperate: 0, errori: [] }, 'troppo presto: si lascia tempo al webhook'); eq(bk(a).stato, 'in_attesa');
  clock.advance(5 * MIN);
  s = (await H.sync()).body; eq([s.pagamenti.controllate, s.pagamenti.recuperate, s.pagamenti.errori], [2, 1, []]);
  eq([bk(a).stato, bk(b).stato], ['confermata', 'in_attesa'], 'solo la pagata si conferma'); eq(global.__mails.length, 2, 'email al titolare e all\'ospite di A');
  assert(/confermata dal controllo su Stripe/.test(logTxt()) && logTxt().includes(a), 'nel registro eventi');
  const h = (await H.adminApi('health', {})).body; eq(h.recuperate.n, 1); eq(h.recuperate.ultima.code, a);
  // B: sessione scaduta → liberata e non più controllata
  global.__stripeState[bk(b).sessione] = { status: 'expired' };
  s = (await H.sync()).body; eq([s.pagamenti.controllate, s.pagamenti.recuperate], [1, 0]); assert(bk(b).scaduta); eq(holds('torre'), 0);
  s = (await H.sync()).body; eq(s.pagamenti.controllate, 0, 'una sessione scaduta non si ricontrolla più');
});

test('P7 Stripe non raggiungibile durante la sincronizzazione: la sincronizzazione finisce comunque e l\'errore resta nel registro', async () => {
  await base();
  const code = (await checkout()).body.code; paid(code); clock.advance(5 * MIN);
  global.__stripeRetrieveFail = true;
  const r = await H.sync(); eq(r.status, 200); eq([r.body.pagamenti.controllate, r.body.pagamenti.recuperate, r.body.pagamenti.errori.length], [1, 0, 1]);
  assert(/Controllo pagamenti su Stripe non riuscito/.test(logTxt())); eq(bk(code).stato, 'in_attesa');
  global.__stripeRetrieveFail = false;
  eq((await H.sync()).body.pagamenti.recuperate, 1, 'al giro dopo si recupera');
});

test('P8 pagamento arrivato quando le date non sono più nostre (hold scaduto e un altro ha prenotato): "da verificare", avviso al titolare, nessuna email all\'ospite, date dell\'altro intatte; il pagamento ripetuto NON la conferma', async () => {
  await base();
  const a = (await checkout()).body, codeA = a.code;
  clock.advance(36 * MIN); await H.sync();                                           // l'hold di A scade
  const bC = await checkout({ email: 'altro@test.it', nome: 'Altro Ospite' }); eq(bC.status, 200, JSON.stringify(bC.body)); const codeB = bC.body.code;
  eq((await wh(codeB)).status, 200); eq(bk(codeB).stato, 'confermata'); eq(global.__mails.length, 2);
  eq((await wh(codeA)).status, 200);
  eq(bk(codeA).stato, 'da_verificare'); assert(/PAGAMENTO RICEVUTO MA CONFLITTO DATE/.test(bk(codeA).note), 'nota sulla prenotazione');
  eq(bk(codeB).stato, 'confermata', 'le date restano dell\'altro'); eq(holds('torre'), 0, 'e nessun hold resta in giro per il controllo fatto');
  const conf = global.__mails.filter(m => /date in conflitto/.test(m.subject)); eq(conf.length, 1, 'avviso al titolare'); eq(conf[0].to, 'owner@test'); assert(conf[0].html.includes(codeA) && /occupate da un/.test(conf[0].html));
  eq(mailsTo('mario@test.it').length, 0, 'nessuna conferma all\'ospite che non ha le date');
  eq((await H.api('checkout_status', { code: codeA, t: a.t })).body.stato, 'da_verificare', 'la pagina può dirglielo');
  // Stripe riconsegna lo stesso evento (succede): la prenotazione NON deve diventare confermata sopra quella dell'altro ospite
  for (const t of ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.completed']) eq((await wh(codeA, t)).status, 200);
  eq([bk(codeA).stato, bk(codeB).stato, global.__mails.length], ['da_verificare', 'confermata', 3], 'nessuna conferma, nessuna email in più');
  eq((await H.busyDates('torre')).filter(d => d >= '2026-10-20' && d < '2026-10-23'), ['2026-10-20', '2026-10-21', '2026-10-22']);
  const h = (await H.adminApi('health', {})).body; eq(h.daVerificare, 1, 'e Gestione dice che una prenotazione aspetta una decisione');
});

test('P8b prenotazione annullata dal titolare: un pagamento che arriva (o si ripete) dopo NON la riattiva; il titolare è avvisato una sola volta e all\'ospite non scrive nessuno', async () => {
  await base();
  const a = (await checkout()).body;
  eq((await H.adminApi('stato', { code: a.code, stato: 'annullata' })).body.changed, 1); eq(holds('torre'), 0);
  eq((await wh(a.code)).status, 200); eq(bk(a.code).stato, 'annullata');
  eq(global.__mails.length, 1); eq(global.__mails[0].to, 'owner@test'); assert(/annullata/.test(global.__mails[0].subject) && global.__mails[0].html.includes(a.code), global.__mails[0].subject);
  await wh(a.code); await wh(a.code, 'checkout.session.async_payment_succeeded'); eq(global.__mails.length, 1, 'avviso una sola volta');
  assert(!(await H.busyDates('torre')).includes('2026-10-21'), 'le date restano libere');
  paid(a.code); clock.advance(5 * MIN);                                              // né la sincronizzazione né la pagina di ritorno la toccano
  eq((await H.sync()).body.pagamenti.controllate, 0);
  eq((await H.api('checkout_status', { code: a.code, t: a.t })).body.stato, 'annullata'); eq([bk(a.code).stato, global.__mails.length], ['annullata', 1]);
});

test('P8c pagamento tardivo mentre la disponibilità non è verificabile: "da verificare" con il testo giusto; l\'avviso ripetuto non la conferma da solo, il titolare sì (e allora parte la mail all\'ospite)', async () => {
  await base();
  const a = (await checkout()).body; clock.advance(36 * MIN);                        // l'hold è scaduto
  H.webapp.mode = 'down'; kv.exec(['DEL', 'reg:snap']);                              // il foglio non risponde e non c'è nessuna copia: non si può dire che le notti siano libere
  eq((await wh(a.code)).status, 200); eq(bk(a.code).stato, 'da_verificare'); eq(holds('torre'), 0);
  const m = global.__mails.filter(x => /date in conflitto/.test(x.subject)); eq(m.length, 1); assert(/non è stato possibile verificare/.test(m[0].html) && /Sincronizza/.test(m[0].html) && !/occupate da un/.test(m[0].html), m[0].html);
  H.webapp.mode = 'ok'; await H.sync();                                              // il foglio torna raggiungibile
  await wh(a.code); eq([bk(a.code).stato, global.__mails.length], ['da_verificare', 1], 'l\'avviso ripetuto non decide al posto del titolare');
  eq((await H.adminApi('stato', { code: a.code, stato: 'confermata' })).body.changed, 1); eq(bk(a.code).stato, 'confermata');
  eq(mailsTo('mario@test.it').length, 1, 'ora l\'ospite riceve la conferma, una volta sola');
});

test('P9 pagamento per un codice che non esiste: nessuna conferma a caso, avviso al titolare; sessioni di altri sistemi (check-in) ignorate in silenzio', async () => {
  await base();
  eq((await H.webhook('checkout.session.completed', H.paidSession('ZZZZZZ'))).status, 200);
  eq(global.__mails.length, 1); assert(/Pagamento Stripe senza prenotazione/.test(global.__mails[0].subject) && global.__mails[0].to === 'owner@test');
  eq((await H.webhook('checkout.session.completed', { id: 'cs_checkin', payment_status: 'paid', metadata: { dataCheckin: '2026-11-05', appartamento: 'Torre' } })).status, 200);
  eq(global.__mails.length, 1, 'una sessione del check-in non genera nulla qui');
  eq((await H.webhook('checkout.session.completed', H.paidSession('ABCDEF', { payment_status: 'unpaid' }))).status, 200); eq(global.__mails.length, 1, 'non pagato: si attende');
});

test('P10 sessione scaduta (evento di Stripe): le notti si liberano subito', async () => {
  await base();
  const code = (await checkout()).body.code; assert(holds('torre') > 0);
  eq((await H.webhook('checkout.session.expired', { id: bk(code).sessione, metadata: { code } })).status, 200); eq(holds('torre'), 0);
  assert(!(await H.busyDates('torre')).includes('2026-10-21'), 'e il calendario torna libero');
});

test('P11 controllo di Gestione: solo con login; dice cosa è configurato e se il webhook è registrato sul sito con gli eventi giusti; mai un valore segreto', async () => {
  await base();
  eq((await H.api('health', {})).status, 401, 'senza login niente'); eq((await H.api('test_mail', {})).status, 401);
  let h = (await H.adminApi('health', {})).body;
  eq(h.ambiente, { stripe: true, webhook: true, email: true, foglio: true, sync: true, destinatario: 'ow***@test', destinatarioImpostato: true });
  eq([h.stripe.collegato, h.stripe.webhook], [true, []], 'nessun webhook registrato: lo si vede'); eq(h.ultimoWebhook, null, 'e nessun evento ancora ricevuto');
  global.__stripeWebhooks = [{ url: 'https://www.lacolumbera.test/api/stripe-webhook', status: 'enabled', enabled_events: ['checkout.session.completed', 'checkout.session.expired'] }, { url: 'https://checkin.test/api/stripeWebhook', status: 'enabled', enabled_events: ['checkout.session.completed'] }];
  h = (await H.adminApi('health', {})).body; eq(h.stripe.webhook, [{ url: 'https://www.lacolumbera.test/api/stripe-webhook', stato: 'enabled', mancanti: [] }], 'solo il webhook di questo sito, quello del check-in non c\'entra');
  global.__stripeWebhooks[0].enabled_events = ['checkout.session.completed']; global.__stripeWebhooks[0].status = 'disabled';
  h = (await H.adminApi('health', {})).body; eq([h.stripe.webhook[0].stato, h.stripe.webhook[0].mancanti], ['disabled', ['checkout.session.expired']]);
  global.__stripeWebhooks[0].enabled_events = ['*']; eq((await H.adminApi('health', {})).body.stripe.webhook[0].mancanti, [], 'tutti gli eventi = nessuno mancante');
  global.__stripeFailedDeliveries = 2; eq((await H.adminApi('health', {})).body.stripe.consegneFallite, 2, 'consegne fallite segnalate da Stripe');
  global.__stripeListFail = true; h = (await H.adminApi('health', {})).body; eq([h.stripe.collegato, h.stripe.errore], [null, 'permission_error'], 'chiave senza permessi di lettura: non si sa, ma non si rompe');
  const txt = JSON.stringify((await H.adminApi('health', {})).body); for (const s of SECRETI) assert(!txt.includes(s), 'segreto nella risposta: ' + s);
  const c = await checkout(); await wh(c.body.code); h = (await H.adminApi('health', {})).body; eq(h.ultimoWebhook.tipo, 'checkout.session.completed'); assert(Date.parse(h.ultimoWebhook.ts) > 0);
});

test('P12 email di prova: parte al titolare; segnala se non configurata o se l\'invio fallisce', async () => {
  await base();
  let r = (await H.adminApi('test_mail', {})).body; eq(r, { esito: 'inviata', destinatario: 'ow***@test' });
  assert(global.__mails.length === 1 && global.__mails[0].to === 'owner@test' && /Prova email/.test(global.__mails[0].subject));
  global.__mailFail = true; eq((await H.adminApi('test_mail', {})).body.esito, 'errore');
});

test('P13 il controllo al ritorno è limitato (60 richieste ogni 10 minuti per IP) e non rivela se un codice esiste', async () => {
  await base();
  const hdr = { headers: { 'x-real-ip': '10.9.9.9' } };
  for (let i = 0; i < 60; i++) eq((await H.api('checkout_status', { code: 'ABCDEF', t: 'x'.repeat(24) }, hdr)).status, 404);
  const r = await H.api('checkout_status', { code: 'ABCDEF', t: 'x'.repeat(24) }, hdr); eq(r.status, 429); assert(r.body.err);
  eq((await H.api('checkout_status', { code: 'ABCDEF', t: 'x'.repeat(24) }, { headers: { 'x-real-ip': '10.1.1.1' } })).status, 404, 'un altro IP non è toccato');
});

test('P14 configurazione di Vercel: le funzioni hanno 60 secondi (foglio e feed iCal possono essere lenti) e restano entro il limite di 12 funzioni del piano gratuito', async () => {
  const v = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'vercel.json'), 'utf8'));
  eq(v.functions && v.functions['api/**/*.js'] && v.functions['api/**/*.js'].maxDuration, 60, 'maxDuration');
  const n = fs.readdirSync(path.join(__dirname, '..', '..', 'api')).filter(f => f.endsWith('.js') && !f.startsWith('_')).length; assert(n <= 12, 'Vercel Hobby: al massimo 12 funzioni (ora ' + n + ')');
});

/* ===================== esecuzione ===================== */
(async () => {
  const only = process.argv[2]; let pass = 0, fail = 0; const t0 = process.hrtime.bigint();
  for (const t of tests) {
    if (only && !t.n.startsWith(only)) continue;
    try { await t.f(); console.log('  ✔ ' + t.n); pass++; }
    catch (e) { console.log('  ✘ ' + t.n + '\n      → ' + String(e.stack || e.message).split('\n').slice(0, only ? 30 : 4).join('\n        ')); fail++; }
    finally { kv.after = null; }
  }
  console.log('\n' + pass + ' ok, ' + fail + ' falliti  (' + (Number(process.hrtime.bigint() - t0) / 1e9).toFixed(1) + ' s)'); process.exit(fail ? 1 : 0);
})();
