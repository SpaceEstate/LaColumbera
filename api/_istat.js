'use strict';
// La Columbera · ISTAT Alloggi (Provincia autonoma di Trento) — file di import dei movimenti.
// Fonti: "ISTATalloggi – Registrazione dati tramite file upload e via web service" (v. 30/09/2024) e manuale utente del 30/09/2024.
// Modulo PURO (il prefisso "_" evita che Vercel lo esponga come endpoint): nessuna rete, nessuno stato, nessun dato salvato.
// Lettura del CSV (5 colonne separate da ";", senza intestazione), controlli formali e costruzione del corpo JSON da trasmettere al servizio
// (api/_istat_ws.js). I controlli locali NON sono una garanzia di accettazione: il servizio ha l'ultima parola.
const crypto = require('crypto');
const { isIso, todayRome } = require('./_avail.js');

const MAX_RIGHE = 1000;
const CAMPI = ['cipat', 'arrivo', 'partenza', 'sigla', 'persone'];
const NOMI = { cipat: 'CIPAT', arrivo: 'Data di arrivo', partenza: 'Data di partenza', sigla: 'Provenienza', persone: 'Numero di persone' };

const err = (code, campo, msg, fix) => ({ sev: 'errore', code, campo: campo || null, msg, fix: fix || '' });
const warn = (code, campo, msg, fix) => ({ sev: 'avviso', code, campo: campo || null, msg, fix: fix || '' });
const uniq = a => [...new Set(a)];
const show = c => c === '\r' ? 'CR' : c === '\t' ? 'TAB' : c === '\uFFFD' ? '�' : c.charCodeAt(0) < 32 ? 'ctrl-' + c.charCodeAt(0) : c;

/* ============================ date (AAAAMMGG) ============================ */
const RE_D8 = /^(\d{4})(\d{2})(\d{2})$/;
const d8ToIso = s => { const m = RE_D8.exec(String(s || '')); if (!m) return null; const iso = m[1] + '-' + m[2] + '-' + m[3]; return isIso(iso) ? iso : null; };
const isoToD8 = iso => String(iso || '').replace(/-/g, '');
const fmtIt = d8 => (RE_D8.test(String(d8 || '')) ? d8.slice(6) + '/' + d8.slice(4, 6) + '/' + d8.slice(0, 4) : String(d8 || ''));
// stesso giorno dell'anno dopo (29 febbraio → 1 marzo): "non oltre un anno dall'arrivo" nella lettura meno restrittiva
const plusYear = iso => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() + 1); return d.toISOString().slice(0, 10); };
const nightsBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
// periodo in cui il portale accetta l'arrivo secondo le specifiche: mese corrente e mese precedente (mesi di calendario, fuso di Roma)
function periodo(todayIso) {
  const y = +todayIso.slice(0, 4), m = +todayIso.slice(5, 7), pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y, last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { da: py + '-' + String(pm).padStart(2, '0') + '-01', a: y + '-' + String(m).padStart(2, '0') + '-' + String(last).padStart(2, '0') };
}

/* ============================ tabella delle provenienze ============================ */
// json = contenuto di data/istat-provenienze.json: { stati: [[sigla, descrizione], …], province: [[sigla, descrizione], …] }
function buildProvenienze(json) {
  const map = new Map();
  for (const [tipo, list] of [['stato', json && json.stati], ['provincia', json && json.province]]) {
    for (const e of (Array.isArray(list) ? list : [])) {
      if (!Array.isArray(e) || typeof e[0] !== 'string' || typeof e[1] !== 'string' || !e[0] || map.has(e[0])) continue;
      map.set(e[0], { codice: e[0], nome: e[1], tipo });
    }
  }
  return { ok: map.size > 0, size: map.size, stati: [...map.values()].filter(x => x.tipo === 'stato').length, province: [...map.values()].filter(x => x.tipo === 'provincia').length,
    fonte: (json && json.fonte) || '', acquisita: (json && json.acquisita) || '', get: c => map.get(String(c == null ? '' : c)), list: () => [...map.values()] };
}
const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
// ricerca per sigla o per nome (menu con ricerca del modulo manuale)
function searchProvenienze(table, q, limit) {
  const k = norm(q);
  if (!table || !table.ok || k.length < 2) return [];
  const hits = [];
  for (const e of table.list()) {
    const n = norm(e.nome), c = norm(e.codice);
    const score = c === k ? 0 : n === k ? 1 : n.startsWith(k) ? 2 : c.startsWith(k) ? 3 : n.includes(' ' + k) ? 4 : n.includes(k) ? 5 : 9;
    if (score < 9) hits.push([score, n.length, e]);
  }
  return hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, limit || 25).map(h => ({ codice: h[2].codice, nome: h[2].nome, tipo: h[2].tipo }));
}

