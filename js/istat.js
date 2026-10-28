// La Columbera · Gestione → Adempimenti → ISTAT (Fase 2)
// Flusso: 1 carico il CSV → 2 il sito lo controlla e segnala errori e avvisi → 3 correggo, aggiungo o elimino movimenti nella tabella → 4 riepilogo, conferma esplicita e invio all'ISTAT → esito.
//  - I movimenti restano SOLO nella memoria di questa pagina (bozza temporanea): niente localStorage/sessionStorage, niente cookie, nessun salvataggio; il file caricato non viene modificato.
//  - Ogni controllo e ogni invio sono rifatti dal server (api/istat.js). Credenziali del servizio e conferma firmata non sono modificabili da qui.
//  - Un invio senza risposta chiara è "esito incerto": non si ripete da solo e non si può rifare senza una scelta esplicita.
(function () {
'use strict';
const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CAMPI = ['cipat', 'arrivo', 'partenza', 'sigla', 'persone'];
const NOME = { cipat: 'CIPAT', arrivo: 'Data di arrivo', partenza: 'Data di partenza', sigla: 'Provenienza', persone: 'Numero di persone' };
const FINALI = ['inviato', 'parziale', 'esito_incerto'];       // dopo questi esiti la tabella si blocca: niente modifiche né nuovi invii senza una scelta esplicita
const TITOLI = { variabili_mancanti: 'Mancano variabili d\'ambiente su Vercel', credenziali_non_valide: 'Credenziali non accettate', richiesta_rifiutata: 'Richiesta rifiutata dal servizio', servizio_non_raggiungibile: 'Servizio non raggiungibile o senza risposta',
  errore_servizio: 'Risposta anomala del servizio', send_disattivato: 'Invio reale disattivato', prova_non_valida: 'Conferma scaduta o non valida', dati_cambiati: 'I dati sono cambiati dopo la conferma', prova_gia_usata: 'Conferma già usata',
  invio_in_corso: 'Invio già in corso', archivio_non_disponibile: 'Archivio temporaneamente non disponibile', dati_non_validi: 'Dati non validi', sessione_scaduta: 'Sessione scaduta', errore: 'Richiesta non valida', configurazione_incompleta: 'Configurazione incompleta' };
const INCERTO = { stato: 'esito_incerto', titolo: 'Esito dell\'invio incerto', dettaglio: 'Nessuna risposta valida dal server.', istruzioni: ['Non so se il servizio ha acquisito i movimenti: la risposta non è arrivata o non è interpretabile.',
  'NON inviare di nuovo da qui. Controlla con «Elenco movimenti sul portale» (o sul portale ISTAT) se i movimenti di questo invio risultano caricati.', 'Solo se non risultano, ripeti l\'operazione da capo (controllo, riepilogo e nuovo invio).'] };

const d8h = s => /^\d{8}$/.test(String(s || '')) ? s.slice(6) + '/' + s.slice(4, 6) + '/' + s.slice(0, 4) : '';
const pick = r => { const o = {}; CAMPI.forEach(k => { o[k] = r[k] == null ? '' : String(r[k]); }); if (Number.isInteger(r.riga)) o.riga = r.riga; if (r.approssimato === true) o.approssimato = true; return o; };
const mOk = t => ({ k: 'ok', t }), mWarn = t => ({ k: 'warn', t }), mErr = t => ({ k: 'err', t });
const titolo = b => (b && (b.titolo || TITOLI[b.stato] || b.err)) || 'Operazione non riuscita';
const plur = (n, a, b) => n + ' ' + (n === 1 ? a : b);
const readText = f => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result || '')); fr.onerror = () => rej(new Error('lettura')); fr.readAsText(f, 'utf-8'); });

// ---------- stato (solo in memoria) ----------
const fresh = () => ({ rows: [], view: null, check: null, result: null, list: null, busy: '', stBusy: false, vBusy: false, msg: null, seq: 0, nome: '', confirmed: false, status: null, statusAt: 0, statusOpen: null, timer: 0, vt: 0 });
let ST = fresh(), root = null, ctx = { token: () => '', onUnauthorized: () => {} }, M = null, sending = false;
const locked = () => !!(sending || (ST.result && FINALI.indexOf(ST.result.stato) >= 0));

async function api(a, body) {
  const r = await fetch('api/istat?a=' + a, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: ctx.token() || '' }, body: JSON.stringify(body || {}) });
  let j = null; try { j = await r.json(); } catch (e) { /* non JSON: pagina di errore della piattaforma o risposta troncata */ }
  if (r.status === 401) { ctx.onUnauthorized(); const e = new Error('Sessione scaduta'); e.auth = true; throw e; }
  return { status: r.status, body: j };
}

