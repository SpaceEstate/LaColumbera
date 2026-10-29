'use strict';
// La Columbera · annullamento con rimborso delle prenotazioni del sito (pagate con Stripe).
//  - L'ospite annulla da solo dall'area clienti fino a 7 giorni prima dell'arrivo (giorni di calendario, ora di Roma): rimborso totale
//    sulla carta con cui ha pagato. Dopo quel giorno non si annulla online; chi prenota a meno di 7 giorni dall'arrivo non è rimborsabile.
//  - Il titolare, da Gestione → Prenotazioni, annulla e rimborsa in qualsiasi momento (anche le prenotazioni «da verificare»).
// Ordine dei passi: PRIMA il rimborso su Stripe, poi la prenotazione diventa «annullata» (le notti tornano libere sul sito e, alla prossima
// lettura del calendario iCal, su Booking e Airbnb), poi il foglio (con la coda di ripresa) e le email. Se Stripe non risponde non cambia
// nulla. Il rimborso ha una chiave di idempotenza per prenotazione: un secondo tentativo (doppio tocco, rete caduta a metà) non rimborsa due
// volte, e un tentativo ripetuto dopo un errore completa i passi mancanti. Un lock su KV fa passare un annullamento alla volta.
// Il prefisso "_" evita che Vercel lo esponga come endpoint.
const { addDays, rangeDays, todayRome, isIso } = require('./_avail.js');

const GIORNI = 7;                                        // fino a quanti giorni prima dell'arrivo l'ospite annulla da solo
const ultimoGiorno = da => addDays(da, -GIORNI);         // l'ultimo giorno (compreso) in cui l'ospite può annullare
const err = (status, message, code) => Object.assign(new Error(message), { status, code });
const euro = n => (+n || 0).toLocaleString('it-IT', { minimumFractionDigits: Number.isInteger(+n) ? 0 : 2, maximumFractionDigits: 2 }) + ' €';

// Si può annullare online? possibile, ultimo giorno (entro) e motivo: ok | scaduto | non_pagata | stato
function politica(b, oggi) {
  if (!b || !isIso(b.da)) return { possibile: false, entro: '', motivo: 'stato' };
  const entro = ultimoGiorno(b.da);
  if (b.stato !== 'confermata') return { possibile: false, entro, motivo: 'stato' };
  if (!b.pagamento) return { possibile: false, entro, motivo: 'non_pagata' };
  if (oggi > entro) return { possibile: false, entro, motivo: 'scaduto' };
  return { possibile: true, entro, motivo: 'ok' };
}
const NO = {
  scaduto: 'Si annulla online fino a 7 giorni prima dell\'arrivo: questa prenotazione non è più rimborsabile. Per qualsiasi necessità scrivici a lacolumbera@gmail.com o chiamaci al +39 351 704 3594.',
  non_pagata: 'Per questa prenotazione non c\'è un pagamento online da rimborsare: scrivici a lacolumbera@gmail.com e ti aiutiamo.',
  stato: 'Questa prenotazione non si può annullare online: scrivici a lacolumbera@gmail.com.'
};

