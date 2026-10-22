'use strict';
// La Columbera · prove di Gestione → Adempimenti → Alloggiati Web (Fase 1): tracciato e controlli (L), client del servizio (W), endpoint admin (E).
// Nessuna rete: servizio SOAP finto (soap-mock.js), archivio KV finto, orologio simulato. Tutti i dati sono di fantasia.
//   node tests/sim/adempimenti.js [filtro]
const assert = require('assert'), fs = require('fs'), path = require('path');
const AL = require('../../api/_alloggiati.js'), WS = require('../../api/_alloggiati_ws.js'), ADP = require('../../api/adempimenti.js');
const { makeSoapMock, TABELLE } = require('./soap-mock.js');
const eq = (a, b, m) => assert.deepStrictEqual(a, b, m);
const fx = n => fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'alloggiati', n), 'utf8');
const NOW = Date.parse('2026-10-14T08:00:00Z');
const tabs = () => ({ luoghi: WS.buildTable('Luoghi', TABELLE.Luoghi), documenti: WS.buildTable('Tipi_Documento', TABELLE.Tipi_Documento), tipi: WS.buildTable('Tipi_Alloggiato', TABELLE.Tipi_Alloggiato) });
const val = (records, o) => AL.validateRecords(records, Object.assign({ now: NOW, tables: tabs() }, o || {}));
const parse1 = name => AL.parseText(fx(name)).records;
const mk = over => Object.assign({}, parse1('ospite-singolo.txt')[0], over || {});         // ospite singolo valido (Bianchi Carlo)
const codes = (r, sev) => r.issues.filter(i => !sev || i.sev === sev).map(i => i.code + (i.campo ? ':' + i.campo : ''));
const has = (r, c, sev) => codes(r, sev || 'errore').includes(c);
const tests = [], test = (n, f) => tests.push({ n, f });

