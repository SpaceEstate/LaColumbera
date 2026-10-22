'use strict';
// La Columbera · servizio "Alloggiati Web" FINTO per i test (nessuna rete): risponde con la forma degli esempi del manuale WS rev. 01
// (GenerateToken, Authentication_Test, Test, Send, Tabella). Dati di fantasia. Le regole di controllo delle schedine sono sostituibili (rowCheck).
const WS = require('../../api/_alloggiati_ws.js');

const TABELLE = {
  Luoghi: 'Codice;Descrizione;Provincia;DataFineVal\n100000100;ITALIA;;\n100000248;ESTERIA;;\n100000424;ALTRONIA;;\n100000300;TERZISTAN;;\n400000001;COMUNE DI PROVA;TN;\n400000002;BORGO D\'ESEMPIO;RM;\n400000003;SAN MARTINO ALTO;MI;\n',
  Tipi_Documento: 'Codice;Descrizione\nIDENT;CARTA DI IDENTITA\nPASOR;PASSAPORTO ORDINARIO\nPATEN;PATENTE DI GUIDA\n',
  Tipi_Alloggiato: 'Codice;Descrizione\n16;OSPITE SINGOLO\n17;CAPO FAMIGLIA\n18;CAPO GRUPPO\n19;FAMILIARE\n20;MEMBRO GRUPPO\n',
  TipoErrore: 'Codice;Descrizione\n11;SCHEDINA_FORMATO_NON_CORRETTO\n12;SCHEDINA_CAMPO_NON_CORRETTO\n'
};
const SOAP_ENV = inner => '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body>' + inner + '</soap:Body></soap:Envelope>';
const ESITO = (ok, cod, des, dett) => '<esito>' + ok + '</esito>' + (cod ? '<ErroreCod>' + cod + '</ErroreCod>' : '<ErroreCod/>') + (des ? '<ErroreDes>' + WS.esc(des) + '</ErroreDes>' : '<ErroreDes/>') + (dett ? '<ErroreDettaglio>' + WS.esc(dett) + '</ErroreDettaglio>' : '<ErroreDettaglio/>');
const resp = (status, text) => ({ ok: status >= 200 && status < 300, status, text: async () => text });

// controllo di esempio, come negli esempi del manuale: 11 = dimensione riga errata, 12 = campo non corretto (data di arrivo)
function defaultRowCheck(line) {
  if (line.length !== 168) return { cod: '11', des: 'SCHEDINA_FORMATO_NON_CORRETTO', dett: 'Dimensione Riga errata' };
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(line.slice(2, 12)); const d = m && new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  if (!m || d.getUTCDate() !== +m[1] || d.getUTCMonth() !== +m[2] - 1) return { cod: '12', des: 'SCHEDINA_CAMPO_NON_CORRETTO', dett: 'Data di Arrivo Errata' };
  return null;
}

