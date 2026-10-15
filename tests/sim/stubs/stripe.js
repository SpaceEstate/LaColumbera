let n = 0;
module.exports = key => ({
  checkout: { sessions: { create: async p => { const id = 'cs_test_' + (++n); const s = Object.assign({ id, url: 'https://stripe.test/pay/' + id }, { params: p }); (global.__stripeSessions = global.__stripeSessions || []).push(s); if (global.__stripeFail) throw new Error('stripe giù'); return { id, url: s.url }; } } },
  webhooks: { constructEvent: (buf, sig, secret) => { if (sig !== 'valid-' + secret) throw new Error('firma non valida'); return JSON.parse(buf.toString()); } }
});
