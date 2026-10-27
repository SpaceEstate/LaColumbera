'use strict';
// La Columbera · prove di Gestione → Adempimenti → ISTAT (Fase 2): libreria (I), client del servizio (W) ed endpoint admin (J).
// Nessuna rete: servizio ISTAT finto (istat-mock.js, che segue il protocollo del PDF), archivio KV finto, orologio simulato. Dati di fantasia: CIPAT d'esempio.
//   node tests/sim/istat.js [filtro]
const assert = require('assert'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const IS = require('../../api/_istat.js'), W = require('../../api/_istat_ws.js'), IST = require('../../api/istat.js'), ADP = require('../../api/adempimenti.js');
const { makeIstatMock } = require('./istat-mock.js');
const eq = (a, b, m) => assert.deepStrictEqual(a, b, m);
const fx = n => fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'istat', n), 'utf8');
const sha = t => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const TAB = require('../../data/istat-provenienze.json'), P = IS.buildProvenienze(TAB);
const CIPAT = '022001-AT-012345';
const NOW = Date.parse('2026-09-26T10:00:00Z');      // Roma: 26/09/2026 → arrivi ammessi dal 01/08/2026 al 30/09/2026
const val = (rows, o) => IS.validateRows(rows, Object.assign({ now: NOW, provenienze: P, cipat: CIPAT }, o || {}));
const row = o => Object.assign({ cipat: CIPAT, arrivo: '20260908', partenza: '20260911', sigla: 'PG', persone: '2' }, o || {});
const codes = (r, sev) => r.issues.filter(i => !sev || i.sev === sev).map(i => i.code + (i.campo ? ':' + i.campo : ''));
const has = (r, c, sev) => codes(r, sev || 'errore').includes(c);
const tests = [], test = (n, f) => tests.push({ n, f });

