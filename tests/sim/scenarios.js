'use strict';
const assert = require('assert'), H = require('./harness'), { clock, MIN, kv } = H;
const T = '"La Columbera - Torre, Appartamento con 2 camere da letto"', C = '"La Columbera - Corte, Appartamento con 1 camere da letto"', HDR = ['Numero Prenotazione', 'Data Check-in', 'Appartamento', 'Numero Ospiti', 'Numero Notti'];
const eq = (a, b, m) => assert.deepStrictEqual(a, b, m);
const range = (a, b) => { const o = []; for (let d = new Date(a + 'T00:00:00Z'); d < new Date(b + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) o.push(d.toISOString().slice(0, 10)); return o; };
const tick = (min = 11) => clock.advance(min * MIN);
const mailBooking = (gas, code, it, extra) => gas.addEmail('Booking.com <noreply@booking.com>', 'Nuova prenotazione! (' + code + ', ven ' + it + ')', extra || 'Dettagli della nuova prenotazione.');
const mailAirbnb = (gas, code, arrivo, body) => gas.addEmail('Airbnb <automated@airbnb.com>', 'Prenotazione confermata - Anna arriverà il ' + arrivo, body);
const mailBookingCanc = (gas, code) => gas.addEmail('Booking.com <noreply@booking.com>', 'Prenotazione cancellata (' + code + ', ven 9 ott 2026)', 'La prenotazione è stata cancellata.');
const rapida = async gas => { tick(); return H.runGas(gas, 'syncRapida', { prefetch: H.PREFETCH.syncRapida }); };
const row = (gas, id) => gas.rows().find(r => r.ID_PRENOTAZIONE === id);
const checkout = (o) => H.api('checkout', Object.assign({ id: 'torre', da: '2026-10-20', a: '2026-10-23', ospiti: 2, nome: 'Mario Rossi', email: 'mario@test.it' }, o));
async function base(opts) {            // 3 righe storiche (dal tuo foglio), migrate, feed coerenti, motore caldo
  const rows = [HDR, ['HMSEDESZCW', H.romeMidnight(2026, 10, 5), C, 2, 6], [6877180932, '02/10/2026', T, 4, 2], [6228870635, H.romeMidnight(2026, 11, 19), T, 3, 3]];
  const env = await H.newEnv(Object.assign({ legacyRows: rows }, opts));
  H.setFeed('bookingTorre', [H.bookingEv('b1', '2026-10-02', '2026-10-04'), H.bookingEv('b2', '2026-11-19', '2026-11-22')]);
  H.setFeed('airbnbCorte', [H.airbnbEv('a1', '2026-10-05', '2026-10-11', 'HMSEDESZCW')]);
  await H.runGas(env.gas, 'setup'); await H.runGas(env.gas, 'migraRegistro');
  await H.sync(); return env;
}
const tests = [], test = (n, f) => tests.push({ n, f });

/* ===================== I 15 TEST RICHIESTI ===================== */
test('T1  nuova prenotazione Booking Torre → foglio, Torre occupata, Corte libera, sito aggiornato', async () => {
  const { gas } = await base();
  const corteDopo0 = await H.busyDates('corte');      // Corte ha già l'Airbnb HMSEDESZCW (5→11 ott): la nuova prenotazione su Torre non deve toccarla
  H.setFeed('bookingTorre', [H.bookingEv('b1', '2026-10-02', '2026-10-04'), H.bookingEv('b2', '2026-11-19', '2026-11-22'), H.bookingEv('n1', '2026-10-09', '2026-10-12')]);
  mailBooking(gas, '1111111111', '9 ott 2026');
  await rapida(gas);
  const r = row(gas, 'BOOKING|1111111111');
  assert(r, 'riga mancante'); eq([r.STATO, r.CHECK_OUT, r.UID_ESTERNO, r.MOTIVO, r.FONTE], ['CONFERMATA', '2026-10-12', 'n1', '', 'BOOKING']);
  assert(/Torre/.test(r.Appartamento) && Number(r['Numero Notti']) === 3, 'appartamento/notti');
  eq((await H.busyDates('torre')).filter(d => d >= '2026-10-09' && d < '2026-10-13'), ['2026-10-09', '2026-10-10', '2026-10-11']);
  eq(await H.busyDates('corte'), corteDopo0);
  eq((await H.busyDates('corte')).filter(d => d >= '2026-10-11' && d < '2026-10-13'), []);      // il 11 e il 12 Corte è libera (check-out Airbnb l'11)
  eq(gas.sheet('ProcessedMessages').map(x => x[6]), ['OK']);
  const st = (await H.adminApi('sync_status', {})).body; assert(st.registry.count >= 4, 'registro non propagato a Vercel dopo la modifica');
});
test('T2  nuova prenotazione Booking Corte', async () => {
  const { gas } = await base();
  H.setFeed('bookingCorte', [H.bookingEv('c1', '2026-10-14', '2026-10-17')]);
  mailBooking(gas, '2222222222', '14 ott 2026'); await rapida(gas);
  const r = row(gas, 'BOOKING|2222222222'); eq([r.STATO, r.CHECK_OUT], ['CONFERMATA', '2026-10-17']); assert(/Corte/.test(r.Appartamento));
  eq((await H.busyDates('corte')).filter(d => d >= '2026-10-14' && d < '2026-10-18'), ['2026-10-14', '2026-10-15', '2026-10-16']);
  eq((await H.busyDates('torre')).filter(d => d >= '2026-10-14' && d < '2026-10-18'), []);
});
test('T3  nuova prenotazione Airbnb Torre (codice, notti, ospiti dal corpo; evento legato per codice)', async () => {
  const { gas } = await base();
  H.setFeed('airbnbTorre', [H.airbnbEv('x9', '2026-10-12', '2026-10-15', 'HMABCDE123')]);
  mailAirbnb(gas, 'HMABCDE123', '12 ott', 'Codice di conferma: HMABCDE123\nCheck-in: ven 12 ott 2026\n3 notti\n2 adulti\n1 bambino\nLa Columbera - Torre, Appartamento con 2 camere da letto');
  await rapida(gas);
  const r = row(gas, 'AIRBNB|HMABCDE123'); eq([r.STATO, r.CHECK_OUT, r['Numero Ospiti'], r.UID_ESTERNO], ['CONFERMATA', '2026-10-15', 3, 'x9@airbnb.com']); assert(/Torre/.test(r.Appartamento));
  eq((await H.busyDates('torre')).filter(d => d >= '2026-10-12' && d < '2026-10-16'), ['2026-10-12', '2026-10-13', '2026-10-14']);
});
test('T4  prenotazione dal sito Torre: hold → Stripe → webhook → confermata → foglio → date occupate; webhook ripetuto non duplica', async () => {
  const { gas } = await base();
  const c = await checkout(); eq(c.status, 200); const code = c.body.code;
  eq((await H.busyDates('torre')).filter(d => d >= '2026-10-20' && d < '2026-10-24'), ['2026-10-20', '2026-10-21', '2026-10-22'], 'hold deve bloccare subito le notti');
  eq(global.__stripeSessions.length, 1); assert(global.__stripeSessions[0].params.expires_at, 'sessione con scadenza');
  const w = await H.webhook('checkout.session.completed', H.paidSession(code)); eq(w.status, 200);
  const b = JSON.parse(kv.exec(['HGET', 'bkh', code])); eq(b.stato, 'confermata');
  eq(global.__mails.length, 2, 'una mail al titolare e una all\'ospite');
  const r = row(gas, 'SITO|' + code); assert(r, 'riga foglio'); eq([r.STATO, r.CHECK_OUT, Number(r['Numero Notti']), r['Numero Ospiti']], ['CONFERMATA', '2026-10-23', 3, 2]); assert(/Torre/.test(r.Appartamento));
  assert(kv.exec(['HGETALL', 'holds:torre']).length === 0, 'hold rilasciati dopo la conferma');
  eq((await H.busyDates('torre')).filter(d => d >= '2026-10-20' && d < '2026-10-24'), ['2026-10-20', '2026-10-21', '2026-10-22']);
  const before = gas.rows().length; await H.webhook('checkout.session.completed', H.paidSession(code)); await H.webhook('checkout.session.async_payment_succeeded', H.paidSession(code));
  eq([gas.rows().length, global.__mails.length], [before, 2], 'webhook ripetuto: nessuna riga e nessuna mail in più');
});
test('T5  due/quattro utenti prenotano contemporaneamente le stesse date: solo uno procede (40 round, Lua reale)', async () => {
  await base(); kv.jitter = 6;
  let wins = 0;
  for (let k = 0; k < 40; k++) {
    const d0 = new Date(Date.UTC(2027, 0, 10 + k * 6)).toISOString().slice(0, 10), plus = n => new Date(Date.UTC(2027, 0, 10 + k * 6 + n)).toISOString().slice(0, 10);
    const reqs = [[0, 3], [1, 4], [2, 5], [0, 3]].map(([a, b], i) => checkout({ da: plus(a), a: plus(b), email: 'u' + i + '@t.it', nome: 'U' + i }));
    const out = await Promise.all(reqs), ok = out.map((r, i) => ({ r, w: [[0, 3], [1, 4], [2, 5], [0, 3]][i] })).filter(x => x.r.status === 200);
    assert(ok.length >= 1, 'round ' + k + ': nessuno è passato');
    for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) assert(!(ok[i].w[0] < ok[j].w[1] && ok[j].w[0] < ok[i].w[1]), 'round ' + k + ': due prenotazioni sovrapposte hanno ottenuto lo stesso periodo');
    out.filter(r => r.status !== 200).forEach(r => eq(r.status, 409)); wins += ok.length;
  }
  console.log('      (' + wins + ' checkout riusciti su 160, nessuna sovrapposizione)');
});
test('T6  cancellazione Booking: STATO=ANNULLATA + annullata_il, riga conservata, disponibilità ricalcolata', async () => {
  const { gas } = await base();
  const corteDopo0 = await H.busyDates('corte');      // Corte ha già l'Airbnb HMSEDESZCW (5→11 ott): la nuova prenotazione su Torre non deve toccarla
  H.setFeed('bookingTorre', [H.bookingEv('b1', '2026-10-02', '2026-10-04'), H.bookingEv('b2', '2026-11-19', '2026-11-22'), H.bookingEv('n1', '2026-10-09', '2026-10-12')]);
  mailBooking(gas, '1111111111', '9 ott 2026'); await rapida(gas);
  const n = gas.rows().length;
  mailBookingCanc(gas, '1111111111');
  // la mail di annullamento arriva PRIMA che Booking aggiorni l'iCal: le date restano occupate (prudente)
  await rapida(gas); let r = row(gas, 'BOOKING|1111111111');
  eq(r.STATO, 'ANNULLATA'); assert(r.ANNULLATA_IL, 'annullata_il'); eq(gas.rows().length, n, 'nessuna riga cancellata');
  assert((await H.busyDates('torre')).includes('2026-10-10'), 'finché l\'iCal mostra ancora l\'evento resta occupata');
  H.setFeed('bookingTorre', [H.bookingEv('b1', '2026-10-02', '2026-10-04'), H.bookingEv('b2', '2026-11-19', '2026-11-22')]);
  tick(); assert(!(await H.busyDates('torre')).includes('2026-10-10'), 'dopo l\'aggiornamento dell\'iCal la data è libera');
  // una conferma tardiva dello stesso codice non resuscita la prenotazione
  mailBooking(gas, '1111111111', '9 ott 2026', 'duplicato tardivo'); await rapida(gas); eq(row(gas, 'BOOKING|1111111111').STATO, 'ANNULLATA');
});
test('T7  iCal Booking HTTP 500: la disponibilità NON diventa libera (snapshot), poi non verificabile, poi si riprende', async () => {
  const { gas } = await base();
  H.setFeed('bookingTorre', [H.bookingEv('b1', '2026-10-02', '2026-10-04'), H.bookingEv('b2', '2026-11-19', '2026-11-22'), H.bookingEv('n1', '2026-10-09', '2026-10-12')]);
  await H.sync(); H.breakFeed('bookingTorre', { status: 500, body: 'Internal Server Error' });
  tick(); let r = await H.busy('torre'); eq(r.status, 200); eq(r.body.status, 'degraded');
  assert(r.body.dates.includes('2026-10-10') && r.body.dates.includes('2026-11-20'), 'le date note restano occupate');
  const f = (await H.adminApi('sync_status', {})).body.feeds.find(x => x.source === 'BOOKING' && x.apt === 'torre');
  eq([f.health, f.http, f.error, f.consecutiveFailures >= 1], ['STALE', 500, 'HTTP_500', true]);
  tick(130); r = await H.busy('torre'); eq(r.status, 503, 'oltre la soglia: lato ospite "non verificabile", mai "libero"'); eq(r.body.status, 'unverifiable');
  const c = await checkout({ id: 'torre', da: '2027-03-01', a: '2027-03-03' }); eq(c.status, 503);
  const ic = await H.api('ical', {}, { method: 'GET', query: { id: 'torre' } }); eq(ic.status, 200); assert(/DTSTART;VALUE=DATE:20261009/.test(ic.text), 'l\'export verso le piattaforme continua con l\'ultimo snapshot');
  H.setFeed('bookingTorre', [H.bookingEv('b1', '2026-10-02', '2026-10-04'), H.bookingEv('n1', '2026-10-09', '2026-10-12')]); await H.sync();
  eq((await H.busy('torre')).status, 200);
});
test('T8  iCal Booking in timeout: stesso comportamento di T7', async () => {
  await base(); H.setFeed('bookingTorre', [H.bookingEv('n1', '2026-10-09', '2026-10-12')]); await H.sync();
  H.breakFeed('bookingTorre', { delay: 2000 }); tick();
  const r = await H.busy('torre'); eq(r.status, 200); assert(r.body.dates.includes('2026-10-10'), 'date ancora occupate dopo il timeout');
  const f = (await H.adminApi('sync_status', {})).body.feeds.find(x => x.source === 'BOOKING' && x.apt === 'torre'); assert(/^TIMEOUT/.test(f.error), 'errore TIMEOUT: ' + f.error); eq(f.health, 'STALE');
});
test('T9  feed vuoto VALIDO ≠ errore: svuota le date (segnalato); HTML/troncato = errore e tiene lo snapshot', async () => {
  await base(); H.setFeed('bookingTorre', [H.bookingEv('n1', '2026-10-09', '2026-10-12')]); await H.sync();
  H.breakFeed('bookingTorre', { body: '<html><body>Service unavailable</body></html>' }); tick();
  assert((await H.busyDates('torre')).includes('2026-10-10'), 'pagina HTML 200 non deve azzerare il calendario');
  let f = (await H.adminApi('sync_status', {})).body.feeds.find(x => x.source === 'BOOKING' && x.apt === 'torre'); eq(f.error, 'NON_ICAL');
  H.breakFeed('bookingTorre', { body: 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:z\r\n' }); tick(); await H.sync(); f = (await H.adminApi('sync_status', {})).body.feeds.find(x => x.source === 'BOOKING' && x.apt === 'torre'); eq(f.error, 'TRONCATO');
  H.setFeed('bookingTorre', []); tick(); await H.sync();
  assert(!(await H.busyDates('torre')).includes('2026-10-10'), 'calendario realmente vuoto: date libere');
  f = (await H.adminApi('sync_status', {})).body.feeds.find(x => x.source === 'BOOKING' && x.apt === 'torre'); eq([f.health, f.eventCount, f.emptyAfterNonEmpty], ['OK', 0, true]);
  assert((await H.adminApi('reconcile', {})).body.anomalies.some(a => a.type === 'FEED_VUOTO_DOPO_EVENTI'), 'segnalato come anomalia');
});
test('T10 Google Sheet irraggiungibile: mai "nessuna prenotazione" (snapshot / non verificabile / coda scritture)', async () => {
  const { gas } = await base();
  // (a) registro mai caricato → non verificabile
  H.webapp.mode = 'down'; kv.exec(['DEL', 'reg:snap']); eq((await H.busy('torre')).status, 503);
  // (b) registro caricato e poi irraggiungibile → resta l'ultimo snapshot; dopo la soglia non verificabile
  H.webapp.mode = 'ok'; await H.sync(); eq((await H.busy('torre')).status, 200);
  H.webapp.mode = 'down'; tick(); let r = await H.busy('torre'); eq([r.status, r.body.status], [200, 'degraded']);
  const rg = (await H.adminApi('sync_status', {})).body.registry; eq([rg.health, rg.error], ['STALE', 'HTTP_500']);
  assert(r.body.dates.includes('2026-10-02'), 'prenotazioni note restano occupate');
  tick(200); eq((await H.busy('torre')).status, 503);
  // (c) risposta HTML (login Google) o export vuoto sospetto = errore, non "foglio vuoto"
  H.webapp.mode = 'html'; await H.sync(); eq((await H.adminApi('sync_status', {})).body.registry.error, 'RISPOSTA_NON_JSON');
  // (d) il webhook conferma comunque (KV) e accoda la scrittura sul foglio; poi la coda si svuota senza duplicati
  H.webapp.mode = 'ok'; await H.sync();
  const c = await checkout({ da: '2026-12-01', a: '2026-12-03' }); eq(c.status, 200); H.webapp.mode = 'down'; H.webapp.calls = [];
  await H.webhook('checkout.session.completed', H.paidSession(c.body.code));
  eq(JSON.parse(kv.exec(['HGET', 'bkh', c.body.code])).stato, 'confermata'); eq(kv.exec(['LLEN', 'outbox:sheet']), 1);
  const queued = JSON.parse(kv.exec(['LRANGE', 'outbox:sheet', '0', '0'])[0]).booking; assert(!('nome' in queued) && !('email' in queued) && !('tel' in queued) && !/mario@test\.it|Mario Rossi/.test(JSON.stringify(queued)), 'la coda non duplica dati personali');
  H.webapp.mode = 'ok'; await H.sync({ drain: true }); await H.sync({ drain: true });
  eq(kv.exec(['LLEN', 'outbox:sheet']), 0); eq(gas.rows().filter(x => x.ID_PRENOTAZIONE === 'SITO|' + c.body.code).length, 1, 'esattamente una riga');
});
test('T11 stessa prenotazione elaborata due volte (webhook in parallelo, email ripetuta): nessun duplicato', async () => {
  const { gas } = await base(); kv.jitter = 4;
  const c = await checkout({ da: '2026-12-10', a: '2026-12-12' });
  const outs = await Promise.all([1, 2, 3].map(() => H.webhook('checkout.session.completed', H.paidSession(c.body.code))));
  // consegne concorrenti: alcune possono rispondere 500 (Stripe riprova), ma alla fine tutto è esattamente una volta
  await H.webhook('checkout.session.completed', H.paidSession(c.body.code)); await H.webhook('checkout.session.completed', H.paidSession(c.body.code));
  eq(gas.rows().filter(x => x.ID_PRENOTAZIONE === 'SITO|' + c.body.code).length, 1); eq(global.__mails.length, 2);
  H.setFeed('bookingTorre', [H.bookingEv('n1', '2026-10-09', '2026-10-12'), H.bookingEv('b1', '2026-10-02', '2026-10-04'), H.bookingEv('b2', '2026-11-19', '2026-11-22')]);
  mailBooking(gas, '1111111111', '9 ott 2026'); mailBooking(gas, '1111111111', '9 ott 2026', 'seconda email identica');
  await rapida(gas); await rapida(gas); eq(gas.rows().filter(x => x.ID_PRENOTAZIONE === 'BOOKING|1111111111').length, 1);
  eq(gas.sheet('ProcessedMessages').map(x => x[6]).sort(), ['GIA_PRESENTE', 'OK']);
});
test('T12 Torre e Corte stesso giorno: indipendenti; se l\'email non dice quale, DA_VERIFICARE (mai "Torre"), risolvibile a mano', async () => {
  const { gas } = await base();
  H.setFeed('bookingTorre', [H.bookingEv('t1', '2026-10-14', '2026-10-16')]); H.setFeed('bookingCorte', [H.bookingEv('c1', '2026-10-14', '2026-10-17')]);
  mailBooking(gas, '3333333333', '14 ott 2026'); mailBooking(gas, '4444444444', '14 ott 2026'); await rapida(gas);
  let a = row(gas, 'BOOKING|3333333333'), b = row(gas, 'BOOKING|4444444444');
  eq([a.STATO, a.MOTIVO, b.STATO, b.MOTIVO], ['DA_VERIFICARE', 'APT_AMBIGUO', 'DA_VERIFICARE', 'APT_AMBIGUO']); eq([a.Appartamento, b.Appartamento], ['', '']);
  eq((await H.busyDates('torre')).filter(d => d >= '2026-10-14' && d < '2026-10-18'), ['2026-10-14', '2026-10-15']); eq((await H.busyDates('corte')).filter(d => d >= '2026-10-14' && d < '2026-10-18'), ['2026-10-14', '2026-10-15', '2026-10-16']);
  // l'operatore assegna la prima (colonna C): la seconda si risolve da sola (evento Torre già legato)
  gas.ss.getSheetByName('Prenotazioni').rows[a._row - 1][2] = T; await rapida(gas);
  a = row(gas, 'BOOKING|3333333333'); b = row(gas, 'BOOKING|4444444444');
  eq([a.STATO, a.CHECK_OUT, b.STATO, b.CHECK_OUT], ['CONFERMATA', '2026-10-16', 'CONFERMATA', '2026-10-17']); assert(/Torre/.test(a.Appartamento) && /Corte/.test(b.Appartamento));
  // con l'appartamento scritto nell'email (nome dell'unità) l'assegnazione è immediata
  const g2 = (await base()).gas; H.setFeed('bookingTorre', [H.bookingEv('t1', '2026-10-14', '2026-10-16')]); H.setFeed('bookingCorte', [H.bookingEv('c1', '2026-10-14', '2026-10-17')]);
  mailBooking(g2, '5555555555', '14 ott 2026', 'Unità: La Columbera - Torre, Appartamento con 2 camere da letto'); mailBooking(g2, '6666666666', '14 ott 2026', 'Unità: La Columbera - Corte, Appartamento con 1 camere da letto'); await rapida(g2);
  assert(/Torre/.test(row(g2, 'BOOKING|5555555555').Appartamento) && /Corte/.test(row(g2, 'BOOKING|6666666666').Appartamento));
});
test('T13 check-in 10 / check-out 15 → occupate esattamente 10,11,12,13,14', async () => {
  await base(); H.setFeed('bookingTorre', [H.bookingEv('e', '2026-11-10', '2026-11-15')]); await H.sync();
  eq((await H.busyDates('torre')).filter(d => d >= '2026-11-08' && d < '2026-11-18'), ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']);
});
test('T14 cambio mese/anno e fusi: nessuno slittamento di data', async () => {
  await base(); H.setFeed('bookingTorre', [H.bookingEv('e1', '2026-12-30', '2027-01-03'), H.vevent({ UID: 'e2', DTSTART: '20270110T233000Z', DTEND: '20270112T090000Z' }), H.vevent({ UID: 'e3', 'DTSTART;TZID=Europe/Rome': '20270120T150000', 'DTEND;TZID=Europe/Rome': '20270123T100000' })]); await H.sync();
  const d = await H.busyAll('torre');
  eq(d.filter(x => x >= '2026-12-28' && x < '2027-01-06'), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  eq(d.filter(x => x >= '2027-01-09' && x < '2027-01-15'), ['2027-01-11'], '23:30Z del 10/1 = 00:30 dell\'11/1 a Roma; check-out 12/1 → solo la notte dell\'11');
  eq(d.filter(x => x >= '2027-01-19' && x < '2027-01-25'), ['2027-01-20', '2027-01-21', '2027-01-22']);
});
test('T15 feed con evento duplicato: un solo blocco logico, duplicati contati', async () => {
  await base(); const ev = H.bookingEv('dup', '2026-11-05', '2026-11-08');
  H.setFeed('bookingTorre', [ev, ev, H.bookingEv('altro-uid', '2026-11-05', '2026-11-08')]); await H.sync();
  eq((await H.busyDates('torre')).filter(x => x >= '2026-11-04' && x < '2026-11-09'), ['2026-11-05', '2026-11-06', '2026-11-07']);
  const f = (await H.adminApi('sync_status', {})).body.feeds.find(x => x.source === 'BOOKING' && x.apt === 'torre'); eq(f.eventCount, 2, 'stessa UID collassata');
  const ex = await H.api('ical', {}, { method: 'GET', query: { id: 'torre' } }); eq((ex.text.match(/20261105/g) || []).length, 1, 'export: un solo evento');
});

/* ===================== CASI LIMITE EMERSI DALL'AUDIT ===================== */
test('X1  KV risponde con un errore (es. limite Upstash): prima = date libere, ora = non verificabile (503) su sito, export e checkout', async () => {
  await base(); kv.fail = { status: 429, body: { error: 'ERR max daily request limit exceeded' } };
  eq((await H.busy('torre')).status, 503); eq((await H.api('ical', {}, { method: 'GET', query: { id: 'torre' } })).status, 503);
  eq((await checkout()).status >= 500, true); kv.fail = null; eq((await H.busy('torre')).status, 200);
});
test('X2  hold: scade, checkout annullato lo libera; pagamento tardivo riconferma se libero, altrimenti conflitto segnalato', async () => {
  const { gas } = await base();
  let c = await checkout({ da: '2026-12-20', a: '2026-12-22' }); assert((await H.busyDates('torre')).includes('2026-12-20'));
  await H.api('checkout_cancel', { code: c.body.code }); assert(!(await H.busyDates('torre')).includes('2026-12-20'), 'annullo dal pagamento: notti libere');
  c = await checkout({ da: '2026-12-20', a: '2026-12-22' }); tick(40); assert(!(await H.busyDates('torre')).includes('2026-12-20'), 'hold scaduto');
  await H.webhook('checkout.session.completed', H.paidSession(c.body.code)); eq(JSON.parse(kv.exec(['HGET', 'bkh', c.body.code])).stato, 'confermata', 'pagamento tardivo con date libere: confermata');
  const c2 = await checkout({ da: '2026-12-27', a: '2026-12-29' }); tick(40);
  const c3 = await checkout({ da: '2026-12-27', a: '2026-12-29', email: 'altro@t.it' }); await H.webhook('checkout.session.completed', H.paidSession(c3.body.code));
  global.__mails.length = 0; await H.webhook('checkout.session.completed', H.paidSession(c2.body.code));
  eq(JSON.parse(kv.exec(['HGET', 'bkh', c2.body.code])).stato, 'da_verificare'); eq(global.__mails.length, 1); assert(/conflitto/i.test(global.__mails[0].subject) && global.__mails[0].to === 'owner@test', 'avviso al titolare, nessuna mail all\'ospite');
});
test('X3  export iCal: unione di tutte le fonti, ?for=booking esclude l\'eco, 503 se un feed non è mai stato scaricato', async () => {
  const { gas } = await base(); const cfg = JSON.parse(kv.exec(['GET', 'cfg'])); cfg.apts.find(a => a.id === 'torre').blocked = { '2026-12-05': true }; kv.exec(['SET', 'cfg', JSON.stringify(cfg)]);
  H.setFeed('airbnbTorre', [H.airbnbEv('z', '2026-12-10', '2026-12-12', 'HMZZZZZZZZ')]); await checkout({ da: '2026-12-15', a: '2026-12-17' }); await H.sync();
  let ic = await H.api('ical', {}, { method: 'GET', query: { id: 'torre' } }); eq(ic.status, 200); eq(ic.headers['cache-control'], 'public, s-maxage=60, stale-while-revalidate=120');
  for (const d of ['20261002', '20261205', '20261210', '20261215']) assert(ic.text.includes('DTSTART;VALUE=DATE:' + d), 'manca ' + d);
  const dts = t => (t.match(/DTSTART;VALUE=DATE:(\d{8})/g) || []).map(x => x.slice(-8));      // solo i DTSTART: DTSTAMP contiene la data "di oggi" simulata
  eq(dts(ic.text), ['20261002', '20261119', '20261205', '20261210', '20261215'], 'export completo');
  ic = await H.api('ical', {}, { method: 'GET', query: { id: 'torre', for: 'booking' } }); eq(dts(ic.text), ['20261205', '20261210', '20261215'], 'for=booking: niente eventi Booking, restano blocco manuale, Airbnb e sito');
  ic = await H.api('ical', {}, { method: 'GET', query: { id: 'torre', for: 'airbnb' } }); eq(dts(ic.text), ['20261002', '20261119', '20261205', '20261215'], 'for=airbnb: niente eventi Airbnb, restano Booking, blocco manuale e sito');
  const g = (await H.newEnv()); kv.exec(['SET', 'cfg', JSON.stringify(g.cfg)]); H.breakFeed('bookingTorre', { status: 500 }); await H.sync();
  const bad = await H.api('ical', {}, { method: 'GET', query: { id: 'torre' } }); eq(bad.status, 503); assert(bad.headers['retry-after']);
});
test('X4  il registro non cancella mai: righe passate restano; ripresentare un codice annullato non lo riattiva; upsert ripetuto = unchanged', async () => {
  const { gas } = await base(); tick(60 * 24 * 40);                      // 40 giorni dopo: tutte le prenotazioni storiche sono finite
  await H.runGas(gas, 'syncRapida', { prefetch: H.PREFETCH.syncRapida }); eq(gas.rows().length, 3, 'le righe concluse restano nel registro');
  const call = body => gas.ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({ secret: H.SECRETS.SHEET_SECRET, action: 'upsert' }, body)) } }).getContent();
  const bk = { fonte: 'SITO', codice: 'ABC123', apt: 'torre', checkin: '2027-02-01', checkout: '2027-02-03', ospiti: 2, stato: 'CONFERMATA' };
  eq(JSON.parse(call({ booking: bk })).result, 'created'); eq(JSON.parse(call({ booking: bk })).result, 'unchanged'); eq(gas.rows().length, 4);
  eq(JSON.parse(call({ booking: Object.assign({}, bk, { stato: 'ANNULLATA' }) })).result, 'updated'); eq(JSON.parse(call({ booking: bk })).result, 'ignored_cancelled');
  assert(JSON.parse(call({ secret: 'sbagliato', booking: bk })).error === undefined || true); eq(JSON.parse(gas.ctx.doPost({ postData: { contents: JSON.stringify({ secret: 'no', booking: bk }) } }).getContent()).ok, false);
  eq(JSON.parse(call({ booking: { fonte: 'SITO', codice: '000123', apt: 'torre', checkin: '2027-03-01', checkout: '2027-03-03', stato: 'CONFERMATA' } })).result, 'created'); eq(row(gas, 'SITO|000123')['Numero Prenotazione'], '000123', 'zeri iniziali preservati (colonna testo)');
  // payload del vecchio sito (compatibilità durante l'aggiornamento)
  eq(JSON.parse(gas.ctx.doPost({ postData: { contents: JSON.stringify({ secret: H.SECRETS.SHEET_SECRET, code: 'F00BAA', checkin: '05/03/2027', appartamento: 'La Columbera - Corte, Appartamento con 1 camera da letto', ospiti: 2, notti: 2 }) } }).getContent()).result, 'created');
  eq(row(gas, 'SITO|F00BAA').CHECK_OUT, '2027-03-07');
});
test('X5  web app firmata: export/find con firma valida, rifiutati senza firma, con firma scaduta o manomessa', async () => {
  const { gas } = await base(); const crypto = require('crypto'), hm = m => crypto.createHmac('sha256', H.SECRETS.SHEET_SECRET).update(m).digest('hex'); const ts = String(clock.now());
  const get = p => JSON.parse(gas.ctx.doGet({ parameter: p }).getContent());
  eq(get({}).version, 2); eq(get({ action: 'export', ts, sig: 'x' }).ok, false); eq(get({ action: 'export', ts: String(clock.now() - 10 * MIN), sig: hm(String(clock.now() - 10 * MIN) + '.export.') }).ok, false);
  const ex = get({ action: 'export', ts, sig: hm(ts + '.export.') }); eq([ex.ok, ex.schema, ex.rows.length], [true, 2, 3]);
  eq(get({ action: 'find', code: 'HMSEDESZCW', ts, sig: hm(ts + '.find.HMSEDESZCW') }).row.codice, 'HMSEDESZCW'); eq(get({ action: 'find', code: 'HMSEDESZCW', ts, sig: hm(ts + '.find.ALTRO') }).ok, false);
});
test('X6  email non interpretabile: ERRORE_PARSING, resta non letta, NON viene cestinata dalla pulizia, compare in Anomalie', async () => {
  const { gas } = await base();
  gas.addEmail('Booking.com <noreply@booking.com>', 'Newsletter promozioni', 'marketing', clock.now() - 1 * 864e5);
  const idBad = gas.addEmail('Booking.com <noreply@booking.com>', 'Nuova prenotazione! (senza numero)', 'x');
  await rapida(gas); eq(gas.sheet('ProcessedMessages').map(x => x[6]), ['ERRORE_PARSING']);
  assert(!gas.mailbox.threads.find(t => t.messages[0].id === idBad).messages[0].read, 'resta non letta');
  tick(60 * 24 * 9); await H.runGas(gas, 'pulizia'); const alive = gas.mailbox.threads.filter(t => !t.trashed).map(t => t.messages[0].subject);
  eq(alive, ['Nuova prenotazione! (senza numero)'], 'la newsletter vecchia viene cestinata, la conferma non interpretata no');
  await H.runGas(gas, 'syncCompleta', { prefetch: H.PREFETCH.syncCompleta }); assert(gas.sheet('Anomalie').some(r => r[1] === 'EMAIL_NON_INTERPRETATA'), 'anomalia visibile');
});
test('X7  evento iCal sparito senza email di cancellazione: DA_VERIFICARE ma le date restano bloccate (nessun auto-sblocco)', async () => {
  const { gas } = await base(); gas.props.MISSING_MAX = '2';
  H.setFeed('bookingTorre', [H.bookingEv('b1', '2026-10-02', '2026-10-04'), H.bookingEv('b2', '2026-11-19', '2026-11-22'), H.bookingEv('n1', '2026-10-09', '2026-10-12')]);
  mailBooking(gas, '1111111111', '9 ott 2026'); await rapida(gas); assert(row(gas, 'BOOKING|1111111111').ULTIMO_SEEN, 'ultimo avvistamento registrato');
  H.setFeed('bookingTorre', [H.bookingEv('b1', '2026-10-02', '2026-10-04'), H.bookingEv('b2', '2026-11-19', '2026-11-22')]);      // l'evento scompare, nessuna mail
  for (let i = 0; i < 6; i++) await rapida(gas); tick(60); await rapida(gas);
  const r = row(gas, 'BOOKING|1111111111'); eq([r.STATO, r.MOTIVO], ['DA_VERIFICARE', 'ICAL_SPARITO']);
  assert((await H.busyDates('torre')).includes('2026-10-10'), 'resta occupata finché un umano decide');
  assert((await H.adminApi('reconcile', {})).body.anomalies.some(a => a.type === 'DA_VERIFICARE' && /ICAL_SPARITO/.test(a.msg)));
});
test('X8  riconciliazione: sovrapposizione (doppia prenotazione) = CRITICO; appartamento discordante; senza appartamento', async () => {
  const { gas } = await base();
  const c = await checkout({ da: '2026-10-02', a: '2026-10-04', id: 'corte' }); await H.webhook('checkout.session.completed', H.paidSession(c.body.code));      // Corte
  const sh = gas.ss.getSheetByName('Prenotazioni'); sh.rows[2][2] = C;                    // Booking 6877180932 riassegnata (per errore) a Corte e prenotazione sito su Corte stessa data
  await H.sync(); const rec = (await H.adminApi('reconcile', {})).body;
  assert(rec.anomalies.some(a => a.sev === 'CRITICO' && a.type === 'SOVRAPPOSIZIONE' && a.apt === 'corte'), 'doppia prenotazione rilevata');
  assert(rec.anomalies.some(a => a.type === 'APPARTAMENTO_DISCORDANTE' || a.type === 'REGISTRO_SENZA_ICAL'), 'evento iCal in un appartamento, registro in un altro');
  assert(rec.matrix.torre['2026-10-02'] && rec.matrix.corte['2026-10-02'].includes('SITO'), 'matrice con le fonti');
});
test('X9  debug: perché una data è occupata (fonti per giorno) e area clienti/Guest Card', async () => {
  const { gas } = await base(); const d = (await H.adminApi('busy_debug', {}, { method: 'GET', query: { id: 'torre', days: 5 } })).body;
  const day = d.days.find(x => x.date === '2026-10-02'); eq([day.busy, day.sources.sort()], [true, ['BOOKING_ICAL', 'SHEET']]); eq(d.days.find(x => x.date === '2026-10-05').busy, false);
  eq((await H.api('mie', { code: 'hmsedeszcw' })).body[0].id, 'corte'); eq((await H.api('mie', { code: 'NONESISTE' })).status, 404);
  eq((await H.api('gc_check', { code: '6877180932' })).status, 200);
  gas.ss.getSheetByName('Prenotazioni').rows[2][3] = ''; await H.sync(); const g = await H.api('gc_check', { code: '6877180932' }); eq(g.status, 409); assert(/ospiti/.test(g.body.err));
});
test('X10 script: diagnostica tutta [OK], trigger 5 min / 1 h / giornaliero, lock occupato = giro saltato, web app occupata = scrittura in coda', async () => {
  const { gas } = await base(); const out = await H.runGas(gas, 'diagnostica', { prefetch: H.PREFETCH.diagnostica }); assert(out.filter(l => /^\[ERRORE\]/.test(l)).length === 0, out.join('\n'));
  await H.runGas(gas, 'installTriggers'); eq(gas.ctx.ScriptApp.getProjectTriggers().map(t => t.fn + ':' + t.spec.join('+')).sort(), ['pulizia:d1+at3', 'syncCompleta:h1', 'syncRapida:min5']);
  gas.lockState.otherHolds = true; eq((await H.runGas(gas, 'syncRapida', { prefetch: H.PREFETCH.syncRapida })).skipped, true);
  const c = await checkout({ da: '2026-12-01', a: '2026-12-03' }); await H.webhook('checkout.session.completed', H.paidSession(c.body.code)); eq(kv.exec(['LLEN', 'outbox:sheet']), 1, 'LOCK_TIMEOUT dalla web app → coda');
  gas.lockState.otherHolds = false; await H.sync({ drain: true }); eq(kv.exec(['LLEN', 'outbox:sheet']), 0); assert(row(gas, 'SITO|' + c.body.code));
});
test('X11 ora legale: il vecchio Math.ceil sulle date locali dava 5 notti per 23→27 ottobre; ora 4', async () => {
  const old = (a, b) => Math.ceil(Math.abs(b - a) / (1000 * 60 * 60 * 24));       // calcolaNumeroNotti() del vecchio script, con Date locali (Europe/Rome)
  eq(old(new Date(2026, 9, 23), new Date(2026, 9, 27)), 5); eq(old(new Date(2026, 2, 27), new Date(2026, 2, 30)), 3);
  const { gas } = await base(); H.setFeed('bookingTorre', [H.bookingEv('dst', '2026-10-23', '2026-10-27')]);
  mailBooking(gas, '7777777777', '23 ott 2026'); await rapida(gas); const r = row(gas, 'BOOKING|7777777777'); eq([Number(r['Numero Notti']), r.CHECK_OUT], [4, '2026-10-27']);
});
test('X12 REPRO del codice precedente: evs() fail-open, check-then-act con perdita di prenotazioni, errore KV letto come "vuoto"', async () => {
  await base(); const F = s => s.replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3');
  // 1) evs() originale: ogni errore diventa "nessun evento"
  H.breakFeed('bookingTorre', { status: 500, body: 'err' });
  const evs = async urls => { const o = []; for (const u of urls) { try { const t = await (await fetch(u)).text(); for (const e of t.split('BEGIN:VEVENT').slice(1)) { const a = /DTSTART[^:]*:(\d{8})/.exec(e), b = /DTEND[^:]*:(\d{8})/.exec(e); if (a && b) o.push({ da: F(a[1]), a: F(b[1]) }); } } catch { } } return o; };
  eq((await evs([H.FEED.bookingTorre])).length, 0, 'vecchio codice: feed in errore = nessuna occupazione');
  // 2) checkout originale: legge l'array, controlla, aggiunge, riscrive TUTTO l'array
  kv.exec(['SET', 'bk', '[]']); kv.jitter = 6; const legacyCheckout = async (code, da, a) => { const bk = JSON.parse((await kv.run(['GET', 'bk'])) || 'null') || []; if (bk.some(x => x.da < a && da < x.a)) return 409; await new Promise(r => setTimeout(r, 3)); bk.push({ code, da, a }); await kv.run(['SET', 'bk', JSON.stringify(bk)]); return 200; };
  const res = await Promise.all([legacyCheckout('A', '2027-05-01', '2027-05-04'), legacyCheckout('B', '2027-05-02', '2027-05-05')]);
  const stored = JSON.parse(kv.exec(['GET', 'bk'])); eq(res, [200, 200], 'vecchio codice: entrambi passano (doppia prenotazione)'); eq(stored.length, 1, 'e una delle due viene persino persa (lost update)');
  // 3) kv() originale: l'errore JSON di Upstash diventa result=undefined → chiave "vuota"
  const legacyKv = async (...a) => (await (await fetch('https://kv.test', { method: 'POST', body: JSON.stringify(a) })).json()).result; kv.fail = { status: 429, body: { error: 'ERR max daily request limit exceeded' } };
  eq(await legacyKv('GET', 'cfg'), undefined, 'vecchio codice: configurazione, blocchi manuali e prenotazioni del sito "spariscono"'); kv.fail = null;
});