/* ===================== L · tracciato e controlli formali ===================== */
test('L1  le tre fixture: lette e ricostruite senza modifiche, 168 caratteri, nessun errore', () => {
  for (const [f, n] of [['ospite-singolo.txt', 1], ['famiglia.txt', 4], ['gruppo.txt', 3]]) {
    const text = fx(f), p = AL.parseText(text);
    eq(p.records.length, n, f); eq(p.issues, [], f);
    assert(p.records.every(r => r._s.length === 0), f + ': nessun problema di struttura');
    const v = val(p.records);
    eq([v.riepilogo.errori, v.riepilogo.inviabile], [0, true], f + ' ' + JSON.stringify(v.records.map(r => codes(r))));
    eq(v.lines, text.split('\n'), f + ': la riga ricostruita è identica a quella del file');
    assert(v.lines.every(l => Array.from(l).length === 168), f + ': 168 caratteri');
    assert(/^[0-9a-f]{64}$/.test(v.hash));
  }
});
test('L2  riga di lunghezza sbagliata (167 o 169): errore di struttura, riga "approssimata", nessun invio possibile', () => {
  const line = fx('ospite-singolo.txt');
  for (const bad of [line.slice(0, 167), line + ' ', '']) {
    const p = AL.parseText(bad + (bad === '' ? '\n\n' : ''));
    const r = p.records[0];
    if (bad === '') { eq(p.records.length, 2, 'due righe vuote'); }
    eq(r._s.map(i => i.code), ['LUNGHEZZA'], JSON.stringify(bad.length)); assert(r.approssimato === true);
    const v = val(p.records); eq([v.riepilogo.inviabile, v.lines, v.hash], [false, null, null]);
  }
});
test('L3  LF, CRLF, assenza del terminatore finale e BOM si leggono allo stesso modo; CR isolato, TAB e riga vuota sono errori', () => {
  const lf = fx('famiglia.txt'), base = AL.parseText(lf).records.map(r => AL.recordToLine(r).line);
  const same = t => AL.parseText(t).records.map(r => AL.recordToLine(r).line);
  eq(same(lf.replace(/\n/g, '\r\n')), base); eq(same(lf + '\n'), base); eq(same(lf + '\r\n'), base);
  const bom = AL.parseText('\uFEFF' + lf); eq(bom.issues.map(i => i.code), ['BOM']); eq(bom.records.length, 4);
  const t = lf.split('\n'); t[1] = t[1].slice(0, 20) + '\t' + t[1].slice(21);
  const pt = AL.parseText(t.join('\n')); assert(pt.records[1]._s.some(i => i.code === 'CARATTERE'), 'TAB'); eq(val(pt.records).riepilogo.inviabile, false);
  const cr = AL.parseText(lf.split('\n')[0] + '\r' + 'x' + '\n' + lf.split('\n')[1]); assert(cr.records[0]._s.some(i => i.code === 'CARATTERE'), 'CR isolato');
  const mid = lf.split('\n'); mid.splice(2, 0, ''); const pm = AL.parseText(mid.join('\n')); assert(pm.records[2]._s.some(i => i.code === 'LUNGHEZZA'), 'riga vuota');
  assert(AL.parseText('\uFFFD' + lf.slice(1)).records[0]._s.find(i => i.code === 'CARATTERE').fix.includes('ASCII/UTF-8'), 'carattere di sostituzione');
  eq(AL.parseText('').issues.map(i => i.code), ['FILE_VUOTO']); eq(AL.parseText(null).issues.map(i => i.code), ['FILE']);
});
test('L4  date e permanenza: formati, calendario reale, passato (solo avviso), futuro, limiti, giorni a una cifra', () => {
  for (const [over, exp] of [[{ arrivo: '31/02/2026' }, 'FORMATO:arrivo'], [{ arrivo: '' }, 'OBBLIGATORIO:arrivo'], [{ arrivo: '14-10-2026' }, 'FORMATO:arrivo'], [{ arrivo: '14/10/1899' }, 'VALORE:arrivo'],
    [{ nascita: '01/01/2030' }, 'VALORE:nascita'], [{ nascita: '31/04/1990' }, 'FORMATO:nascita'], [{ nascita: '01/01/1899' }, 'VALORE:nascita'], [{ nascita: '' }, 'OBBLIGATORIO:nascita'],
    [{ giorni: '31' }, 'VALORE:giorni'], [{ giorni: '' }, 'OBBLIGATORIO:giorni'], [{ giorni: 'ab' }, 'FORMATO:giorni'], [{ giorni: '100' }, 'FORMATO:giorni']]) {
    const v = val([mk(over)]); assert(has(v.records[0], exp), JSON.stringify(over) + ' → ' + codes(v.records[0])); eq(v.riepilogo.inviabile, false, JSON.stringify(over));
  }
  const fut = val([mk({ arrivo: '20/10/2026', nascita: '17/10/2026' })]); assert(has(fut.records[0], 'VALORE:nascita') && /nel futuro/.test(fut.records[0].issues.find(i => i.campo === 'nascita').msg), 'nascita nel futuro anche se precedente all\'arrivo');
  const later = val([mk({ arrivo: '14/10/2026', nascita: '20/10/2026' })], { now: Date.parse('2026-10-25T08:00:00Z') });
  assert(has(later.records[0], 'VALORE:nascita') && /successiva all'arrivo/.test(later.records[0].issues.find(i => i.campo === 'nascita').msg), 'nascita dopo l\'arrivo');
  let v = val([mk({ arrivo: '10/10/2026' })]); eq(codes(v.records[0], 'avviso'), ['ARRIVO_OLTRE_24H:arrivo']); eq(v.riepilogo.inviabile, true, 'arrivo passato: avviso, non blocca');
  v = val([mk({ giorni: '00' })]); eq(codes(v.records[0], 'avviso'), ['GIORNI_ZERO:giorni']); eq(v.riepilogo.inviabile, true);
  v = val([mk({ giorni: '5' })]); eq(v.lines[0].slice(12, 14), '05', 'una cifra: zero iniziale'); eq(v.riepilogo.inviabile, true);
  eq(val([mk({})]).records[0].partenza, '20/10/2026', 'partenza = arrivo + giorni'); eq(val([mk({ arrivo: '28/12/2026', giorni: '05' })]).records[0].partenza, '02/01/2027');
});
test('L5  sesso, nome e cognome: obbligatori, solo lettere e apostrofo ASCII, lunghezze; lettere non ASCII = avviso con proposta (mai applicata)', () => {
  for (const [over, exp] of [[{ sesso: '3' }, 'VALORE:sesso'], [{ sesso: '' }, 'OBBLIGATORIO:sesso'], [{ cognome: '' }, 'OBBLIGATORIO:cognome'], [{ nome: '' }, 'OBBLIGATORIO:nome'], [{ nome: 'Carl0' }, 'CARATTERE:nome'],
    [{ cognome: 'Ros\tsi' }, 'CARATTERE:cognome'], [{ cognome: 'D\u2019Angelo' }, 'CARATTERE:cognome'], [{ nome: 'A'.repeat(31) }, 'LUNGHEZZA_CAMPO:nome'], [{ cognome: 'A'.repeat(51) }, 'LUNGHEZZA_CAMPO:cognome'], [{ tipo: '21' }, 'VALORE:tipo'], [{ tipo: '' }, 'VALORE:tipo']]) {
    const v = val([mk(over)]); assert(has(v.records[0], exp), JSON.stringify(over) + ' → ' + codes(v.records[0]));
  }
  assert(/apostrofo/.test(val([mk({ cognome: 'D\u2019Angelo' })]).records[0].issues.find(i => i.code === 'CARATTERE').fix), 'suggerimento sull\'apostrofo tipografico');
  eq(val([mk({ cognome: "D'Angelo", nome: "Tom O'Neil" })]).riepilogo.inviabile, true, 'apostrofo ASCII e spazi sono ammessi');
  const v = val([mk({ nome: '\u017dan' })]); eq(codes(v.records[0], 'avviso'), ['NON_ASCII:nome']); assert(v.records[0].issues[0].fix.includes('Zan'), 'proposta di traslitterazione'); eq(v.records[0].nome, '\u017dan', 'il dato non viene cambiato da solo');
});
test('L6  stato, cittadinanza, comune e provincia: tabella Luoghi, nato in Italia (comune+provincia) o all\'estero (vuoti)', () => {
  const it = over => mk(Object.assign({ stato: '100000100', cittad: '100000100', comune: '400000001', prov: 'TN' }, over));
  eq(val([it({})]).riepilogo.inviabile, true, 'nato in Italia, tutto in regola');
  for (const [over, exp] of [[{ prov: '' }, 'OBBLIGATORIO:prov'], [{ prov: 'tn' }, 'FORMATO:prov'], [{ prov: 'TNN' }, 'FORMATO:prov'], [{ comune: '' }, 'OBBLIGATORIO:comune'], [{ comune: '400000099' }, 'CODICE_NON_IN_TABELLA:comune'],
    [{ comune: '100000248' }, 'CODICE_TIPO:comune'], [{ comune: '12345' }, 'FORMATO:comune'], [{ stato: '100000999' }, 'CODICE_NON_IN_TABELLA:stato'], [{ stato: '' }, 'OBBLIGATORIO:stato'], [{ stato: '400000001' }, 'CODICE_TIPO:stato'],
    [{ cittad: '400000001' }, 'CODICE_TIPO:cittad'], [{ cittad: '' }, 'OBBLIGATORIO:cittad'], [{ stato: '100000248', comune: '400000001', prov: '' }, 'ESTERO_COMUNE:comune'], [{ stato: '100000248', comune: '', prov: 'TN' }, 'ESTERO_PROVINCIA:prov'],
    [{ luogo: '12AB' }, 'FORMATO:luogo']]) {
    const v = val([it(over)]); assert(has(v.records[0], exp), JSON.stringify(over) + ' → ' + codes(v.records[0]));
  }
  const d = val([it({ prov: 'RM' })]); eq(codes(d.records[0], 'avviso'), ['PROVINCIA_DISCORDANTE:prov']); eq(d.riepilogo.inviabile, true, 'provincia discordante: avviso');
  const s = val([it({})]).records[0].dec; eq([s.stato, s.cittad, s.comune, s.tipodoc, s.tipo], ['ITALIA', 'ITALIA', 'COMUNE DI PROVA', 'CARTA DI IDENTITA', 'OSPITE SINGOLO'], 'nomi decodificati dalle tabelle');
  // senza tabelle: nessun controllo sui codici ma avviso esplicito, e ancora inviabile (il verdetto spetta al Test del servizio)
  const nt = val([mk({})], { tables: null }); assert(nt.globali.some(g => g.code === 'TABELLE' && g.sev === 'avviso')); eq([nt.riepilogo.inviabile, nt.records[0].dec.stato], [true, null]);
});
test('L7  documento: obbligatorio per 16/17/18, vuoto per 19/20; codice in tabella; numero ammesso solo lettere, cifre . - /', () => {
  const doc = { tipodoc: 'IDENT', numdoc: 'AB1', luogo: '100000248' };
  for (const k of ['tipodoc', 'numdoc', 'luogo']) assert(has(val([mk({ tipo: '19', ...doc })]).records[0], 'DOC_NON_AMMESSO:' + k), 'familiare con ' + k);
  assert(has(val([mk({ tipo: '20', ...doc })]).records[0], 'DOC_NON_AMMESSO:numdoc'));
  for (const k of ['tipodoc', 'numdoc', 'luogo']) assert(has(val([mk({ tipodoc: '', numdoc: '', luogo: '' })]).records[0], 'OBBLIGATORIO:' + k), 'ospite singolo senza ' + k);
  for (const [over, exp] of [[{ tipodoc: 'XXXXX' }, 'CODICE_NON_IN_TABELLA:tipodoc'], [{ tipodoc: 'TROPPOLUNGO' }, 'FORMATO:tipodoc'], [{ numdoc: 'AB#123' }, 'CARATTERE:numdoc'], [{ numdoc: 'A'.repeat(21) }, 'LUNGHEZZA_CAMPO:numdoc'], [{ luogo: '100000999' }, 'CODICE_NON_IN_TABELLA:luogo']]) {
    const v = val([mk(over)]); assert(has(v.records[0], exp), JSON.stringify(over) + ' → ' + codes(v.records[0]));
  }
  eq(val([mk({ numdoc: 'AB-12/3.4' })]).riepilogo.inviabile, true); eq(val([mk({ luogo: '400000001' })]).riepilogo.inviabile, true, 'luogo di rilascio: anche un comune');
  eq(val(parse1('famiglia.txt')).riepilogo.inviabile, true, 'i familiari della fixture hanno il documento vuoto');
});
test('L8  nuclei: i componenti seguono il capo; un errore blocca tutto il nucleo (ma non gli altri); capo mancante, tipo discorde, arrivo diverso', () => {
  const fam = parse1('famiglia.txt').map(r => ({ ...r })), single = mk({ arrivo: fam[0].arrivo });
  fam[2].sesso = '9'; let v = val([...fam, single]);
  eq(v.records.map(r => r.nucleoBloccato), [true, true, true, true, false], 'tutta la famiglia è bloccata, il singolo no');
  eq([v.nuclei.map(n => n.ok), v.nuclei.map(n => n.tipo), v.riepilogo.inviabile], [[false, true], ['famiglia', 'singolo'], false]);
  eq(v.records.map(r => r.errori), [0, 0, 1, 0, 0], 'l\'errore è solo sulla schedina sbagliata');
  assert(has(val([mk({ tipo: '19', tipodoc: '', numdoc: '', luogo: '' })]).records[0], 'NUCLEO_SENZA_CAPO:tipo'), 'familiare senza capo');
  const g = parse1('gruppo.txt').map(r => ({ ...r })); g[1].tipo = '19'; assert(has(val(g).records[1], 'NUCLEO_TIPO_DISCORDE:tipo'), 'familiare dopo un capo gruppo');
  const f2 = parse1('famiglia.txt').map(r => ({ ...r })); f2[1].arrivo = '17/10/2026'; assert(has(val(f2).records[1], 'NUCLEO_DATA_ARRIVO:arrivo'), 'arrivo diverso da quello del capo');
  v = val([mk({ tipo: '17' })]); eq(codes(v.records[0], 'avviso'), ['CAPO_SENZA_MEMBRI:tipo']); eq(v.riepilogo.inviabile, true, 'capo senza componenti: solo avviso');
  const f3 = parse1('famiglia.txt'); v = val([f3[0], f3[1], mk({ arrivo: f3[0].arrivo }), f3[2]]); assert(has(v.records[3], 'NUCLEO_SENZA_CAPO:tipo'), 'un nuovo 16 chiude la famiglia precedente');
  eq(val(parse1('gruppo.txt')).nuclei.map(n => [n.tipo, n.membri.length]), [['gruppo', 2]]);
});
test('L9  possibile inversione cognome/nome: avviso sul familiare solo se il nome coincide con il cognome del capo', () => {
  const capo = mk({ tipo: '17', cognome: 'Fontana', nome: 'Giulia' }), memb = (c, n) => mk({ tipo: '19', cognome: c, nome: n, tipodoc: '', numdoc: '', luogo: '' });
  eq(codes(val([capo, memb('Elisa', 'Fontana')]).records[1], 'avviso'), ['POSSIBILE_INVERSIONE:cognome']); eq(val([capo, memb('Elisa', 'Fontana')]).riepilogo.inviabile, true, 'solo un avviso');
  eq(codes(val([capo, memb('Fontana', 'Elisa')]).records[1]), []); eq(codes(val([capo, memb('FONTANA', 'Fontana')]).records[1], 'avviso'), [], 'stesso cognome del capo: nessun avviso');
});
test('L10 duplicati nello stesso elenco: avviso sulla seconda (non blocca); ordine e contenuto cambiano l\'impronta', () => {
  const v = val([mk({}), mk({})]); eq(codes(v.records[1], 'avviso'), ['DUPLICATO']); eq(codes(v.records[0]), []); eq(v.riepilogo.inviabile, true);
});
test('L11 traslitterazione: proposta (non applicata) per lettere accentate e caratteri speciali; ciò che non si sa convertire resta e viene segnalato', () => {
  for (const [a, b] of [['\u017dukauskas', 'Zukauskas'], ['M\u00fcller', 'Muller'], ['\u00d8rsted', 'Orsted'], ['D\u2019Angelo', "D'Angelo"], ['Stra\u00dfe', 'Strasse'], ['\u0141ukasz', 'Lukasz'], ['Se\u00e1n', 'Sean'], ['Nu\u00f1ez', 'Nunez']]) eq(AL.translit(a).value, b, a);
  const r = AL.translit('\u0414ima'); eq([r.value, r.changed, r.residuo.includes('\u0414')], ['\u0414ima', false, true]);
  eq(AL.translit(null).value, ''); eq(AL.translit('Rossi'), { value: 'Rossi', changed: false, residuo: [] });
});
test('L12 impronta: stabile, cambia con qualsiasi campo e con l\'ordine; assente se ci sono errori', () => {
  const a = val([mk({})]), b = val([mk({})]); eq(a.hash, b.hash); assert(/^[0-9a-f]{64}$/.test(a.hash));
  for (const over of [{ nome: 'Carla' }, { giorni: '07' }, { numdoc: 'XY9876544' }, { arrivo: '15/10/2026' }]) assert.notStrictEqual(val([mk(over)]).hash, a.hash, JSON.stringify(over));
  const x = mk({}), y = mk({ nome: 'Luigi' }); assert.notStrictEqual(val([x, y]).hash, val([y, x]).hash, 'ordine');
  const bad = val([mk({ sesso: '' })]); eq([bad.hash, bad.lines], [null, null]);
  eq(AL.hashLines(['a', 'b']), AL.hashLines(['a', 'b'])); assert.notStrictEqual(AL.hashLines(['a', 'b']), AL.hashLines(['ab']));
});
test('L13 limiti: oltre 200 schedine errore; file con più di 200 righe rifiutato senza leggerlo', () => {
  const many = Array.from({ length: 201 }, () => mk({})); const v = val(many); assert(v.globali.some(g => g.code === 'TROPPE_RIGHE' && g.sev === 'errore')); eq(v.riepilogo.inviabile, false);
  const p = AL.parseText(Array(201).fill(fx('ospite-singolo.txt')).join('\n')); eq([p.records.length, p.issues.map(i => i.code)], [0, ['TROPPE_RIGHE']]);
  eq(val([]).globali.some(g => g.code === 'FILE_VUOTO'), true);
});
test('L14 scheda vuota (modulo manuale): tutti i campi del tracciato, 168 caratteri, nessuna scorciatoia sui valori', () => {
  const e = AL.emptyRecord('17', '16/10/2026'); eq(Object.keys(e), AL.LAYOUT.map(f => f.k)); const l = AL.recordToLine(e); eq([l.line.length, l.overflow, l.line.slice(0, 12)], [168, [], '1716/10/2026']);
  assert(val([e]).records[0].errori >= 9, 'una scheda vuota è piena di errori');
  const o = AL.recordToLine(mk({ cognome: 'A'.repeat(60) })); eq(o.overflow, ['cognome']); eq(AL.linesOf([mk({ cognome: 'A'.repeat(60) })]), null);
  assert(has(val([mk({ cognome: 'A'.repeat(60) })]).records[0], 'LUNGHEZZA_CAMPO:cognome'));
});

