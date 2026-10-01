// La Columbera · "Come trovarci": schede cliccabili delle linee bus che servono Ravina.
// Il link di ogni scheda apre la fermata reale "Ravina Masere" su Google Maps (non una fermata generica).
// Foto: img/Trento1.jpg è una foto vera del centro di Trento (da cui partono le linee urbane 12 e 14);
// per le linee extraurbane viene usata la foto ufficiale della pagina di Castel Toblino, meta della Valle dei Laghi.
(function(){
  var grid=document.getElementById('bus-grid');
  if(!grid)return;
  var FERMATA='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent('Fermata Ravina Masere, Ravina, Trento');
  var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};

  var LINEE=[
    {id:'12',tag:'Urbana · linea 12',t:'Linea 12',meta:['Piazza Dante · Stazione FS ↔ Ravina ↔ Romagnano'],
     d:'Il collegamento principale con il centro: da Piazza Dante e dalla stazione ferroviaria di Trento fino a Ravina e Romagnano, con passaggi frequenti nei giorni feriali. Scende proprio alla fermata Ravina Masere.',
     local:'img/bus-ravina.jpg',alt:'Autobus Trentino Trasporti della linea 12 diretto a Ravina'},
    {id:'14',tag:'Urbana',t:'Linea 14',meta:['Piazza Dante ↔ Ravina ↔ Belvedere'],
     d:'L\u2019altra linea urbana che serve Ravina: dal centro di Trento fino a Ravina Masere e poi verso il Belvedere. Stessa flotta della linea 12.',
     local:'img/bus-ravina.jpg',alt:'Autobus urbano Trentino Trasporti a Ravina'},
    {id:'extra',tag:'Extraurbana',t:'Linee B302 · B311',meta:['Ravina Masere','Valle dei Laghi · altopiani'],
     d:'Dalla stessa fermata di Ravina Masere partono anche i collegamenti extraurbani verso la Valle dei Laghi (Toblino, Cavedine) e gli altopiani: comodi per una gita senza auto.',
     og:'https://www.visittrentino.info/it/guida/da-vedere/castelli/castel-toblino_md_2454',alt:'Valle dei Laghi, servita dalle linee extraurbane'}
  ];

  grid.innerHTML=LINEE.map(function(l){
    var hasImg=!!(l.local||l.og);
    return '<a class="apt-card" href="'+FERMATA+'" target="_blank" rel="noopener noreferrer"'
      +' aria-label="'+esc(l.t)+': apri la fermata Ravina Masere su Google Maps (si apre in una nuova scheda)"'
      +' data-testid="bus-line-'+l.id+'-card">'
      +'<figure'+(hasImg?'':' class="no-photo"')+'>'
      +(hasImg?'<img alt="'+esc(l.alt)+'" width="640" height="512" loading="lazy" decoding="async"'
        +(l.local?' data-local="'+esc(l.local)+'"':'')+(l.og?' data-og="'+esc(l.og)+'"':'')+'>':'')
      +'<span class="apt-tag">'+esc(l.tag)+'</span></figure>'
      +'<div class="body"><h3>'+esc(l.t)+'</h3>'
      +'<div class="meta">'+l.meta.map(function(x){return '<span>'+esc(x)+'</span>'}).join('')+'</div>'
      +'<p>'+esc(l.d)+'</p>'
      +'<div class="cta"><span class="cta-link">Apri la fermata Ravina Masere <span aria-hidden="true">↗</span></span></div>'
      +'</div></a>';
  }).join('');

  if(window.lcPhotos)window.lcPhotos();
})();
