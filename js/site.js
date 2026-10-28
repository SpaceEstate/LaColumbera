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


// CIN e CIPAT degli alloggi: per legge compaiono negli annunci. Arrivano dalla configurazione (Gestione → appartamento → Testi),
// quindi si cambiano senza toccare il codice. Il CIPAT può essere unico per la struttura: vale per gli appartamenti che non ne hanno uno proprio.
// Senza nessun codice impostato la riga non compare (mai segnaposto sul sito pubblico).
window.lcCodici = function(p, cipatStruttura){
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var cin = String(p && p.cin || '').trim(), cipat = String(p && p.cipat || cipatStruttura || '').trim(), o = [];
  if(cin) o.push('CIN: <b>' + esc(cin) + '</b>');
  if(cipat) o.push('CIPAT: <b>' + esc(cipat) + '</b>');
  return o.join(' · ');
};
// Schede degli appartamenti nella home (e ovunque ci sia un elemento con data-codici="<id appartamento>")
(function(){
  var els = document.querySelectorAll('[data-codici]');
  if(!els.length || !window.fetch) return;
  fetch('api/x?a=cfg').then(function(r){ return r.ok ? r.json() : null; }).then(function(c){
    if(!c || !c.apts) return;
    els.forEach(function(el){
      var p = c.apts.filter(function(x){ return x.id === el.dataset.codici; })[0], t = p ? window.lcCodici(p, c.cipat) : '';
      if(t){ el.innerHTML = t; el.hidden = false; }
    });
  }).catch(function(){});
})();