/* ===================== W · client del servizio e tabelle ===================== */
const CFG = { utente: 'XX002458', password: 'pw-prova', wskey: 'KEY-PROVA' };
const net = m => ({ url: WS.DEFAULT_URL, fetch: m.fetch, timeoutMs: 1000 });
// altera la risposta di un servizio finto: fn(testoRisposta, testoRichiesta) → nuovo testo
const wrap = (m, fn) => { const f = m.fetch; m.fetch = async (u, i) => { const r = await f(u, i), t = fn(await r.text(), String(i && i.body || '')); return { ok: r.ok, status: r.status, text: async () => t }; }; return m; };
const dropLast = t => { const i = t.lastIndexOf('<EsitoOperazioneServizio>'); if (i < 0) return t; const end = '</EsitoOperazioneServizio>', j = t.indexOf(end, i) + end.length; return t.slice(0, i) + t.slice(j); };
const lines3 = () => fx('famiglia.txt').split('\n').slice(0, 3);
test('W1  GenerateToken: richiesta SOAP 1.2 corretta; credenziali o WSKEY sbagliate si riconoscono (senza eco dei segreti)', async () => {
  const m = makeSoapMock(); let r = await WS.generateToken(CFG, net(m));
  assert(r.ok && /^TOKEN-/.test(r.token), JSON.stringify(r));
  eq([m.calls[0].op, m.calls[0].ct, m.calls[0].url], ['GenerateToken', 'application/soap+xml; charset=utf-8', 'https://alloggiatiweb.poliziadistato.it/service/service.asmx']);
  r = await WS.generateToken({ ...CFG, password: 'sbagliata' }, net(m)); eq([r.ok, r.kind, WS.classify(r)], [false, 'servizio', 'credenziali_non_valide']);
  r = await WS.generateToken({ ...CFG, wskey: 'vecchia' }, net(m)); eq([r.ok, WS.classify(r)], [false, 'wskey_non_valida']);
  assert(!JSON.stringify(r).includes('vecchia') && !JSON.stringify(r).includes('pw-prova'), 'nessuna eco dei segreti');
});
test('W2  caratteri speciali in password e WSKEY: protetti nell\'XML, caratteri di controllo tolti', async () => {
  const bodies = [], m = makeSoapMock({ password: 'a&b<c>"d\'e', wskey: 'k<ey>&' }), f = m.fetch; m.fetch = (u, i) => { bodies.push(String(i.body)); return f(u, i); };
  const r = await WS.generateToken({ ...CFG, password: 'a&b<c>"d\'e', wskey: 'k<ey>&' }, net(m)); assert(r.ok, JSON.stringify(r));
  assert(bodies[0].includes('a&amp;b&lt;c&gt;&quot;d&apos;e') && !bodies[0].includes('a&b<c>'), 'XML ben formato');
  const m2 = makeSoapMock({ password: 'xy' }); assert((await WS.generateToken({ ...CFG, password: 'x\u0001y' }, net(m2))).ok, 'il carattere di controllo non finisce nell\'XML');
  eq(WS.esc('<&>"\''), '&lt;&amp;&gt;&quot;&apos;'); eq(WS.unesc('&lt;&#65;&#x42;&amp;&bogus;'), '<AB&&bogus;');
});
test('W3  Test: risposta per schedina; solo controllo, non registra nulla', async () => {
  const m = makeSoapMock(), tk = (await WS.generateToken(CFG, net(m))).token, l = lines3(); l[1] = l[1].slice(0, 167);
  const r = await WS.test(CFG, tk, l, net(m)); eq([r.ok, r.valide, r.dettaglio.length], [true, 2, 3]);
  const an = WS.analyze(r, 3); eq([an.ok, an.coerente, an.valide, an.righe.map(x => x.esito)], [false, true, 2, [true, false, true]]);
  eq([an.righe[1].cod, an.righe[1].des, an.righe[1].dett], ['11', 'SCHEDINA_FORMATO_NON_CORRETTO', 'Dimensione Riga errata']);
  eq([m.sent.length, m.tested.length], [0, 2], 'Test non invia nulla');
  const all = await WS.test(CFG, tk, lines3(), net(m)); eq(WS.analyze(all, 3).ok, true);
  const bad = await WS.test(CFG, 'TOKEN-INESISTENTE', lines3(), net(m));      // rifiuto dell'intera richiesta: risposta interpretabile con esito generale negativo, senza dettaglio per schedina
  eq([bad.ok, bad.general.esito, bad.general.cod, bad.general.des, bad.dettaglio.length], [true, false, '2', 'TOKEN_NON_VALIDO', 0]); eq(WS.analyze(bad, 3).ok, false);
});
test('W4  guasti del servizio: rete, HTTP 500, errore SOAP, pagina HTML, timeout (anche con il timer vero) si distinguono e non lanciano', async () => {
  for (const [modo, kind, stato] of [['rete', 'rete', 'servizio_non_raggiungibile'], ['http500', 'http', 'servizio_non_raggiungibile'], ['fault', 'fault', 'errore_servizio'], ['html', 'formato', 'errore_servizio'], ['abort', 'timeout', 'servizio_non_raggiungibile']]) {
    const r = await WS.generateToken(CFG, net(makeSoapMock({ modo: { GenerateToken: modo } }))); eq([r.ok, r.kind, WS.classify(r)], [false, kind, stato], modo);
    assert(WS.dettaglio(r).length > 3, modo + ': dettaglio leggibile');
  }
  const t0 = Date.now(), r = await WS.generateToken(CFG, { url: WS.DEFAULT_URL, fetch: makeSoapMock({ modo: { GenerateToken: 'timeout' } }).fetch, timeoutMs: 40 });
  eq([r.ok, r.kind], [false, 'timeout']); assert(Date.now() - t0 < 1000, 'il timer interrompe la chiamata');
  eq(WS.dettaglio({ kind: 'http', http: 502 }), 'HTTP 502'); assert(/Manutenzione|errore SOAP/.test(WS.dettaglio({ kind: 'fault', msg: 'Manutenzione' })));
});
test('W5  risposte incoerenti: numero di esiti diverso, SchedineValide che non torna o esito generale falso = mai "tutto ok"', async () => {
  const run = async m => { const tk = (await WS.generateToken(CFG, net(m))).token; return WS.analyze(await WS.test(CFG, tk, lines3(), net(m)), 3); };
  let an = await run(makeSoapMock()); eq([an.ok, an.coerente, an.valide], [true, true, 3]);
  an = await run(wrap(makeSoapMock(), t => t.includes('<TestResponse') ? dropLast(t) : t)); eq([an.ok, an.coerente, an.righe.length], [false, false, 2]);
  an = await run(wrap(makeSoapMock(), t => t.includes('<TestResponse') ? t.replace(/<SchedineValide>\d+<\/SchedineValide>/, '<SchedineValide>99</SchedineValide>') : t)); eq([an.ok, an.coerente, an.valide], [false, true, 99]);
  an = await run(wrap(makeSoapMock(), t => t.includes('<TestResponse') ? t.replace(/<esito>true<\/esito>/, '<esito>false</esito>') : t)); eq(an.ok, false, 'esito generale falso');
  an = await run(wrap(makeSoapMock(), t => t.includes('<TestResponse') ? t.replace(/<esito>true<\/esito>/, '<esito>boh</esito>') : t)); eq(an.ok, false, 'esito non interpretabile');
  an = await run(wrap(makeSoapMock(), t => t.includes('<TestResponse') ? t.replace(/(<Dettaglio><EsitoOperazioneServizio><esito>)true/, '$1false') : t)); eq([an.ok, an.coerente, an.valide, an.righe.map(x => x.esito)], [false, true, 3, [false, true, true]], 'una schedina respinta anche se il totale sembra tornare');
  eq(WS.analyze({ ok: false }, 3), { ok: false, risposta: false, righe: [], valide: null });
});
test('W6  tabelle CSV: parser, intestazione riconosciuta o assente, Luoghi (stati/comuni/Italia), ricerca per nome e per codice', () => {
  eq(WS.parseCsv('\uFEFFA;B\r\n"x;y";"z""w"\r\n\r\n; ;\r\nc;d'), [['A', 'B'], ['x;y', 'z"w'], ['c', 'd']]);
  const t = WS.buildTable('Luoghi', TABELLE.Luoghi); eq([t.ok, t.size, t.italia, t.get('100000100').kind, t.get('400000001').kind], [true, 7, '100000100', 'stato', 'comune']);
  eq(t.get('400000001'), { codice: '400000001', nome: 'COMUNE DI PROVA', prov: 'TN', fine: '', kind: 'comune' }); eq(t.get(' 400000001 ').nome, 'COMUNE DI PROVA', 'il codice si cerca senza spazi');
  assert(t.diag.avvisi.some(a => /pochissime/.test(a)), 'tabella piccola segnalata');
  const amb = WS.buildTable('Luoghi', 'Codice;Descrizione\n100000100;ITALIA\n100000101;ITALIA\n12345;SCARTATA\n'); eq([amb.italia, amb.diag.scartate], [null, 1]); assert(amb.diag.avvisi.some(a => /Italia non riconosciuta/.test(a)));
  eq(WS.buildTable('Tipi_Alloggiato', '16;OSPITE SINGOLO\n17;CAPO FAMIGLIA').size, 2, 'senza intestazione'); eq(WS.buildTable('Tipi_Alloggiato', 'Codice;Descrizione\n16;OSPITE SINGOLO').get('16').nome, 'OSPITE SINGOLO');
  eq([WS.buildTable('Luoghi', '').ok, WS.buildTable('Luoghi', 'Codice;Descrizione\n').ok], [false, false], 'tabella vuota = non utilizzabile');
  eq(WS.search(t, 'ital')[0].nome, 'ITALIA'); eq(WS.search(t, 'borgo d').map(x => x.codice), ['400000002']); eq(WS.search(t, 'comune', { kind: 'stato' }), []);
  eq(WS.search(t, 'x'), [], 'un solo carattere non basta'); eq(WS.search(t, '4000000').length, 3, 'per inizio del codice'); eq(WS.search(t, 'SAN MARTINO')[0].prov, 'MI'); eq(WS.search(null, 'ital'), []);
});
test('W7  configurazione: variabili obbligatorie, invio reale solo con "true" E Production, utente mascherato', () => {
  const full = { ALLOGGIATI_UTENTE: 'XX002458', ALLOGGIATI_PASSWORD: 'p', ALLOGGIATI_WSKEY: 'k' };
  eq(WS.readConfig({}).missing, WS.VARS); eq(WS.readConfig({ ...full, ALLOGGIATI_WSKEY: '  ' }).missing, ['ALLOGGIATI_WSKEY'], 'solo spazi = mancante'); eq(WS.readConfig(full).missing, []);
  const en = (a, b) => WS.readConfig({ ...full, ALLOGGIATI_SEND_ENABLED: a, VERCEL_ENV: b }).send;
  eq([en('true', 'production').enabled, en(' true ', 'production').enabled], [true, true]);
  for (const [a, b] of [['true', 'preview'], ['true', 'development'], ['true', undefined], ['TRUE', 'production'], ['1', 'production'], ['false', 'production'], [undefined, 'production'], ['', 'production']]) { const s = en(a, b); eq(s.enabled, false, a + '/' + b); assert(s.motivo.length > 10, 'il motivo è spiegato (' + a + '/' + b + ')'); }
  eq(WS.readConfig(full).url, WS.DEFAULT_URL); eq(WS.readConfig({ ...full, ALLOGGIATI_URL: 'https://prova.test/x' }).url, 'https://prova.test/x');
  eq([WS.maskUser('XX002458'), WS.maskUser('abcd'), WS.maskUser(''), WS.maskUser('abcdefghijkl')], ['XX\u2022\u2022\u2022\u202258', '\u2022\u2022\u2022\u2022', '', 'ab\u2022\u2022\u2022\u2022\u2022\u2022kl']);
});
test('W8  Tabella e Authentication_Test: tabelle ufficiali; token non valido e tabella sconosciuta = errore leggibile', async () => {
  const m = makeSoapMock(), tk = (await WS.generateToken(CFG, net(m))).token;
  const r = await WS.tabella(CFG, tk, 'Luoghi', net(m)); assert(r.ok && r.csv.startsWith('Codice;Descrizione')); eq(m.calls[m.calls.length - 1].tabella, 'Luoghi');
  eq((await WS.tabella(CFG, tk, 'Foo', net(m))).kind, 'formato'); eq(m.count('Tabella'), 1, 'nessuna chiamata per una tabella non gestita');
  const bad = await WS.tabella(CFG, 'TOKEN-INESISTENTE', 'Luoghi', net(m)); eq([bad.ok, bad.kind, bad.cod], [false, 'servizio', '2']);
  eq((await WS.authTest(CFG, tk, net(m))).ok, true); const at = await WS.authTest(CFG, 'TOKEN-INESISTENTE', net(m)); eq([at.ok, at.kind], [false, 'servizio']);
});

