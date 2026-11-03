'use strict';
// La Columbera · prove dei MESSAGGI (area clienti ↔ Gestione), dei template, dei messaggi automatici e della traduzione.
// Stesso banco di prova di sicurezza.js: codice REALE di Vercel, Redis finto, Stripe, SMTP, DeepL e Cloudflare finti, orologio simulato. Dati di fantasia.
//
//   cd <repo> && node tests/sim/messaggi.js [filtro]      (serve wasmoon, come per scenarios.js)
const assert = require('assert'), H = require('./harness'), { clock, kv, MIN } = H;
const eq = (a, b, m) => assert.deepStrictEqual(a, b, m);
const HDR = ['Numero Prenotazione', 'Data Check-in', 'Appartamento', 'Numero Ospiti', 'Numero Notti'];

async function base(env) {
  const e = await H.newEnv({ legacyRows: [HDR], env: Object.assign({ ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw' }, env || {}) });
  await H.runGas(e.gas, 'setup'); await H.sync();
  return e;
}
const regAirbnb = () => {      // una prenotazione Airbnb nel registro del foglio (lo stub dello script non lo popola)
  const snap = JSON.parse(kv.exec(['GET', 'reg:snap']) || '{"rows":[]}');
  snap.rows = [{ id: 'AIRBNB|HMSEDESZCW', fonte: 'AIRBNB', codice: 'HMSEDESZCW', apt: 'corte', checkin: '2026-10-05', checkout: '2026-10-11', notti: 6, ospiti: 2, stato: 'CONFERMATA', uid: '', motivo: '', creata: '', aggiornata: '', ultimoSeen: '', annullata: '', note: '', flags: [] }];
  kv.exec(['SET', 'reg:snap', JSON.stringify(Object.assign({ invalid: [], count: 1, lastAttempt: clock.iso(), lastSuccess: clock.iso(), status: 'OK' }, snap))]);
};
let ipN = 0;
const as = () => ({ headers: { 'x-real-ip': '203.0.113.' + (++ipN % 250) } });
const ospite = (a, body) => H.api(a, body, as());
async function confermata(o) {        // prenotazione del sito pagata e confermata: { code, t }
  const c = await H.api('checkout', Object.assign({ id: 'torre', da: '2026-12-10', a: '2026-12-13', ospiti: 2, nome: 'Mario Prova', email: 'mario.prova@esempio.it' }, o), as());
  eq(c.status, 200, JSON.stringify(c.body));
  await H.webhook('checkout.session.completed', H.paidSession(c.body.code));
  global.__mails.length = 0;
  return c.body;
}
const sync = () => H.sync();
const thread = async code => (await H.adminApi('msg_thread', { code })).body;
const mailsTo = to => global.__mails.filter(m => m.to === to);
async function logs(fn) {
  const out = [], o = {}; for (const k of ['log', 'warn', 'error', 'info']) { o[k] = console[k]; console[k] = (...a) => out.push(a.map(String).join(' ')); }
  try { await fn(); } finally { Object.assign(console, o); }
  return out.join('\n');
}
const tests = [], test = (n, f) => tests.push({ n, f });

test('M1  ospite e titolare si scrivono: lettura, non letti, «letto», versione (il controllo periodico legge una sola chiave)', async () => {
  await base();
  const c = await confermata();
  let r = await ospite('mie', { code: c.code, t: c.t });
  eq(r.body.soggiorno.messaggi, { attivi: true, nonLetti: 0, email: true });      // email: le risposte arrivano anche via email (l'area lo dice)
  r = await ospite('msg_send', { code: c.code, t: c.t, testo: '  Ciao, a che ora possiamo arrivare?\r\n\r\n\r\n\r\n\r\nGrazie\u0007 ', lingua: 'it' });
  eq(r.status, 200, JSON.stringify(r.body)); eq(r.body.testo, 'Ciao, a che ora possiamo arrivare?\n\n\nGrazie', 'testo ripulito (a capo, caratteri di controllo)');
  let inb = (await H.adminApi('msg_inbox', {})).body;
  eq([inb.nonLetti, inb.conversazioni.length, inb.conversazioni[0].code, inb.conversazioni[0].nome, inb.conversazioni[0].nonLetti], [1, 1, c.code, 'Mario Prova', 1]);
  eq((await H.adminApi('adm', {})).body.msgNonLetti, 1, 'badge del menu');
  let th = await thread(c.code);
  eq([th.messaggi.length, th.messaggi[0].da, th.scrivibile, th.prenotazione.email], [1, 'ospite', true, 'mario.prova@esempio.it']);
  eq((await H.adminApi('msg_inbox', {})).body.nonLetti, 0, 'aperta la conversazione: letta');
  r = await H.adminApi('msg_reply', { code: c.code, testo: 'Dalle 16:00, vi aspettiamo!' });
  eq(r.status, 200); eq(r.body.da, 'host');
  r = await ospite('mie', { code: c.code, t: c.t }); eq(r.body.soggiorno.messaggi.nonLetti, 1, 'l\'ospite ha un messaggio non letto');
  th = await thread(c.code); eq(th.messaggi[1].letto, false, 'non ancora letto');
  const l = await ospite('msg_list', { code: c.code, t: c.t, lingua: 'it' });
  eq(l.body.messaggi.map(m => [m.da, m.testo]), [['ospite', 'Ciao, a che ora possiamo arrivare?\n\n\nGrazie'], ['host', 'Dalle 16:00, vi aspettiamo!']]);
  eq((await ospite('mie', { code: c.code, t: c.t })).body.soggiorno.messaggi.nonLetti, 0, 'letto');
  th = await thread(c.code); eq(th.messaggi[1].letto, true, '«letto» per il titolare');
  const v = l.body.v, calls = kv.calls;
  r = await ospite('msg_list', { code: c.code, t: c.t, lingua: 'it', v });
  eq([r.body.v, r.body.invariato, r.body.messaggi], [v, true, undefined], 'niente di nuovo');
  assert(kv.calls - calls < 15, 'il controllo periodico costa pochi comandi KV: ' + (kv.calls - calls));
  r = await H.adminApi('msg_thread', { code: c.code, v: th.v, lo: th.lo }); eq(r.body.invariato, true, 'anche per il titolare');
  await H.adminApi('msg_reply', { code: c.code, testo: 'A presto' });
  assert(!(await ospite('msg_list', { code: c.code, t: c.t, lingua: 'it', v })).body.invariato, 'dopo un messaggio nuovo la versione cambia');
});

test('M2  chi può scrivere: solo prenotazioni del sito confermate; Booking/Airbnb, annullate, codici sbagliati → no; limite di 20 messaggi l\'ora', async () => {
  await base(); regAirbnb(); clock.set('2026-10-03T08:00:00Z');
  eq((await ospite('mie', { code: 'HMSEDESZCW' })).body.soggiorno.messaggi, { attivi: false }, 'Airbnb: niente chat nell\'area');
  eq((await ospite('msg_send', { code: 'HMSEDESZCW', testo: 'ciao' })).status, 404);
  eq((await ospite('msg_list', { code: 'ZZZZZZZZZZZZZ' })).status, 404);
  const c = await confermata();
  eq((await ospite('msg_send', { code: c.code, testo: 'col solo codice' })).status, 200, 'basta il codice, come per l\'area');
  eq((await ospite('msg_send', { code: c.code, t: c.t, testo: '   ' })).status, 400);
  eq((await ospite('msg_send', { code: c.code, t: c.t, testo: 'x'.repeat(2001) })).status, 400, 'oltre 2000 caratteri');
  eq((await ospite('msg_send', { code: c.code, t: c.t, testo: ['a'] })).status, 400);
  for (let i = 0; i < 19; i++) eq((await ospite('msg_send', { code: c.code, t: c.t, testo: 'n. ' + i })).status, 200);
  const r = await ospite('msg_send', { code: c.code, t: c.t, testo: 'uno di troppo' });
  eq(r.status, 429); assert(/molti messaggi/.test(r.body.err) && +r.headers['retry-after'] > 0, r.body.err);
  clock.advance(61 * MIN); eq((await ospite('msg_send', { code: c.code, t: c.t, testo: 'dopo un\'ora' })).status, 200);
  eq((await H.adminApi('stato', { code: c.code, stato: 'annullata' })).status, 200);
  eq((await ospite('msg_list', { code: c.code, t: c.t })).status, 404, 'annullata: niente più chat');
  eq((await H.adminApi('msg_reply', { code: c.code, testo: 'x' })).status, 409, 'il titolare non scrive a una prenotazione annullata');
  eq((await H.adminApi('msg_thread', { code: c.code })).body.messaggi.length, 21, 'ma la conversazione resta leggibile');
  eq((await H.api('msg_inbox', {})).status, 401, 'Gestione: serve il login');
});

test('M3  avvisi email con il testo e «Rispondi»: uno per il primo messaggio non letto, poi al massimo uno ogni 15 minuti; all\'ospite attivo di partenza, il link apre i messaggi senza codice', async () => {
  await base();
  const c = await confermata();
  await ospite('msg_send', { code: c.code, t: c.t, testo: 'Arriviamo alle 18: va bene?\nGrazie <b>mille</b>' });
  await ospite('msg_send', { code: c.code, t: c.t, testo: 'secondo' });
  let m = mailsTo('owner@test'); eq(m.length, 1, 'due messaggi di fila non ancora letti: un solo avviso');
  assert(/Nuovo messaggio da Mario Prova/.test(m[0].subject) && /Arriviamo alle 18: va bene\?\nGrazie <b>mille<\/b>/.test(m[0].text), m[0].text);
  assert(m[0].html.includes('Arriviamo alle 18: va bene?<br>Grazie &lt;b&gt;mille&lt;/b&gt;'), 'nell\'email il testo come l\'ha scritto, mai HTML');
  assert(m[0].text.includes('admin.html#messaggi/c/' + c.code) && m[0].html.includes('admin.html#messaggi/c/' + c.code) && />Rispondi</.test(m[0].html), '«Rispondi» apre la conversazione in Gestione');
  clock.advance(16 * MIN); await ospite('msg_send', { code: c.code, t: c.t, testo: 'terzo' }); eq(mailsTo('owner@test').length, 2, 'ancora non letti, ma dopo 15 minuti un altro avviso');
  await thread(c.code);                                                                   // il titolare legge
  await ospite('msg_send', { code: c.code, t: c.t, testo: 'quarto, subito dopo' }); eq(mailsTo('owner@test').length, 3, 'dopo la lettura il primo messaggio nuovo avvisa subito');
  assert(/quarto, subito dopo/.test(mailsTo('owner@test')[2].text));
  // all'ospite: attivo di partenza, con il testo e «Rispondi» (apre la scheda Messaggi dell'area ospiti senza il codice)
  await H.adminApi('msg_reply', { code: c.code, testo: 'Certo, a stasera!\nPatrick' });
  m = mailsTo('mario.prova@esempio.it'); eq(m.length, 1, 'avviso all\'ospite');
  assert(/Certo, a stasera!\nPatrick/.test(m[0].text) && m[0].subject === 'Nuovo messaggio da La Columbera · New message' && m[0].replyTo === 'lacolumbera@gmail.com', m[0].subject);
  const link = /area-clienti\.html#c=([0-9A-Z]+)&t=([A-Za-z0-9_-]+)&s=messaggi/.exec(m[0].text); assert(link && link[1] === c.code, m[0].text);
  await H.adminApi('msg_reply', { code: c.code, testo: 'seconda risposta' }); eq(mailsTo('mario.prova@esempio.it').length, 1, 'l\'ospite non ha ancora letto: niente raffica');
  eq((await ospite('msg_list', { code: c.code, t: link[2] })).status, 200, 'il link della mail apre i messaggi (e li segna letti)');
  await H.adminApi('msg_reply', { code: c.code, testo: 'terza' }); eq(mailsTo('mario.prova@esempio.it').length, 2, 'letti: la risposta nuova avvisa subito');
  // si spengono in Messaggi → Automatici; un SMTP giù non blocca il messaggio e al prossimo si riprova
  eq((await H.adminApi('msg_imp_save', { conservazione: 90, avvisaTitolare: false, avvisaOspite: false })).status, 200);
  clock.advance(20 * MIN); await ospite('msg_send', { code: c.code, t: c.t, testo: 'quinto' }); await H.adminApi('msg_reply', { code: c.code, testo: 'quarta' });
  eq([mailsTo('owner@test').length, mailsTo('mario.prova@esempio.it').length], [3, 2], 'avvisi spenti');
  eq((await H.adminApi('msg_imp_save', { conservazione: 90, avvisaTitolare: true, avvisaOspite: true })).status, 200);
  await thread(c.code); global.__mailFail = true; await ospite('msg_send', { code: c.code, t: c.t, testo: 'sesto' }); global.__mailFail = false;
  eq((await thread(c.code)).messaggi.slice(-1)[0].testo, 'sesto', 'il messaggio c\'è anche se l\'email non è partita');
  await ospite('msg_send', { code: c.code, t: c.t, testo: 'settimo' }); eq(mailsTo('owner@test').length, 4, 'l\'avviso non partito si riprova al messaggio dopo');
  eq((await H.adminApi('msg_imp_save', { conservazione: 3 })).status, 400);
});
test('M12 avvisi email nella lingua dell\'ospite: la risposta tradotta con l\'originale sotto; al titolare la traduzione in italiano; anche i messaggi automatici avvisano', async () => {
  await base({ DEEPL_API_KEY: 'chiave-prova:fx' });
  const c = await confermata();
  await ospite('msg_list', { code: c.code, t: c.t, lingua: 'en' });                     // l'ospite usa l'area in inglese
  await ospite('msg_send', { code: c.code, t: c.t, testo: 'Is there parking?', lingua: 'en' });
  const h = mailsTo('owner@test')[0]; assert(h && /Is there parking\?/.test(h.text) && /Traduzione automatica in italiano:\n\[IT\] Is there parking\?/.test(h.text), h && h.text);
  await thread(c.code); await H.adminApi('msg_reply', { code: c.code, testo: 'Sì, in Via Val Gola 22' });
  const g = mailsTo('mario.prova@esempio.it')[0];
  assert(g.subject === 'New message from La Columbera' && /^Hi Mario!/.test(g.text) && /\[EN\] Sì, in Via Val Gola 22/.test(g.text) && /Original text \(Italian\):\nSì, in Via Val Gola 22/.test(g.text), g.text);
  assert(/<html lang="en">/.test(g.html) && /Reply/.test(g.html), 'email in inglese');
  // messaggio automatico (regola «alla conferma»): parte con la sincronizzazione e avvisa l'ospite, nella sua lingua
  const d = await confermata({ da: '2026-12-20', a: '2026-12-23', email: 'anna@esempio.it', nome: 'Anna Prova' });
  await ospite('msg_list', { code: d.code, t: d.t, lingua: 'de' });
  eq((await H.adminApi('msg_auto_save', { regole: [{ nome: 'Benvenuto', tpl: 'benvenuto', base: 'conferma', attiva: true }] })).status, 200);
  const d2 = await confermata({ da: '2027-01-05', a: '2027-01-08', email: 'otto@esempio.it', nome: 'Otto Prova' });      // confermata dopo l'attivazione della regola
  await ospite('msg_list', { code: d2.code, t: d2.t, lingua: 'de' });
  await sync();
  const a = mailsTo('otto@esempio.it'); eq(a.length, 1, 'il messaggio automatico avvisa l\'ospite'); eq(mailsTo('anna@esempio.it').length, 0, 'confermata prima di attivare la regola: niente arretrati');
  assert(a[0].subject === 'Neue Nachricht von La Columbera' && /^Hallo Otto!/.test(a[0].text) && /Originaltext \(Italienisch\):\nCiao Otto/.test(a[0].text) && /Antworten: .*&s=messaggi/.test(a[0].text), a[0].text);
});

test('M4  template: predefiniti, salvataggio, variabili (prenotazione del sito e del foglio), un template usato da una regola non si cancella', async () => {
  await base(); regAirbnb();
  const c = await confermata();
  let r = (await H.adminApi('msg_tpl', {})).body;
  assert(r.templates.length >= 3 && r.variabili.some(v => v[0] === 'link_area'), 'template e variabili');
  const f = await H.adminApi('msg_fill', { code: c.code, testo: 'Ciao {nome}! {appartamento}, {checkin} dalle {ora_checkin}, {notti} notti, {ospiti} ospiti. Codice {codice}: {link_area} {sconosciuta}' });
  const g = c.code.slice(0, 4) + ' ' + c.code.slice(4, 8) + ' ' + c.code.slice(8);
  eq(f.body.testo, 'Ciao Mario! Torre, giovedì 10 dicembre dalle 16:00, 3 notti, 2 ospiti. Codice ' + g + ': https://www.lacolumbera.test/area-clienti.html#k=' + c.code + ' {sconosciuta}');
  eq((await H.adminApi('msg_fill', { code: 'hmsedeszcw', testo: 'Ciao {nome}! Ecco: {link_area}' })).body.testo, 'Ciao! Ecco: https://www.lacolumbera.test/area-clienti.html#k=HMSEDESZCW', 'Airbnb: senza nome, il saluto resta pulito');
  eq((await H.adminApi('msg_fill', { code: 'NONESISTE', testo: 'x' })).status, 404);
  r = await H.adminApi('msg_tpl_save', { templates: [{ id: 'a', nome: 'Primo', testo: 'Testo <b>uno</b>' }, { nome: 'Secondo', testo: 'due' }] });
  eq(r.status, 200); eq(r.body.templates.map(x => x.nome), ['Primo', 'Secondo']); assert(r.body.templates[1].id, 'id assegnato');
  eq((await H.adminApi('msg_tpl_save', { templates: [{ id: 'a', nome: '', testo: 'x' }] })).status, 400);
  eq((await H.adminApi('msg_auto_save', { regole: [{ nome: 'R', attiva: true, tpl: 'a', base: 'arrivo', giorni: -2, ora: '10:00' }] })).status, 200);
  r = await H.adminApi('msg_tpl_save', { templates: [{ nome: 'Altro', testo: 'x' }] });
  eq(r.status, 409); assert(/regola «R»/.test(r.body.err), r.body.err);
  eq((await H.adminApi('msg_tpl', {})).body.templates.length, 2, 'nulla cambiato');
});

test('M13 template con il loro invio automatico (Gestione → Template): insieme in un salvataggio, anche un template nuovo; tolto un template si tolgono le sue regole; un errore non cambia nulla', async () => {
  await base();
  let r = (await H.adminApi('msg_tpl', {})).body; eq(r.regole, [], 'il caricamento dei template porta anche le regole');
  eq((await H.api('msg_tpl_auto_save', { templates: [], regole: [] }, as())).status, 401, 'solo il titolare');
  const T = [{ id: 'benvenuto', nome: 'Benvenuto', testo: 'Ciao {nome}!' }, { id: 'tnuovo1', nome: 'Come arrivare', testo: 'Ecco come arrivare.' }];
  r = await H.adminApi('msg_tpl_auto_save', { templates: T, regole: [{ id: '', nome: 'Come arrivare', attiva: true, tpl: 'tnuovo1', base: 'conferma', nuova: true }, { nome: 'Promemoria', attiva: true, tpl: 'benvenuto', base: 'arrivo', giorni: -2, ora: '10:00', apt: 'boh' }] });
  eq(r.status, 200, JSON.stringify(r.body));
  eq(r.body.templates.map(x => x.id), ['benvenuto', 'tnuovo1'], 'l\'id scelto dalla pagina resta');
  eq(r.body.regole.map(x => [x.tpl, x.base, x.giorni, x.ora, x.apt, x.attiva, 'nuova' in x]), [['tnuovo1', 'conferma', 0, '', '', true, false], ['benvenuto', 'arrivo', -2, '10:00', '', true, false]]);
  eq(JSON.parse(kv.exec(['GET', 'msg:tpl'])), r.body.templates); eq(JSON.parse(kv.exec(['GET', 'msg:auto'])), r.body.regole);
  const [ra, rb] = r.body.regole;
  // un salvataggio che cambia solo i testi non tocca le regole (né da quando valgono)
  clock.advance(60 * MIN);
  r = await H.adminApi('msg_tpl_auto_save', { templates: [T[0], Object.assign({}, T[1], { testo: 'Ecco la strada.' })], regole: [ra, Object.assign({}, rb, { ora: '18:00' })] });
  eq(r.status, 200); eq(r.body.regole[0].dal, ra.dal, 'invariata: stesso «dal»'); assert(r.body.regole[1].dal > rb.dal, 'cambiata l\'ora: vale da adesso');
  // una regola con un template che non c'è: 400 e nulla cambia
  const prima = [kv.exec(['GET', 'msg:tpl']), kv.exec(['GET', 'msg:auto'])];
  r = await H.adminApi('msg_tpl_auto_save', { templates: [T[0]], regole: [ra] });
  eq(r.status, 400); assert(/scegli un template/.test(r.body.err), r.body.err);
  eq([kv.exec(['GET', 'msg:tpl']), kv.exec(['GET', 'msg:auto'])], prima, 'né i template né le regole');
  // tolto il template con la sua regola: si salva (con «Salva template» da solo sarebbe rifiutato, 409)
  eq((await H.adminApi('msg_tpl_save', { templates: [T[0]] })).status, 409);
  r = await H.adminApi('msg_tpl_auto_save', { templates: [T[0]], regole: [rb] });
  eq(r.status, 200); eq(r.body.templates.map(x => x.id), ['benvenuto']); eq(r.body.regole.map(x => x.id), [rb.id]);
  // corpo grande (molti template lunghi) accettato come per «Salva template»
  const lunghi = Array.from({ length: 12 }, (_, i) => ({ id: 'l' + i, nome: 'Lungo ' + i, testo: 'x'.repeat(1900) }));
  eq((await H.adminApi('msg_tpl_auto_save', { templates: lunghi.concat([T[0]]), regole: [rb] })).status, 200);
});

test('M5  regole automatiche: partono all\'ora giusta (fuso di Trento), una volta sola anche con due sincronizzazioni insieme; mai per le annullate', async () => {
  await base();
  const c = await confermata(), d = await confermata({ da: '2026-12-20', a: '2026-12-23', email: 'altra@esempio.it' });
  await H.adminApi('msg_tpl_save', { templates: [{ id: 'pre', nome: 'Promemoria', testo: 'Ciao {nome}, ci vediamo {checkin} dalle {ora_checkin}!' }] });
  eq((await H.adminApi('msg_auto_save', { regole: [{ id: 'r1', nome: 'Due giorni prima', attiva: true, tpl: 'pre', base: 'arrivo', giorni: -2, ora: '10:00' }] })).status, 200);
  eq((await H.adminApi('stato', { code: d.code, stato: 'annullata' })).status, 200);
  let p = (await H.adminApi('msg_auto', {})).body;
  eq(p.prossimi, [], 'nulla nei prossimi 7 giorni');
  clock.set('2026-12-02T09:00:00Z');
  p = (await H.adminApi('msg_auto', {})).body;
  eq(p.prossimi.map(x => [x.code, new Date(x.quando).toISOString(), x.nome]), [[c.code, '2026-12-08T09:00:00.000Z', 'Mario Prova']], 'in programma l\'8 dicembre alle 10 di Trento (09:00 UTC)');
  clock.set('2026-12-08T08:58:00Z'); await sync();
  eq((await thread(c.code)).messaggi.length, 0, 'non prima');
  clock.set('2026-12-08T09:02:00Z');
  await Promise.all([sync(), sync(), sync()]);
  let th = await thread(c.code);
  eq(th.messaggi.map(m => [m.da, m.testo, m.regola]), [['auto', 'Ciao Mario, ci vediamo giovedì 10 dicembre dalle 16:00!', 'r1']], 'un solo messaggio');
  clock.advance(20 * MIN); await sync(); eq((await thread(c.code)).messaggi.length, 1, 'nessun doppione ai giri dopo');
  eq((await H.adminApi('msg_thread', { code: d.code })).body.messaggi.length, 0, 'annullata: niente');
  eq((await H.adminApi('msg_auto', {})).body.prossimi, [], 'partito: non è più tra i prossimi');
  eq((await ospite('msg_list', { code: c.code, t: c.t })).body.messaggi[0].auto, true);
});

test('M6  regole automatiche: attivarne una non manda messaggi arretrati; «invia comunque se in ritardo»; sincronizzazione ferma oltre 36 ore = saltato; «salta»', async () => {
  await base();
  await H.adminApi('msg_tpl_save', { templates: [{ id: 't', nome: 'T', testo: 'Promemoria' }] });
  const c = await confermata();                                                      // 10 dicembre
  clock.set('2026-12-09T12:00:00Z');                                                 // la regola nasce dopo il momento d'invio (8 dicembre)
  await H.adminApi('msg_auto_save', { regole: [{ id: 'senza', nome: 'Senza ritardo', attiva: true, tpl: 't', base: 'arrivo', giorni: -2, ora: '10:00' }, { id: 'con', nome: 'Con ritardo', attiva: true, tpl: 't', base: 'arrivo', giorni: -2, ora: '10:00', ritardo: true }] });
  await sync();
  eq((await thread(c.code)).messaggi.map(m => m.regola), ['con'], 'solo la regola con «in ritardo»');
  // prenotazione dell'ultimo minuto: arriva domani, il momento (due giorni prima) è già passato
  const d = await confermata({ da: '2026-12-10', a: '2026-12-12', id: 'corte', email: 'ultimo@esempio.it' });
  await sync();
  eq((await thread(d.code)).messaggi.map(m => m.regola), ['con'], 'in ritardo: parte subito');
  clock.set('2026-12-11T12:00:00Z');
  const e = await confermata({ da: '2026-12-12', a: '2026-12-14', id: 'corte', email: 'tardi@esempio.it' });
  clock.set('2026-12-12T23:30:00Z'); await sync();                                   // 00:30 del 13 a Trento: il giorno di arrivo è finito
  eq((await thread(e.code)).messaggi.length, 0, 'finito il giorno di arrivo un promemoria non ha più senso');
  // sincronizzazione ferma per più di 36 ore: il messaggio non parte più
  const f = await confermata({ da: '2027-01-10', a: '2027-01-12', email: 'fermo@esempio.it' });
  clock.set('2027-01-09T23:00:00Z'); await sync();
  eq((await thread(f.code)).messaggi.length, 0, 'scaduto: oltre 36 ore');
  // il titolare salta un singolo invio
  const g = await confermata({ da: '2027-01-20', a: '2027-01-22', email: 'salta@esempio.it' });
  clock.set('2027-01-15T10:00:00Z');
  let pr = (await H.adminApi('msg_auto', {})).body.prossimi.filter(x => x.code === g.code);
  eq(pr.map(x => [x.regola, x.stato]), [['senza', ''], ['con', '']]);
  eq((await H.adminApi('msg_salta', { regola: 'senza', code: g.code })).status, 200);
  pr = (await H.adminApi('msg_auto', {})).body.prossimi.filter(x => x.code === g.code);
  eq(pr.map(x => [x.regola, x.stato]), [['senza', 'saltato'], ['con', '']]);
  clock.set('2027-01-18T09:30:00Z'); await sync();
  eq((await thread(g.code)).messaggi.map(m => m.regola), ['con'], 'il saltato non parte');
  eq((await H.adminApi('msg_salta', { regola: 'con', code: g.code })).status, 409, 'uno già partito non si salta');
});

test('M7  traduzione (DeepL): l\'ospite scrive in inglese → il titolare legge in italiano; la risposta arriva in inglese; i template senza dati personali', async () => {
  await base({ DEEPL_API_KEY: 'chiave-prova:fx' });
  const c = await confermata();
  await ospite('msg_list', { code: c.code, t: c.t, lingua: 'en' });                     // l'ospite usa l'area in inglese
  await ospite('msg_send', { code: c.code, t: c.t, testo: 'Thanks, we arrive at 6pm', lingua: 'en' });
  let th = await thread(c.code);
  eq([th.lingua, th.traduzione, th.messaggi[0].lingua, th.messaggi[0].tradotto], ['en', true, 'en', '[IT] Thanks, we arrive at 6pm']);
  assert(global.__deepl.calls.every(x => /^DeepL-Auth-Key chiave-prova:fx$/.test(x.auth) && /api-free\.deepl\.com/.test(x.url)), 'chiave del piano gratuito → api-free');
  await H.adminApi('msg_reply', { code: c.code, testo: 'Perfetto, a presto' });
  let l = (await ospite('msg_list', { code: c.code, t: c.t, lingua: 'en' })).body.messaggi;
  eq([l[1].testo, l[1].originale], ['[EN] Perfetto, a presto', 'Perfetto, a presto'], 'tradotta nella lingua dell\'ospite, con l\'originale');
  l = (await ospite('msg_list', { code: c.code, t: c.t, lingua: 'de' })).body.messaggi;
  eq(l[1].testo, '[DE] Perfetto, a presto', 'cambia lingua: si traduce al volo (e resta salvata)');
  const n = global.__deepl.calls.length; await ospite('msg_list', { code: c.code, t: c.t, lingua: 'de' }); eq(global.__deepl.calls.length, n, 'già tradotto: nessuna nuova chiamata');
  eq((await H.adminApi('msg_reply', { code: c.code, testo: 'Solo italiano', traduci: false })).status, 200);
  // messaggio automatico: DeepL riceve il template con le variabili protette, mai i dati della prenotazione
  await H.adminApi('msg_tpl_save', { templates: [{ id: 'w', nome: 'Wi-Fi', testo: 'Ciao {nome}, il codice è {codice} & il Wi-Fi è {wifi}.' }] });
  const cf = (await H.adminApi('cfg_admin', {})).body; cf.apts.find(p => p.id === 'torre').infoRiservate = 'Password: SEGRETA'; await H.adminApi('save', cf);
  await H.adminApi('msg_auto_save', { regole: [{ id: 'conf', nome: 'Alla conferma', attiva: true, tpl: 'w', base: 'conferma' }] });
  const d = await confermata({ da: '2027-02-10', a: '2027-02-12', email: 'nuovo@esempio.it' });
  const k0 = global.__deepl.calls.length; await sync();
  const sent = global.__deepl.calls.slice(k0).map(x => JSON.stringify(x.body)).join('\n');
  assert(sent.includes('<x>{nome}</x>') && sent.includes('&amp;') && !/Mario|SEGRETA|nuovo@|Prova/.test(sent) && !sent.includes(d.code), 'template protetto: ' + sent);
  const ld = (await ospite('msg_list', { code: d.code, t: d.t, lingua: 'en' })).body.messaggi[0];
  eq(ld.testo, '[EN] Ciao Mario, il codice è ' + d.code.slice(0, 4) + ' ' + d.code.slice(4, 8) + ' ' + d.code.slice(8) + ' & il Wi-Fi è Password: SEGRETA.', 'variabili inserite dopo la traduzione');
  eq(ld.originale.startsWith('Ciao Mario'), true);
});

test('M8  traduzione non disponibile (DeepL giù, lento o senza chiave): il messaggio parte e si legge in originale', async () => {
  await base({ DEEPL_API_KEY: 'chiave-pro', DEEPL_TIMEOUT_MS: '150' });
  const c = await confermata();
  global.__deepl.mode = 'down';
  let r = await ospite('msg_send', { code: c.code, t: c.t, testo: 'Hello, is parking free?', lingua: 'en' }); eq(r.status, 200);
  let th = await thread(c.code); eq([th.messaggi[0].testo, th.messaggi[0].tradotto], ['Hello, is parking free?', undefined]);
  assert(global.__deepl.calls.every(x => /\/\/api\.deepl\.com\//.test(x.url)), 'chiave Pro → api.deepl.com');
  global.__deepl.mode = 'slow';
  r = await H.adminApi('msg_reply', { code: c.code, testo: 'Sì, gratuito' }); eq(r.status, 200, 'DeepL lento: si risponde lo stesso');
  global.__deepl.mode = 'ok';
  th = await thread(c.code); eq(th.messaggi[0].tradotto, '[IT] Hello, is parking free?', 'tornato DeepL: la traduzione mancante si completa alla lettura');
  await base();
  const d = await confermata(); r = await ospite('msg_send', { code: d.code, t: d.t, testo: 'Hello', lingua: 'en' }); eq(r.status, 200);
  eq((await thread(d.code)).traduzione, false, 'senza chiave: traduzione spenta');
  eq(global.__deepl.calls.length, 0, 'e nessuna chiamata a DeepL');
});

test('M9  messaggi programmati a mano; la sincronizzazione delle date continua anche se i messaggi falliscono; niente testi nei log', async () => {
  await base();
  const c = await confermata(), d = await confermata({ da: '2026-12-20', a: '2026-12-23', email: 'altra@esempio.it' });
  let r = await H.adminApi('msg_prog_add', { code: c.code, testo: 'Messaggio programmato riservato', quando: '2026-10-05T08:00:00Z' }); eq(r.status, 200);
  eq((await H.adminApi('msg_prog_add', { code: c.code, testo: 'x', quando: '2026-10-01T08:00:00Z' })).status, 400, 'nel passato no');
  const p2 = (await H.adminApi('msg_prog_add', { code: d.code, testo: 'per una prenotazione che si annullerà', quando: '2026-10-05T08:00:00Z' })).body;
  const p3 = (await H.adminApi('msg_prog_add', { code: c.code, testo: 'questo lo annullo', quando: '2026-10-05T08:00:00Z' })).body;
  eq((await H.adminApi('msg_prog_del', { id: p3.id })).status, 200);
  await H.adminApi('stato', { code: d.code, stato: 'annullata' });
  eq((await H.adminApi('msg_auto', {})).body.programmati.map(x => [x.code, x.nome]), [[c.code, 'Mario Prova'], [d.code, 'Mario Prova']]);
  clock.set('2026-10-05T08:10:00Z');
  const out = await logs(async () => { r = await sync(); });
  eq(r.status, 200); eq(r.body.messaggi.inviati, 1);
  eq((await thread(c.code)).messaggi.map(m => m.testo), ['Messaggio programmato riservato']);
  eq((await thread(d.code)).messaggi.length, 0, 'annullata: non partito');
  eq((await H.adminApi('msg_auto', {})).body.programmati, [], 'elenco vuoto');
  assert(!/riservato|Mario|mario/.test(out), 'niente testi né nomi nei log');
  // KV che fallisce sulle chiavi dei messaggi: la sincronizzazione delle date risponde lo stesso
  await H.adminApi('msg_tpl_save', { templates: [{ id: 't', nome: 'T', testo: 'x' }] });
  await H.adminApi('msg_auto_save', { regole: [{ id: 'r', nome: 'R', attiva: true, tpl: 't', base: 'conferma' }] });
  kv.after = async cmd => { if (/^msg:(auto|prog)$/.test(String(cmd[1]))) throw new Error('KV giù per i messaggi'); };
  H.setFeed('bookingTorre', [H.bookingEv('nuovo', '2026-11-01', '2026-11-03')]);
  r = await H.sync(); kv.after = null;
  eq(r.status, 200, 'sincronizzazione riuscita'); assert(r.body.messaggi.errori >= 1, JSON.stringify(r.body.messaggi));
  assert((await H.busyDates('torre')).includes('2026-11-01'), 'il calendario è aggiornato lo stesso');
});

test('M10 conservazione: la conversazione si cancella N giorni dopo la partenza (7 di predefinito, come l\'area clienti), non prima; un periodo più lungo scelto dal titolare vale', async () => {
  await base();
  eq((await H.adminApi('msg_auto', {})).body.impostazioni.conservazione, 7, 'predefinito: 7 giorni');
  const c = await confermata();                                                      // partenza 13/12/2026
  await ospite('msg_send', { code: c.code, t: c.t, testo: 'ciao' });
  await H.adminApi('msg_reply', { code: c.code, testo: 'ciao a te' });
  clock.set('2026-12-19T10:00:00Z'); await sync();                                   // 6 giorni dopo
  eq((await thread(c.code)).messaggi.length, 2, 'ancora lì');
  clock.set('2026-12-21T10:00:00Z'); await sync();                                   // 8 giorni dopo (e più di 20 ore dal controllo precedente)
  eq((await thread(c.code)).messaggi.length, 0, 'cancellata');
  // con 90 giorni scelti in Impostazioni si cancella al 91°
  eq((await H.adminApi('msg_imp_save', { conservazione: 90, avvisaTitolare: true, avvisaOspite: true })).status, 200);
  const d = await confermata({ da: '2027-01-10', a: '2027-01-12', email: 'novanta@esempio.it' });
  await ospite('msg_send', { code: d.code, t: d.t, testo: 'ciao' });
  clock.set('2027-02-12T10:00:00Z'); await sync();
  eq((await thread(d.code)).messaggi.length, 1, '31 giorni dopo, con 90 scelti: ancora lì');
  clock.set('2027-04-13T10:00:00Z'); await sync();
  eq((await thread(d.code)).messaggi.length, 0, '91 giorni dopo: cancellata');
  eq((await H.adminApi('msg_inbox', {})).body.conversazioni.length, 0);
  const resto = [...kv.d.keys()].filter(k => kv.get(k) && k.startsWith('msg:') && (k.includes(c.code) || JSON.stringify(kv.get(k).v).includes(c.code)));      // le chiavi scadute non contano
  eq(resto, [], 'nessuna chiave dei messaggi rimasta');
});

// foto caricate dalla Gestione come nel browser (ridimensionate, JPEG): Vercel Blob finto, indirizzi della stessa forma di quelli veri
const IMG = 'data:image/jpeg;base64,' + Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3]).toString('base64');
const carica = async id => { const r = await H.adminApi('up', { id, img: IMG }); eq(r.status, 200, JSON.stringify(r.body)); return r.body.url; };

test('M14 foto e link: il titolare manda foto (anche senza testo) e link; l\'ospite li vede nell\'area e nell\'email; solo foto caricate dalla Gestione; l\'ospite scrive solo testo; la traduzione non tocca gli indirizzi', async () => {
  await base({ DEEPL_API_KEY: 'chiave-prova:fx' });
  const c = await confermata(), f1 = await carica('msg'), f2 = await carica('msg');
  assert(/^https:\/\/teststore\.public\.blob\.vercel-storage\.com\/foto\/msg\/f-\d+\.jpg$/.test(f1), f1);
  eq((await H.adminApi('msg_reply', { code: c.code, testo: '  ', foto: [] })).status, 400, 'né testo né foto: no');
  const no = await H.adminApi('msg_reply', { code: c.code, testo: '', foto: ['https://evil.example/x.jpg', 'javascript:alert(1)', f1.replace('/foto/msg/', '/foto/altro/')] });
  eq(no.status, 400, 'foto non caricate dalla Gestione: non valgono'); assert(/foto/.test(no.body.err));
  eq((await H.adminApi('msg_reply', { code: c.code, testo: '', foto: [f1, f1, f2, 'https://evil.example/y.jpg'] })).status, 200, 'solo foto');
  let m = mailsTo('mario.prova@esempio.it')[0];
  assert(m && m.html.includes('<img src="' + f1 + '"') && m.html.includes(f2) && m.text.includes(f1) && !m.html.includes('evil.example'), 'email all\'ospite con le foto');
  eq((await H.adminApi('msg_inbox', {})).body.conversazioni[0].anteprima, '📷 Foto');
  // l'ospite apre i messaggi (in inglese): le foto ci sono, una volta sola ciascuna
  let l = (await ospite('msg_list', { code: c.code, t: c.t, lingua: 'en' })).body.messaggi;
  eq([l.length, l[0].testo, l[0].foto], [1, '', [f1, f2]], 'senza testo nessuna traduzione');
  eq(global.__deepl.calls.length, 0);
  // link con un testo: l'indirizzo non si traduce (va a DeepL protetto, come le variabili dei template)
  global.__mails.length = 0;
  eq((await H.adminApi('msg_reply', { code: c.code, testo: 'Prenota qui: [il ristorante](https://r.example/x?a=1&b=2) o www.museo.example', foto: [f2] })).status, 200);
  const body = global.__deepl.calls[global.__deepl.calls.length - 1].body;
  eq([body.tag_handling, body.text[0]], ['xml', 'Prenota qui: [il ristorante](<x>https://r.example/x?a=1&amp;b=2</x>) o <x>www.museo.example</x>'], 'indirizzi protetti');
  l = (await ospite('msg_list', { code: c.code, t: c.t, lingua: 'en' })).body.messaggi;
  eq([l[1].testo, l[1].originale, l[1].foto], ['[EN] Prenota qui: [il ristorante](https://r.example/x?a=1&b=2) o www.museo.example', 'Prenota qui: [il ristorante](https://r.example/x?a=1&b=2) o www.museo.example', [f2]]);
  m = mailsTo('mario.prova@esempio.it')[0];
  assert(m && m.html.includes('<a href="https://r.example/x?a=1&amp;b=2"') && />il ristorante<\/a>/.test(m.html) && m.html.includes('href="https://www.museo.example"'), 'link cliccabili nell\'email');
  assert(m.text.includes('il ristorante: https://r.example/x?a=1&b=2') && !m.text.includes(']('), 'nella parte di solo testo «testo: indirizzo»');
  eq((await H.adminApi('msg_inbox', {})).body.conversazioni[0].anteprima, 'Prenota qui: il ristorante o www.museo.example');
  // la Gestione vede le foto; l'ospite non può mandarne (il campo si ignora)
  const th = await thread(c.code); eq([th.messaggi[0].foto, th.messaggi[1].foto], [[f1, f2], [f2]]);
  eq((await ospite('msg_send', { code: c.code, t: c.t, testo: 'Thanks', lingua: 'en', foto: [f1] })).status, 200);
  const g = (await thread(c.code)).messaggi[2]; eq([g.da, g.testo, g.foto], ['ospite', 'Thanks', undefined]);
});

test('M15 template con foto: salvataggio (solo foto caricate, al massimo 4), il messaggio automatico parte con le foto; messaggio programmato con foto; via da Vercel Blob le foto dei messaggi cancellati o non partiti, mai quelle dei template', async () => {
  await base();
  const t1 = await carica('msgtpl'), t2 = await carica('msgtpl'), altre = [await carica('msgtpl'), await carica('msgtpl'), await carica('msgtpl')];
  eq((await H.adminApi('msg_tpl_save', { templates: [{ id: 'x', nome: 'Vuoto', testo: ' ', foto: ['https://evil.example/a.jpg'] }] })).status, 400, 'né testo né foto valide');
  const sv = await H.adminApi('msg_tpl_save', { templates: [{ id: 'arrivo', nome: 'Come entrare', testo: 'Ecco la cassetta: [mappa](https://maps.example/p)', foto: [t1, 'https://evil.example/a.jpg', t2].concat(altre) }, { id: 'solo', nome: 'Solo foto', testo: '', foto: [t2] }] });
  eq(sv.status, 200, JSON.stringify(sv.body)); eq(sv.body.templates[0].foto, [t1, t2, altre[0], altre[1]], 'solo quelle caricate, al massimo 4'); eq(sv.body.templates[1].foto, [t2]);
  eq((await H.adminApi('msg_tpl', {})).body.templates[0].foto.length, 4);
  // regola alla conferma: il messaggio automatico porta le foto del template
  eq((await H.adminApi('msg_auto_save', { regole: [{ id: 'conf', nome: 'Alla conferma', attiva: true, tpl: 'arrivo', base: 'conferma' }] })).status, 200);
  const c = await confermata(); await sync();
  let th = await thread(c.code); eq([th.messaggi.length, th.messaggi[0].da, th.messaggi[0].foto], [1, 'auto', [t1, t2, altre[0], altre[1]]]);
  assert(mailsTo('mario.prova@esempio.it')[0].html.includes(t1), 'email con le foto del template');
  // messaggio programmato con una foto sua; annullato: la foto va via da Blob
  const p1 = await carica('msg'), p2 = await carica('msg');
  const pr = await H.adminApi('msg_prog_add', { code: c.code, testo: '', foto: [p1], quando: new Date(clock.now() + 3600e3).toISOString() }); eq(pr.status, 200, JSON.stringify(pr.body));
  eq((await H.adminApi('msg_auto', {})).body.programmati[0].foto, [p1]);
  global.__blobDel = [];
  eq((await H.adminApi('msg_prog_del', { id: pr.body.id })).status, 200); eq(global.__blobDel, [p1], 'annullato: via la sua foto');
  // programmato che parte (con una foto sua e una del template)
  eq((await H.adminApi('msg_prog_add', { code: c.code, testo: 'Domani piove', foto: [p2, t1], quando: new Date(clock.now() + 3600e3).toISOString() })).status, 200);
  clock.advance(2 * 3600e3); await sync();
  th = await thread(c.code); eq([th.messaggi.length, th.messaggi[1].testo, th.messaggi[1].foto], [2, 'Domani piove', [p2, t1]]);
  // conservazione: 8 giorni dopo la partenza la conversazione si cancella con le sue foto, non con quelle dei template
  const r = await carica('msg'); eq((await H.adminApi('msg_reply', { code: c.code, testo: 'Ultima', foto: [r] })).status, 200);
  global.__blobDel = [];
  clock.set('2026-12-21T10:00:00Z'); await sync();
  eq((await thread(c.code)).messaggi.length, 0, 'cancellata');
  eq(global.__blobDel.sort(), [p2, r].sort(), 'via le foto dei messaggi, restano quelle dei template');
});

test('M11 controllo leggero (msg_v): solo con il token, pochissimi comandi, limite suo (non consuma le consultazioni dell\'area); senza prenotazioni nessuna cancellazione', async () => {
  await base();
  const c = await confermata(), ip1 = { headers: { 'x-real-ip': '192.0.2.77' } };
  const v0 = (await H.api('msg_v', { code: c.code, t: c.t }, ip1)).body.v;
  await H.adminApi('msg_reply', { code: c.code, testo: 'ciao' });
  const n = kv.calls, r = await H.api('msg_v', { code: c.code, t: c.t }, ip1);
  eq(r.status, 200); assert(r.body.v > v0, 'la versione cresce con un messaggio nuovo'); assert(kv.calls - n <= 5, 'comandi KV: ' + (kv.calls - n));
  eq((await H.api('msg_v', { code: c.code }, ip1)).status, 404, 'senza token: no');
  eq((await H.api('msg_v', { code: c.code, t: 'x'.repeat(22) }, ip1)).status, 404, 'token sbagliato: no');
  for (let i = 0; i < 100; i++) await H.api('msg_v', { code: c.code, t: c.t }, ip1);
  eq((await H.api('mie', { code: c.code, t: c.t }, ip1)).status, 200, '100 controlli leggeri non bloccano l\'area');
  for (let i = 0; i < 140; i++) await H.api('msg_v', { code: c.code, t: c.t }, ip1);
  eq((await H.api('msg_v', { code: c.code, t: c.t }, ip1)).status, 429, 'oltre 240 in 10 minuti');
  // conservazione: se l'elenco delle prenotazioni è vuoto (KV non ha risposto) non si cancella nulla; una conversazione orfana solo quando è ferma da più del periodo di conservazione
  const MSG = require('../../api/_messaggi.js').makeMessaggi({ kv: (...a) => kv.run(a), kvp: cmds => Promise.all(cmds.map(x => kv.run(x))), now: () => clock.now() });
  eq((await MSG.pulizia([])).cancellate, 0); eq((await MSG.pulizia(null)).cancellate, 0);
  eq((await thread(c.code)).messaggi.length, 1, 'ancora lì');
  kv.exec(['DEL', 'msg:pulizia']); eq((await MSG.pulizia([{ code: 'ALTRA', a: '2026-12-01' }])).cancellate, 0, 'orfana ma recente: resta');
  clock.advance(91 * 24 * 60 * MIN); kv.exec(['DEL', 'msg:pulizia']);
  eq((await MSG.pulizia([{ code: 'ALTRA', a: '2026-12-01' }])).cancellate, 1, 'orfana e ferma da oltre il periodo di conservazione: cancellata');
});

/* ===================== traduzione gratuita con Cloudflare (Workers AI) ===================== */
const CF = { CLOUDFLARE_ACCOUNT_ID: 'c0ffee00c0ffee00c0ffee00c0ffee00', CLOUDFLARE_API_TOKEN: 'token-di-prova' };
const logTxt = () => (kv.exec(['LRANGE', 'sync:log', '0', '30']) || []).join('\n');
const quante = (s, re) => (s.match(re) || []).length;

test('M16 traduzione gratuita con Cloudflare (Workers AI): l\'ospite scrive in inglese → il titolare legge in italiano; la risposta arriva in inglese; template e indirizzi protetti; con DeepL resta DeepL', async () => {
  await base(CF);
  const c = await confermata(), a = global.__cf.calls;
  await ospite('msg_list', { code: c.code, t: c.t, lingua: 'en' });                     // l'ospite usa l'area in inglese
  await ospite('msg_send', { code: c.code, t: c.t, testo: 'Thanks, we arrive at 6pm', lingua: 'en' });
  let th = await thread(c.code);
  eq([th.lingua, th.traduzione, th.messaggi[0].lingua, th.messaggi[0].tradotto], ['en', true, 'en', '[IT] Thanks, we arrive at 6pm']);
  eq([(await H.adminApi('msg_inbox', {})).body.traduttore, (await H.adminApi('msg_auto', {})).body.traduttore], ['Cloudflare', 'Cloudflare'], 'la Gestione dice chi traduce');
  eq(a[0].url, 'https://api.cloudflare.com/client/v4/accounts/' + CF.CLOUDFLARE_ACCOUNT_ID + '/ai/run/@cf/mistralai/mistral-small-3.1-24b-instruct', 'indirizzo e modello');
  assert(a.every(x => x.auth === 'Bearer ' + CF.CLOUDFLARE_API_TOKEN && !x.url.includes(CF.CLOUDFLARE_API_TOKEN)), 'la chiave solo nell\'intestazione');
  eq(a[0].usr, ['Thanks, we arrive at 6pm'], 'il testo va al modello come elenco JSON');
  assert(/^TARGET: Italian \(it\)$/m.test(a[0].sys) && !/^SOURCE: .*\(/m.test(a[0].sys), 'verso l\'italiano, la lingua di partenza la riconosce il modello');
  eq(global.__deepl.calls.length, 0, 'niente DeepL');
  await H.adminApi('msg_reply', { code: c.code, testo: 'Perfetto, a presto' });
  const rr = a[a.length - 1];
  eq(rr.usr, ['Perfetto, a presto']); assert(/^SOURCE: Italian \(it\)$/m.test(rr.sys) && /^TARGET: British English \(en\)$/m.test(rr.sys), 'dall\'italiano all\'inglese');
  let l = (await ospite('msg_list', { code: c.code, t: c.t, lingua: 'en' })).body.messaggi;
  eq([l[1].testo, l[1].originale], ['[EN] Perfetto, a presto', 'Perfetto, a presto'], 'tradotta nella lingua dell\'ospite, con l\'originale');
  l = (await ospite('msg_list', { code: c.code, t: c.t, lingua: 'de' })).body.messaggi;
  eq(l[1].testo, '[DE] Perfetto, a presto', 'cambia lingua: si traduce al volo (e resta salvata)');
  const n = a.length; await ospite('msg_list', { code: c.code, t: c.t, lingua: 'de' }); eq(a.length, n, 'già tradotto: nessuna nuova chiamata');
  // link: gli indirizzi non vanno al modello (al loro posto i gettoni) e tornano intatti
  eq((await H.adminApi('msg_reply', { code: c.code, testo: 'Prenota qui: [il ristorante](https://r.example/x?a=1&b=2) o www.museo.example' })).status, 200);
  eq(a[a.length - 1].usr, ['Prenota qui: [il ristorante]([[1]]) o [[2]]'], 'indirizzi protetti');
  l = (await ospite('msg_list', { code: c.code, t: c.t, lingua: 'de' })).body.messaggi;
  eq(l[2].testo, '[DE] Prenota qui: [il ristorante](https://r.example/x?a=1&b=2) o www.museo.example');
  // messaggio automatico: al modello va il template con le variabili protette, mai i dati della prenotazione
  await H.adminApi('msg_tpl_save', { templates: [{ id: 'w', nome: 'Wi-Fi', testo: 'Ciao {nome}, il codice è {codice} & il Wi-Fi è {wifi}.' }] });
  const cf = (await H.adminApi('cfg_admin', {})).body; cf.apts.find(p => p.id === 'torre').infoRiservate = 'Password: SEGRETA'; await H.adminApi('save', cf);
  await H.adminApi('msg_auto_save', { regole: [{ id: 'conf', nome: 'Alla conferma', attiva: true, tpl: 'w', base: 'conferma' }] });
  const d = await confermata({ da: '2027-02-10', a: '2027-02-12', email: 'nuovo@esempio.it' });
  const k0 = a.length; await sync();
  const inviati = a.slice(k0), sent = inviati.map(x => JSON.stringify(x.usr)).join('\n');
  eq(inviati.map(x => x.n), [1, 1], 'il template va una volta in inglese e una in tedesco');
  assert(sent.includes('Ciao [[1]], il codice è [[2]] & il Wi-Fi è [[3]].') && !/Mario|SEGRETA|nuovo@|Prova|\{nome\}|\{wifi\}/.test(sent) && !sent.includes(d.code), 'template protetto: ' + sent);
  const ld = (await ospite('msg_list', { code: d.code, t: d.t, lingua: 'en' })).body.messaggi[0];
  eq(ld.testo, '[EN] Ciao Mario, il codice è ' + d.code.slice(0, 4) + ' ' + d.code.slice(4, 8) + ' ' + d.code.slice(8) + ' & il Wi-Fi è Password: SEGRETA.', 'variabili inserite dopo la traduzione');
  eq(ld.originale.startsWith('Ciao Mario'), true);
  // con tutte e due le chiavi vale DeepL, come prima
  await base(Object.assign({ DEEPL_API_KEY: 'chiave-pro' }, CF));
  const e = await confermata();
  await ospite('msg_send', { code: e.code, t: e.t, testo: 'Hello, is parking free?', lingua: 'en' });
  eq([(await thread(e.code)).messaggi[0].tradotto, global.__deepl.calls.length, global.__cf.calls.length], ['[IT] Hello, is parking free?', 1, 0], 'con DeepL vale DeepL');
  eq((await H.adminApi('msg_inbox', {})).body.traduttore, 'DeepL');
});

test('M17 Cloudflare giù, lento, con la quota finita o che sbaglia: il messaggio parte e si legge in originale, nel registro eventi resta il motivo (mai i testi); un gruppo sbagliato si rifà un testo alla volta; poi riprende da solo', async () => {
  await base(Object.assign({ CLOUDFLARE_TIMEOUT_MS: '150' }, CF));
  const c = await confermata(), cf = global.__cf;
  await ospite('msg_list', { code: c.code, t: c.t, lingua: 'en' });
  // quota gratuita finita: errore 429
  cf.mode = 'quota';
  let r = await ospite('msg_send', { code: c.code, t: c.t, testo: 'Hello, is parking free?', lingua: 'en' }); eq(r.status, 200);
  let th = await thread(c.code); eq([th.messaggi[0].testo, th.messaggi[0].tradotto], ['Hello, is parking free?', undefined], 'quota finita: si legge in originale');
  eq(quante(logTxt(), /Traduzione automatica \(Cloudflare\): errore 429, quota gratuita/g), 1, 'una sola riga nel registro eventi, anche con più tentativi');
  assert(!/parking/.test(logTxt()), 'mai i testi nel registro');
  // lento: il tempo scade, si risponde lo stesso
  cf.mode = 'slow';
  r = await H.adminApi('msg_reply', { code: c.code, testo: 'Sì, gratuito' }); eq(r.status, 200, 'Cloudflare lento: si risponde lo stesso');
  assert(/nessuna risposta \(rete o tempo scaduto\)/.test(logTxt()), 'motivo nel registro: ' + logTxt());
  // giù (503) con altri tre messaggi dell'ospite; poi risponde a parole invece che con l'elenco chiesto
  cf.mode = 'down';
  for (const t of ['Is there a lift?', 'And a hairdryer?', 'Thanks, you are kind']) eq((await ospite('msg_send', { code: c.code, t: c.t, testo: t, lingua: 'en' })).status, 200);
  cf.mode = 'garbage'; th = await thread(c.code);
  eq(th.messaggi.filter(m => m.da === 'ospite').map(m => m.tradotto), [undefined, undefined, undefined, undefined], 'risposta a parole: nessuna traduzione');
  assert(/il modello non ha risposto nella forma attesa/.test(logTxt()), 'motivo nel registro');
  // il modello sbaglia il gruppo ma i testi singoli vanno: si rifà un testo alla volta
  cf.mode = 'batch'; cf.calls.length = 0; th = await thread(c.code);
  eq(th.messaggi.filter(m => m.da === 'ospite').map(m => m.tradotto), ['[IT] Hello, is parking free?', '[IT] Is there a lift?', '[IT] And a hairdryer?', '[IT] Thanks, you are kind']);
  eq(cf.calls.map(x => x.n), [4, 1, 1, 1, 1], 'un gruppo da quattro, poi quattro testi singoli');
  // il modello tocca i gettoni delle variabili: la traduzione del template si scarta, il messaggio parte in italiano e non resta salvato niente
  await H.adminApi('msg_tpl_save', { templates: [{ id: 'w', nome: 'Benvenuto', testo: 'Ciao {nome}, il codice è {codice}.' }] });
  await H.adminApi('msg_auto_save', { regole: [{ id: 'conf', nome: 'Alla conferma', attiva: true, tpl: 'w', base: 'conferma' }] });
  cf.mode = 'mangle'; const d = await confermata({ da: '2027-02-10', a: '2027-02-12', email: 'nuovo@esempio.it' });
  cf.calls.length = 0; await sync();
  eq(cf.calls.map(x => x.n), [1, 1], 'un tentativo per lingua (inglese e tedesco)');
  const salvate = kv.exec(['HGETALL', 'msg:tr:' + d.code]); assert(!salvate || !(Array.isArray(salvate) ? salvate.length : Object.keys(salvate).length), 'nessuna traduzione salvata');
  eq((await thread(d.code)).messaggi.map(m => m.testo.startsWith('Ciao Mario, il codice è ')), [true], 'il messaggio è partito, in italiano');
  // tornato a posto: niente era stato salvato, quindi si traduce
  cf.mode = 'ok'; const e = await confermata({ da: '2027-03-10', a: '2027-03-12', email: 'terzo@esempio.it' });
  cf.calls.length = 0; await sync(); eq(cf.calls.map(x => x.n), [1, 1], 'si traduce di nuovo');
  eq((await ospite('msg_list', { code: e.code, t: e.t, lingua: 'en' })).body.messaggi[0].testo, '[EN] Ciao Mario, il codice è ' + e.code.slice(0, 4) + ' ' + e.code.slice(4, 8) + ' ' + e.code.slice(8) + '.');
  // Account ID non valido: la traduzione resta spenta, nessuna chiamata
  await base({ CLOUDFLARE_ACCOUNT_ID: 'non-valido', CLOUDFLARE_API_TOKEN: 'x' });
  const f = await confermata(); eq((await ospite('msg_send', { code: f.code, t: f.t, testo: 'Hello', lingua: 'en' })).status, 200);
  eq([(await thread(f.code)).traduzione, (await H.adminApi('msg_inbox', {})).body.traduttore, global.__cf.calls.length], [false, '', 0], 'Account ID non valido: traduzione spenta');
  await base(); eq([(await H.adminApi('msg_inbox', {})).body.traduttore, global.__cf.calls.length], ['', 0], 'senza chiavi: spenta');
});

test('M18 traduzione con Cloudflare, prove sul modulo: forme della risposta, gettoni delle parti protette, gruppi, lunghezze, lingue, variabili d\'ambiente, tempo, registro', async () => {
  const { makeTraduci } = require('../../api/_traduci.js');
  const mk = (risp, env, log) => {      // risp(arr, n) → il JSON della risposta, oppure { status, body } per un errore HTTP
    const calls = [];
    const t = makeTraduci({ env: Object.assign({}, CF, env), log, fetch: async (url, o) => {
      const body = JSON.parse(o.body), arr = JSON.parse(body.messages[1].content);
      calls.push({ url, o, body, arr, sys: body.messages[0].content });
      const x = await risp(arr, calls.length);
      return x && x.status ? { ok: x.status < 300, status: x.status, json: async () => x.body } : { ok: true, status: 200, json: async () => x };
    } });
    return { t, calls };
  };
  const voci = (arr, f) => arr.map(s => ({ lang: 'en', text: (f || (x => '[X] ' + x))(s) }));
  const ok = (arr, f) => ({ result: { response: JSON.stringify(voci(arr, f)) }, success: true });
  // le forme della risposta che si accettano, e quelle che no
  const forme = {
    'JSON in una stringa': arr => ({ result: { response: JSON.stringify(voci(arr)) } }),
    'JSON tra ```': arr => ({ result: { response: '```json\n' + JSON.stringify(voci(arr)) + '\n```' } }),
    'JSON con parole intorno': arr => ({ result: { response: 'Ecco: ' + JSON.stringify(voci(arr)) + ' Fatto.' } }),
    'già un elenco': arr => ({ result: { response: voci(arr) } }),
    'forma choices': arr => ({ result: { choices: [{ message: { content: JSON.stringify(voci(arr)) } }] } }),
    'oggetto con translations': arr => ({ result: { response: { translations: voci(arr) } } }),
    'senza result': arr => ({ response: JSON.stringify(voci(arr)) }),
    'un solo oggetto': arr => ({ result: { response: JSON.stringify(voci(arr)[0]) } })
  };
  for (const [nome, f] of Object.entries(forme)) eq(await mk(f).t.traduci(['uno'], 'en'), { ok: true, testi: ['[X] uno'], lingue: ['en'] }, nome);
  eq(await mk(arr => ({ result: { response: JSON.stringify(arr.map(s => '[X] ' + s)) } })).t.traduci(['uno'], 'en'), { ok: true, testi: ['[X] uno'], lingue: [''] }, 'un elenco di sole stringhe: senza la lingua riconosciuta');
  const male = {
    'a parole': () => ({ result: { response: 'Sorry, I cannot help with that.' } }),
    'null': () => ({ result: { response: null } }),
    'vuota': () => ({}),
    'un testo in meno': arr => ({ result: { response: JSON.stringify(voci(arr).slice(1)) } }),
    'un testo in più': arr => ({ result: { response: JSON.stringify(voci(arr).concat(voci(['x']))) } }),
    'senza il campo text': arr => ({ result: { response: JSON.stringify(arr.map(() => ({ lang: 'en' }))) } }),
    'testo vuoto': arr => ({ result: { response: JSON.stringify(arr.map(() => ({ lang: 'en', text: ' ' }))) } }),
    'errore 401': () => ({ status: 401, body: { success: false, errors: [{ code: 10000 }] } }),
    'errore 500': () => ({ status: 500, body: {} })
  };
  for (const [nome, f] of Object.entries(male)) eq((await mk(f).t.traduci(['uno'], 'en')).ok, false, nome);
  // parti protette (formato del sito): al modello gettoni e testo semplice; tornano intatte; se il modello le tocca la traduzione si scarta
  const xml = 'Ciao <x>{nome}</x>, <x>https://a.it/?a=1&amp;b=2</x> &amp; &lt;b&gt;';
  let m = mk(arr => ok(arr, s => s + ' & <ok>'));
  eq((await m.t.traduci([xml], 'en', { da: 'it', xml: true })).testi, ['Ciao <x>{nome}</x>, <x>https://a.it/?a=1&amp;b=2</x> &amp; &lt;b&gt; &amp; &lt;ok&gt;'], 'escape e parti protette tornano nel formato del sito');
  eq([m.calls[0].arr, m.calls[0].body.messages[1].content.includes('{nome}')], [['Ciao [[1]], [[2]] & <b>'], false], 'al modello: gettoni al posto delle parti protette, testo semplice');
  const rompi = { 'gettone perso': s => s.replace('[[1]]', ''), 'gettone doppio': s => s + ' [[1]]', 'gettone inventato': s => s + ' [[7]]', 'gettone con gli spazi': s => s.replace('[[2]]', '[[ 2 ]]') };
  for (const [nome, f] of Object.entries(rompi)) eq((await mk(arr => ok(arr, f)).t.traduci([xml], 'en', { xml: true })).ok, false, nome);
  eq((await mk(arr => ok(arr, s => s.replace('[[1]], [[2]]', '[[2]], [[1]]'))).t.traduci([xml], 'en', { xml: true })).testi, ['Ciao <x>https://a.it/?a=1&amp;b=2</x>, <x>{nome}</x> &amp; &lt;b&gt;'], 'l\'ordine può cambiare');
  m = mk(arr => ok(arr)); eq([(await m.t.traduci(['vedi [[1]] <x>{a}</x>'], 'en', { xml: true })).ok, m.calls.length], [false, 0], 'un testo che ha già un gettone non si manda');
  eq((await mk(arr => ok(arr)).t.traduci(['vedi [[1]]'], 'en')).testi, ['[X] vedi [[1]]'], 'senza parti protette i gettoni non contano');
  // gruppi: al massimo 6 testi e 2.500 caratteri per richiesta, stesso ordine
  const brevi = Array.from({ length: 14 }, (_, i) => 'testo ' + i);
  m = mk(arr => ok(arr)); let r = await m.t.traduci(brevi, 'de');
  eq([m.calls.map(x => x.arr.length), r.testi], [[6, 6, 2], brevi.map(s => '[X] ' + s)]);
  m = mk(arr => ok(arr)); r = await m.t.traduci(['a', 'b', 'c'].map(ch => ch.repeat(1400)), 'de'); eq([r.ok, m.calls.map(x => x.arr.length)], [true, [1, 1, 1]], 'per lunghezza');
  // un gruppo sbagliato si rifà un testo alla volta; un testo che proprio non va = tutto o niente; un errore del servizio non si riprova
  m = mk(arr => arr.length > 1 ? { result: { response: 'boh' } } : ok(arr)); r = await m.t.traduci(['uno', 'due', 'tre'], 'en');
  eq([r.ok, r.testi, m.calls.map(x => x.arr.length)], [true, ['[X] uno', '[X] due', '[X] tre'], [3, 1, 1, 1]]);
  m = mk(arr => arr.includes('cattivo') ? { result: { response: 'boh' } } : ok(arr)); r = await m.t.traduci(['uno', 'cattivo', 'tre'], 'en');
  eq([r.ok, m.calls.map(x => x.arr.length)], [false, [3, 1, 1]], 'ci si ferma al primo testo che non va');
  m = mk(() => ({ status: 503, body: {} })); r = await m.t.traduci(['uno', 'due'], 'en'); eq([r.ok, r.http, m.calls.length], [false, 503, 1], 'errore del servizio: nessun secondo tentativo');
  // lunghezze assurde
  eq((await mk(arr => ok(arr, s => s.repeat(30))).t.traduci(['una frase abbastanza normale'], 'en')).ok, false, 'risposta fuori misura');
  eq((await mk(arr => ok(arr, () => 'ok')).t.traduci(['una frase abbastanza lunga da non diventare due lettere'], 'en')).ok, false, 'risposta troppo corta');
  eq((await mk(arr => ok(arr, () => 'ok')).t.traduci(['grazie'], 'en')).ok, true, 'un testo breve può avere una risposta breve');
  // testi vuoti: non vanno al modello
  m = mk(arr => ok(arr)); r = await m.t.traduci(['', 'ciao', '   '], 'en');
  eq([r.testi, r.lingue, m.calls.map(x => x.arr)], [['', '[X] ciao', ''], ['', 'en', ''], [['ciao']]]);
  m = mk(arr => ok(arr)); eq([await m.t.traduci(['', ' '], 'en'), m.calls.length], [{ ok: true, testi: ['', ''], lingue: ['', ''] }, 0], 'solo testi vuoti: nessuna chiamata');
  // lingue: solo codici a due lettere; se la lingua di partenza è nota vale quella
  m = mk(() => ({ result: { response: JSON.stringify([{ lang: 'EN-US', text: 'a' }, { lang: 'fil', text: 'b' }, { lang: 'de', text: 'c' }, { text: 'd' }]) } }));
  eq((await m.t.traduci(['uno', 'due', 'tre', 'quattro'], 'it')).lingue, ['en', '', 'de', '']);
  m = mk(() => ({ result: { response: JSON.stringify([{ lang: 'xx', text: 'a' }]) } })); r = await m.t.traduci(['uno'], 'en', { da: 'it' });
  eq(r.lingue, ['it']); assert(/^SOURCE: Italian \(it\)$/m.test(m.calls[0].sys) && /^TARGET: British English \(en\)$/m.test(m.calls[0].sys));
  eq((await mk(arr => ok(arr)).t.traduci(['uno'], 'xx')).ok, false, 'lingua non gestita');
  // la richiesta
  m = mk(arr => ok(arr)); await m.t.traduci(['uno'], 'en'); const q = m.calls[0];
  eq([q.o.method, q.o.headers.Authorization, q.body.temperature, q.body.messages.map(x => x.role)], ['POST', 'Bearer ' + CF.CLOUDFLARE_API_TOKEN, 0, ['system', 'user']]);
  assert(Number.isInteger(q.body.max_tokens) && q.body.max_tokens >= 100 && q.body.max_tokens <= 2048 && !q.url.includes(CF.CLOUDFLARE_API_TOKEN), 'max_tokens: ' + q.body.max_tokens);
  // variabili d'ambiente
  let x = mk(arr => ok(arr), { CLOUDFLARE_ACCOUNT_ID: 'abc' }); eq([x.t.attiva(), x.t.nome(), (await x.t.traduci(['uno'], 'en')).ok, x.calls.length], [false, '', false, 0], 'Account ID non valido');
  x = mk(arr => ok(arr), { CLOUDFLARE_API_TOKEN: '  ' }); eq([x.t.attiva(), x.calls.length], [false, 0], 'senza chiave');
  x = mk(arr => ok(arr), { CLOUDFLARE_AI_MODEL: '@cf/google/gemma-3-12b-it' }); await x.t.traduci(['uno'], 'en'); assert(x.calls[0].url.endsWith('/ai/run/@cf/google/gemma-3-12b-it'), 'modello scelto');
  for (const brutto of ['evil', '@cf/../x', '@cf/a', 'https://evil.example/x', '@cf/meta/llama?x=1']) {
    x = mk(arr => ok(arr), { CLOUDFLARE_AI_MODEL: brutto }); await x.t.traduci(['uno'], 'en');
    assert(x.calls[0].url.endsWith('/ai/run/@cf/mistralai/mistral-small-3.1-24b-instruct'), 'modello non valido → quello di partenza: ' + brutto);
  }
  const dl = []; const t2 = makeTraduci({ env: Object.assign({}, CF, { DEEPL_API_KEY: 'k:fx' }), fetch: async u => { dl.push(u); return { ok: true, status: 200, json: async () => ({ translations: [{ text: 'x', detected_source_language: 'IT' }] }) }; } });
  eq([t2.nome(), (await t2.traduci(['uno'], 'en')).ok, dl], ['DeepL', true, ['https://api-free.deepl.com/v2/translate']], 'con le due chiavi vale DeepL');
  // il tempo
  const lento = makeTraduci({ env: Object.assign({}, CF, { CLOUDFLARE_TIMEOUT_MS: '40' }), fetch: (u, o) => new Promise((_, no) => o.signal.addEventListener('abort', () => no(new Error('annullata')))) });
  const t0 = Date.now(); eq((await lento.traduci(['uno'], 'en')).ok, false); assert(Date.now() - t0 < 2000, 'scade il tempo');
  // il registro eventi: una riga ogni 30 minuti per motivo, mai i testi; un registro che si rompe non rompe la traduzione
  const righe = []; x = mk(() => ({ status: 401, body: {} }), {}, e => { righe.push(e); });
  await x.t.traduci(['segreto'], 'en'); await x.t.traduci(['segreto'], 'en');
  eq(righe.length, 1, 'una riga sola'); assert(righe[0].lvl === 'ERR' && /errore 401.*CLOUDFLARE_API_TOKEN/.test(righe[0].msg) && !/segreto/.test(righe[0].msg), righe[0].msg);
  { // gli errori di chiave si ripetono dopo 30 minuti, la quota finita (429) solo dopo 6 ore
    const ora = Date.now; let salto = 0; Date.now = () => ora() + salto;
    try {
      const l429 = [], l401 = [], a = mk(() => ({ status: 429, body: {} }), {}, e => { l429.push(e); }), b = mk(() => ({ status: 401, body: {} }), {}, e => { l401.push(e); });
      await a.t.traduci(['x'], 'en'); await b.t.traduci(['x'], 'en');
      salto = 31 * 60e3; await a.t.traduci(['x'], 'en'); await b.t.traduci(['x'], 'en');
      eq([l429.length, l401.length], [1, 2], 'dopo 31 minuti');
      salto = 6.5 * 3600e3; await a.t.traduci(['x'], 'en'); eq(l429.length, 2, 'dopo 6 ore e mezza');
    } finally { Date.now = ora; }
  }
  x = mk(() => ({ status: 429, body: {} }), {}, () => { throw new Error('registro giù'); }); eq((await x.t.traduci(['uno'], 'en')).http, 429, 'registro che lancia');
  x = mk(() => ({ status: 429, body: {} }), {}, () => Promise.reject(new Error('registro giù'))); eq((await x.t.traduci(['uno'], 'en')).http, 429, 'registro che rifiuta');
});

/* ===================== esecuzione ===================== */
(async () => {
  const only = process.argv[2]; let pass = 0, fail = 0; const t0 = process.hrtime.bigint();
  for (const t of tests) {
    if (only && !t.n.startsWith(only)) continue;
    try { await t.f(); console.log('  ✔ ' + t.n); pass++; }
    catch (e) { console.log('  ✘ ' + t.n + '\n      → ' + String(e.stack || e.message).split('\n').slice(0, only ? 40 : 6).join('\n        ')); fail++; }
    finally { kv.after = null; global.__stripeFail = false; }
  }
  console.log('\n' + pass + ' ok, ' + fail + ' falliti  (' + (Number(process.hrtime.bigint() - t0) / 1e9).toFixed(1) + ' s)'); process.exit(fail ? 1 : 0);
})();
