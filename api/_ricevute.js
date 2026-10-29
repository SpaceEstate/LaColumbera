'use strict';
// La Columbera · ricevuta del soggiorno, su richiesta dell'ospite.
// Il sito non emette documenti fiscali: l'ospite chiede la ricevuta dall'area clienti con i dati per intestarla, al titolare arriva un'email,
// il titolare la emette come fa di solito e in Gestione carica il PDF (o una foto), che parte all'ospite in allegato. Il file non si conserva.
// Dati in KV, hash "ric" (un campo per prenotazione). All'area ospiti torna solo lo stato e l'indirizzo mascherato, mai i dati inseriti
// (chi conosce il codice entra nell'area: non deve poter leggere codice fiscale e indirizzo). Si cancellano 30 giorni dopo l'invio
// (richieste mai evase: dopo un anno). Il prefisso "_" evita che Vercel lo esponga come endpoint.
const KEY = 'ric', TIENI_INVIATA = 30 * 864e5, TIENI_APERTA = 365 * 864e5, MAX_FILE = 3 * 1024 * 1024;
const riga = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const italia = p => /^(it|ita|italia|italy|italien)$/i.test(String(p || '').trim());
const err = (status, message) => Object.assign(new Error(message), { status });

// Codice fiscale delle persone fisiche (16 caratteri, con il carattere di controllo; le lettere di omocodia sono ammesse) o partita IVA (11 cifre)
const DISPARI = { 0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21, A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23 };
function cfOk(v) {
  if (/^\d{11}$/.test(v)) return true;
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(v)) return false;
  let s = 0;
  for (let i = 0; i < 15; i++) { const ch = v[i]; s += i % 2 === 0 ? DISPARI[ch] : (/\d/.test(ch) ? +ch : ch.charCodeAt(0) - 65); }
  return String.fromCharCode(65 + (s % 26)) === v[15];
}
// I dati per intestare la ricevuta: tutto su una riga, lunghezze massime. serveEmail: l'ospite di Booking/Airbnb (non abbiamo la sua email).
function valida(d, { serveEmail }) {
  d = d || {};
  const o = { nome: riga(d.nome, 100), cf: riga(d.cf, 30).toUpperCase().replace(/\s+/g, ''), indirizzo: riga(d.indirizzo, 120), cap: riga(d.cap, 12).toUpperCase(),
    citta: riga(d.citta, 60), paese: riga(d.paese, 40) || 'Italia', email: riga(d.email, 120).toLowerCase(), nota: String(d.nota == null ? '' : d.nota).trim().slice(0, 300) };
  const it = italia(o.paese);
  if (o.nome.length < 2) return { err: 'Scrivi il nome e cognome (o la ragione sociale) a cui intestare la ricevuta' };
  if (it && !o.cf) return { err: 'Scrivi il codice fiscale' };
  if (it && !cfOk(o.cf)) return { err: 'Il codice fiscale non sembra giusto: controllalo (16 caratteri, oppure la partita IVA di 11 cifre)' };
  if (o.indirizzo.length < 3) return { err: 'Scrivi l\'indirizzo (via e numero)' };
  if (it ? !/^\d{5}$/.test(o.cap) : !/^[A-Z0-9][A-Z0-9 -]{1,11}$/.test(o.cap)) return { err: 'Controlla il CAP' };
  if (o.citta.length < 2) return { err: 'Scrivi la città' };
  if (serveEmail && !o.email) return { err: 'Scrivi l\'email a cui mandare la ricevuta' };
  if (o.email && !RE_EMAIL.test(o.email)) return { err: 'L\'email non sembra giusta: controllala' };
  return { dati: o };
}
// il file caricato dal titolare: PDF, JPG o PNG fino a 3 MB, controllato anche dai primi byte (non solo dal tipo dichiarato)
const TIPI = { 'application/pdf': ['pdf', b => b.slice(0, 5).toString('latin1') === '%PDF-'], 'image/jpeg': ['jpg', b => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF], 'image/png': ['png', b => b.slice(0, 4).toString('hex') === '89504e47'] };
function file(dataUrl, nome, code) {
  const m = /^data:([\w/.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || '')), t = m && TIPI[m[1]];
  if (!t) return { err: 'Carica la ricevuta in PDF (oppure una foto JPG o PNG)' };
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > MAX_FILE) return { err: 'Il file è troppo grande: al massimo 3 MB' };
  if (!t[1](buf)) return { err: 'Il file non è un ' + t[0].toUpperCase() + ' valido' };
  let n = riga(nome, 80).replace(/[^\w.\- ]+/g, '_').replace(/\.[^.]*$/, '').trim() || 'ricevuta-' + code;
  return { allegato: { filename: n + '.' + t[0], content: buf, contentType: m[1] } };
}