/* ===================== E · endpoint di gestione (api/adempimenti.js) ===================== */
const ENV = { ALLOGGIATI_UTENTE: 'XX002458', ALLOGGIATI_PASSWORD: 'pw-prova', ALLOGGIATI_WSKEY: 'KEY-PROVA', ALLOGGIATI_SEND_ENABLED: 'true', VERCEL_ENV: 'production', SESSION_SECRET: 'sess-test' };
function makeKv(clock) {      // archivio finto con SET NX/EX, scadenze sull'orologio simulato e guasti a richiesta
  const d = new Map(), live = k => { const e = d.get(k); if (!e) return null; if (e.exp && e.exp <= clock.t) { d.delete(k); return null; } return e; };
  const kv = async (...c) => {
    const [op, k, v, ...o] = c, O = String(op).toUpperCase();
    if (kv.fail || (kv.failOn && kv.failOn.test(String(k)))) throw new Error('KV: non raggiungibile');
    if (O === 'GET') { const e = live(k); return e ? e.v : null; }
    if (O === 'SET') { let nx = false, ex = 0; for (let i = 0; i < o.length; i++) { const u = String(o[i]).toUpperCase(); if (u === 'NX') nx = true; else if (u === 'EX') ex = +o[++i]; } if (nx && live(k)) return null; d.set(k, { v: String(v), exp: ex ? clock.t + ex * 1000 : 0 }); return 'OK'; }
    if (O === 'DEL') return d.delete(k) ? 1 : 0;
    throw new Error('KV non simulato: ' + op);
  };
  kv.d = d; return kv;
}
// o: clock/kv/soap riusabili (altra "istanza" della funzione sulla stessa archivio), env, soapOpts, tick (ms di orologio per ogni chiamata al servizio), envObj
function setup(o) {
  o = o || {};
  const clock = o.clock || { t: NOW }, kv = o.kv || makeKv(clock);
  const soap = o.soap || makeSoapMock(Object.assign({ onCall: o.tick ? () => { clock.t += o.tick; } : undefined }, o.soapOpts));
  const handler = ADP.make({ env: o.envObj || Object.assign({}, ENV, o.env), kv, auth: req => !!(req.headers && req.headers.authorization === 'admin-ok'), fetch: (...a) => soap.fetch(...a), now: () => clock.t });
  const call = (a, body, opt) => new Promise((resolve, reject) => {
    opt = opt || {};
    const req = { method: opt.method || 'POST', query: { a }, headers: opt.noAuth ? {} : { authorization: 'admin-ok' }, body: body === undefined ? {} : body };
    const out = { status: 200, headers: {}, body: null }, res = { setHeader(k, v) { out.headers[k.toLowerCase()] = v; return res; }, status(s) { out.status = s; return res; }, json(b) { out.body = b; resolve(out); return res; } };
    Promise.resolve(handler(req, res)).catch(reject);
  });
  return { clock, kv, soap, call };
}
const recs = f => AL.parseText(fx(f)).records;
async function prove(S, file) { const records = recs(file || 'famiglia.txt'), c = await S.call('al_check', { records }); eq(c.body.stato, 'test_ok', JSON.stringify(c.body).slice(0, 400)); return { records, proof: c.body.proof, hash: c.body.hash }; }
const sendBody = (p, o) => Object.assign({ records: p.records, proof: p.proof }, o || {});
const noSend = S => eq(S.soap.count('Send'), 0, 'il servizio non ha ricevuto nessun Send');
const keys = (S, pre) => [...S.kv.d.keys()].filter(k => k.startsWith(pre));
const ready = async o => { const S = setup(o); await S.call('al_status', {}); return S; };      // tabelle ufficiali già in memoria, come dopo l'apertura della pagina
const RIFIUTO = (op, cod, des, dett) => '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><' + op + 'Response xmlns="AlloggiatiService"><' + op + 'Result><esito>false</esito><ErroreCod>' + cod + '</ErroreCod><ErroreDes>' + des + '</ErroreDes><ErroreDettaglio>' + dett + '</ErroreDettaglio></' + op + 'Result></' + op + 'Response></soap:Body></soap:Envelope>';
const rejectSara = { rowCheck: l => /Sara/.test(l) ? { cod: '12', des: 'SCHEDINA_CAMPO_NON_CORRETTO', dett: 'Data di Nascita Errata' } : null };

