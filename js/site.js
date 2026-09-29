// La Columbera · UI micro-interactions
(function(){
  // OAuth Trentino Guest Card: Trentino Marketing reindirizza alla home,
  // che inoltra automaticamente code + state al callback backend.
  const oauthQs = new URLSearchParams(window.location.search);
  const oauthCode = oauthQs.get('code');
  const oauthState = oauthQs.get('state');
  if (oauthCode && oauthState && (window.location.pathname === '/' || window.location.pathname === '')) {
    const callback = new URL('/api/x', window.location.origin);
    callback.searchParams.set('a', 'gc_oauth_callback');
    callback.searchParams.set('code', oauthCode);
    callback.searchParams.set('state', oauthState);
    window.location.replace(callback.toString());
    return;
  }

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
lcPhotos();