// ---------- azioni ----------
async function loadStatus(force) {
  if (ST.stBusy || (!force && ST.status && Date.now() - ST.statusAt < 600e3)) return;
  ST.stBusy = true; render();
  try { const r = await api('is_status'); ST.status = r.body && r.body.stato ? r.body : { stato: 'errore_servizio', titolo: 'Risposta del server non valida', fix: 'Riprova tra poco.' }; ST.statusAt = Date.now(); }
  catch (e) { if (!e.auth) ST.status = { stato: 'servizio_non_raggiungibile', titolo: 'Server non raggiungibile', fix: 'Controlla la connessione e riprova.' }; }
  finally { ST.stBusy = false; render(); }
}
// ricontrollo di tutta la tabella dopo ogni modifica: i risultati vecchi (riepilogo, conferma) non valgono più
async function revalidate() {
  const seq = ++ST.seq; clearTimeout(ST.vt);
  if (!ST.rows.length) { ST.view = null; ST.vBusy = false; return render(); }
  ST.vBusy = true; paintFlow();
  try {
    const r = await api('is_validate', { rows: ST.rows });
    if (seq !== ST.seq) return;
    if (r.status === 200 && r.body && Array.isArray(r.body.rows)) ST.view = r.body;
    else { ST.view = null; ST.msg = mErr((r.body && r.body.err) || 'Controllo non riuscito: riprova.'); }
  } catch (e) { if (seq === ST.seq && !e.auth) { ST.view = null; ST.msg = mErr('Non riesco a controllare i dati (connessione?): riprova.'); } }
  finally { if (seq === ST.seq) { ST.vBusy = false; paintView(); } }
}
function invalidate() {      // ogni modifica annulla riepilogo e conferma
  if (ST.check || ST.confirmed || ST.result) { ST.check = null; ST.confirmed = false; ST.result = null; clearTimeout(ST.timer); paintFlow(); }
}
function schedule(ms) { clearTimeout(ST.vt); ST.vt = setTimeout(revalidate, ms); }
async function loadFile(file) {
  if (!file || locked() || ST.busy) return;
  if (file.size > 200e3) { ST.msg = mErr('Il file è troppo grande (massimo 200 KB).'); return render(); }
  if (ST.rows.length && !confirm('Sostituire la tabella attuale con il contenuto del file? Le modifiche non inviate andranno perse.')) return;
  ST.busy = 'parse'; ST.msg = null; clearTimeout(ST.timer); clearTimeout(ST.vt); render();
  const seq = ++ST.seq;
  try {
    const text = await readText(file), r = await api('is_parse', { text });
    if (seq !== ST.seq) return;
    const b = r.body;
    if (r.status === 200 && b && Array.isArray(b.rows)) {
      ST.rows = b.rows.map(pick); ST.view = b; ST.vBusy = false; ST.nome = file.name || ''; ST.check = null; ST.result = null; ST.list = null; ST.confirmed = false;
      ST.msg = ST.rows.length ? mOk('File letto: ' + plur(ST.rows.length, 'movimento', 'movimenti') + '. Le segnalazioni sono qui sotto, sulle righe interessate.') : mErr(((b.globali || []).filter(g => g.sev === 'errore')[0] || {}).msg || 'Il file non contiene movimenti.');
    } else ST.msg = mErr((b && b.err) || 'Non riesco a leggere il file.');
  } catch (e) { if (!e.auth && seq === ST.seq) ST.msg = mErr('Non sono riuscito a leggere il file (connessione?).'); }
  finally { if (seq === ST.seq) { ST.busy = ''; render(); } }
}
function armTimer(ms) {
  clearTimeout(ST.timer);
  ST.timer = setTimeout(() => { if (ST.check && ST.check.proof) { ST.check = null; ST.confirmed = false; ST.msg = mWarn('La conferma è scaduta: rifai il controllo e conferma di nuovo.'); render(); } }, Math.max(1000, Math.min(ms, 2147483000)));
}
// validazione finale e riepilogo: il server rifà tutti i controlli e, senza errori, rilascia la conferma firmata (monouso, valida pochi minuti, solo per questi dati)
async function runCheck() {
  if (ST.busy || ST.vBusy || locked() || !ST.view || !ST.view.riepilogo.inviabile) return;
  ST.busy = 'check'; ST.msg = null; ST.check = null; ST.result = null; ST.confirmed = false; clearTimeout(ST.timer); clearTimeout(ST.vt); render();
  try {
    const r = await api('is_check', { rows: ST.rows }), b = r.body;
    if (!b || typeof b !== 'object') ST.msg = mErr('Risposta del server non valida (HTTP ' + r.status + '): riprova.');
    else if (r.status === 422 && Array.isArray(b.rows)) { ST.view = b; ST.msg = mWarn('Alcuni movimenti non risultano più inviabili (per esempio già acquisiti): correggi e ripeti il controllo.'); }
    else if (b.stato === 'pronto' && b.proof) { const ttl = +b.proofTtlMs > 0 ? +b.proofTtlMs : 20 * 60e3; ST.check = b; ST.check.until = Date.now() + ttl - 5000; armTimer(ttl - 5000); }
    else ST.msg = mErr(b.err || titolo(b));
  } catch (e) { if (!e.auth) ST.msg = mErr('Server non raggiungibile: controlla la connessione. Non è stato trasmesso nulla.'); }
  finally { ST.busy = ''; render(); }
}
// Invio reale. Un solo clic efficace (sending), la conferma si consuma lato server; qualunque risposta non chiara = esito incerto, mai "non inviato".
async function runSend() {
  const c = ST.check;
  if (sending || ST.busy || ST.vBusy || !c || c.stato !== 'pronto' || !c.proof || !ST.confirmed) return;
  if (Date.now() >= (c.until || 0)) { ST.check = null; ST.confirmed = false; ST.msg = mWarn('La conferma è scaduta: rifai il controllo e conferma di nuovo.'); return render(); }
  sending = true; ST.busy = 'send'; ST.msg = null; clearTimeout(ST.timer); render();
  let res;
  try {
    const r = await api('is_send', { rows: ST.rows, proof: c.proof }), b = r.body;
    if (b && typeof b === 'object' && b.stato) res = b;
    else if (b && typeof b === 'object' && r.status >= 400 && r.status < 500) res = { stato: 'errore', err: b.err || 'Richiesta non valida' };      // rifiuto chiaro, prima di qualsiasi invio
    else res = INCERTO;                                          // 5xx, timeout della piattaforma, risposta vuota o non JSON: il servizio potrebbe aver ricevuto i movimenti
  } catch (e) { res = e.auth ? { stato: 'sessione_scaduta', err: 'Sessione scaduta: accedi di nuovo e ripeti il controllo. Non è stato trasmesso nulla.' } : INCERTO; }
  ST.result = res; ST.check = null; ST.confirmed = false; sending = false; ST.busy = '';
  if (res.stato === 'dati_non_validi' && Array.isArray(res.rows)) ST.view = res;
  render();
}
// verifica sul portale: elenco dei movimenti caricati (sola lettura). Il formato della risposta non è documentato: si mostra com'è.
async function runList() {
  if (ST.busy === 'list') return; const prev = ST.busy; ST.busy = 'list'; ST.list = null; render();
  try { const r = await api('is_list'); ST.list = r.body && typeof r.body === 'object' ? r.body : { stato: 'errore_servizio', titolo: 'Risposta del server non valida', dettaglio: 'HTTP ' + r.status }; }
  catch (e) { if (!e.auth) ST.list = { stato: 'servizio_non_raggiungibile', titolo: 'Server non raggiungibile', dettaglio: '' }; }
  finally { ST.busy = prev === 'list' ? '' : prev; render(); }
}
function resetAll() {
  clearTimeout(ST.timer); clearTimeout(ST.vt); ST.seq++;
  const k = { status: ST.status, statusAt: ST.statusAt, statusOpen: ST.statusOpen };
  ST = Object.assign(fresh(), k); closeSearch(); render();
}
const newRow = () => ({ cipat: (ST.status && ST.status.cipat) || '', arrivo: '', partenza: '', sigla: '', persone: '' });
const ACT = {
  status: () => loadStatus(true), list: () => runList(),
  add: () => {
    if (locked()) return; ST.rows.push(newRow()); ST.check = null; ST.confirmed = false; ST.result = null; ST.view = null; render(); revalidate();
    const el = root.querySelector('input.ist-in[data-i="' + (ST.rows.length - 1) + '"][data-f="arrivo"]'); if (el) { try { el.focus(); if (el.scrollIntoView) el.scrollIntoView({ block: 'center' }); } catch (e) { /* niente */ } }
  },
  del: a => {
    if (locked()) return; const i = +a.dataset.i, r = ST.rows[i]; if (!r) return;
    if (!confirm('Eliminare il movimento ' + (i + 1) + ' (' + (d8h(r.arrivo) || r.arrivo || 'senza data') + ') dalla tabella? Non verrà trasmesso.')) return;
    ST.rows.splice(i, 1); ST.check = null; ST.confirmed = false; ST.result = null; ST.view = null; render(); revalidate();
  },
  okrow: a => { const r = ST.rows[+a.dataset.i]; if (!r || locked()) return; delete r.approssimato; invalidate(); schedule(0); },      // la riga ricostruita da un file difettoso è stata riletta a mano
  find: a => { if (!locked() && ST.rows[+a.dataset.i]) openSearch(+a.dataset.i); },
  go: a => { const el = root.querySelector('input.ist-in[data-i="' + a.dataset.i + '"][data-f="' + a.dataset.f + '"]'); if (el) { try { el.focus(); if (el.scrollIntoView) el.scrollIntoView({ block: 'center' }); } catch (e) { /* niente */ } } },
  check: () => runCheck(), send: () => runSend(),
  clear: () => { if (locked()) return; if (ST.rows.length && !confirm('Svuotare la tabella? I dati inseriti andranno persi.')) return; resetAll(); },
  newlist: () => { if (ST.result && ST.result.stato === 'inviato') return resetAll(); if (confirm('Iniziare un nuovo elenco? I dati attuali andranno persi.')) resetAll(); },
  dismiss: () => { ST.result = null; render(); },
  unlock: () => { if (!confirm('Hai controllato (con «Elenco movimenti sul portale» o sul portale ISTAT) che i movimenti NON risultano caricati? Solo in tal caso puoi tornare ai dati e ripetere controllo e invio.')) return; ST.result = null; ST.check = null; ST.list = null; ST.msg = mWarn('Tabella sbloccata. Ripeti il controllo prima di inviare.'); render(); }
};

