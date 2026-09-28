// La Columbera · Dintorni: convenzioni + "Cosa fare in Trentino" per stagione.
// Dati statici: per aggiornare testi, partner o link ufficiali basta modificare questo file.
(function(){
  const U='?crop=entropy&cs=srgb&fm=jpg&q=85';
  const IMG={
    mimmo:'https://images.unsplash.com/photo-1513104890138-7c749659a591'+U,
    sun7:'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb'+U,
    forst:'https://images.unsplash.com/photo-1654682940468-ca6c08a1a4c2'+U,
    bisto:'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c'+U,
    juta:'https://images.unsplash.com/photo-1790094180788-66f4719e0af1'+U,
    primavera:'https://images.unsplash.com/photo-1522383225653-ed111181a951'+U,
    trento:'https://images.unsplash.com/photo-1723886783242-45ded821cf59'+U,
    bondoneE:'https://images.unsplash.com/photo-1606311554186-a1ee73714e1a'+U,
    laghi:'https://images.unsplash.com/photo-1712679408447-3245b6bc7c16'+U,
    vendemmia:'https://images.unsplash.com/photo-1667743537770-2b4691bfe7a3'+U,
    foliage:'https://images.unsplash.com/photo-1699002603467-0f0273f91b1f'+U,
    bondoneI:'https://images.unsplash.com/photo-1615201427688-24a604af15d6'+U,
    mercatini:'https://images.unsplash.com/photo-1543589077-47d81606c1bf'+U
  };

  const CONVENZIONI=[
    {id:'pizzeria-da-mimmo',nome:'Pizzeria Da Mimmo',cat:'Pizzeria · Cucina',zona:'Ravina',img:IMG.mimmo,alt:'Pizza appena sfornata',badge:'Convenzionata',
     d:'La pizzeria del borgo, a due passi dalla dimora: impasto curato, forno a legna e piatti della tradizione.'},
    {id:'sun7-caffe',nome:'Sun7 Caffè',cat:'Caffè · Colazioni & aperitivi',zona:'Ravina',img:IMG.sun7,alt:'Cappuccino e brioche al banco di un caffè',badge:'Convenzionato',
     d:'Il punto di riferimento per la colazione e l\u2019aperitivo: caffetteria, brioche e un dehor dove fermarsi con calma.'},
    {id:'forst-biergarten',nome:'Forst Biergarten',cat:'Birreria · Giardino',zona:'Nei dintorni',img:IMG.forst,alt:'Tavoli all\u2019aperto di un biergarten sotto gli alberi',badge:'Solo estate',estate:true,
     d:'Il giardino estivo all\u2019aperto: birre Forst alla spina, piatti tirolesi e lunghe serate sotto gli alberi. Aperto nella bella stagione.'},
    {id:'bisto',nome:'Bistò',cat:'Bistrot · Cucina & drink',zona:'Nei dintorni',img:IMG.bisto,alt:'Piatto curato in un bistrot moderno',badge:'Convenzionato',
     d:'Bistrot moderno dove la cucina di stagione incontra una drink list curata: perfetto per una cena diversa dal solito.'},
    {id:'palestra-juta',nome:'Palestra Juta',cat:'Sport · Fitness',zona:'Nei dintorni',img:IMG.juta,alt:'Sala attrezzi di una palestra moderna',badge:'Convenzionata',
     d:'Per chi non rinuncia all\u2019allenamento in vacanza: sala attrezzi e corsi a pochi minuti dalla struttura.'}
  ];

  const STAGIONI={
    primavera:[
      {t:'I meli in fiore della Val di Non',m:'45 min · aprile – maggio',img:IMG.primavera,alt:'Rami di melo in fiore',
       d:'Una fioritura che tinge di bianco e rosa intere vallate: passeggiate facili tra i frutteti, magari in bici.',
       link:'https://www.visittrentino.info',lt:'visittrentino.info'},
      {t:'Trento e il Castello del Buonconsiglio',m:'10 min · tutto l\u2019anno',img:IMG.trento,alt:'Centro storico di Trento',
       d:'Il castello dei principi vescovi con la Torre dell\u2019Aquila, poi una passeggiata in Piazza Duomo.',
       link:'https://www.buonconsiglio.it',lt:'buonconsiglio.it'},
      {t:'Ciclabile della Valle dell\u2019Adige',m:'partenza a 5 min',img:IMG.laghi,alt:'Paesaggio della Valle dell\u2019Adige',
       d:'In primavera la ciclabile dà il meglio: vigneti, frutteti e borghi fino a Rovereto o verso il Garda.',
       link:'https://www.visittrentino.info',lt:'visittrentino.info'}
    ],
    estate:[
      {t:'Monte Bondone e le Viotte',m:'20 min · giugno – settembre',img:IMG.bondoneE,alt:'Prati fioriti sul Monte Bondone',
       d:'Le camminate sulle Tre Cime del Bondone e il Giardino Botanico Le Viotte, tra i più belli d\u2019Europa.',
       link:'https://www.montebondone.it',lt:'montebondone.it'},
      {t:'Lago di Toblino e Valle dei Laghi',m:'25 min',img:IMG.laghi,alt:'Lago tra le montagne',
       d:'Il castello sull\u2019acqua, una passeggiata lungolago e una sosta nelle cantine della valle.',
       link:'https://www.gardatrentino.it',lt:'gardatrentino.it'},
      {t:'Gli eventi dell\u2019estate a Trento',m:'sempre aggiornato',img:IMG.trento,alt:'Trento in una sera d\u2019estate',
       d:'Festival, concerti e appuntamenti estivi in città: il nostro calendario eventi è sempre aggiornato.',
       link:'eventi.html',lt:'Vai agli eventi'}
    ],
    autunno:[
      {t:'Vendemmia e Strada del Vino',m:'settembre – ottobre',img:IMG.vendemmia,alt:'Vigneti dorati in autunno',
       d:'Cantine aperte, Trentodoc e Teroldego: l\u2019autunno è la stagione giusta per conoscere i produttori della Valle dell\u2019Adige.',
       link:'https://www.visittrentino.info',lt:'visittrentino.info'},
      {t:'Foliage e castagnate',m:'ottobre – novembre',img:IMG.foliage,alt:'Boschi in autunno',
       d:'Boschi dorati sulle colline sopra Trento, castagne nei borghi e il fascino lento dell\u2019autunno trentino.',
       link:'https://www.visittrentino.info',lt:'visittrentino.info'},
      {t:'I musei di Trento',m:'10 min',img:IMG.trento,alt:'Trento, palazzi storici',
       d:'MUSE, Buonconsiglio e Gallerie: la cultura al caldo quando l\u2019aria si fa frizzante.',
       link:'https://www.muse.it',lt:'muse.it'}
    ],
    inverno:[
      {t:'Sci e ciaspole sul Monte Bondone',m:'20 min · dicembre – marzo',img:IMG.bondoneI,alt:'Piste da sci innevate',
       d:'Piste sopra Trento con vista sulla valle dell\u2019Adige, sci in notturna e ciaspolate nella neve.',
       link:'https://www.montebondone.it',lt:'montebondone.it'},
      {t:'I Mercatini di Natale di Trento',m:'10 min · fine novembre – dicembre',img:IMG.mercatini,alt:'Luci e casette dei mercatini di Natale',
       d:'Tra i mercatini più amati d\u2019Italia: casette di legno, luci e profumi in Piazza Fiera e dintorni.',
       link:'https://www.visittrentino.info',lt:'visittrentino.info'},
      {t:'Trento sotto la neve',m:'10 min',img:IMG.trento,alt:'Centro storico di Trento d\u2019inverno',
       d:'Il centro storico d\u2019inverno ha un fascino speciale: musei, cioccolata calda e shopping sotto i portici.',
       link:'https://www.visittrentino.info',lt:'visittrentino.info'}
    ]
  };

  const ORDINE=['primavera','estate','autunno','inverno'];
  const LABEL={primavera:'Primavera',estate:'Estate',autunno:'Autunno',inverno:'Inverno'};
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ext=l=>/^https?:/.test(l);

  // --- Convenzioni ---
  const cg=document.getElementById('conv-grid');
  if(cg){
    cg.innerHTML=CONVENZIONI.map(p=>
      '<article class="apt-card" data-testid="partner-card-'+p.id+'" data-reveal>'
      +'<figure><img src="'+p.img+'" alt="'+esc(p.alt)+'" loading="lazy">'
      +'<span class="apt-tag'+(p.estate?' estate':'')+'">'+esc(p.badge)+'</span></figure>'
      +'<div class="body"><h3>'+esc(p.nome)+'</h3>'
      +'<div class="meta"><span>'+esc(p.cat)+'</span><span>'+esc(p.zona)+'</span></div>'
      +'<p>'+esc(p.d)+'</p></div></article>'
    ).join('');
  }

  // --- Cosa fare in Trentino: tab stagionali ---
  const tabs=document.getElementById('season-tabs');
  const grid=document.getElementById('season-grid');
  if(tabs&&grid){
    const m=new Date().getMonth();
    const cur=(m>=2&&m<=4)?'primavera':(m>=5&&m<=7)?'estate':(m>=8&&m<=10)?'autunno':'inverno';
    tabs.innerHTML=ORDINE.map(s=>
      '<button type="button" class="season-tab" data-season="'+s+'" data-testid="season-tab-'+s+'" aria-pressed="false">'+LABEL[s]+'</button>'
    ).join('');
    const render=s=>{
      grid.innerHTML=STAGIONI[s].map((a,i)=>
        '<article class="apt-card season-pop" style="animation-delay:'+(i*90)+'ms" data-testid="attraction-card-'+s+'-'+(i+1)+'">'
        +'<figure><img src="'+a.img+'" alt="'+esc(a.alt)+'" loading="lazy"><span class="apt-tag">'+esc(a.m)+'</span></figure>'
        +'<div class="body"><h3>'+esc(a.t)+'</h3><p>'+esc(a.d)+'</p>'
        +'<div class="cta"><a class="cta-link" href="'+a.link+'"'
        +(ext(a.link)?' target="_blank" rel="noopener noreferrer"':'')
        +' data-testid="attraction-link-'+s+'-'+(i+1)+'">'+esc(a.lt)+' <span aria-hidden="true">'+(ext(a.link)?'↗':'→')+'</span></a></div>'
        +'</div></article>'
      ).join('');
      tabs.querySelectorAll('.season-tab').forEach(b=>{
        const on=b.dataset.season===s;
        b.classList.toggle('active',on);
        b.setAttribute('aria-pressed',on?'true':'false');
      });
    };
    tabs.addEventListener('click',e=>{
      const b=e.target.closest('.season-tab');
      if(b) render(b.dataset.season);
    });
    render(cur);
  }
})();
