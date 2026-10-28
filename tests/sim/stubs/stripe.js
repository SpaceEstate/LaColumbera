// Stripe finto per il banco di prova. Registra le sessioni create (global.__stripeSessions) e, per i test della rete di sicurezza dei pagamenti,
// permette di decidere com'è andata ogni sessione: global.__stripeState[id] = { paid: true } oppure { status: 'expired' }.
// global.__stripeWebhooks = elenco degli endpoint registrati (webhookEndpoints.list); global.__stripeFailedDeliveries = numero di consegne fallite (events.list).
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
    } } },
  webhooks: { constructEvent: (buf, sig, secret) => { if (sig !== 'valid-' + secret) throw new Error('firma non valida'); return JSON.parse(buf.toString()); } },
  webhookEndpoints: { list: async () => { if (global.__stripeListFail) { const e = new Error('Permission'); e.code = 'permission_error'; throw e; } return { data: global.__stripeWebhooks || [] }; } },
  events: { list: async () => ({ data: Array.from({ length: global.__stripeFailedDeliveries || 0 }, (_, i) => ({ id: 'evt_' + i })) }) }
});
