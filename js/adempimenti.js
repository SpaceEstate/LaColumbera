// La Columbera · Gestione → Adempimenti → Alloggiati Web (Fase 1)
// Flusso: 1 origine (file TXT o inserimento a mano) → 2 anteprima e controlli → 3 verifica con Alloggiati (Test) → 4 conferma e invio.
//  - I dati degli ospiti restano SOLO nella memoria di questa pagina: niente localStorage/sessionStorage, niente cookie, nessun salvataggio sul sito.
//  - Ogni controllo e ogni invio sono rifatti dal server (api/adempimenti.js). Credenziali, WSKEY e token del servizio non arrivano mai qui.
//  - Un invio senza risposta chiara è "esito incerto": non si ripete da solo e non si può rifare senza una scelta esplicita.
(function () {
'use strict';
const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Tracciato del manuale WS (tabella 1): [campo, da, a (escluso), etichetta]. Stesso schema di api/_alloggiati.js: un test confronta le due versioni.
const LAYOUT = [['tipo', 0, 2, 'Tipo alloggiato'], ['arrivo', 2, 12, 'Data di arrivo'], ['giorni', 12, 14, 'Giorni di permanenza'], ['cognome', 14, 64, 'Cognome'], ['nome', 64, 94, 'Nome'], ['sesso', 94, 95, 'Sesso'],
  ['nascita', 95, 105, 'Data di nascita'], ['comune', 105, 114, 'Comune di nascita'], ['prov', 114, 116, 'Provincia di nascita'], ['stato', 116, 125, 'Stato di nascita'], ['cittad', 125, 134, 'Cittadinanza'],
  ['tipodoc', 134, 139, 'Tipo documento'], ['numdoc', 139, 159, 'Numero documento'], ['luogo', 159, 168, 'Luogo di rilascio']];
const CAMPI = LAYOUT.map(f => f[0]);
const NOME_CAMPO = {}; LAYOUT.forEach(f => { NOME_CAMPO[f[0]] = f[3]; });
const TIPI = [['16', 'Ospite singolo'], ['17', 'Capo famiglia'], ['18', 'Capo gruppo'], ['19', 'Familiare'], ['20', 'Membro del gruppo']];
const TIPO_NOME = {}; TIPI.forEach(t => { TIPO_NOME[t[0]] = t[1]; });
const NUCLEO_NOME = { famiglia: 'Famiglia', gruppo: 'Gruppo', singolo: 'Ospite singolo', orfano: 'Senza capo' };
const FINALI = ['inviato', 'parziale', 'esito_incerto'];       // dopo questi esiti l'elenco si blocca: niente modifiche né nuovi invii senza una scelta esplicita
const TITOLI = { variabili_mancanti: 'Mancano variabili d\'ambiente su Vercel', credenziali_non_valide: 'Credenziali non valide', wskey_non_valida: 'WSKEY non valida', servizio_non_raggiungibile: 'Servizio non raggiungibile',
  errore_servizio: 'Errore del servizio', send_disattivato: 'Invio reale disattivato', prova_non_valida: 'Verifica scaduta o non valida', dati_cambiati: 'I dati sono cambiati dopo la verifica', prova_gia_usata: 'Verifica già usata',
  invio_in_corso: 'Invio già in corso', archivio_non_disponibile: 'Archivio temporaneamente non disponibile', dati_non_validi: 'Dati non validi', sessione_scaduta: 'Sessione scaduta', errore: 'Richiesta non valida' };
const INCERTO = { stato: 'esito_incerto', dettaglio: 'Nessuna risposta valida dal server.', istruzioni: ['Non so se il servizio ha acquisito le schedine: la risposta non è arrivata o non è interpretabile.',
  'NON inviare di nuovo da qui. Controlla sul portale Alloggiati Web se le schedine di questo arrivo risultano comunicate.', 'Solo se non risultano, ripeti l\'operazione da capo (verifica con Alloggiati e poi invio).'] };

const toIso = s => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '').trim()); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; };
const fromIso = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };
const segs = r => LAYOUT.map(f => { let v = r[f[0]] == null ? '' : String(r[f[0]]); if (f[0] === 'giorni' && /^\d$/.test(v.trim())) v = '0' + v.trim(); const c = Array.from(v), w = f[2] - f[1]; return c.slice(0, w).join('') + ' '.repeat(Math.max(0, w - c.length)); });
const lineOf = r => segs(r).join('');
const emptyRec = o => Object.assign({ tipo: '16', arrivo: '', giorni: '', cognome: '', nome: '', sesso: '', nascita: '', comune: '', prov: '', stato: '', cittad: '', tipodoc: '', numdoc: '', luogo: '' }, o || {});
const pick = r => { const o = {}; CAMPI.forEach(k => { o[k] = r[k] == null ? '' : String(r[k]); }); if (Number.isInteger(r.riga)) o.riga = r.riga; if (r.approssimato === true) o.approssimato = true; return o; };
const mOk = t => ({ k: 'ok', t }), mWarn = t => ({ k: 'warn', t }), mErr = t => ({ k: 'err', t });
const titolo = b => (b && (b.titolo || TITOLI[b.stato] || b.err)) || 'Operazione non riuscita';
const plur = (n, a, b) => n + ' ' + (n === 1 ? a : b);
const readText = f => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result || '')); fr.onerror = () => rej(new Error('lettura')); fr.readAsText(f, 'utf-8'); });

// ---------- stato (solo in memoria) ----------
const fresh = () => ({ records: [], view: null, check: null, result: null, busy: '', stBusy: false, vBusy: false, msg: null, seq: 0, nome: '', confirmed: false, status: null, statusAt: 0, statusOpen: null, open: {}, docs: null, timer: 0 });
let ST = fresh(), root = null, ctx = { token: () => '', onUnauthorized: () => {} }, M = null, sending = false;
const locked = () => !!(sending || (ST.result && FINALI.indexOf(ST.result.stato) >= 0));

async function api(a, body) {
  const r = await fetch('api/adempimenti?a=' + a, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: ctx.token() || '' }, body: JSON.stringify(body || {}) });
  let j = null; try { j = await r.json(); } catch (e) { /* non JSON: pagina di errore della piattaforma o risposta troncata */ }
  if (r.status === 401) { ctx.onUnauthorized(); const e = new Error('Sessione scaduta'); e.auth = true; throw e; }
  return { status: r.status, body: j };
}

