'use strict';
// La Columbera · Alloggiati Web — tracciato "Servizi Alloggiati" (manuale WS rev. 01 del 24/01/2022, tabella 1: 168 caratteri per schedina).
// Modulo PURO (il prefisso "_" evita che Vercel lo esponga come endpoint): nessuna rete, nessuno stato, nessun dato personale salvato.
// Lettura del TXT, costruzione della riga, controlli formali (livelli 1 e 2 della specifica) e raggruppamento in nuclei/gruppi.
// I controlli locali NON sono una garanzia di accettazione: il verdetto spetta sempre al servizio ufficiale (Test).
const crypto = require('crypto');
const { isIso, todayRome } = require('./_avail.js');

const RECORD_LEN = 168;
// campo, da (incluso), a (escluso): posizioni da 0 come nel manuale (es. Cognome "14-63" = 14..63 inclusi = 50 caratteri)
const LAYOUT = [['tipo', 0, 2], ['arrivo', 2, 12], ['giorni', 12, 14], ['cognome', 14, 64], ['nome', 64, 94], ['sesso', 94, 95], ['nascita', 95, 105],
  ['comune', 105, 114], ['prov', 114, 116], ['stato', 116, 125], ['cittad', 125, 134], ['tipodoc', 134, 139], ['numdoc', 139, 159], ['luogo', 159, 168]]
  .map(([k, a, b]) => ({ k, a, b, len: b - a }));
if (LAYOUT[LAYOUT.length - 1].b !== RECORD_LEN) throw new Error('tracciato Alloggiati incoerente');
const NOMI = { tipo: 'Tipo alloggiato', arrivo: 'Data di arrivo', giorni: 'Giorni di permanenza', cognome: 'Cognome', nome: 'Nome', sesso: 'Sesso', nascita: 'Data di nascita',
  comune: 'Comune di nascita', prov: 'Provincia di nascita', stato: 'Stato di nascita', cittad: 'Cittadinanza', tipodoc: 'Tipo documento', numdoc: 'Numero documento', luogo: 'Luogo di rilascio del documento' };
const TIPI_VALIDI = ['16', '17', '18', '19', '20'];     // 16 ospite singolo · 17 capo famiglia · 18 capo gruppo · 19 familiare · 20 membro gruppo
const MEMBRO_DI = { 17: '19', 18: '20' };               // capo → tipo dei suoi componenti
const MAX_RECORD = 200;
const TESTO = new Set(['cognome', 'nome', 'tipodoc', 'numdoc']);      // campi a testo: si tolgono solo gli spazi di riempimento a destra

const err = (code, campo, msg, fix) => ({ sev: 'errore', code, campo: campo || null, msg, fix: fix || '' });
const warn = (code, campo, msg, fix) => ({ sev: 'avviso', code, campo: campo || null, msg, fix: fix || '' });
const uniq = a => [...new Set(a)];
const show = c => c === '\r' ? 'CR' : c === '\t' ? 'TAB' : c === '\uFFFD' ? '�' : c.charCodeAt(0) < 32 ? 'ctrl-' + c.charCodeAt(0) : c;