test('X13 webhook: una consegna "in ritardo" (ha letto "non fatto" prima che l\'altra finisse) non rispedisce la mail (intreccio forzato)', async () => {
  const { gas } = await base();
  const c = await checkout({ da: '2026-12-10', a: '2026-12-12' }), code = c.body.code, doneKey = 'done:' + code + ':mail_titolare', lockKey = 'lock:' + code + ':mail_titolare';
  let held = false, reached, open; const atGate = new Promise(r => { reached = r; }), lockFreed = new Promise(r => { open = r; });
  kv.after = async (cmd, out) => {
    if (cmd[0] === 'GET' && cmd[1] === doneKey && !held) { held = true; eq(out, null, 'la consegna 1 ha letto "mail non ancora inviata"'); reached(); await lockFreed; }      // la risposta arriva tardi
    else if (cmd[0] === 'DEL' && cmd[1] === lockKey && held) open();                                                                                                              // la consegna 2 ha finito e liberato il lock
  };
  const first = H.webhook('checkout.session.completed', H.paidSession(code));      // consegna 1: si ferma al cancello
  await atGate;
  const second = await H.webhook('checkout.session.completed', H.paidSession(code));      // consegna 2: completa tutti i passi
  const firstRes = await first; kv.after = null;
  assert([200, 500].includes(firstRes.status) && second.status === 200, 'la consegna in ritardo può rispondere 500 se l\'altra sta ancora inviando la mail all\'ospite: Stripe riprova');
  eq((await H.webhook('checkout.session.completed', H.paidSession(code))).status, 200, 'alla riconsegna di Stripe è tutto a posto');
  eq(global.__mails.filter(m => /Nuova prenotazione/.test(m.subject || '')).length, 1, 'mail al titolare: una sola');
  eq(global.__mails.length, 2, 'una al titolare e una all\'ospite, in totale');
  eq(gas.rows().filter(x => x.ID_PRENOTAZIONE === 'SITO|' + code).length, 1);
});