// ---------- azioni ----------
async function loadDocs() {
  if (ST.docs) return;
  try { const r = await api('al_lookup', { t: 'documenti', all: true }); if (r.body && r.body.ok && Array.isArray(r.body.risultati) && r.body.risultati.length) ST.docs = r.body.risultati; } catch (e) { /* il modulo userà il campo libero */ }
}
async function loadStatus(force) {
  if (ST.stBusy || (!force && ST.status && Date.now() - ST.statusAt < 600e3)) return;
  ST.stBusy = true; render();
  try {
    const r = await api('al_status');
    ST.status = r.body && r.body.stato ? r.body : { stato: 'errore_servizio', titolo: 'Risposta del server non valida', fix: 'Riprova tra poco.', dettaglio: 'HTTP ' + r.status };
    ST.statusAt = Date.now();
    if (ST.status.stato === 'ok') await loadDocs();
  } catch (e) { if (!e.auth) ST.status = { stato: 'servizio_non_raggiungibile', titolo: 'Server non raggiungibile', fix: 'Controlla la connessione e riprova.', dettaglio: '' }; }
  finally { ST.stBusy = false; render(); }
}
// ricontrollo di tutto l'elenco dopo ogni modifica: i risultati vecchi (verifica, conferma) non valgono più
async function revalidate(msg) {
  const seq = ++ST.seq; ST.check = null; ST.confirmed = false; clearTimeout(ST.timer);
  if (msg !== undefined) ST.msg = msg;
  if (!ST.records.length) { ST.view = null; ST.vBusy = false; return render(); }
  ST.vBusy = true; render();
  try {
    const r = await api('al_validate', { records: ST.records });
    if (seq !== ST.seq) return;
    if (r.status === 200 && r.body && Array.isArray(r.body.records)) ST.view = r.body;
    else { ST.view = null; ST.msg = mErr((r.body && r.body.err) || 'Controllo non riuscito: riprova.'); }
  } catch (e) { if (seq === ST.seq && !e.auth) { ST.view = null; ST.msg = mErr('Non riesco a controllare i dati (connessione?): riprova.'); } }
  finally { if (seq === ST.seq) { ST.vBusy = false; render(); } }
}
// dopo ogni modifica l'esito dei controlli non vale più (gli indici delle schede cambiano): si mostra l'elenco "in controllo" finché non arriva il nuovo esito
const mutated = msg => { ST.result = null; ST.open = {}; ST.view = null; return revalidate(msg); };
async function loadFile(file) {
  if (!file || locked() || ST.busy) return;
  if (file.size > 200e3) { ST.msg = mErr('Il file è troppo grande (massimo 200 KB).'); return render(); }
  if (ST.records.length && !confirm('Sostituire l\'elenco attuale con il contenuto del file? Le modifiche non inviate andranno perse.')) return;
  ST.busy = 'parse'; ST.msg = null; clearTimeout(ST.timer); render();
  const seq = ++ST.seq;
  try {
    const text = await readText(file), r = await api('al_parse', { text });
    if (seq !== ST.seq) return;
    const b = r.body;
    if (r.status === 200 && b && Array.isArray(b.records)) {
      ST.records = b.records.map(pick); ST.view = b; ST.vBusy = false; ST.nome = file.name || ''; ST.check = null; ST.result = null; ST.confirmed = false; ST.open = {};
      ST.msg = ST.records.length ? mOk('File letto: ' + plur(ST.records.length, 'schedina', 'schedine') + '. Controlla l\'anteprima qui sotto.') : mErr(((b.globali || []).filter(g => g.sev === 'errore')[0] || {}).msg || 'Il file non contiene schedine.');
    } else ST.msg = mErr((b && b.err) || 'Non riesco a leggere il file.');
  } catch (e) { if (!e.auth && seq === ST.seq) ST.msg = mErr('Non sono riuscito a leggere il file (connessione?).'); }
  finally { if (seq === ST.seq) { ST.busy = ''; render(); } }
}
function move(i, d) {
  if (locked()) return; const j = i + d; if (j < 0 || j >= ST.records.length) return;
  const t = ST.records[i]; ST.records[i] = ST.records[j]; ST.records[j] = t; mutated();
}
function armTimer(ms) {
  clearTimeout(ST.timer);
  ST.timer = setTimeout(() => { if (ST.check && ST.check.proof) { ST.check = null; ST.confirmed = false; ST.msg = mWarn('La verifica con Alloggiati è scaduta: ripetila prima di inviare.'); render(); } }, Math.max(1000, Math.min(ms, 2147483000)));
}
// Test: il servizio controlla le schedine senza registrarle. Ritorna una prova firmata dal server, valida pochi minuti e solo per questi dati.
async function runCheck() {
  if (ST.busy || ST.vBusy || locked() || !ST.view || !ST.view.riepilogo.inviabile) return;
  ST.busy = 'check'; ST.msg = null; ST.check = null; ST.result = null; ST.confirmed = false; clearTimeout(ST.timer); render();
  try {
    const r = await api('al_check', { records: ST.records }), b = r.body;
    if (!b || typeof b !== 'object') ST.check = { stato: 'errore_servizio', titolo: 'Risposta del server non valida', fix: 'Riprova tra poco.', dettaglio: 'HTTP ' + r.status };
    else if (r.status === 422 && Array.isArray(b.records)) { ST.view = b; ST.msg = mWarn('Alcune schedine non risultano più inviabili (per esempio sono già state inviate): correggi e ripeti la verifica.'); }
    else {
      ST.check = b;
      if (b.stato === 'test_ok' && b.proof) { const ttl = +b.proofTtlMs > 0 ? +b.proofTtlMs : 20 * 60e3; ST.check.until = Date.now() + ttl - 5000; armTimer(ttl - 5000); }
    }
  } catch (e) { if (!e.auth) ST.check = { stato: 'servizio_non_raggiungibile', titolo: 'Server non raggiungibile', fix: 'Controlla la connessione e riprova: non è stato inviato nulla.', dettaglio: '' }; }
  finally { ST.busy = ''; render(); }
}
// Invio reale. Un solo clic efficace (sending), la prova si consuma lato server; qualunque risposta non chiara = esito incerto, mai "non inviato".
async function runSend() {
  const c = ST.check;
  if (sending || ST.busy || ST.vBusy || !c || c.stato !== 'test_ok' || !c.proof || !ST.confirmed) return;
  if (Date.now() >= (c.until || 0)) { ST.check = null; ST.confirmed = false; ST.msg = mWarn('La verifica con Alloggiati è scaduta: ripetila prima di inviare.'); return render(); }
  sending = true; ST.busy = 'send'; ST.msg = null; clearTimeout(ST.timer); render();
  let res;
  try {
    const r = await api('al_send', { records: ST.records, proof: c.proof }), b = r.body;
    if (b && typeof b === 'object' && b.stato) res = b;
    else if (b && typeof b === 'object' && r.status >= 400 && r.status < 500) res = { stato: 'errore', err: b.err || 'Richiesta non valida' };      // rifiuto chiaro, prima di qualsiasi invio
    else res = INCERTO;                                          // 5xx, timeout della piattaforma, risposta vuota o non JSON: il servizio potrebbe aver ricevuto le schedine
  } catch (e) { res = e.auth ? { stato: 'sessione_scaduta', err: 'Sessione scaduta: accedi di nuovo e ripeti la verifica. Non è stato inviato nulla.' } : INCERTO; }
  ST.result = res; ST.check = null; ST.confirmed = false; sending = false; ST.busy = '';
  if (res.stato === 'dati_non_validi' && Array.isArray(res.records)) ST.view = res;
  render();
}
function resetList() {
  clearTimeout(ST.timer); ST.seq++;
  const k = { status: ST.status, statusAt: ST.statusAt, statusOpen: ST.statusOpen, docs: ST.docs };
  ST = Object.assign(fresh(), k); closeEdit(); render();
}
const ACT = {
  status: () => loadStatus(true),
  add: () => { if (!locked()) openEdit(null, null, null); },
  addm: a => {
    if (locked() || !ST.view) return;
    const n = ST.view.nuclei.filter(x => x.id === +a.dataset.n)[0], capo = n && ST.records[n.capo]; if (!capo) return;
    openEdit(null, { tipo: String(capo.tipo).trim() === '17' ? '19' : '20', arrivo: capo.arrivo, giorni: capo.giorni }, (n.membri.length ? n.membri[n.membri.length - 1] : n.capo) + 1);
  },
  edit: a => { if (!locked() && ST.records[+a.dataset.i]) openEdit(+a.dataset.i, null, null); },
  del: a => {
    if (locked()) return; const i = +a.dataset.i, r = ST.records[i]; if (!r) return;
    const nome = [r.cognome, r.nome].filter(Boolean).join(' ') || 'questa scheda';
    if (!confirm('Eliminare ' + nome + ' dall\'elenco?')) return;
    ST.records.splice(i, 1); mutated();
  },
  up: a => move(+a.dataset.i, -1), down: a => move(+a.dataset.i, 1),
  tech: a => { const i = +a.dataset.i; ST.open[i] = !ST.open[i]; render(); },
  check: () => runCheck(), send: () => runSend(),
  clear: () => { if (locked()) return; if (ST.records.length && !confirm('Svuotare l\'elenco? I dati inseriti andranno persi.')) return; resetList(); },
  newlist: () => { if (ST.result && ST.result.stato === 'inviato') return resetList(); if (confirm('Iniziare un nuovo elenco? I dati attuali andranno persi.')) resetList(); },
  dismiss: () => { ST.result = null; render(); },
  unlock: () => { if (!confirm('Hai controllato sul portale Alloggiati Web che le schedine NON risultano comunicate? Solo in tal caso puoi tornare ai dati e ripetere verifica e invio.')) return; ST.result = null; ST.check = null; ST.msg = mWarn('Elenco sbloccato. Ripeti la verifica con Alloggiati prima di inviare.'); render(); }
};

