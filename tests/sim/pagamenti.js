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
  eq(v.regions, ['fra1'], 'le funzioni girano a Francoforte, come Upstash: dati in UE e meno attesa');
  const n = fs.readdirSync(path.join(__dirname, '..', '..', 'api')).filter(f => f.endsWith('.js') && !f.startsWith('_')).length; assert(n <= 12, 'Vercel Hobby: al massimo 12 funzioni (ora ' + n + ')');
});

test('P15 calendario personale (for=all, per lo script del telefono): tutte le fonti e tutti e due gli appartamenti, solo con la chiave; il link per Booking/Airbnb (for=site) resta solo prenotazioni del sito', async () => {
  const e = await base({ ICAL_PERSONAL_KEY: 'chiave-personale' });
  const cfg = JSON.parse(kv.exec(['GET', 'cfg'])); cfg.apts.find(a => a.id === 'corte').blocked = { '2026-12-20': true }; kv.exec(['SET', 'cfg', JSON.stringify(cfg)]);
  H.setFeed('bookingTorre', [H.bookingEv('b1', '2026-11-10', '2026-11-12')]); H.setFeed('airbnbCorte', [H.airbnbEv('a1', '2026-11-15', '2026-11-18', 'HMTEST1234')]);
  const code = (await checkout({ da: '2026-12-01', a: '2026-12-03' })).body.code; await wh(code); await H.sync();
  const all = await H.api('ical', {}, { method: 'GET', query: { for: 'all', id: 'all', k: 'chiave-personale' } });
  eq(all.status, 200); eq(dts(all.text), ['20261110', '20261115', '20261201', '20261220'], 'Booking (Torre), Airbnb (Corte), sito (Torre), blocco manuale (Corte)');
  assert(/Torre/.test(all.text) && /Corte/.test(all.text) && /Mario Rossi/.test(all.text), 'nomi degli appartamenti e dell\'ospite del sito');
  eq((await H.api('ical', {}, { method: 'GET', query: { for: 'all', id: 'all' } })).status, 403, 'senza chiave'); eq((await H.api('ical', {}, { method: 'GET', query: { for: 'all', id: 'all', k: 'altra' } })).status, 403, 'chiave sbagliata');
  const site = await H.api('ical', {}, { method: 'GET', query: { for: 'site', id: 'torre' } });
  eq(dts(site.text), ['20261201'], 'for=site: solo la prenotazione del sito, niente Booking, Airbnb né nomi'); assert(!/Mario Rossi/.test(site.text));
});

/* ===================== annullamento con rimborso (api/_annulla.js) ===================== */
let ipN = 0;
const ospite = (a, body) => H.api(a, body, { headers: { 'x-real-ip': '198.51.100.' + (++ipN % 250) } });      // un IP diverso a chiamata: le prove non consumano i limiti per IP
const pagata = async o => { const c = await checkout(o); eq(c.status, 200, JSON.stringify(c.body)); eq((await wh(c.body.code)).status, 200); return c.body.code; };
const rimborsi = () => global.__stripeRefunds;
const libere = async (da, a) => (await H.busyDates('torre')).filter(d => d >= da && d < a);
const regAirbnb = () => {      // una prenotazione Airbnb nel registro del foglio (lo stub dello script non lo popola)
  const snap = JSON.parse(kv.exec(['GET', 'reg:snap']) || '{"rows":[]}');
  snap.rows = [{ id: 'AIRBNB|HMSEDESZCW', fonte: 'AIRBNB', codice: 'HMSEDESZCW', apt: 'corte', checkin: '2026-11-05', checkout: '2026-11-08', notti: 3, ospiti: 2, stato: 'CONFERMATA', uid: '', motivo: '', creata: '', aggiornata: '', ultimoSeen: '', annullata: '', note: '', flags: [] }];
  kv.exec(['SET', 'reg:snap', JSON.stringify(Object.assign({ invalid: [], count: 1, lastAttempt: clock.iso(), lastSuccess: clock.iso(), status: 'OK' }, snap))]);
};