test('X14 feed iCal MAI scaricato (registro sano): quell\'appartamento è "non verificabile" (503), mai "libero"; l\'altro resta verificabile', async () => {
  const { K } = require('../../api/_avail.js');
  await base();                                                                      // feed e registro sani
  const f = (await H.adminApi('sync_status', {})).body.feeds.find(x => x.source === 'AIRBNB' && x.apt === 'torre');
  eq(f.health, 'OK'); kv.exec(['DEL', K.ics(f.feedId)]);                              // come se questo feed non fosse mai stato scaricato
  H.breakFeed('airbnbTorre', { status: 503, body: 'Service Unavailable' }); await H.sync();
  eq((await H.adminApi('sync_status', {})).body.feeds.find(x => x.feedId === f.feedId).health, 'NEVER');
  const r = await H.busy('torre'); eq([r.status, r.body.status], [503, 'unverifiable'], 'senza uno snapshot non si può dire che una data sia libera');
  eq((await checkout({ id: 'torre', da: '2027-03-01', a: '2027-03-03' })).status, 503, 'niente checkout');
  eq((await H.api('ical', {}, { method: 'GET', query: { id: 'torre' } })).status, 503, 'niente export verso le piattaforme');
  eq((await H.busy('corte')).status, 200, 'Corte ha tutti i feed sani: resta verificabile');
});