/* ============================ date ============================ */
const RE_DATA = /^(\d{2})\/(\d{2})\/(\d{4})$/;
function parseIt(s) { const m = RE_DATA.exec(s || ''); if (!m) return null; const iso = m[3] + '-' + m[2] + '-' + m[1]; return isIso(iso) ? iso : null; }
const fmtIt = iso => (iso && /^\d{4}-\d\d-\d\d$/.test(iso)) ? iso.slice(8) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
function addDaysIso(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
// partenza = arrivo + giorni di permanenza: è un dato CALCOLATO, non è nella schedina
const partenza = (arrivo, giorni) => { const a = parseIt(arrivo), g = /^\d{1,2}$/.test(String(giorni || '').trim()) ? +String(giorni).trim() : null; return a && g !== null ? fmtIt(addDaysIso(a, g)) : ''; };

/* ============================ traslitterazione (proposta, mai automatica) ============================ */
const SPECIALI = { 'ß': 'ss', 'æ': 'ae', 'Æ': 'AE', 'œ': 'oe', 'Œ': 'OE', 'ø': 'o', 'Ø': 'O', 'đ': 'd', 'Đ': 'D', 'ð': 'd', 'Ð': 'D', 'þ': 'th', 'Þ': 'TH', 'ł': 'l', 'Ł': 'L', 'ı': 'i', 'ħ': 'h', 'Ħ': 'H',
  '\u2019': "'", '\u2018': "'", '\u02BC': "'", '`': "'", '\u00B4': "'" };
// ā → a, ž → z, ß → ss, ’ → ' ... Ciò che non si sa traslitterare resta com'è e viene segnalato in `residuo`.
function translit(s) {
  let value = '', residuo = [];
  for (const ch of String(s == null ? '' : s).normalize('NFC')) {
    if (ch.charCodeAt(0) < 128) { value += ch; continue; }
    if (SPECIALI[ch] !== undefined) { value += SPECIALI[ch]; continue; }
    const base = ch.normalize('NFD').replace(/\p{M}/gu, '');
    if (base && /^[\x20-\x7e]+$/.test(base)) value += base; else { value += ch; residuo.push(ch); }
  }
  return { value, changed: value !== String(s == null ? '' : s), residuo: uniq(residuo) };
}

/* ============================ lettura / scrittura della riga ============================ */
const clean = (k, raw) => TESTO.has(k) ? raw.replace(/\s+$/, '') : (raw.trim() === '' ? '' : raw);
// Legge il contenuto di un TXT. Accetta LF, CRLF e l'assenza del terminatore finale; NON modifica nulla del contenuto.
// Ritorna { records, issues }: ogni record ha `riga` (numero di riga nel file) e `_s` (problemi di struttura, livello 1).
function parseText(text) {
  const out = { records: [], issues: [] };
  if (typeof text !== 'string') { out.issues.push(err('FILE', null, 'Contenuto del file non leggibile')); return out; }
  let t = text;
  if (t.charCodeAt(0) === 0xFEFF) { t = t.slice(1); out.issues.push(warn('BOM', null, 'Il file inizia con un BOM (marcatore UTF-8): ignorato nella lettura')); }
  const lines = t.split(/\r\n|\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();           // terminatore dopo l'ultima riga: ammesso
  if (!lines.length) { out.issues.push(err('FILE_VUOTO', null, 'Il file non contiene schedine', 'Carica un file con almeno una riga di ' + RECORD_LEN + ' caratteri')); return out; }
  if (lines.length > MAX_RECORD) { out.issues.push(err('TROPPE_RIGHE', null, 'Il file ha ' + lines.length + ' righe: il massimo gestito è ' + MAX_RECORD, 'Dividi il file')); return out; }
  lines.forEach((line, i) => {
    const chars = Array.from(line), n = chars.length, s = [], rec = { riga: i + 1 };
    const ctrl = []; chars.forEach((c, p) => { if (/[\u0000-\u001f\u007f\uFFFD]/.test(c)) ctrl.push([c, p]); });
    if (ctrl.length) s.push(err('CARATTERE', null, 'Carattere non ammesso (' + uniq(ctrl.map(x => show(x[0]))).join(', ') + ') alla posizione ' + ctrl.slice(0, 3).map(x => x[1]).join(', ') + (ctrl.length > 3 ? '…' : ''),
      ctrl.some(x => x[0] === '\uFFFD') ? 'Il file non è in ASCII/UTF-8: salvalo di nuovo senza caratteri speciali' : 'Togli i caratteri di controllo (un CR isolato o un TAB non fa parte del tracciato)'));
    if (n !== RECORD_LEN) {
      s.push(err('LUNGHEZZA', null, n === 0 ? 'Riga vuota' : 'La riga ha ' + n + ' caratteri invece di ' + RECORD_LEN, 'I campi hanno posizioni fisse: controlla che nessun campo sia stato accorciato, allungato o spostato. Puoi correggere i campi a mano qui sotto'));
      rec.approssimato = true;                                                       // i campi sono ricostruiti per posizione: vanno controllati uno per uno
    }
    const padded = chars.concat(Array(Math.max(0, RECORD_LEN - n)).fill(' ')).slice(0, RECORD_LEN);
    for (const f of LAYOUT) rec[f.k] = clean(f.k, padded.slice(f.a, f.b).join(''));
    rec._s = s; out.records.push(rec);
  });
  return out;
}
// Costruisce la riga da 168 caratteri (campi a destra con spazi, "giorni" con zero iniziale). overflow = campi troppo lunghi (troncati: la validazione li segnala).
function recordToLine(r) {
  let line = '', overflow = [];
  for (const f of LAYOUT) {
    let v = r[f.k] == null ? '' : String(r[f.k]);
    if (f.k === 'giorni' && /^\d$/.test(v.trim())) v = '0' + v.trim();
    let c = Array.from(v); if (c.length > f.len) { overflow.push(f.k); c = c.slice(0, f.len); }
    line += c.join('') + ' '.repeat(f.len - c.length);
  }
  return { line, overflow };
}
function linesOf(records) {
  const out = [];
  for (const r of records) { const x = recordToLine(r); if (x.overflow.length || Array.from(x.line).length !== RECORD_LEN) return null; out.push(x.line); }
  return out;
}
const hashLines = lines => crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
const emptyRecord = (tipo, arrivo) => ({ tipo: tipo || '16', arrivo: arrivo || '', giorni: '', cognome: '', nome: '', sesso: '', nascita: '', comune: '', prov: '', stato: '', cittad: '', tipodoc: '', numdoc: '', luogo: '' });

/* ============================ controlli formali (livelli 1 e 2) ============================ */
// ctx = { now (ms), tables: { luoghi, documenti, tipi } | null }. Ogni tabella espone get(codice) → { codice, nome, prov?, kind? } e (luoghi) italia = codice dell'Italia.
function checkTesto(campo, v, max, iss) {
  if (!v.trim()) { iss.push(err('OBBLIGATORIO', campo, NOMI[campo] + ' mancante', 'Compila il campo')); return; }
  if (/^\s/.test(v)) iss.push(warn('SPAZIO_INIZIALE', campo, NOMI[campo] + ' inizia con uno spazio: possibile campo spostato', 'Controlla la posizione del campo'));
  const chars = Array.from(v);
  if (chars.length > max) iss.push(err('LUNGHEZZA_CAMPO', campo, NOMI[campo] + ' troppo lungo (' + chars.length + ' caratteri, massimo ' + max + ')', 'Accorcia il campo'));
  const bad = chars.filter(c => !/[\p{L}' ]/u.test(c));
  if (bad.length) iss.push(err('CARATTERE', campo, NOMI[campo] + ': caratteri non ammessi (' + uniq(bad).map(show).join(' ') + ')',
    bad.some(c => /[\u2018\u2019\u02BC\u00B4`]/.test(c)) ? "Sono ammesse solo lettere e apostrofo ASCII ('): sostituisci l'apostrofo tipografico" : 'Sono ammesse solo lettere e apostrofo'));
  const na = chars.filter(c => c.charCodeAt(0) > 126 && /\p{L}/u.test(c));
  if (na.length) iss.push(warn('NON_ASCII', campo, NOMI[campo] + ' contiene lettere non ASCII (' + uniq(na).join(' ') + '): il servizio potrebbe rifiutarle', 'Proposta di traslitterazione: «' + translit(v).value + '» (da confermare a mano)'));
}
function checkRecord(r, ctx, today) {
  const iss = [], T = ctx.tables || {};
  const tipo = String(r.tipo || '').trim();
  if (!TIPI_VALIDI.includes(tipo)) iss.push(err('VALORE', 'tipo', 'Tipo alloggiato non valido (ammessi: ' + TIPI_VALIDI.join(', ') + ')', '16 ospite singolo, 17 capo famiglia, 18 capo gruppo, 19 familiare, 20 membro gruppo'));
  else if (T.tipi && !T.tipi.get(tipo)) iss.push(err('CODICE_NON_IN_TABELLA', 'tipo', 'Tipo alloggiato ' + tipo + ' assente dalla tabella ufficiale', 'Usa un codice della tabella Tipi_Alloggiato'));
  // arrivo
  const arrivo = parseIt(r.arrivo);
  if (!String(r.arrivo || '').trim()) iss.push(err('OBBLIGATORIO', 'arrivo', 'Data di arrivo mancante', 'Formato gg/mm/aaaa'));
  else if (!arrivo) iss.push(err('FORMATO', 'arrivo', 'Data di arrivo non valida («' + r.arrivo + '»)', 'Formato gg/mm/aaaa, giorno e mese esistenti'));
  else if (arrivo < '1900-01-01') iss.push(err('VALORE', 'arrivo', 'Data di arrivo troppo remota', 'Controlla l\'anno'));
  else if (arrivo < today) iss.push(warn('ARRIVO_OLTRE_24H', 'arrivo', 'La data di arrivo è di oltre 24 ore fa: la comunicazione va fatta entro 24 ore dall\'arrivo', 'Non blocca l\'invio: comunicala il prima possibile'));
  // giorni
  const g = String(r.giorni == null ? '' : r.giorni).trim();
  if (!g) iss.push(err('OBBLIGATORIO', 'giorni', 'Giorni di permanenza mancanti', 'Da 1 a 30'));
  else if (!/^\d{1,2}$/.test(g) || (r.giorni !== g && !/^\d$/.test(r.giorni))) iss.push(err('FORMATO', 'giorni', 'Giorni di permanenza non validi («' + r.giorni + '»)', 'Due cifre, es. 03'));
  else if (+g > 30) iss.push(err('VALORE', 'giorni', 'Permanenza di ' + +g + ' giorni: il massimo è 30', 'Per soggiorni più lunghi comunica nuovamente dopo 30 giorni, come previsto dal servizio'));
  else if (+g === 0) iss.push(warn('GIORNI_ZERO', 'giorni', 'Permanenza di 0 giorni: il servizio potrebbe rifiutarla', 'Il Test dirà se è ammessa'));
  // nome e cognome
  checkTesto('cognome', r.cognome == null ? '' : String(r.cognome), 50, iss);
  checkTesto('nome', r.nome == null ? '' : String(r.nome), 30, iss);
  // sesso
  const sesso = String(r.sesso == null ? '' : r.sesso).trim();
  if (!sesso) iss.push(err('OBBLIGATORIO', 'sesso', 'Sesso mancante', '1 = M, 2 = F'));
  else if (sesso !== '1' && sesso !== '2') iss.push(err('VALORE', 'sesso', 'Sesso non valido («' + r.sesso + '»)', '1 = M, 2 = F'));
  // data di nascita
  const nasc = parseIt(r.nascita);
  if (!String(r.nascita || '').trim()) iss.push(err('OBBLIGATORIO', 'nascita', 'Data di nascita mancante', 'Formato gg/mm/aaaa'));
  else if (!nasc) iss.push(err('FORMATO', 'nascita', 'Data di nascita non valida («' + r.nascita + '»)', 'Formato gg/mm/aaaa, giorno e mese esistenti'));
  else if (nasc > today) iss.push(err('VALORE', 'nascita', 'Data di nascita nel futuro', 'Controlla la data'));
  else if (nasc < '1900-01-01') iss.push(err('VALORE', 'nascita', 'Data di nascita anteriore al 1900', 'Controlla l\'anno'));
  else if (arrivo && nasc > arrivo) iss.push(err('VALORE', 'nascita', 'La data di nascita è successiva all\'arrivo', 'Controlla le due date'));
  // luoghi: stato di nascita, cittadinanza, comune e provincia
  const code9 = (campo, v, kinds) => {
    const x = String(v == null ? '' : v);
    if (!x.trim()) { iss.push(err('OBBLIGATORIO', campo, NOMI[campo] + ' mancante', 'Scegli dalla tabella ufficiale')); return null; }
    if (!/^\d{9}$/.test(x)) { iss.push(err('FORMATO', campo, NOMI[campo] + ' non valido («' + x.trim() + '»): servono 9 cifre', 'Usa il codice della tabella Luoghi')); return null; }
    if (T.luoghi) {
      const e = T.luoghi.get(x);
      if (!e) iss.push(err('CODICE_NON_IN_TABELLA', campo, NOMI[campo] + ': il codice ' + x + ' non è nella tabella Luoghi', 'Cercalo per nome nell\'elenco'));
      else if (kinds && e.kind && !kinds.includes(e.kind)) iss.push(err('CODICE_TIPO', campo, NOMI[campo] + ': il codice ' + x + ' (' + e.nome + ') non è ' + (kinds[0] === 'stato' ? 'uno stato' : 'un comune'), 'Scegli ' + (kinds[0] === 'stato' ? 'uno stato' : 'un comune') + ' dall\'elenco'));
    }
    return x;
  };
  const stato = code9('stato', r.stato, ['stato']);
  code9('cittad', r.cittad, ['stato']);
  const comune = String(r.comune == null ? '' : r.comune), prov = String(r.prov == null ? '' : r.prov);
  const italia = T.luoghi && T.luoghi.italia && stato ? stato === T.luoghi.italia : null;
  if (italia === true) {
    const c = code9('comune', comune, ['comune']);
    if (!prov.trim()) iss.push(err('OBBLIGATORIO', 'prov', 'Provincia di nascita mancante (nato in Italia)', 'Sigla di due lettere (es. RM)'));
    else if (!/^[A-Z]{2}$/.test(prov)) iss.push(err('FORMATO', 'prov', 'Provincia di nascita non valida («' + prov + '»)', 'Sigla automobilistica di due lettere maiuscole (Roma = RM)'));
    else if (c && T.luoghi.get(c) && T.luoghi.get(c).prov && T.luoghi.get(c).prov !== prov) iss.push(warn('PROVINCIA_DISCORDANTE', 'prov', 'La provincia ' + prov + ' non coincide con quella del comune in tabella (' + T.luoghi.get(c).prov + ')', 'Controlla comune e provincia'));
  } else if (italia === false) {
    if (comune.trim()) iss.push(err('ESTERO_COMUNE', 'comune', 'Stato di nascita estero: il comune di nascita va lasciato vuoto', 'Svuota il campo'));
    if (prov.trim()) iss.push(err('ESTERO_PROVINCIA', 'prov', 'Stato di nascita estero: la provincia di nascita va lasciata vuota', 'Svuota il campo'));
  } else {
    if (comune.trim() && !/^\d{9}$/.test(comune)) iss.push(err('FORMATO', 'comune', 'Comune di nascita non valido («' + comune.trim() + '»): servono 9 cifre', 'Usa il codice della tabella Luoghi'));
    if (prov.trim() && !/^[A-Z]{2}$/.test(prov)) iss.push(err('FORMATO', 'prov', 'Provincia di nascita non valida («' + prov + '»)', 'Sigla di due lettere maiuscole'));
  }
  // documento: obbligatorio per 16/17/18, VUOTO per 19/20
  const td = String(r.tipodoc == null ? '' : r.tipodoc), nd = String(r.numdoc == null ? '' : r.numdoc), lr = String(r.luogo == null ? '' : r.luogo);
  if (tipo === '19' || tipo === '20') {
    for (const [k, v] of [['tipodoc', td], ['numdoc', nd], ['luogo', lr]]) if (v.trim()) iss.push(err('DOC_NON_AMMESSO', k, NOMI[k] + ' compilato: per familiari e membri del gruppo il documento va lasciato vuoto', 'Svuota il campo'));
  } else if (TIPI_VALIDI.includes(tipo)) {
    if (!td.trim()) iss.push(err('OBBLIGATORIO', 'tipodoc', 'Tipo documento mancante', 'Scegli dalla tabella Tipi_Documento'));
    else if (/^\s/.test(td) || !/^[A-Za-z0-9]{1,5}$/.test(td)) iss.push(err('FORMATO', 'tipodoc', 'Tipo documento non valido («' + td.trim() + '»)', 'Codice di massimo 5 caratteri della tabella Tipi_Documento'));
    else if (T.documenti && !T.documenti.get(td)) iss.push(err('CODICE_NON_IN_TABELLA', 'tipodoc', 'Tipo documento ' + td + ' assente dalla tabella ufficiale', 'Scegli dall\'elenco'));
    if (!nd.trim()) iss.push(err('OBBLIGATORIO', 'numdoc', 'Numero documento mancante', 'Compila il campo'));
    else {
      if (Array.from(nd).length > 20) iss.push(err('LUNGHEZZA_CAMPO', 'numdoc', 'Numero documento troppo lungo (massimo 20 caratteri)', 'Controlla il numero'));
      if (/^\s/.test(nd)) iss.push(warn('SPAZIO_INIZIALE', 'numdoc', 'Il numero documento inizia con uno spazio: possibile campo spostato', 'Controlla la posizione del campo'));
      const bad = Array.from(nd.trim()).filter(c => !/[A-Za-z0-9./-]/.test(c));
      if (bad.length) iss.push(err('CARATTERE', 'numdoc', 'Numero documento: caratteri non ammessi (' + uniq(bad).map(show).join(' ') + ')', 'Sono ammessi lettere, cifre, punto, trattino e barra'));
    }
    code9('luogo', lr, null);
  }
  return iss;
}

// Valida l'elenco di schedine nell'ordine in cui verrebbero inviate. Ritorna { records, nuclei, globali, riepilogo, lines, hash }.
function validateRecords(records, ctx) {
  ctx = ctx || {}; const now = ctx.now != null ? ctx.now : Date.now(), today = todayRome(now), T = ctx.tables || {};
  const globali = (ctx.extra || []).slice();
  if (!ctx.tables || !T.luoghi || !T.documenti || !T.tipi) globali.push(warn('TABELLE', null, 'Tabelle ufficiali non caricate: codici di stati, comuni, documenti e tipi non verificati e nomi non disponibili', 'Controlla "Stato configurazione": serve per leggere le tabelle dal servizio'));
  const recs = (records || []).slice(0, MAX_RECORD + 1).map((r, idx) => {
    const x = Object.assign({}, r); delete x.issues; delete x.ok;
    x.idx = idx; x.issues = (r._s || []).slice(); x.issues.push(...checkRecord(r, ctx, today));
    // ctx.inviate = { indice: data ISO } delle schedine che il servizio ha già acquisito (marcatori tenuti dal server): non si comunicano due volte
    if (ctx.inviate && ctx.inviate[idx]) x.issues.push(err('GIA_INVIATA', null, 'Schedina già acquisita dal servizio il ' + fmtIt(String(ctx.inviate[idx]).slice(0, 10)), 'Non va comunicata di nuovo: eliminala dall\'elenco'));
    return x;
  });
  if (!recs.length && !globali.some(g => g.sev === 'errore')) globali.push(err('FILE_VUOTO', null, 'Nessuna schedina da controllare', 'Aggiungi almeno un ospite'));      // se la lettura del file ha già spiegato il motivo non si ripete
  if (recs.length > MAX_RECORD) globali.push(err('TROPPE_RIGHE', null, 'Troppe schedine: il massimo gestito è ' + MAX_RECORD, 'Dividi l\'elenco'));
  // nuclei e gruppi: i componenti (19/20) seguono IMMEDIATAMENTE il loro capo (17/18) e hanno la sua stessa data di arrivo; un nuovo 16/17/18 chiude il gruppo precedente
  const nuclei = []; let cur = null;
  recs.forEach((r, i) => {
    const tipo = String(r.tipo || '').trim();
    if (tipo === '17' || tipo === '18') { cur = { id: nuclei.length, tipo: tipo === '17' ? 'famiglia' : 'gruppo', capo: i, membri: [] }; nuclei.push(cur); r.nucleo = cur.id; }
    else if (tipo === '16' || !TIPI_VALIDI.includes(tipo)) { cur = null; nuclei.push({ id: nuclei.length, tipo: 'singolo', capo: i, membri: [] }); r.nucleo = nuclei.length - 1; }
    else {
      const capo = cur ? recs[cur.capo] : null, capoTipo = capo ? String(capo.tipo).trim() : '';
      if (!cur) { r.issues.push(err('NUCLEO_SENZA_CAPO', 'tipo', (tipo === '19' ? 'Familiare' : 'Membro del gruppo') + ' senza ' + (tipo === '19' ? 'capo famiglia' : 'capo gruppo') + ' nella riga immediatamente precedente', 'Il capo (' + (tipo === '19' ? '17' : '18') + ') deve stare subito prima dei suoi componenti')); nuclei.push({ id: nuclei.length, tipo: 'orfano', capo: i, membri: [] }); r.nucleo = nuclei.length - 1; return; }
      r.nucleo = cur.id; cur.membri.push(i);
      if (MEMBRO_DI[capoTipo] !== tipo) r.issues.push(err('NUCLEO_TIPO_DISCORDE', 'tipo', (tipo === '19' ? 'Un familiare (19)' : 'Un membro del gruppo (20)') + ' non può seguire ' + (capoTipo === '17' ? 'un capo famiglia (17)' : 'un capo gruppo (18)'), 'I familiari (19) seguono il capo famiglia (17), i membri (20) il capo gruppo (18)'));
      const nrm = x => String(x || '').normalize('NFD').replace(/\p{M}/gu, '').trim().toUpperCase();
      if (nrm(r.nome) && nrm(r.nome) === nrm(capo.cognome) && nrm(r.cognome) !== nrm(capo.cognome)) r.issues.push(warn('POSSIBILE_INVERSIONE', 'cognome', 'Il nome coincide con il cognome del capo e il cognome è diverso: cognome e nome potrebbero essere invertiti', 'Controlla i due campi (non è un errore formale: il servizio non può accorgersene)'));
      const a1 = parseIt(r.arrivo), a0 = parseIt(capo.arrivo);
      if (a1 && a0 && a1 !== a0) r.issues.push(err('NUCLEO_DATA_ARRIVO', 'arrivo', 'La data di arrivo (' + r.arrivo + ') è diversa da quella del capo (' + capo.arrivo + ')', 'Componenti e capo hanno la stessa data di arrivo'));
    }
  });
  nuclei.forEach(n => { if ((n.tipo === 'famiglia' || n.tipo === 'gruppo') && !n.membri.length) recs[n.capo].issues.push(warn('CAPO_SENZA_MEMBRI', 'tipo', (n.tipo === 'famiglia' ? 'Capo famiglia' : 'Capo gruppo') + ' senza componenti nelle righe successive', 'Se è un ospite singolo usa il tipo 16')); });
  // duplicati
  const lines0 = recs.map(r => recordToLine(r).line), seen = new Map();
  lines0.forEach((l, i) => { if (seen.has(l)) recs[i].issues.push(warn('DUPLICATO', null, 'Schedina identica alla riga ' + (recs[seen.get(l)].riga || seen.get(l) + 1), 'Controlla di non averla inserita due volte')); else seen.set(l, i); });
  // sovra-lunghezza dei campi (solo per schedine create a mano: dal file la riga è già a 168 caratteri)
  recs.forEach(r => { const o = recordToLine(r).overflow; for (const k of o) if (!r.issues.some(i => i.campo === k && i.code === 'LUNGHEZZA_CAMPO')) r.issues.push(err('LUNGHEZZA_CAMPO', k, NOMI[k] + ' troppo lungo (massimo ' + LAYOUT.find(f => f.k === k).len + ' caratteri)', 'Accorcia il campo')); });
  // un nucleo è un'unità: se una schedina ha errori, l'intero nucleo è bloccato
  recs.forEach(r => { r.errori = r.issues.filter(i => i.sev === 'errore').length; r.avvisi = r.issues.filter(i => i.sev === 'avviso').length; r.ok = r.errori === 0; r.partenza = partenza(r.arrivo, r.giorni); });
  nuclei.forEach(n => { const idx = [n.capo, ...n.membri]; n.ok = idx.every(i => recs[i].ok); idx.forEach(i => { recs[i].nucleoBloccato = !n.ok; }); });
  const decod = (tab, c) => { const e = tab && c && tab.get(String(c).trim()); return e ? e.nome : null; };
  recs.forEach(r => { r.dec = { tipo: decod(T.tipi, r.tipo), stato: decod(T.luoghi, r.stato), cittad: decod(T.luoghi, r.cittad), comune: decod(T.luoghi, r.comune), tipodoc: decod(T.documenti, r.tipodoc), luogo: decod(T.luoghi, r.luogo) }; });
  const perTipo = {}; recs.forEach(r => { const k = String(r.tipo || '').trim() || '?'; perTipo[k] = (perTipo[k] || 0) + 1; });
  const errori = recs.reduce((s, r) => s + r.errori, 0) + globali.filter(g => g.sev === 'errore').length, avvisi = recs.reduce((s, r) => s + r.avvisi, 0) + globali.filter(g => g.sev === 'avviso').length;
  const lines = errori === 0 && recs.length ? linesOf(recs) : null;
  return { records: recs, nuclei, globali,
    riepilogo: { totale: recs.length, perTipo, validi: recs.filter(r => r.ok).length, conErrori: recs.filter(r => !r.ok).length, errori, avvisi, inviabile: !!lines },
    lines, hash: lines ? hashLines(lines) : null };
}

module.exports = { RECORD_LEN, LAYOUT, NOMI, TIPI_VALIDI, MAX_RECORD, parseText, recordToLine, linesOf, hashLines, emptyRecord, validateRecords, translit, parseIt, fmtIt, partenza };
