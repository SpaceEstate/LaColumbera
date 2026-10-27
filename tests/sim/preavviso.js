'use strict';
// La Columbera · prove del PREAVVISO MINIMO di prenotazione (lato server).
// Stesso banco di prova di scenarios.js: codice REALE di Vercel, Redis finto con Lua vero, feed iCal controllabili, Stripe e SMTP finti, nessuna rete.
// Qui l'orologio è CONGELATO sull'istante scelto: "al secondo esatto" è deterministico, anche per lo script Apps Script simulato.
//
//   cd <repo> && node tests/sim/preavviso.js [filtro]      (servono wasmoon e google-apps-script.gs, come per scenarios.js)
//
// Convenzioni: Roma = UTC+2 fino a domenica 25/10/2026 ore 03:00 (ora legale), poi UTC+1.
const assert = require('assert'), H = require('./harness'), A = require('../../api/_avail.js'), { clock, kv } = H;
const T = '"La Columbera - Torre, Appartamento con 2 camere da letto"', C = '"La Columbera - Corte, Appartamento con 1 camere da letto"', HDR = ['Numero Prenotazione', 'Data Check-in', 'Appartamento', 'Numero Ospiti', 'Numero Notti'];
const eq = (a, b, m) => assert.deepStrictEqual(a, b, m);

async function base() {            // identico a scenarios.js: 3 righe storiche migrate, feed coerenti, motore caldo
  const rows = [HDR, ['HMSEDESZCW', H.romeMidnight(2026, 10, 5), C, 2, 6], [6877180932, '02/10/2026', T, 4, 2], [6228870635, H.romeMidnight(2026, 11, 19), T, 3, 3]];
  const env = await H.newEnv({ legacyRows: rows });
  H.setFeed('bookingTorre', [H.bookingEv('b1', '2026-10-02', '2026-10-04'), H.bookingEv('b2', '2026-11-19', '2026-11-22')]);
  H.setFeed('airbnbCorte', [H.airbnbEv('a1', '2026-10-05', '2026-10-11', 'HMSEDESZCW')]);
  await H.runGas(env.gas, 'setup'); await H.runGas(env.gas, 'migraRegistro');
  await H.sync(); return env;
}

// ---- orologio congelato: Date.now() e new Date() restituiscono ESATTAMENTE l'istante scelto (anche dentro la VM dello script Apps Script) ----
const RD = H.RealDate, realNow = RD.now;
let frozen = null;
const freeze = iso => { if (frozen === null) { frozen = realNow.call(RD); RD.now = () => frozen; } clock.set(iso); };
const thaw = () => { RD.now = realNow; frozen = null; };
const at = async iso => { freeze(iso); await H.sync(); };      // sposta l'orologio e riallinea feed e registro a quell'istante

// ---- helper ----
const checkout = o => H.api('checkout', Object.assign({ id: 'torre', da: '2026-10-20', a: '2026-10-22', ospiti: 2, nome: 'Mario Rossi', email: 'mario@test.it' }, o));
const release = (code, t) => H.api('checkout_cancel', { code, t });
const holdN = id => kv.exec(['HGETALL', 'holds:' + id]).length / 2;
const bkN = () => kv.exec(['HGETALL', 'bkh']).length / 2;
const stripeN = () => global.__stripeSessions.length;
const getCfg = async () => (await H.adminApi('cfg_admin', {})).body;      // configurazione completa: richiede il login (quella pubblica non ha iCal, chiusure e blocchi)
const saveCfg = async patch => { const c = await getCfg(); if (typeof patch === 'function') patch(c); else Object.assign(c, patch); return H.adminApi('save', c); };
const setNotice = (giorni, ora) => saveCfg({ preavvisoGiorni: giorni, checkinOra: ora });
const dts = t => (t.match(/DTSTART;VALUE=DATE:(\d{8})/g) || []).map(x => x.slice(-8));
// prenotazione accettata (hold + sessione Stripe); poi si libera l'hold per poter riprovare le stesse notti
async function accepted(o, why) { const r = await checkout(o); eq(r.status, 200, why + ' → ' + JSON.stringify(r.body)); await release(r.body.code, r.body.t); return r.body; }
// prenotazione rifiutata per preavviso: 409 con codice, e NESSUN effetto collaterale (né hold, né record, né sessione Stripe)
async function refused(o, why) {
  const id = (o && o.id) || 'torre', before = [holdN(id), bkN(), stripeN()];
  const r = await checkout(o);
  eq([r.status, r.body.code], [409, 'PREAVVISO_INSUFFICIENTE'], why + ' → ' + JSON.stringify(r.body));
  eq([holdN(id), bkN(), stripeN()], before, 'nessun hold, nessun record, nessuna sessione Stripe: ' + why);
  return r.body;
}