// ---------- disegno ----------
function render() {
  if (!root || !root.isConnected) return;
  const a = document.activeElement, keep = a && root.contains(a) && a.matches && a.matches('input.ist-in') ? { i: a.dataset.i, f: a.dataset.f, s: a.selectionStart, e: a.selectionEnd } : null;
  const w = root.querySelector('.ist-wrap'), sl = w ? w.scrollLeft : 0;
  root.innerHTML = vHead() + vRisultato() + vStatus() + vOrigine() + (ST.rows.length ? vTabella() + '<div id="ist-flow">' + vFlow() + '</div>' : '');
  const w2 = root.querySelector('.ist-wrap'); if (w2) w2.scrollLeft = sl;
  if (keep) { const el = root.querySelector('input.ist-in[data-i="' + keep.i + '"][data-f="' + keep.f + '"]'); if (el) { try { el.focus(); el.setSelectionRange(keep.s, keep.e); } catch (e) { /* niente */ } } }
}
// aggiornamento dopo un controllo: NON tocca i campi di testo (la tastiera del telefono non si chiude e il cursore non si sposta)
function paintView() {
  if (!root || !root.isConnected) return;
  const tb = root.querySelector('[data-testid=ist-table] tbody');
  if (!tb || tb.querySelectorAll('tr.ist-row').length !== ST.rows.length) return render();
  ST.rows.forEach((r, i) => paintRow(tb, i));
  const sum = $('#ist-sum', root); if (sum) sum.innerHTML = vSommario(); const seg = $('#ist-seg', root); if (seg) seg.innerHTML = vSegnalazioni();
  const msg = $('[data-testid=ist-msg]', root); if (ST.msg && !msg) return render();
  paintFlow();
}
function paintFlow() { const f = root && root.isConnected ? $('#ist-flow', root) : null; if (f) f.innerHTML = vFlow(); const s = root && root.isConnected ? $('.ist-steps', root) : null; if (s) s.innerHTML = steps(); }
function paintRow(tb, i) {
  const tr = tb.querySelector('tr.ist-row[data-i="' + i + '"]'); if (!tr) return;
  const x = ST.view && ST.view.rows[i], r = ST.rows[i];
  tr.classList.toggle('bad', !!(x && x.errori));
  $('.ist-st', tr).innerHTML = badge(x); $('.ist-notti', tr).textContent = x && x.notti != null ? x.notti : '—'; $('.ist-desc', tr).innerHTML = descr(r, x);
  CAMPI.forEach(f => { const el = $('input[data-f="' + f + '"]', tr); if (!el) return; const sev = fieldSev(x, f); el.classList.toggle('bad', sev === 'errore'); el.classList.toggle('warn', sev === 'avviso'); if (sev === 'errore') el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid'); });
  ['arrivo', 'partenza'].forEach(f => { const h = $('.ist-h-' + f, tr); if (h) h.textContent = d8h(String(r[f]).trim()); });
  let ir = tr.nextElementSibling; ir = ir && ir.classList.contains('ist-iss-row') ? ir : null; const html = issuesHtml(i, x);
  if (html) { if (!ir) { ir = document.createElement('tr'); ir.className = 'ist-iss-row'; ir.setAttribute('data-for', i); tr.parentNode.insertBefore(ir, tr.nextSibling); } ir.innerHTML = '<td colspan="9">' + html + '</td>'; }
  else if (ir) ir.parentNode.removeChild(ir);
}
function steps() {
  const v = ST.view, r = ST.result, done = [ST.rows.length > 0, !!(v && v.riepilogo.inviabile), !!(ST.check && ST.check.stato === 'pronto') || !!(r && r.stato === 'inviato'), !!(r && r.stato === 'inviato')], cur = done.indexOf(false);
  return ['Carica il CSV', 'Controlla e modifica', 'Riepilogo', 'Conferma e invia'].map((t, i) => '<li class="' + (done[i] ? 'done' : i === cur ? 'cur' : '') + '"' + (i === cur ? ' aria-current="step"' : '') + '><span class="n">' + (done[i] ? '✓' : i + 1) + '</span><span>' + t + '</span></li>').join('');
}
function vHead() {
  const m = ST.msg ? '<div class="adp-msg ' + ST.msg.k + '" role="' + (ST.msg.k === 'err' ? 'alert' : 'status') + '" data-testid="ist-msg">' + esc(ST.msg.t) + '</div>' : '';
  return '<div class="admin-card adp-head" data-testid="ist-head"><h2>Adempimenti · ISTAT</h2>'
    + '<p class="book-note">Movimenti degli ospiti da comunicare a ISTAT Alloggi (Provincia autonoma di Trento). Carichi il CSV, il sito lo controlla e ti segnala errori e avvisi; correggi i dati nella tabella e poi li invii al servizio ISTAT. Non viene inviato nulla finché non confermi.</p>'
    + '<ol class="adp-steps ist-steps" aria-label="Avanzamento" data-testid="ist-steps">' + steps() + '</ol>' + m + '</div>';
}
function vStatus() {
  const s = ST.status, open = ST.statusOpen == null ? !(s && s.stato === 'ok') : ST.statusOpen;
  let badgeS = '<span class="stato in_attesa">Non ancora controllata</span>', body = '<p class="book-note">Premi «Controlla configurazione» per vedere CIPAT, credenziali e tabella delle provenienze. Il controllo non contatta il servizio ISTAT.</p>';
  if (ST.stBusy) badgeS = '<span class="stato in_attesa">Controllo in corso…</span>';
  else if (s && s.stato === 'ok') badgeS = '<span class="stato confermata">Configurazione completa</span>';
  else if (s) badgeS = '<span class="stato annullata">' + esc(titolo(s)) + '</span>';
  if (s && !ST.stBusy) {
    const rows = [];
    if (s.cipat !== undefined) rows.push(['CIPAT della struttura', s.cipat ? s.cipat + (s.cipatValido ? '' : ' — non valido (servono 16 caratteri)') : 'non configurato (variabile ISTAT_CIPAT)']);
    if (s.credenziali) rows.push(['Credenziali del servizio', s.credenziali.presenti ? 'presenti (' + (s.credenziali.utente || '') + ')' : 'mancanti: ' + (s.credenziali.missing || []).join(', ')]);
    if (s.servizio) rows.push(['Servizio', s.servizio]);
    if (s.ambiente) rows.push(['Ambiente', s.ambiente]);
    if (s.send) rows.push(['Invio reale', s.send.enabled ? 'attivo' : 'disattivato — ' + (s.send.motivo || '')]);
    if (s.provenienze) rows.push(['Tabella provenienze', s.provenienze.ok ? s.provenienze.stati + ' stati e ' + s.provenienze.province + ' province' : 'non disponibile']);
    body = (s.stato === 'ok' ? '' : '<div class="adp-msg err">' + esc(titolo(s)) + (s.fix ? '<small>' + esc(s.fix) + '</small>' : '') + '<small>Servono: ISTAT_CIPAT, ISTAT_WS_USER e ISTAT_WS_PASSWORD (forniti da ISPAT) su Vercel; per l\'invio reale anche ISTAT_SEND_ENABLED=true in Production.</small></div>')
      + (rows.length ? '<dl class="adp-dl">' + rows.map(r => '<dt>' + esc(r[0]) + '</dt> <dd>' + esc(r[1]) + '</dd> ').join('') + '</dl>' : '');
  }
  const li = ST.list ? vLista() : '';
  return '<div class="admin-card" data-testid="ist-status"><details class="adp-det"' + (open ? ' open' : '') + '><summary class="adm-sum">Stato della configurazione ' + badgeS + '</summary>' + body
    + '<div class="adm-quick"><button type="button" class="btn btn-line" data-a="status"' + (ST.stBusy ? ' disabled' : '') + ' data-testid="ist-status-btn">Controlla configurazione</button>'
    + '<button type="button" class="btn btn-line" data-a="list"' + (ST.busy === 'list' ? ' disabled' : '') + ' data-testid="ist-list-btn">' + (ST.busy === 'list' ? 'Interrogo il servizio…' : 'Elenco movimenti sul portale') + '</button></div>'
    + '<p class="adp-small">«Elenco movimenti sul portale» interroga il servizio ISTAT (solo lettura) e mostra i movimenti già caricati dal mese precedente.</p>' + li + '</details></div>';
}
function vLista() {
  const l = ST.list; if (!l) return '';
  if (l.stato !== 'ok') return '<div class="adp-msg err" data-testid="ist-list">' + esc(titolo(l)) + (l.fix ? '<small>' + esc(l.fix) + '</small>' : '') + (l.dettaglio ? '<small>Dettaglio: ' + esc(l.dettaglio) + '</small>' : '') + (l.missing && l.missing.length ? '<small>Variabili mancanti: <code>' + l.missing.map(esc).join('</code>, <code>') + '</code></small>' : '') + '</div>';
  return '<div class="adp-msg ok" data-testid="ist-list">Risposta del servizio (HTTP ' + esc(l.http) + (l.json ? ', ' + plur(l.elementi, 'elemento', 'elementi') : '') + ') — mostrata com\'è, il formato non è documentato:<pre class="ist-raw">' + esc(l.testo) + '</pre>' + (l.troncato ? '<small>Risposta troncata.</small>' : '') + '</div>';
}
function vOrigine() {
  const lk = locked(), off = lk || ST.busy === 'parse' ? ' disabled' : '';
  return '<div class="admin-card" data-testid="ist-origine"><h2>1 · Carica il CSV</h2>'
    + '<p class="book-note">Carica il file CSV che hai già (senza intestazione, colonne separate da «;»: CIPAT; arrivo AAAAMMGG; partenza AAAAMMGG; provenienza; persone). Il file originale non viene modificato: lavori su una bozza che resta solo in questa pagina.</p>'
    + '<div class="adm-quick"><label class="btn btn-wine adp-file' + (lk || ST.busy === 'parse' ? ' off' : '') + '">' + (ST.busy === 'parse' ? 'Lettura in corso…' : 'Carica file CSV') + '<input type="file" accept=".csv,.txt,text/csv,text/plain" data-file="1" data-testid="ist-file"' + off + '></label>'
    + '<button type="button" class="btn btn-line" data-a="add"' + off + ' data-testid="ist-add">+ Aggiungi movimento</button></div>'
    + (ST.nome ? '<p class="book-note">File caricato: <b>' + esc(ST.nome) + '</b></p>' : '')
    + '<p class="book-note adp-priv">Privacy: la bozza non viene salvata né sul sito né nel browser e passa dal server solo per i controlli e per l\'invio. Se chiudi o ricarichi la pagina va persa.</p></div>';
}
const badge = x => !x ? '' : x.errori ? '<span class="stato annullata">' + plur(x.errori, 'errore', 'errori') + '</span>' : x.avvisi ? '<span class="stato richiesta">' + plur(x.avvisi, 'avviso', 'avvisi') + '</span>' : '<span class="stato confermata">ok</span>';
const fieldSev = (x, f) => { const l = x && x.issues ? x.issues.filter(i => i.campo === f) : []; return l.some(i => i.sev === 'errore') ? 'errore' : l.length ? 'avviso' : ''; };
const descr = (r, x) => x && x.dec && x.dec.sigla ? esc(x.dec.sigla) + ' <small>(' + (x.dec.tipo === 'provincia' ? 'provincia' : 'stato estero') + ')</small>' : (String(r.sigla || '').trim() ? '<small>non in elenco</small>' : '<small>—</small>');
function issuesHtml(i, x) {
  const iss = x && x.issues ? x.issues : [], ap = !!(ST.rows[i] && ST.rows[i].approssimato); if (!iss.length && !ap) return '';
  return '<ul class="adp-iss">' + iss.map(s => '<li class="' + (s.sev === 'errore' ? 'e' : 'w') + '"><b>Riga ' + (i + 1) + (s.campo ? ' · ' + esc(NOME[s.campo] || s.campo) : '') + ':</b> ' + esc(s.msg) + (s.fix ? '<small>' + esc(s.fix) + '</small>' : '') + '</li>').join('')
    + (ap ? '<li class="w">I campi di questa riga sono stati ricostruiti per posizione (colonne diverse da 5): controllali uno per uno. <button type="button" class="adp-btn" data-a="okrow" data-i="' + i + '" data-testid="ist-okrow-' + i + '">Ho controllato i campi di questa riga</button></li>' : '') + '</ul>';
}
function rowHtml(i) {
  const r = ST.rows[i], x = ST.view && ST.view.rows[i], lk = locked();
  const inp = (f, extra) => { const sev = fieldSev(x, f); return '<input class="ist-in' + (sev === 'errore' ? ' bad' : sev ? ' warn' : '') + '" data-f="' + f + '" data-i="' + i + '" value="' + esc(r[f]) + '" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="' + esc(NOME[f]) + ' (riga ' + (i + 1) + ')"' + (sev === 'errore' ? ' aria-invalid="true"' : '') + (lk ? ' readonly' : '') + ' ' + (extra || '') + '>'; };
  const ih = issuesHtml(i, x);
  return '<tr class="ist-row' + (x && x.errori ? ' bad' : '') + '" data-i="' + i + '" data-testid="ist-row-' + i + '"><td data-label="N." class="ist-n">' + (i + 1) + '</td>'
    + '<td data-label="CIPAT">' + inp('cipat', 'maxlength="40"') + '</td>'
    + '<td data-label="Arrivo">' + inp('arrivo', 'inputmode="numeric" maxlength="12" placeholder="AAAAMMGG"') + '<small class="ist-h ist-h-arrivo">' + esc(d8h(String(r.arrivo).trim())) + '</small></td>'
    + '<td data-label="Partenza">' + inp('partenza', 'inputmode="numeric" maxlength="12" placeholder="AAAAMMGG"') + '<small class="ist-h ist-h-partenza">' + esc(d8h(String(r.partenza).trim())) + '</small></td>'
    + '<td data-label="Notti"><span class="ist-notti">' + (x && x.notti != null ? x.notti : '—') + '</span></td>'
    + '<td data-label="Provenienza" class="ist-prov"><div class="ist-sigla">' + inp('sigla', 'maxlength="6"') + (lk ? '' : '<button type="button" class="adp-btn ist-find" data-a="find" data-i="' + i + '" aria-label="Cerca la provenienza (riga ' + (i + 1) + ')" data-testid="ist-find-' + i + '">Cerca</button>') + '</div><span class="ist-desc">' + descr(r, x) + '</span></td>'
    + '<td data-label="Persone">' + inp('persone', 'inputmode="numeric" maxlength="4"') + '</td>'
    + '<td data-label="Stato" class="ist-st">' + badge(x) + '</td>'
    + '<td class="td-azioni">' + (lk ? '' : '<button type="button" class="adp-btn danger" data-a="del" data-i="' + i + '" data-testid="ist-del-' + i + '">Elimina</button>') + '</td></tr>'
    + (ih ? '<tr class="ist-iss-row" data-for="' + i + '"><td colspan="9">' + ih + '</td></tr>' : '');
}
function vSommario() {
  const v = ST.view, sm = v && v.riepilogo; if (!v) return '<span class="stato in_attesa">' + (ST.vBusy ? 'Controllo in corso…' : 'Dati non controllati') + '</span>';
  return [plur(sm.totale, 'movimento', 'movimenti'), plur(sm.persone, 'persona', 'persone'), 'CIPAT ' + (v.cipat || 'non configurato'), sm.primoArrivo ? 'arrivi dal ' + d8h(sm.primoArrivo) + ' al ' + d8h(sm.ultimoArrivo) : ''].filter(Boolean).map(t => '<span class="adp-chip">' + esc(t) + '</span>').join(' ') + ' '
    + (sm.errori ? '<span class="stato annullata" data-testid="ist-n-err">' + plur(sm.errori, 'errore', 'errori') + '</span>' : '<span class="stato confermata" data-testid="ist-n-err">nessun errore</span>') + ' ' + (sm.avvisi ? '<span class="stato richiesta" data-testid="ist-n-warn">' + plur(sm.avvisi, 'avviso', 'avvisi') + '</span>' : '');
}
function vSegnalazioni() {
  const v = ST.view; if (!v) return '';
  const items = [];
  (v.globali || []).forEach(g => items.push({ sev: g.sev, t: g.msg, fix: g.fix, i: null, f: null }));
  v.rows.forEach((x, i) => (x.issues || []).forEach(s => items.push({ sev: s.sev, t: s.msg, fix: s.fix, i, f: s.campo })));
  const err = items.filter(x => x.sev === 'errore'), av = items.filter(x => x.sev !== 'errore'), all = err.concat(av), cap = all.slice(0, 40);
  if (!all.length) return '<div class="adp-msg ok" data-testid="ist-ready">Nessuna segnalazione: i controlli sono superati e puoi passare al riepilogo.</div>';
  const li = x => '<li class="' + (x.sev === 'errore' ? 'e' : 'w') + '"><b>' + (x.sev === 'errore' ? 'Errore' : 'Avviso') + (x.i != null ? ' · riga ' + (x.i + 1) + (x.f ? ' · ' + esc(NOME[x.f] || x.f) : '') : '') + ':</b> ' + esc(x.t)
    + (x.fix ? '<small>' + esc(x.fix) + '</small>' : '') + (x.i != null && x.f ? ' <button type="button" class="adp-btn" data-a="go" data-i="' + x.i + '" data-f="' + esc(x.f) + '">Vai al campo</button>' : '') + '</li>';
  return (err.length ? '<div class="adp-msg err" data-testid="ist-notready">Ci sono ' + plur(err.length, 'errore', 'errori') + ' da correggere: finché restano, il riepilogo e l\'invio sono bloccati. Gli avvisi non bloccano.</div>' : '<div class="adp-msg ok" data-testid="ist-ready">I controlli sono superati: ' + plur(av.length, 'avviso non bloccante', 'avvisi non bloccanti') + '. Puoi passare al riepilogo.</div>')
    + '<ul class="adp-iss ist-seg" data-testid="ist-seg">' + cap.map(li).join('') + (all.length > cap.length ? '<li class="w">… e altre ' + (all.length - cap.length) + ' segnalazioni (controlla le righe evidenziate).</li>' : '') + '</ul>';
}
function vTabella() {
  const lk = locked();
  return '<div class="admin-card" data-testid="ist-elenco"><div class="adm-head"><h2>2 · Controlla e modifica</h2><div class="adp-chips" id="ist-sum" data-testid="ist-summary">' + vSommario() + '</div></div>'
    + '<p class="book-note">Ogni campo si modifica direttamente nella tabella; i controlli si rifanno da soli dopo ogni modifica. Con «Cerca» scegli la provenienza dall\'elenco ufficiale (codice e descrizione): le sigle non vengono mai convertite automaticamente.</p>'
    + (lk ? '<div class="adp-msg warn">Tabella bloccata dopo l\'invio: per ricominciare usa «Nuovo elenco» qui sopra.</div>' : '')
    + '<div id="ist-seg">' + vSegnalazioni() + '</div>'
    + '<div class="table-wrap ist-wrap"><table class="data ist-table" data-testid="ist-table"><thead><tr><th>N.</th><th>CIPAT</th><th>Arrivo</th><th>Partenza</th><th>Notti</th><th>Provenienza</th><th>Persone</th><th>Stato</th><th></th></tr></thead><tbody>'
    + ST.rows.map((r, i) => rowHtml(i)).join('') + '</tbody></table></div>'
    + (lk ? '' : '<div class="adm-quick"><button type="button" class="btn btn-line" data-a="add" data-testid="ist-add2">+ Aggiungi movimento</button><button type="button" class="btn btn-line" data-a="clear" data-testid="ist-clear">Svuota tabella</button></div>') + '</div>';
}
function vFlow() {
  const v = ST.view, c = ST.check, lk = locked();
  const can = !!(v && v.riepilogo.inviabile) && !ST.busy && !ST.vBusy && !lk;
  let h = '<div class="admin-card" data-testid="ist-verifica"><h2>3 · Riepilogo e invio</h2><p class="book-note">La validazione finale rifà tutti i controlli sui dati attuali e prepara il riepilogo. Nulla viene trasmesso finché non confermi.</p>'
    + '<div class="adm-quick"><button type="button" class="btn btn-wine' + (ST.busy === 'check' ? ' is-loading' : '') + '" data-a="check"' + (can ? '' : ' disabled') + ' data-testid="ist-check">' + (ST.busy === 'check' ? 'Controllo in corso…' : 'Validazione finale e riepilogo') + '</button></div>'
    + (!can && !c && !lk && v && !v.riepilogo.inviabile ? '<p class="book-note">Correggi prima gli errori segnati nella tabella.</p>' : '');
  if (c && c.stato === 'pronto') {
    const rs = c.riepilogo || {}, en = !!(c.send && c.send.enabled), cred = !c.credenziali || c.credenziali.presenti, ok = en && cred, busy = ST.busy === 'send';
    const hh = c.until ? new Date(c.until).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
    h += '<div class="adp-msg ok" data-testid="ist-riepilogo"><b>Riepilogo di ciò che verrà trasmesso</b><dl class="adp-dl"><dt>Movimenti</dt> <dd data-testid="ist-r-mov">' + esc(rs.movimenti) + '</dd> <dt>Persone in totale</dt> <dd data-testid="ist-r-pers">' + esc(rs.persone) + '</dd> <dt>CIPAT</dt> <dd>' + esc(c.cipat) + '</dd> <dt>Arrivi</dt> <dd>dal ' + esc(d8h(rs.primoArrivo)) + ' al ' + esc(d8h(rs.ultimoArrivo)) + '</dd> <dt>Avvisi</dt> <dd>' + esc(rs.avvisi) + '</dd> <dt>Servizio</dt> <dd>' + esc(c.servizio || '') + '</dd></dl>'
      + (hh ? '<small>La conferma è valida fino alle ' + esc(hh) + ' e solo per questi dati: se li modifichi va ripetuta.</small>' : '') + '</div>';
    if (c.avvisi && c.avvisi.length) h += '<ul class="adp-iss" data-testid="ist-avvisi">' + c.avvisi.map(a => '<li class="w"><b>Avviso' + (a.riga ? ' · riga ' + esc(a.riga) : '') + (a.campo ? ' · ' + esc(NOME[a.campo] || a.campo) : '') + ':</b> ' + esc(a.msg) + '</li>').join('') + '</ul>';
    if (!en) h += '<div class="adp-msg warn" data-testid="ist-send-off">Invio reale disattivato su questo ambiente: ' + esc((c.send && c.send.motivo) || 'non abilitato') + '</div>';
    if (!cred) h += '<div class="adp-msg err" data-testid="ist-cred-off">Mancano le credenziali del servizio ISTAT (' + esc(((c.credenziali || {}).missing || []).join(', ')) + '): impostale su Vercel e rifai il deploy.</div>';
    h += '<p>Stai per trasmettere <b>' + plur(rs.movimenti, 'movimento', 'movimenti') + '</b> (' + plur(rs.persone, 'persona', 'persone') + ') all\'ISTAT. L\'invio non si può annullare da qui.</p>'
      + '<label class="adp-confirm"><input type="checkbox" data-confirm="1"' + (ST.confirmed ? ' checked' : '') + (ok && !busy ? '' : ' disabled') + ' data-testid="ist-confirm"> <span>Ho controllato i dati e confermo l\'invio di ' + plur(rs.movimenti, 'movimento', 'movimenti') + ' all\'ISTAT.</span></label>'
      + '<div class="adm-quick"><button type="button" class="btn btn-wine' + (busy ? ' is-loading' : '') + '" data-a="send"' + (ok && ST.confirmed && !ST.busy && !ST.vBusy ? '' : ' disabled') + ' data-testid="ist-send">' + (busy ? 'Invio in corso… non chiudere la pagina' : 'Conferma e invia all\'ISTAT') + '</button></div>';
  }
  return h + '</div>';
}
function vRisultato() {
  const r = ST.result; if (!r) return '';
  let cls = 'err', tit = titolo(r);
  if (r.stato === 'inviato') { cls = 'ok'; tit = 'Inviato: il servizio ha acquisito ' + plur(r.caricati, 'movimento', 'movimenti') + ' su ' + r.inviati; }
  else if (r.stato === 'parziale') { cls = 'warn'; tit = 'Invio parziale: acquisiti ' + r.caricati + ' movimenti su ' + r.inviati; }
  else if (r.stato === 'esito_incerto') { cls = 'warn'; tit = 'Esito dell\'invio incerto'; }
  else if (r.stato === 'rifiutato') tit = 'Nessun movimento acquisito dal servizio';
  const istr = (r.istruzioni || []).slice(); if (r.stato === 'prova_gia_usata') istr.push('Un invio con questa stessa conferma potrebbe essere già stato tentato: controlla con «Elenco movimenti sul portale» prima di ripetere.');
  const btn = (a, t, c) => '<button type="button" class="btn ' + (c || 'btn-line') + '" data-a="' + a + '" data-testid="ist-res-' + a + '">' + t + '</button>';
  const acts = r.stato === 'esito_incerto' ? btn('list', 'Elenco movimenti sul portale') + btn('unlock', 'Controllato: non risultano, torna ai dati') + btn('newlist', 'Risultano caricati: nuovo elenco')
    : r.stato === 'inviato' ? btn('list', 'Elenco movimenti sul portale') + btn('newlist', 'Nuovo elenco', 'btn-wine') : r.stato === 'parziale' ? btn('list', 'Elenco movimenti sul portale') + btn('newlist', 'Nuovo elenco', 'btn-wine') : btn('dismiss', 'Chiudi');
  return '<div class="admin-card adp-res ' + cls + '" role="' + (cls === 'err' ? 'alert' : 'status') + '" data-testid="ist-result" data-stato="' + esc(r.stato) + '"><h2>' + esc(tit) + '</h2>'
    + (r.err && r.stato !== 'rifiutato' ? '<p>' + esc(r.err) + '</p>' : '') + (r.fix ? '<p>' + esc(r.fix) + '</p>' : '') + (r.nota ? '<p>' + esc(r.nota) + '</p>' : '')
    + (r.info ? '<p class="adp-small">Risposta del servizio:</p><blockquote class="ist-quote" data-testid="ist-info">' + esc(r.info) + '</blockquote>' : '')
    + (istr.length ? '<ul class="adp-list-i">' + istr.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') + (r.dettaglio && !r.info ? '<p class="adp-small">Dettaglio: ' + esc(r.dettaglio) + '</p>' : '')
    + '<div class="adm-quick">' + acts + '</div>' + (ST.list ? vLista() : '') + '</div>';
}

// ---------- scelta della provenienza (finestra di ricerca) ----------
function openSearch(i) {
  closeSearch();
  M = { i, seq: 0, focus: document.activeElement, t: 0 };
  const ov = document.createElement('div'); ov.className = 'adp-modal'; ov.setAttribute('data-testid', 'ist-search');
  ov.innerHTML = '<div class="adp-sheet ist-sheet" role="dialog" aria-modal="true" aria-labelledby="ist-st"><div class="adp-sheet-head"><h3 id="ist-st">Provenienza — riga ' + (i + 1) + '</h3><button type="button" class="adp-x" data-m="close" aria-label="Chiudi">×</button></div>'
    + '<div class="field"><label for="ist-q">Cerca per nome o per sigla (es. Perugia, PG, Germania)</label><input id="ist-q" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" data-testid="ist-q"></div>'
    + '<div class="adp-combo"><ul id="ist-lb" role="listbox" data-testid="ist-lb"><li class="adp-opt-info">Scrivi almeno 2 lettere.</li></ul></div>'
    + '<p class="adp-small">Scegli un risultato per inserire la sigla. Le sigle ambigue non vengono mai convertite da sole: «FR» è Frosinone, «FRA» è la Francia.</p><div class="adp-sheet-foot"><button type="button" class="btn btn-line" data-m="close" data-testid="ist-search-cancel">Annulla</button></div></div>';
  document.body.appendChild(ov); document.body.classList.add('adp-noscroll'); M.ov = ov;
  ov.addEventListener('click', e => { if (e.target.closest('[data-m="close"]')) return closeSearch(); const li = e.target.closest('li[data-code]'); if (li) pickSigla(li.dataset.code); });
  ov.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeSearch(); } });
  ov.addEventListener('input', e => { if (e.target.id === 'ist-q') { clearTimeout(M.t); const q = e.target.value.trim(); M.t = setTimeout(() => lookup(q), 220); } });
  const q = $('#ist-q', ov); if (q) q.focus();
}
function closeSearch() {
  if (!M) return; clearTimeout(M.t);
  const f = M.focus; if (M.ov && M.ov.parentNode) M.ov.parentNode.removeChild(M.ov); document.body.classList.remove('adp-noscroll'); M = null;
  if (f && f.isConnected && f.focus) { try { f.focus(); } catch (e) { /* niente */ } }
}
async function lookup(q) {
  const my = M; if (!my) return; const ul = $('#ist-lb', my.ov), n = ++my.seq;
  if (q.length < 2) { ul.innerHTML = '<li class="adp-opt-info">Scrivi almeno 2 lettere.</li>'; return; }
  ul.innerHTML = '<li class="adp-opt-info">Cerco…</li>';
  let b = null; try { b = (await api('is_lookup', { q })).body; } catch (e) { if (e.auth) return; }
  if (M !== my || my.seq !== n) return;
  if (!b || b.ok === false) { ul.innerHTML = '<li class="adp-opt-info">Tabella delle provenienze non disponibile.</li>'; return; }
  if (!b.risultati || !b.risultati.length) { ul.innerHTML = '<li class="adp-opt-info">Nessun risultato</li>'; return; }
  ul.innerHTML = b.risultati.map(x => '<li role="option" data-code="' + esc(x.codice) + '"><span>' + esc(x.nome) + ' <small>' + (x.tipo === 'provincia' ? 'provincia' : 'stato estero') + '</small></span><small>' + esc(x.codice) + '</small></li>').join('');
}
function pickSigla(code) {
  const i = M.i; if (!ST.rows[i] || locked()) return closeSearch();
  ST.rows[i].sigla = code; closeSearch(); invalidate();
  const el = root && root.querySelector('input.ist-in[data-i="' + i + '"][data-f="sigla"]'); if (el) { el.value = code; try { el.focus(); } catch (e) { /* niente */ } }
  schedule(0);
}

