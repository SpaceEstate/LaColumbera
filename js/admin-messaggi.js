// La Columbera · Gestione → Messaggi: conversazioni con gli ospiti del sito, template, messaggi automatici e programmati.
// Tutto si salva subito sul server (chiavi separate dalla configurazione del sito): la barra «Salva modifiche» qui non serve.
// Ogni testo si mostra come testo (mai HTML); i soli indirizzi http(s) diventano link.
// Montato da js/admin.js nella sezione #messaggi (sotto-viste: #messaggi/c/<codice>, #messaggi/template, #messaggi/automatici).
(function () {
'use strict';
const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const linkify = s => esc(s).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
const fmtD = s => s ? new Date(s + 'T12:00:00Z').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
const fmtT = ms => ms ? new Date(ms).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const ago = ms => { if (!ms) return ''; const m = Math.max(0, Math.round((Date.now() - ms) / 60000)); return m < 1 ? 'adesso' : m < 60 ? m + ' min fa' : m < 1440 ? Math.round(m / 60) + ' h fa' : fmtT(ms); };
const fmtCode = c => { c = String(c || ''); return /^[0-9A-Z]{13}$/.test(c) ? c.slice(0, 4) + ' ' + c.slice(4, 8) + ' ' + c.slice(8) : c; };
const LINGUA = { en: 'inglese', de: 'tedesco', fr: 'francese', es: 'spagnolo', nl: 'olandese', pt: 'portoghese', pl: 'polacco' };
const QUANDO = [['conferma', 'Alla conferma della prenotazione'], ['prima', 'Giorni prima dell\'arrivo'], ['arrivo', 'Il giorno dell\'arrivo'], ['dopoArrivo', 'Giorni dopo l\'arrivo'],
  ['primaPartenza', 'Giorni prima della partenza'], ['partenza', 'Il giorno della partenza'], ['dopo', 'Giorni dopo la partenza']];
const quandoDi = r => r.base === 'conferma' ? 'conferma' : r.base === 'arrivo' ? (r.giorni < 0 ? 'prima' : r.giorni > 0 ? 'dopoArrivo' : 'arrivo') : (r.giorni < 0 ? 'primaPartenza' : r.giorni > 0 ? 'dopo' : 'partenza');
const baseDi = (q, n) => ({ conferma: ['conferma', 0], prima: ['arrivo', -n], arrivo: ['arrivo', 0], dopoArrivo: ['arrivo', n], primaPartenza: ['partenza', -n], partenza: ['partenza', 0], dopo: ['partenza', n] }[q] || ['arrivo', 0]);
const conN = q => ['prima', 'dopoArrivo', 'primaPartenza', 'dopo'].includes(q);
const POLL_MS = 30000;

let root = null, ctx = null, timer = null, lastFocus = null, ST = fresh();
function fresh() { return { view: '', code: '', inbox: null, thread: null, tpl: null, vars: [], auto: null, autoDirty: false, tplDirty: false }; }

/* ---------- server ---------- */
async function call(a, b) {
  const r = await fetch('api/x?a=' + a, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: ctx.token() }, body: JSON.stringify(b || {}) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { ctx.onUnauthorized(); throw Object.assign(new Error('Sessione scaduta: accedi di nuovo'), { status: 401 }); }
  if (!r.ok) throw Object.assign(new Error(j.err || 'Servizio non disponibile'), { status: r.status });
  return j;
}
const say = (id, txt, ok) => { const o = $('#' + id, root); if (o) { o.textContent = txt || ''; o.className = 'admin-msg' + (txt ? (ok ? ' ok' : ' warn') : ''); } };
const copia = async v => { try { await navigator.clipboard.writeText(v); return true; } catch { try { const ta = document.createElement('textarea'); ta.value = v; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch { return false; } } };
const apt = id => { const p = (ctx.apts() || []).find(x => x.id === id); return p ? String(p.nome || id).replace('La Columbera ', '') : (id || '—'); };
// prenotazioni per anteprime e copie: quelle confermate del sito e quelle del foglio (Booking, Airbnb, manuali) non ancora finite da più di 7 giorni
function prenotazioni() {
  const oggi = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10), out = [];
  for (const b of ctx.bk() || []) if (b.stato === 'confermata' && String(b.a) >= oggi) out.push({ code: b.code, lab: 'Sito · ' + (b.nome || b.code) + ' · ' + apt(b.id) + ' · ' + fmtD(b.da) + '→' + fmtD(b.a), da: b.da });
  for (const r of ctx.reg() || []) if (r.fonte !== 'SITO' && String(r.a) >= oggi) out.push({ code: r.codice, lab: ({ BOOKING: 'Booking', AIRBNB: 'Airbnb' }[r.fonte] || 'Foglio') + ' · ' + r.codice + ' · ' + apt(r.apt) + ' · ' + fmtD(r.da) + '→' + fmtD(r.a), da: r.da });
  return out.sort((x, y) => String(x.da).localeCompare(String(y.da)));
}

/* ---------- conversazioni ---------- */
function vInbox() {
  const x = ST.inbox;
  if (!x) return '<div class="admin-card"><p class="book-note">Carico le conversazioni…</p></div>';
  const rows = x.conversazioni.map(c => `<a class="msg-row${c.nonLetti ? ' unread' : ''}" href="#messaggi/c/${esc(c.code)}" data-testid="msg-conv-${esc(c.code)}">
    <span class="msg-who"><b>${esc(c.nome || fmtCode(c.code))}</b><small>${esc(apt(c.apt))}${c.dal ? ' · ' + esc(fmtD(c.dal)) + ' → ' + esc(fmtD(c.al)) : ''}${c.stato && c.stato !== 'confermata' ? ' · ' + esc(c.stato) : ''}</small></span>
    <span class="msg-last">${c.da === 'ospite' ? '' : (c.da === 'auto' ? 'Automatico: ' : 'Tu: ')}${esc(c.anteprima)}</span>
    <span class="msg-when">${esc(ago(c.ts))}${c.nonLetti ? `<span class="adm-badge">${c.nonLetti}</span>` : ''}</span></a>`).join('');
  return `<div class="admin-card" data-testid="msg-inbox"><div class="adm-head"><h2>Messaggi</h2><div class="adm-top-actions"><a class="btn btn-line" href="#messaggi/template" data-testid="msg-go-tpl">Template</a><a class="btn btn-line" href="#messaggi/automatici" data-testid="msg-go-auto">Automatici</a></div></div>
   <p class="book-note">Le conversazioni con chi ha prenotato sul sito. L'ospite le legge nell'area ospiti, nella sua lingua${x.traduzione ? '' : ' (traduzione automatica non attiva: serve DEEPL_API_KEY su Vercel)'}. Gli ospiti di Booking e Airbnb ti scrivono sulla loro piattaforma: per loro i template si compilano e si copiano (Template).</p>
   <div class="msg-list" data-testid="msg-list">${rows || '<p class="book-note">Nessuna conversazione per ora.</p>'}</div>
   ${x.senza.length ? `<h3>Scrivi per primo a un ospite</h3><div class="msg-bar"><select id="msg-new" aria-label="Prenotazione" data-testid="msg-new">${x.senza.map(b => `<option value="${esc(b.code)}">${esc((b.nome || b.code) + ' · ' + apt(b.apt) + ' · ' + fmtD(b.dal) + ' → ' + fmtD(b.al))}</option>`).join('')}</select><button type="button" class="btn btn-line" data-act="newConv">Apri la conversazione</button></div>` : ''}</div>`;
}
function vThread() {
  const x = ST.thread, code = ST.code;
  if (!x) return '<div class="admin-card"><p class="book-note">Carico la conversazione…</p></div>';
  const p = x.prenotazione || {}, lg = x.lingua && x.lingua !== 'it' ? x.lingua : '';
  const tpls = (ST.tpl || []).map(t => `<option value="${esc(t.id)}">${esc(t.nome)}</option>`).join('');
  return `<div class="admin-card" data-testid="msg-thread"><a class="link-btn" href="#messaggi">← Tutte le conversazioni</a>
   <div class="adm-head"><div><h2>${esc(p.nome || fmtCode(code))}</h2><p class="book-note">${esc(apt(p.apt))} · ${esc(fmtD(p.dal))} → ${esc(fmtD(p.al))} · ${esc(p.ospiti || '')} ospiti · codice <b>${esc(fmtCode(code))}</b>${p.email ? ' · <a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a>' : ''}${p.tel ? ' · <a href="tel:' + esc(String(p.tel).replace(/[^\d+]/g, '')) + '">' + esc(p.tel) + '</a>' : ''}${lg ? ' · usa l\'area in ' + esc(LINGUA[lg] || lg) : ''}</p></div></div>
   <div class="msg-thread" id="msg-thread" data-testid="msg-messages">${threadHtml(x)}</div>
   ${x.scrivibile ? `<form id="msg-reply" class="msg-compose" novalidate>
    <div class="msg-bar"><select id="msg-tpl" aria-label="Inserisci un template" data-testid="msg-tpl-pick"><option value="">Inserisci un template…</option>${tpls}</select></div>
    <div class="field"><label for="msg-testo">Risposta</label><textarea id="msg-testo" rows="4" maxlength="2000" data-testid="msg-testo"></textarea></div>
    ${x.traduzione && lg ? `<label class="msg-check"><input type="checkbox" id="msg-traduci" checked data-testid="msg-traduci"> Traduci anche in ${esc(LINGUA[lg] || lg)} (l'ospite vede la traduzione e, se vuole, il tuo testo originale)</label>` : ''}
    <div class="msg-bar"><button class="btn btn-wine" data-testid="msg-invia">Invia</button><button type="button" class="btn btn-line" data-act="progOpen" data-testid="msg-prog-open">Programma l'invio…</button></div>
    <div class="msg-bar" id="msg-prog" hidden><label for="msg-quando">Invia il</label><input type="datetime-local" id="msg-quando" data-testid="msg-quando"><button type="button" class="btn btn-line" data-act="progOk" data-testid="msg-prog-ok">Programma</button></div>
    <p class="admin-msg" id="msg-out" data-testid="msg-out"></p></form>` : '<p class="book-note">La prenotazione non è confermata: la conversazione resta leggibile ma non si può più scrivere.</p>'}</div>`;
}
function threadHtml(x) {
  if (!x.messaggi.length) return '<p class="book-note">Nessun messaggio: scrivi tu il primo.</p>';
  return x.messaggi.map(m => {
    const me = m.da !== 'ospite', tr = m.tradotto, main = me ? m.testo : (tr || m.testo), alt = me ? tr : (tr ? m.testo : '');
    const meta = me ? [m.da === 'auto' ? 'Automatico' : 'Tu', fmtT(m.ts), m.letto ? '✓✓ letto' : 'inviato'] : ['Ospite', fmtT(m.ts)];
    return `<div class="ga-msg ${me ? 'me' : 'them'}" data-testid="msg-m-${esc(m.id)}"><div class="ga-bubble">${linkify(main)}</div>
     <div class="ga-meta">${meta.map(esc).join(' · ')}${alt ? ` · <button type="button" class="link-btn" data-alt="${esc(m.id)}">${me ? 'come lo legge l\'ospite' : 'originale' + (m.lingua && LINGUA[m.lingua] ? ' (' + LINGUA[m.lingua] + ')' : '')}</button>` : ''}</div>
     ${alt ? `<div class="ga-orig" id="msg-alt-${esc(m.id)}" hidden>${linkify(alt)}</div>` : ''}</div>`;
  }).join('');
}
const paintThread = () => { const el = $('#msg-thread', root); if (!el || !ST.thread) return; const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80; el.innerHTML = threadHtml(ST.thread); if (near) el.scrollTop = el.scrollHeight; };

/* ---------- template ---------- */
function vTpl() {
  if (!ST.tpl) return '<div class="admin-card"><p class="book-note">Carico i template…</p></div>';
  const opts = prenotazioni().map(b => `<option value="${esc(b.code)}">${esc(b.lab)}</option>`).join('');
  return `<div class="admin-card" data-testid="msg-tpl"><a class="link-btn" href="#messaggi">← Messaggi</a>
   <div class="adm-head"><h2>Template</h2><button type="button" class="btn btn-wine" data-act="tplSave" data-testid="msg-tpl-save">Salva template</button></div>
   <p class="book-note">Testi pronti: si inseriscono nelle risposte, si usano nei messaggi automatici o si compilano per una prenotazione e si incollano nella chat di Booking e Airbnb. Le variabili tra graffe si riempiono da sole (clicca per inserirle nel testo su cui stai scrivendo); una variabile vuota sparisce, per esempio il nome per una prenotazione Booking.</p>
   <div class="msg-vars">${ST.vars.map(([k, d]) => `<button type="button" class="adm-chip" data-var="${esc(k)}" title="${esc(d)}">{${esc(k)}}</button>`).join('')}</div>
   ${ST.tpl.map((x, i) => `<div class="msg-tpl" data-i="${i}" data-testid="msg-tpl-${i}">
     <div class="field"><label>Nome</label><input data-tf="nome" data-i="${i}" value="${esc(x.nome)}" maxlength="80"></div>
     <div class="field"><label>Testo</label><textarea data-tf="testo" data-i="${i}" rows="5" maxlength="2000">${esc(x.testo)}</textarea></div>
     <div class="msg-bar"><select data-tprev="${i}" aria-label="Prenotazione per l'anteprima"><option value="">Compila per una prenotazione…</option>${opts}</select><button type="button" class="btn btn-line" data-act="tplFill" data-i="${i}" data-testid="msg-tpl-fill-${i}">Compila e copia</button><button type="button" class="stato-select" data-act="tplDel" data-i="${i}">Elimina</button></div>
     <pre class="msg-prev" id="msg-prev-${i}" hidden data-testid="msg-tpl-prev-${i}"></pre></div>`).join('')}
   <div class="msg-bar"><button type="button" class="btn btn-line" data-act="tplAdd" data-testid="msg-tpl-add">+ Nuovo template</button><span class="admin-msg" id="tpl-out" data-testid="msg-tpl-out"></span></div></div>`;
}

/* ---------- messaggi automatici ---------- */
function vAuto() {
  const x = ST.auto;
  if (!x) return '<div class="admin-card"><p class="book-note">Carico le regole…</p></div>';
  const tplOpt = sel => x.templates.map(t => `<option value="${esc(t.id)}"${t.id === sel ? ' selected' : ''}>${esc(t.nome)}</option>`).join('');
  const aptOpt = sel => '<option value="">Tutti gli appartamenti</option>' + (ctx.apts() || []).map(p => `<option value="${esc(p.id)}"${p.id === sel ? ' selected' : ''}>${esc(apt(p.id))}</option>`).join('');
  const rules = x.regole.map((r, i) => {
    const q = quandoDi(r), n = Math.abs(r.giorni) || 1;
    return `<div class="msg-rule${r.attiva ? ' on' : ''}" data-testid="msg-rule-${i}">
     <div class="msg-rule-top"><label class="msg-check"><input type="checkbox" data-rf="attiva" data-i="${i}"${r.attiva ? ' checked' : ''} data-testid="msg-rule-attiva-${i}"> Attiva</label>
      <input class="msg-rule-name" data-rf="nome" data-i="${i}" value="${esc(r.nome)}" maxlength="80" aria-label="Nome della regola"><button type="button" class="stato-select" data-act="ruleDel" data-i="${i}">Elimina</button></div>
     <div class="fields-grid">
      <div class="field"><label>Template</label><select data-rf="tpl" data-i="${i}">${tplOpt(r.tpl)}</select></div>
      <div class="field"><label>Quando</label><select data-rf="quando" data-i="${i}" data-testid="msg-rule-quando-${i}">${QUANDO.map(([k, l]) => `<option value="${k}"${k === q ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      ${conN(q) ? `<div class="field"><label>Quanti giorni</label><input type="number" min="1" max="60" data-rf="n" data-i="${i}" value="${n}" data-testid="msg-rule-n-${i}"></div>` : ''}
      ${q !== 'conferma' ? `<div class="field"><label>Alle (ora di Trento)</label><input type="time" data-rf="ora" data-i="${i}" value="${esc(r.ora || '10:00')}" data-testid="msg-rule-ora-${i}"></div>` : ''}
      <div class="field"><label>Appartamento</label><select data-rf="apt" data-i="${i}">${aptOpt(r.apt)}</select></div>
      <div class="field"><label>Soggiorni di almeno</label><div class="adm-inp"><input type="number" min="0" max="60" data-rf="nottiMin" data-i="${i}" value="${r.nottiMin || 0}" style="max-width:80px"><span>notti</span></div></div></div>
     ${q !== 'conferma' ? `<label class="msg-check"><input type="checkbox" data-rf="ritardo" data-i="${i}"${r.ritardo ? ' checked' : ''}> Se la prenotazione arriva quando quel momento è già passato, invia subito (finché ha senso)</label>` : ''}</div>`;
  }).join('');
  const pr = x.prossimi.map(p => `<tr data-testid="msg-next-${esc(p.regola)}-${esc(p.code)}"><td data-label="Quando">${esc(fmtT(p.quando))}</td><td data-label="Ospite">${esc(p.nome || fmtCode(p.code))}<br><small>${esc(apt(p.apt))} · ${esc(fmtD(p.dal))} → ${esc(fmtD(p.al))}</small></td><td data-label="Regola">${esc(p.nomeRegola)}<br><small>${esc(p.template)}</small></td><td class="td-azioni">${p.stato === 'saltato' ? `<span class="stato annullata">saltato</span> <button type="button" class="stato-select" data-act="unskip" data-r="${esc(p.regola)}" data-c="${esc(p.code)}">Ripristina</button>` : `<button type="button" class="stato-select" data-act="skip" data-r="${esc(p.regola)}" data-c="${esc(p.code)}" data-testid="msg-skip-${esc(p.regola)}-${esc(p.code)}">Salta</button>`}</td></tr>`).join('');
  const pg = x.programmati.map(p => `<tr><td data-label="Quando">${esc(fmtT(Date.parse(p.quando)))}</td><td data-label="Ospite">${esc(p.nome || fmtCode(p.code))} · ${esc(apt(p.apt))}</td><td data-label="Messaggio">${esc(String(p.testo).slice(0, 120))}</td><td class="td-azioni"><button type="button" class="stato-select" data-act="progDel" data-id="${esc(p.id)}">Annulla</button></td></tr>`).join('');
  const im = x.impostazioni;
  return `<div class="admin-card" data-testid="msg-auto"><a class="link-btn" href="#messaggi">← Messaggi</a>
   <div class="adm-head"><h2>Messaggi automatici</h2><button type="button" class="btn btn-wine" data-act="autoSave" data-testid="msg-auto-save">Salva regole</button></div>
   <p class="book-note">Partono da soli alle prenotazioni del sito confermate, a ogni sincronizzazione (ogni pochi minuti), nella lingua dell'ospite se la traduzione è attiva. Una regola appena attivata vale per i prossimi invii: non manda messaggi arretrati. Ogni messaggio parte una volta sola per prenotazione. L'ospite lo legge nell'area ospiti${im.avvisaOspite ? ' e riceve un avviso via email' : ' (puoi attivare qui sotto l\'avviso via email)'}.</p>
   <div class="msg-rules">${rules || '<p class="book-note">Nessuna regola: aggiungine una.</p>'}</div>
   <div class="msg-bar"><button type="button" class="btn btn-line" data-act="ruleAdd" data-testid="msg-rule-add">+ Nuova regola</button><span class="admin-msg" id="auto-out" data-testid="msg-auto-out"></span></div>
   <h3>Prossimi invii (7 giorni)</h3>
   <div class="table-wrap tw-stack"><table class="data stack" data-testid="msg-next"><thead><tr><th>Quando</th><th>Ospite</th><th>Regola</th><th></th></tr></thead><tbody>${pr || '<tr><td colspan="4" class="td-empty">Nessun invio nei prossimi 7 giorni.</td></tr>'}</tbody></table></div>
   <h3>Messaggi programmati a mano</h3>
   <div class="table-wrap tw-stack"><table class="data stack"><thead><tr><th>Quando</th><th>Ospite</th><th>Messaggio</th><th></th></tr></thead><tbody>${pg || '<tr><td colspan="4" class="td-empty">Nessun messaggio programmato (si programma dalla conversazione).</td></tr>'}</tbody></table></div>
   <h3>Impostazioni</h3>
   <div class="fields-grid"><div class="field"><label for="msg-cons">Conservazione delle conversazioni</label><div class="adm-inp"><input id="msg-cons" type="number" min="7" max="730" value="${esc(im.conservazione)}" style="max-width:90px" data-testid="msg-cons"><span>giorni dopo la partenza</span></div></div></div>
   <label class="msg-check"><input type="checkbox" id="msg-avv-h"${im.avvisaTitolare ? ' checked' : ''}> Avvisami via email quando un ospite scrive (al massimo un'email ogni 15 minuti per conversazione)</label>
   <label class="msg-check"><input type="checkbox" id="msg-avv-o"${im.avvisaOspite ? ' checked' : ''} data-testid="msg-avv-o"> Avvisa l'ospite via email quando gli scrivi (al massimo un'email ogni 6 ore, con il link all'area ospiti)</label>
   <p class="book-note">Traduzione automatica: ${x.traduzione ? '<b>attiva</b> (DeepL).' : '<b>non attiva</b>: per attivarla imposta la variabile DEEPL_API_KEY su Vercel (vedi docs/messaggi.md). Senza, i messaggi partono e si leggono in italiano.'}</p>
   <div class="msg-bar"><button type="button" class="btn btn-line" data-act="impSave" data-testid="msg-imp-save">Salva impostazioni</button><span class="admin-msg" id="imp-out"></span></div></div>`;
}

/* ---------- disegno e caricamento ---------- */
function render() {
  if (!root) return;
  root.innerHTML = ST.view === 'thread' ? vThread() : ST.view === 'tpl' ? vTpl() : ST.view === 'auto' ? vAuto() : vInbox();
  if (ST.view === 'thread') { const el = $('#msg-thread', root); if (el) el.scrollTop = el.scrollHeight; }
}
async function loadInbox(quiet) {
  try { const x = await call('msg_inbox'); ST.inbox = x; ctx.onBadge(x.nonLetti); if (ST.view === 'inbox') { if (quiet) { const l = $('[data-testid=msg-list]', root); if (!l || l.contains(document.activeElement)) return; } render(); } }
  catch (e) { if (!quiet && ST.view === 'inbox') root.innerHTML = `<div class="admin-card"><p class="form-err">${esc(e.message)}</p></div>`; }
}
async function loadThread(quiet) {
  const code = ST.code, prev = ST.thread;
  try {
    const x = await call('msg_thread', quiet && prev ? { code, v: prev.v, lo: prev.lo } : { code });
    if (ST.code !== code || ST.view !== 'thread') return;
    if (x.invariato) return;
    ST.thread = x;
    if (quiet) paintThread(); else render();
    call('msg_inbox').then(i => { ST.inbox = i; ctx.onBadge(i.nonLetti); }).catch(() => {});
  } catch (e) { if (!quiet) root.innerHTML = `<div class="admin-card"><a class="link-btn" href="#messaggi">← Tutte le conversazioni</a><p class="form-err">${esc(e.message)}</p></div>`; }
}
async function loadTpl() { const x = await call('msg_tpl'); ST.tpl = x.templates; ST.vars = x.variabili || []; }
async function loadAuto() { ST.auto = await call('msg_auto'); ST.autoDirty = false; }
function poll() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (!root) return;
    if (document.visibilityState === 'visible') { if (ST.view === 'thread') await loadThread(true); else if (ST.view === 'inbox') await loadInbox(true); }
    poll();
  }, POLL_MS);
}

/* ---------- azioni ---------- */
const ACT = {
  newConv: () => { const v = $('#msg-new', root); if (v && v.value) location.hash = '#messaggi/c/' + v.value; },
  progOpen: () => { const p = $('#msg-prog', root); if (p) p.hidden = !p.hidden; },
  progOk: async a => {
    const v = ($('#msg-testo', root).value || '').trim(), q = $('#msg-quando', root).value;
    if (!v) { say('msg-out', 'Scrivi prima il messaggio da programmare'); return; }
    if (!q) { say('msg-out', 'Scegli giorno e ora'); return; }
    a.disabled = true;
    try { await call('msg_prog_add', { code: ST.code, testo: v, quando: new Date(q).toISOString() }); $('#msg-testo', root).value = ''; $('#msg-prog', root).hidden = true; say('msg-out', 'Programmato per ' + fmtT(Date.parse(new Date(q).toISOString())) + ': lo trovi in Automatici → Messaggi programmati.', true); }
    catch (e) { say('msg-out', e.message); } finally { a.disabled = false; }
  },
  tplAdd: () => { ST.tpl.push({ id: '', nome: 'Nuovo template', testo: '' }); ST.tplDirty = true; render(); const t = $$('[data-tf=testo]', root).pop(); if (t) t.focus(); },
  tplDel: a => { const i = +a.dataset.i; if (!confirm('Eliminare il template «' + ST.tpl[i].nome + '»?')) return; ST.tpl.splice(i, 1); ST.tplDirty = true; render(); say('tpl-out', 'Ricordati di salvare'); },
  tplSave: async a => {
    a.disabled = true; say('tpl-out', 'Salvo…', true);
    try { ST.tpl = (await call('msg_tpl_save', { templates: ST.tpl })).templates; ST.tplDirty = false; render(); say('tpl-out', 'Template salvati.', true); }
    catch (e) { say('tpl-out', e.message); } finally { const b = $('[data-act=tplSave]', root); if (b) b.disabled = false; }
  },
  tplFill: async a => {
    const i = +a.dataset.i, code = $(`[data-tprev="${i}"]`, root).value, pv = $('#msg-prev-' + i, root);
    if (!code) { say('tpl-out', 'Scegli prima la prenotazione'); return; }
    try { const x = await call('msg_fill', { code, testo: ST.tpl[i].testo }); pv.textContent = x.testo; pv.hidden = false; const ok = await copia(x.testo); say('tpl-out', ok ? 'Testo compilato e copiato: incollalo nella chat.' : 'Testo compilato (copia non riuscita: selezionalo a mano).', ok); }
    catch (e) { say('tpl-out', e.message); }
  },
  ruleAdd: () => { const t = (ST.auto.templates[0] || {}).id || ''; ST.auto.regole.push({ id: '', nome: 'Nuovo messaggio automatico', attiva: false, tpl: t, base: 'arrivo', giorni: -2, ora: '10:00', apt: '', nottiMin: 0, ritardo: false }); ST.autoDirty = true; render(); say('auto-out', 'Regola aggiunta: sceglila, attivala e salva.'); },
  ruleDel: a => { const i = +a.dataset.i; if (!confirm('Eliminare la regola «' + ST.auto.regole[i].nome + '»?')) return; ST.auto.regole.splice(i, 1); ST.autoDirty = true; render(); say('auto-out', 'Ricordati di salvare'); },
  autoSave: async a => {
    a.disabled = true; say('auto-out', 'Salvo…', true);
    try { await call('msg_auto_save', { regole: ST.auto.regole }); await loadAuto(); render(); say('auto-out', 'Regole salvate.', true); }
    catch (e) { say('auto-out', e.message); } finally { const b = $('[data-act=autoSave]', root); if (b) b.disabled = false; }
  },
  skip: async a => { try { await call('msg_salta', { regola: a.dataset.r, code: a.dataset.c }); await loadAuto(); render(); } catch (e) { say('auto-out', e.message); } },
  unskip: async a => { try { await call('msg_salta', { regola: a.dataset.r, code: a.dataset.c, salta: false }); await loadAuto(); render(); } catch (e) { say('auto-out', e.message); } },
  progDel: async a => { if (!confirm('Annullare questo messaggio programmato?')) return; try { await call('msg_prog_del', { id: a.dataset.id }); await loadAuto(); render(); } catch (e) { say('auto-out', e.message); } },
  impSave: async () => {
    try { ST.auto.impostazioni = await call('msg_imp_save', { conservazione: +$('#msg-cons', root).value, avvisaTitolare: $('#msg-avv-h', root).checked, avvisaOspite: $('#msg-avv-o', root).checked }); say('imp-out', 'Impostazioni salvate.', true); }
    catch (e) { say('imp-out', e.message); }
  }
};
async function onSubmit(e) {
  if (e.target.id !== 'msg-reply') return;
  e.preventDefault();
  const ta = $('#msg-testo', root), btn = e.target.querySelector('[data-testid=msg-invia]'), v = (ta.value || '').trim(), tr = $('#msg-traduci', root);
  if (!v || btn.disabled) return;
  btn.disabled = true; say('msg-out', 'Invio…', true);
  try { await call('msg_reply', { code: ST.code, testo: v, traduci: tr ? tr.checked : false }); ta.value = ''; say('msg-out', ''); await loadThread(false); }
  catch (er) { say('msg-out', er.message); } finally { const b = $('[data-testid=msg-invia]', root); if (b) b.disabled = false; }
}
async function onChange(e) {
  const el = e.target;
  if (el.id === 'msg-tpl' && el.value) {      // template nella risposta: compilato per questa prenotazione
    const t = (ST.tpl || []).find(x => x.id === el.value); el.value = '';
    if (!t) return;
    try { const x = await call('msg_fill', { code: ST.code, testo: t.testo }), ta = $('#msg-testo', root); ta.value = (ta.value ? ta.value.replace(/\s*$/, '\n\n') : '') + x.testo; ta.focus(); }
    catch (er) { say('msg-out', er.message); }
    return;
  }
  const rf = el.dataset.rf;
  if (rf && ST.auto) {
    const r = ST.auto.regole[+el.dataset.i]; if (!r) return;
    if (rf === 'quando' || rf === 'n') {
      const q = rf === 'quando' ? el.value : quandoDi(r), n = rf === 'n' ? Math.max(1, Math.min(60, +el.value || 1)) : Math.max(1, Math.abs(r.giorni) || 1), [b, g] = baseDi(q, n);
      r.base = b; r.giorni = g; if (b !== 'conferma' && !r.ora) r.ora = '10:00';
      if (rf === 'quando') { ST.autoDirty = true; render(); say('auto-out', 'Ricordati di salvare'); return; }
    } else if (rf === 'attiva' || rf === 'ritardo') r[rf] = el.checked;
    else if (rf === 'nottiMin') r.nottiMin = Math.max(0, +el.value || 0);
    else r[rf] = el.value;
    ST.autoDirty = true; say('auto-out', 'Modifiche non salvate'); const c = el.closest('.msg-rule'); if (c && rf === 'attiva') c.classList.toggle('on', el.checked);
  }
}
function onInput(e) {
  const el = e.target, tf = el.dataset.tf;
  if (tf && ST.tpl) { const x = ST.tpl[+el.dataset.i]; if (x) { x[tf] = el.value; ST.tplDirty = true; say('tpl-out', 'Modifiche non salvate'); } }
  if (el.dataset.rf === 'nome' && ST.auto) { const r = ST.auto.regole[+el.dataset.i]; if (r) { r.nome = el.value; ST.autoDirty = true; } }
}
function onClick(e) {
  const v = e.target.closest('[data-var]');
  if (v && root.contains(v)) {      // variabile: nel testo su cui si stava scrivendo, al punto del cursore
    const ta = lastFocus && root.contains(lastFocus) ? lastFocus : $('[data-tf=testo]', root); if (!ta) return;
    const s = ta.selectionStart == null ? ta.value.length : ta.selectionStart, k = '{' + v.dataset.var + '}';
    ta.value = ta.value.slice(0, s) + k + ta.value.slice(ta.selectionEnd == null ? s : ta.selectionEnd); ta.focus(); ta.selectionStart = ta.selectionEnd = s + k.length;
    ta.dispatchEvent(new Event('input', { bubbles: true })); return;
  }
  const alt = e.target.closest('[data-alt]'); if (alt) { const o = $('#msg-alt-' + alt.dataset.alt, root); if (o) o.hidden = !o.hidden; return; }
  const a = e.target.closest('[data-act]'); if (!a || !root.contains(a) || a.disabled) return;
  const f = ACT[a.dataset.act]; if (f) { e.preventDefault(); f(a, e); }
}
const onFocus = e => { if (e.target && e.target.matches && e.target.matches('textarea[data-tf=testo]')) lastFocus = e.target; };

/* ---------- montaggio (da admin.js) ---------- */
// sub: '' (conversazioni) · 'c' + arg (una conversazione) · 'template' · 'automatici'
async function mount(el, c, sub, arg) {
  if (root !== el) {
    if (root) unmount();
    root = el; ctx = c;
    root.addEventListener('click', onClick); root.addEventListener('change', onChange); root.addEventListener('input', onInput); root.addEventListener('submit', onSubmit); root.addEventListener('focusin', onFocus);
  }
  const view = sub === 'c' && arg ? 'thread' : sub === 'template' ? 'tpl' : sub === 'automatici' ? 'auto' : 'inbox';
  const code = view === 'thread' ? String(arg).toUpperCase() : '';
  if (view === ST.view && code === ST.code && view !== 'inbox') return;
  ST.view = view; ST.code = code; if (view === 'thread') ST.thread = null;
  render();
  try {
    if (view === 'thread') { if (!ST.tpl) await loadTpl(); await loadThread(false); }
    else if (view === 'tpl') { await loadTpl(); render(); }
    else if (view === 'auto') { await loadAuto(); render(); }
    else await loadInbox(false);
  } catch (e) { if (root) root.innerHTML = `<div class="admin-card"><p class="form-err">${esc(e.message)}</p></div>`; }
  poll();
}
function unmount() {
  clearTimeout(timer); timer = null;
  if (root) { root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); root.removeEventListener('input', onInput); root.removeEventListener('submit', onSubmit); root.removeEventListener('focusin', onFocus); }
  root = null; ST.view = ''; ST.code = '';
}
const dirty = () => !!(ST.tplDirty || ST.autoDirty);
function reset() { unmount(); ST = fresh(); }
window.LCMessaggi = { mount, unmount, reset, dirty };
})();