const tests = [], test = (n, f) => tests.push({ n, f });

test('P0  funzioni pure: lettura tollerante, validazione rigorosa, ultimo istante utile e primo arrivo prenotabile', async () => {
  eq(A.noticeSettings({}), { giorni: 0, ora: '16:00' }); eq(A.noticeSettings(null), { giorni: 0, ora: '16:00' });
  eq(A.noticeSettings({ preavvisoGiorni: '2', checkinOra: '09:05' }), { giorni: 2, ora: '09:05' });
  eq(A.noticeSettings({ preavvisoGiorni: -1, checkinOra: '24:00' }), { giorni: 0, ora: '16:00' }, 'valori non validi in archivio: nessun preavviso');
  eq([1.5, 366, 365].map(g => A.noticeSettings({ preavvisoGiorni: g }).giorni), [0, 0, 365]);
  eq(A.parseNoticeInput({}, { preavvisoGiorni: 3, checkinOra: '16:00' }), { giorni: 3, ora: '16:00' }, 'campi non inviati: resta il valore salvato');
  eq(A.parseNoticeInput({ preavvisoGiorni: 0, checkinOra: '08:30' }, { preavvisoGiorni: 5 }), { giorni: 0, ora: '08:30' });
  for (const bad of [-1, 1.5, 366, 'abc', '', null, true, [2], {}]) assert(A.parseNoticeInput({ preavvisoGiorni: bad }, {}).err, 'giorni non validi: ' + JSON.stringify(bad));
  for (const bad of ['25:00', '9:30', '12:60', '', null, 1530, '15:00:00']) assert(A.parseNoticeInput({ checkinOra: bad }, {}).err, 'orario non valido: ' + JSON.stringify(bad));
  const cut = (d, g, h) => new Date(A.noticeCutoffMs(d, { giorni: g, ora: h })).toISOString();
  eq(cut('2026-10-20', 2, '15:00'), '2026-10-18T13:00:00.000Z', '18/10 ore 15:00 a Roma (CEST) = 13:00 UTC');
  eq(cut('2026-10-26', 2, '15:00'), '2026-10-24T13:00:00.000Z', 'sabato 24/10 ore 15:00 (ancora CEST)');
  eq(cut('2026-10-28', 2, '15:00'), '2026-10-26T14:00:00.000Z', 'lunedì 26/10 ore 15:00 (ora CET) = 14:00 UTC');
  eq(cut('2026-10-20', 0, '15:00'), '2026-10-20T21:59:59.999Z', '0 giorni: fine del giorno di arrivo a Roma');
  const first = (iso, g, h) => A.minCheckinDate(Date.parse(iso), { giorni: g, ora: h });
  eq(first('2026-10-15T09:00:00Z', 2, '15:00'), '2026-10-17');
  eq(first('2026-10-15T13:00:00Z', 2, '15:00'), '2026-10-17', 'al limite esatto vale ancora');
  eq(first('2026-10-15T13:00:01Z', 2, '15:00'), '2026-10-18', 'un secondo dopo scatta il giorno successivo');
  eq(first('2026-10-15T21:59:59Z', 0, '15:00'), '2026-10-15'); eq(first('2026-10-15T22:00:00Z', 0, '15:00'), '2026-10-16', 'mezzanotte di Roma, non di UTC');
  eq(first('2026-10-15T22:30:00Z', 1, '15:00'), '2026-10-17');
  assert(A.noticeOk('2026-10-16', Date.parse('2026-10-15T13:00:00Z'), { giorni: 1, ora: '15:00' }) && !A.noticeOk('2026-10-16', Date.parse('2026-10-15T13:00:01Z'), { giorni: 1, ora: '15:00' }));
  assert(!A.noticeOk('non-una-data', 0, { giorni: 0, ora: '15:00' }) && !A.noticeOk('2026-02-30', 0, { giorni: 0, ora: '15:00' }), 'date non valide mai accettate');
});

