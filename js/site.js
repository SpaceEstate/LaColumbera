// La Columbera · UI micro-interactions
(function(){
  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById('nav-links');
  const solid = header && header.hasAttribute('data-solid');

  // Sticky header state
  const onScroll = () => {
    if(!header) return;
    header.classList.toggle('is-scrolled', solid || window.scrollY > 40);
  };
  window.addEventListener('scroll', onScroll, {passive:true});
  onScroll();

  // Mobile menu
  if(toggle && nav){
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', e => {
      if(e.target.tagName === 'A'){
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded','false');
      }
    });
  }

  // Home · «Verifica disponibilità»: la scelta dell'appartamento (<details>) si richiude con Esc o toccando fuori;
  // all'apertura, se non è tutta sullo schermo (schermi bassi), la pagina scorre quel tanto che basta per vederla
  document.querySelectorAll('details.hero-book').forEach(d => {
    d.addEventListener('toggle', () => {
      const m = d.open && d.querySelector('.hero-book-menu'), r = m && m.getBoundingClientRect();
      if(r && r.bottom > window.innerHeight) window.scrollBy({top: r.bottom - window.innerHeight + 16, behavior: window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    });
    document.addEventListener('click', e => { if(d.open && !d.contains(e.target)) d.open = false; });
    document.addEventListener('keydown', e => {
      if(e.key === 'Escape' && d.open){ d.open = false; d.querySelector('summary').focus(); }
    });
  });

  // Reveal on scroll
  const revealEls = document.querySelectorAll('[data-reveal]');
  if('IntersectionObserver' in window && revealEls.length){
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if(e.isIntersecting){
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, {threshold:0.14, rootMargin:'0px 0px -60px 0px'});
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  // Year in footer
  const y = document.getElementById('yr');
  if(y) y.textContent = new Date().getFullYear();
})();


// Foto reali: <img data-local="img/..."> (file nel repo, ha la precedenza) e/o <img data-og="URL pagina ufficiale">
// (api/x?a=og&u=… restituisce l'immagine di copertina della pagina). Se nessuna delle due è disponibile la scheda mostra un segnaposto neutro.
window.lcPhotos = function(root){
  (root || document).querySelectorAll('img[data-local],img[data-og]').forEach(function(im){
    if(im.dataset.done) return; im.dataset.done = '1';
    var fig = im.closest('figure');
    var og = im.dataset.og ? 'api/x?a=og&u=' + encodeURIComponent(im.dataset.og) : '';
    var fail = function(){ if(fig) fig.classList.add('no-photo'); };
    im.addEventListener('error', function(){
      if(im.dataset.local && og && !im.dataset.tried){ im.dataset.tried = '1'; im.src = og; }
      else fail();
    });
    im.src = im.dataset.local || og;
  });
};
window.lcPhotos();


// CIN e CIPAT degli alloggi: per legge compaiono negli annunci. Arrivano dalla configurazione (Gestione → Sito → Appartamenti → Testi),
// quindi si cambiano senza toccare il codice. Il CIPAT può essere unico per la struttura: vale per gli appartamenti che non ne hanno uno proprio.
// Senza nessun codice impostato la riga non compare (mai segnaposto sul sito pubblico).
window.lcCodici = function(p, cipatStruttura){
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var cin = String(p && p.cin || '').trim(), cipat = String(p && p.cipat || cipatStruttura || '').trim(), o = [];
  if(cin) o.push('CIN: <b>' + esc(cin) + '</b>');
  if(cipat) o.push('CIPAT: <b>' + esc(cipat) + '</b>');
  return o.join(' · ');
};
// Home: testi e foto cambiati da Gestione → Sito → Home (c.home: solo i campi cambiati, gli altri restano quelli scritti nella pagina) e i dati
// degli appartamenti dalla loro configurazione (nome, sottotitolo, ospiti: una sola fonte). Tutto come testo, mai HTML; foto solo dal sito o
// caricate dalla Gestione. Segnaposto: {nome} e {max} dell'appartamento dell'elemento (data-apt), {email} e {telefono} i collegamenti già nella pagina.
window.lcHome = function(c){
  if(!c) return;
  var h = c.home && typeof c.home === 'object' ? c.home : {}, apts = {};
  (c.apts || []).forEach(function(p){ if(p && p.id) apts[p.id] = p; });
  var txt = function(k){ return typeof h[k] === 'string' && h[k].trim() ? h[k] : null; };
  var okImg = function(u){ u = String(u || '').trim(); return /^(img\/[\w\-./]+\.(jpe?g|png|webp)|https:\/\/[\w-]+\.public\.blob\.vercel-storage\.com\/[\w\-./]+)$/i.test(u) && u.indexOf('..') < 0 ? u : ''; };
  var dati = function(el){ var p = apts[el.getAttribute('data-apt')]; return p ? { nome: String(p.nome || p.id).replace('La Columbera ', ''), max: p.max ? String(p.max) : '' } : {}; };
  document.querySelectorAll('[data-home]').forEach(function(el){
    var tpl = txt(el.getAttribute('data-home')), ph = {}, v = dati(el);
    el.querySelectorAll('[data-ph]').forEach(function(x){ var n = x.getAttribute('data-ph'); if(!ph[n]) ph[n] = x; });
    if(!tpl){ Object.keys(ph).forEach(function(n){ if(v[n]) ph[n].textContent = v[n]; }); return; }      // testo di partenza: solo i dati dell'appartamento
    if(!Object.keys(ph).length){ el.textContent = tpl; return; }
    var frag = document.createDocumentFragment();
    tpl.split(/(\{[a-z]+\})/).forEach(function(s){
      var m = /^\{([a-z]+)\}$/.exec(s);
      if(m && ph[m[1]]){ var n = ph[m[1]].cloneNode(true); if(v[m[1]]) n.textContent = v[m[1]]; frag.appendChild(n); }      // l'elemento della pagina (link compresi)
      else if(s) frag.appendChild(document.createTextNode(s));
    });
    el.textContent = ''; el.appendChild(frag);
  });
  document.querySelectorAll('[data-apt-sotto]').forEach(function(el){ var p = apts[el.getAttribute('data-apt-sotto')]; if(p && typeof p.sotto === 'string' && p.sotto.trim()) el.textContent = p.sotto; });
  document.querySelectorAll('img[data-home-img]').forEach(function(im){
    var u = okImg(h[im.getAttribute('data-home-img')]), alt = txt(im.getAttribute('data-home-alt'));
    if(u){ im.removeAttribute('srcset'); im.removeAttribute('sizes'); im.src = u; im.alt = alt || ''; }      // foto nuova senza descrizione: alt vuoto, mai quello della foto di prima
    else if(alt) im.alt = alt;
  });
};
// Schede degli appartamenti nella home (e ovunque ci sia un elemento con data-codici="<id appartamento>") e contenuti della home: una sola richiesta
(function(){
  var els = document.querySelectorAll('[data-codici]'), home = document.querySelector('[data-home],[data-home-img],[data-apt-sotto]');
  if((!els.length && !home) || !window.fetch) return;
  fetch('api/x?a=cfg').then(function(r){ return r.ok ? r.json() : null; }).then(function(c){
    if(!c || !c.apts) return;
    if(home) window.lcHome(c);
    els.forEach(function(el){
      var p = c.apts.filter(function(x){ return x.id === el.dataset.codici; })[0], t = p ? window.lcCodici(p, c.cipat) : '';
      if(t){ el.innerHTML = t; el.hidden = false; }
    });
  }).catch(function(){});
})();
// Eventi (pagina Eventi e scheda «Dintorni» dell'area clienti): si caricano appena l'ospite entra nel sito, così quando apre gli eventi sono già pronti.
// Una sola richiesta per pagina (la promessa è condivisa) e una copia nella scheda (sessionStorage, 10 minuti) per le pagine successive.
// window.lcEventi() → Promise con l'elenco: eventi automatici e quelli inseriti in Gestione (vuoto se il servizio non risponde).
(function(){
  if(!window.fetch || !window.Promise) return;
  var KEY = 'lc_ev', TTL = 10 * 60 * 1000, p = null;
  var get = function(q){ return fetch('api/x?' + q).then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; }); };
  var arr = function(x){ return Array.isArray(x) ? x : []; };
  window.lcEventi = function(){
    if(p) return p;
    try{ var c = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if(c && Array.isArray(c.list) && Date.now() - c.ts < TTL && Date.now() >= c.ts) return (p = Promise.resolve(c.list)); }catch(e){}
    p = Promise.all([get('a=events_feed'), get('a=events')]).then(function(r){
      var list = arr(r[0]).concat(arr(r[1]));
      if(r[0] && r[1]){ try{ sessionStorage.setItem(KEY, JSON.stringify({ ts: Date.now(), list: list })); }catch(e){} }
      else p = null;      // servizio non raggiungibile: la prossima richiesta riprova
      return list;
    });
    return p;
  };
  if(/\/admin(\.html)?$/.test(location.pathname)) return;      // la Gestione non ne ha bisogno (e i suoi eventi li legge sempre freschi)
  var go = function(){ window.lcEventi(); };
  if(window.requestIdleCallback) requestIdleCallback(go, { timeout: 2000 }); else setTimeout(go, 300);
})();
