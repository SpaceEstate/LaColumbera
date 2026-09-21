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
