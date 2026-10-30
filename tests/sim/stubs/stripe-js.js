// Stripe.js finto per il browser simulato (tests/sim/ui.js): stessa forma di https://js.stripe.com/dahlia/stripe.js per i pagamenti nella pagina
// (Stripe(pk, opzioni).initCheckoutElementsSdk → createPaymentElement / loadActions / confirm). Registra le chiamate in window.__stripeJs;
// l'esito del pagamento lo decide la prova con window.__stripeConfirm(args) (predefinito: riuscito). Si carica prima di js/pages.js.
(function () {
  const S = window.__stripeJs = { istanze: [], init: [], mount: [], confirm: [], distrutti: 0 };
  window.Stripe = function (pk, opts) {
    S.istanze.push({ pk, opts });
    return {
      initCheckoutElementsSdk(o) {
        S.init.push(o);
        const handlers = [];
        return {
          on(ev, fn) { if (ev === 'change') handlers.push(fn); },
          createPaymentElement(opz) {
            return {
              mount(sel) { const el = typeof sel === 'string' ? document.querySelector(sel) : sel; S.mount.push({ sel, opz }); if (el) el.innerHTML = '<div data-testid="stripe-fake-card">Carta (Stripe)</div>'; },
              destroy() { S.distrutti++; }
            };
          },
          loadActions() {
            if (window.__stripeLoadFail) return Promise.resolve({ type: 'error', error: { message: 'errore di Stripe', code: null } });
            return Promise.resolve({ type: 'success', actions: {
              getSession: () => ({ canConfirm: true }),
              confirm(args) { S.confirm.push(args); return window.__stripeConfirm ? window.__stripeConfirm(args, o) : Promise.resolve({ type: 'success', session: {} }); }
            } });
          }
        };
      }
    };
  };
})();
