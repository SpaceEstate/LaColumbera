// Sezione recensioni dinamica (Google + Booking). Si nasconde da sola se non ci sono dati reali.
(function(){
  const box = document.getElementById('reviews-box');
  if(!box) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const https = u => /^https:\/\//i.test(u || '') ? u : '';
  const stars = n => { const r = Math.max(0, Math.min(5, Math.round(Number(n) || 0))); return '★'.repeat(r) + '☆'.repeat(5 - r); };
  // Google richiede di indicare l'autore con il link al suo profilo
  const card = (v, src, href) => {
    const h = https(href), who = h ? '<a href="' + esc(h) + '" target="_blank" rel="noopener noreferrer">' + esc(v.author) + '</a>' : esc(v.author);
    return '<div class="review-quote"><span class="stars">' + stars(v.rating) + '</span>' + esc(v.text) +
      '<span class="author">' + who + ' — ' + src + (v.when ? ' · ' + esc(v.when) : '') + '</span></div>';
  };

  fetch('/api/reviews').then(r => r.json()).then(d => {
    const g = d.google, b = d.booking, cards = [], badges = [];
    if(g && g.rating){
      badges.push('<a class="rv-badge" href="' + esc(https(g.url) || '#') + '" target="_blank" rel="noopener"><b>' + g.rating.toFixed(1).replace('.',',') + '</b>/5 su Google · ' + g.count + ' recensioni</a>');
      (g.reviews || []).forEach(v => cards.push(card(v, 'Google', v.authorUri || v.url || g.url)));
    }
    if(b && b.score){
      badges.push('<a class="rv-badge" href="' + esc(https(b.url) || '#') + '" target="_blank" rel="noopener"><b>' + esc(String(b.score).replace('.',',')) + '</b>/10 su Booking' + (b.count ? ' · ' + esc(b.count) + ' recensioni' : '') + '</a>');
      (b.reviews || []).forEach(v => cards.push(card({rating: v.rating || 5, text: v.text, author: v.author, when: v.when}, 'Booking' + (v.score ? ' · ' + esc(v.score) : ''), '')));
    }
    if(!cards.length && !badges.length) return;
    if(g && g.rating) badges.push('<a class="rv-badge" href="recensioni.html">Tutte le recensioni →</a>');
    box.innerHTML = '<div class="rv-badges">' + badges.join('') + '</div><div class="rv-grid">' + cards.slice(0, 6).join('') + '</div>';
    document.getElementById('recensioni').hidden = false;
  }).catch(() => {});
})();