test('E1  accesso e ingressi: senza login 401 (servizio mai chiamato), solo POST, azioni sconosciute, dati manipolati o fuori misura', async () => {
  const S = setup(); let r = await S.call('al_status', {}, { noAuth: true }); eq([r.status, S.soap.calls.length], [401, 0]);
  eq((await S.call('al_status', {}, { method: 'GET' })).status, 405); eq((await S.call('al_status', {}, { method: 'PUT' })).status, 405);
  for (const a of ['al_boh', 'x', 'al_', 'al_Status', '__proto__', 'constructor', 'toString', 'al_status;x', 'al_status/../x']) eq((await S.call(a, {})).status, 404, a);
  eq(S.soap.calls.length, 0);
  const rec = AL.emptyRecord(), v = x => S.call('al_validate', x);
  for (const [body, why] of [[{ records: 'x' }, 'non è un elenco'], [{ records: [] }, 'elenco vuoto'], [{ records: Array(201).fill(rec) }, '201 schedine'], [{ records: [null] }, 'null'], [{ records: [[1]] }, 'array'],
    [{ records: [{ ...rec, cognome: { $ne: 1 } }] }, 'oggetto in un campo'], [{ records: [{ ...rec, cognome: ['a'] }] }, 'array in un campo'], [{ records: [{ ...rec, cognome: 'A'.repeat(201) }] }, 'campo troppo lungo'], [{}, 'senza corpo']])
    eq((await v(body)).status, 400, why);
  eq((await S.call('al_parse', { text: 123 })).status, 400); eq((await S.call('al_parse', { text: 'x'.repeat(200001) })).status, 400); eq((await S.call('al_check', { records: 5 })).status, 400); eq((await S.call('al_send', { records: [] })).status, 400);
  const ok = await v({ records: [{ ...rec, cognome: 5, evil: '<img src=x onerror=alert(1)>', ['__proto__']: { x: 1 }, riga: -3, approssimato: 'si' }] });
  eq(ok.status, 200); assert(!('evil' in ok.body.records[0]) && !('riga' in ok.body.records[0]) && !('approssimato' in ok.body.records[0]), 'campi estranei e marcatori non validi scartati'); eq(ok.body.records[0].cognome, '5');
  eq(ok.headers['cache-control'], 'no-store'); eq(S.soap.calls.length, 0, 'la sola validazione locale non chiama il servizio');
});
test('E2  stato configurazione: variabili mancanti, credenziali, WSKEY, servizio giù; mai un segreto nelle risposte', async () => {
  const bodies = []; const go = async (o, a) => { const S = setup(o), r = await S.call(a || 'al_status', {}); bodies.push(JSON.stringify(r.body)); return { S, r }; };
  let { S, r } = await go({ env: { ALLOGGIATI_WSKEY: '' } }); eq([r.status, r.body.stato, r.body.missing, S.soap.calls.length], [200, 'variabili_mancanti', ['ALLOGGIATI_WSKEY'], 0]);
  ({ r } = await go({ env: { ALLOGGIATI_PASSWORD: 'pw-ERRATA-QQ' } })); eq(r.body.stato, 'credenziali_non_valide'); assert(/ALLOGGIATI_PASSWORD/.test(r.body.fix), r.body.fix);
  ({ r } = await go({ env: { ALLOGGIATI_WSKEY: 'KEY-ROTTA-QQ' } })); eq(r.body.stato, 'wskey_non_valida'); assert(/WSKEY/.test(r.body.fix));
  for (const [modo, stato] of [['http500', 'servizio_non_raggiungibile'], ['rete', 'servizio_non_raggiungibile'], ['abort', 'servizio_non_raggiungibile'], ['html', 'errore_servizio'], ['fault', 'errore_servizio']]) { ({ r } = await go({ soapOpts: { modo: { GenerateToken: modo } } })); eq(r.body.stato, stato, modo); assert(r.body.dettaglio, modo + ': dettaglio'); }
  ({ S, r } = await go({ tick: 0 })); eq([r.body.stato, r.body.utente, r.body.ambiente, r.body.send.enabled], ['ok', 'XX\u2022\u2022\u2022\u202258', 'production', true]);
  eq(Object.keys(r.body.tabelle), ['Luoghi', 'Tipi_Documento', 'Tipi_Alloggiato']); eq(Object.values(r.body.tabelle).map(x => [x.ok, x.righe]), [[true, 7], [true, 3], [true, 5]]);
  eq(S.soap.calls.map(c => c.op), ['GenerateToken', 'Authentication_Test', 'Tabella', 'Tabella', 'Tabella']);
  ({ r } = await go({ env: { VERCEL_ENV: 'preview', ALLOGGIATI_SEND_ENABLED: '' } })); eq([r.body.stato, r.body.send.enabled, r.body.ambiente], ['ok', false, 'preview']);
  const all = bodies.join('\n'); for (const s of ['pw-prova', 'KEY-PROVA', 'TOKEN-', 'XX002458', 'pw-ERRATA-QQ', 'KEY-ROTTA-QQ']) assert(!all.includes(s), 'segreto nella risposta: ' + s);
});
test('E3  tabelle ufficiali: lette dal servizio una volta, poi memoria e KV (compressa); copia illeggibile e scadenza gestite', async () => {
  const S = setup(); await S.call('al_status', {}); eq(S.soap.count('Tabella'), 3);
  await S.call('al_status', {}); eq(S.soap.count('Tabella'), 3, 'seconda richiesta: dalla memoria');
  const S2 = setup({ clock: S.clock, kv: S.kv, soap: S.soap });      // altra istanza della funzione: stessa KV, memoria vuota
  let r = await S2.call('al_parse', { text: fx('famiglia.txt') }); eq(r.body.tabelle, { Luoghi: true, Tipi_Documento: true, Tipi_Alloggiato: true }); eq(S.soap.count('Tabella'), 3, 'letta dalla KV, senza rete');
  assert(!S.kv.d.get('alloggiati:tab:Luoghi').v.includes('COMUNE'), 'in KV è compressa');
  r = await S.call('al_tables', { nome: 'Luoghi', refresh: true }); eq([r.body.ok, r.body.righe], [true, 7]); eq(S.soap.count('Tabella'), 4, 'aggiornamento esplicito = nuova lettura');
  eq((await S.call('al_tables', { nome: 'Boh' })).status, 400);
  const S3 = setup({ clock: S.clock, soap: S.soap }); S3.kv.d.set('alloggiati:tab:Luoghi', { v: 'non-e-gzip', exp: 0 });
  r = await S3.call('al_parse', { text: fx('famiglia.txt') }); eq([r.status, r.body.tabelle.Luoghi], [200, false]); assert(r.body.globali.some(g => g.code === 'TABELLE'), 'copia illeggibile: avviso, non errore');
  S.clock.t += 25 * 3600e3; r = await S.call('al_lookup', { q: 'ital' }); eq([r.status, r.body.ok], [200, false]); await S.call('al_status', {}); eq((await S.call('al_lookup', { q: 'ital' })).body.ok, true, 'dopo la scadenza si rileggono');
  // tabella che il servizio restituisce vuota o in formato imprevisto: errore leggibile, mai un crash
  const V = setup({ soapOpts: { tabelle: { Luoghi: '', Tipi_Documento: 'x', Tipi_Alloggiato: TABELLE.Tipi_Alloggiato } } }); r = await V.call('al_tables', { nome: 'Luoghi' });
  eq([r.status, r.body.ok], [200, false]); assert(r.body.diag && r.body.diag.avvisi.length, 'diagnostica della tabella'); eq((await V.call('al_status', {})).body.stato, 'ok');
});
test('E4  ricerca nelle tabelle (menu del modulo manuale): per nome e per codice, per tipo di luogo; senza tabelle risposta chiara', async () => {
  const S = setup(); eq((await S.call('al_lookup', { q: 'ital' })).body, { ok: false, motivo: 'Tabella non caricata', risultati: [] }); await S.call('al_status', {});
  const L = async b => (await S.call('al_lookup', b)).body.risultati;
  eq(await L({ q: 'comune', kind: 'comune' }), [{ codice: '400000001', nome: 'COMUNE DI PROVA', prov: 'TN', kind: 'comune' }]);
  eq((await L({ q: 'ital', kind: 'stato' }))[0], { codice: '100000100', nome: 'ITALIA', prov: '', kind: 'stato' }); eq(await L({ q: 'comune', kind: 'stato' }), []);
  eq((await L({ t: 'documenti', q: 'pass' })).map(x => x.codice), ['PASOR']); eq((await L({ t: 'tipi', q: 'capo' })).map(x => x.codice).sort(), ['17', '18']);
  eq((await L({ t: 'documenti', all: true })).map(x => x.codice), ['PASOR', 'IDENT', 'PATEN'].sort((a, b) => ({ PASOR: 'PASSAPORTO ORDINARIO', IDENT: 'CARTA DI IDENTITA', PATEN: 'PATENTE DI GUIDA' }[a]).localeCompare({ PASOR: 'PASSAPORTO ORDINARIO', IDENT: 'CARTA DI IDENTITA', PATEN: 'PATENTE DI GUIDA' }[b]))); eq((await L({ t: 'tipi', all: true })).length, 5); eq((await L({ all: true, q: '' })), [], 'Luoghi: solo ricerca, mai l\'elenco intero');
  eq(await L({ q: 'x' }), []); eq((await L({ q: '4000000' })).length, 3); eq((await S.call('al_lookup', { q: '<script>'.repeat(20), kind: { x: 1 } })).status, 200);
});
test('E5  al_parse: legge il TXT, decodifica i codici, non restituisce campi interni; file difettoso = errori sulla riga giusta', async () => {
  const S = await ready(); const r = await S.call('al_parse', { text: fx('famiglia.txt') }); eq(r.status, 200);
  eq([r.body.riepilogo.inviabile, r.body.riepilogo.totale, r.body.riepilogo.perTipo], [true, 4, { 17: 1, 19: 3 }]);
  const a = r.body.records[0]; eq([a.dec.tipo, a.dec.stato, a.dec.cittad, a.dec.tipodoc, a.dec.luogo, a.partenza, a.riga], ['CAPO FAMIGLIA', 'ESTERIA', 'ESTERIA', 'CARTA DI IDENTITA', 'ESTERIA', '19/10/2026', 1]);
  assert(r.body.records.every(x => !('_s' in x) && !('approssimato' in x)), 'campi interni non esposti');
  eq(r.body.nuclei.map(n => [n.tipo, n.capo, n.membri]), [['famiglia', 0, [1, 2, 3]]]); eq(r.body.lines, fx('famiglia.txt').split('\n')); assert(/^[0-9a-f]{64}$/.test(r.body.hash));
  const t = fx('famiglia.txt').split('\n'); t[2] = t[2].slice(0, 150); const b = await S.call('al_parse', { text: t.join('\n') });
  eq([b.body.riepilogo.inviabile, b.body.lines, b.body.hash], [false, null, null]); eq([b.body.records[2].riga, b.body.records[2].approssimato], [3, true]); assert(has(b.body.records[2], 'LUNGHEZZA'));
  eq(b.body.records.map(x => x.nucleoBloccato), [true, true, true, true], 'un errore blocca tutto il nucleo');
  const e = await S.call('al_parse', { text: '' }); eq([e.status, e.body.riepilogo.inviabile, e.body.globali.map(g => g.code)], [200, false, ['FILE_VUOTO']], 'un solo messaggio, non due');
  const big = await S.call('al_parse', { text: Array(201).fill(fx('ospite-singolo.txt')).join('\n') }); eq([big.body.riepilogo.inviabile, big.body.globali.map(g => g.code)], [false, ['TROPPE_RIGHE']]);
});
test('E6  al_validate (modulo manuale e modifiche): scheda vuota piena di errori, completata diventa inviabile; la riga ricostruita resta segnalata finché non è confermata', async () => {
  const S = await ready(); const rec = AL.emptyRecord('16', '16/10/2026');
  let r = await S.call('al_validate', { records: [rec] }); eq(r.body.riepilogo.inviabile, false); assert(r.body.records[0].errori >= 9);
  Object.assign(rec, { giorni: '3', cognome: 'Rossi', nome: 'Mario', sesso: '1', nascita: '01/02/1980', stato: '100000100', cittad: '100000100', comune: '400000002', prov: 'RM', tipodoc: 'IDENT', numdoc: 'AA1234567', luogo: '400000002' });
  r = await S.call('al_validate', { records: [rec] }); eq([r.body.riepilogo.inviabile, r.body.records[0].dec.comune, r.body.records[0].partenza, r.body.lines[0].slice(12, 14)], [true, 'BORGO D\'ESEMPIO', '19/10/2026', '03']);
  r = await S.call('al_validate', { records: [{ ...rec, approssimato: true, riga: 7 }] }); eq(r.body.riepilogo.inviabile, false); assert(has(r.body.records[0], 'RIGA_RICOSTRUITA'), 'la riga ricostruita non passa da sola'); eq(r.body.records[0].riga, 7);
  eq((await S.call('al_validate', { records: [rec] })).body.riepilogo.inviabile, true, 'dopo la conferma a mano il marcatore non c\'è più');
  eq((await S.call('al_validate', { records: [{ ...rec, sesso: '' }, rec] })).body.riepilogo.inviabile, false);
});
test('E7  al_check: dati non validi non toccano il servizio; Test positivo = prova firmata; il servizio rifiuta una schedina = niente prova e nucleo bloccato', async () => {
  let S = await ready(); const bad = recs('famiglia.txt').map(r => ({ ...r })); bad[1].sesso = ''; const n0 = S.soap.calls.length;
  let r = await S.call('al_check', { records: bad }); eq([r.status, r.body.stato, r.body.riepilogo.inviabile, 'proof' in r.body], [422, 'dati_non_validi', false, false]); eq(S.soap.calls.length, n0, 'il servizio non viene interpellato');
  r = await S.call('al_check', { records: recs('famiglia.txt') });
  eq([r.status, r.body.stato, r.body.schedineValide, r.body.coerente], [200, 'test_ok', 4, true]); assert(typeof r.body.proof === 'string' && r.body.proof.split('.').length === 2); eq([r.body.proofScadenzaMs, r.body.proofTtlMs], [S.clock.t + 20 * 60e3, 20 * 60e3]);
  eq(S.soap.calls.slice(n0).map(c => c.op), ['GenerateToken', 'Authentication_Test', 'Test']); eq([S.soap.sent.length, S.soap.tested.length], [0, 4], 'Test non registra nulla');
  eq(r.body.hash, AL.hashLines(fx('famiglia.txt').split('\n'))); eq(r.body.righe.map(x => x.esito), [true, true, true, true]);
  S = await ready({ soapOpts: rejectSara }); r = await S.call('al_check', { records: recs('famiglia.txt') });
  eq([r.status, r.body.stato, r.body.schedineValide, 'proof' in r.body], [200, 'test_con_errori', 3, false]); eq(r.body.righe.map(x => x.esito), [true, true, false, true]);
  eq(r.body.righe.map(x => !!x.bloccataPerNucleo), [true, true, false, true], 'le altre schedine del nucleo sono bloccate'); eq([r.body.righe[2].cod, r.body.righe[2].des, r.body.righe[2].dett], ['12', 'SCHEDINA_CAMPO_NON_CORRETTO', 'Data di Nascita Errata']);
});
test('E8  al_check con servizio anomalo: risposta incompleta, SchedineValide che non torna, token non valido, servizio giù, variabili mancanti = mai una prova', async () => {
  let S = await ready(); wrap(S.soap, t => t.includes('<TestResponse') ? dropLast(t) : t); let r = await S.call('al_check', { records: recs('famiglia.txt') });
  eq([r.body.stato, r.body.coerente, 'proof' in r.body], ['test_con_errori', false, false]); assert(/3 schedine su 4/.test(r.body.anomalia), r.body.anomalia);
  S = await ready(); wrap(S.soap, t => t.includes('<TestResponse') ? t.replace(/<SchedineValide>\d+<\/SchedineValide>/, '<SchedineValide>99</SchedineValide>') : t); r = await S.call('al_check', { records: recs('famiglia.txt') });
  eq([r.body.stato, 'proof' in r.body], ['test_con_errori', false]);
  S = await ready({ soapOpts: { tokenScaduto: true } }); r = await S.call('al_check', { records: recs('famiglia.txt') }); eq([r.status, r.body.stato, 'proof' in r.body, S.soap.count('Test')], [502, 'errore_servizio', false, 0]); assert(/TOKEN_NON_VALIDO/.test(r.body.dettaglio));
  S = setup({ soapOpts: { modo: { GenerateToken: 'http500' } } }); r = await S.call('al_check', { records: recs('famiglia.txt') }); eq([r.status, r.body.stato], [502, 'servizio_non_raggiungibile']);
  S = setup({ soapOpts: { modo: { Test: 'fault' } } }); r = await S.call('al_check', { records: recs('famiglia.txt') }); eq([r.status, r.body.stato, 'proof' in r.body], [502, 'errore_servizio', false]);
  S = await ready(); wrap(S.soap, t => t.includes('<TestResponse') ? RIFIUTO('Test', '7', 'ERRORE_PROVA', 'Richiesta non valida') : t); r = await S.call('al_check', { records: recs('famiglia.txt') });
  eq([r.status, r.body.stato, 'proof' in r.body], [502, 'errore_servizio', false], 'esito generale negativo'); assert(/codice 7 · ERRORE_PROVA · Richiesta non valida/.test(r.body.dettaglio), r.body.dettaglio);
  S = setup({ env: { ALLOGGIATI_UTENTE: '' } }); r = await S.call('al_check', { records: recs('famiglia.txt') }); eq([r.status, r.body.stato, r.body.missing, S.soap.calls.length], [409, 'variabili_mancanti', ['ALLOGGIATI_UTENTE'], 0]);
  S = await ready(); await prove(S); await prove(S); assert(S.soap.n >= 3, 'un token nuovo a ogni richiesta'); assert(![...S.kv.d.values()].some(e => /TOKEN-/.test(e.v)), 'nessun token salvato in archivio');
});
test('E9  al_send, porte di sicurezza: prova mancante/scaduta/manomessa/di un\'altra installazione, dati cambiati o non validi → nessun Send e prova non consumata', async () => {
  const S = await ready(), p = await prove(S); let r;
  const [pl, sg] = p.proof.split('.'), flip = s => s.slice(0, -1) + (s.slice(-1) === 'A' ? 'B' : 'A');
  for (const bad of [undefined, '', 'a.b', 'abc', null, 123, {}, [], pl + '.' + flip(sg), flip(pl) + '.' + sg, sg + '.' + pl, p.proof + 'x', p.proof.toUpperCase()]) eq((await S.call('al_send', sendBody(p, { proof: bad }))).status, 403, JSON.stringify(bad));
  eq((await S.call('al_send', { records: p.records })).body.stato, 'prova_non_valida'); noSend(S);
  const altri = recs('famiglia.txt').map(x => ({ ...x })); altri[1].nome = 'Luka'; r = await S.call('al_send', sendBody(p, { records: altri })); eq([r.status, r.body.stato], [409, 'dati_cambiati']);
  r = await S.call('al_send', sendBody(p, { records: recs('gruppo.txt') })); eq([r.status, r.body.stato], [409, 'dati_cambiati'], 'prova di un\'altra schedina'); noSend(S);
  altri[1].sesso = ''; r = await S.call('al_send', sendBody(p, { records: altri })); eq([r.status, r.body.stato], [422, 'dati_non_validi']); noSend(S); eq(keys(S, 'alloggiati:prova:').length, 0, 'nessun tentativo respinto ha consumato la prova');
  const B = setup({ clock: S.clock, kv: S.kv, soap: S.soap, env: { SESSION_SECRET: 'altra-installazione' } }); eq((await B.call('al_send', sendBody(p))).status, 403, 'firmata con un altro segreto'); noSend(S);
  S.clock.t += 21 * 60e3; r = await S.call('al_send', sendBody(p)); eq([r.status, r.body.stato], [403, 'prova_non_valida'], 'scaduta dopo 20 minuti'); noSend(S);
  S.clock.t -= 21 * 60e3; r = await S.call('al_send', sendBody(p)); eq([r.status, r.body.stato], [200, 'inviato'], 'la prova valida funziona ancora: i tentativi respinti non l\'avevano consumata');
});
test('E10 invio reale: disattivato senza ALLOGGIATI_SEND_ENABLED=true E ambiente Production (il Test funziona ovunque); la prova non si consuma', async () => {
  for (const env of [{ ALLOGGIATI_SEND_ENABLED: '' }, { ALLOGGIATI_SEND_ENABLED: 'TRUE' }, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' }, { VERCEL_ENV: '' }]) {
    const D = await ready({ env }), p = await prove(D); const r = await D.call('al_send', sendBody(p));
    eq([r.status, r.body.stato, r.body.send.enabled], [403, 'send_disattivato', false], JSON.stringify(env)); assert(/ALLOGGIATI_SEND_ENABLED|Production|VERCEL_ENV/.test(r.body.err), r.body.err); noSend(D); eq(keys(D, 'alloggiati:prova:').length, 0);
    if (env.VERCEL_ENV === 'preview') assert(/preview/.test(r.body.err));
    const E = setup({ clock: D.clock, kv: D.kv, soap: D.soap }); eq((await E.call('al_send', sendBody(p))).body.stato, 'inviato', 'abilitato (Production + variabile): la stessa prova vale');
  }
});
test('E11 invio riuscito: inviate esattamente le righe verificate, nell\'ordine; impronte (7 giorni) al posto dei dati personali; blocchi rilasciati', async () => {
  const S = await ready(), p = await prove(S); const r = await S.call('al_send', sendBody(p));
  eq([r.status, r.body.stato, r.body.schedineValide, r.body.righe.map(x => x.esito)], [200, 'inviato', 4, [true, true, true, true]]); eq(S.soap.sent, fx('famiglia.txt').split('\n')); eq(S.soap.count('Send'), 1);
  assert(/4 schedine/.test(r.body.istruzioni[0]), r.body.istruzioni[0]);
  eq([keys(S, 'alloggiati:inv:').length, keys(S, 'alloggiati:prova:').length, keys(S, 'alloggiati:invio:').length], [4, 1, 0]);
  const blob = JSON.stringify([...S.kv.d.entries()]); for (const s of ['Neri', 'Giulia', 'AB1234567', 'pw-prova', 'KEY-PROVA']) assert(!blob.includes(s), 'in archivio: ' + s);
  const exp = [...S.kv.d.entries()].filter(([k]) => k.startsWith('alloggiati:inv:')).map(([, e]) => e.exp - S.clock.t); assert(exp.every(x => x === 7 * 86400e3), 'marcatori di 7 giorni');
  const again = await S.call('al_send', sendBody(p)); eq([again.status, again.body.stato], [422, 'dati_non_validi'], 'stesso file inviato di nuovo'); eq(S.soap.count('Send'), 1);
  assert(again.body.records.every(x => x.issues.some(i => i.code === 'GIA_INVIATA')));
});
test('E12 doppio clic e due schede: stessa prova in parallelo = un solo Send; due verifiche diverse sugli stessi dati = un solo Send', async () => {
  let S = await ready({ soapOpts: { delay: 15 } }), p = await prove(S);
  let out = await Promise.all([S.call('al_send', sendBody(p)), S.call('al_send', sendBody(p))]); eq(out.map(o => o.status).sort(), [200, 409]); eq(out.find(o => o.status === 409).body.stato, 'prova_gia_usata'); eq(S.soap.count('Send'), 1); eq(S.soap.sent.length, 4);
  S = await ready({ soapOpts: { delay: 15 } }); const p1 = await prove(S), p2 = await prove(S); assert(p1.proof !== p2.proof);
  out = await Promise.all([S.call('al_send', sendBody(p1)), S.call('al_send', sendBody(p2))]); eq(out.map(o => o.status).sort(), [200, 409]); eq(out.find(o => o.status === 409).body.stato, 'invio_in_corso'); eq([S.soap.count('Send'), S.soap.sent.length], [1, 4]);
  eq(keys(S, 'alloggiati:invio:').length, 0, 'il blocco si rilascia a fine invio');
});
test('E13 esito incerto (timeout, rete, HTTP 500, errore SOAP, pagina HTML, risposta persa): mai un secondo invio da sé; nessuna impronta; prova bruciata', async () => {
  for (const modo of ['abort', 'rete', 'http500', 'fault', 'html']) {
    const S = await ready({ soapOpts: { modo: { Send: modo } } }), p = await prove(S), r = await S.call('al_send', sendBody(p));
    eq([r.status, r.body.stato], [200, 'esito_incerto'], modo); assert(r.body.dettaglio && r.body.istruzioni.some(i => /NON inviare di nuovo/.test(i)), modo);
    eq([S.soap.count('Send'), keys(S, 'alloggiati:inv:').length, keys(S, 'alloggiati:invio:').length], [1, 0, 0], modo);
    const again = await S.call('al_send', sendBody(p)); eq([again.status, again.body.stato], [409, 'prova_gia_usata'], modo); eq(S.soap.count('Send'), 1, modo + ': nessun ritentativo');
  }
  // risposta persa DOPO che il servizio ha acquisito le schedine: l'applicazione non può saperlo e lo dice
  const S = await ready(), f = S.soap.fetch; S.soap.fetch = async (u, i) => { const r = await f(u, i); if (/<all:Send>/.test(String(i.body))) { const e = new Error('aborted'); e.name = 'AbortError'; throw e; } return r; };
  const p = await prove(S), r = await S.call('al_send', sendBody(p)); eq([r.body.stato, S.soap.sent.length], ['esito_incerto', 4], 'il servizio le aveva già acquisite');
  S.soap.fetch = f; const p2 = await prove(S); eq((await S.call('al_send', sendBody(p2))).body.stato, 'inviato', 'ripetere da capo è una scelta esplicita dell\'utente (le istruzioni dicono di controllare prima il portale)'); eq(S.soap.sent.length, 8);
});
test('E14 invio parziale, rifiutato o con risposta incoerente: l\'esito è per schedina; solo le acquisite diventano "già inviate"', async () => {
  let phaseSend = false; const gate = (S, rule) => { const f = S.soap.fetch; S.soap.fetch = (u, i) => { phaseSend = /<all:Send>/.test(String(i.body)); return f(u, i); }; return S; };
  let S = gate(await ready({ soapOpts: { rowCheck: l => phaseSend && /Marco/.test(l) ? { cod: '12', des: 'SCHEDINA_CAMPO_NON_CORRETTO', dett: 'Data di Nascita Errata' } : null } })); let p = await prove(S), r = await S.call('al_send', sendBody(p));
  eq([r.status, r.body.stato, r.body.schedineValide, r.body.righe.map(x => x.esito)], [200, 'parziale', 3, [true, true, true, false]]); assert(/PARZIALE: 3 schedine su 4/.test(r.body.istruzioni[0]) && r.body.istruzioni.some(i => /NON rinviare/.test(i)));
  eq(keys(S, 'alloggiati:inv:').length, 3, 'solo le tre acquisite'); r = await S.call('al_check', { records: recs('famiglia.txt') });
  eq([r.status, r.body.records.map(x => x.issues.some(i => i.code === 'GIA_INVIATA'))], [422, [true, true, true, false]], 'rifacendo il file le acquisite si vedono');
  S = gate(await ready({ soapOpts: { rowCheck: () => phaseSend ? { cod: '12', des: 'SCHEDINA_CAMPO_NON_CORRETTO', dett: 'rifiutata' } : null } })); p = await prove(S); r = await S.call('al_send', sendBody(p));
  eq([r.body.stato, r.body.schedineValide, keys(S, 'alloggiati:inv:').length], ['rifiutato', 0, 0]); assert(/Nessuna schedina è stata acquisita/.test(r.body.istruzioni[0]));
  S = await ready(); wrap(S.soap, t => t.includes('<SendResponse') ? RIFIUTO('Send', '7', 'ERRORE_PROVA', 'Richiesta non valida') : t); p = await prove(S); r = await S.call('al_send', sendBody(p));
  eq([r.status, r.body.stato, r.body.esitoGenerale.cod, keys(S, 'alloggiati:inv:').length], [200, 'rifiutato', '7', 0], 'rifiuto dell\'intera richiesta'); assert(/codice 7 · ERRORE_PROVA/.test(r.body.dettaglio) && r.body.istruzioni.some(i => /portale/.test(i)), JSON.stringify(r.body.istruzioni));
  S = await ready(); wrap(S.soap, t => t.includes('<SendResponse') ? dropLast(t) : t); p = await prove(S); r = await S.call('al_send', sendBody(p));
  eq([r.body.stato, r.body.righe.map(x => x.esito), keys(S, 'alloggiati:inv:').length], ['parziale', [true, true, true, false], 0], 'risposta incoerente: non si segna nulla come inviato'); assert(/non coerente/.test(r.body.istruzioni[0]) && /portale/.test(r.body.istruzioni[1]));
});
test('E15 archivio e token: KV giù = nessun invio (503) ma la verifica funziona; token non ottenuto all\'invio = niente invio e prova bruciata', async () => {
  let S = await ready(), p = await prove(S); S.kv.failOn = /^alloggiati:prova:/; let r = await S.call('al_send', sendBody(p)); eq([r.status, r.body.stato], [503, 'archivio_non_disponibile']); noSend(S);
  S.kv.failOn = null; S.kv.fail = true; r = await S.call('al_send', sendBody(p)); eq([r.status, r.body.stato], [503, 'archivio_non_disponibile']); noSend(S);
  r = await S.call('al_check', { records: recs('famiglia.txt') }); eq([r.status, r.body.stato], [200, 'test_ok'], 'il Test non dipende dall\'archivio'); S.kv.fail = false;
  S.kv.failOn = /^alloggiati:inv:/; r = await S.call('al_send', sendBody(p)); eq([r.status, r.body.stato], [503, 'archivio_non_disponibile'], 'se non si possono controllare le schedine già inviate non si invia'); noSend(S); S.kv.failOn = null;
  eq((await S.call('al_send', sendBody(p))).body.stato, 'inviato', 'KV tornata: la prova non era stata consumata');
  S = await ready(); p = await prove(S); S.soap.opts.wskey = 'rigenerata'; r = await S.call('al_send', sendBody(p));
  eq([r.status, r.body.stato, r.body.inviato, S.soap.count('Send')], [502, 'wskey_non_valida', false, 0]); assert(/Non è stato inviato nulla/.test(r.body.nota));
  S.soap.opts.wskey = 'KEY-PROVA'; r = await S.call('al_send', sendBody(p)); eq([r.status, r.body.stato], [409, 'prova_gia_usata'], 'dopo un guasto si rifà la verifica'); noSend(S);
  S.soap.opts.wskey = 'KEY-PROVA'; p = await prove(S); eq((await S.call('al_send', sendBody(p))).body.stato, 'inviato');
});
test('E16 schedine già acquisite: ricaricare lo stesso file non le rimanda (7 giorni); altri ospiti non sono toccati; archivio giù non blocca le verifiche', async () => {
  const S = await ready(), p = await prove(S); eq((await S.call('al_send', sendBody(p))).body.stato, 'inviato');
  let r = await S.call('al_parse', { text: fx('famiglia.txt') }); eq([r.body.riepilogo.inviabile, r.body.records.map(x => x.issues.some(i => i.code === 'GIA_INVIATA')), r.body.lines], [false, [true, true, true, true], null]);
  assert(/già acquisita dal servizio il 14\/10\/2026/.test(r.body.records[0].issues.find(i => i.code === 'GIA_INVIATA').msg));
  r = await S.call('al_check', { records: recs('famiglia.txt') }); eq([r.status, r.body.stato, S.soap.count('Test')], [422, 'dati_non_validi', 1], 'nessun nuovo Test per schedine già inviate');
  eq((await S.call('al_validate', { records: recs('gruppo.txt') })).body.riepilogo.inviabile, true);
  r = await S.call('al_validate', { records: [...recs('famiglia.txt'), ...recs('gruppo.txt')] });
  eq([r.body.records.map(x => x.issues.some(i => i.code === 'GIA_INVIATA')), r.body.records.map(x => !!x.nucleoBloccato)], [[true, true, true, true, false, false, false], [true, true, true, true, false, false, false]]);
  S.clock.t += 8 * 86400e3; r = await S.call('al_validate', { records: recs('famiglia.txt') }); eq(r.body.riepilogo.inviabile, true, 'dopo 7 giorni il marcatore scade');
  const K = await ready(); r = await K.call('al_validate', { records: recs('ospite-singolo.txt') }); eq(r.body.riepilogo.inviabile, true); K.kv.fail = true;
  r = await K.call('al_validate', { records: recs('ospite-singolo.txt') }); eq([r.status, r.body.riepilogo.inviabile], [200, true], 'archivio giù: la validazione locale continua');
});
test('E17 nessun dato personale né segreto nei log, neppure negli errori interni', async () => {
  const logs = [], orig = {}; for (const k of ['log', 'info', 'warn', 'error', 'debug']) { orig[k] = console[k]; console[k] = (...a) => logs.push(a.map(String).join(' ')); }
  try {
    const S = await ready(), p = await prove(S); await S.call('al_send', sendBody(p)); await S.call('al_parse', { text: fx('famiglia.txt') });
    const B = setup({ soapOpts: { modo: { Test: 'fault' } } }); await B.call('al_check', { records: recs('famiglia.txt') });
    const X = setup({ envObj: new Proxy({}, { get() { throw new Error('boom'); } }) }), r = await X.call('al_status', {}); eq([r.status, r.body.err], [500, 'Errore interno: nessun dato è stato conservato']);
  } finally { for (const k of Object.keys(orig)) console[k] = orig[k]; }
  const all = logs.join('\n'); for (const s of ['Neri', 'Giulia', 'AB1234567', 'pw-prova', 'KEY-PROVA', 'TOKEN-', 'XX002458']) assert(!all.includes(s), 'nei log: ' + s);
  assert(/adempimenti: al_status boom/.test(all), 'il log dell\'errore interno contiene solo azione e messaggio breve: ' + all.slice(0, 200));
});
test('E18 tempo massimo: se il servizio è lento non si insiste oltre il tempo disponibile (tabelle saltate, chiamata finale tagliata)', async () => {
  let S = setup({ tick: 4000 }); let r = await S.call('al_status', {}); eq([r.body.stato, S.soap.count('Tabella'), Object.values(r.body.tabelle).map(x => x.ok)], ['ok', 0, [false, false, false]]);
  S = setup({ tick: 4000, soapOpts: { delay: 600 } }); r = await S.call('al_check', { records: recs('famiglia.txt') }); eq([r.status, r.body.stato, 'proof' in r.body], [502, 'servizio_non_raggiungibile', false], 'il Test viene interrotto al termine del tempo residuo');
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