test('P1  0 giorni (default, configurazione senza il campo): arrivo oggi consentito anche a sera, ieri no, nessuna notte bloccata', async () => {
  await base(); await at('2026-10-15T18:30:00Z');                                  // 20:30 a Roma
  const b = (await H.busy('torre')).body;
  eq(b.notice, { giorni: 0, ora: '16:00', primoArrivo: '2026-10-15' });
  assert(!b.dates.includes('2026-10-15') && !b.dates.includes('2026-10-16'), 'oggi e domani risultano liberi');
  await accepted({ da: '2026-10-15', a: '2026-10-17' }, 'check-in oggi, con 0 giorni di preavviso');
  eq((await checkout({ da: '2026-10-14', a: '2026-10-16' })).status, 400, 'ieri non si prenota (controllo preesistente, invariato)');
  eq((await setNotice(0, '15:00')).status, 200);
  await accepted({ da: '2026-10-15', a: '2026-10-17' }, '0 salvato esplicitamente dal pannello');
});

test('P2  1 giorno, check-in 15:00: consentito fino alle 15:00 in punto del giorno prima (limite incluso), rifiutato dal secondo dopo', async () => {
  await base(); eq((await setNotice(1, '15:00')).status, 200);
  await at('2026-10-15T09:00:00Z');                                               // 11:00 a Roma
  await accepted({ da: '2026-10-16', a: '2026-10-18' }, 'domani, alle 11:00 di oggi');
  const e = await refused({ da: '2026-10-15', a: '2026-10-17' }, 'oggi con 1 giorno di preavviso');
  eq([e.giorni, e.ora, e.primoArrivo], [1, '15:00', '2026-10-16']);
  await at('2026-10-15T13:00:00Z');                                               // 15:00:00 a Roma
  await accepted({ da: '2026-10-16', a: '2026-10-18' }, 'esattamente al limite');
  await at('2026-10-15T13:00:01Z');                                               // 15:00:01
  eq((await refused({ da: '2026-10-16', a: '2026-10-18' }, 'un secondo dopo il limite')).primoArrivo, '2026-10-17');
  await accepted({ da: '2026-10-17', a: '2026-10-19' }, 'il giorno dopo si può');
});

test('P3  2 giorni, arrivo 20/10: ultimo istante utile 18/10 ore 15:00 di Roma; un secondo dopo no; messaggio chiaro', async () => {
  await base(); await setNotice(2, '15:00');
  await at('2026-10-18T13:00:00Z'); await accepted({ da: '2026-10-20', a: '2026-10-22' }, 'al limite esatto');
  await at('2026-10-18T13:00:01Z');
  const e = await refused({ da: '2026-10-20', a: '2026-10-22' }, 'un secondo dopo');
  eq([e.giorni, e.ora, e.primoArrivo], [2, '15:00', '2026-10-21']);
  for (const re of [/Preavviso minimo non rispettato/, /almeno 2 giorni/, /ore 15:00/, /21 ottobre 2026/, /lacolumbera@gmail\.com/]) assert(re.test(e.err), String(re) + ' → ' + e.err);
  eq((await checkout({ da: '2026-10-20', a: '2026-10-22' })).body.err, e.err, 'stesso messaggio a ogni tentativo');
  await accepted({ da: '2026-10-21', a: '2026-10-23' }, 'il primo arrivo indicato nel messaggio è davvero prenotabile');
});

