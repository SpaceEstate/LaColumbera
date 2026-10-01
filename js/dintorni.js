// La Columbera · Luoghi di interesse, Eventi per stagione e Convenzioni.
// Dati statici: per cambiare testi, link o foto basta modificare questo file.
//
// FOTO — ogni scheda mostra una foto vera del luogo, mai casuale, in quest'ordine:
//   1) local — file nel repo (es. 'img/Trento1.jpg'): se c'è, vince sempre.
//   2) og    — pagina ufficiale da cui prendere la foto di copertina (di norma il link stesso della scheda).
//   Se non c'è nessuna delle due la scheda mostra un segnaposto neutro, mai una foto a caso.
// LINK — l'intera scheda è cliccabile; i link esterni si aprono in una nuova scheda.
(function(){
  var VT='https://www.visittrentino.info/it/';

  // ---------- Luoghi di interesse ----------
  var LUOGHI=[
    {id:'centro',t:'Centro storico di Trento',meta:['5 min in auto','MUSE, Piazza Duomo, Castello Buonconsiglio'],
     d:'Il salotto della città: fontana del Nettuno, palazzi affrescati, il Duomo di San Vigilio e il moderno MUSE di Renzo Piano.',
     local:'img/Trento1.jpg',alt:'Piazza Duomo, Trento',link:'https://www.visittrento.it',lt:'visittrento.it'},
    {id:'toblino',t:'Lago di Toblino',meta:['25 min','castello sull\u2019acqua'],
     d:'Uno dei paesaggi più fotografati del Trentino: il castello di Toblino su un istmo che entra nel lago.',
     alt:'Castel Toblino sul lago di Toblino',link:VT+'guida/da-vedere/castelli/castel-toblino_md_2454',lt:'Scheda ufficiale'},
    {id:'bondone',t:'Monte Bondone',meta:['20 min','ciclabile · sci · sentieri'],
     d:'La montagna di Trento: percorsi facili in estate, piste da sci in inverno, panorami sulla città e sulla valle dell\u2019Adige.',
     alt:'Monte Bondone',link:'https://www.visittrentino.info/it/trentino/aree-sciistiche/trento-e-monte-bondone_md_2236',lt:'visittrentino.info'},
    {id:'cantine',t:'Cantine e produttori locali',meta:['2-15 min','vino · miele · formaggi'],
     d:'Le cantine di Ravina e della Valle dell\u2019Adige: Trentodoc, Teroldego, Nosiola. Chiedeteci per visite guidate e degustazioni.',
     alt:'Vigneti e vini del Trentino',link:VT+'gusto/vini-del-trentino',lt:'Vini del Trentino'},
    {id:'garda',t:'Lago di Garda (sponda trentina)',meta:['40 min','Riva, Torbole, Arco'],
     d:'La parte più selvaggia del Garda: falesie per l\u2019arrampicata, windsurf, kite e passeggiate sul lungolago.',
     alt:'Lago di Garda Trentino',link:'https://www.gardatrentino.it',lt:'gardatrentino.it'},
    {id:'ciclabile',t:'Ciclabile della Valle dell\u2019Adige',meta:['parte da 5 min','fino a Verona'],
     d:'Piatta e panoramica, attraversa vigneti e frutteti. Da qui potete raggiungere in bici Trento centro, Rovereto o scendere verso il Garda.',
     alt:'Ciclabile lungo l\u2019Adige',link:VT+'guida/attivita-outdoor/ciclabili',lt:'Piste ciclabili del Trentino'},
    {id:'val-di-non',t:'Val di Non e Val di Sole',meta:['45 min','mele · rafting · canyon'],
     d:'Frutteti a perdita d\u2019occhio, canyon del Rio Sass, rafting sul Noce e i castelli della Val di Non.',
     alt:'Val di Non',link:'https://www.visitvaldinon.it',lt:'visitvaldinon.it'},
    {id:'convenzioni',t:'Ristoranti e locali convenzionati',meta:['a Ravina e dintorni','partner de La Columbera'],
     d:'Pizzerie, caffè, birrerie e palestre: le realtà del territorio che consigliamo e con cui siamo convenzionati.',
     alt:'Alcuni dei nostri locali convenzionati',link:'convenzioni.html',lt:'Scopri le convenzioni',
     quad:['img/convenzioni/forst-biergarten.jpg','img/convenzioni/palestra-juta.jpg','img/convenzioni/pizzeria-da-mimmo.jpg','img/convenzioni/sun7-caffe.jpg']}
  ];

  // ---------- Convenzioni ----------
  // sito: pagina ufficiale del partner (da compilare quando disponibile). Finché è vuoto la scheda apre il locale su Google Maps.
  // Se il sito è compilato e il dominio è aggiunto a OG_HOSTS (variabile Vercel), la foto arriva da lì.
  // Foto propria: basta aggiungere il file in img/convenzioni/<id>.jpg, ha sempre la precedenza.
  var CONVENZIONI=[
    {id:'pizzeria-da-mimmo',nome:'Pizzeria Da Mimmo',cat:'Pizzeria · Cucina',zona:'Ravina',badge:'Convenzionata',sito:'',maps:'Pizzeria Ristorante Da Mimmo, Ravina, Trento',
     d:'La pizzeria del borgo, a due passi dalla dimora: impasto curato, forno a legna e piatti della tradizione.'},
    {id:'sun7-caffe',nome:'Sun7 Caffè',cat:'Caffè · Colazioni & aperitivi',zona:'Ravina',badge:'Convenzionato',sito:'',maps:'Sun7 Caffè, Ravina, Trento',
     d:'Il punto di riferimento per la colazione e l\u2019aperitivo: caffetteria, brioche e un dehor dove fermarsi con calma.'},
    {id:'forst-biergarten',nome:'La Torre · Biergarten Forst',cat:'Birreria · Giardino',zona:'Nei dintorni',badge:'Solo estate',estate:true,sito:'https://www.forst.it/it/locali/la-torre-biergarten-forst/',maps:'La Torre Biergarten Forst, Trento',
     d:'Il giardino estivo all\u2019aperto: birre Forst alla spina, piatti tirolesi e lunghe serate sotto gli alberi. Aperto nella bella stagione.'},
    {id:'bisto',nome:'Bistò',cat:'Bistrot · Cucina & drink',zona:'Nei dintorni',badge:'Convenzionato',sito:'',maps:'Bistò, Trento',
     d:'Bistrot moderno dove la cucina di stagione incontra una drink list curata: perfetto per una cena diversa dal solito.'},
    {id:'palestra-juta',nome:'Palestra Juta',cat:'Sport · Fitness',zona:'Nei dintorni',badge:'Convenzionata',sito:'https://www.palestra-trento-juta.it/palestra-a-ravina/',maps:'Palestra Juta, Trento',
     d:'Per chi non rinuncia all\u2019allenamento in vacanza: sala attrezzi e corsi a pochi minuti dalla struttura.'}
  ];

  // ---------- Cosa fare in Trentino, per stagione ----------
  var STAGIONI={
    primavera:[
      {t:'I meli in fiore della Val di Non',m:'45 min · aprile – maggio',alt:'Frutteti in fiore in Val di Non',
       d:'Una fioritura che tinge di bianco e rosa intere vallate: passeggiate facili tra i frutteti, magari in bici.',
       link:'https://www.visitvaldinon.it',lt:'visitvaldinon.it'},
      {t:'Trento e il Castello del Buonconsiglio',m:'10 min · tutto l\u2019anno',alt:'Castello del Buonconsiglio, Trento',
       d:'Il castello dei principi vescovi con la Torre dell\u2019Aquila, poi una passeggiata in Piazza Duomo.',
       link:'https://www.buonconsiglio.it',lt:'buonconsiglio.it'},
      {t:'Ciclabile della Valle dell\u2019Adige',m:'partenza a 5 min',alt:'Ciclabile in Trentino',
       d:'In primavera la ciclabile dà il meglio: vigneti, frutteti e borghi fino a Rovereto o verso il Garda.',
       link:VT+'guida/attivita-outdoor/ciclabili',lt:'Piste ciclabili del Trentino'}
    ],
    estate:[
      {t:'Monte Bondone e le Viotte',m:'20 min · giugno – settembre',alt:'Monte Bondone',
       d:'Le camminate sulle Tre Cime del Bondone e il Giardino Botanico Le Viotte, tra i più belli d\u2019Europa.',
       link:'https://www.visittrentino.info/it/trentino/aree-sciistiche/trento-e-monte-bondone_md_2236',lt:'visittrentino.info'},
      {t:'Lago di Toblino e Valle dei Laghi',m:'25 min',alt:'Castel Toblino sul lago',
       d:'Il castello sull\u2019acqua, una passeggiata lungolago e una sosta nelle cantine della valle.',
       link:VT+'guida/da-vedere/castelli/castel-toblino_md_2454',lt:'Scheda ufficiale'},
      {t:'Gli eventi dell\u2019estate a Trento',m:'sempre aggiornato',alt:'Eventi in Trentino',
       d:'Festival, concerti e appuntamenti estivi in città: qui sopra trovi gli eventi in programma, sempre aggiornati.',
       link:'#eventi',lt:'Vai agli eventi in programma',og:VT+'guida/cosa-fare/eventi'}
    ],
    autunno:[
      {t:'Vendemmia e Strada del Vino',m:'settembre – ottobre',alt:'Vigneti del Trentino in autunno',
       d:'Cantine aperte, Trentodoc e Teroldego: l\u2019autunno è la stagione giusta per conoscere i produttori della Valle dell\u2019Adige.',
       link:'https://www.tastetrentino.it/',lt:'Strade dei Vini e dei Sapori'},
      {t:'Foliage e castagnate',m:'ottobre – novembre',alt:'Trentino in autunno',
       d:'Boschi dorati sulle colline sopra Trento, castagne nei borghi e il fascino lento dell\u2019autunno trentino.',
       link:VT+'esperienze/speciale-autunno',lt:'Trentino in autunno'},
      {t:'I musei di Trento',m:'10 min',alt:'MUSE, Museo delle Scienze di Trento',
       d:'MUSE, Buonconsiglio e Gallerie: la cultura al caldo quando l\u2019aria si fa frizzante.',
       link:'https://www.muse.it',lt:'muse.it'}
    ],
    inverno:[
      {t:'Sci e ciaspole sul Monte Bondone',m:'20 min · dicembre – marzo',alt:'Piste da sci in Trentino',
       d:'Piste sopra Trento con vista sulla valle dell\u2019Adige, sci in notturna e ciaspolate nella neve.',
       link:'https://www.visittrentino.info/it/trentino/aree-sciistiche/trento-e-monte-bondone_md_2236',lt:'visittrentino.info'},
      {t:'I Mercatini di Natale di Trento',m:'10 min · fine novembre – 6 gennaio',alt:'Mercatino di Natale di Trento',
       d:'Tra i mercatini più amati d\u2019Italia: casette di legno, luci e profumi in Piazza Fiera e dintorni.',
       link:'https://natale.visittrento.it/mercatino',lt:'natale.visittrento.it',
       og:'https://natale.visittrento.it/wp-content/uploads/2024/10/natale-a-trento-mercatino-ph-marco.gober_.jpg'},
      {t:'Trento d\u2019inverno: musei e portici',m:'10 min',alt:'Trento in inverno',
       d:'Il centro storico d\u2019inverno ha un fascino speciale: musei, cioccolata calda e shopping sotto i portici.',
       link:'https://www.visittrento.it',lt:'visittrento.it'}
    ]
  };

  var ORDINE=['primavera','estate','autunno','inverno'];
  var LABEL={primavera:'Primavera',estate:'Estate',autunno:'Autunno',inverno:'Inverno'};
  var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
  var ext=function(l){return /^https?:/.test(l)};

  // Scheda cliccabile: <a> se c'è un link, altrimenti <article>. Gestisce il badge sulla foto (tag),
  // la riga di meta sotto il titolo (meta[]), una griglia di 4 foto al posto di una singola (quad[]),
  // e — quando serve un sito ufficiale come link principale ma anche un piccolo link separato alla
  // mappa (secondaryLink) — una scheda non cliccabile per intero ma con due link distinti al suo interno.
  function card(o){
    var link=o.link||'',isExt=ext(link);
    var og=o.noPhoto||o.quad?'':(o.og||(isExt?link:''));
    var hasImg=!!(o.local||og||o.quad);
    var fig=o.quad
      ? '<figure class="quad">'+o.quad.map(function(src){return '<img src="'+esc(src)+'" alt="'+esc(o.alt)+'" loading="lazy" decoding="async">'}).join('')+'</figure>'
      : '<figure'+(hasImg?'':' class="no-photo"')+'>'
        +(hasImg?'<img alt="'+esc(o.alt)+'" width="640" height="512" loading="lazy" decoding="async"'
          +(o.local?' data-local="'+esc(o.local)+'"':'')+(og?' data-og="'+esc(og)+'"':'')+'>':'')
        +(o.tag?'<span class="apt-tag'+(o.estate?' estate':'')+'">'+esc(o.tag)+'</span>':'')+'</figure>';
    var ctaMain=link?'<a class="cta-link stretched" href="'+esc(link)+'"'+(isExt?' target="_blank" rel="noopener noreferrer"':'')+'>'+esc(o.lt||'Scopri di più')+' <span aria-hidden="true">'+(isExt?'↗':'→')+'</span></a>':'';
    var ctaSub=o.secondaryLink?'<a class="cta-sub" href="'+esc(o.secondaryLink)+'" target="_blank" rel="noopener noreferrer">'+esc(o.secondaryLt||'Apri su Google Maps')+' ↗</a>':'';
    var body='<div class="body"><h3>'+esc(o.t)+'</h3>'
      +(o.meta&&o.meta.length?'<div class="meta">'+o.meta.map(function(x){return '<span>'+esc(x)+'</span>'}).join('')+'</div>':'')
      +'<p>'+esc(o.d)+'</p>'
      +(link||ctaSub?'<div class="cta">'+ctaMain+ctaSub+'</div>':'')
      +'</div>';
    var cls='apt-card'+(o.cls?' '+o.cls:'');
    if(o.secondaryLink&&link){
      // due link distinti: la scheda stessa non è un <a> (eviterebbe link annidati), ma il link
      // principale copre comunque l'intera scheda grazie a .stretched, mentre quello piccolo resta sopra.
      return '<div class="'+cls+' card-link" data-testid="'+esc(o.tid)+'"'+(o.style||'')+'>'+fig+body+'</div>';
    }
    if(!link)return '<article class="'+cls+'" data-testid="'+esc(o.tid)+'"'+(o.style||'')+'>'+fig+body+'</article>';
    return '<a class="'+cls+'" href="'+esc(link)+'"'+(isExt?' target="_blank" rel="noopener noreferrer"':'')
      +' aria-label="'+esc(o.t)+(isExt?' (si apre in una nuova scheda)':'')+'" data-testid="'+esc(o.tid)+'"'+(o.style||'')+'>'+fig+body+'</a>';
  }
  var photos=function(){if(window.lcPhotos)window.lcPhotos()};

  // --- Luoghi di interesse ---
  var lg=document.getElementById('luoghi-grid');
  if(lg){
    lg.innerHTML=LUOGHI.map(function(p){
      return card({tid:'d-'+p.id,t:p.t,meta:p.meta,d:p.d,alt:p.alt,link:p.link,lt:p.lt,local:p.local,noPhoto:p.noPhoto,quad:p.quad});
    }).join('');
  }

  // --- Convenzioni ---
  var cg=document.getElementById('conv-grid');
  if(cg){
    cg.innerHTML=CONVENZIONI.map(function(p){
      var maps='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.maps);
      var site=p.sito?p.sito:'';
      return card({tid:'partner-card-'+p.id,t:p.nome,meta:[p.cat,p.zona],d:p.d,alt:p.nome,tag:p.badge,estate:p.estate,
        local:'img/convenzioni/'+p.id+'.jpg',
        link:site||maps,lt:site?'Sito ufficiale':'Apri su Google Maps',og:site||'',
        secondaryLink:site?maps:'',secondaryLt:'Mappa'});
    }).join('');
  }

  // --- Cosa fare in Trentino: tab stagionali ---
  var tabs=document.getElementById('season-tabs');
  var grid=document.getElementById('season-grid');
  if(tabs&&grid){
    var m=new Date().getMonth();
    var cur=(m>=2&&m<=4)?'primavera':(m>=5&&m<=7)?'estate':(m>=8&&m<=10)?'autunno':'inverno';
    tabs.innerHTML=ORDINE.map(function(s){
      return '<button type="button" class="season-tab" data-season="'+s+'" data-testid="season-tab-'+s+'" aria-pressed="false">'+LABEL[s]+'</button>';
    }).join('');
    var render=function(s){
      grid.innerHTML=STAGIONI[s].map(function(a,i){
        return card({tid:'attraction-card-'+s+'-'+(i+1),t:a.t,d:a.d,alt:a.alt,link:a.link,lt:a.lt,og:a.og,tag:a.m,
          cls:'season-pop',style:' style="animation-delay:'+(i*90)+'ms"'});
      }).join('');
      tabs.querySelectorAll('.season-tab').forEach(function(b){
        var on=b.dataset.season===s;
        b.classList.toggle('active',on);
        b.setAttribute('aria-pressed',on?'true':'false');
      });
      photos();
    };
    tabs.addEventListener('click',function(e){
      var b=e.target.closest('.season-tab');
      if(b)render(b.dataset.season);
    });
    render(cur);
  }
  photos();
})();