/* ============================ lettura del CSV ============================ */
// Legge il contenuto di un CSV. Accetta LF, CRLF e l'assenza del terminatore finale; NON modifica il contenuto (tranne gli spazi ai bordi dei campi, segnalati).
// Ritorna { rows, issues }: ogni riga ha `riga` (numero nel file) e `_s` (problemi di struttura).
function parseText(text) {
  const out = { rows: [], issues: [] };
  if (typeof text !== 'string') { out.issues.push(err('FILE', null, 'Contenuto del file non leggibile')); return out; }
  let t = text;
  if (t.charCodeAt(0) === 0xFEFF) { t = t.slice(1); out.issues.push(warn('BOM', null, 'Il file inizia con un BOM (marcatore UTF-8): ignorato nella lettura')); }
  const lines = t.split(/\r\n|\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();           // terminatore dopo l'ultima riga: ammesso
  if (!lines.length) { out.issues.push(err('FILE_VUOTO', null, 'Il file non contiene movimenti', 'Carica un file con almeno una riga')); return out; }
  if (lines.length > MAX_RIGHE) { out.issues.push(err('TROPPE_RIGHE', null, 'Il file ha ' + lines.length + ' righe: il massimo gestito è ' + MAX_RIGHE, 'Dividi il file')); return out; }
  lines.forEach((line, i) => {
    const s = [], row = { riga: i + 1 };
    const ctrl = Array.from(line).filter(c => /[\u0000-\u001f\u007f\uFFFD"]/.test(c));
    if (ctrl.length) s.push(err('CARATTERE', null, 'Carattere non ammesso (' + uniq(ctrl.map(c => c === '"' ? 'virgolette' : show(c))).join(', ') + ')',
      ctrl.indexOf('\uFFFD') >= 0 ? 'Il file non è in ASCII/UTF-8: salvalo di nuovo senza caratteri speciali' : 'Il file non deve avere virgolette né caratteri di controllo (un CR isolato o un TAB non fa parte del tracciato)'));
    let cols = line.split(';');
    if (cols.length === 4 && /^\d{8}$/.test(cols[0].trim())) cols = [''].concat(cols);                    // manca il CIPAT: le altre colonne restano al loro posto
    if (cols.length !== 5) {
      const alt = line.indexOf(';') < 0 && line.split(',').length === 5 ? 'virgole' : line.indexOf(';') < 0 && line.split('\t').length === 5 ? 'tabulazioni' : '';
      s.push(err('COLONNE', null, 'La riga ha ' + cols.length + (cols.length === 1 ? ' colonna' : ' colonne') + ' invece di 5', alt ? 'Le colonne sono separate da ' + alt + ': il separatore deve essere il punto e virgola (;)' : 'Formato: CIPAT;AAAAMMGG arrivo;AAAAMMGG partenza;sigla provenienza;numero persone'));
      row.approssimato = true;                                                                              // i campi sono ricostruiti per posizione: vanno controllati uno per uno
    } else if (line.split(';').length === 4) { s.push(err('COLONNE', null, 'La riga ha 4 colonne invece di 5: manca il CIPAT', 'Scrivi il CIPAT nella prima colonna (puoi farlo con «Modifica»)')); row.approssimato = true; }
    if (/^\s*cipat\s*;|arriv|partenz/i.test(line) && !/\d{8}/.test(line)) s.push(err('INTESTAZIONE', null, 'La riga sembra un\'intestazione: il file non deve averne', 'Elimina questa riga'));
    let spazi = false;
    CAMPI.forEach((k, j) => { const raw = cols[j] == null ? '' : cols[j]; row[k] = raw.trim(); if (raw !== raw.trim()) spazi = true; });
    if (spazi) s.push(warn('SPAZI', null, 'Spazi all\'inizio o alla fine di un campo', 'Vengono tolti nel file scaricato'));
    row._s = s; out.rows.push(row);
  });
  return out;
}
const normRow = r => ({ cipat: String(r.cipat == null ? '' : r.cipat).trim(), arrivo: String(r.arrivo == null ? '' : r.arrivo).trim(), partenza: String(r.partenza == null ? '' : r.partenza).trim(),
  sigla: String(r.sigla == null ? '' : r.sigla).trim(), persone: /^\d+$/.test(String(r.persone == null ? '' : r.persone).trim()) ? String(parseInt(String(r.persone).trim(), 10)) : String(r.persone == null ? '' : r.persone).trim() });
const lineOf = r => { const n = normRow(r); return [n.cipat, n.arrivo, n.partenza, n.sigla, n.persone].join(';'); };
const hashCsv = csv => crypto.createHash('sha256').update(csv, 'utf8').digest('hex');
// Corpo della richiesta al servizio, come negli esempi JSON del PDF: tutti i valori sono stringhe
const toServiceBody = rows => rows.map(r => { const n = normRow(r); return { CIPAT: n.cipat, dataArrivo: n.arrivo, dataPartenza: n.partenza, siglaProvenienza: n.sigla, nrPersone: n.persone }; });
const hashBody = body => crypto.createHash('sha256').update(JSON.stringify(body), 'utf8').digest('hex');
// impronta di un movimento e numero d'ordine tra i movimenti identici dell'elenco (più prenotazioni uguali sono possibili: si contano)
const fingerprint = r => crypto.createHash('sha256').update(lineOf(r), 'utf8').digest('hex').slice(0, 32);
function fingerprints(rows) { const seen = {}; return rows.map(r => { const fp = fingerprint(r); const occ = seen[fp] || 0; seen[fp] = occ + 1; return { fp, occ }; }); }
const emptyRow = cipat => ({ cipat: cipat || '', arrivo: '', partenza: '', sigla: '', persone: '' });

/* ============================ controlli ============================ */
// ctx = { now (ms), provenienze (buildProvenienze), cipat (quello configurato, facoltativo), extra (problemi già emersi nella lettura) }
function checkRow(r, ctx, today, per) {
  const iss = [], n = normRow(r), P = ctx.provenienze;
  // CIPAT
  if (!n.cipat) iss.push(err('OBBLIGATORIO', 'cipat', 'CIPAT mancante', 'Il codice a 16 caratteri dell\'alloggio, es. 022001-AT-012345'));
  else {
    if (Array.from(n.cipat).length !== 16) iss.push(err('FORMATO', 'cipat', 'Il CIPAT deve avere 16 caratteri (questo ne ha ' + Array.from(n.cipat).length + ')', 'Es. 022001-AT-012345'));
    else if (!/^[A-Za-z0-9-]{16}$/.test(n.cipat)) iss.push(err('FORMATO', 'cipat', 'Il CIPAT contiene caratteri non ammessi', 'Solo lettere, cifre e trattini'));
    else if (!/^\d{6}-AT-\d{6}$/.test(n.cipat)) iss.push(warn('CIPAT_FORMA', 'cipat', 'Il CIPAT non ha la forma consueta NNNNNN-AT-NNNNNN', 'Controlla di averlo scritto giusto'));
    if (ctx.cipat && n.cipat !== ctx.cipat) iss.push(err('CIPAT_DIVERSO', 'cipat', 'Il CIPAT è diverso da quello della struttura (' + ctx.cipat + ')', 'Torre e Corte sono un\'unica struttura: tutte le righe devono avere il CIPAT configurato'));
  }
  // date
  const a = d8ToIso(n.arrivo), p = d8ToIso(n.partenza);
  for (const [k, v, iso] of [['arrivo', n.arrivo, a], ['partenza', n.partenza, p]]) {
    if (!v) iss.push(err('OBBLIGATORIO', k, NOMI[k] + ' mancante', 'Formato AAAAMMGG, es. 20261008'));
    else if (!iso) iss.push(err('FORMATO', k, NOMI[k] + ' non valida («' + v + '»)', 'Formato AAAAMMGG (8 cifre), con giorno e mese esistenti'));
  }
  if (a && p) {
    if (a >= p) iss.push(err('PARTENZA_NON_DOPO', 'partenza', 'La partenza (' + fmtIt(n.partenza) + ') deve essere dopo l\'arrivo (' + fmtIt(n.arrivo) + ')', 'Controlla le due date'));
    else if (p > plusYear(a)) iss.push(err('PARTENZA_OLTRE_ANNO', 'partenza', 'La partenza è oltre un anno dall\'arrivo: il portale non la accetta', 'Controlla la data di partenza'));
  }
  if (a && (a < per.da || a > per.a)) iss.push(warn('ARRIVO_FUORI_PERIODO', 'arrivo', 'L\'arrivo (' + fmtIt(n.arrivo) + ') è fuori dal periodo che il portale accetta (mese corrente e mese precedente: dal ' + fmtIt(isoToD8(per.da)) + ' al ' + fmtIt(isoToD8(per.a)) + ')',
    'Il portale potrebbe scartare il movimento (il manuale utente parla di arrivi fino a un mese prima di oggi: controlla sul portale)'));
  // provenienza
  if (!n.sigla) iss.push(err('OBBLIGATORIO', 'sigla', 'Provenienza mancante', 'Sigla della provincia (es. PG) o dello stato estero (es. DEU)'));
  else if (Array.from(n.sigla).length > 3) iss.push(err('FORMATO', 'sigla', 'La sigla di provenienza ha al massimo 3 caratteri («' + n.sigla + '»)', 'Usa la sigla dell\'elenco ufficiale (es. PG, DEU)'));
  else if (P && P.ok) {
    if (!P.get(n.sigla)) { const up = P.get(n.sigla.toUpperCase()); iss.push(err('SIGLA_NON_IN_TABELLA', 'sigla', 'La sigla «' + n.sigla + '» non è nell\'elenco ufficiale delle provenienze', up ? 'Forse intendevi ' + up.codice + ' (' + up.nome + '): le sigle sono in maiuscolo' : 'Cercala per nome nell\'elenco (province italiane e stati esteri)')); }
  }
  // persone
  if (!n.persone) iss.push(err('OBBLIGATORIO', 'persone', 'Numero di persone mancante', 'Da 1 a 99'));
  else if (!/^\d+$/.test(n.persone)) iss.push(err('FORMATO', 'persone', 'Numero di persone non valido («' + n.persone + '»)', 'Un numero intero da 1 a 99'));
  else if (+n.persone < 1 || +n.persone > 99) iss.push(err('PERSONE_INTERVALLO', 'persone', 'Numero di persone fuori intervallo (' + n.persone + ')', 'Da 1 a 99'));
  return iss;
}
function validateRows(rows, ctx) {
  ctx = ctx || {}; const now = ctx.now != null ? ctx.now : Date.now(), today = todayRome(now), per = periodo(today), P = ctx.provenienze;
  const globali = (ctx.extra || []).slice();
  if (!P || !P.ok) globali.push(err('TABELLA', null, 'Elenco ufficiale delle provenienze non disponibile: le sigle non si possono verificare', 'Manca il file data/istat-provenienze.json: l\'invio resta bloccato'));
  if (!String(ctx.cipat || '').trim()) globali.push(err('CIPAT_NON_CONFIGURATO', null, 'Il CIPAT della struttura non è configurato', 'Imposta la variabile ISTAT_CIPAT su Vercel e rifai il deploy: senza non si può controllare che le righe siano della struttura'));
  else if (!/^[A-Za-z0-9-]{16}$/.test(String(ctx.cipat).trim())) globali.push(err('CIPAT_CONFIG', null, 'Il CIPAT configurato non è valido (servono 16 caratteri tra lettere, cifre e trattini)', 'Correggi la variabile ISTAT_CIPAT su Vercel'));
  const list = (rows || []).slice(0, MAX_RIGHE + 1).map((r, idx) => {
    const x = Object.assign({}, r); delete x.issues; delete x.ok;
    x.idx = idx; x.issues = (r._s || []).slice(); x.issues.push(...checkRow(r, ctx, today, per));
    // ctx.inviati = { indice: true } dei movimenti che il servizio ha già acquisito (marcatori tenuti dal server): non si trasmettono due volte
    if (ctx.inviati && ctx.inviati[idx]) x.issues.push(err('GIA_INVIATO', null, 'Movimento già acquisito dal servizio in un invio precedente', 'Non va trasmesso di nuovo: eliminalo dall\'elenco'));
    return x;
  });
  if (!list.length && !globali.some(g => g.sev === 'errore')) globali.push(err('FILE_VUOTO', null, 'Nessun movimento da controllare', 'Aggiungi almeno un movimento'));
  if (list.length > MAX_RIGHE) globali.push(err('TROPPE_RIGHE', null, 'Troppe righe: il massimo gestito è ' + MAX_RIGHE, 'Dividi l\'elenco'));
  // duplicati identici: il portale li scarta ("già presenti")
  const seen = new Map();
  list.forEach((r, i) => { const l = lineOf(r); if (seen.has(l)) r.issues.push(warn('DUPLICATO', null, 'Movimento identico alla riga ' + (list[seen.get(l)].riga || seen.get(l) + 1), 'Se è un\'altra prenotazione uguale va bene; altrimenti il servizio potrebbe scartarlo come già presente: controlla di non averlo inserito due volte')); else seen.set(l, i); });
  list.forEach(r => {
    r.errori = r.issues.filter(i => i.sev === 'errore').length; r.avvisi = r.issues.filter(i => i.sev === 'avviso').length; r.ok = r.errori === 0;
    const n = normRow(r), a = d8ToIso(n.arrivo), p = d8ToIso(n.partenza), e = P && P.ok ? P.get(n.sigla) : null;
    r.notti = a && p && p > a ? nightsBetween(a, p) : null; r.dec = { sigla: e ? e.nome : null, tipo: e ? e.tipo : null };
  });
  const errori = list.reduce((s, r) => s + r.errori, 0) + globali.filter(g => g.sev === 'errore').length, avvisi = list.reduce((s, r) => s + r.avvisi, 0) + globali.filter(g => g.sev === 'avviso').length;
  const arrivi = list.map(r => normRow(r).arrivo).filter(x => d8ToIso(x)).sort(), pairs = {}; list.forEach(r => { const k = normRow(r).cipat + '|' + normRow(r).arrivo; pairs[k] = (pairs[k] || 0) + 1; });
  const inviabile = errori === 0 && list.length > 0, body = inviabile ? toServiceBody(list) : null;
  return { rows: list, globali,
    riepilogo: { totale: list.length, validi: list.filter(r => r.ok).length, conErrori: list.filter(r => !r.ok).length, errori, avvisi, persone: list.reduce((s, r) => s + (r.ok ? +normRow(r).persone : 0), 0),
      primoArrivo: arrivi[0] || '', ultimoArrivo: arrivi[arrivi.length - 1] || '', coppieRipetute: Object.keys(pairs).filter(k => pairs[k] > 1).length, inviabile },
    body, hash: body ? hashBody(body) : null, periodo: per };
}

module.exports = { MAX_RIGHE, CAMPI, NOMI, parseText, validateRows, lineOf, normRow, hashCsv, hashBody, toServiceBody, fingerprint, fingerprints, emptyRow, buildProvenienze, searchProvenienze, periodo, fmtIt, d8ToIso, isoToD8 };