test('R1 l\'ospite annulla dall\'area clienti fino a 7 giorni prima dell\'arrivo: rimborso totale su Stripe, prenotazione annullata, notti di nuovo libere (sito e calendario per Booking/Airbnb), foglio, email all\'ospite e al titolare; ripetere non rimborsa due volte', async () => {
  await base();
  const code = await pagata(); global.__mails = [];
  const m = await ospite('mie', { code }); eq(m.body.soggiorno.annullo, { possibile: true, entro: '2026-10-13', motivo: 'ok' }, 'arrivo il 20/10: si annulla fino al 13/10');
  const u0 = upserts(), r = await ospite('annulla', { code, lingua: 'it' });
  eq(r.status, 200, JSON.stringify(r.body)); eq([r.body.ok, r.body.gia, r.body.rimborso, r.body.email], [1, false, { importo: 540, stato: 'succeeded' }, 'ma***@test.it']);
  eq(rimborsi().length, 1, 'un rimborso'); const rf = rimborsi()[0];
  eq([rf.key, rf.params.payment_intent, rf.params.reason, rf.params.metadata, rf.params.amount], ['lc-rimborso-' + code, 'pi_' + code, 'requested_by_customer', { code }, undefined], 'rimborso totale del pagamento della prenotazione, con la chiave di idempotenza');
  const b = bk(code); eq([b.stato, b.annullata_da, b.rimborso.importo, b.rimborso.id, b.rimborso.stato], ['annullata', 'ospite', 540, 're_test_1', 'succeeded']);
  assert(b.annullata_il && /ANNULLATA DALL'OSPITE IL 2026-10-02 · RIMBORSO 540 € \(re_test_1\)/.test(b.note), b.note);
  eq(await libere('2026-10-19', '2026-10-25'), [], 'notti di nuovo libere sul sito');
  eq(dts((await H.api('ical', {}, { method: 'GET', query: { id: 'torre', for: 'site' } })).text), [], 'e tolte dal calendario che leggono Booking e Airbnb');
  assert(upserts() > u0, 'riga del foglio aggiornata');
  eq(global.__mails.map(x => x.to).sort(), ['mario@test.it', 'owner@test'], 'una email all\'ospite e una al titolare');
  const g = mailsTo('mario@test.it')[0], o = mailsTo('owner@test')[0];
  assert(/Prenotazione annullata/.test(g.subject) && /Abbiamo annullato la prenotazione come ci hai chiesto/.test(g.text) && /Rimborso: € 540/.test(g.text) && /5–10 giorni lavorativi/.test(g.text) && g.text.includes(code.slice(0, 4)), g.text);
  assert(/Prenotazione annullata/.test(o.subject) && o.text.includes(code) && /rimborso di € 540 avviato su Stripe \(re_test_1\)/.test(o.text) && o.replyTo === 'mario@test.it', o.text);
  // di nuovo (doppio tocco arrivato dopo, rete caduta): stessa risposta, nessun rimborso né email in più
  const r2 = await ospite('annulla', { code }); eq([r2.status, r2.body.gia], [200, true]); eq(rimborsi().length, 1); eq(global.__mails.length, 2);
  eq((await ospite('mie', { code })).status, 404, 'l\'area clienti non apre più una prenotazione annullata');
  eq((await ospite('msg_send', { code, testo: 'ciao' })).status, 404, 'e non si scrive più');
  // in inglese l'email all'ospite è in inglese
  const c2 = await pagata({ da: '2026-11-02', a: '2026-11-05', email: 'anna@test.it' }); global.__mails = [];
  eq((await ospite('annulla', { code: c2, lingua: 'en' })).status, 200); const g2 = mailsTo('anna@test.it')[0];
  assert(/Booking cancelled/.test(g2.subject) && /Refund: € 540/.test(g2.text) && /Monday, 2 November 2026/.test(g2.text), g2.text);
});

test('R2 dopo il settimo giorno prima dell\'arrivo (ora di Roma) l\'ospite non annulla e nulla cambia; chi prenota a meno di 7 giorni dall\'arrivo non è rimborsabile; il titolare annulla e rimborsa sempre', async () => {
  await base();
  const code = await pagata();      // arrivo il 20/10
  clock.set('2026-10-13T21:30:00Z'); await H.sync();      // 13/10, 23:30 a Roma: ancora sì
  eq((await ospite('mie', { code })).body.soggiorno.annullo, { possibile: true, entro: '2026-10-13', motivo: 'ok' });
  clock.set('2026-10-13T22:30:00Z'); await H.sync();      // 14/10, 00:30 a Roma: non più
  eq((await ospite('mie', { code })).body.soggiorno.annullo, { possibile: false, entro: '2026-10-13', motivo: 'scaduto' });
  global.__mails = [];
  const r = await ospite('annulla', { code }); eq([r.status, r.body.code], [409, 'NON_ANNULLABILE']); assert(/fino a 7 giorni prima dell'arrivo/.test(r.body.err), r.body.err);
  eq([bk(code).stato, rimborsi().length, global.__mails.length], ['confermata', 0, 0], 'nessun rimborso, nessuna email');
  eq(await libere('2026-10-19', '2026-10-25'), ['2026-10-20', '2026-10-21', '2026-10-22'], 'le notti restano chiuse');
  // il titolare sì, anche adesso; all'ospite l'email dice che ha annullato La Columbera, al titolare non arriva nulla
  eq((await H.api('rimborsa', { code })).status, 401, 'Gestione: solo con login');
  const o = await H.adminApi('rimborsa', { code }); eq(o.status, 200, JSON.stringify(o.body));
  eq([bk(code).stato, bk(code).annullata_da, rimborsi().length], ['annullata', 'titolare', 1]);
  eq(global.__mails.map(x => x.to), ['mario@test.it']); assert(/La Columbera ha annullato la tua prenotazione/.test(global.__mails[0].text) && /€ 540/.test(global.__mails[0].text));
  // prenotata il 22/10 per il 26/10: non rimborsabile da subito, e la conferma lo dice
  clock.set('2026-10-22T08:00:00Z'); await H.sync(); global.__mails = [];
  const c2 = await pagata({ da: '2026-10-26', a: '2026-10-29', email: 'tardi@test.it' });
  eq((await ospite('mie', { code: c2 })).body.soggiorno.annullo.motivo, 'scaduto');
  assert(/non è rimborsabile/.test(mailsTo('tardi@test.it')[0].text), 'email di conferma: non rimborsabile');
  const c3 = await pagata({ da: '2026-12-10', a: '2026-12-13', email: 'presto@test.it' });
  assert(/Puoi annullare gratis dall'area personale fino a giovedì 3 dicembre 2026/.test(mailsTo('presto@test.it')[0].text), 'email di conferma: fino a quando si annulla');
  eq((await ospite('annulla', { code: c2 })).status, 409);
});

test('R3 Stripe non risponde: nulla cambia (confermata, notti chiuse, nessuna email); al nuovo tentativo il rimborso parte una volta sola. Un errore dopo il rimborso si completa riprovando, senza un secondo rimborso', async () => {
  await base();
  const code = await pagata(); global.__mails = [];
  global.__stripeRefundFail = true;
  const r = await ospite('annulla', { code }); eq([r.status, r.body.code], [502, 'STRIPE']); assert(/nulla è cambiato/.test(r.body.err));
  eq([bk(code).stato, global.__mails.length], ['confermata', 0]); eq(await libere('2026-10-19', '2026-10-25'), ['2026-10-20', '2026-10-21', '2026-10-22']);
  global.__stripeRefundFail = false;
  eq((await ospite('annulla', { code })).status, 200); eq([rimborsi().length, bk(code).stato], [1, 'annullata']);
  // rimborso fatto, poi KV cade subito dopo (prima di scrivere la prenotazione annullata): il nuovo tentativo usa la stessa chiave → stesso rimborso
  const c2 = await pagata({ da: '2026-11-02', a: '2026-11-05', email: 'b@t.it' });
  let colpi = 0; kv.after = async cmd => { if (rimborsi().length === 2 && cmd[0] === 'HGET' && cmd[1] === 'bkh' && !colpi++) throw new Error('KV giù'); };      // la rilettura dopo il rimborso
  const r2 = await ospite('annulla', { code: c2 }); assert(r2.status >= 500, 'errore: ' + r2.status); kv.after = null;
  eq(rimborsi().length, 2, 'il rimborso è partito'); eq(bk(c2).stato, 'confermata', 'la prenotazione non risulta ancora annullata');
  eq((await ospite('annulla', { code: c2 })).status, 200);
  eq([rimborsi().length, bk(c2).stato, bk(c2).rimborso.id], [2, 'annullata', 're_test_2'], 'stesso rimborso (idempotenza), nessun doppio rimborso');
});

test('R4 due annullamenti insieme (doppio tocco): un solo rimborso; già rimborsata dalla dashboard di Stripe: si annulla senza rimborsare di nuovo', async () => {
  await base();
  const code = await pagata();
  const st = (await Promise.all([ospite('annulla', { code }), ospite('annulla', { code })])).map(x => x.status).sort();
  assert(st[0] === 200 && [200, 409].includes(st[1]), 'stati: ' + st); eq(rimborsi().length, 1); eq(bk(code).stato, 'annullata');
  const c2 = await pagata({ da: '2026-11-02', a: '2026-11-05', email: 'b@t.it' }); global.__stripeRefunded = { ['pi_' + c2]: true }; global.__mails = [];
  const r = await H.adminApi('rimborsa', { code: c2 }); eq(r.status, 200);
  eq([bk(c2).stato, bk(c2).rimborso.stato, rimborsi().length], ['annullata', 'gia_rimborsato', 1]); assert(/già stato rimborsato/.test(mailsTo('b@t.it')[0].text));
});

test('R5 ospiti di Booking/Airbnb e prenotazioni senza pagamento online: dal sito non si annulla (nulla cambia); il titolare annulla e rimborsa anche una «da verificare»', async () => {
  await base(); regAirbnb();
  const a = await ospite('annulla', { code: 'HMSEDESZCW' }); eq([a.status, a.body.code], [409, 'PORTALE']); assert(/Airbnb/.test(a.body.err));
  eq((await ospite('mie', { code: 'HMSEDESZCW' })).body.soggiorno.annullo, { possibile: false, entro: '', motivo: 'portale' });
  // confermata a mano dal titolare, senza pagamento online
  const c = await checkout({ da: '2026-11-02', a: '2026-11-05', email: 'c@t.it' }); eq((await H.adminApi('stato', { code: c.body.code, stato: 'confermata' })).status, 200);
  eq((await ospite('mie', { code: c.body.code })).body.soggiorno.annullo.motivo, 'non_pagata');
  eq((await ospite('annulla', { code: c.body.code })).status, 409); const n = await H.adminApi('rimborsa', { code: c.body.code }); eq([n.status, n.body.code], [409, 'SENZA_PAGAMENTO']); eq(bk(c.body.code).stato, 'confermata');
  // pagata quando le date non erano più libere → «da verificare»: il titolare la annulla e la rimborsa
  const d = await checkout({ da: '2026-12-01', a: '2026-12-04', email: 'd@t.it' }), code = d.body.code;
  kv.exec(['DEL', 'holds:torre']); H.setFeed('bookingTorre', [H.bookingEv('x1', '2026-12-02', '2026-12-03')]); await H.sync();
  await wh(code); eq(bk(code).stato, 'da_verificare');
  eq((await ospite('annulla', { code })).status, 409, 'l\'ospite no (prenotazione non confermata)');
  eq((await H.adminApi('rimborsa', { code })).status, 200); eq([bk(code).stato, rimborsi().length], ['annullata', 1]);
});

/* ===================== ricevuta su richiesta (api/_ricevute.js) ===================== */
const DATI = { nome: 'Mario Rossi', cf: 'rssmra80a01h501u', indirizzo: 'Via Roma 1', cap: '38123', citta: 'Trento' };
const pdf = t => 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n' + (t || 'ricevuta')).toString('base64');

test('F1 ricevuta: l\'ospite la chiede con i dati (codice fiscale controllato), al titolare arriva l\'email; nell\'area solo lo stato e l\'email mascherata; il titolare carica il PDF e parte all\'ospite in allegato', async () => {
  await base();
  const code = await pagata(); global.__mails = [];
  eq((await ospite('mie', { code })).body.soggiorno.ricevuta, { stato: '', richiesta_il: '', inviata_il: '', invio: 'ma***@test.it', emailPren: 'ma***@test.it' });
  const no = await ospite('ricevuta', { code, dati: Object.assign({}, DATI, { cf: 'RSSMRA80A01H501X' }) }); eq(no.status, 400); assert(/codice fiscale non sembra giusto/.test(no.body.err));
  eq((await ospite('ricevuta', { code, dati: Object.assign({}, DATI, { cap: '381' }) })).status, 400);
  eq(global.__mails.length, 0, 'con i dati sbagliati non parte nulla');
  const r = await ospite('ricevuta', { code, lingua: 'it', dati: Object.assign({ nota: 'Serve per il rimborso spese' }, DATI) });
  eq(r.status, 200, JSON.stringify(r.body)); eq([r.body.stato, r.body.invio], ['richiesta', 'ma***@test.it']); assert(r.body.richiesta_il);
  const o = mailsTo('owner@test')[0];
  assert(o && /Richiesta di ricevuta/.test(o.subject) && /RSSMRA80A01H501U/.test(o.text) && /Via Roma 1, 38123 Trento, Italia/.test(o.text) && /Mandala a: mario@test.it/.test(o.text) && /Serve per il rimborso spese/.test(o.text) && o.text.includes('#prenotazioni/' + code), o && o.text);
  const m = await ospite('mie', { code }); eq(m.body.soggiorno.ricevuta.stato, 'richiesta'); assert(!/RSSMRA|Via Roma/.test(JSON.stringify(m.body)), 'all\'area ospiti non tornano i dati inseriti');
  const l = (await H.adminApi('ricevute', {})).body.ricevute; eq(l.length, 1); eq([l[0].code, l[0].cf, l[0].citta, l[0].stato], [code, 'RSSMRA80A01H501U', 'Trento', 'richiesta']);
  // invio: solo PDF, JPG o PNG veri
  eq((await H.adminApi('ricevuta_invia', { code, file: 'data:application/pdf;base64,' + Buffer.from('<html>').toString('base64') })).status, 400);
  eq((await H.adminApi('ricevuta_invia', { code, file: 'data:text/html;base64,PGI+' })).status, 400);
  eq((await H.api('ricevuta_invia', { code, file: pdf() })).status, 401, 'solo con login');
  global.__mails = [];
  const s = await H.adminApi('ricevuta_invia', { code, file: pdf('n. 12/2026'), nome: 'Ricevuta 12 Rossi.pdf', messaggio: 'Grazie ancora!' }); eq(s.status, 200, JSON.stringify(s.body));
  eq(global.__mails.length, 1); const g = global.__mails[0];
  assert(g.to === 'mario@test.it' && /La tua ricevuta/.test(g.subject) && /In allegato trovi la ricevuta del tuo soggiorno: Torre, dal martedì 20 ottobre 2026 al venerdì 23 ottobre 2026/.test(g.text) && /Grazie ancora!/.test(g.text), g.text);
  eq(g.attachments.map(x => [x.filename, x.contentType, x.content.slice(0, 5).toString()]), [['Ricevuta 12 Rossi.pdf', 'application/pdf', '%PDF-']]);
  eq((await ospite('mie', { code })).body.soggiorno.ricevuta.stato, 'inviata');
  const again = await ospite('ricevuta', { code, dati: DATI }); eq(again.status, 409, 'già mandata: per correzioni si scrive');
  // 30 giorni dopo l'invio i dati si cancellano, anche se nessuno apre la Gestione (sincronizzazione periodica)
  clock.advance(29 * 24 * 60 * MIN); await H.sync(); eq(kv.exec(['HGETALL', 'ric']).length, 2, 'dopo 29 giorni ci sono ancora');
  clock.advance(2 * 24 * 60 * MIN); await H.sync(); eq(kv.exec(['HGETALL', 'ric']).length, 0, 'dopo 31 giorni cancellati'); eq((await H.adminApi('ricevute', {})).body.ricevute.length, 0);
});

test('F2 ricevuta per un ospite di Airbnb (serve l\'email); straniero senza codice fiscale; testo con HTML resta testo; al massimo 5 richieste valide al giorno; segnata come inviata o tolta dalla Gestione', async () => {
  await base(); regAirbnb(); global.__mails = [];
  const c = 'HMSEDESZCW', dati = { nome: 'Hans <b>Müller</b>', indirizzo: 'Hauptstraße 5', cap: '80331', citta: 'München', paese: 'Germania' };
  eq((await ospite('mie', { code: c })).body.soggiorno.ricevuta.emailPren, '', 'per Airbnb non abbiamo l\'email');
  const no = await ospite('ricevuta', { code: c, dati }); eq(no.status, 400); assert(/email/.test(no.body.err));
  const r = await ospite('ricevuta', { code: c, lingua: 'de', dati: Object.assign({ email: 'hans@test.de' }, dati) }); eq(r.status, 200, JSON.stringify(r.body)); eq(r.body.invio, 'ha***@test.de');
  const o = global.__mails[0]; assert(!/<b>Müller<\/b>/.test(o.html) && /&lt;b&gt;Müller/.test(o.html), 'il nome resta testo nell\'email');
  for (let i = 0; i < 4; i++) eq((await ospite('ricevuta', { code: c, dati: Object.assign({ email: 'hans@test.de' }, dati) })).status, 200);
  eq((await ospite('ricevuta', { code: c, dati: Object.assign({}, dati, { cap: '' }) })).status, 400, 'i dati sbagliati non contano nel limite');
  const lim = await ospite('ricevuta', { code: c, dati: Object.assign({ email: 'hans@test.de' }, dati) }); eq(lim.status, 429); assert(/diverse richieste/.test(lim.body.err));
  eq(global.__mails.length, 5, 'cinque avvisi al titolare, non sei');
  global.__mails = [];
  eq((await H.adminApi('ricevuta_invia', { code: c, file: pdf() })).status, 200); eq(global.__mails[0].to, 'hans@test.de'); assert(/Ihre Quittung/.test(global.__mails[0].subject));
  eq((await H.adminApi('ricevuta_stato', { code: c, stato: 'richiesta' })).body.ricevuta.stato, 'richiesta');
  eq((await H.adminApi('ricevuta_stato', { code: c, stato: 'inviata' })).body.ricevuta.stato, 'inviata');
  eq((await H.adminApi('ricevuta_stato', { code: c, stato: 'elimina' })).status, 200); eq((await H.adminApi('ricevute', {})).body.ricevute.length, 0);
  eq((await H.adminApi('ricevuta_invia', { code: c, file: pdf() })).status, 409, 'senza richiesta non abbiamo l\'email di un ospite Airbnb');
});

/* ===================== check-in online fatto (api/_checkin.js) ===================== */
// Sessione Stripe del check-in (progetto Checkin, stesso account Stripe): dataCheckin la distingue dai pagamenti del sito, numeroPrenotazione
// c'è solo se l'ospite ha verificato la prenotazione nel primo passo del modulo.
const ckSess = (numero, o) => Object.assign({ id: 'cs_ck_' + Math.random().toString(36).slice(2, 10), object: 'checkout.session', payment_status: 'paid', status: 'complete', amount_total: 900,
  created: Math.floor(clock.now() / 1000), customer_details: { email: 'ospite@test.it' },
  metadata: Object.assign({ dataCheckin: '2026-10-20', appartamento: 'La Columbera - Torre, Appartamento con 2 camere da letto', numeroOspiti: '2', numeroNotti: '3', totale: '9', lingua: 'it', temp_session_id: 'temp_1' }, numero == null ? {} : { numeroPrenotazione: numero }) }, o || {});
const ckKey = code => kv.exec(['GET', 'ck:' + code]);
const conCassetta = async (id, codice) => { const c = (await H.adminApi('cfg_admin', {})).body; c.apts.find(p => p.id === id).cassetta = codice; eq((await H.adminApi('save', c)).status, 200); };

test('C1 check-in online pagato con il numero di prenotazione: l\'area clienti lo sa (Check-in completato); il codice della cassetta solo negli stessi giorni del Wi-Fi, mai nella configurazione pubblica; ripetere l\'evento non cambia nulla', async () => {
  await base(); await conCassetta('torre', '4821');
  const code = await pagata(); global.__mails = [];
  let s = (await ospite('mie', { code })).body.soggiorno;
  eq([s.checkin, s.cassetta], [{ fatto: false }, null], 'prima del check-in: niente');
  eq((await H.webhook('checkout.session.completed', ckSess(' ' + code.toLowerCase() + ' '))).status, 200);
  const reg = JSON.parse(ckKey(code)); assert(reg && reg.il && /^cs_ck_/.test(reg.sid), 'check-in registrato per il codice della prenotazione');
  const ttl = kv.get('ck:' + code).exp - clock.now(); assert(ttl > 49 * 864e5 && ttl < 52 * 864e5, 'scade 30 giorni dopo la partenza: ' + ttl / 864e5);
  eq([bk(code).stato, global.__mails.length], ['confermata', 0], 'il pagamento del check-in non tocca la prenotazione e non manda email dal sito');
  s = (await ospite('mie', { code })).body.soggiorno;
  eq([s.checkin, s.cassetta], [{ fatto: true, il: '2026-10-02' }, { dal: '2026-10-18' }], 'fatto; il codice compare 2 giorni prima dell\'arrivo (come il Wi-Fi)');
  assert(!JSON.stringify(s).includes('4821'), 'prima di quei giorni il codice non c\'è');
  const pub = await H.api('cfg', {}, { method: 'GET' }); assert(!/4821|cassetta/.test(pub.text), 'mai nella configurazione pubblica');
  // stesso evento di nuovo (Stripe lo rimanda), anche il giorno dopo: la registrazione resta quella di prima
  clock.advance(864e5); eq((await H.webhook('checkout.session.completed', ckSess(code, { id: reg.sid }))).status, 200); eq(JSON.parse(ckKey(code)).il, reg.il);
  clock.set('2026-10-18T07:00:00Z'); s = (await ospite('mie', { code })).body.soggiorno;
  eq(s.cassetta, { codice: '4821' }, 'dal giorno giusto il codice c\'è');
  clock.set('2026-10-23T20:00:00Z'); eq((await ospite('mie', { code })).body.soggiorno.cassetta, { codice: '4821' }, 'fino al giorno della partenza');
  clock.set('2026-10-24T08:00:00Z'); s = (await ospite('mie', { code })).body.soggiorno;
  eq([s.checkin.fatto, s.cassetta], [true, null], 'dopo la partenza il check-in resta fatto, il codice sparisce');
});

test('C2 check-in non collegato: verifica saltata (senza numero), non pagato, numero non valido o di un pagamento del sito = nessuna registrazione. Airbnb: vale il numero del portale; senza codice in Gestione vale la variabile CODICE_CASSETTA_*', async () => {
  await base(); const code = await pagata();
  for (const x of [ckSess(null), ckSess(code, { payment_status: 'unpaid' }), ckSess('<b>' + code + '</b>'), ckSess('ab')]) eq((await H.webhook('checkout.session.completed', x)).status, 200);
  eq([...kv.d.keys()].filter(k => /^ck:/.test(k)), [], 'niente registrato');
  eq((await H.webhook('checkout.session.completed', Object.assign(H.paidSession(code), { metadata: { code, numeroPrenotazione: code } }))).status, 200);
  eq(ckKey(code), null, 'un pagamento del sito non è un check-in');
  eq((await ospite('mie', { code })).body.soggiorno.checkin, { fatto: false });
  // prenotazione Airbnb del foglio: il numero del portale (anche in minuscolo) è il codice dell'area clienti
  regAirbnb(); process.env.CODICE_CASSETTA_CORTE = '7310';
  eq((await H.webhook('checkout.session.completed', ckSess('hmsedeszcw', { metadata: { dataCheckin: '2026-11-05', numeroNotti: '3', numeroPrenotazione: 'hmsedeszcw', appartamento: 'La Columbera - Corte' } }))).status, 200);
  clock.set('2026-11-04T09:00:00Z'); await H.sync(); regAirbnb();
  const s = (await ospite('mie', { code: 'HMSEDESZCW' })).body.soggiorno;
  eq([s.checkin.fatto, s.cassetta], [true, { codice: '7310' }], 'Airbnb: check-in fatto e codice dalla variabile');
  await conCassetta('corte', '5555'); eq((await ospite('mie', { code: 'HMSEDESZCW' })).body.soggiorno.cassetta, { codice: '5555' }, 'il codice scritto in Gestione vale più della variabile');
});

test('C3 webhook perso: la sincronizzazione rilegge su Stripe le sessioni degli ultimi 3 giorni (chiuse da almeno 35 minuti) e registra il check-in, con l\'avviso nel registro eventi; al più ogni 10 minuti; Stripe giù non ferma la sincronizzazione', async () => {
  await base(); const code = await pagata(), t = Math.floor(clock.now() / 1000);
  global.__stripeList = [ckSess(code, { created: t - 3600 }), ckSess(null, { created: t - 3600 }), ckSess('ALTRO123', { created: t - 600 }), ckSess('VECCHIO1', { created: t - 4 * 86400 }), Object.assign(H.paidSession(code), { created: t - 3600 })];
  global.__stripeListCalls = 0; kv.exec(['DEL', 'checkin:ric']);      // il controllo della sincronizzazione di base() è appena passato
  const r = await H.sync(); eq(r.status, 200); eq(r.body.checkin, { controllate: 1, recuperati: 1, errore: false });
  assert(ckKey(code), 'registrato dal controllo su Stripe'); eq([ckKey('ALTRO123'), ckKey('VECCHIO1')], [null, null], 'troppo recente (il webhook può ancora arrivare) o troppo vecchio: non si guarda');
  assert(/Check-in online: 1 check-in registrato dal controllo su Stripe/.test(logTxt()) && !logTxt().includes(code), 'avviso nel registro, senza il codice');
  eq((await ospite('mie', { code })).body.soggiorno.checkin, { fatto: true, il: '2026-10-02' });
  eq(JSON.parse(ckKey(code)).il, new Date((t - 3600) * 1000).toISOString(), 'il momento del pagamento (dalla sessione), non quello del controllo');
  await H.sync(); eq(global.__stripeListCalls, 1, 'entro 10 minuti non si richiede a Stripe');
  clock.advance(11 * MIN); global.__stripeSessionsListFail = true;
  const r2 = await H.sync(); eq(r2.status, 200); eq(r2.body.checkin.errore, true); assert(/controllo su Stripe non riuscito/.test(logTxt()));
  global.__stripeSessionsListFail = false; clock.advance(11 * MIN); eq((await H.sync()).body.checkin, { controllate: 1, recuperati: 0, errore: false }, 'già registrato: nessun nuovo avviso');
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