function makeRicevute({ kv, sendMail, ownerEmail, replyTo, mail, maskEmail, log }) {
  const leggi = async code => { try { return JSON.parse(await kv('HGET', KEY, code) || 'null'); } catch (e) { if (/KV/.test(e.message)) throw e; return null; } };
  const scrivi = (code, r) => kv('HSET', KEY, code, JSON.stringify(r));
  const destinatario = (r, bk) => (r && r.email) || (bk && bk.email) || '';
  // ciò che vede l'ospite: stato, date e indirizzo mascherato (mai i dati inseriti). emailPren: dove arriva se non ne indica un'altra
  async function pubblico(code, bk) {
    const r = await leggi(code), dove = destinatario(r, bk);
    return { stato: r ? r.stato : '', richiesta_il: r ? r.richiesta_il || '' : '', inviata_il: r ? r.inviata_il || '' : '', invio: dove ? maskEmail(dove) : '', emailPren: bk && bk.email ? maskEmail(bk.email) : '' };
  }
  // x: la prenotazione trovata con il codice (sito o foglio); bk: il record del sito (nome, email, importo) o null
  // limite(): il limite di richieste (si conta solo una richiesta valida, non i dati sbagliati da correggere)
  async function richiedi(x, bk, body, { lingua, site, limite }) {
    const v = valida(body, { serveEmail: !(bk && bk.email) });
    if (v.err) throw err(400, v.err);
    const lim = limite ? await limite() : null;
    if (lim) throw Object.assign(err(lim.status, lim.body.err), { retryAfter: lim.retryAfter });
    const prima = await leggi(x.code);
    if (prima && prima.stato === 'inviata') throw err(409, 'La ricevuta ti è già stata mandata' + (prima.inviata_il ? ' il ' + prima.inviata_il.slice(8, 10) + '/' + prima.inviata_il.slice(5, 7) : '') + ': se serve una correzione scrivici a lacolumbera@gmail.com.');
    const ora = new Date().toISOString(), r = Object.assign({ stato: 'richiesta', richiesta_il: ora, lingua: ['it', 'en', 'de'].includes(lingua) ? lingua : (prima && prima.lingua) || 'it' }, v.dati, { a: x.a });
    if (!r.email) delete r.email;
    await scrivi(x.code, r);
    const info = Object.assign({ code: x.code, id: x.id, da: x.da, a: x.a }, bk ? { totale: bk.totale } : {});
    const m = mail().ricevutaRichiesta(info, site, Object.assign({}, r, { invio: destinatario(r, bk) || '—', aggiornata: !!prima }));
    const ok = await sendMail(ownerEmail, m.subject, m.html, { text: m.text, replyTo: destinatario(r, bk) || undefined });
    if (ok === null && log) await Promise.resolve(log({ lvl: 'ERR', msg: 'EMAIL NON CONFIGURATA: richiesta di ricevuta (' + x.code + ') non inviata al titolare. Mancano GMAIL_USER / GMAIL_APP_PASSWORD su Vercel.' })).catch(() => {});
    return pubblico(x.code, bk);
  }
  // Gestione: tutte le richieste (le vecchie si cancellano qui)
  async function elenco() {
    const h = (await kv('HGETALL', KEY)) || [], e = Array.isArray(h) ? h : Object.entries(h).flat(), out = [], via = [], t = Date.now();
    for (let i = 0; i + 1 < e.length; i += 2) {
      let r = null; try { r = JSON.parse(e[i + 1]); } catch (x) { r = null; }
      const vecchia = !r || (r.stato === 'inviata' ? t - Date.parse(r.inviata_il) > TIENI_INVIATA : t - Date.parse(r.richiesta_il) > TIENI_APERTA);
      if (vecchia) via.push(e[i]); else out.push(Object.assign({ code: e[i] }, r));
    }
    if (via.length) await kv('HDEL', KEY, ...via).catch(() => {});
    return out.sort((x, y) => String(y.richiesta_il || '').localeCompare(String(x.richiesta_il || '')));
  }
  // Gestione: il titolare carica la ricevuta e la manda all'ospite (anche senza richiesta, se la prenotazione del sito ha l'email)
  async function invia(x, bk, { file: f, nome, messaggio }, { site }) {
    const r = (await leggi(x.code)) || { stato: 'nuova', lingua: 'it' }, dove = destinatario(r, bk);
    if (!dove) throw err(409, 'Non ho un indirizzo a cui mandarla: l\'ospite non ha chiesto la ricevuta dall\'area clienti.');
    const a = file(f, nome, x.code);
    if (a.err) throw err(400, a.err);
    const m = mail().ricevutaOspite(Object.assign({ code: x.code, id: x.id, da: x.da, a: x.a }, bk ? { nome: bk.nome } : {}), site, r.lingua, { nome: r.nome, messaggio: String(messaggio == null ? '' : messaggio).trim().slice(0, 1000) });
    const ok = await sendMail(dove, m.subject, m.html, { text: m.text, replyTo, attachments: [a.allegato] });
    if (ok === null) throw err(503, 'Email non configurata: mancano GMAIL_USER / GMAIL_APP_PASSWORD su Vercel. La ricevuta non è partita.');
    if (!ok) throw err(502, 'L\'email non è partita: riprova tra qualche minuto.');
    const ora = new Date().toISOString();
    await scrivi(x.code, Object.assign(r, { stato: 'inviata', inviata_il: ora, file: a.allegato.filename, a: x.a }, r.richiesta_il ? {} : { richiesta_il: ora }));
    return Object.assign({ code: x.code }, r, { invio: dove });
  }
  // Gestione: segnata come mandata in un altro modo, riaperta o tolta
  async function segna(code, stato) {
    const r = await leggi(code);
    if (!r) throw err(404, 'Richiesta non trovata');
    if (stato === 'elimina') { await kv('HDEL', KEY, code); return null; }
    if (stato === 'inviata') Object.assign(r, { stato: 'inviata', inviata_il: new Date().toISOString() });
    else if (stato === 'richiesta') { r.stato = 'richiesta'; delete r.inviata_il; }
    else throw err(400, 'Stato non valido');
    await scrivi(code, r);
    return Object.assign({ code }, r);
  }
  return { pubblico, richiedi, elenco, invia, segna };
}

module.exports = { makeRicevute, valida, cfOk, file };
