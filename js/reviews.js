// Sezione recensioni dinamica (Google + Booking). Si nasconde da sola se non ci sono dati reali.
(function(){
  const box = document.getElementById('reviews-box');
  if(!box) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stars = n => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
  const card = (v, src) => '<div class="review-quote"><span class="stars">' + stars(v.rating) + '</span>' + esc(v.text) +
    '<span class="author">' + esc(v.author) + ' — ' + src + (v.when ? ' · ' + esc(v.when) : '') + '</span></div>';

  fetch('/api/reviews').then(r => r.json()).then(d => {
    const g = d.google, b = d.booking, cards = [], badges = [];
    if(g && g.rating){
      badges.push('<a class="rv-badge" href="' + esc(g.url) + '" target="_blank" rel="noopener"><b>' + g.rating.toFixed(1).replace('.',',') + '</b>/5 su Google · ' + g.count + ' recensioni</a>');
      (g.reviews || []).forEach(v => cards.push(card(v, 'Google')));
    }
    if(b && b.score){
      badges.push('<a class="rv-badge" href="' + esc(b.url) + '" target="_blank" rel="noopener"><b>' + String(b.score).replace('.',',') + '</b>/10 su Booking' + (b.count ? ' · ' + b.count + ' recensioni' : '') + '</a>');
      (b.reviews || []).forEach(v => cards.push(card({rating: v.rating || 5, text: v.text, author: v.author, when: v.when}, 'Booking' + (v.score ? ' · ' + esc(v.score) : ''))));
    }
    if(!cards.length && !badges.length) return;
    // alterna le fonti per non avere blocchi separati
    box.innerHTML = '<div class="rv-badges">' + badges.join('') + '</div><div class="rv-grid">' + cards.slice(0, 6).join('') + '</div>';
    document.getElementById('recensioni').hidden = false;
  }).catch(() => {});
})();