test('X15 prenotazione da_verificare: invisibile al cliente; la conferma manuale controlla le sovrapposizioni (409 senza force) e poi scrive all\'ospite una sola volta', async () => {
  await base();
  const mk = async (da, a, email) => (await checkout({ da, a, email })).body.code, st = code => JSON.parse(kv.exec(['HGET', 'bkh', code])).stato;
  // costruisco un da_verificare: hold scaduto, un altro ospite prende e PAGA le stesse notti, poi paga anche il primo
  const c2 = await mk('2026-12-27', '2026-12-29', 'primo@t.it'); tick(40);
  const c3 = await mk('2026-12-27', '2026-12-29', 'altro@t.it'); await H.webhook('checkout.session.completed', H.paidSession(c3));
  await H.webhook('checkout.session.completed', H.paidSession(c2)); eq(st(c2), 'da_verificare');
  eq((await H.api('mie', { code: c2 })).status, 404, 'il cliente non vede una prenotazione non confermata');
  // conferma manuale mentre le notti sono ancora dell\'altra prenotazione → respinta, nulla cambia
  global.__mails.length = 0;
  let r = await H.adminApi('stato', { code: c2, stato: 'confermata' });
  eq(r.status, 409); eq(r.body.conflicts.map(x => x.date), ['2026-12-27', '2026-12-28']); assert(r.body.conflicts[0].by.includes('SITO'), 'il conflitto è con l\'altra prenotazione');
  eq(st(c2), 'da_verificare'); eq(global.__mails.length, 0, 'nessuna mail se non si conferma');
  // il titolare libera le date annullando l\'altra → ora si conferma senza forzare
  await H.adminApi('stato', { code: c3, stato: 'annullata' });
  r = await H.adminApi('stato', { code: c2, stato: 'confermata' }); eq(r.status, 200); eq(st(c2), 'confermata');
  eq(global.__mails.filter(m => m.to === 'primo@t.it').length, 1, 'conferma all\'ospite'); assert(JSON.parse(kv.exec(['HGET', 'bkh', c2])).confermata_il, 'confermata_il');
  eq((await H.api('mie', { code: c2 })).status, 200, 'ora il cliente la vede');
  await H.adminApi('stato', { code: c2, stato: 'annullata' }); await H.adminApi('stato', { code: c2, stato: 'confermata' });
  eq(global.__mails.filter(m => m.to === 'primo@t.it').length, 1, 'cambiare stato più volte non rimanda la mail');
  // conflitto che resta (iCal Airbnb): senza force 409; con force passa e ne resta traccia nella nota
  const d2 = await mk('2027-01-10', '2027-01-12', 'terzo@t.it'); tick(40);
  H.setFeed('airbnbTorre', [H.airbnbEv('zz', '2027-01-10', '2027-01-12', 'HMQQQQQQQQ')]); await H.sync();
  await H.webhook('checkout.session.completed', H.paidSession(d2)); eq(st(d2), 'da_verificare');
  r = await H.adminApi('stato', { code: d2, stato: 'confermata' }); eq(r.status, 409); assert(r.body.conflicts[0].by.some(x => /AIRBNB/.test(x)), 'conflitto con l\'Airbnb');
  r = await H.adminApi('stato', { code: d2, stato: 'confermata', force: true }); eq(r.status, 200);
  const b2 = JSON.parse(kv.exec(['HGET', 'bkh', d2])); eq(b2.stato, 'confermata'); assert(/CONFERMATA A MANO.*SOVRAPPOSIZIONE/.test(b2.note), 'traccia della forzatura: ' + b2.note);
  // doppio clic sul bottone: due conferme simultanee → un solo messaggio all'ospite
  const e2 = await mk('2027-02-10', '2027-02-12', 'quarto@t.it'); tick(40);
  const e3 = await mk('2027-02-10', '2027-02-12', 'quinto@t.it'); await H.webhook('checkout.session.completed', H.paidSession(e3)); await H.webhook('checkout.session.completed', H.paidSession(e2));
  eq(st(e2), 'da_verificare'); await H.adminApi('stato', { code: e3, stato: 'annullata' }); global.__mails.length = 0;
  const dbl = await Promise.all([1, 2].map(() => H.adminApi('stato', { code: e2, stato: 'confermata' })));
  assert(dbl.every(x => x.status === 200), 'entrambe le richieste vanno a buon fine'); eq(st(e2), 'confermata');
  eq(global.__mails.filter(m => m.to === 'quarto@t.it').length, 1, 'doppio clic: una sola mail all\'ospite');
});

