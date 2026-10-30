// Stripe finto per il banco di prova. Registra le sessioni create (global.__stripeSessions) e, per i test della rete di sicurezza dei pagamenti,
// permette di decidere com'è andata ogni sessione: global.__stripeState[id] = { paid: true } oppure { status: 'expired' }.
// global.__stripeWebhooks = elenco degli endpoint registrati (webhookEndpoints.list); global.__stripeFailedDeliveries = numero di consegne fallite (events.list).
// Rimborsi: global.__stripeRefunds = rimborsi creati ({ key, params, res }); stessa chiave di idempotenza = stesso rimborso (parametri diversi: errore,
// come Stripe); global.__stripeRefundFail = Stripe non raggiungibile; global.__stripeRefunded[pi] = già rimborsato (es. dalla dashboard);
// global.__stripeRefundStatus = stato restituito (predefinito 'succeeded').
// Elenco delle sessioni (checkout.sessions.list, rete di sicurezza del check-in online): global.__stripeList = sessioni come le dà Stripe (con created
// in secondi), filtrate per created.gte / created.lte; global.__stripeListCalls conta le chiamate; global.__stripeSessionsListFail = Stripe non raggiungibile.
let n = 0;
const state = id => (global.__stripeState && global.__stripeState[id]) || {};
module.exports = key => ({
  checkout: { sessions: {
    create: async p => { const id = 'cs_test_' + (++n); const s = Object.assign({ id, url: 'https://stripe.test/pay/' + id }, { params: p }); (global.__stripeSessions = global.__stripeSessions || []).push(s); if (global.__stripeFail) throw new Error('stripe giù'); return { id, url: s.url }; },
    retrieve: async id => {
      if (global.__stripeRetrieveFail) { const e = new Error('Stripe non raggiungibile'); e.code = 'api_connection_error'; throw e; }
      const s = (global.__stripeSessions || []).find(x => x.id === id);
      if (!s) { const e = new Error('No such checkout.session: ' + id); e.code = 'resource_missing'; throw e; }
      const st = state(id), p = s.params;
      return { id, status: st.status || (st.paid ? 'complete' : 'open'), payment_status: st.paid ? 'paid' : 'unpaid', payment_intent: st.paid ? 'pi_' + id : null,
        metadata: p.metadata, client_reference_id: p.client_reference_id, customer_email: p.customer_email, customer_details: { email: p.customer_email },
        amount_total: p.line_items[0].price_data.unit_amount };
    },
    list: async p => {
      global.__stripeListCalls = (global.__stripeListCalls || 0) + 1;
      if (global.__stripeSessionsListFail) { const e = new Error('Stripe non raggiungibile'); e.code = 'api_connection_error'; throw e; }
      const c = (p && p.created) || {};
      return { data: (global.__stripeList || []).filter(s => !(c.gte != null && s.created < c.gte) && !(c.lte != null && s.created > c.lte)).slice(0, (p && p.limit) || 10), has_more: false };
    } } },
  refunds: { create: async (p, o) => {
    if (global.__stripeRefundFail) { const e = new Error('Stripe non raggiungibile'); e.code = 'api_connection_error'; throw e; }
    const R = global.__stripeRefunds = global.__stripeRefunds || [], key = o && o.idempotencyKey, same = key && R.find(r => r.key === key);
    if (same) { if (JSON.stringify(same.params) !== JSON.stringify(p)) { const e = new Error('Keys for idempotent requests can only be used with the same parameters they were first used with.'); e.type = 'idempotency_error'; throw e; } return same.res; }
    if (global.__stripeRefunded && global.__stripeRefunded[p.payment_intent]) { const e = new Error('Charge has already been refunded.'); e.code = 'charge_already_refunded'; throw e; }
    const s = (global.__stripeSessions || []).find(x => p.payment_intent === 'pi_' + x.id || p.payment_intent === 'pi_' + (x.params.metadata || {}).code);
    const res = { id: 're_test_' + (R.length + 1), object: 'refund', amount: s ? s.params.line_items[0].price_data.unit_amount : 0, currency: 'eur', status: global.__stripeRefundStatus || 'succeeded', payment_intent: p.payment_intent, metadata: p.metadata };
    R.push({ key, params: p, res }); return res;
  } },
  webhooks: { constructEvent: (buf, sig, secret) => { if (sig !== 'valid-' + secret) throw new Error('firma non valida'); return JSON.parse(buf.toString()); } },
  webhookEndpoints: { list: async () => { if (global.__stripeListFail) { const e = new Error('Permission'); e.code = 'permission_error'; throw e; } return { data: global.__stripeWebhooks || [] }; } },
  events: { list: async () => ({ data: Array.from({ length: global.__stripeFailedDeliveries || 0 }, (_, i) => ({ id: 'evt_' + i })) }) }
});