test('P4  orario di check-in configurabile: con le 18:00 il limite si sposta alle 18:00 di Roma', async () => {
  await base(); await setNotice(1, '18:00');
  await at('2026-10-15T16:00:00Z');                                               // 18:00:00 a Roma
  await accepted({ da: '2026-10-16', a: '2026-10-18' }, 'alle 18:00 in punto');
  await at('2026-10-15T16:00:01Z');
  await refused({ da: '2026-10-16', a: '2026-10-18' }, 'alle 18:00:01');
});

test('P5  fuso Europe/Rome: a mezzanotte italiana il giorno cambia anche se in UTC è ancora ieri', async () => {
  await base(); await at('2026-10-15T22:30:00Z');                                  // 16/10 ore 00:30 a Roma, in UTC è ancora il 15
  eq((await checkout({ da: '2026-10-15', a: '2026-10-17' })).status, 400, 'il 15 per Roma è già ieri');
  await accepted({ da: '2026-10-16', a: '2026-10-18' }, '0 giorni: oggi per Roma è il 16');
  await setNotice(1, '15:00');
  eq((await H.busy('torre')).body.notice.primoArrivo, '2026-10-17');
  await refused({ da: '2026-10-16', a: '2026-10-18' }, '1 giorno: il 16 è oggi');
  await accepted({ da: '2026-10-17', a: '2026-10-19' }, '1 giorno: il 17 si può');
});

test('P6  ora legale: "2 giorni" sono le stesse HH:MM di due giorni prima, non 48 ore (cambio ora il 25/10/2026)', async () => {
  await base(); await setNotice(2, '15:00');
  await at('2026-10-24T12:59:59Z');                                               // sabato 14:59:59 CEST
  await accepted({ da: '2026-10-26', a: '2026-10-28' }, 'arrivo lunedì 26, sabato alle 14:59:59');
  await at('2026-10-24T13:30:00Z');                                               // sabato 15:30 CEST: un conto a 48 ore (lun 15:00 CET = 14:00 UTC) lo accetterebbe fino alle 14:00 UTC
  await refused({ da: '2026-10-26', a: '2026-10-28' }, 'sabato 15:30: oltre le 15:00 di Roma');
  await at('2026-10-26T13:59:59Z'); await accepted({ da: '2026-10-28', a: '2026-10-30' }, 'lunedì 26 alle 14:59:59 (CET)');
  await at('2026-10-26T14:00:01Z'); await refused({ da: '2026-10-28', a: '2026-10-30' }, 'lunedì 26 alle 15:00:01 (CET)');
});

