// La Columbera · "Come trovarci": schede cliccabili delle linee bus che servono Ravina.
// Il link di ogni scheda apre la fermata "Ravina Piazza" su Google Maps.
// Foto: file propri in img/ (bus-12.jpg, bus-14.jpg). Per cambiarle basta sostituire il file.
(function(){
  var grid=document.getElementById('bus-grid');
  if(!grid)return;
  var FERMATA='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent('Fermata Ravina Piazza, Ravina, Trento');
  var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};

  // Le descrizioni partono da Ravina (da dove sale l'ospite) verso la stazione/il centro.
  var LINEE=[
    {id:'12',tag:'Urbana · linea 12',t:'Linea 12',meta:['Ravina ↔ Stazione FS · Piazza Dante'],
     d:'Il collegamento principale con il centro: da Ravina Piazza alla stazione ferroviaria di Trento e a Piazza Dante, con passaggi frequenti nei giorni feriali. Dall\u2019altra parte la linea prosegue verso Romagnano.',
     local:'img/bus-12.jpg',alt:'Autobus Trentino Trasporti della linea 12 diretto a Ravina'},
    {id:'14',tag:'Urbana · linea 14',t:'Linea 14',meta:['Ravina ↔ Stazione FS · Piazza Dante'],
     d:'L\u2019altra linea urbana che serve Ravina: da Ravina Piazza alla stazione ferroviaria e a Piazza Dante, nel cuore di Trento. Dall\u2019altra parte la linea prosegue verso il Belvedere. Stessa flotta della linea 12.',
     local:'img/bus-14.jpg',alt:'Autobus Trentino Trasporti della linea 14 diretto a Ravina'}
  ];

  grid.innerHTML=LINEE.map(function(l){
    var hasImg=!!(l.local||l.og);
    return '<a class="apt-card" href="'+FERMATA+'" target="_blank" rel="noopener noreferrer"'
      +' aria-label="'+esc(l.t)+': apri la fermata Ravina Piazza su Google Maps (si apre in una nuova scheda)"'
      +' data-testid="bus-line-'+l.id+'-card">'
      +'<figure'+(hasImg?'':' class="no-photo"')+'>'
      +(hasImg?'<img alt="'+esc(l.alt)+'" width="640" height="512" loading="lazy" decoding="async"'
        +(l.local?' data-local="'+esc(l.local)+'"':'')+(l.og?' data-og="'+esc(l.og)+'"':'')+'>':'')
      +'<span class="apt-tag">'+esc(l.tag)+'</span></figure>'
      +'<div class="body"><h3>'+esc(l.t)+'</h3>'
      +'<div class="meta">'+l.meta.map(function(x){return '<span>'+esc(x)+'</span>'}).join('')+'</div>'
      +'<p>'+esc(l.d)+'</p>'
      +'<div class="cta"><span class="cta-link">Apri la fermata Ravina Piazza <span aria-hidden="true">↗</span></span></div>'
      +'</div></a>';
  }).join('');

  if(window.lcPhotos)window.lcPhotos();
})();