// opts: { utente, password, wskey, tabelle, rowCheck, delay (ms), modo: { Op: 'timeout'|'abort'|'http500'|'fault'|'html'|'rete' }, tokenScaduto, onCall(rec) }
// 'timeout' aspetta davvero l'interruzione del chiamante (prova del timer); 'abort' simula lo stesso esito senza attendere.
function makeSoapMock(opts) {
  const o = Object.assign({ utente: 'XX002458', password: 'pw-prova', wskey: 'KEY-PROVA', tabelle: TABELLE, rowCheck: defaultRowCheck, delay: 0, modo: {}, tokenScaduto: false }, opts || {});
  const m = { opts: o, calls: [], sent: [], tested: [], n: 0, tokens: new Set() };
  m.fetch = async (url, init) => {
    const body = String(init && init.body || ''), op = (/<all:(\w+)>/.exec(body) || [])[1] || '?';
    const rec = { op, url, ct: init && init.headers && init.headers['Content-Type'] }; m.calls.push(rec);
    if (o.onCall) o.onCall(rec);
    if (o.delay) await new Promise((res, rej) => { const t = setTimeout(res, o.delay); if (init && init.signal) init.signal.addEventListener('abort', () => { clearTimeout(t); const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); });
    const modo = o.modo[op];
    if (modo === 'timeout') await new Promise((res, rej) => { if (init && init.signal) init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); });
    if (modo === 'abort') { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }      // come un timeout, ma subito (i test non aspettano secondi veri)
    if (modo === 'rete') { const e = new Error('fetch failed'); e.cause = { code: 'ENOTFOUND' }; throw e; }
    if (modo === 'http500') return resp(500, 'Internal Server Error');
    if (modo === 'html') return resp(200, '<html><body>Manutenzione in corso</body></html>');
    if (modo === 'fault') return resp(500, SOAP_ENV('<soap:Fault><soap:Code><soap:Value>soap:Receiver</soap:Value></soap:Code><soap:Reason><soap:Text xml:lang="en">Server was unable to process request.</soap:Text></soap:Reason></soap:Fault>'));
    const f = n => { const t = WS.tag(body, n); return t == null ? '' : WS.unesc(t); };
    if (op === 'GenerateToken') {
      rec.utente = f('Utente');
      const okU = f('Utente') === o.utente && f('Password') === o.password, okK = f('WsKey') === o.wskey;
      if (okU && okK) { const tk = 'TOKEN-' + (++m.n); if (!o.tokenScaduto) m.tokens.add(tk); return resp(200, SOAP_ENV('<GenerateTokenResponse xmlns="AlloggiatiService"><GenerateTokenResult><issued>2026-10-16T10:00:00.0000000+02:00</issued><expires>2026-10-16T11:00:00.0000000+02:00</expires><token>' + tk + '</token></GenerateTokenResult><result>' + ESITO('true') + '</result></GenerateTokenResponse>')); }
      return resp(200, SOAP_ENV('<GenerateTokenResponse xmlns="AlloggiatiService"><GenerateTokenResult><issued>0001-01-01T00:00:00</issued><expires>0001-01-01T00:00:00</expires><token/></GenerateTokenResult><result>' + (okU ? ESITO('false', '5', 'WSKEY_NON_VALIDA', 'La chiave WSKEY non è valida') : ESITO('false', '4', 'CREDENZIALI_NON_VALIDE', 'Utente o password non validi')) + '</result></GenerateTokenResponse>'));
    }
    const tokOk = m.tokens.has(f('token'));
    if (op === 'Authentication_Test') return resp(200, SOAP_ENV('<Authentication_TestResponse xmlns="AlloggiatiService"><Authentication_TestResult>' + (tokOk ? ESITO('true') : ESITO('false', '2', 'TOKEN_NON_VALIDO', 'Token scaduto o non valido')) + '</Authentication_TestResult></Authentication_TestResponse>'));
    if (op === 'Tabella') {
      const nome = f('tipo'); if (!tokOk) return resp(200, SOAP_ENV('<TabellaResponse xmlns="AlloggiatiService"><TabellaResult>' + ESITO('false', '2', 'TOKEN_NON_VALIDO') + '</TabellaResult></TabellaResponse>'));
      rec.tabella = nome; const csv = o.tabelle[nome];
      if (csv == null) return resp(200, SOAP_ENV('<TabellaResponse xmlns="AlloggiatiService"><TabellaResult>' + ESITO('false', '9', 'TABELLA_NON_TROVATA') + '</TabellaResult></TabellaResponse>'));
      return resp(200, SOAP_ENV('<TabellaResponse xmlns="AlloggiatiService"><TabellaResult>' + ESITO('true') + '</TabellaResult><CSV>' + WS.esc(csv) + '</CSV></TabellaResponse>'));
    }
    if (op === 'Test' || op === 'Send') {
      if (!tokOk) return resp(200, SOAP_ENV('<' + op + 'Response xmlns="AlloggiatiService"><' + op + 'Result>' + ESITO('false', '2', 'TOKEN_NON_VALIDO', 'Token scaduto o non valido') + '</' + op + 'Result></' + op + 'Response>'));
      const lines = WS.tags(WS.tag(body, 'ElencoSchedine') || '', 'string').map(WS.unesc); rec.n = lines.length; rec.lines = lines;
      const det = lines.map(l => o.rowCheck(l)), valide = det.filter(x => !x).length;
      (op === 'Send' ? m.sent : m.tested).push(...lines.filter((l, i) => !det[i]));
      return resp(200, SOAP_ENV('<' + op + 'Response xmlns="AlloggiatiService"><' + op + 'Result>' + ESITO('true') + '</' + op + 'Result><result><SchedineValide>' + valide + '</SchedineValide><Dettaglio>' +
        det.map(x => '<EsitoOperazioneServizio>' + (x ? ESITO('false', x.cod, x.des, x.dett) : ESITO('true')) + '</EsitoOperazioneServizio>').join('') + '</Dettaglio></result></' + op + 'Response>'));
    }
    return resp(404, 'operazione sconosciuta');
  };
  m.count = op => m.calls.filter(c => c.op === op).length;
  return m;
}
module.exports = { makeSoapMock, TABELLE, defaultRowCheck };