test('P7  pannello: il valore resta in KV e si rilegge; valori non validi respinti (400) senza toccare nulla; pagina vecchia non lo azzera; senza login 401', async () => {
  await base();
  eq((await setNotice(3, '16:30')).status, 200);
  const st = JSON.parse(kv.exec(['GET', 'cfg']));
  eq([st.preavvisoGiorni, st.checkinOra], [3, '16:30'], 'scritto nell\'archivio persistente (KV), non in memoria');
  const adm = await getCfg(); eq([adm.preavvisoGiorni, adm.checkinOra], [3, '16:30'], 'lo rilegge la configurazione completa del pannello');
  for (const bad of [-1, 1.5, 366, 'abc', null, true]) { const r = await setNotice(bad, '16:30'); eq(r.status, 400, 'giorni ' + JSON.stringify(bad)); assert(/Preavviso minimo non valido/.test(r.body.err), r.body.err); }
  for (const bad of ['25:00', '9:30', '', 1530]) { const r = await setNotice(3, bad); eq(r.status, 400, 'ora ' + JSON.stringify(bad)); assert(/Orario di check-in non valido/.test(r.body.err), r.body.err); }
  const still = JSON.parse(kv.exec(['GET', 'cfg'])); eq([still.preavvisoGiorni, still.checkinOra], [3, '16:30'], 'i rifiuti non cambiano nulla');
  eq((await saveCfg(c => { delete c.preavvisoGiorni; delete c.checkinOra; c.chi = 'testo nuovo'; })).status, 200, 'pagina admin non aggiornata: salva senza i due campi');
  const kept = JSON.parse(kv.exec(['GET', 'cfg'])); eq([kept.preavvisoGiorni, kept.checkinOra, kept.chi], [3, '16:30', 'testo nuovo'], 'i campi non inviati restano');
  const c = await getCfg(); c.preavvisoGiorni = 0; eq((await H.api('save', c)).status, 401, 'senza login');
  eq(JSON.parse(kv.exec(['GET', 'cfg'])).preavvisoGiorni, 3, 'non autorizzato: nulla cambia');
  eq((await setNotice(0, '00:00')).status, 200); eq((await setNotice(365, '23:59')).status, 200);
});

test('P8  il browser non è una barriera: chiamata diretta all\'API, niente hold né record né sessione Stripe; vale per Torre e Corte; difesa in profondità nel motore', async () => {
  await base(); await setNotice(3, '15:00'); await at('2026-10-15T09:00:00Z');       // primo arrivo prenotabile: 18/10
  for (const id of ['torre', 'corte']) {
    eq((await refused({ id, da: '2026-10-16', a: '2026-10-18' }, id + ' tra 1 giorno')).primoArrivo, '2026-10-18');
    await refused({ id, da: '2026-10-17', a: '2026-10-19' }, id + ' tra 2 giorni');
    await accepted({ id, da: '2026-10-18', a: '2026-10-20' }, id + ' al limite (3 giorni)');
  }
  const b = (await H.busy('torre')).body;
  for (const d of ['2026-10-15', '2026-10-16', '2026-10-17']) assert(b.dates.includes(d), 'il calendario pubblico mostra non prenotabile ' + d);
  assert(!b.dates.includes('2026-10-18'), 'il primo arrivo prenotabile è libero');
  eq(b.notice, { giorni: 3, ora: '15:00', primoArrivo: '2026-10-18' });
  // anche saltando il controllo esplicito, la verifica di disponibilità usata da checkout e hold segnala quelle notti
  const chk = await H.V().handler.engine.checkRange(await getCfg(), 'torre', '2026-10-16', '2026-10-19');
  eq(chk.conflicts.map(c => [c.date, c.by]), [['2026-10-16', ['PREAVVISO']], ['2026-10-17', ['PREAVVISO']]]);
});

test('P9  il limite scade mentre si acquisisce l\'hold: ricontrollo dopo l\'hold, hold rilasciato, nessun record né pagamento', async () => {
  await base(); await setNotice(2, '15:00'); await at('2026-10-18T12:59:59Z');       // un secondo prima del limite per l'arrivo del 20/10
  let fired = 0;
  kv.after = async cmd => { if (String(cmd[0]).toUpperCase() === 'EVAL' && cmd[1] === A.LUA_ACQUIRE && !fired++) freeze('2026-10-18T13:00:01Z'); };      // l'hold viene acquisito, poi il tempo passa
  try {
    const e = await refused({ da: '2026-10-20', a: '2026-10-22' }, 'scaduto durante la creazione dell\'hold');
    eq(fired, 1, 'l\'hold è stato davvero acquisito prima del ricontrollo'); eq(e.primoArrivo, '2026-10-21');
  } finally { kv.after = null; }
});