function makeAnnulla({ kv, E, stripe, sendMail, ownerEmail, replyTo, mail, sheet, log }) {
  const registra = e => (log ? Promise.resolve(log(e)).catch(() => {}) : Promise.resolve());

  // pagamento su Stripe da rimborsare: di norma il payment intent (pi_…); per i record con l'id della sessione (cs_…) lo si chiede a Stripe
  async function paymentIntent(b) {
    const p = String(b.pagamento || '');
    if (/^pi_/.test(p)) return p;
    if (/^cs_/.test(p)) { const s = await stripe().checkout.sessions.retrieve(p); return String((s && s.payment_intent) || ''); }
    return '';
  }
  async function rimborsoStripe(b) {
    if (!process.env.STRIPE_SECRET_KEY) throw err(503, 'Pagamenti non configurati sul server (manca STRIPE_SECRET_KEY): nulla è cambiato.', 'STRIPE_NON_CONFIGURATO');
    try {
      const pi = await paymentIntent(b);
      if (!pi) throw err(409, 'Non trovo il pagamento su Stripe: rimborsalo dalla dashboard di Stripe, poi annulla la prenotazione da Gestione.', 'SENZA_PAGAMENTO');
      // parametri sempre uguali per la stessa prenotazione: Stripe rifiuta una chiave di idempotenza riusata con parametri diversi
      const r = await stripe().refunds.create({ payment_intent: pi, reason: 'requested_by_customer', metadata: { code: b.code } }, { idempotencyKey: 'lc-rimborso-' + b.code });
      if (r.status === 'failed' || r.status === 'canceled') throw err(502, 'Stripe ha rifiutato il rimborso: nulla è cambiato. Controlla il pagamento sulla dashboard di Stripe.', 'RIMBORSO_RIFIUTATO');
      return { id: String(r.id || ''), importo: (+r.amount || 0) / 100, stato: String(r.status || 'succeeded') };
    } catch (e) {
      if (e && e.status) throw e;
      if (e && e.code === 'charge_already_refunded') return { id: '', importo: +b.totale || 0, stato: 'gia_rimborsato' };      // rimborsato prima, es. dalla dashboard
      console.error('rimborso:', String((e && (e.type || e.code || e.message)) || 'errore').slice(0, 80));
      throw err(502, 'Il rimborso non è partito perché Stripe non risponde: nulla è cambiato. Riprova tra qualche minuto.', 'STRIPE');
    }
  }

  // una email una sola volta (marcatore su KV); se l'invio fallisce il marcatore si toglie e un nuovo tentativo la rimanda
  async function unaVolta(code, nome, fn) {
    const k = 'done:' + code + ':' + nome;
    if ((await kv('SET', k, new Date().toISOString(), 'NX')) !== 'OK') return;
    let r = false; try { r = await fn(); } catch (e) { r = false; }
    if (r === null) await registra({ lvl: 'ERR', msg: 'EMAIL NON CONFIGURATA: ' + nome + ' (' + code + ') non inviata. Mancano GMAIL_USER / GMAIL_APP_PASSWORD su Vercel.' });
    if (r === false) await kv('DEL', k).catch(() => {});
  }
  async function avvisi(b, { da, lingua, site }) {
    const M = mail();
    if (/.+@.+\..+/.test(b.email || '')) await unaVolta(b.code, 'mail_annullo_ospite', () => { const m = M.annullataOspite(b, site, lingua); return sendMail(b.email, m.subject, m.html, { text: m.text, replyTo }); });
    if (da === 'ospite') await unaVolta(b.code, 'mail_annullo_titolare', () => { const m = M.annullataTitolare(b, site); return sendMail(ownerEmail, m.subject, m.html, { text: m.text, replyTo: b.email || undefined }); });
  }

  // da: 'ospite' (area clienti, con la regola dei 7 giorni) oppure 'titolare' (Gestione, senza limiti di data)
  async function annulla(code, { da = 'ospite', lingua = '', site = '' } = {}) {
    code = String(code || '').trim().toUpperCase();
    if (!code) throw err(404, 'Prenotazione non trovata', 'NON_TROVATA');
    const lk = 'lock:' + code + ':annulla';
    if ((await kv('SET', lk, '1', 'NX', 'EX', '120')) !== 'OK') throw err(409, 'L\'annullamento è già in corso: attendi qualche secondo e ricarica la pagina.', 'IN_CORSO');
    try {
      let b = await E.bkGet(code);
      if (!b) throw err(404, 'Prenotazione non trovata', 'NON_TROVATA');
      if (b.stato === 'annullata') {                     // già annullata: stessa risposta (un tentativo ripetuto completa le email mancanti)
        if (b.rimborso) await avvisi(b, { da: b.annullata_da || da, lingua, site });
        return { ok: true, gia: true, booking: b };
      }
      if (da === 'ospite') { const p = politica(b, todayRome()); if (!p.possibile) throw err(409, NO[p.motivo] || NO.stato, 'NON_ANNULLABILE'); }
      else if (!['confermata', 'da_verificare'].includes(b.stato)) throw err(409, 'Con il rimborso si annullano solo le prenotazioni pagate (confermate o da verificare): per le altre cambia lo stato.', 'STATO');
      if (!b.pagamento) throw err(409, da === 'ospite' ? NO.non_pagata : 'Questa prenotazione non ha un pagamento online da rimborsare: annullala cambiando lo stato.', 'SENZA_PAGAMENTO');
      const r = await rimborsoStripe(b), ora = new Date().toISOString();
      b = (await E.bkGet(code)) || b;                    // si riparte dal record attuale: nel frattempo può averlo scritto qualcun altro
      Object.assign(b, { stato: 'annullata', annullata_il: ora, annullata_da: da, rimborso: Object.assign(r, { il: ora }) });
      b.note = ((b.note ? b.note + ' · ' : '') + (da === 'ospite' ? 'ANNULLATA DALL\'OSPITE' : 'ANNULLATA DAL TITOLARE') + ' IL ' + ora.slice(0, 10) + ' · RIMBORSO ' + euro(r.importo) + (r.id ? ' (' + r.id + ')' : r.stato === 'gia_rimborsato' ? ' (GIÀ RIMBORSATA SU STRIPE)' : '')).slice(-500);
      await E.bkPut(b);
      await E.holdRelease(b.id, rangeDays(b.da, b.a), b.code).catch(() => {});
      await Promise.resolve(sheet(b)).catch(() => {});   // upsert sul foglio; se non risponde va nella coda di ripresa
      await registra({ lvl: 'INFO', msg: 'Prenotazione ' + code + ' annullata ' + (da === 'ospite' ? 'dall\'ospite' : 'dal titolare') + ' · rimborso ' + euro(r.importo) + ' (' + r.stato + ')' });
      await avvisi(b, { da, lingua, site });
      return { ok: true, booking: b };
    } finally { await kv('DEL', lk).catch(() => {}); }
  }

  return { annulla, politica };
}

module.exports = { makeAnnulla, politica, ultimoGiorno, GIORNI };
