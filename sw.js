// La Columbera · service worker dell'area clienti. Lo registra solo area-clienti.html, con ambito /area-clienti: le altre pagine del sito
// (prenotazione, pagamento, Gestione) non passano mai di qui.
// Serve a due cose: installare l'area ospiti come app e mostrarne la struttura anche senza rete.
// Le risposte del server (api/: dati della prenotazione) non vengono MAI salvate: passano sempre e solo dalla rete.
// Per tutto il resto prima la rete (contenuti sempre aggiornati dopo una pubblicazione); la copia salvata solo se la rete non c'è.
const V = 'lc-area-v1';
const SHELL = ['area-clienti.html', 'css/fonts.css', 'css/main.css', 'js/site.js', 'js/pages.js', 'js/area.js', 'img/brand/logo.png', 'img/brand/logo-light.png', 'favicon.ico', 'img/favicon/icon-192.png'];
const BASE = new URL('./', self.location).pathname, PATHS = new Set(SHELL.map(p => BASE + p));

self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin || u.pathname.startsWith(BASE + 'api/')) return;      // API e altri siti: il browser fa da sé
  e.respondWith(fetch(r).then(res => {
    if (res.ok && PATHS.has(u.pathname)) { const copy = res.clone(); caches.open(V).then(c => c.put(u.pathname, copy)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(u.pathname).then(m => m || (r.mode === 'navigate' ? caches.match(BASE + 'area-clienti.html') : Response.error()))));
});