test('P10 Stripe: il preavviso si valuta quando parte la prenotazione; un pagamento già avviato (hold + sessione) è confermato anche se il limite scade mentre l\'ospite paga', async () => {
  await base(); await setNotice(1, '15:00'); await at('2026-10-15T12:50:00Z');       // 14:50 a Roma: mancano 10 minuti al limite
  const c = await checkout({ da: '2026-10-16', a: '2026-10-18' }); eq(c.status, 200, JSON.stringify(c.body));
  const s = global.__stripeSessions[stripeN() - 1]; assert(s.params.expires_at, 'sessione Stripe con scadenza');
  await at('2026-10-15T13:10:00Z');                                               // 15:10: limite superato, hold (35 min) e sessione (30 min) ancora validi
  global.__mails.length = 0;
  eq((await H.webhook('checkout.session.completed', H.paidSession(c.body.code))).status, 200);
  eq(JSON.parse(kv.exec(['HGET', 'bkh', c.body.code])).stato, 'confermata', 'pagamento completato: confermata, non da_verificare');
  eq(global.__mails.length, 2, 'una mail al titolare e una all\'ospite');
  eq((await H.api('mie', { code: c.body.code, t: c.body.t })).status, 200, 'il cliente la vede');
  await refused({ da: '2026-10-16', a: '2026-10-18', email: 'altro@test.it' }, 'un nuovo tentativo per le stesse date adesso è oltre il limite');
});

test('P11 prenotazioni confermate, blocchi manuali, area clienti, export iCal e conferma manuale non sono toccati dal preavviso', async () => {
  await base(); await at('2026-10-15T09:00:00Z');
  const c = await checkout({ da: '2026-10-17', a: '2026-10-19' }); eq(c.status, 200);        // con 0 giorni (default)
  eq((await H.webhook('checkout.session.completed', H.paidSession(c.body.code))).status, 200);
  eq((await saveCfg(cfg => { cfg.apts.find(a => a.id === 'torre').blocked = { '2026-10-24': true }; cfg.preavvisoGiorni = 5; })).status, 200);
  const b = (await H.busy('torre')).body;
  for (const d of ['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-24']) assert(b.dates.includes(d), d + ' (preavviso, prenotazione o blocco manuale)');
  eq(b.notice.primoArrivo, '2026-10-20');
  eq(JSON.parse(kv.exec(['HGET', 'bkh', c.body.code])).stato, 'confermata', 'la prenotazione confermata resta tale');
  eq((await H.api('mie', { code: c.body.code, t: c.body.t })).status, 200, 'e il cliente la vede');
  const ic = await H.api('ical', {}, { method: 'GET', query: { id: 'torre' } });
  eq(dts(ic.text), ['20261017', '20261024', '20261119'], 'l\'export verso Booking/Airbnb non contiene i giorni del preavviso');
  const bk = JSON.parse(kv.exec(['HGET', 'bkh', c.body.code]));
  eq((await H.V().handler.engine.conflictsFor(await getCfg(), bk)).conflicts, [], 'la conferma manuale dall\'admin guarda solo le altre fonti: il preavviso non conta');
  eq((await H.adminApi('stato', { code: c.body.code, stato: 'annullata' })).status, 200);
});

/* ===================== esecuzione ===================== */
(async () => {
  const only = process.argv[2]; let pass = 0, fail = 0; const t0 = process.hrtime.bigint();      // cronometro reale: Date.now() è l'orologio simulato
  for (const t of tests) {
    if (only && !t.n.startsWith(only)) continue;
    try { await t.f(); console.log('  ✔ ' + t.n); pass++; }
    catch (e) { console.log('  ✘ ' + t.n + '\n      → ' + String(e.stack || e.message).split('\n').slice(0, only ? 40 : 4).join('\n        ')); fail++; }
    finally { thaw(); kv.after = null; }
  }
  console.log('\n' + pass + ' ok, ' + fail + ' falliti  (' + (Number(process.hrtime.bigint() - t0) / 1e9).toFixed(1) + ' s)'); process.exit(fail ? 1 : 0);
})();