// ---------- disegno ----------
function render() {
  if (!root || !root.isConnected) return;
  // Il campo «Carica file TXT» resta lo stesso elemento da un disegno all'altro: se la pagina si ridisegna mentre la finestra di scelta del file
  // è aperta (es. arriva lo stato della configurazione), il file scelto arriva a un campo ancora nella pagina e non a uno già tolto (file perso)
  const fi = root.querySelector('input[data-file]');
  root.innerHTML = vHead() + vRisultato() + vStatus() + vOrigine() + (ST.records.length ? vElenco() + vVerifica() + vInvio() : '');
  const nu = fi && root.querySelector('input[data-file]');
  if (nu) { fi.disabled = nu.disabled; nu.replaceWith(fi); }
}
function steps() {
  const v = ST.view, r = ST.result, done = [ST.records.length > 0, !!(v && v.riepilogo.inviabile), !!(ST.check && ST.check.stato === 'test_ok') || !!(r && r.stato === 'inviato'), !!(r && r.stato === 'inviato')], cur = done.indexOf(false);
  return ['Origine', 'Anteprima e controlli', 'Verifica con Alloggiati', 'Conferma e invio'].map((t, i) => '<li class="' + (done[i] ? 'done' : i === cur ? 'cur' : '') + '"' + (i === cur ? ' aria-current="step"' : '') + '><span class="n">' + (done[i] ? '✓' : i + 1) + '</span><span>' + t + '</span></li>').join('');
}
function vHead() {
  const m = ST.msg ? '<div class="adp-msg ' + ST.msg.k + '" role="' + (ST.msg.k === 'err' ? 'alert' : 'status') + '" data-testid="adp-msg">' + esc(ST.msg.t) + '</div>' : '';
  return '<div class="admin-card adp-head" data-testid="adp-head"><h2>Adempimenti · Alloggiati Web</h2>'
    + '<p class="book-note">Comunicazione degli ospiti alla Polizia di Stato tramite il servizio Alloggiati Web. Non viene inviato nulla finché non completi tutti i passaggi: controlli, verifica con il servizio e conferma.</p>'
    + '<ol class="adp-steps" aria-label="Avanzamento" data-testid="adp-steps">' + steps() + '</ol>' + m + '</div>';
}
function vStatus() {
  const s = ST.status, open = ST.statusOpen == null ? !(s && s.stato === 'ok') : ST.statusOpen;
  let badge = '<span class="stato in_attesa">Non ancora controllata</span>', body = '<p class="book-note">Premi «Controlla configurazione» per verificare le credenziali e scaricare le tabelle ufficiali.</p>';
  if (ST.stBusy) badge = '<span class="stato in_attesa">Controllo in corso…</span>';
  else if (s && s.stato === 'ok') badge = '<span class="stato confermata">Configurazione valida</span>';
  else if (s) badge = '<span class="stato annullata">' + esc(titolo(s)) + '</span>';
  if (s && !ST.stBusy) {
    const rows = [];
    if (s.utente) rows.push(['Utente', s.utente]);
    if (s.ambiente) rows.push(['Ambiente', s.ambiente]);
    if (s.send) rows.push(['Invio reale', s.send.enabled ? 'attivo' : 'disattivato — ' + (s.send.motivo || '')]);
    if (s.tabelle) rows.push(['Tabelle ufficiali', Object.keys(s.tabelle).map(k => k.replace('_', ' ') + ': ' + (s.tabelle[k].ok ? s.tabelle[k].righe + ' righe' : 'non caricata')).join(' · ')]);
    body = (s.stato === 'ok' ? '' : '<div class="adp-msg err">' + esc(titolo(s)) + (s.fix ? '<small>' + esc(s.fix) + '</small>' : '') + (s.dettaglio ? '<small>Dettaglio: ' + esc(s.dettaglio) + '</small>' : '')
      + (s.missing && s.missing.length ? '<small>Variabili mancanti: <code>' + s.missing.map(esc).join('</code>, <code>') + '</code></small>' : '') + '</div>')
      + (rows.length ? '<dl class="adp-dl">' + rows.map(r => '<dt>' + esc(r[0]) + '</dt> <dd>' + esc(r[1]) + '</dd> ').join('') + '</dl>' : '');
  }
  return '<div class="admin-card" data-testid="adp-status"><details class="adp-det"' + (open ? ' open' : '') + '><summary class="adm-sum">Stato della configurazione ' + badge + '</summary>' + body
    + '<div class="adm-quick"><button type="button" class="btn btn-line" data-a="status"' + (ST.stBusy ? ' disabled' : '') + ' data-testid="adp-status-btn">Controlla configurazione</button></div></details></div>';
}
function vOrigine() {
  const lk = locked(), off = lk || ST.busy ? ' disabled' : '';
  return '<div class="admin-card" data-testid="adp-origine"><h2>1 · Origine dei dati</h2>'
    + '<p class="book-note">Carica il file TXT generato dal foglio (una riga di 168 caratteri per ospite) oppure inserisci gli ospiti a mano. Prima dell\'invio puoi correggere qualsiasi dato.</p>'
    + '<div class="adm-quick"><label class="btn btn-wine adp-file' + (lk || ST.busy ? ' off' : '') + '">' + (ST.busy === 'parse' ? 'Lettura in corso…' : 'Carica file TXT') + '<input type="file" accept=".txt,text/plain" data-file="1" data-testid="adp-file"' + off + '></label>'
    + '<button type="button" class="btn btn-line" data-a="add"' + off + ' data-testid="adp-add">+ Aggiungi ospite a mano</button></div>'
    + (ST.nome ? '<p class="book-note">File caricato: <b>' + esc(ST.nome) + '</b></p>' : '')
    + '<p class="book-note adp-priv">Privacy: i dati degli ospiti restano solo in questa pagina (non vengono salvati né sul sito né nel browser) e vengono trasmessi al servizio della Polizia di Stato solo quando confermi l\'invio. Se chiudi o ricarichi la pagina vanno persi.</p></div>';
}
function vTech(r) {
  const parts = segs(r), line = parts.join(''), n = Array.from(line).length;
  const rows = LAYOUT.map((f, k) => { const raw = r[f[0]] == null ? '' : String(r[f[0]]), over = Array.from(raw).length > f[2] - f[1];
    return '<tr' + (over ? ' class="e"' : '') + '><td>' + esc(f[3]) + '</td><td>' + f[1] + '–' + (f[2] - 1) + '</td><td><code>' + esc(parts[k].replace(/ /g, '·')) + '</code>' + (over ? ' <b>troppo lungo</b>' : '') + '</td></tr>'; }).join('');
  return '<div class="adp-tech" data-testid="adp-tech"><div class="adp-scroll"><table><thead><tr><th>Campo</th><th>Posizioni</th><th>Valore</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    + '<p class="adp-small">Posizioni come nel manuale del servizio (si parte da 0); gli spazi sono mostrati come «·».</p><div class="adp-scroll"><pre class="adp-line" data-testid="adp-line">' + esc(line.replace(/ /g, '·')) + '</pre></div><p class="adp-small">' + n + ' caratteri (devono essere 168).</p></div>';
}
function vRow(i) {
  const r = ST.records[i]; if (!r) return '';
  const x = (ST.view && ST.view.records[i]) || null, dec = (x && x.dec) || {}, lk = locked(), tc = ST.check && ST.check.righe ? ST.check.righe[i] : null;
  const nome = [r.cognome, r.nome].map(s => String(s || '').trim()).filter(Boolean).join(' ');
  const badge = !x ? '' : x.errori ? '<span class="stato annullata">' + plur(x.errori, 'errore', 'errori') + '</span>' : x.avvisi ? '<span class="stato richiesta">' + plur(x.avvisi, 'avviso', 'avvisi') + '</span>' : '<span class="stato confermata">ok</span>';
  const place = (code, name) => code ? (name ? esc(name) : '<code>' + esc(code) + '</code>') : '—';
  const iss = ((x && x.issues) || []).map(s => '<li class="' + (s.sev === 'errore' ? 'e' : 'w') + '">' + (s.campo ? '<b>' + esc(NOME_CAMPO[s.campo] || s.campo) + ':</b> ' : '') + esc(s.msg) + (s.fix ? '<small>' + esc(s.fix) + '</small>' : '') + '</li>');
  if (tc && tc.esito === false) iss.push('<li class="e"><b>Servizio Alloggiati:</b> ' + esc(tc.des || 'schedina respinta') + (tc.dett ? '<small>' + esc(tc.dett) + '</small>' : '') + '</li>');
  else if (tc && tc.bloccataPerNucleo) iss.push('<li class="w">Bloccata: un\'altra schedina dello stesso nucleo è stata respinta dal servizio.</li>');
  const t = String(r.tipo || '').trim(), hasDoc = ['16', '17', '18'].indexOf(t) >= 0 || r.tipodoc || r.numdoc || r.luogo;
  const b = (a, txt, cls, extra) => '<button type="button" class="adp-btn' + (cls ? ' ' + cls : '') + '" data-a="' + a + '" data-i="' + i + '"' + (extra || '') + '>' + txt + '</button>';
  const foot = (lk ? '' : b('edit', 'Modifica', '', ' data-testid="adp-edit-' + i + '"') + b('up', '↑', '', (i === 0 ? ' disabled' : '') + ' aria-label="Sposta su"') + b('down', '↓', '', (i === ST.records.length - 1 ? ' disabled' : '') + ' aria-label="Sposta giù"'))
    + b('tech', ST.open[i] ? 'Nascondi dettaglio' : 'Dettaglio tecnico', '', ' data-testid="adp-tech-' + i + '"') + (lk ? '' : b('del', 'Elimina', 'danger', ' data-testid="adp-del-' + i + '"'));
  return '<article class="adp-row' + (x && x.errori ? ' bad' : '') + '" data-testid="adp-row-' + i + '"><header><span class="adp-n">' + (i + 1) + '</span><span class="adp-tipo">' + esc(TIPO_NOME[t] || (t ? 'Tipo ' + t : 'Tipo mancante')) + '</span>' + badge + '</header>'
    + '<h4>' + (nome ? esc(nome) : '<em>(scheda da compilare)</em>') + '</h4><dl class="adp-meta">'
    + '<div><dt>Arrivo</dt><dd>' + esc(r.arrivo || '—') + ' · ' + esc(String(r.giorni || '—').trim()) + ' gg' + (x && x.partenza ? ' · partenza ' + esc(x.partenza) : '') + '</dd></div>'
    + '<div><dt>Nascita</dt><dd>' + esc(r.nascita || '—') + ' · ' + (r.sesso === '1' ? 'M' : r.sesso === '2' ? 'F' : '—') + '</dd></div>'
    + '<div><dt>Nato/a in</dt><dd>' + place(r.stato, dec.stato) + (r.comune ? ' · ' + place(r.comune, dec.comune) + (r.prov ? ' (' + esc(r.prov) + ')' : '') : '') + '</dd></div>'
    + '<div><dt>Cittadinanza</dt><dd>' + place(r.cittad, dec.cittad) + '</dd></div>'
    + (hasDoc ? '<div><dt>Documento</dt><dd>' + place(r.tipodoc, dec.tipodoc) + ' ' + esc(r.numdoc || '') + ' · ' + place(r.luogo, dec.luogo) + '</dd></div>' : '') + '</dl>'
    + (iss.length ? '<ul class="adp-iss">' + iss.join('') + '</ul>' : '') + '<footer>' + foot + '</footer>' + (ST.open[i] ? vTech(r) : '') + '</article>';
}
function vBlocks() {
  const v = ST.view, n = ST.records.length, lk = locked(), byCapo = {}; let out = '', i = 0;
  if (!v) { for (; i < n; i++) out += vRow(i); return out; }
  v.nuclei.forEach(x => { byCapo[x.capo] = x; });
  const block = (titleTxt, idx, nu) => '<section class="adp-nu' + (nu && !nu.ok ? ' bad' : '') + '"><header><h3>' + esc(titleTxt) + '</h3><span class="adp-small">' + plur(idx.length, 'schedina', 'schedine') + '</span>'
    + (nu && !nu.ok ? '<span class="stato annullata">nucleo bloccato</span>' : '') + '</header>' + idx.map(vRow).join('')
    + (nu && (nu.tipo === 'famiglia' || nu.tipo === 'gruppo') && !lk ? '<button type="button" class="adp-btn add" data-a="addm" data-n="' + nu.id + '" data-testid="adp-addm-' + nu.id + '">+ Aggiungi componente</button>' : '') + '</section>';
  while (i < n) {
    const nu = byCapo[i];
    if (nu) { const idx = [nu.capo].concat(nu.membri); out += block(NUCLEO_NOME[nu.tipo] || 'Nucleo', idx, nu); i = Math.max.apply(null, idx) + 1; }
    else { out += block('Senza nucleo', [i], null); i++; }
  }
  return out;
}
function vElenco() {
  const v = ST.view, sm = v && v.riepilogo, lk = locked();
  const chips = !v ? '<span class="stato in_attesa">' + (ST.vBusy ? 'Controllo in corso…' : 'Dati non controllati') + '</span>' : [
    '<span class="adp-chip">' + plur(sm.totale, 'schedina', 'schedine') + '</span>', '<span class="adp-chip">' + plur(v.nuclei.length, 'nucleo', 'nuclei') + '</span>',
    sm.errori ? '<span class="stato annullata">' + plur(sm.errori, 'errore', 'errori') + '</span>' : '<span class="stato confermata">nessun errore</span>',
    sm.avvisi ? '<span class="stato richiesta">' + plur(sm.avvisi, 'avviso', 'avvisi') + '</span>' : ''].join(' ');
  const glob = v ? (v.globali || []).map(g => '<li class="' + (g.sev === 'errore' ? 'e' : 'w') + '">' + esc(g.msg) + (g.fix ? '<small>' + esc(g.fix) + '</small>' : '') + '</li>').join('') : '';
  const ready = v && sm.inviabile ? '<div class="adp-msg ok" data-testid="adp-ready">I controlli sono superati: puoi passare alla verifica con Alloggiati.</div>'
    : v ? '<div class="adp-msg err" data-testid="adp-notready">Ci sono errori da correggere: finché restano, la verifica e l\'invio sono bloccati. Se un nucleo ha un errore, è bloccato per intero.</div>' : '';
  return '<div class="admin-card" data-testid="adp-elenco"><div class="adm-head"><h2>2 · Anteprima e controlli</h2><div class="adp-chips" data-testid="adp-summary">' + chips + '</div></div>'
    + (glob ? '<ul class="adp-iss glob">' + glob + '</ul>' : '') + ready + (lk ? '<div class="adp-msg warn">Elenco bloccato dopo l\'invio: per ricominciare usa «Nuovo elenco» in alto.</div>' : '')
    + '<div class="adp-list" data-testid="adp-list">' + vBlocks() + '</div>'
    + (lk ? '' : '<div class="adm-quick"><button type="button" class="btn btn-line" data-a="add">+ Aggiungi ospite a mano</button><button type="button" class="btn btn-line" data-a="clear" data-testid="adp-clear">Svuota elenco</button></div>') + '</div>';
}
function vVerifica() {
  const v = ST.view, c = ST.check, lk = locked();
  const can = !!(v && v.riepilogo.inviabile) && !ST.busy && !ST.vBusy && !lk;
  let out = '';
  if (c && c.stato === 'test_ok') {
    const hh = c.until ? new Date(c.until).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
    out = '<div class="adp-msg ok" data-testid="adp-check-ok">Il servizio ha accettato tutte le ' + c.schedineValide + ' schedine. Nulla è stato inviato.' + (hh ? '<small>La verifica è valida fino alle ' + esc(hh) + ' e solo per questi dati: se li modifichi va ripetuta.</small>' : '') + '</div>';
  } else if (c && c.stato === 'test_con_errori') {
    out = '<div class="adp-msg err" data-testid="adp-check-ko">Il servizio ha respinto ' + (c.righe ? c.righe.filter(x => x.esito === false).length : '') + ' schedina/e su ' + ST.records.length + '. Correggile (i motivi sono sotto ogni scheda) e ripeti la verifica.'
      + (c.anomalia ? '<small>' + esc(c.anomalia) + '</small>' : '') + '</div>';
  } else if (c) {
    out = '<div class="adp-msg err" data-testid="adp-check-err">' + esc(titolo(c)) + (c.fix ? '<small>' + esc(c.fix) + '</small>' : '') + (c.dettaglio ? '<small>Dettaglio: ' + esc(c.dettaglio) + '</small>' : '')
      + (c.missing && c.missing.length ? '<small>Variabili mancanti: <code>' + c.missing.map(esc).join('</code>, <code>') + '</code></small>' : '') + '</div>';
  }
  return '<div class="admin-card" data-testid="adp-verifica"><h2>3 · Verifica con Alloggiati</h2><p class="book-note">Il Test controlla le schedine con il servizio della Polizia di Stato senza registrarle: non invia nulla. Serve per scoprire eventuali errori prima dell\'invio.</p>'
    + '<div class="adm-quick"><button type="button" class="btn btn-wine' + (ST.busy === 'check' ? ' is-loading' : '') + '" data-a="check"' + (can ? '' : ' disabled') + ' data-testid="adp-check">' + (ST.busy === 'check' ? 'Verifica in corso…' : 'Verifica con Alloggiati (Test)') + '</button></div>'
    + (!can && !c && !lk && v && !v.riepilogo.inviabile ? '<p class="book-note">Correggi prima gli errori segnati nell\'elenco.</p>' : '') + out + '</div>';
}
function vInvio() {
  const c = ST.check, ok = !!(c && c.stato === 'test_ok' && c.proof), n = ST.records.length;
  if (!ok) return '<div class="admin-card adp-off" data-testid="adp-invio"><h2>4 · Conferma e invio</h2><p class="book-note">Disponibile dopo una verifica con Alloggiati andata a buon fine.</p></div>';
  const en = !!(c.send && c.send.enabled), can = en && ST.confirmed && !ST.busy && !ST.vBusy, busy = ST.busy === 'send', nu = ST.view ? ST.view.nuclei.length : 0;
  return '<div class="admin-card" data-testid="adp-invio"><h2>4 · Conferma e invio</h2><p>Stai per inviare <b>' + plur(n, 'schedina', 'schedine') + '</b> (' + plur(nu, 'nucleo', 'nuclei') + ') alla Polizia di Stato. L\'invio non si può annullare da qui.</p>'
    + (en ? '' : '<div class="adp-msg warn" data-testid="adp-send-off">Invio reale disattivato su questo ambiente: ' + esc((c.send && c.send.motivo) || 'non abilitato') + '</div>')
    + '<label class="adp-confirm"><input type="checkbox" data-confirm="1"' + (ST.confirmed ? ' checked' : '') + (en && !busy ? '' : ' disabled') + ' data-testid="adp-confirm"> <span>Ho controllato i dati e confermo l\'invio delle ' + n + ' schedine.</span></label>'
    + '<div class="adm-quick"><button type="button" class="btn btn-wine' + (busy ? ' is-loading' : '') + '" data-a="send"' + (can ? '' : ' disabled') + ' data-testid="adp-send">' + (busy ? 'Invio in corso… non chiudere la pagina' : 'Conferma e invia ad Alloggiati Web') + '</button></div></div>';
}
function vEsiti(righe) {
  return '<ul class="adp-iss esiti">' + righe.map((x, i) => { const r = ST.records[i] || {}, nome = [r.cognome, r.nome].filter(Boolean).join(' ') || 'schedina ' + (i + 1);
    return '<li class="' + (x.esito ? 'k' : 'e') + '"><b>' + (i + 1) + ' · ' + esc(nome) + ':</b> ' + (x.esito ? 'acquisita' : 'respinta — ' + esc(x.des || '') + (x.dett ? ' (' + esc(x.dett) + ')' : '')) + '</li>'; }).join('') + '</ul>';
}
function vRisultato() {
  const r = ST.result; if (!r) return '';
  let cls = 'err', tit = titolo(r);
  if (r.stato === 'inviato') { cls = 'ok'; tit = 'Inviato: ' + plur(r.schedineValide || (r.righe || []).length, 'schedina acquisita', 'schedine acquisite') + ' dal servizio'; }
  else if (r.stato === 'parziale') { cls = 'warn'; tit = 'Invio parziale'; }
  else if (r.stato === 'esito_incerto') { cls = 'warn'; tit = 'Esito dell\'invio incerto'; }
  else if (r.stato === 'rifiutato') tit = 'Nessuna schedina acquisita';
  const istr = (r.istruzioni || []).slice(); if (r.stato === 'prova_gia_usata') istr.push('Un invio con questa stessa verifica potrebbe essere già stato tentato: controlla sul portale Alloggiati Web prima di ripetere.');
  const btn = (a, t, c) => '<button type="button" class="btn ' + (c || 'btn-line') + '" data-a="' + a + '" data-testid="adp-res-' + a + '">' + t + '</button>';
  const acts = r.stato === 'esito_incerto' ? btn('unlock', 'Controllato sul portale: non risultano, torna ai dati') + btn('newlist', 'Risultano comunicate: nuovo elenco')
    : r.stato === 'inviato' || r.stato === 'parziale' ? btn('newlist', 'Nuovo elenco', 'btn-wine') : btn('dismiss', 'Chiudi');
  return '<div class="admin-card adp-res ' + cls + '" role="' + (cls === 'err' ? 'alert' : 'status') + '" data-testid="adp-result" data-stato="' + esc(r.stato) + '"><h2>' + esc(tit) + '</h2>'
    + (r.err && r.stato !== 'rifiutato' ? '<p>' + esc(r.err) + '</p>' : '') + (r.fix ? '<p>' + esc(r.fix) + '</p>' : '') + (r.nota ? '<p>' + esc(r.nota) + '</p>' : '')
    + (istr.length ? '<ul class="adp-list-i">' + istr.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') + (r.dettaglio ? '<p class="adp-small">Dettaglio: ' + esc(r.dettaglio) + '</p>' : '')
    + (r.righe && r.righe.length && (r.stato === 'inviato' || r.stato === 'parziale' || r.stato === 'rifiutato') ? vEsiti(r.righe) : '') + '<div class="adm-quick">' + acts + '</div></div>';
}

// ---------- scheda ospite (finestra di modifica) ----------
// Vive in un livello separato (fuori da #adp-root): i ridisegni della pagina non cancellano ciò che si sta scrivendo.
function openEdit(idx, preset, insertAt) {
  closeEdit();
  const base = idx != null ? Object.assign({}, ST.records[idx]) : emptyRec(preset);
  const dec = idx != null && ST.view && ST.view.records[idx] ? ST.view.records[idx].dec || {} : {};
  M = { idx, insertAt: insertAt == null ? null : insertAt, rec: base, names: { stato: dec.stato || '', cittad: dec.cittad || '', comune: dec.comune || '', luogo: dec.luogo || '' }, dirty: {}, seq: {}, focus: document.activeElement };
  const ov = document.createElement('div'); ov.className = 'adp-modal'; ov.setAttribute('data-testid', 'adp-modal'); ov.innerHTML = formHtml();
  document.body.appendChild(ov); document.body.classList.add('adp-noscroll'); M.ov = ov; wireModal(ov); syncForm();
  if (!ST.docs) loadDocs().then(() => { if (M && M.ov === ov && ST.docs) { const w = $('[data-fld="tipodoc"]', ov), c = $('#f-tipodoc', ov); if (w) { M.rec.tipodoc = c ? c.value.trim() : M.rec.tipodoc; w.innerHTML = docField(); } } });
  const f = ov.querySelector('select,input'); if (f) f.focus();
}
function closeEdit() {
  if (!M) return;
  const f = M.focus; if (M.ov && M.ov.parentNode) M.ov.parentNode.removeChild(M.ov);
  document.body.classList.remove('adp-noscroll'); M = null;
  if (f && f.isConnected && f.focus) { try { f.focus(); } catch (e) { /* niente */ } }
}
const lab = (id, txt) => '<label for="' + id + '">' + txt + '</label>';
const inp = (id, v, a) => '<input id="' + id + '" name="' + id + '" value="' + esc(v) + '" autocomplete="off" ' + (a || '') + '>';
const sel = (id, opts, v) => '<select id="' + id + '" name="' + id + '" autocomplete="off">' + opts.map(o => '<option value="' + esc(o[0]) + '"' + (String(v).trim() === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
const fld = (name, inner, cls) => '<div class="field' + (cls ? ' ' + cls : '') + '" data-fld="' + name + '">' + inner + '</div>';
function docField() {
  const v = String(M.rec.tipodoc || '').trim();
  if (ST.docs) { const opts = [['', '— scegli —']].concat(ST.docs.map(d => [d.codice, d.nome])); if (v && !ST.docs.some(d => d.codice === v)) opts.push([v, 'Codice ' + v]); return lab('f-tipodoc', 'Tipo di documento') + sel('f-tipodoc', opts, v); }
  return lab('f-tipodoc', 'Tipo di documento (codice)') + inp('f-tipodoc', v, 'maxlength="5" placeholder="es. IDENT"') + '<small class="adp-code">Elenco non disponibile: scrivi il codice (controlla la configurazione).</small>';
}
function formHtml() {
  const r = M.rec;
  const cmb = (f, txt, kind) => fld(f, lab('f-' + f, txt) + '<input id="f-' + f + '" name="f-' + f + '" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="lb-' + f + '" autocomplete="off" autocapitalize="characters" spellcheck="false" value="' + esc(M.names[f] || r[f] || '')
    + '" placeholder="Scrivi il nome o il codice" data-kind="' + kind + '"><small class="adp-code" id="cd-' + f + '">' + (r[f] ? 'Codice ' + esc(r[f]) : '') + '</small><ul id="lb-' + f + '" role="listbox" hidden></ul>', 'adp-combo full');
  const giorni = String(r.giorni || '').trim().replace(/^0+(?=\d)/, '');
  return '<div class="adp-sheet" role="dialog" aria-modal="true" aria-labelledby="adp-mt"><div class="adp-sheet-head"><h3 id="adp-mt">' + (M.idx == null ? 'Nuovo ospite' : 'Modifica scheda ' + (M.idx + 1)) + '</h3><button type="button" class="adp-x" data-m="close" aria-label="Chiudi">×</button></div>'
    + '<form id="adp-form" novalidate data-testid="adp-form"><div class="adp-grid">'
    + fld('tipo', lab('f-tipo', 'Tipo di alloggiato') + sel('f-tipo', TIPI, String(r.tipo || '16')), 'full')
    + fld('arrivo', lab('f-arrivo', 'Data di arrivo') + inp('f-arrivo', toIso(r.arrivo), 'type="date"'))
    + fld('giorni', lab('f-giorni', 'Giorni di permanenza') + inp('f-giorni', giorni, 'type="number" inputmode="numeric" min="1" max="30"'))
    + fld('cognome', lab('f-cognome', 'Cognome') + inp('f-cognome', r.cognome, 'maxlength="50" autocapitalize="words" spellcheck="false"'), 'full')
    + fld('nome', lab('f-nome', 'Nome') + inp('f-nome', r.nome, 'maxlength="30" autocapitalize="words" spellcheck="false"'), 'full')
    + fld('sesso', lab('f-sesso', 'Sesso') + sel('f-sesso', [['', '— scegli —'], ['1', 'Maschio'], ['2', 'Femmina']], r.sesso))
    + fld('nascita', lab('f-nascita', 'Data di nascita') + inp('f-nascita', toIso(r.nascita), 'type="date"'))
    + cmb('stato', 'Stato di nascita', 'stato') + cmb('comune', 'Comune di nascita (solo se nato in Italia)', 'comune')
    + fld('prov', lab('f-prov', 'Provincia (sigla)') + inp('f-prov', r.prov, 'maxlength="2" autocapitalize="characters" spellcheck="false"'))
    + cmb('cittad', 'Cittadinanza', 'stato')
    + '<fieldset class="adp-doc full" data-fld="doc"><legend>Documento di identità</legend><div class="adp-grid">' + fld('tipodoc', docField(), 'full') + fld('numdoc', lab('f-numdoc', 'Numero documento') + inp('f-numdoc', r.numdoc, 'maxlength="20" spellcheck="false"'), 'full') + cmb('luogo', 'Luogo di rilascio (stato o comune)', '') + '</div></fieldset>'
    + '</div><p class="adp-small">Per familiari e componenti di un gruppo il documento non va indicato. I campi con elenco si compilano scrivendo qualche lettera e scegliendo un risultato.</p>'
    + '<p class="form-err" id="adp-ferr" role="alert" data-testid="adp-ferr"></p><div class="adp-sheet-foot"><button type="submit" class="btn btn-wine" data-testid="adp-save">Salva</button><button type="button" class="btn btn-line" data-m="close" data-testid="adp-cancel">Annulla</button></div></form></div>';
}
function syncForm() {
  if (!M) return; const ov = M.ov, t = ($('#f-tipo', ov).value || '').trim(), show = (n, on) => { const el = $('[data-fld="' + n + '"]', ov); if (el) el.hidden = !on; };
  show('doc', t === '16' || t === '17' || t === '18' || t === '');
  const foreign = !!(M.rec.stato && M.names.stato && M.names.stato.toUpperCase() !== 'ITALIA'), noStato = !M.rec.stato && !$('#f-stato', ov).value.trim();
  show('comune', !foreign && !noStato); show('prov', !foreign && !noStato);
  if (foreign) { M.rec.comune = ''; M.names.comune = ''; const c = $('#f-comune', ov), p = $('#f-prov', ov), cd = $('#cd-comune', ov); if (c) c.value = ''; if (p) p.value = ''; if (cd) cd.textContent = ''; }
}
const hideList = box => { const ul = $('ul', box), i = $('input', box); if (ul) { ul.hidden = true; ul.innerHTML = ''; } if (i) { i.setAttribute('aria-expanded', 'false'); i.removeAttribute('aria-activedescendant'); } };
const hideLists = () => { if (M) Array.from(M.ov.querySelectorAll('.adp-combo')).forEach(hideList); };
async function lookup(box, q) {
  const my = M, f = box.dataset.fld, i = $('input', box), ul = $('ul', box), n = (my.seq[f] = (my.seq[f] || 0) + 1);
  ul.hidden = false; i.setAttribute('aria-expanded', 'true'); ul.innerHTML = '<li class="adp-opt-info">Cerco…</li>';
  let b = null; try { b = (await api('al_lookup', { q, kind: i.dataset.kind || '' })).body; } catch (e) { if (e.auth) return; }
  if (M !== my || my.seq[f] !== n) return;
  if (!b || b.ok === false) { ul.innerHTML = '<li class="adp-opt-info">Tabelle non disponibili: scrivi il codice a 9 cifre.</li>'; return; }
  if (!b.risultati || !b.risultati.length) { ul.innerHTML = '<li class="adp-opt-info">Nessun risultato</li>'; return; }
  ul.innerHTML = b.risultati.map((x, k) => '<li role="option" id="o-' + f + '-' + k + '" data-code="' + esc(x.codice) + '" data-name="' + esc(x.nome) + '" data-prov="' + esc(x.prov || '') + '">' + esc(x.nome) + (x.prov ? ' (' + esc(x.prov) + ')' : '') + '<small>' + esc(x.codice) + '</small></li>').join('');
}
function onComboInput(i) {
  const box = i.closest('.adp-combo'), f = box.dataset.fld, q = i.value.trim(); M.dirty[f] = true; clearTimeout(M['t' + f]);
  if (q.length < 2) { hideList(box); return; }
  M['t' + f] = setTimeout(() => { if (M) lookup(box, q); }, 220);
}
function pickOpt(li) {
  const box = li.closest('.adp-combo'), f = box.dataset.fld, i = $('input', box), ov = M.ov;
  M.rec[f] = li.dataset.code; M.names[f] = li.dataset.name; M.dirty[f] = false; i.value = li.dataset.name; $('.adp-code', box).textContent = 'Codice ' + li.dataset.code; hideList(box);
  if (f === 'comune' && li.dataset.prov) { const p = $('#f-prov', ov); if (p) p.value = li.dataset.prov; }
  if (f === 'stato') {
    const c = $('#f-cittad', ov);
    if (c && !M.rec.cittad && !c.value.trim()) { M.rec.cittad = li.dataset.code; M.names.cittad = li.dataset.name; M.dirty.cittad = false; c.value = li.dataset.name; $('#cd-cittad', ov).textContent = 'Codice ' + li.dataset.code; }
    syncForm();
  }
  i.focus();
}
function onModalKey(e) {
  const i = e.target.closest && e.target.closest('.adp-combo input'), box = i && i.closest('.adp-combo'), ul = box && $('ul', box), open = !!(ul && !ul.hidden);
  if (e.key === 'Escape') { e.preventDefault(); if (open) hideList(box); else closeEdit(); return; }
  if (i && open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
    const opts = Array.from(ul.querySelectorAll('li[data-code]')); if (!opts.length) return;
    let k = opts.findIndex(o => o.classList.contains('on'));
    if (e.key === 'Enter') { if (k >= 0) { e.preventDefault(); pickOpt(opts[k]); } return; }
    e.preventDefault(); if (k >= 0) opts[k].classList.remove('on'); k = e.key === 'ArrowDown' ? (k + 1) % opts.length : (k <= 0 ? opts.length - 1 : k - 1);
    opts[k].classList.add('on'); i.setAttribute('aria-activedescendant', opts[k].id); return;
  }
  if (e.key === 'Tab' && M) {
    const f = Array.from(M.ov.querySelectorAll('button,input,select')).filter(x => !x.disabled && !x.closest('[hidden]')); if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
}
function wireModal(ov) {
  const form = $('form', ov);
  ov.addEventListener('click', e => { if (e.target.closest('[data-m="close"]')) closeEdit(); else { const li = e.target.closest('li[data-code]'); if (li) pickOpt(li); else if (!e.target.closest('.adp-combo')) hideLists(); } });
  ov.addEventListener('keydown', onModalKey);
  form.addEventListener('submit', e => { e.preventDefault(); saveEdit(); });
  form.addEventListener('change', e => { if (e.target.id === 'f-tipo') syncForm(); });
  form.addEventListener('input', e => { const t = e.target; if (t.id === 'f-prov') t.value = t.value.toUpperCase(); if (t.matches('.adp-combo input')) onComboInput(t); });
}
function saveEdit() {
  const ov = M.ov, g = id => { const el = $('#' + id, ov); return el ? el.value : ''; }, errEl = $('#adp-ferr', ov), hid = n => { const el = $('[data-fld="' + n + '"]', ov); return !!(el && el.hidden); };
  const rec = Object.assign({}, M.rec);
  rec.tipo = g('f-tipo').trim(); rec.arrivo = fromIso(g('f-arrivo')); rec.giorni = g('f-giorni').trim(); rec.cognome = g('f-cognome').trim(); rec.nome = g('f-nome').trim(); rec.sesso = g('f-sesso');
  rec.nascita = fromIso(g('f-nascita')); rec.prov = g('f-prov').trim().toUpperCase(); rec.tipodoc = g('f-tipodoc').trim(); rec.numdoc = g('f-numdoc').trim();
  const nomi = { stato: 'lo stato di nascita', comune: 'il comune di nascita', cittad: 'la cittadinanza', luogo: 'il luogo di rilascio' };
  for (const f of ['stato', 'comune', 'cittad', 'luogo']) {
    const el = $('#f-' + f, ov); if (!el || el.closest('[hidden]')) continue;
    const txt = el.value.trim();
    if (!txt) { rec[f] = ''; continue; }
    if (M.dirty[f]) { if (/^\d{9}$/.test(txt)) rec[f] = txt; else { errEl.textContent = 'Scegli ' + nomi[f] + ' dall\'elenco: scrivi qualche lettera e clicca un risultato.'; el.focus(); return; } }
  }
  if (!rec.tipo) { errEl.textContent = 'Scegli il tipo di alloggiato.'; return; }
  if (rec.tipo === '19' || rec.tipo === '20') { rec.tipodoc = ''; rec.numdoc = ''; rec.luogo = ''; }
  if (hid('comune')) { rec.comune = ''; rec.prov = ''; }
  delete rec.approssimato;                       // la scheda è stata riletta e confermata a mano
  if (M.idx == null) { delete rec.riga; ST.records.splice(M.insertAt == null ? ST.records.length : Math.min(M.insertAt, ST.records.length), 0, rec); }
  else { const old = ST.records[M.idx]; if (old && Number.isInteger(old.riga)) rec.riga = old.riga; ST.records[M.idx] = rec; }
  closeEdit(); mutated(null);
}

// ---------- eventi della pagina ----------
function onClick(e) {
  const a = e.target.closest('[data-a]'); if (!a || !root.contains(a) || a.disabled) return;
  const f = ACT[a.dataset.a]; if (f) { e.preventDefault(); f(a, e); }
}
function onChange(e) {
  const t = e.target;
  if (t.matches('input[data-file]')) { const f = t.files && t.files[0]; t.value = ''; if (f) loadFile(f); return; }
  if (t.matches('input[data-confirm]')) { ST.confirmed = !!t.checked; render(); }
}
function onToggle(e) { if (e.target.matches && e.target.matches('details.adp-det')) ST.statusOpen = e.target.open; }
function mount(el, c) {
  root = el; ctx = Object.assign({ token: () => '', onUnauthorized: () => {} }, c || {});
  root.addEventListener('click', onClick); root.addEventListener('change', onChange); root.addEventListener('toggle', onToggle, true);
  render(); loadStatus(false);
}
function reset() { clearTimeout(ST.timer); ST.seq++; ST = fresh(); closeEdit(); render(); }
// cambiando sezione con la finestra di modifica aperta, la finestra si chiude (non resta orfana sopra un'altra pagina)
window.addEventListener('hashchange', () => { if (M && String(location.hash || '').indexOf('#adempimenti') !== 0) closeEdit(); });
window.addEventListener('beforeunload', e => { if (ST.records.length && !(ST.result && ST.result.stato === 'inviato')) { e.preventDefault(); e.returnValue = ''; } });
window.LCAdempimenti = { mount, reset, lineOf };
})();