test('X16 webhook: una consegna che ha letto la prenotazione "in_attesa" prima che l\'altra la confermasse NON la declassa a da_verificare (conflitto con se stessa)', async () => {
  const { gas } = await base();
  const c = await checkout({ da: '2026-12-10', a: '2026-12-12' }), code = c.body.code;
  let n = 0, release; const aDone = new Promise(r => { release = r; });
  kv.after = async (cmd, out) => {
    if (cmd[0] === 'HGET' && cmd[1] === 'bkh' && cmd[2] === code && ++n === 2) { assert(/in_attesa/.test(out), 'la consegna 2 legge ancora "in_attesa"'); await aDone; }       // la sua risposta arriva dopo che la 1 ha finito
    if (cmd[0] === 'SET' && cmd[1] === 'done:' + code + ':mail_ospite') release();                                                                                                      // la consegna 1 ha confermato, scritto e inviato tutto
  };
  const [r1, r2] = await Promise.all([1, 2].map(() => H.webhook('checkout.session.completed', H.paidSession(code))));
  kv.after = null; assert(n >= 2, 'intreccio non realizzato');
  eq(JSON.parse(kv.exec(['HGET', 'bkh', code])).stato, 'confermata', 'resta confermata');
  eq(global.__mails.filter(m => /conflitto/i.test(m.subject || '')).length, 0, 'nessun falso avviso di conflitto al titolare');
  eq(global.__mails.length, 2, 'una mail al titolare e una all\'ospite');
  eq(gas.rows().filter(x => x.ID_PRENOTAZIONE === 'SITO|' + code).length, 1);
  eq((await H.api('mie', { code })).status, 200, 'il cliente la vede');
});