// ---------- eventi della pagina ----------
function onClick(e) {
  const a = e.target.closest('[data-a]'); if (!a || !root.contains(a) || a.disabled) return;
  const f = ACT[a.dataset.a]; if (f) { e.preventDefault(); f(a, e); }
}
function onInput(e) {
  const t = e.target; if (!t.matches || !t.matches('input.ist-in') || locked()) return;
  const i = +t.dataset.i, f = t.dataset.f; if (!ST.rows[i]) return;
  ST.rows[i][f] = t.value; invalidate(); schedule(500);
}
function onChange(e) {
  const t = e.target;
  if (t.matches('input[data-file]')) { const f = t.files && t.files[0]; t.value = ''; if (f) loadFile(f); return; }
  if (t.matches('input[data-confirm]')) { ST.confirmed = !!t.checked; paintFlow(); return; }
  if (t.matches('input.ist-in') && !locked()) { const i = +t.dataset.i; if (ST.rows[i]) { ST.rows[i][t.dataset.f] = t.value; invalidate(); schedule(0); } }
}
function onKey(e) {      // Invio = passa allo stesso campo della riga sotto, come in un foglio di calcolo
  const t = e.target; if (e.key !== 'Enter' || !t.matches || !t.matches('input.ist-in')) return;
  e.preventDefault(); const nx = root.querySelector('input.ist-in[data-i="' + (+t.dataset.i + 1) + '"][data-f="' + t.dataset.f + '"]'); if (nx) nx.focus(); else t.blur();
}
function onToggle(e) { if (e.target.matches && e.target.matches('details.adp-det')) ST.statusOpen = e.target.open; }
function mount(el, c) {
  root = el; ctx = Object.assign({ token: () => '', onUnauthorized: () => {} }, c || {});
  root.addEventListener('click', onClick); root.addEventListener('input', onInput); root.addEventListener('change', onChange); root.addEventListener('keydown', onKey); root.addEventListener('toggle', onToggle, true);
  render(); loadStatus(false); if (ST.rows.length && !ST.view && !ST.vBusy) revalidate();
}
function reset() { clearTimeout(ST.timer); clearTimeout(ST.vt); ST.seq++; ST = fresh(); closeSearch(); render(); }
// cambiando sezione con la finestra di ricerca aperta, la finestra si chiude (non resta orfana sopra un'altra pagina)
window.addEventListener('hashchange', () => { if (M && String(location.hash || '').indexOf('#adempimenti') !== 0) closeSearch(); });
window.addEventListener('beforeunload', e => { if (ST.rows.length && !(ST.result && ST.result.stato === 'inviato')) { e.preventDefault(); e.returnValue = ''; } });
window.LCIstat = { mount, reset, closeSearch };
})();
