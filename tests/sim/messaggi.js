'use strict';
// La Columbera · prove dei MESSAGGI (area clienti ↔ Gestione), dei template, dei messaggi automatici e della traduzione.
// Stesso banco di prova di sicurezza.js: codice REALE di Vercel, Redis finto, Stripe, SMTP e DeepL finti, orologio simulato. Dati di fantasia.
//
//   cd <repo> && node tests/sim/messaggi.js [filtro]      (serve wasmoon, come per scenarios.js)
const assert = require('assert'), H = require('./harness'), { clock, kv, MIN } = H;
const eq = (a, b, m) => assert.deepStrictEqual(a, b, m);
const HDR = ['Numero Prenotazione', 'Data Check-in', 'Appartamento', 'Numero Ospiti', 'Numero Notti'];

async function base(env) {
  const e = await H.newEnv({ legacyRows: [HDR], env: Object.assign({ ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw' }, env || {}) });
  await H.runGas(e.gas, 'setup'); await H.sync();
  return e;
}
const regAirbnb = () => {      // una prenotazione Airbnb nel registro del foglio (lo stub dello script non lo popola)
  const snap = JSON.parse(kv.exec(['GET', 'reg:snap']) || '{"rows":[]}');
  snap.rows = [{ id: 'AIRBNB|HMSEDESZCW', fonte: 'AIRBNB', codice: 'HMSEDESZCW', apt: 'corte', checkin: '2026-10-05', checkout: '2026-10-11', notti: 6, ospiti: 2, stato: 'CONFERMATA', uid: '', motivo: '', creata: '', aggiornata: '', ultimoSeen: '', annullata: '', note: '', flags: [] }];
  kv.exec(['SET', 'reg:snap', JSON.stringify(Object.assign({ invalid: [], count: 1, lastAttempt: clock.iso(), lastSuccess: clock.iso(), status: 'OK' }, snap))]);
};
let ipN = 0;
const as = () => ({ headers: { 'x-real-ip': '203.0.113.' + (++ipN % 250) } });
const ospite = (a, body) => H.api(a, body, as());
async function confermata(o) {        // prenotazione del sito pagata e confermata: { code, t }
  const c = await H.api('checkout', Object.assign({ id: 'torre', da: '2026-12-10', a: '2026-12-13', ospiti: 2, nome: 'Mario Prova', email: 'mario.prova@esempio.it' }, o), as());
  eq(c.status, 200, JSON.stringify(c.body));
  await H.webhook('checkout.session.completed', H.paidSession(c.body.code));
  global.__mails.length = 0;
  return c.body;
}
const sync = () => H.sync();
const thread = async code => (await H.adminApi('msg_thread', { code })).body;
const mailsTo = to => global.__mails.filter(m => m.to === to);
async function logs(fn) {
  const out = [], o = {}; for (const k of ['log', 'warn', 'error', 'info']) { o[k] = console[k]; console[k] = (...a) => out.push(a.map(String).join(' ')); }
  try { await fn(); } finally { Object.assign(console, o); }
  return out.join('\n');
}
const tests = [], test = (n, f) => tests.push({ n, f });

test('M1  ospite e titolare si scrivono: lettura, non letti, «letto», versione (il controllo periodico legge una sola chiave)', async () => {
  await base();
  const c = await confermata();
  let r = await ospite('mie', { code: c.code, t: c.t });
  eq(r.body.soggiorno.messaggi, { attivi: true, nonLetti: 0 });
  r = await ospite('msg_send', { code: c.code, t: c.t, testo: '  Ciao, a che ora possiamo arrivare?\r\n\r\n\r\n\r\n\r\nGrazie\u0007 ', lingua: 'it' });
  eq(r.status, 200, JSON.stringify(r.body)); eq(r.body.testo, 'Ciao, a che ora possiamo arrivare?\n\n\nGrazie', 'testo ripulito (a capo, caratteri di controllo)');
  let inb = (await H.adminApi('msg_inbox', {})).body;
  eq([inb.nonLetti, inb.conversazioni.length, inb.conversazioni[0].code, inb.conversazioni[0].nome, inb.conversazioni[0].nonLetti], [1, 1, c.code, 'Mario Prova', 1]);
  eq((await H.adminApi('adm', {})).body.msgNonLetti, 1, 'badge del menu');
  let th = await thread(c.code);
  eq([th.messaggi.length, th.messaggi[0].da, th.scrivibile, th.prenotazione.email], [1, 'ospite', true, 'mario.prova@esempio.it']);
  eq((await H.adminApi('msg_inbox', {})).body.nonLetti, 0, 'aperta la conversazione: letta');
  r = await H.adminApi('msg_reply', { code: c.code, testo: 'Dalle 16:00, vi aspettiamo!' });
  eq(r.status, 200); eq(r.body.da, 'host');
  r = await ospite('mie', { code: c.code, t: c.t }); eq(r.body.soggiorno.messaggi.nonLetti, 1, 'l\'ospite ha un messaggio non letto');
  th = await thread(c.code); eq(th.messaggi[1].letto, false, 'non ancora letto');
  const l = await ospite('msg_list', { code: c.code, t: c.t, lingua: 'it' });
  eq(l.body.messaggi.map(m => [m.da, m.testo]), [['ospite', 'Ciao, a che ora possiamo arrivare?\n\n\nGrazie'], ['host', 'Dalle 16:00, vi aspettiamo!']]);
  eq((await ospite('mie', { code: c.code, t: c.t })).body.soggiorno.messaggi.nonLetti, 0, 'letto');
  th = await thread(c.code); eq(th.messaggi[1].letto, true, '«letto» per il titolare');
  const v = l.body.v, calls = kv.calls;
  r = await ospite('msg_list', { code: c.code, t: c.t, lingua: 'it', v });
  eq([r.body.v, r.body.invariato, r.body.messaggi], [v, true, undefined], 'niente di nuovo');
  assert(kv.calls - calls < 15, 'il controllo periodico costa pochi comandi KV: ' + (kv.calls - calls));
  r = await H.adminApi('msg_thread', { code: c.code, v: th.v, lo: th.lo }); eq(r.body.invariato, true, 'anche per il titolare');
  await H.adminApi('msg_reply', { code: c.code, testo: 'A presto' });
  assert(!(await ospite('msg_list', { code: c.code, t: c.t, lingua: 'it', v })).body.invariato, 'dopo un messaggio nuovo la versione cambia');
});

test('M2  chi può scrivere: solo prenotazioni del sito confermate; Booking/Airbnb, annullate, codici sbagliati → no; limite di 20 messaggi l\'ora', async () => {
  await base(); regAirbnb(); clock.set('2026-10-03T08:00:00Z');
  eq((await ospite('mie', { code: 'HMSEDESZCW' })).body.soggiorno.messaggi, { attivi: false }, 'Airbnb: niente chat nell\'area');
  eq((await ospite('msg_send', { code: 'HMSEDESZCW', testo: 'ciao' })).status, 404);
  eq((await ospite('msg_list', { code: 'ZZZZZZZZZZZZZ' })).status, 404);
  const c = await confermata();
  eq((await ospite('msg_send', { code: c.code, testo: 'col solo codice' })).status, 200, 'basta il codice, come per l\'area');
  eq((await ospite('msg_send', { code: c.code, t: c.t, testo: '   ' })).status, 400);
  eq((await ospite('msg_send', { code: c.code, t: c.t, testo: 'x'.repeat(2001) })).status, 400, 'oltre 2000 caratteri');
  eq((await ospite('msg_send', { code: c.code, t: c.t, testo: ['a'] })).status, 400);
  for (let i = 0; i < 19; i++) eq((await ospite('msg_send', { code: c.code, t: c.t, testo: 'n. ' + i })).status, 200);
  const r = await ospite('msg_send', { code: c.code, t: c.t, testo: 'uno di troppo' });
  eq(r.status, 429); assert(/molti messaggi/.test(r.body.err) && +r.headers['retry-after'] > 0, r.body.err);
  clock.advance(61 * MIN); eq((await ospite('msg_send', { code: c.code, t: c.t, testo: 'dopo un\'ora' })).status, 200);
  eq((await H.adminApi('stato', { code: c.code, stato: 'annullata' })).status, 200);
  eq((await ospite('msg_list', { code: c.code, t: c.t })).status, 404, 'annullata: niente più chat');
  eq((await H.adminApi('msg_reply', { code: c.code, testo: 'x' })).status, 409, 'il titolare non scrive a una prenotazione annullata');
  eq((await H.adminApi('msg_thread', { code: c.code })).body.messaggi.length, 21, 'ma la conversazione resta leggibile');
  eq((await H.api('msg_inbox', {})).status, 401, 'Gestione: serve il login');
});

test('M3  avvisi email: al titolare uno ogni 15 minuti, senza il testo; all\'ospite solo se attivato, con il link che apre l\'area', async () => {
  await base();
  const c = await confermata();
  await ospite('msg_send', { code: c.code, t: c.t, testo: 'Testo riservato che non va per email' });
  await ospite('msg_send', { code: c.code, t: c.t, testo: 'secondo' });
  let m = mailsTo('owner@test'); eq(m.length, 1, 'un solo avviso');
  assert(/Nuovo messaggio da Mario Prova/.test(m[0].subject) && /admin\.html#messaggi/.test(m[0].text) && !/riservato/.test(m[0].text + m[0].html), m[0].text);
  clock.advance(16 * MIN); await ospite('msg_send', { code: c.code, t: c.t, testo: 'terzo' }); eq(mailsTo('owner@test').length, 2, 'dopo 15 minuti un altro');
  await H.adminApi('msg_reply', { code: c.code, testo: 'risposta' }); eq(mailsTo('mario.prova@esempio.it').length, 0, 'all\'ospite nessuna email (predefinito)');
  eq((await H.adminApi('msg_imp_save', { conservazione: 90, avvisaTitolare: false, avvisaOspite: true })).status, 200);
  await H.adminApi('msg_reply', { code: c.code, testo: 'seconda risposta' }); await H.adminApi('msg_reply', { code: c.code, testo: 'terza' });
  m = mailsTo('mario.prova@esempio.it'); eq(m.length, 1, 'avviso all\'ospite: uno ogni 6 ore');
  const link = /area-clienti\.html#c=([0-9A-Z]+)&t=([A-Za-z0-9_-]+)/.exec(m[0].text); assert(link && link[1] === c.code, m[0].text);
  eq((await ospite('msg_list', { code: c.code, t: link[2] })).status, 200, 'il link apre i messaggi');
  assert(!/seconda risposta|terza/.test(m[0].text + m[0].html), 'senza il testo');
  clock.advance(20 * MIN); await ospite('msg_send', { code: c.code, t: c.t, testo: 'quarto' }); eq(mailsTo('owner@test').length, 2, 'avvisi al titolare disattivati');
  eq((await H.adminApi('msg_imp_save', { conservazione: 3 })).status, 400);
});

test('M4  template: predefiniti, salvataggio, variabili (prenotazione del sito e del foglio), un template usato da una regola non si cancella', async () => {
  await base(); regAirbnb();
  const c = await confermata();
  let r = (await H.adminApi('msg_tpl', {})).body;
  assert(r.templates.length >= 3 && r.variabili.some(v => v[0] === 'link_area'), 'template e variabili');
  const f = await H.adminApi('msg_fill', { code: c.code, testo: 'Ciao {nome}! {appartamento}, {checkin} dalle {ora_checkin}, {notti} notti, {ospiti} ospiti. Codice {codice}: {link_area} {sconosciuta}' });
  const g = c.code.slice(0, 4) + ' ' + c.code.slice(4, 8) + ' ' + c.code.slice(8);
  eq(f.body.testo, 'Ciao Mario! Torre, giovedì 10 dicembre dalle 16:00, 3 notti, 2 ospiti. Codice ' + g + ': https://www.lacolumbera.test/area-clienti.html#k=' + c.code + ' {sconosciuta}');
  eq((await H.adminApi('msg_fill', { code: 'hmsedeszcw', testo: 'Ciao {nome}! Ecco: {link_area}' })).body.testo, 'Ciao! Ecco: https://www.lacolumbera.test/area-clienti.html#k=HMSEDESZCW', 'Airbnb: senza nome, il saluto resta pulito');
  eq((await H.adminApi('msg_fill', { code: 'NONESISTE', testo: 'x' })).status, 404);
  r = await H.adminApi('msg_tpl_save', { templates: [{ id: 'a', nome: 'Primo', testo: 'Testo <b>uno</b>' }, { nome: 'Secondo', testo: 'due' }] });
  eq(r.status, 200); eq(r.body.templates.map(x => x.nome), ['Primo', 'Secondo']); assert(r.body.templates[1].id, 'id assegnato');
  eq((await H.adminApi('msg_tpl_save', { templates: [{ id: 'a', nome: '', testo: 'x' }] })).status, 400);
  eq((await H.adminApi('msg_auto_save', { regole: [{ nome: 'R', attiva: true, tpl: 'a', base: 'arrivo', giorni: -2, ora: '10:00' }] })).status, 200);
  r = await H.adminApi('msg_tpl_save', { templates: [{ nome: 'Altro', testo: 'x' }] });
  eq(r.status, 409); assert(/regola «R»/.test(r.body.err), r.body.err);
  eq((await H.adminApi('msg_tpl', {})).body.templates.length, 2, 'nulla cambiato');
});

test('M5  regole automatiche: partono all\'ora giusta (fuso di Trento), una volta sola anche con due sincronizzazioni insieme; mai per le annullate', async () => {
  await base();
  const c = await confermata(), d = await confermata({ da: '2026-12-20', a: '2026-12-23', email: 'altra@esempio.it' });
  await H.adminApi('msg_tpl_save', { templates: [{ id: 'pre', nome: 'Promemoria', testo: 'Ciao {nome}, ci vediamo {checkin} dalle {ora_checkin}!' }] });
  eq((await H.adminApi('msg_auto_save', { regole: [{ id: 'r1', nome: 'Due giorni prima', attiva: true, tpl: 'pre', base: 'arrivo', giorni: -2, ora: '10:00' }] })).status, 200);
  eq((await H.adminApi('stato', { code: d.code, stato: 'annullata' })).status, 200);
  let p = (await H.adminApi('msg_auto', {})).body;
  eq(p.prossimi, [], 'nulla nei prossimi 7 giorni');
  clock.set('2026-12-02T09:00:00Z');
  p = (await H.adminApi('msg_auto', {})).body;
  eq(p.prossimi.map(x => [x.code, new Date(x.quando).toISOString(), x.nome]), [[c.code, '2026-12-08T09:00:00.000Z', 'Mario Prova']], 'in programma l\'8 dicembre alle 10 di Trento (09:00 UTC)');
  clock.set('2026-12-08T08:58:00Z'); await sync();
  eq((await thread(c.code)).messaggi.length, 0, 'non prima');
  clock.set('2026-12-08T09:02:00Z');
  await Promise.all([sync(), sync(), sync()]);
  let th = await thread(c.code);
  eq(th.messaggi.map(m => [m.da, m.testo, m.regola]), [['auto', 'Ciao Mario, ci vediamo giovedì 10 dicembre dalle 16:00!', 'r1']], 'un solo messaggio');
  clock.advance(20 * MIN); await sync(); eq((await thread(c.code)).messaggi.length, 1, 'nessun doppione ai giri dopo');
  eq((await H.adminApi('msg_thread', { code: d.code })).body.messaggi.length, 0, 'annullata: niente');
  eq((await H.adminApi('msg_auto', {})).body.prossimi, [], 'partito: non è più tra i prossimi');
  eq((await ospite('msg_list', { code: c.code, t: c.t })).body.messaggi[0].auto, true);
});

test('M6  regole automatiche: attivarne una non manda messaggi arretrati; «invia comunque se in ritardo»; sincronizzazione ferma oltre 36 ore = saltato; «salta»', async () => {
  await base();
  await H.adminApi('msg_tpl_save', { templates: [{ id: 't', nome: 'T', testo: 'Promemoria' }] });
  const c = await confermata();                                                      // 10 dicembre
  clock.set('2026-12-09T12:00:00Z');                                                 // la regola nasce dopo il momento d'invio (8 dicembre)
  await H.adminApi('msg_auto_save', { regole: [{ id: 'senza', nome: 'Senza ritardo', attiva: true, tpl: 't', base: 'arrivo', giorni: -2, ora: '10:00' }, { id: 'con', nome: 'Con ritardo', attiva: true, tpl: 't', base: 'arrivo', giorni: -2, ora: '10:00', ritardo: true }] });
  await sync();
  eq((await thread(c.code)).messaggi.map(m => m.regola), ['con'], 'solo la regola con «in ritardo»');
  // prenotazione dell'ultimo minuto: arriva domani, il momento (due giorni prima) è già passato
  const d = await confermata({ da: '2026-12-10', a: '2026-12-12', id: 'corte', email: 'ultimo@esempio.it' });
  await sync();
  eq((await thread(d.code)).messaggi.map(m => m.regola), ['con'], 'in ritardo: parte subito');
  clock.set('2026-12-11T12:00:00Z');
  const e = await confermata({ da: '2026-12-12', a: '2026-12-14', id: 'corte', email: 'tardi@esempio.it' });
  clock.set('2026-12-12T23:30:00Z'); await sync();                                   // 00:30 del 13 a Trento: il giorno di arrivo è finito
  eq((await thread(e.code)).messaggi.length, 0, 'finito il giorno di arrivo un promemoria non ha più senso');
  // sincronizzazione ferma per più di 36 ore: il messaggio non parte più
  const f = await confermata({ da: '2027-01-10', a: '2027-01-12', email: 'fermo@esempio.it' });
  clock.set('2027-01-09T23:00:00Z'); await sync();
  eq((await thread(f.code)).messaggi.length, 0, 'scaduto: oltre 36 ore');
  // il titolare salta un singolo invio
  const g = await confermata({ da: '2027-01-20', a: '2027-01-22', email: 'salta@esempio.it' });
  clock.set('2027-01-15T10:00:00Z');
  let pr = (await H.adminApi('msg_auto', {})).body.prossimi.filter(x => x.code === g.code);
  eq(pr.map(x => [x.regola, x.stato]), [['senza', ''], ['con', '']]);
  eq((await H.adminApi('msg_salta', { regola: 'senza', code: g.code })).status, 200);
  pr = (await H.adminApi('msg_auto', {})).body.prossimi.filter(x => x.code === g.code);
  eq(pr.map(x => [x.regola, x.stato]), [['senza', 'saltato'], ['con', '']]);
  clock.set('2027-01-18T09:30:00Z'); await sync();
  eq((await thread(g.code)).messaggi.map(m => m.regola), ['con'], 'il saltato non parte');
  eq((await H.adminApi('msg_salta', { regola: 'con', code: g.code })).status, 409, 'uno già partito non si salta');
});

test('M7  traduzione (DeepL): l\'ospite scrive in inglese → il titolare legge in italiano; la risposta arriva in inglese; i template senza dati personali', async () => {
  await base({ DEEPL_API_KEY: 'chiave-prova:fx' });
  const c = await confermata();
  await ospite('msg_list', { code: c.code, t: c.t, lingua: 'en' });                     // l'ospite usa l'area in inglese
  await ospite('msg_send', { code: c.code, t: c.t, testo: 'Thanks, we arrive at 6pm', lingua: 'en' });
  let th = await thread(c.code);
  eq([th.lingua, th.traduzione, th.messaggi[0].lingua, th.messaggi[0].tradotto], ['en', true, 'en', '[IT] Thanks, we arrive at 6pm']);
  assert(global.__deepl.calls.every(x => /^DeepL-Auth-Key chiave-prova:fx$/.test(x.auth) && /api-free\.deepl\.com/.test(x.url)), 'chiave del piano gratuito → api-free');
  await H.adminApi('msg_reply', { code: c.code, testo: 'Perfetto, a presto' });
  let l = (await ospite('msg_list', { code: c.code, t: c.t, lingua: 'en' })).body.messaggi;
  eq([l[1].testo, l[1].originale], ['[EN] Perfetto, a presto', 'Perfetto, a presto'], 'tradotta nella lingua dell\'ospite, con l\'originale');
  l = (await ospite('msg_list', { code: c.code, t: c.t, lingua: 'de' })).body.messaggi;
  eq(l[1].testo, '[DE] Perfetto, a presto', 'cambia lingua: si traduce al volo (e resta salvata)');
  const n = global.__deepl.calls.length; await ospite('msg_list', { code: c.code, t: c.t, lingua: 'de' }); eq(global.__deepl.calls.length, n, 'già tradotto: nessuna nuova chiamata');
  eq((await H.adminApi('msg_reply', { code: c.code, testo: 'Solo italiano', traduci: false })).status, 200);
  // messaggio automatico: DeepL riceve il template con le variabili protette, mai i dati della prenotazione
  await H.adminApi('msg_tpl_save', { templates: [{ id: 'w', nome: 'Wi-Fi', testo: 'Ciao {nome}, il codice è {codice} & il Wi-Fi è {wifi}.' }] });
  const cf = (await H.adminApi('cfg_admin', {})).body; cf.apts.find(p => p.id === 'torre').infoRiservate = 'Password: SEGRETA'; await H.adminApi('save', cf);
  await H.adminApi('msg_auto_save', { regole: [{ id: 'conf', nome: 'Alla conferma', attiva: true, tpl: 'w', base: 'conferma' }] });
  const d = await confermata({ da: '2027-02-10', a: '2027-02-12', email: 'nuovo@esempio.it' });
  const k0 = global.__deepl.calls.length; await sync();
  const sent = global.__deepl.calls.slice(k0).map(x => JSON.stringify(x.body)).join('\n');
  assert(sent.includes('<x>{nome}</x>') && sent.includes('&amp;') && !/Mario|SEGRETA|nuovo@|Prova/.test(sent) && !sent.includes(d.code), 'template protetto: ' + sent);
  const ld = (await ospite('msg_list', { code: d.code, t: d.t, lingua: 'en' })).body.messaggi[0];
  eq(ld.testo, '[EN] Ciao Mario, il codice è ' + d.code.slice(0, 4) + ' ' + d.code.slice(4, 8) + ' ' + d.code.slice(8) + ' & il Wi-Fi è Password: SEGRETA.', 'variabili inserite dopo la traduzione');
  eq(ld.originale.startsWith('Ciao Mario'), true);
});

test('M8  traduzione non disponibile (DeepL giù, lento o senza chiave): il messaggio parte e si legge in originale', async () => {
  await base({ DEEPL_API_KEY: 'chiave-pro', DEEPL_TIMEOUT_MS: '150' });
  const c = await confermata();
  global.__deepl.mode = 'down';
  let r = await ospite('msg_send', { code: c.code, t: c.t, testo: 'Hello, is parking free?', lingua: 'en' }); eq(r.status, 200);
  let th = await thread(c.code); eq([th.messaggi[0].testo, th.messaggi[0].tradotto], ['Hello, is parking free?', undefined]);
  assert(global.__deepl.calls.every(x => /\/\/api\.deepl\.com\//.test(x.url)), 'chiave Pro → api.deepl.com');
  global.__deepl.mode = 'slow';
  r = await H.adminApi('msg_reply', { code: c.code, testo: 'Sì, gratuito' }); eq(r.status, 200, 'DeepL lento: si risponde lo stesso');
  global.__deepl.mode = 'ok';
  th = await thread(c.code); eq(th.messaggi[0].tradotto, '[IT] Hello, is parking free?', 'tornato DeepL: la traduzione mancante si completa alla lettura');
  await base();
  const d = await confermata(); r = await ospite('msg_send', { code: d.code, t: d.t, testo: 'Hello', lingua: 'en' }); eq(r.status, 200);
  eq((await thread(d.code)).traduzione, false, 'senza chiave: traduzione spenta');
  eq(global.__deepl.calls.length, 0, 'e nessuna chiamata a DeepL');
});

test('M9  messaggi programmati a mano; la sincronizzazione delle date continua anche se i messaggi falliscono; niente testi nei log', async () => {
  await base();
  const c = await confermata(), d = await confermata({ da: '2026-12-20', a: '2026-12-23', email: 'altra@esempio.it' });
  let r = await H.adminApi('msg_prog_add', { code: c.code, testo: 'Messaggio programmato riservato', quando: '2026-10-05T08:00:00Z' }); eq(r.status, 200);
  eq((await H.adminApi('msg_prog_add', { code: c.code, testo: 'x', quando: '2026-10-01T08:00:00Z' })).status, 400, 'nel passato no');
  const p2 = (await H.adminApi('msg_prog_add', { code: d.code, testo: 'per una prenotazione che si annullerà', quando: '2026-10-05T08:00:00Z' })).body;
  const p3 = (await H.adminApi('msg_prog_add', { code: c.code, testo: 'questo lo annullo', quando: '2026-10-05T08:00:00Z' })).body;
  eq((await H.adminApi('msg_prog_del', { id: p3.id })).status, 200);
  await H.adminApi('stato', { code: d.code, stato: 'annullata' });
  eq((await H.adminApi('msg_auto', {})).body.programmati.map(x => [x.code, x.nome]), [[c.code, 'Mario Prova'], [d.code, 'Mario Prova']]);
  clock.set('2026-10-05T08:10:00Z');
  const out = await logs(async () => { r = await sync(); });
  eq(r.status, 200); eq(r.body.messaggi.inviati, 1);
  eq((await thread(c.code)).messaggi.map(m => m.testo), ['Messaggio programmato riservato']);
  eq((await thread(d.code)).messaggi.length, 0, 'annullata: non partito');
  eq((await H.adminApi('msg_auto', {})).body.programmati, [], 'elenco vuoto');
  assert(!/riservato|Mario|mario/.test(out), 'niente testi né nomi nei log');
  // KV che fallisce sulle chiavi dei messaggi: la sincronizzazione delle date risponde lo stesso
  await H.adminApi('msg_tpl_save', { templates: [{ id: 't', nome: 'T', testo: 'x' }] });
  await H.adminApi('msg_auto_save', { regole: [{ id: 'r', nome: 'R', attiva: true, tpl: 't', base: 'conferma' }] });
  kv.after = async cmd => { if (/^msg:(auto|prog)$/.test(String(cmd[1]))) throw new Error('KV giù per i messaggi'); };
  H.setFeed('bookingTorre', [H.bookingEv('nuovo', '2026-11-01', '2026-11-03')]);
  r = await H.sync(); kv.after = null;
  eq(r.status, 200, 'sincronizzazione riuscita'); assert(r.body.messaggi.errori >= 1, JSON.stringify(r.body.messaggi));
  assert((await H.busyDates('torre')).includes('2026-11-01'), 'il calendario è aggiornato lo stesso');
});

test('M10 conservazione: la conversazione si cancella N giorni dopo la partenza (90 di predefinito), non prima', async () => {
  await base();
  const c = await confermata();                                                      // partenza 13/12/2026
  await ospite('msg_send', { code: c.code, t: c.t, testo: 'ciao' });
  await H.adminApi('msg_reply', { code: c.code, testo: 'ciao a te' });
  clock.set('2027-03-12T10:00:00Z'); await sync();                                   // 89 giorni dopo
  eq((await thread(c.code)).messaggi.length, 2, 'ancora lì');
  clock.set('2027-03-14T10:00:00Z'); await sync();                                   // 91 giorni dopo (e più di 20 ore dal controllo precedente)
  eq((await thread(c.code)).messaggi.length, 0, 'cancellata');
  eq((await H.adminApi('msg_inbox', {})).body.conversazioni.length, 0);
  const resto = [...kv.d.keys()].filter(k => kv.get(k) && k.startsWith('msg:') && (k.includes(c.code) || JSON.stringify(kv.get(k).v).includes(c.code)));      // le chiavi scadute non contano
  eq(resto, [], 'nessuna chiave dei messaggi rimasta');
});

test('M11 controllo leggero (msg_v): solo con il token, pochissimi comandi, limite suo (non consuma le consultazioni dell\'area); senza prenotazioni nessuna cancellazione', async () => {
  await base();
  const c = await confermata(), ip1 = { headers: { 'x-real-ip': '192.0.2.77' } };
  const v0 = (await H.api('msg_v', { code: c.code, t: c.t }, ip1)).body.v;
  await H.adminApi('msg_reply', { code: c.code, testo: 'ciao' });
  const n = kv.calls, r = await H.api('msg_v', { code: c.code, t: c.t }, ip1);
  eq(r.status, 200); assert(r.body.v > v0, 'la versione cresce con un messaggio nuovo'); assert(kv.calls - n <= 5, 'comandi KV: ' + (kv.calls - n));
  eq((await H.api('msg_v', { code: c.code }, ip1)).status, 404, 'senza token: no');
  eq((await H.api('msg_v', { code: c.code, t: 'x'.repeat(22) }, ip1)).status, 404, 'token sbagliato: no');
  for (let i = 0; i < 100; i++) await H.api('msg_v', { code: c.code, t: c.t }, ip1);
  eq((await H.api('mie', { code: c.code, t: c.t }, ip1)).status, 200, '100 controlli leggeri non bloccano l\'area');
  for (let i = 0; i < 140; i++) await H.api('msg_v', { code: c.code, t: c.t }, ip1);
  eq((await H.api('msg_v', { code: c.code, t: c.t }, ip1)).status, 429, 'oltre 240 in 10 minuti');
  // conservazione: se l'elenco delle prenotazioni è vuoto (KV non ha risposto) non si cancella nulla; una conversazione orfana solo dopo 90 giorni ferma
  const MSG = require('../../api/_messaggi.js').makeMessaggi({ kv: (...a) => kv.run(a), kvp: cmds => Promise.all(cmds.map(x => kv.run(x))), now: () => clock.now() });
  eq((await MSG.pulizia([])).cancellate, 0); eq((await MSG.pulizia(null)).cancellate, 0);
  eq((await thread(c.code)).messaggi.length, 1, 'ancora lì');
  kv.exec(['DEL', 'msg:pulizia']); eq((await MSG.pulizia([{ code: 'ALTRA', a: '2026-12-01' }])).cancellate, 0, 'orfana ma recente: resta');
  clock.advance(91 * 24 * 60 * MIN); kv.exec(['DEL', 'msg:pulizia']);
  eq((await MSG.pulizia([{ code: 'ALTRA', a: '2026-12-01' }])).cancellate, 1, 'orfana e ferma da oltre 90 giorni: cancellata');
});

/* ===================== esecuzione ===================== */
(async () => {
  const only = process.argv[2]; let pass = 0, fail = 0; const t0 = process.hrtime.bigint();
  for (const t of tests) {
    if (only && !t.n.startsWith(only)) continue;
    try { await t.f(); console.log('  ✔ ' + t.n); pass++; }
    catch (e) { console.log('  ✘ ' + t.n + '\n      → ' + String(e.stack || e.message).split('\n').slice(0, only ? 40 : 6).join('\n        ')); fail++; }
    finally { kv.after = null; global.__stripeFail = false; }
  }
  console.log('\n' + pass + ' ok, ' + fail + ' falliti  (' + (Number(process.hrtime.bigint() - t0) / 1e9).toFixed(1) + ' s)'); process.exit(fail ? 1 : 0);
})();