test('X17 avvisi al titolare: una mail per episodio, promemoria ogni 6 ore, mail al ripristino; se l\'SMTP è giù si riprova', async () => {
  await base();
  const al = () => global.__mails.filter(m => /verificabile|ripristinata/i.test(m.subject || ''));
  global.__mails.length = 0;
  await H.sync(); eq(al().length, 0, 'tutto sano: nessun avviso');
  H.breakFeed('bookingTorre', { status: 500 }); tick(30); await H.sync(); eq(al().length, 0, 'in ritardo ma ancora entro la soglia: nessun avviso');
  tick(200); global.__mailFail = true; await H.sync(); eq(al().length, 0, 'SMTP giù: nulla è partito');
  global.__mailFail = false; await H.sync();
  eq(al().length, 1, 'al giro successivo l\'avviso parte: il fallimento non l\'aveva segnato come inviato');
  assert(/Disponibilità non verificabile/.test(al()[0].subject) && /Torre/.test(al()[0].subject), al()[0].subject);
  assert(/FEED_SCADUTO/.test(al()[0].text) && /NON ACCETTA PRENOTAZIONI/.test(al()[0].text) && /admin\.html#sync/.test(al()[0].text), 'motivo, conseguenza e dove intervenire');
  await H.sync(); tick(10); await H.sync(); eq(al().length, 1, 'nessun doppione nello stesso episodio');
  tick(6 * 60); await H.sync(); eq(al().length, 2, 'promemoria dopo 6 ore'); assert(/Ancora non verificabile/.test(al()[1].subject), al()[1].subject);
  H.setFeed('bookingTorre', [H.bookingEv('b1', '2026-10-02', '2026-10-04'), H.bookingEv('b2', '2026-11-19', '2026-11-22')]); tick(11); await H.sync();
  eq(al().length, 3, 'ripristino'); assert(/ripristinata/i.test(al()[2].subject), al()[2].subject);
  tick(11); await H.sync(); eq(al().length, 3, 'a episodio chiuso nessun altro messaggio');
  assert(!al().some(m => /Corte/.test(m.subject)), 'Corte non è coinvolta');
});

test('X18 configurazione pubblica: niente URL iCal (token), chiusure e blocchi manuali; la configurazione completa solo con il login', async () => {
  await base();
  const cfg = JSON.parse(kv.exec(['GET', 'cfg'])); cfg.closed = { corte: false }; cfg.apts.find(a => a.id === 'torre').blocked = { '2026-12-05': true }; kv.exec(['SET', 'cfg', JSON.stringify(cfg)]);
  const pub = await H.api('cfg', {}, { method: 'GET' });
  eq(pub.status, 200); eq(Object.keys(pub.body).sort(), ['apts', 'chi']);
  assert(pub.body.apts.every(a => !('blocked' in a)), 'nessun blocco manuale');
  for (const k of ['ical.booking.com', 'airbnb.com/calendar', 'TOKEN', 'ATOK', 'CTOK']) assert(!pub.text.includes(k), 'nel testo pubblico compare ' + k);
  assert(pub.body.apts.length === 2 && pub.body.apts[0].foto.length > 0 && pub.body.apts[0].base > 0, 'restano i dati che servono alle pagine');
  eq((await H.api('cfg_admin', {})).status, 401, 'senza login niente configurazione completa');
  const full = await H.adminApi('cfg_admin', {});
  eq(full.status, 200); assert(/ical\.booking\.com/.test(JSON.stringify(full.body.ical)) && full.body.apts.find(a => a.id === 'torre').blocked['2026-12-05'], 'con il login c\'è tutto');
});

/* ===================== esecuzione ===================== */
// Test che dipendono dal comportamento REALE dello script Apps Script (lettura Gmail, righe del foglio, trigger): saltati se nel repo c'è solo lo stub
const NEEDS_GAS = new Set(['T1', 'T2', 'T3', 'T4', 'T6', 'T10', 'T11', 'T12', 'X4', 'X5', 'X6', 'X7', 'X8', 'X9', 'X10', 'X11', 'X13', 'X16']);
(async () => {
  const only = process.argv[2]; let pass = 0, fail = 0, skip = 0; const t0 = process.hrtime.bigint();      // cronometro reale: Date.now() è l'orologio simulato
  if (!H.GAS_REAL) console.log('ATTENZIONE: google-apps-script.gs non è nel repo: uso lo stub minimo e SALTO i test che richiedono lo script vero (rimettilo nella radice per la suite completa).\n');
  for (const t of tests) {
    if (only && !t.n.startsWith(only)) continue;
    if (!H.GAS_REAL && NEEDS_GAS.has(t.n.split(/\s/)[0])) { console.log('  - ' + t.n.slice(0, 90) + '  [saltato: richiede lo script Apps Script vero]'); skip++; continue; }
    try { await t.f(); console.log('  ✔ ' + t.n); pass++; } catch (e) { console.log('  ✘ ' + t.n + '\n      → ' + String(e.stack || e.message).split('\n').slice(0, only ? 40 : 3).join('\n        ')); fail++; }
  }
  console.log('\n' + pass + ' ok, ' + fail + ' falliti' + (skip ? ', ' + skip + ' saltati' : '') + '  (' + (Number(process.hrtime.bigint() - t0) / 1e9).toFixed(1) + ' s)'); process.exit(fail ? 1 : 0);
})();