/* ===================== I · file e controlli formali ===================== */
test('I1  il file d\'esempio: 20 movimenti letti senza modifiche, nessun problema, CSV rigenerato identico byte per byte, impronta SHA-256', () => {
  const text = fx('movimenti.csv'), p = IS.parseText(text);
  eq([p.rows.length, p.issues], [20, []]); assert(p.rows.every(r => r._s.length === 0));
  const v = val(p.rows); eq([v.riepilogo.errori, v.riepilogo.avvisi, v.riepilogo.inviabile, v.riepilogo.totale, v.riepilogo.persone, v.riepilogo.coppieRipetute], [0, 0, true, 20, 40, 3], 'stesso CIPAT e stesso arrivo (3 coppie) non sono né errori né avvisi');
  eq([v.riepilogo.primoArrivo, v.riepilogo.ultimoArrivo], ['20260808', '20260925']);
  eq(v.body.length, 20); eq(v.body[0], { CIPAT, dataArrivo: '20260808', dataPartenza: '20260811', siglaProvenienza: 'PG', nrPersone: '3' }, 'corpo come negli esempi del PDF: solo stringhe');
  assert(v.body.every(x => Object.keys(x).join() === 'CIPAT,dataArrivo,dataPartenza,siglaProvenienza,nrPersone' && Object.values(x).every(y => typeof y === 'string')));
  eq(v.hash, sha(JSON.stringify(v.body))); assert(/^[0-9a-f]{64}$/.test(v.hash)); eq(v.rows.map(IS.lineOf).join('\n') + '\n', text, 'ogni riga rilegge identica al file di partenza');
  eq(v.rows[0].dec, { sigla: 'Perugia', tipo: 'provincia' }); eq(v.rows[1].dec.sigla, 'SPAGNA'); eq(v.rows[0].notti, 3);
});
test('I2  LF, CRLF, assenza del terminatore finale e BOM si leggono allo stesso modo; CR isolato, TAB, virgolette e righe vuote sono errori', () => {
  const lf = fx('movimenti.csv'), base = IS.parseText(lf).rows.map(IS.lineOf), same = t => IS.parseText(t).rows.map(IS.lineOf);
  eq(same(lf.replace(/\n/g, '\r\n')), base); eq(same(lf.slice(0, -1)), base);
  const crlf = IS.parseText(lf.replace(/\n/g, '\r\n')); assert(crlf.rows.every(r => r._s.length === 0), 'CRLF: nessuna segnalazione'); eq(crlf.rows.map(IS.lineOf).join('\n') + '\n', lf, 'CRLF letto come LF');
  const bom = IS.parseText('\uFEFF' + lf); eq(bom.issues.map(i => i.code), ['BOM']); eq(bom.rows.length, 20);
  const L = lf.split('\n'); const mod = (i, f) => { const t = L.slice(0, 20); t[i] = f(t[i]); return IS.parseText(t.join('\n')).rows[i]; };
  assert(mod(1, x => x.replace('ESP', 'E\tP'))._s.some(i => i.code === 'CARATTERE'), 'TAB'); assert(mod(1, x => x.replace('ESP', 'ES\rP'))._s.some(i => i.code === 'CARATTERE'), 'CR isolato');
  assert(/virgolette/.test(mod(2, x => '"' + x.replace(';', '";"') )._s.find(i => i.code === 'CARATTERE').msg), 'virgolette'); assert(mod(3, x => '')._s.some(i => i.code === 'COLONNE'), 'riga vuota');
  assert(IS.parseText('\uFFFD' + lf.slice(1)).rows[0]._s.find(i => i.code === 'CARATTERE').fix.includes('ASCII/UTF-8'), 'carattere di sostituzione');
  eq(IS.parseText('').issues.map(i => i.code), ['FILE_VUOTO']); eq(IS.parseText(null).issues.map(i => i.code), ['FILE']);
  const big = IS.parseText(Array(1001).fill(L[0]).join('\n')); eq([big.rows.length, big.issues.map(i => i.code)], [0, ['TROPPE_RIGHE']]);
});
test('I3  colonne sbagliate: manca il CIPAT (colonne al loro posto), troppe o troppo poche, separatore sbagliato, intestazione', () => {
  let r = IS.parseText('20260908;20260911;PG;2').rows[0]; eq([r.cipat, r.arrivo, r.partenza, r.sigla, r.persone, r.approssimato], ['', '20260908', '20260911', 'PG', '2', true]); assert(/manca il CIPAT/.test(r._s[0].msg));
  assert(has(val([r]).rows[0], 'OBBLIGATORIO:cipat') && val([r]).riepilogo.inviabile === false);
  r = IS.parseText(CIPAT + ',20260908,20260911,PG,2').rows[0]; assert(/1 colonna /.test(r._s[0].msg) && /virgole/.test(r._s[0].fix), r._s[0].msg + ' ' + r._s[0].fix); assert(r.approssimato);
  r = IS.parseText(CIPAT + '\t20260908\t20260911\tPG\t2').rows[0]; assert(/tabulazioni/.test(r._s.find(i => i.code === 'COLONNE').fix), 'separatore sbagliato');
  r = IS.parseText(CIPAT + ';20260908;20260911;PG;2;extra').rows[0]; assert(/6 colonne/.test(r._s[0].msg) && r.approssimato && r.persone === '2');
  r = IS.parseText('CIPAT;DataArrivo;DataPartenza;Sigla;Persone').rows[0]; assert(r._s.some(i => i.code === 'INTESTAZIONE'));
  eq(val([IS.parseText(CIPAT + ';20260908;20260911;PG;2').rows[0]]).riepilogo.inviabile, true);
  const ap = val([{ ...row(), approssimato: true, _s: [{ sev: 'errore', code: 'RIGA_RICOSTRUITA', campo: null, msg: 'x', fix: '' }] }]); eq(ap.riepilogo.inviabile, false, 'riga ricostruita: serve la conferma a mano');
});
test('I4  CIPAT: obbligatorio, 16 caratteri, solo lettere cifre e trattini; DIVERSO da quello della struttura = errore che blocca; non configurato = errore generale', () => {
  for (const [over, exp] of [[{ cipat: '' }, 'OBBLIGATORIO:cipat'], [{ cipat: '022001-AT-01234' }, 'FORMATO:cipat'], [{ cipat: '022001-AT-0123456' }, 'FORMATO:cipat'], [{ cipat: '022001-AT-01234#' }, 'FORMATO:cipat'],
    [{ cipat: '022001-AT-999999' }, 'CIPAT_DIVERSO:cipat'], [{ cipat: '022001-at-012345' }, 'CIPAT_DIVERSO:cipat']]) {
    const v = val([row(over)]); assert(has(v.rows[0], exp), JSON.stringify(over) + ' → ' + codes(v.rows[0])); eq(v.riepilogo.inviabile, false, JSON.stringify(over)); eq(v.body, null);
  }
  assert(/deve avere 16 caratteri \(questo ne ha 15\)/.test(val([row({ cipat: '022001-AT-01234' })]).rows[0].issues[0].msg) && /ne ha 17/.test(val([row({ cipat: '022001-AT-0123456' })]).rows[0].issues[0].msg), 'messaggio sulla lunghezza');
  assert(/caratteri non ammessi/.test(val([row({ cipat: '022001-AT-01234#' })]).rows[0].issues[0].msg), 'messaggio sui caratteri');
  const mix = val([row(), row({ cipat: '022001-AT-999999' }), row()]); eq([mix.rows.map(r => r.errori), mix.riepilogo.inviabile], [[0, 1, 0], false], 'solo la riga con il CIPAT sbagliato è segnata');
  assert(/unica struttura/.test(mix.rows[1].issues[0].fix), 'il motivo è chiaro');
  const odd = val([row({ cipat: '022001-at-012345' })], { cipat: '022001-at-012345' }); eq([codes(odd.rows[0]), odd.riepilogo.inviabile], [['CIPAT_FORMA:cipat'], true], 'forma insolita ma uguale a quella configurata: solo avviso');
  let v = val([row()], { cipat: '' }); eq([v.globali.map(g => g.code + ':' + g.sev), v.riepilogo.inviabile, v.body], [['CIPAT_NON_CONFIGURATO:errore'], false, null], 'senza CIPAT configurato non si invia'); assert(/ISTAT_CIPAT/.test(v.globali[0].fix));
  v = val([row()], { cipat: 'abc' }); eq([v.globali.map(g => g.code), v.riepilogo.inviabile], [['CIPAT_CONFIG'], false]);
  eq(codes(val([row()]).rows[0]), []);
});
test('I5  date: formato AAAAMMGG e calendario reale, partenza dopo l\'arrivo, non oltre un anno, periodo dell\'arrivo (mese corrente e precedente, ora di Roma)', () => {
  for (const [over, exp] of [[{ arrivo: '' }, 'OBBLIGATORIO:arrivo'], [{ arrivo: '2026091' }, 'FORMATO:arrivo'], [{ arrivo: '20261301' }, 'FORMATO:arrivo'], [{ arrivo: '20260230' }, 'FORMATO:arrivo'], [{ arrivo: '2026-09-08' }, 'FORMATO:arrivo'],
    [{ partenza: 'abc' }, 'FORMATO:partenza'], [{ partenza: '' }, 'OBBLIGATORIO:partenza'], [{ partenza: '20260908' }, 'PARTENZA_NON_DOPO:partenza'], [{ arrivo: '20260912' }, 'PARTENZA_NON_DOPO:partenza'], [{ partenza: '20270909' }, 'PARTENZA_OLTRE_ANNO:partenza']]) {
    const v = val([row(over)]); assert(has(v.rows[0], exp), JSON.stringify(over) + ' → ' + codes(v.rows[0])); eq(v.riepilogo.inviabile, false, JSON.stringify(over));
  }
  eq(val([row({ partenza: '20270908' })]).riepilogo.inviabile, true, 'esattamente un anno: ammessa');
  const leap = o => val([row({ arrivo: '20280229', ...o })], { now: Date.parse('2028-02-29T10:00:00Z') });
  eq(leap({ partenza: '20290301' }).riepilogo.inviabile, true, '29 febbraio + 1 anno'); assert(has(leap({ partenza: '20290302' }).rows[0], 'PARTENZA_OLTRE_ANNO:partenza'));
  const per = (arrivo, now) => codes(val([row({ arrivo, partenza: IS.isoToD8(new Date(Date.parse(arrivo.replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3') + 'T00:00:00Z') + 2 * 864e5).toISOString().slice(0, 10)) })], { now: Date.parse(now) }).rows[0], 'avviso');
  eq([per('20260801', '2026-09-26T10:00:00Z'), per('20260930', '2026-09-26T10:00:00Z')], [[], []], 'primo giorno del mese precedente e ultimo del corrente: ammessi');
  eq([per('20260731', '2026-09-26T10:00:00Z'), per('20261001', '2026-09-26T10:00:00Z')], [['ARRIVO_FUORI_PERIODO:arrivo'], ['ARRIVO_FUORI_PERIODO:arrivo']], 'fuori periodo: avviso');
  eq([per('20251201', '2026-01-15T10:00:00Z'), per('20251130', '2026-01-15T10:00:00Z')], [[], ['ARRIVO_FUORI_PERIODO:arrivo']], 'a gennaio il mese precedente è dicembre dell\'anno prima');
  eq([per('20260831', '2026-09-30T21:30:00Z'), per('20260831', '2026-09-30T22:30:00Z')], [[], ['ARRIVO_FUORI_PERIODO:arrivo']], 'mezzanotte di Roma, non di UTC: 30/9 23:30 → settembre; 1/10 00:30 → ottobre');
  assert(/fino a un mese prima di oggi/.test(val([row({ arrivo: '20260101', partenza: '20260103' })]).rows[0].issues[0].fix), 'il messaggio cita anche il manuale utente');
  eq(val([row({ arrivo: '20260101', partenza: '20260103' })]).riepilogo.inviabile, true, 'fuori periodo: non blocca');
});
test('I6  provenienza: obbligatoria, massimo 3 caratteri, nell\'elenco ufficiale (province, stati, casi speciali); suggerimento per le minuscole', () => {
  for (const [over, exp] of [[{ sigla: '' }, 'OBBLIGATORIO:sigla'], [{ sigla: 'pg' }, 'SIGLA_NON_IN_TABELLA:sigla'], [{ sigla: 'ZZZ' }, 'SIGLA_NON_IN_TABELLA:sigla'], [{ sigla: 'XX' }, 'SIGLA_NON_IN_TABELLA:sigla'], [{ sigla: 'ITALIA' }, 'FORMATO:sigla']]) {
    const v = val([row(over)]); assert(has(v.rows[0], exp), JSON.stringify(over) + ' → ' + codes(v.rows[0])); eq(v.riepilogo.inviabile, false);
  }
  assert(/PG \(Perugia\)/.test(val([row({ sigla: 'pg' })]).rows[0].issues[0].fix), 'suggerisce la sigla giusta');
  const amb = val([row({ sigla: 'fr' })]); eq([amb.rows[0].sigla, amb.riepilogo.inviabile, amb.body], ['fr', false, null], 'una sigla ambigua o minuscola non viene mai convertita da sola');
  for (const s of ['PG', 'TN', 'DEU', 'FRA', 'FR', '*CE', '*CN', 'BQ', 'ML', 'XZ']) eq(val([row({ sigla: s })]).riepilogo.inviabile, true, s);
  eq([val([row({ sigla: 'DEU' })]).rows[0].dec.tipo, val([row({ sigla: 'TN' })]).rows[0].dec.tipo], ['stato', 'provincia']);
});
test('I7  persone: intero da 1 a 99; "03" diventa 3; gli spazi si tolgono con un avviso', () => {
  for (const [over, exp] of [[{ persone: '' }, 'OBBLIGATORIO:persone'], [{ persone: '0' }, 'PERSONE_INTERVALLO:persone'], [{ persone: '100' }, 'PERSONE_INTERVALLO:persone'], [{ persone: '-1' }, 'FORMATO:persone'], [{ persone: 'tre' }, 'FORMATO:persone'], [{ persone: '3.5' }, 'FORMATO:persone']]) {
    const v = val([row(over)]); assert(has(v.rows[0], exp), JSON.stringify(over) + ' → ' + codes(v.rows[0])); eq(v.riepilogo.inviabile, false);
  }
  for (const n of ['1', '99']) eq(val([row({ persone: n })]).riepilogo.inviabile, true, n);
  eq(val([row({ persone: '03' })]).body[0].nrPersone, '3', 'zeri iniziali tolti');
  const p = IS.parseText(CIPAT + ' ;20260908;20260911;PG; 5 '); eq(p.rows[0].persone, '5'); eq(p.rows[0]._s.map(i => i.code + ':' + i.sev), ['SPAZI:avviso']); const v = val(p.rows); eq([v.riepilogo.inviabile, v.body[0].nrPersone, v.body[0].CIPAT], [true, '5', CIPAT], 'spazi tolti nel corpo da trasmettere');
});
test('I8  duplicati: identici = avviso (il portale li scarta); stesso CIPAT e arrivo con dati diversi è normale e si conta soltanto', () => {
  let v = val([row(), row()]); eq(codes(v.rows[1], 'avviso'), ['DUPLICATO']); eq(codes(v.rows[0]), []); eq([v.riepilogo.inviabile, v.riepilogo.coppieRipetute], [true, 1]);
  v = val([row(), row({ sigla: 'DEU' })]); eq([codes(v.rows[1]), v.riepilogo.coppieRipetute], [[], 1]);
  v = val([row(), row({ arrivo: '20260909', partenza: '20260912' })]); eq(v.riepilogo.coppieRipetute, 0);
  eq(val([]).globali.map(g => g.code), ['FILE_VUOTO']);
});
test('I9  il corpo da trasmettere esiste solo senza errori; impronta stabile e diversa a ogni modifica; valori normalizzati', () => {
  const a = val([row()]), b = val([row()]); eq(a.hash, b.hash); eq(a.body, [{ CIPAT, dataArrivo: '20260908', dataPartenza: '20260911', siglaProvenienza: 'PG', nrPersone: '2' }]); eq(a.hash, sha(JSON.stringify(a.body)));
  for (const over of [{ persone: '3' }, { sigla: 'DEU' }, { arrivo: '20260909' }, { partenza: '20260912' }]) assert.notStrictEqual(val([row(over)]).hash, a.hash, JSON.stringify(over));
  const x = row(), y = row({ sigla: 'DEU' }); assert.notStrictEqual(val([x, y]).hash, val([y, x]).hash, 'ordine');
  const bad = val([row({ persone: '0' })]); eq([bad.body, bad.hash, bad.riepilogo.inviabile], [null, null, false]);
  const av = val([row({ arrivo: '20250101', partenza: '20250103' })]); eq([av.riepilogo.avvisi, av.riepilogo.inviabile, av.hash === null], [1, true, false], 'gli avvisi non bloccano');
  const nz = val([row({ persone: '03', sigla: ' PG ' })]); eq([nz.body[0].nrPersone, nz.body[0].siglaProvenienza], ['3', 'PG']);
  eq(IS.hashBody([]), sha('[]')); eq(IS.emptyRow(CIPAT), { cipat: CIPAT, arrivo: '', partenza: '', sigla: '', persone: '' }); eq(IS.toServiceBody([row({ persone: 2 })])[0].nrPersone, '2', 'sempre stringhe, come nel PDF');
});
test('I10 tabella delle provenienze: struttura, ricerca per nome e per sigla, nessuna sigla ripetuta', () => {
  eq([P.ok, P.size, P.stati, P.province], [true, 360, 249, 111]);
  for (const c of ['PG', 'ESP', 'ROU', 'PA', 'LT', 'PR', 'TO', 'SI', 'VC', 'UKR', 'GBR', 'CHE', 'CAN', 'KR', 'FRA', 'FR', 'PV', 'FI']) assert(P.get(c), 'sigla del file d\'esempio: ' + c);
  eq(P.get('PG'), { codice: 'PG', nome: 'Perugia', tipo: 'provincia' }); eq(P.get('AG').nome, 'Agrigento'); eq(P.get('ZWE').nome, 'ZIMBABWE'); eq(P.get('pg'), undefined, 'maiuscole esatte'); eq(P.get(''), undefined); eq(P.get(null), undefined);
  eq(IS.searchProvenienze(P, 'perug').map(x => x.codice), ['PG']); eq(IS.searchProvenienze(P, 'spag')[0].codice, 'ESP'); eq(IS.searchProvenienze(P, 'DE')[0].codice, 'DEU'); eq(IS.searchProvenienze(P, 'FR')[0].codice, 'FR', 'la sigla esatta (Frosinone) prima di FRA e dei nomi che iniziano per FR'); eq(IS.searchProvenienze(P, 'TO')[0].codice, 'TO', 'Torino prima di TOGO/TONGA'); eq(IS.searchProvenienze(P, 'PG')[0].codice, 'PG');
  eq(IS.searchProvenienze(P, 'x'), [], 'un solo carattere non basta'); eq(IS.searchProvenienze(null, 'pg'), []); eq(IS.searchProvenienze(P, 'zzzzzz'), []);
  const dup = IS.buildProvenienze({ stati: [['AAA', 'Uno'], ['AAA', 'Due']], province: [['BB', 'Tre'], [1, 2], 'x'] }); eq([dup.size, dup.get('AAA').nome], [2, 'Uno'], 'sigle ripetute o voci malformate ignorate'); eq(IS.buildProvenienze(null).ok, false);
});
test('I11 file statico data/istat-provenienze.json: tutte le sigle ben formate, nessuna ripetuta, voci attese', () => {
  const all = [...TAB.stati, ...TAB.province]; eq(new Set(all.map(x => x[0])).size, all.length, 'sigle uniche');
  for (const [c, d] of TAB.stati) { assert(/^(\*[A-Z]{2}|[A-Z]{2,3})$/.test(c), 'stato: ' + c); assert(d && d === d.trim() && !/\.$/.test(d), 'descrizione: ' + c); }
  for (const [c, d] of TAB.province) { assert(/^[A-Z]{2}$/.test(c), 'provincia: ' + c); assert(d && d === d.trim(), 'descrizione: ' + c); }
  eq(TAB.stati.filter(x => x[0].length === 2).map(x => x[0]), ['BQ', 'ML', 'XZ']); eq(TAB.stati.filter(x => x[0][0] === '*').map(x => x[0]), ['*CE', '*CN']);
  assert(TAB.fonte && TAB.url && TAB.acquisita, 'origine documentata');
});
test('I12 senza tabella delle provenienze: errore esplicito che blocca l\'invio; la sigla si controlla solo nella forma', () => {
  const v = val([row({ sigla: 'ZZZ' })], { provenienze: null }); assert(v.globali.some(g => g.code === 'TABELLA' && g.sev === 'errore')); eq([v.riepilogo.inviabile, v.rows[0].dec.sigla, v.body], [false, null, null], 'senza l\'elenco ufficiale non si invia');
  assert(has(val([row({ sigla: 'ABCD' })], { provenienze: null }).rows[0], 'FORMATO:sigla'), 'massimo 3 caratteri anche senza tabella');
});

test('I13 impronte dei movimenti: più movimenti uguali si contano; i marcatori segnano come già acquisiti solo quelli indicati', () => {
  const f = IS.fingerprints([row(), row({ sigla: 'DEU' }), row(), row()]); eq(f.map(x => x.occ), [0, 0, 1, 2]); eq(f[0].fp, f[2].fp); assert(f[0].fp !== f[1].fp && /^[0-9a-f]{32}$/.test(f[0].fp));
  eq(IS.fingerprint(row({ persone: '02' })), IS.fingerprint(row({ persone: '2' })), 'stessa impronta dopo la normalizzazione'); assert(IS.fingerprint(row({ persone: '3' })) !== IS.fingerprint(row()));
  const v = val([row(), row({ sigla: 'DEU' }), row()], { inviati: { 0: true, 1: true } }); eq([codes(v.rows[0]), codes(v.rows[1]), codes(v.rows[2], 'errore')], [['GIA_INVIATO'], ['GIA_INVIATO'], []]); eq([v.riepilogo.inviabile, v.body], [false, null]);
  assert(/già acquisito dal servizio/.test(v.rows[0].issues[0].msg) && /eliminalo/.test(v.rows[0].issues[0].fix));
});


/* ===================== W · client del servizio (api/_istat_ws.js) ===================== */
const CFG = { user: 'ws-user', password: 'ws-pass', url: W.DEFAULT_URL, listUrl: W.DEFAULT_URL + '&list' };
const BODY = () => IS.toServiceBody([row(), row({ arrivo: '20260909', partenza: '20260912', sigla: 'DEU', persone: '4' })]);
const mk = o => makeIstatMock(Object.assign({ now: () => NOW }, o));
const net = m => ({ fetch: m.fetch, timeoutMs: 1000 });
test('W1  configurazione: credenziali obbligatorie, invio reale solo con "true" E Production, indirizzo e utente mascherato', () => {
  const full = { ISTAT_WS_USER: 'ws-user', ISTAT_WS_PASSWORD: 'ws-pass' };
  eq(W.readConfig({}).missing, W.VARS); eq(W.readConfig({ ...full, ISTAT_WS_PASSWORD: '  ' }).missing, ['ISTAT_WS_PASSWORD'], 'solo spazi = mancante'); eq(W.readConfig(full).missing, []);
  const en = (a, b) => W.readConfig({ ...full, ISTAT_SEND_ENABLED: a, VERCEL_ENV: b }).send;
  eq([en('true', 'production').enabled, en(' true ', 'production').enabled], [true, true]);
  for (const [a, b] of [['true', 'preview'], ['true', 'development'], ['true', undefined], ['TRUE', 'production'], ['1', 'production'], ['false', 'production'], [undefined, 'production'], ['', 'production']]) { const s = en(a, b); eq(s.enabled, false, a + '/' + b); assert(s.motivo.length > 10, 'il motivo è spiegato (' + a + '/' + b + ')'); }
  const c = W.readConfig(full); eq([c.url, c.listUrl], ['https://statweb.provincia.tn.it/istatAlloggi/upload.aspx?ws', 'https://statweb.provincia.tn.it/istatAlloggi/upload.aspx?ws&list']);
  eq(W.readConfig({ ...full, ISTAT_WS_URL: 'https://prova.test/x?ws' }).listUrl, 'https://prova.test/x?ws&list'); eq(W.readConfig({ ...full, ISTAT_WS_URL: 'https://prova.test/x' }).listUrl, 'https://prova.test/x?list');
  eq([W.maskUser('ws-user'), W.maskUser('abcd'), W.maskUser(''), W.maskUser('abcdefghijkl')], ['ws\u2022\u2022\u2022er', '\u2022\u2022\u2022\u2022', '', 'ab\u2022\u2022\u2022\u2022\u2022\u2022kl']); eq(W.hostOf(c.url), 'statweb.provincia.tn.it'); eq(W.hostOf('boh'), '');
});
test('W2  la richiesta è quella del PDF: POST, indirizzo, credenziali nell\'header, corpo JSON con i soli campi documentati (tutte stringhe), nessun redirect seguito', async () => {
  const m = mk(), r = await W.upload(CFG, BODY(), net(m)), q = m.requests[0];
  eq([q.method, q.url, q.headers.username, q.headers.password, q.headers['content-type'], q.redirect], ['POST', 'https://statweb.provincia.tn.it/istatAlloggi/upload.aspx?ws', 'ws-user', 'ws-pass', 'application/json', 'manual']);
  const sent = JSON.parse(q.raw); eq(sent, BODY()); eq(Object.keys(sent[0]), ['CIPAT', 'dataArrivo', 'dataPartenza', 'siglaProvenienza', 'nrPersone']); assert(sent.every(x => Object.values(x).every(v => typeof v === 'string')));
  eq(m.protocolErrors, [], 'nessuno scostamento dal protocollo'); eq([r.ok, r.http, r.esito], [true, 200, { status: true, info: '2/2 movimenti caricati' }]);
  const l = mk(); const rl = await W.list(CFG, net(l)), ql = l.requests[0]; eq([ql.method, ql.url, ql.headers.username, ql.headers.password, ql.raw, ql.headers['content-type']], ['POST', W.DEFAULT_URL + '&list', 'ws-user', 'ws-pass', undefined, undefined]); eq(l.protocolErrors, []); eq([rl.ok, rl.elementi], [true, 0]);
  const x = mk(); const bad = await W.upload({ ...CFG, password: 'p\u00e4ss' }, BODY(), net(x)); eq([bad.ok, bad.kind, x.requests.length], [false, 'config', 0], 'credenziali con caratteri non ammessi in un header: nessuna richiesta');
});
test('W3  esiti: gli esempi di risposta del PDF e le combinazioni che non tornano', () => {
  const A = (status, info, n) => W.analyzeUpload({ status, info }, n), E = x => x.esito;
  eq([A(true, '5/5 movimenti caricati', 5), A(true, '4/5 movimenti caricati – provenienza incorretta 022001-AT-012345(XXX)', 5), A(false, '0/5 movimenti caricati – date fuori periodo 022001-AT-012345 (02/09/2021) – CIPAT non attivo 022001-AT-012399 - ...', 5)].map(E), ['inviato', 'parziale', 'respinto']);
  eq(W.parseInfo('4/5 movimenti caricati – provenienza incorretta \n022001-AT-012345(XXX)').dettaglio, 'provenienza incorretta 022001-AT-012345(XXX)'); eq(W.parseInfo('0/0 [2 del] movimenti caricati'), { caricati: 0, totale: 0, cancellati: 2, dettaglio: '' }); eq(W.parseInfo('3/3 [1 del] movimenti caricati').cancellati, 1); eq(W.parseInfo('boh'), null);
  const p = A(true, '4/5 movimenti caricati – x', 5); eq([p.caricati, p.totale, p.status], [4, 5, true]);
  eq([A(true, '5/5 movimenti caricati', 6), A(true, '6/6 movimenti caricati', 5), A(true, '0/5 movimenti caricati', 5), A(false, '5/5 movimenti caricati', 5), A(true, 'Operazione eseguita', 5)].map(E), ['incerto', 'incerto', 'incerto', 'incerto', 'incerto'], 'conteggio diverso da quanto inviato, status e conteggio in contraddizione, testo non nel formato: mai "inviato"');
  eq([A(true, '5/5 movimenti caricati', 6).incoerente, A(true, 'Operazione eseguita', 5).incoerente], [true, undefined]); eq(A(false, 'errore generico', 5).esito, 'respinto', 'status false = nessun record caricato (PDF)');
  eq(W.parseEsito('{"status":"true","info":"5/5 movimenti caricati"}'), { status: true, info: '5/5 movimenti caricati' }); eq(W.parseEsito('{"Status":true,"Info":"x"}'), { status: true, info: 'x' }, 'booleano e maiuscole accettati'); eq(W.parseEsito('{"status":"forse"}'), null);
  for (const t of ['', '<html>', '[]', 'null', '{}', '{"info":"x"}']) eq(W.parseEsito(t), null, JSON.stringify(t)); eq(W.analyzeUpload(null, 3).esito, 'incerto');
});
test('W4  guasti del servizio: ogni anomalia si distingue, non lancia e si classifica (non elaborata sicuramente / forse elaborata)', async () => {
  for (const [modo, kind, certo, stato] of [['abort', 'timeout', false, 'servizio_non_raggiungibile'], ['rete', 'rete', false, 'servizio_non_raggiungibile'], ['http500', 'http', false, 'errore_servizio'], ['http401', 'http', true, 'credenziali_non_valide'],
    ['http404', 'http', true, 'richiesta_rifiutata'], ['redirect', 'http', false, 'errore_servizio'], ['html', 'formato', false, 'errore_servizio'], ['json-rotto', 'formato', false, 'errore_servizio'], ['status-vuoto', 'formato', false, 'errore_servizio']]) {
    const r = await W.upload(CFG, BODY(), net(mk({ modo: { upload: modo } }))); eq([r.ok, r.kind], [false, kind], modo); eq(W.classify(r), { certo, stato }, modo); assert(W.dettaglio(r).length > 3 || kind === 'formato', modo);
  }
  const cred = await W.upload({ ...CFG, password: 'sbagliata' }, BODY(), net(mk())); eq([cred.ok, cred.http, W.classify(cred).stato], [false, 401, 'credenziali_non_valide']);
  for (const modo of ['incoerente', 'solo-testo']) { const r = await W.upload(CFG, BODY(), net(mk({ modo: { upload: modo } }))); eq([r.ok, W.analyzeUpload(r.esito, 2).esito], [true, 'incerto'], modo); }
  const t0 = Date.now(), r = await W.upload(CFG, BODY(), { fetch: mk({ modo: { upload: 'timeout' } }).fetch, timeoutMs: 40 }); eq([r.ok, r.kind], [false, 'timeout']); assert(Date.now() - t0 < 1000, 'il timer interrompe la chiamata');
  eq(W.classify({ kind: 'config' }), { certo: true, stato: 'credenziali_non_valide' }); eq(W.dettaglio({ kind: 'http', http: 502 }), 'HTTP 502'); assert(Object.keys(W.STATI).every(k => W.STATI[k].titolo && W.STATI[k].fix));
});
test('W5  elenco dei movimenti (list): sola lettura, formato non documentato = testo mostrato com\'è (troncato), errori leggibili', async () => {
  const m = mk(); await W.upload(CFG, BODY(), net(m)); const r = await W.list(CFG, net(m)); eq([r.ok, r.http, r.json, r.elementi, r.troncato], [true, 200, true, 2, false]); eq(JSON.parse(r.testo)[0].siglaProvenienza, 'PG');
  const big = await W.list(CFG, { fetch: async () => ({ ok: true, status: 200, text: async () => 'x'.repeat(9000) }), timeoutMs: 500 }); eq([big.ok, big.testo.length, big.troncato, big.json, big.elementi], [true, 4000, true, false, null]);
  const txt = await W.list(CFG, { fetch: async () => ({ ok: true, status: 200, text: async () => 'Nessun movimento' }), timeoutMs: 500 }); eq([txt.ok, txt.testo, txt.json], [true, 'Nessun movimento', false]);
  for (const [modo, kind] of [['http500', 'http'], ['http401', 'http'], ['abort', 'timeout'], ['rete', 'rete']]) { const e = await W.list(CFG, net(mk({ modo: { list: modo } }))); eq([e.ok, e.kind], [false, kind], modo); }
});

/* ===================== J · endpoint di gestione (api/istat.js) ===================== */
function makeKv(clock) {      // archivio finto con SET NX/EX, INCRBY, EXPIRE, scadenze sull'orologio simulato e guasti a richiesta
  const d = new Map(), live = k => { const e = d.get(k); if (!e) return null; if (e.exp && e.exp <= clock.t) { d.delete(k); return null; } return e; };
  const kv = async (...c) => {
    const [op, k, v, ...o] = c, O = String(op).toUpperCase();
    if (kv.fail || (kv.failOn && kv.failOn.test(String(k)))) throw new Error('KV: non raggiungibile');
    if (O === 'GET') { const e = live(k); return e ? e.v : null; }
    if (O === 'SET') { let nx = false, ex = 0; for (let i = 0; i < o.length; i++) { const u = String(o[i]).toUpperCase(); if (u === 'NX') nx = true; else if (u === 'EX') ex = +o[++i]; } if (nx && live(k)) return null; d.set(k, { v: String(v), exp: ex ? clock.t + ex * 1000 : 0 }); return 'OK'; }
    if (O === 'DEL') return d.delete(k) ? 1 : 0;
    if (O === 'INCRBY') { const e = live(k), n = (e ? parseInt(e.v, 10) : 0) + parseInt(v, 10); d.set(k, { v: String(n), exp: e ? e.exp : 0 }); return n; }
    if (O === 'EXPIRE') { const e = live(k); if (!e) return 0; e.exp = clock.t + parseInt(v, 10) * 1000; return 1; }
    throw new Error('KV non simulato: ' + op);
  };
  kv.d = d; return kv;
}
const ENV = { SESSION_SECRET: 'sess-test', ISTAT_CIPAT: CIPAT, ISTAT_WS_USER: 'ws-user', ISTAT_WS_PASSWORD: 'ws-pass', ISTAT_SEND_ENABLED: 'true', VERCEL_ENV: 'production' };
// o: clock/kv/svc riusabili (altra "istanza" della funzione sullo stesso archivio), env, svcOpts, prov, envObj
function setup(o) {
  o = o || {};
  const clock = o.clock || { t: NOW }, kv = o.kv || makeKv(clock), svc = o.svc || makeIstatMock(Object.assign({ now: () => clock.t }, o.svcOpts));
  const handler = IST.make({ env: o.envObj || Object.assign({}, ENV, o.env), kv, auth: req => !!(req.headers && req.headers.authorization === 'admin-ok'), fetch: (...a) => svc.fetch(...a), now: () => clock.t, provenienze: o.prov });
  const call = (a, body, opt) => new Promise((resolve, reject) => {
    opt = opt || {};
    const req = { method: opt.method || 'POST', query: { a }, headers: opt.noAuth ? {} : { authorization: 'admin-ok' }, body: body === undefined ? {} : body };
    const out = { status: 200, headers: {}, body: null }, res = { setHeader(k, v) { out.headers[k.toLowerCase()] = v; return res; }, status(s) { out.status = s; return res; }, json(b) { out.body = b; resolve(out); return res; } };
    Promise.resolve(handler(req, res)).catch(reject);
  });
  return { clock, kv, svc, call };
}
const rows20 = () => IS.parseText(fx('movimenti.csv')).rows.map(x => ({ ...x }));
async function check(S, rows) { rows = rows || rows20(); const c = await S.call('is_check', { rows }); eq(c.body.stato, 'pronto', JSON.stringify(c.body).slice(0, 300)); return { rows, proof: c.body.proof, hash: c.body.hash }; }
const sendBody = (p, o) => Object.assign({ rows: p.rows, proof: p.proof }, o || {});
const noSend = S => eq(S.svc.count('upload'), 0, 'il servizio non ha ricevuto nessuna trasmissione');
const keys = (S, pre) => [...S.kv.d.keys()].filter(k => k.startsWith(pre));
const wrapSvc = (S, f) => { const g = S.svc.fetch; S.svc.fetch = (u, i) => f(g, u, i); return S; };

test('J1  accesso e ingressi: senza login 401, solo POST, azioni sconosciute, dati manipolati o fuori misura; Alloggiati Web non risponde alle azioni ISTAT', async () => {
  const S = setup(); eq((await S.call('is_status', {}, { noAuth: true })).status, 401); eq((await S.call('is_status', {}, { method: 'GET' })).status, 405);
  for (const a of ['is_boh', 'is_', 'is_Status', 'is_status;x', 'is_status/../x', 'al_status', 'xx_status', '__proto__', 'constructor']) eq((await S.call(a, {})).status, 404, a);
  const v = x => S.call('is_validate', x);
  for (const [body, why] of [[{ rows: 'x' }, 'non è un elenco'], [{ rows: [] }, 'elenco vuoto'], [{ rows: Array(1001).fill(row()) }, '1001 movimenti'], [{ rows: [null] }, 'null'], [{ rows: [[1]] }, 'array'],
    [{ rows: [{ ...row(), sigla: { $ne: 1 } }] }, 'oggetto in un campo'], [{ rows: [{ ...row(), sigla: ['a'] }] }, 'array in un campo'], [{ rows: [{ ...row(), cipat: 'A'.repeat(41) }] }, 'campo troppo lungo'], [{}, 'senza corpo']]) eq((await v(body)).status, 400, why);
  eq((await S.call('is_parse', { text: 5 })).status, 400); eq((await S.call('is_parse', { text: 'x'.repeat(200001) })).status, 400); eq((await S.call('is_check', { rows: 5 })).status, 400); eq((await S.call('is_send', { rows: [] })).status, 400);
  const ok = await v({ rows: [{ ...row(), persone: 2, evil: '<img src=x onerror=alert(1)>', ['__proto__']: { x: 1 }, riga: -3, approssimato: 'si' }] });
  eq(ok.status, 200); assert(!('evil' in ok.body.rows[0]) && !('riga' in ok.body.rows[0]) && !('approssimato' in ok.body.rows[0]), 'campi estranei e marcatori non validi scartati'); eq(ok.body.rows[0].persone, '2'); eq(ok.headers['cache-control'], 'no-store');
  eq(S.svc.requests.length, 0, 'controlli e ricerche non chiamano il servizio');
  const al = ADP.make({ env: {}, kv: async () => null, fetch: async () => null, auth: () => true, now: () => NOW }), out = await new Promise(res => { const o = { status: 200, body: null }, rs = { setHeader() { return rs; }, status(s) { o.status = s; return rs; }, json(b) { o.body = b; res(o); return rs; } }; al({ method: 'POST', query: { a: 'is_status' }, headers: {}, body: {} }, rs); });
  eq(out.status, 404, 'l\'endpoint Alloggiati Web non conosce le azioni ISTAT'); assert(!/_istat|\bis_[a-z]/.test(fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'adempimenti.js'), 'utf8')), 'api/adempimenti.js non è stato toccato');
});
test('J2  stato: CIPAT, credenziali (mai mostrate), invio reale e tabella; nessuna chiamata al servizio', async () => {
  let S = setup(), r = (await S.call('is_status', {})).body;
  eq([r.stato, r.cipat, r.cipatValido, r.credenziali.presenti, r.credenziali.utente, r.send.enabled, r.ambiente, r.servizio, r.provenienze.righe, r.provenienze.stati, r.provenienze.province], ['ok', CIPAT, true, true, W.maskUser('ws-user'), true, 'production', 'statweb.provincia.tn.it', 360, 249, 111]); assert(/Provenienze/.test(r.provenienze.fonte) && r.provenienze.acquisita);
  const all = [JSON.stringify(r)];
  for (const [env, exp] of [[{ ISTAT_CIPAT: '' }, { stato: 'configurazione_incompleta', cipatValido: false }], [{ ISTAT_CIPAT: 'abc' }, { stato: 'configurazione_incompleta', cipatValido: false }], [{ ISTAT_CIPAT: ' ' + CIPAT + ' ' }, { stato: 'ok', cipatValido: true }],
    [{ ISTAT_WS_USER: '' }, { stato: 'configurazione_incompleta', cipatValido: true }], [{ ISTAT_WS_PASSWORD: '' }, { stato: 'configurazione_incompleta', cipatValido: true }], [{ ISTAT_SEND_ENABLED: '', VERCEL_ENV: 'preview' }, { stato: 'ok', cipatValido: true }]]) {
    r = (await setup({ env }).call('is_status', {})).body; eq([r.stato, r.cipatValido], [exp.stato, exp.cipatValido], JSON.stringify(env)); all.push(JSON.stringify(r));
  }
  r = (await setup({ env: { ISTAT_WS_USER: '', ISTAT_WS_PASSWORD: '' } }).call('is_status', {})).body; eq(r.credenziali.missing, ['ISTAT_WS_USER', 'ISTAT_WS_PASSWORD']);
  r = (await setup({ env: { VERCEL_ENV: 'preview' } }).call('is_status', {})).body; eq([r.send.enabled, r.ambiente], [false, 'preview']); assert(/preview/.test(r.send.motivo));
  r = (await setup({ prov: IS.buildProvenienze(null) }).call('is_status', {})).body; eq([r.stato, r.provenienze.ok], ['configurazione_incompleta', false]);
  for (const s of ['ws-pass', 'ws-user']) assert(!all.join('\n').includes(s), 'segreto nella risposta: ' + s); eq(S.svc.requests.length, 0, 'lo stato non chiama il servizio (il PDF non prevede una chiamata di prova)');
});
test('J3  is_parse e is_validate: movimenti decodificati, CIPAT diverso bloccante con riga, campo e motivo, avvisi distinti dagli errori, nessun CSV da scaricare', async () => {
  const S = setup(), r = await S.call('is_parse', { text: fx('movimenti.csv') }); eq(r.status, 200);
  eq([r.body.riepilogo.inviabile, r.body.riepilogo.totale, r.body.riepilogo.persone, r.body.riepilogo.coppieRipetute, r.body.cipat, r.body.hash], [true, 20, 40, 3, CIPAT, IS.hashBody(IS.toServiceBody(rows20()))]);
  eq(r.body.rows[0].dec, { sigla: 'Perugia', tipo: 'provincia' }); eq(r.body.rows[0].notti, 3); assert(r.body.rows.every(x => !('_s' in x)), 'campi interni non esposti'); assert(!('csv' in r.body) && !('body' in r.body)); eq(r.body.periodo, { da: '2026-08-01', a: '2026-09-30' });
  const t = fx('movimenti.csv').split('\n'); t[4] = t[4].replace(CIPAT, '022001-AT-999999'); t[6] = t[6].split(';').map((x, i) => i === 3 ? 'pg' : x).join(';'); t[8] = t[8].replace(/;\d+$/, ';0'); t[9] = t[9].replace(/;[^;]*$/, '');
  const b = await S.call('is_parse', { text: t.join('\n') }); const R = b.body.rows; eq([b.body.riepilogo.inviabile, b.body.hash], [false, null]);
  eq([R[4].riga, codes(R[4], 'errore')], [5, ['CIPAT_DIVERSO:cipat']]); assert(/022001-AT-012345/.test(R[4].issues[0].msg), 'indica il CIPAT atteso'); eq(codes(R[6], 'errore'), ['SIGLA_NON_IN_TABELLA:sigla']); assert(/PG \(Perugia\)/.test(R[6].issues[0].fix) && R[6].sigla === 'pg', 'suggerimento senza conversione automatica'); eq(codes(R[8], 'errore'), ['PERSONE_INTERVALLO:persone']); assert(has(R[9], 'COLONNE') && R[9].approssimato);
  eq(b.body.riepilogo.conErrori, 4); assert(R[0].ok && R.filter(x => x.ok).length === 16, 'solo le righe con problemi sono segnate');
  const e = await S.call('is_parse', { text: '' }); eq([e.status, e.body.riepilogo.inviabile, e.body.globali.map(g => g.code)], [200, false, ['FILE_VUOTO']], 'un solo messaggio');
  let v = await S.call('is_validate', { rows: [IS.emptyRow(CIPAT)] }); eq(v.body.riepilogo.inviabile, false); assert(v.body.rows[0].errori >= 4);
  v = await S.call('is_validate', { rows: [row()] }); eq([v.body.riepilogo.inviabile, v.body.rows[0].notti, v.body.rows[0].dec.sigla], [true, 3, 'Perugia']);
  v = await S.call('is_validate', { rows: [{ ...row(), approssimato: true, riga: 7 }] }); eq(v.body.riepilogo.inviabile, false); assert(has(v.body.rows[0], 'RIGA_RICOSTRUITA')); eq(v.body.rows[0].riga, 7);
  v = await S.call('is_validate', { rows: [row({ arrivo: '20260601', partenza: '20260603' })] }); eq([codes(v.body.rows[0], 'avviso'), v.body.riepilogo.inviabile], [['ARRIVO_FUORI_PERIODO:arrivo'], true], 'fuori periodo: avviso che non blocca');
  S.clock.t = Date.parse('2026-06-10T10:00:00Z'); v = await S.call('is_validate', { rows: [row({ arrivo: '20260601', partenza: '20260603' })] }); eq(codes(v.body.rows[0]), [], 'con l\'orologio di giugno lo stesso arrivo è nel periodo');
  const D = setup({ env: { ISTAT_CIPAT: '' } }); v = await D.call('is_validate', { rows: [row()] }); eq([v.body.globali.map(g => g.code), v.body.riepilogo.inviabile], [['CIPAT_NON_CONFIGURATO'], false]);
  eq(S.svc.requests.length, 0);
});
test('J4  is_check: validazione finale e riepilogo; con errori 422 e nessuna conferma; senza errori conferma firmata monouso legata all\'impronta dei dati', async () => {
  const S = setup(); const bad = rows20(); bad[3].cipat = '022001-AT-999999'; let r = await S.call('is_check', { rows: bad });
  eq([r.status, r.body.stato, 'proof' in r.body, r.body.hash, r.body.riepilogo.inviabile], [422, 'dati_non_validi', false, null, false]); assert(has(r.body.rows[3], 'CIPAT_DIVERSO:cipat'));
  r = await S.call('is_check', { rows: rows20() }); const b = r.body;
  eq([r.status, b.stato, b.hash, b.cipat, b.riepilogo, b.avvisi, b.proofTtlMs], [200, 'pronto', IS.hashBody(IS.toServiceBody(rows20())), CIPAT, { movimenti: 20, persone: 40, primoArrivo: '20260808', ultimoArrivo: '20260925', avvisi: 0 }, [], 20 * 60e3]);
  assert(typeof b.proof === 'string' && b.proof.split('.').length === 2); eq([b.send.enabled, b.credenziali.presenti], [true, true]); noSend(S); eq(S.svc.requests.length, 0, 'il riepilogo non chiama il servizio');
  const old = rows20(); old[0].arrivo = '20250101'; old[0].partenza = '20250103'; r = await S.call('is_check', { rows: old }); eq([r.body.stato, r.body.riepilogo.avvisi, r.body.avvisi.map(a => a.riga + ':' + a.campo + ':' + a.code)], ['pronto', 1, ['1:arrivo:ARRIVO_FUORI_PERIODO']], 'gli avvisi si vedono nel riepilogo');
  const p1 = (await S.call('is_check', { rows: rows20() })).body.proof, p2 = (await S.call('is_check', { rows: rows20() })).body.proof; assert(p1 !== p2, 'conferme diverse');
  S.kv.fail = true; r = await S.call('is_check', { rows: rows20() }); eq([r.status, r.body.stato], [200, 'pronto'], 'il riepilogo non dipende dall\'archivio'); S.kv.fail = false;
});
test('J5  invio riuscito: richiesta esattamente come nel PDF, esito del servizio mostrato, movimenti segnati come acquisiti, secondo invio degli stessi dati bloccato', async () => {
  const S = setup(), p = await check(S); let r = await S.call('is_send', sendBody(p)); const b = r.body;
  eq([r.status, b.stato, b.caricati, b.totale, b.inviati, b.info, b.statusServizio], [200, 'inviato', 20, 20, 20, '20/20 movimenti caricati', true]); assert(/tutti i 20 movimenti/.test(b.istruzioni[0]));
  eq(S.svc.count('upload'), 1); const q = S.svc.requests[0]; eq([q.method, q.url, q.headers.username, q.headers.password, q.headers['content-type']], ['POST', W.DEFAULT_URL, 'ws-user', 'ws-pass', 'application/json']);
  eq(JSON.parse(q.raw), IS.toServiceBody(p.rows), 'trasmessi esattamente i movimenti confermati, nello stesso ordine'); eq(sha(JSON.stringify(JSON.parse(q.raw))), p.hash); eq(S.svc.protocolErrors, []); eq(S.svc.archive.length, 20);
  eq([keys(S, 'istat:inv:').length, keys(S, 'istat:prova:').length, keys(S, 'istat:invio:').length], [20, 1, 0], 'impronte (una per movimento), conferma consumata, blocco rilasciato');
  assert([...S.kv.d.entries()].filter(([k]) => k.startsWith('istat:inv:')).every(([, e]) => e.v === '1' && e.exp - S.clock.t === 70 * 86400e3), 'conteggio 1 e scadenza a 70 giorni');
  const blob = JSON.stringify([...S.kv.d.entries()]); for (const s of ['ws-pass', 'ws-user', 'PG;3']) assert(!blob.includes(s), 'in archivio: ' + s);
  const v = await S.call('is_validate', { rows: rows20() }); eq([v.body.riepilogo.inviabile, v.body.rows.every(x => has(x, 'GIA_INVIATO'))], [false, true], 'rifacendo lo stesso elenco tutti i movimenti risultano già acquisiti');
  assert(/già acquisito dal servizio/.test(v.body.rows[0].issues.find(i => i.code === 'GIA_INVIATO').msg));
  const c2 = await S.call('is_check', { rows: rows20() }); eq([c2.status, c2.body.stato], [422, 'dati_non_validi']); const again = await S.call('is_send', sendBody(p)); eq([again.status, again.body.stato], [422, 'dati_non_validi'], 'stessa conferma, stessi dati'); eq(S.svc.count('upload'), 1);
  const newOne = rows20().slice(0, 1); newOne[0].persone = '9'; eq((await S.call('is_validate', { rows: newOne })).body.riepilogo.inviabile, true, 'un movimento diverso non è toccato');
  S.clock.t += 71 * 86400e3; const late = await S.call('is_validate', { rows: rows20() }); assert(!late.body.rows.some(x => has(x, 'GIA_INVIATO')), 'dopo 70 giorni le impronte scadono');
});
test('J6  porte di sicurezza dell\'invio: conferma mancante/scaduta/manomessa/di un\'altra installazione, dati cambiati o non validi, invio disattivato, credenziali mancanti → nessuna trasmissione', async () => {
  const S = setup(), p = await check(S); let r;
  const [pl, sg] = p.proof.split('.'), flip = s => s.slice(0, -1) + (s.slice(-1) === 'A' ? 'B' : 'A');
  for (const bad of [undefined, '', 'a.b', 'abc', null, 123, {}, [], pl + '.' + flip(sg), flip(pl) + '.' + sg, sg + '.' + pl, p.proof + 'x', p.proof.toUpperCase()]) eq((await S.call('is_send', sendBody(p, { proof: bad }))).status, 403, JSON.stringify(bad));
  eq((await S.call('is_send', { rows: p.rows })).body.stato, 'prova_non_valida'); noSend(S);
  const mod = p.rows.map(x => ({ ...x })); mod[2].persone = '5'; r = await S.call('is_send', sendBody(p, { rows: mod })); eq([r.status, r.body.stato], [409, 'dati_cambiati'], 'un campo modificato dopo la conferma');
  const sw = p.rows.slice(); [sw[0], sw[1]] = [sw[1], sw[0]]; r = await S.call('is_send', sendBody(p, { rows: sw })); eq([r.status, r.body.stato], [409, 'dati_cambiati'], 'ordine diverso'); r = await S.call('is_send', sendBody(p, { rows: p.rows.slice(0, 19) })); eq([r.status, r.body.stato], [409, 'dati_cambiati'], 'un movimento in meno');
  mod[2].persone = '0'; r = await S.call('is_send', sendBody(p, { rows: mod })); eq([r.status, r.body.stato], [422, 'dati_non_validi']); noSend(S); eq(keys(S, 'istat:prova:').length, 0, 'nessun tentativo respinto ha consumato la conferma');
  const B = setup({ clock: S.clock, kv: S.kv, svc: S.svc, env: { SESSION_SECRET: 'altra-installazione' } }); eq((await B.call('is_send', sendBody(p))).status, 403, 'firmata con un altro segreto'); noSend(S);
  S.clock.t += 21 * 60e3; r = await S.call('is_send', sendBody(p)); eq([r.status, r.body.stato], [403, 'prova_non_valida'], 'scaduta dopo 20 minuti'); noSend(S);
  S.clock.t -= 21 * 60e3; for (const env of [{ ISTAT_SEND_ENABLED: '' }, { ISTAT_SEND_ENABLED: 'TRUE' }, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' }, { VERCEL_ENV: '' }]) {
    const D = setup({ clock: S.clock, kv: S.kv, svc: S.svc, env }); r = await D.call('is_send', sendBody(p)); eq([r.status, r.body.stato, r.body.send.enabled], [403, 'send_disattivato', false], JSON.stringify(env)); assert(/ISTAT_SEND_ENABLED|Production|VERCEL_ENV/.test(r.body.err)); noSend(S); eq(keys(S, 'istat:prova:').length, 0, 'la conferma non si consuma');
  }
  for (const env of [{ ISTAT_WS_USER: '' }, { ISTAT_WS_PASSWORD: '' }]) { const D = setup({ clock: S.clock, kv: S.kv, svc: S.svc, env }); r = await D.call('is_send', sendBody(p)); eq([r.status, r.body.stato], [409, 'variabili_mancanti']); eq(r.body.missing.length, 1); noSend(S); }
  const nocip = setup({ clock: S.clock, kv: S.kv, svc: S.svc, env: { ISTAT_CIPAT: '' } }); r = await nocip.call('is_send', sendBody(p)); eq([r.status, r.body.stato], [422, 'dati_non_validi'], 'senza CIPAT configurato non si invia'); noSend(S);
  r = await S.call('is_send', sendBody(p)); eq([r.status, r.body.stato], [200, 'inviato'], 'la conferma valida funziona ancora: i tentativi respinti non l\'avevano consumata');
});
test('J7  archivio giù: nessun invio (503) ma controlli e riepilogo funzionano; doppio clic e due schede = una sola trasmissione', async () => {
  let S = setup(), p = await check(S); S.kv.failOn = /^istat:prova:/; let r = await S.call('is_send', sendBody(p)); eq([r.status, r.body.stato], [503, 'archivio_non_disponibile']); noSend(S);
  S.kv.failOn = /^istat:inv:/; r = await S.call('is_send', sendBody(p)); eq([r.status, r.body.stato], [503, 'archivio_non_disponibile'], 'se non si possono controllare i movimenti già acquisiti non si invia'); noSend(S);
  S.kv.failOn = null; S.kv.fail = true; r = await S.call('is_send', sendBody(p)); eq(r.status, 503); noSend(S); S.kv.fail = false; eq((await S.call('is_send', sendBody(p))).body.stato, 'inviato', 'KV tornata: la conferma non era stata consumata');
  S = setup({ svcOpts: { delay: 15 } }); p = await check(S); let out = await Promise.all([S.call('is_send', sendBody(p)), S.call('is_send', sendBody(p))]);
  eq(out.map(o => o.status).sort(), [200, 409]); eq(out.find(o => o.status === 409).body.stato, 'prova_gia_usata'); eq(S.svc.count('upload'), 1); eq(S.svc.archive.length, 20);
  S = setup({ svcOpts: { delay: 15 } }); const p1 = await check(S), p2 = await check(S); assert(p1.proof !== p2.proof);
  out = await Promise.all([S.call('is_send', sendBody(p1)), S.call('is_send', sendBody(p2))]); eq(out.map(o => o.status).sort(), [200, 409]); eq(out.find(o => o.status === 409).body.stato, 'invio_in_corso'); eq([S.svc.count('upload'), S.svc.archive.length], [1, 20]); eq(keys(S, 'istat:invio:').length, 0, 'il blocco si rilascia a fine invio');
});
test('J8  esiti del servizio: parziale e respinto con il testo reale, esito incerto (mai riprovato), rifiuti sicuri; nessun "inviato" senza conferma effettiva', async () => {
  let S = setup({ svcOpts: { rowCheck: (x, i) => i === 3 ? 'provenienza incorretta ' + x.CIPAT + '(' + x.siglaProvenienza + ')' : null } }), p = await check(S), r = await S.call('is_send', sendBody(p));
  eq([r.status, r.body.stato, r.body.caricati, r.body.totale, r.body.inviati], [200, 'parziale', 19, 20, 20]); assert(/provenienza incorretta 022001-AT-012345\(/.test(r.body.info) && /provenienza incorretta/.test(r.body.dettaglio), r.body.info);
  assert(/PARZIALE/.test(r.body.istruzioni[0]) && r.body.istruzioni.some(i => /NON rinviare l'intero elenco/.test(i))); eq(keys(S, 'istat:inv:').length, 0, 'nessun movimento segnato: non si sa quali siano stati acquisiti'); eq(S.svc.count('upload'), 1);
  S = setup({ svcOpts: { rowCheck: () => 'respinto di prova' } }); p = await check(S); r = await S.call('is_send', sendBody(p)); eq([r.body.stato, r.body.caricati, r.body.statusServizio, keys(S, 'istat:inv:').length], ['rifiutato', 0, false, 0]); assert(/respinto di prova/.test(r.body.info) && /Nessun|nessun/.test(r.body.istruzioni[0]));
  for (const modo of ['abort', 'rete', 'http500', 'redirect', 'html', 'json-rotto', 'status-vuoto', 'solo-testo', 'incoerente']) {
    S = setup({ svcOpts: { modo: { upload: modo } } }); p = await check(S); r = await S.call('is_send', sendBody(p));
    eq([r.status, r.body.stato], [200, 'esito_incerto'], modo); assert(r.body.istruzioni.some(i => /NON inviare di nuovo/.test(i)), modo); eq([S.svc.count('upload'), keys(S, 'istat:inv:').length, keys(S, 'istat:invio:').length], [1, 0, 0], modo);
    const again = await S.call('is_send', sendBody(p)); eq([again.status, again.body.stato], [409, 'prova_gia_usata'], modo); eq(S.svc.count('upload'), 1, modo + ': nessun ritentativo');
  }
  S = setup({ svcOpts: { modo: { upload: 'incoerente' } } }); p = await check(S); r = await S.call('is_send', sendBody(p)); eq(r.body.incoerente, true); assert(/non è coerente/.test(r.body.istruzioni[0]));
  S = setup({ svcOpts: { modo: { upload: 'http401' } } }); p = await check(S); r = await S.call('is_send', sendBody(p)); eq([r.status, r.body.stato, r.body.inviato, r.body.titolo], [502, 'credenziali_non_valide', false, 'Credenziali non accettate']); assert(/Non è stato trasmesso nulla/.test(r.body.nota));
  S = setup({ env: { ISTAT_WS_PASSWORD: 'sbagliata' } }); p = await check(S); r = await S.call('is_send', sendBody(p)); eq([r.status, r.body.stato], [502, 'credenziali_non_valide']); assert(!JSON.stringify(r.body).includes('sbagliata'), 'nessuna eco della password');
  S = setup({ svcOpts: { modo: { upload: 'http404' } } }); p = await check(S); r = await S.call('is_send', sendBody(p)); eq([r.status, r.body.stato], [502, 'richiesta_rifiutata']);
  // risposta persa DOPO che il servizio ha elaborato: l'applicazione non può saperlo e lo dice; l'elenco sul portale lo mostra
  S = setup({ svcOpts: { modo: { upload: 'dopo-abort' } } }); p = await check(S); r = await S.call('is_send', sendBody(p)); eq([r.body.stato, S.svc.archive.length], ['esito_incerto', 20], 'il servizio le aveva già acquisite');
  const l = await S.call('is_list', {}); eq([l.status, l.body.stato, l.body.elementi, l.body.json], [200, 'ok', 20, true], 'la verifica sul portale mostra che i movimenti ci sono');
});
test('J9  is_list (elenco sul portale): sola lettura, risposta mostrata com\'è, credenziali mancanti e guasti spiegati', async () => {
  let S = setup(), r = await S.call('is_list', {}); eq([r.status, r.body.stato, r.body.http, r.body.elementi, r.body.testo], [200, 'ok', 200, 0, '[]']);
  const q = S.svc.requests[0]; eq([q.method, q.url, q.headers.username, q.headers.password, q.raw], ['POST', W.DEFAULT_URL + '&list', 'ws-user', 'ws-pass', undefined]); eq(S.svc.protocolErrors, []);
  const p = await check(S); await S.call('is_send', sendBody(p)); r = await S.call('is_list', {}); eq([r.body.elementi, JSON.parse(r.body.testo)[0].CIPAT], [20, CIPAT]); assert(!JSON.stringify(r.body).includes('ws-pass'));
  S = setup({ env: { ISTAT_WS_USER: '' } }); r = await S.call('is_list', {}); eq([r.status, r.body.stato, r.body.missing], [409, 'variabili_mancanti', ['ISTAT_WS_USER']]); eq(S.svc.requests.length, 0);
  for (const [modo, st, stato] of [['http500', 502, 'errore_servizio'], ['abort', 502, 'servizio_non_raggiungibile'], ['http401', 502, 'credenziali_non_valide']]) { S = setup({ svcOpts: { modo: { list: modo } } }); r = await S.call('is_list', {}); eq([r.status, r.body.stato], [st, stato], modo); }
  S = setup({ env: { ISTAT_SEND_ENABLED: '', VERCEL_ENV: 'preview' } }); r = await S.call('is_list', {}); eq([r.status, r.body.stato], [200, 'ok'], 'in sola lettura funziona anche dove l\'invio è spento');
});
test('J10 ricerca nella tabella delle provenienze e tabella mancante: la tabella ufficiale non viene mai indovinata', async () => {
  const S = setup(), L = async b => (await S.call('is_lookup', b)).body;
  eq((await L({ q: 'perug' })).risultati, [{ codice: 'PG', nome: 'Perugia', tipo: 'provincia' }]); eq((await L({ q: 'spag' })).risultati[0].codice, 'ESP'); eq((await L({ q: 'FR' })).risultati[0].codice, 'FR'); eq((await L({ q: 'x' })).risultati, []);
  eq((await S.call('is_lookup', { q: '<script>'.repeat(20) })).status, 200); eq((await S.call('is_lookup', { q: { x: 1 } })).status, 200); eq((await setup({ prov: IS.buildProvenienze(null) }).call('is_lookup', { q: 'perug' })).body, { ok: false, risultati: [] });
  const M = setup({ prov: IS.buildProvenienze({ stati: 'rotto' }) }); const v = await M.call('is_validate', { rows: [row()] }); assert(v.body.globali.some(g => g.code === 'TABELLA' && g.sev === 'errore')); eq(v.body.riepilogo.inviabile, false);
  const c = await M.call('is_check', { rows: [row()] }); eq([c.status, c.body.stato], [422, 'dati_non_validi']);
});
test('J11 più prenotazioni uguali: si contano, il nuovo movimento identico a uno già inviato passa solo oltre quelli già acquisiti', async () => {
  const S = setup(), two = [row(), row()], p = await check(S, two); let r = await S.call('is_send', sendBody(p)); eq([r.body.stato, r.body.caricati, keys(S, 'istat:inv:').length], ['inviato', 2, 1]); eq([...S.kv.d.entries()].find(([k]) => k.startsWith('istat:inv:'))[1].v, '2', 'contatore 2');
  r = await S.call('is_validate', { rows: [row(), row(), row()] }); eq(r.body.rows.map(x => has(x, 'GIA_INVIATO')), [true, true, false], 'la terza uguale è un nuovo movimento'); eq(r.body.riepilogo.inviabile, false);
  r = await S.call('is_validate', { rows: [row()] }); eq(r.body.rows.map(x => has(x, 'GIA_INVIATO')), [true]); r = await S.call('is_validate', { rows: [row({ persone: '5' }), row()] }); eq(r.body.rows.map(x => has(x, 'GIA_INVIATO')), [false, true]);
  const only = [row()]; const p2 = await S.call('is_check', { rows: only }); eq(p2.status, 422);
});
test('J12 nessun segreto né dato nei log, neppure negli errori interni; il servizio non riceve mai nulla di diverso dal necessario', async () => {
  const logs = [], orig = {}; for (const k of ['log', 'info', 'warn', 'error', 'debug']) { orig[k] = console[k]; console[k] = (...a) => logs.push(a.map(String).join(' ')); }
  let S; try {
    S = setup(); const p = await check(S); await S.call('is_send', sendBody(p)); await S.call('is_parse', { text: fx('movimenti.csv') }); await S.call('is_list', {}); await S.call('is_status', {});
    const B = setup({ svcOpts: { modo: { upload: 'http401' } } }); const pb = await check(B); await B.call('is_send', sendBody(pb));
    const X = setup({ envObj: new Proxy({}, { get() { throw new Error('boom'); } }) }), r = await X.call('is_status', {}); eq([r.status, r.body.err], [500, 'Errore interno: nessun dato è stato conservato']);
  } finally { for (const k of Object.keys(orig)) console[k] = orig[k]; }
  const all = logs.join('\n'); for (const s of ['ws-pass', 'ws-user', CIPAT, 'PG', '20260808']) assert(!all.includes(s), 'nei log: ' + s); assert(/istat: is_status boom/.test(all), all.slice(0, 200)); eq(logs.length, 1, 'l\'unica riga di log è l\'errore interno');
  const q = S.svc.requests[0]; eq(Object.keys(q.headers).sort(), ['accept', 'content-type', 'password', 'username'], 'solo le intestazioni previste');
});

/* ===================== esecuzione ===================== */
(async () => {
  const only = process.argv[2]; let pass = 0, fail = 0; const t0 = process.hrtime.bigint();
  for (const t of tests) {
    if (only && !t.n.startsWith(only)) continue;
    try { await t.f(); console.log('  \u2714 ' + t.n); pass++; } catch (e) { console.log('  \u2718 ' + t.n + '\n      \u2192 ' + String(e.stack || e.message).split('\n').slice(0, only ? 30 : 4).join('\n        ')); fail++; }
  }
  console.log('\n' + pass + ' ok, ' + fail + ' falliti  (' + (Number(process.hrtime.bigint() - t0) / 1e9).toFixed(1) + ' s)'); process.exit(fail ? 1 : 0);
})();
