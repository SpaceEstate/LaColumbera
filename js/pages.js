// La Columbera · pagine appartamento, guest card, eventi (l'area clienti è in js/area.js)
const $=s=>document.querySelector(s),B=document.body.dataset;
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const eur=n=>'€'+Math.round(n);
const api=(a,b,t)=>fetch('api/x?a='+a,{method:'POST',headers:{'Content-Type':'application/json',Authorization:t||''},body:JSON.stringify(b||{})}).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok){const e=Error(j.err||'Servizio non disponibile');e.status=r.status;e.code=j.code||'';throw e}return j});
const get=q=>fetch('api/x?'+q).then(r=>r.ok?r.json():null).catch(()=>null);
const iso=d=>d.toISOString().slice(0,10);
const days=(da,a)=>{const o=[];for(let d=new Date(da);d<new Date(a);d.setUTCDate(d.getUTCDate()+1))o.push(iso(d));return o};
const np=(p,d)=>{if(p.prices&&p.prices[d]!=null)return +p.prices[d];const x=(p.periodi||[]).find(q=>d>=q.da&&d<=q.a);return+(x?x.prezzo:p.base)};
const sup=(p,n)=>{const k=Math.max(0,n-(p.inclusi||1)),st=(p.extraSteps&&p.extraSteps.length)?p.extraSteps:[+p.extra||0];let s=0;for(let i=0;i<k;i++)s+=+st[Math.min(i,st.length-1)]||0;return s};
const minFor=(p,da)=>{const r=(p.minPeriodi||[]).find(q=>q.da&&q.a&&da>=q.da&&da<=q.a);return+(r?r.min:p.min)||1};
const tot=(p,da,a,n)=>days(da,a).reduce((s,d)=>s+np(p,d)+sup(p,n),0);
const fmtD=s=>new Date(s+'T00:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'});
const fmtW=s=>new Date(s+'T00:00:00').toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short'});
const fmtL=s=>new Date(s+'T00:00:00').toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const money=n=>'€'+Math.round(n).toLocaleString('it-IT');
const pad=n=>String(n).padStart(2,'0');
// Testo semplice per le sezioni scritte da Gestione: "## Titolo" apre una sezione, le righe vuote separano i paragrafi, "- voce" fa un elenco
const mdLite=t=>{const out=[];let cur=null;
  for(const raw of String(t||'').replace(/\r/g,'').split('\n')){const l=raw.trim();
    if(!l){cur=null;continue}
    if(l.startsWith('## ')){out.push({h:l.slice(3).trim()});cur=null;continue}
    if(l.startsWith('- ')){if(!cur||!cur.li){cur={li:[]};out.push(cur)}cur.li.push(l.slice(2).trim());continue}
    if(!cur||cur.p===undefined){cur={p:l};out.push(cur)}else cur.p+='\n'+l}
  return out};
// elenco servizi: gruppi (titolo + voci)
const srvGroups=t=>{const g=[];let cur=null;
  for(const b of mdLite(t)){if(b.h){cur={t:b.h,v:[]};g.push(cur)}else if(b.li){if(!cur){cur={t:'',v:[]};g.push(cur)}cur.v.push(...b.li)}}
  return g.filter(x=>x.v.length)};
// Finestra sopra la pagina (servizi): chiude con X, Esc o clic fuori; il focus resta dentro finché è aperta e torna al pulsante che l'ha aperta
function modal(title,html,trigger){
  const m=document.createElement('div');m.className='modal';m.dataset.testid='modal';
  m.innerHTML=`<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="md-t"><div class="modal-head"><h2 id="md-t">${esc(title)}</h2><button type="button" class="modal-x" aria-label="Chiudi" data-testid="modal-close">×</button></div><div class="modal-body">${html}</div></div>`;
  const box=m.firstElementChild;
  const close=()=>{document.removeEventListener('keydown',key);m.remove();document.body.classList.remove('modal-open');if(trigger&&trigger.focus)trigger.focus()};
  const key=e=>{
    if(e.key==='Escape'){e.preventDefault();close();return}
    if(e.key!=='Tab')return;
    const f=[...box.querySelectorAll('button,a[href]')];if(!f.length)return;
    const a=f[0],z=f[f.length-1];
    if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}
    else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}};
  m.addEventListener('click',e=>{if(e.target===m||e.target.closest('.modal-x'))close()});
  document.addEventListener('keydown',key);
  document.body.appendChild(m);document.body.classList.add('modal-open');box.querySelector('.modal-x').focus();
  return close}
// Foto a tutto schermo (galleria dell'appartamento): sfondo sfocato, frecce, scorrimento col dito (avanti, indietro; verso il basso chiude),
// tastiera (← → Esc), contatore. Chiude con ×, Esc o tocco fuori dalla foto; il focus resta dentro finché è aperta e poi torna dov'era.
// Alla chiusura onClose(i) riceve la foto vista per ultima (la galleria della pagina si sposta lì).
function lightbox(foto,start,nome,trigger,onClose){
  const N=foto.length;let i=start;
  const m=document.createElement('div');m.className='lb';m.dataset.testid='lightbox';
  m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.setAttribute('aria-label','Foto di '+nome);m.tabIndex=-1;
  m.innerHTML=`<div class="lb-bg" aria-hidden="true"></div><figure class="lb-fig"><img class="lb-img" alt="" draggable="false" data-testid="lightbox-img"></figure>
   <button type="button" class="lb-x" aria-label="Chiudi" data-testid="lightbox-close">×</button>${N>1?`<button type="button" class="lb-nav prev" aria-label="Foto precedente" data-testid="lightbox-prev">‹</button><button type="button" class="lb-nav next" aria-label="Foto successiva" data-testid="lightbox-next">›</button>`:''}
   <span class="lb-count" aria-live="polite" data-testid="lightbox-count"></span>`;
  const im=m.querySelector('.lb-img'),bg=m.querySelector('.lb-bg');
  const show=k=>{i=(k+N)%N;im.src=foto[i];im.alt=nome+' — foto '+(i+1)+' di '+N;bg.style.backgroundImage='url("'+String(foto[i]).replace(/["\\]/g,'')+'")';m.querySelector('.lb-count').textContent=(i+1)+' / '+N;
    if(N>1)[i+1,i-1].forEach(k=>{new Image().src=foto[(k+N)%N]})};
  const close=()=>{document.removeEventListener('keydown',key);m.remove();document.body.classList.remove('modal-open');if(onClose)onClose(i);if(trigger&&trigger.focus)trigger.focus({preventScroll:true})};
  const key=e=>{
    if(e.key==='Escape'){e.preventDefault();close();return}
    if(N>1&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){e.preventDefault();show(i+(e.key==='ArrowRight'?1:-1));return}
    if(e.key!=='Tab')return;
    const f=[...m.querySelectorAll('button')],a=f[0],z=f[f.length-1],x=document.activeElement;
    if(e.shiftKey&&(x===a||x===m)){e.preventDefault();z.focus()}
    else if(!e.shiftKey&&x===z){e.preventDefault();a.focus()}};
  let sx=0,sy=0,dx=0,dy=0,dito=false,mosso=false;
  m.addEventListener('click',e=>{
    if(e.target.closest('.lb-x'))return close();
    if(e.target.closest('.lb-nav'))return show(i+(e.target.closest('.next')?1:-1));
    if(mosso){mosso=false;return}      // il clic che alcuni telefoni mandano dopo uno scorrimento non chiude la foto
    if(!e.target.closest('.lb-img'))close()});
  m.addEventListener('touchstart',e=>{if(e.touches.length!==1){dito=false;return}dito=true;mosso=false;sx=e.touches[0].clientX;sy=e.touches[0].clientY;dx=dy=0;im.style.transition='none'},{passive:true});
  m.addEventListener('touchmove',e=>{if(!dito)return;dx=e.touches[0].clientX-sx;dy=e.touches[0].clientY-sy;if(Math.abs(dx)>10||Math.abs(dy)>10)mosso=true;
    im.style.transform=Math.abs(dx)>Math.abs(dy)?`translateX(${dx}px)`:dy>0?`translateY(${dy}px)`:''},{passive:true});
  m.addEventListener('touchend',()=>{if(!dito)return;dito=false;im.style.transition='transform .25s ease';im.style.transform='';
    if(Math.abs(dx)>Math.abs(dy)){if(N>1&&Math.abs(dx)>50)show(i+(dx<0?1:-1))}else if(dy>90)close();
    setTimeout(()=>{mosso=false},400)});
  document.addEventListener('keydown',key);
  // il focus va sulla finestra (non sulla X, che al tocco resterebbe evidenziata): Tab porta ai pulsanti
  document.body.appendChild(m);document.body.classList.add('modal-open');show(start);m.focus({preventScroll:true});
  return close}
// Regola di annullamento (api/_annulla.js), da leggere prima di pagare: gratis dall'area clienti fino a 7 giorni prima dell'arrivo (ora di Roma),
// con il rimborso totale; chi prenota a meno di 7 giorni dall'arrivo non è rimborsabile. Decide il server: qui la si mostra soltanto.
const oggiRoma=()=>{try{const o={};for(const x of new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()))o[x.type]=x.value;return o.year+'-'+o.month+'-'+o.day}catch{return iso(new Date())}};
const annullo=da=>{const d=new Date(da+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-7);const ug=iso(d);
  return oggiRoma()<=ug?'Annullamento gratuito fino a '+fmtL(ug)+', con il rimborso totale dall’area clienti.':'Non rimborsabile: l’arrivo è tra meno di 7 giorni.'};
// Accesso alla prenotazione (api/_accesso.js): basta il codice di prenotazione; il server risponde con un token di sessione.
// Il link della mail porta un token segreto ("#c=…&t=…"), i messaggi mandati da Booking/Airbnb il solo codice ("#k=…"): il frammento "#"
// non va mai al server né ad altri siti, e viene tolto subito dall'indirizzo. Codice e token restano solo in sessionStorage (si cancella chiudendo la scheda).
const ACC_KEY='lc_acc';
const accGet=()=>{try{const v=JSON.parse(sessionStorage.getItem(ACC_KEY)||'null');return v&&v.c&&v.t?v:null}catch{return null}};
const accSet=(c,t)=>{try{if(c&&t)sessionStorage.setItem(ACC_KEY,JSON.stringify({c:String(c).toUpperCase(),t}))}catch{}};
const accDel=()=>{try{sessionStorage.removeItem(ACC_KEY)}catch{}};
try{sessionStorage.removeItem('lc_code')}catch{}      // chiave della versione precedente: non serve più
// dal frammento: {c,t} (link della mail) oppure {k} (solo il codice, dal messaggio di benvenuto)
// s = scheda da aprire (es. «messaggi» dal pulsante Rispondi dell'email di un messaggio)
const accFromHash=()=>{const h=new URLSearchParams(location.hash.slice(1)),c=(h.get('c')||'').trim().toUpperCase(),t=(h.get('t')||'').trim(),k=(h.get('k')||'').trim(),s=(h.get('s')||'').trim();
  if(location.hash)history.replaceState(null,'',location.pathname+location.search);
  if(c&&t){accSet(c,t);return{c,t,s}}return k?{k,s}:null};
// credenziali da mandare al server: il token se c'è per QUEL codice, altrimenti il codice da solo
const accBody=code=>{const s=accGet();return s&&s.c===code?{code,t:s.t}:{code}};
// codice del sito (13 caratteri) a gruppi per leggerlo: "558R TE56 487A9"; gli altri restano come sono
const fmtCode=c=>{c=String(c||'');return /^[0-9A-Z]{13}$/.test(c)?c.slice(0,4)+' '+c.slice(4,8)+' '+c.slice(8):c};
// il codice come lo digita l'ospite: maiuscolo e senza spazi (punti e trattini li gestisce il server: alcuni codici del foglio hanno un trattino)
const codeIn=v=>String(v||'').toUpperCase().replace(/\s+/g,'');
const short=p=>p.nome.replace('La Columbera ','');
const nomeA=(c,id)=>esc(short(c.apts.find(p=>p.id===id)||{nome:id}));

const RE_D=/^\d{4}-\d\d-\d\d$/;
// ospiti scelti: adulti (pagano) e bambini sotto i 4 anni (gratis). «2 adulti», «2 adulti · 1 bambino»
const chiTxt=(n,k)=>n+(+n===1?' adulto':' adulti')+(k?' · '+k+(+k===1?' bambino':' bambini'):'');
const MAIL_LC='<a href="mailto:lacolumbera@gmail.com">lacolumbera@gmail.com</a>';
// disponibilità non verificabile (il server risponde 503): mai un calendario «libero» a caso, si invita a scrivere o chiamare
const offline=`<div class="offline-note" data-testid="booking-offline"><h3>Disponibilità e prenotazioni</h3><p>In questo momento non riesco a verificare la disponibilità del calendario. Per prenotare scrivici a ${MAIL_LC} o chiamaci al <a href="tel:+393517043594">+39 351 704 3594</a>.</p></div>`;
// Esito del pagamento: al ritorno da Stripe o subito dopo il pagamento nella pagina di prenotazione. La conferma arriva di norma dal webhook di Stripe
// pochi secondi dopo il pagamento: qui si chiede lo stato al server (che, se il webhook ritarda, controlla direttamente su Stripe) e si dice all'ospite
// com'è davvero: confermata, in verifica oppure ancora in registrazione. Con o.riprova (pagina di prenotazione) un pagamento che su Stripe è ancora
// aperto (la banca non l'ha confermato) si può ripetere; o.cls = classe in più per il riquadro.
async function esito(box,cc,o={}){
  const s=accGet(),tk=s&&s.c===cc?s.t:'',
    view=(st,em)=>{
      if(st==='confermata')return`<h3>Prenotazione confermata 🎉</h3><p>Il tuo codice è <b class="code-g">${esc(fmtCode(cc))}</b>. Ti abbiamo scritto una email di conferma${em?` a <b>${esc(em)}</b>`:''} (controlla anche lo spam), con il link alla tua <a href="area-clienti.html">area clienti</a>, dove fai il check-in online e crei la tua Trentino Guest Card. Con il codice entri nell'area clienti anche senza la email.</p>`;
      if(st==='da_verificare'||st==='annullata')return`<h3>Pagamento ricevuto</h3><p>Il tuo codice è <b class="code-g">${esc(fmtCode(cc))}</b>. Stiamo verificando la tua prenotazione e ti scriviamo al più presto. Per qualsiasi dubbio scrivici a ${MAIL_LC} indicando il codice.</p>`;
      if(st==='aperta')return`<h3>Pagamento non completato</h3><p>La banca non ha confermato il pagamento: non ti è stato addebitato nulla. Puoi riprovare, anche con un'altra carta.</p><button type="button" class="btn btn-wine" data-act="riprova" data-testid="booking-retry">Riprova il pagamento</button>`;
      return`<h3>Grazie, stiamo registrando la prenotazione</h3><p>Il tuo codice è <b class="code-g">${esc(fmtCode(cc))}</b>. Riceverai a breve una email di conferma con il link alla tua <a href="area-clienti.html">area clienti</a>. Se entro qualche minuto non la vedi (controlla anche lo spam), scrivici a ${MAIL_LC} indicando il codice.</p>`};
  const paint=(st,em)=>{box.innerHTML=`<div class="form-ok${o.cls?' '+o.cls:''}" data-testid="booking-success" data-stato="${esc(st||'')}">${view(st,em)}</div>`;
    const b=box.querySelector('[data-act=riprova]');if(b)b.onclick=o.riprova};
  paint('');
  let aperta=0;
  if(cc&&tk)for(let i=0;i<6;i++){      // fino a ~15 s: di solito la conferma c'è al primo o al secondo controllo
    if(i)await new Promise(r=>setTimeout(r,3000));
    let r;try{r=await api('checkout_status',{code:cc,t:tk})}catch(e){break}
    if(r.stato&&r.stato!=='in_attesa'){paint(r.stato,r.email);break}
    if(o.riprova&&r.aperta&&++aperta>=2){paint('aperta');break}      // due controlli di fila: non è un attimo di ritardo di Stripe
  }
}

async function apt(c){
  const p=c.apts.find(x=>x.id===B.id);if(!p)return;
  p.prices=p.prices||{};p.periodi=p.periodi||[];
  const other=c.apts.find(x=>x.id!==B.id);
  document.title=p.nome+' · La Columbera';
  $('#ph-img').src=p.foto[0]||'';
  $('#apt-nome').textContent=short(p);
  $('#apt-sotto').textContent=p.sotto;
  $('#note').textContent=`Soggiorno minimo ${p.min} notti${(p.minPeriodi||[]).length?' (in alcuni periodi di più)':''} · fino a ${p.max} ospiti`;
  $('#desc').textContent=p.testo;
  $('#chips').innerHTML=[`fino a ${p.max} ospiti`,p.id==='torre'?'due livelli':'piano terra',`minimo ${p.min} notti`,'check-in autonomo'].map(x=>`<span>${esc(x)}</span>`).join('');
  // CIN e CIPAT: obbligatori negli annunci. Si impostano da Gestione (il CIPAT può arrivare dalla struttura); senza valore la riga non compare.
  const cd=window.lcCodici?window.lcCodici(p,c.cipat):'';
  if(cd){$('#codes').innerHTML=cd;$('#codes').hidden=false}
  // testo di approfondimento (Gestione → Sito → Appartamenti → Testi)
  const more=mdLite(p.dettagli);
  if(more.length){$('#more').innerHTML=more.map(b=>b.h?`<h2>${esc(b.h)}</h2>`:b.p!==undefined?`<p>${esc(b.p)}</p>`:`<ul>${b.li.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`).join('');$('#more').hidden=false}
  // servizi: i primi in evidenza, tutti in una finestra
  const sg=srvGroups(p.servizi),sAll=sg.flatMap(g=>g.v);
  if(sAll.length){
    $('#srv-top').innerHTML=sAll.slice(0,8).map(x=>`<li>${esc(x)}</li>`).join('');
    $('#srv-open').textContent=`Mostra tutti i servizi (${sAll.length})`;
    $('#srv').hidden=false;
    $('#srv-open').onclick=e=>modal('Servizi · '+short(p),sg.map(g=>`<div class="srv-group">${g.t?`<h3>${esc(g.t)}</h3>`:''}<ul class="srv-list">${g.v.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`).join(''),e.currentTarget)}
  if(other){
    $('#other-title').textContent=short(other);
    $('#other-name').textContent=short(other);
    $('#other-sub').textContent=other.sotto+'. Nella stessa dimora, con spazi diversi: scegli quello più adatto a te.';
    $('#other-link').href=other.id+'.html';
  }

  // Galleria: freccia avanti/indietro + strip di anteprime (solo alcune, scorrevoli)
  let cur=0;const N=p.foto.length;
  const gm=$('#gm'),gmWrap=gm.parentElement,th=$('#th');
  gmWrap.insertAdjacentHTML('beforeend',
    `<button type="button" class="g-arrow prev" id="g-prev" aria-label="Foto precedente" data-testid="gallery-prev">‹</button>
     <button type="button" class="g-arrow next" id="g-next" aria-label="Foto successiva" data-testid="gallery-next">›</button>
     <span class="g-counter" id="g-count" data-testid="gallery-counter"></span>`);
  // miniature (360 px) in img/<appartamento>/t/ con lo stesso nome del file: l'anteprima pesa ~15 KB invece di ~250 KB. Per le foto caricate
  // da Gestione (indirizzi esterni) o se la miniatura manca si usa la foto intera.
  const thumb=u=>/^img\//.test(u)?u.replace(/\/([^\/]+)$/,'/t/$1'):u;
  th.innerHTML=p.foto.map((u,i)=>`<button type="button" data-i="${i}" aria-label="Foto ${i+1} di ${N}" data-testid="gallery-thumb-${i}"><img src="${esc(thumb(u))}" data-full="${esc(u)}" alt="" width="100" height="75" loading="lazy" decoding="async"></button>`).join('');
  th.querySelectorAll('img').forEach(im=>im.addEventListener('error',()=>{im.src=im.dataset.full},{once:true}));
  const goTo=i=>{cur=(i+N)%N;gm.src=p.foto[cur];[cur+1,cur-1].forEach(k=>{if(N>1)new Image().src=p.foto[(k+N)%N]});$('#g-count').textContent=`${cur+1} / ${N}`;
    th.querySelectorAll('button').forEach((b,j)=>b.classList.toggle('on',j===cur));
    // l'anteprima attiva va al centro della striscia muovendo SOLO la striscia (scroll-behavior:smooth nel CSS): scrollIntoView spostava anche la pagina
    // e, all'apertura con il link torre.html#prenota / corte.html#prenota (dalla home), su telefono riportava dalla prenotazione alla galleria
    const act=th.querySelector(`[data-i="${cur}"]`);if(act){const a=act.getBoundingClientRect(),s=th.getBoundingClientRect();th.scrollLeft+=a.left+a.width/2-(s.left+s.width/2)}};
  goTo(0);
  if(N<2){$('#g-prev').style.display=$('#g-next').style.display='none';th.style.display='none'}
  $('#g-prev').onclick=()=>goTo(cur-1);
  $('#g-next').onclick=()=>goTo(cur+1);
  th.onclick=e=>{const b=e.target.closest('button');if(b)goTo(+b.dataset.i)};
  // tocco o clic sulla foto grande (o sul pulsante ⤢): la foto a tutto schermo; trascinare la foto per cambiarla non la apre
  let trascinata=0;
  gmWrap.insertAdjacentHTML('beforeend','<button type="button" class="g-zoom" aria-label="Ingrandisci la foto" data-testid="gallery-zoom">⤢</button>');
  const ingrandisci=t=>{if(Date.now()-trascinata<500)return;lightbox(p.foto,cur,short(p),t,k=>goTo(k))};
  gm.addEventListener('click',()=>ingrandisci(gmWrap.querySelector('.g-zoom')));
  gmWrap.querySelector('.g-zoom').onclick=e=>ingrandisci(e.currentTarget);
  document.addEventListener('keydown',e=>{if(document.body.classList.contains('modal-open'))return;if(e.key==='ArrowRight')goTo(cur+1);if(e.key==='ArrowLeft')goTo(cur-1)});

  // Swipe col dito sulla foto grande (mobile): trascina a sinistra = avanti, a destra = indietro
  if(N>1){
    let sx=0,sy=0,dx=0,drag=false,lock=null;
    const reset=()=>{gm.style.transition='transform .25s ease';gm.style.transform=''};
    gmWrap.addEventListener('touchstart',e=>{
      if(e.touches.length!==1){drag=false;return}
      sx=e.touches[0].clientX;sy=e.touches[0].clientY;dx=0;drag=true;lock=null;gm.style.transition='none';
    },{passive:true});
    gmWrap.addEventListener('touchmove',e=>{
      if(!drag)return;
      const x=e.touches[0].clientX-sx,y=e.touches[0].clientY-sy;
      if(lock===null&&(Math.abs(x)>8||Math.abs(y)>8))lock=Math.abs(x)>Math.abs(y)?'x':'y';
      if(lock!=='x')return;
      dx=x;gm.style.transform=`translateX(${dx}px)`;
    },{passive:true});
    gmWrap.addEventListener('touchend',()=>{
      if(!drag)return;drag=false;if(lock==='x')trascinata=Date.now();
      if(lock==='x'&&Math.abs(dx)>50){
        const dir=dx<0?1:-1;
        goTo(cur+dir);
        gm.style.transition='none';gm.style.transform=`translateX(${dir*40}px)`;gm.style.opacity='.3';
        requestAnimationFrame(()=>requestAnimationFrame(()=>{gm.style.transition='transform .25s ease,opacity .25s ease';gm.style.transform='';gm.style.opacity=''}));
      }else reset();
    });
    gmWrap.addEventListener('touchcancel',()=>{drag=false;reset()});
  }

  // disponibilità e prenotazione
  const box=$('#bk'),qp=new URLSearchParams(location.search),pagamento=qp.get('pagamento');
  // Sugli schermi larghi la scheda segue la pagina (position:sticky in css/main.css) a 84 px dall'alto, sotto l'intestazione. Se lì non ci sta
  // intera (schermo basso, un messaggio in più) si ferma più in alto, con il fondo in vista: mai tagliata in basso né con uno scorrimento interno.
  // hb = fondo dell'intestazione fissa; vedi() riporta in vista l'inizio della scheda, in cima alla sua colonna (lì la scheda scorre con la pagina).
  const card=$('.book-card'),fit=()=>card.style.setProperty('--bk-top',Math.min(84,innerHeight-card.offsetHeight-16)+'px'),
    hb=()=>{const h=$('.site-header');return h?h.getBoundingClientRect().bottom:0},vedi=()=>card.parentElement.scrollIntoView({behavior:'smooth',block:'start'});
  fit();addEventListener('resize',fit);if(window.ResizeObserver)new ResizeObserver(fit).observe(card);
  // ritorno da un pagamento avviato da questa pagina, prima della pagina di prenotazione (prenota.html): sessioni di Stripe ancora in corso
  if(pagamento==='successo'){history.replaceState(null,'',location.pathname);esito(box,(qp.get('code')||'').trim().toUpperCase());return}
  // Risposta v2: {v:2,status:'ok'|'degraded',asOf,dates:[…],notice,limit}. Se la disponibilità non è verificabile il server risponde 503 (get() → null):
  // in quel caso non si mostra mai un calendario "libero" a caso, ma si invita a scrivere o chiamare.
  const bz=await get('a=busy&id='+p.id);
  if(!bz||bz.v!==2||!Array.isArray(bz.dates)){box.innerHTML=offline;return}
  let busy=new Set(bz.dates);const today=iso(new Date());
  // preavviso minimo: il primo arrivo prenotabile lo calcola il SERVER (ora di Roma), il browser non fa conti sull'orologio.
  // I giorni prima di quella data compaiono come non disponibili; toccandone uno (con almeno 1 giorno di preavviso impostato) il messaggio dice il primo arrivo.
  // Sotto il calendario non ci sono note fisse sul preavviso né sull'ultimo giorno prenotabile: le regole restano (giorni spenti, messaggi al clic, controlli del server).
  const first=bz.notice&&RE_D.test(bz.notice.primoArrivo||'')?bz.notice.primoArrivo:'',
    nt=first&&+bz.notice.giorni>0?+bz.notice.giorni:0,
    ntMsg=nt?`Prenotazioni online con almeno ${nt} ${nt===1?'giorno':'giorni'} di preavviso: il primo arrivo possibile è il ${fmtD(first)}.`:'';
  // orizzonte: dal sito si prenota al massimo 6 mesi in avanti. L'ultimo giorno lo indica il server; se manca si calcola qui.
  const lim={mesi:+(bz.limit&&bz.limit.mesi)||6,last:bz.limit&&RE_D.test(bz.limit.ultimoGiorno||'')?bz.limit.ultimoGiorno:''};
  if(!lim.last){const d=new Date();d.setMonth(d.getMonth()+lim.mesi);lim.last=iso(d)}
  const last=lim.last,mk=d=>d.getFullYear()*12+d.getMonth(),kLast=+last.slice(0,4)*12+(+last.slice(5,7)-1);
  // Prezzo «da … a notte»: il più basso tra le notti ancora prenotabili della settimana in corso (da oggi a domenica, ora di Roma: dal primo arrivo
  // ammesso, entro l'orizzonte, non occupate), con le stesse regole del totale (prezzo del giorno > prezzo di stagione > base). È il prezzo a notte
  // senza supplementi per gli ospiti in più; il totale esatto resta quello calcolato scegliendo le date. Nessuna notte prenotabile: la riga non compare.
  const oggi=oggiRoma(),dom=new Date(oggi+'T00:00:00Z');dom.setUTCDate(dom.getUTCDate()+(7-dom.getUTCDay())%7+1);      // il lunedì dopo: escluso
  const notti=days(oggi,iso(dom)).filter(d=>d>=(first||oggi)&&d<=last&&!busy.has(d)),prezzi=notti.map(d=>np(p,d)).filter(v=>Number.isFinite(v)&&v>0);
  if(prezzi.length){$('#pr').textContent=eur(Math.min(...prezzi));$('#price').hidden=false}
  // ospiti: n adulti (pagano) e k bambini sotto i 4 anni (gratis, ma contano per il massimo dell'appartamento)
  let da='',a='',n=Math.min(2,p.max),k=0,m=new Date();m.setDate(1);const k0=mk(m);
  const passo=(id,nome,v,tid)=>`<div class="stepper"><button type="button" id="${id}-dec" aria-label="Un ${nome} in meno" data-testid="${tid}-minus">−</button><b id="${id}-val" data-testid="${tid}" aria-live="polite">${v}</b><button type="button" id="${id}-inc" aria-label="Un ${nome} in più" data-testid="${tid}-plus">+</button></div>`;
  box.innerHTML=`
  <ol class="bk-steps" data-testid="booking-steps" aria-label="Fasi della prenotazione"><li class="on" data-s="1"><span>1</span>Date</li><li data-s="2"><span>2</span>Dati</li><li data-s="3"><span>3</span>Pagamento</li></ol>
  <p class="form-err" id="e" data-testid="booking-error" role="alert"></p>
  <div class="bk-pane" id="p1">
    <div class="cal-head"><button type="button" class="cal-nav" id="pv" aria-label="Mese precedente">‹</button><b id="mt" data-testid="cal-month" aria-live="polite"></b><button type="button" class="cal-nav" id="nx" aria-label="Mese successivo">›</button></div>
    <div class="cal" id="cal" data-testid="calendar"></div>
    <div class="bk-range"><div class="bk-box on" id="b-in"><span>Arrivo</span><b id="v-in" data-testid="booking-arrival">—</b></div><div class="bk-box" id="b-out"><span>Partenza</span><b id="v-out" data-testid="booking-departure">—</b></div></div>
    <div class="bk-guests" role="group" aria-label="Ospiti">
      <div class="bk-g"><div class="lab">Adulti<small>fino a ${p.max} ospiti in tutto</small></div>${passo('g','adulto',n,'booking-guests')}</div>
      <div class="bk-g"><div class="lab">Bambini<small>sotto i 4 anni · gratis</small></div>${passo('k','bambino',k,'booking-children')}</div>
    </div>
    <div class="bk-quote">
      <p class="quote-line" id="q" data-testid="quote"></p>
      <div class="bk-total" id="tot" hidden><span>Totale soggiorno</span><b id="tot-v" data-testid="booking-total"></b></div>
      <p class="book-note bk-ann" id="ann" data-testid="booking-cancel-policy" hidden></p>
      <a class="btn btn-wine bk-cta" id="go" href="prenota.html" data-testid="booking-continue" hidden>Prenota</a>
    </div>
  </div>`;
  // il messaggio è in cima alla scheda: se resta sotto l'intestazione (scheda ferma con il fondo in vista) torna in vista l'inizio della scheda
  const msg=t=>{const el=$('#e');el.textContent=t||'';if(!t)return;fit();
    if(el.getBoundingClientRect().top<hb())vedi();else if(el.scrollIntoView)el.scrollIntoView({block:'nearest',behavior:'smooth'})};
  if(pagamento==='annullato'){
    const cc=(qp.get('code')||'').trim().toUpperCase(),s=accGet();if(cc&&s&&s.c===cc)api('checkout_cancel',{code:cc,t:s.t}).catch(()=>{});      // libera subito le notti trattenute durante il pagamento (serve il token del checkout)
    history.replaceState(null,'',location.pathname);$('#e').textContent='Pagamento annullato: le date sono ancora libere, puoi riprovare quando vuoi.'}
  // importo e pulsante "Prenota": compaiono solo con arrivo e partenza scelti. Qui non si mostra mai il prezzo di una singola notte.
  // «Prenota» porta alla pagina di prenotazione con date e ospiti scelti: lì i dati e il pagamento.
  const upd=()=>{
    const ok=!!a,nn=ok?days(da,a).length:0;
    $('#v-in').textContent=da?fmtW(da):'—';$('#v-out').textContent=a?fmtW(a):'—';
    $('#b-in').classList.toggle('on',!da);$('#b-out').classList.toggle('on',!!da&&!a);
    $('#g-dec').disabled=n<=1;$('#g-inc').disabled=$('#k-inc').disabled=n+k>=p.max;$('#k-dec').disabled=k<=0;
    $('#q').textContent=ok?`${nn} ${nn===1?'notte':'notti'} · ${chiTxt(n,k)}`:da?'Ora scegli il giorno di partenza.':'Scegli arrivo e partenza: qui compare l’importo.';
    $('#tot').hidden=!ok;$('#go').hidden=!ok;$('#ann').hidden=!ok;
    if(ok){$('#tot-v').textContent=money(tot(p,da,a,n));$('#ann').textContent=annullo(da);$('#go').href='prenota.html?'+new URLSearchParams({apt:p.id,da,a,adulti:n,bambini:k})}};
  const draw=()=>{const y=m.getFullYear(),mo=m.getMonth(),f=(new Date(y,mo,1).getDay()+6)%7,nd=new Date(y,mo+1,0).getDate();
    $('#mt').textContent=m.toLocaleDateString('it-IT',{month:'long',year:'numeric'});
    $('#pv').disabled=mk(m)<=k0;$('#nx').disabled=mk(m)>=kLast;      // né indietro oltre il mese in corso né avanti oltre i 6 mesi
    let h='LMMGVSD'.split('').map(x=>`<b aria-hidden="true">${x}</b>`).join('')+'<i></i>'.repeat(f);
    for(let i=1;i<=nd;i++){const d=`${y}-${pad(mo+1)}-${pad(i)}`,beyond=d>last,x=beyond||d<today||(first&&d<first)||busy.has(d);
      h+=`<button type="button" class="d${x?' x':''}${beyond||d<today?' f':''}${d===da||d===a?' s':''}${da&&a&&d>da&&d<a?' r':''}" data-d="${d}" aria-label="${esc(fmtL(d))}${x?', non disponibile':''}"${x?' aria-disabled="true"':''}>${i}</button>`}
    $('#cal').innerHTML=h;upd()};
  $('#pv').onclick=()=>{m.setMonth(m.getMonth()-1);draw()};
  $('#nx').onclick=()=>{m.setMonth(m.getMonth()+1);draw()};
  const setN=v=>{n=Math.min(p.max-k,Math.max(1,v));$('#g-val').textContent=n;upd()},setK=v=>{k=Math.min(p.max-n,Math.max(0,v));$('#k-val').textContent=k;upd()};
  $('#g-dec').onclick=()=>setN(n-1);$('#g-inc').onclick=()=>setN(n+1);$('#k-dec').onclick=()=>setK(k-1);$('#k-inc').onclick=()=>setK(k+1);
  $('#cal').onclick=e=>{const el=e.target.closest('.d');if(!el)return;const d=el.dataset.d,second=da&&!a&&d>da;
    if(d>last){msg(`Si può prenotare fino al ${fmtD(last)}: al massimo ${lim.mesi} mesi in anticipo.`);return}
    if(da&&!a&&d===da){da='';msg('');draw();return}      // di nuovo sull'arrivo appena scelto: la scelta si annulla e si riparte da capo
    if(el.classList.contains('x')&&!second){if(nt&&d>=today&&d<first)msg(ntMsg);return}
    if(!second){da=d;a='';msg('')}
    else{const g=days(da,d);
      const mn=minFor(p,da);if(g.length<mn){msg('Soggiorno minimo per queste date: '+mn+' notti');return}
      if(g.some(z=>busy.has(z))){msg('Nel periodo scelto ci sono date occupate');return}
      a=d;msg('')}
    draw()};
  draw();
}

async function guestcard(c){
  const q=new URLSearchParams(location.search),box=$('#r');
  // Copia negli appunti (con ripiego per i browser che non permettono navigator.clipboard)
  const copia=async t=>{
    try{await navigator.clipboard.writeText(t);return true}
    catch{try{const ta=document.createElement('textarea');ta.value=t;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.appendChild(ta);ta.select();const ok=document.execCommand('copy');ta.remove();return ok}catch{return false}}};
  // dall'area clienti (o dal link #k=…) la prenotazione si riconosce da sola: il primo passo, il codice, non si mostra; resta a portata con «Usa un altro codice»
  const form=$('[data-testid=gc-card]'),altro=auto=>auto?`<p class="book-note"><button type="button" class="link-btn" data-act="gc-altro" data-testid="gc-altro">Usa un altro codice di prenotazione</button></p>`:'';
  box.addEventListener('click',async e=>{
    if(e.target.closest('[data-act=gc-altro]')){box.innerHTML='';if(form)form.hidden=false;$('#gc-code').focus();return}
    const b=e.target.closest('[data-copy]');if(!b)return;
    const orig=b.dataset.label||(b.dataset.label=b.textContent),ok=await copia(b.dataset.copy);
    b.textContent=ok?'Codice copiato ✓':'Copia non riuscita';
    clearTimeout(b._t);b._t=setTimeout(()=>{b.textContent=orig},2200)});
  const renderCard=g=>`<div class="admin-card" data-testid="gc-success"><h2>Richiesta Trentino Guest Card inviata 🎉</h2>${g.gc_id?`<p>Codice: <b>${esc(g.gc_id)}</b></p>`:''}<p>Periodo: <b>${fmtD(g.valid_from)} → ${fmtD(g.valid_to)}</b></p><p>Ospiti coperti: <b>${g.ospiti}</b></p><p class="book-note">Controlla la mail che arriverà a <b>${esc(g.email||'l\'indirizzo indicato')}</b>: apri il link per completare l'attivazione — ti verrà chiesto di indicare eventuali bambini nel gruppo, la provenienza, e di creare la password del tuo account Trentino Guest Card. Fatto questo la card sarà pronta sull'app Mio Trentino.</p>${g.gc_id?`<button type="button" class="btn btn-wine" data-copy="${esc(g.gc_id)}" data-testid="gc-copy">Copia codice</button>`:''}</div>`;
  const renderConfirm=(x,auto)=>{
    box.innerHTML=`<div class="admin-card" data-testid="gc-confirm">
      <h2>Prenotazione trovata</h2>
      <div class="bc-grid">
        <div class="bc-cell"><span>Appartamento</span><b>${nomeA(c,x.id)}</b></div>
        <div class="bc-cell"><span>Check-in</span><b>${fmtD(x.da)}</b></div>
        <div class="bc-cell"><span>Check-out</span><b>${fmtD(x.a)}</b></div>
        <div class="bc-cell"><span>Notti</span><b>${x.notti}</b></div>
        <div class="bc-cell"><span>Ospiti</span><b>${x.ospiti}</b></div>
      </div>
      <p class="book-note">Questi dati sono presi automaticamente dalla tua prenotazione confermata e non si possono modificare qui: la Guest Card viene sempre emessa per il periodo e il numero di ospiti reali della prenotazione.</p>
      ${x.needsEmail?`<div class="field"><label for="gc-email">La tua email (per ricevere la Guest Card)</label><input id="gc-email" type="email" required data-testid="gc-email"></div>`:''}
      <p class="book-note" data-testid="gc-privacy">Per emettere la card inviamo al sistema Trentino Guest Card la tua email, le date del soggiorno e il numero di ospiti. <a href="privacy.html" target="_blank" rel="noopener">Informativa privacy</a></p>
      <button class="btn btn-wine" style="width:100%;justify-content:center" id="gc-go" data-testid="gc-issue">Genera Trentino Guest Card</button>
      <p class="form-err" id="e2"></p>
    </div>${altro(auto)}`;
    $('#gc-go').onclick=async()=>{
      const btn=$('#gc-go');if(btn.dataset.loading)return;
      const email=x.needsEmail?($('#gc-email').value||'').trim():undefined;
      if(x.needsEmail&&!/.+@.+\..+/.test(email||'')){$('#e2').textContent="Inserisci un'email valida";return}
      btn.dataset.loading='1';btn.disabled=true;const orig=btn.textContent;btn.textContent='Genero…';
      try{const g=await api('gc_issue',Object.assign(accBody(x.code),{email}));box.innerHTML=renderCard(g)}
      catch(err){$('#e2').textContent=err.message;btn.disabled=false;btn.classList.remove('is-loading');btn.textContent=orig;delete btn.dataset.loading}};
  };
  const check=async(body,auto)=>{
    $('#e').textContent='';box.innerHTML=auto?'<p class="book-note" data-testid="gc-cerco">Cerco la tua prenotazione…</p>':'';
    if(auto&&form)form.hidden=true;
    try{let r;
      try{r=await api('gc_check',body)}
      catch(x){if(!body.t||x.status!==404)throw x;accDel();r=await api('gc_check',{code:body.code})}      // sessione scaduta (404): si riprova con il solo codice; senza rete la sessione resta
      const code=r.code||body.code;if(r.t)accSet(code,r.t);
      if(r.card){box.innerHTML=renderCard(r.card)+altro(auto);return}
      renderConfirm({...r.booking,code},auto)}
    catch(x){box.innerHTML='';if(form)form.hidden=false;$('#e').textContent=x.message}};      // non riconosciuta: si torna al primo passo, con il codice già scritto
  $('#f').onsubmit=e=>{e.preventDefault();const code=codeIn($('#gc-code').value);if(code)check(accBody(code))};
  // dall'area clienti (stessa scheda) il token è già in sessionStorage; dal messaggio di benvenuto (#k=…) basta il codice;
  // dai link con ?code=… si precompila solo il codice
  const h=accFromHash()||accGet(),qc=q.get('code');
  if(qc)history.replaceState(null,'',location.pathname);
  if(h&&h.t){$('#gc-code').value=fmtCode(h.c);check({code:h.c,t:h.t},true)}
  else if(h&&h.k){const k=codeIn(h.k);$('#gc-code').value=k;check(accBody(k),true)}
  else if(qc)$('#gc-code').value=codeIn(qc);
}

/* ---------------- pagina di prenotazione (prenota.html): i dati dell'ospite e il pagamento nel sito ---------------- */
// Si arriva dal «Prenota» della scheda dell'appartamento: prenota.html?apt=…&da=…&a=…&adulti=…&bambini=… (riepilogo a lato, con il conto).
// Passo «Dati»: nome, cognome, email, telefono. «Continua al pagamento» registra la prenotazione e trattiene le notti per 30 minuti, come prima;
// passo «Pagamento»: i campi della carta di Stripe (Payment Element) nella pagina stessa, con i colori e i caratteri del sito. I dati della carta
// restano nei riquadri di Stripe: il sito non li vede mai. Senza la chiave pubblicabile su Vercel il server manda alla pagina di Stripe, come prima.
// Le notti trattenute si liberano subito se l'ospite cambia i dati, torna alle date o lascia la pagina senza pagare.
const PR_KEY='lc_prenota',prGet=()=>{try{return JSON.parse(sessionStorage.getItem(PR_KEY)||'null')||{}}catch{return {}}},prSet=v=>{try{sessionStorage.setItem(PR_KEY,JSON.stringify(v))}catch{}};
// prenotazione di questa scheda in attesa di pagamento ({c,t}): se la pagina si riapre senza aver pagato, le sue notti si liberano prima di tutto
const ATT_KEY='lc_attesa',attGet=()=>{try{return JSON.parse(sessionStorage.getItem(ATT_KEY)||'null')}catch{return null}},attSet=v=>{try{if(v)sessionStorage.setItem(ATT_KEY,JSON.stringify(v));else sessionStorage.removeItem(ATT_KEY)}catch{}};
// Stripe.js della stessa versione delle API del server (libreria stripe 22: 2026-08-26.dahlia). Si carica solo con «Continua al pagamento»: prima la
// pagina non si collega a Stripe (informativa privacy, § 7: i cookie tecnici di Stripe arrivano solo al momento del pagamento).
const STRIPEJS='https://js.stripe.com/dahlia/stripe.js';
let stripeP=null;
const stripeJs=()=>stripeP||(stripeP=window.Stripe?Promise.resolve(window.Stripe):new Promise((ok,ko)=>{const s=document.createElement('script');s.src=STRIPEJS;
  s.onload=()=>window.Stripe?ok(window.Stripe):ko(Error('Stripe.js'));s.onerror=()=>{stripeP=null;ko(Error('Stripe.js'))};document.head.appendChild(s)}));
// i campi della carta con lo stile del sito: colori di css/main.css, Manrope dal sito (fonts/, servito con CORS: i campi stanno in un riquadro di Stripe)
const ASPETTO={theme:'stripe',labels:'above',
  variables:{colorPrimary:'#7A2E39',colorBackground:'#FAF5EC',colorText:'#1E1917',colorTextSecondary:'#6C5F55',colorTextPlaceholder:'#8A7D72',colorDanger:'#AA3333',iconColor:'#7A2E39',
    fontFamily:"Manrope, 'Helvetica Neue', system-ui, sans-serif",fontSizeBase:'16px',fontWeightNormal:'500',borderRadius:'12px',spacingUnit:'4px',gridRowSpacing:'14px'},
  rules:{'.Input':{border:'1px solid #DCCFB6',boxShadow:'none',padding:'11px 14px'},'.Input:focus':{border:'1px solid #7A2E39',boxShadow:'0 0 0 3px rgba(122,46,57,.12)'},
    '.Input--invalid':{border:'1px solid #AA3333',boxShadow:'none'},'.Label':{fontSize:'12px',fontWeight:'700',letterSpacing:'.12em',textTransform:'uppercase',color:'#7A2E39'},
    '.Tab':{border:'1px solid #DCCFB6',backgroundColor:'#FAF5EC',boxShadow:'none'},'.Tab:hover':{border:'1px solid #7A2E39'},
    '.Tab--selected':{border:'1px solid #7A2E39',backgroundColor:'#FFFFFF',boxShadow:'0 0 0 3px rgba(122,46,57,.12)'},'.Error':{fontWeight:'600'}}};
const FONTI=()=>['400','500','600','700'].map(w=>({family:'Manrope',src:'url('+location.origin+'/fonts/manrope-latin-wght-normal.woff2)',weight:w,display:'swap'}));
const fmtS=d=>new Date(d+'T00:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short'});
async function prenota(c){
  const box=$('#pren'),qp=new URLSearchParams(location.search),q=k=>qp.get(k)||'',pagamento=q('pagamento'),cc=q('code').trim().toUpperCase();
  const p=c.apts.find(x=>x.id===q('apt')),da=q('da'),a=q('a'),num=v=>/^\d{1,2}$/.test(v)?+v:NaN,ad=num(q('adulti')),bam=q('bambini')?num(q('bambini')):0;
  const qui=()=>'prenota.html?'+new URLSearchParams({apt:q('apt'),da,a,adulti:q('adulti'),bambini:q('bambini')||'0'});      // la stessa prenotazione, senza l'esito
  const torna=(t,d,ps)=>`<div class="form-ok pr-esito" data-testid="prenota-vuota"><h3>${t}</h3><p>${d}</p><div class="ga-btns">${ps.map(x=>`<a class="btn btn-wine" href="${esc(x.id)}.html#prenota">${esc(x.t||short(x))}</a>`).join('')}</div></div>`;
  // ritorno dal pagamento (pagina di Stripe, o la banca che ha chiesto una conferma su un'altra pagina): da qui le notti si liberano solo con «Riprova»
  if(pagamento==='successo'){const r=qui();history.replaceState(null,'',location.pathname);attSet(null);
    return esito(box,cc,{cls:'pr-esito',riprova:()=>{const s=accGet();if(s&&s.c===cc)api('checkout_cancel',{code:cc,t:s.t}).catch(()=>{}).finally(()=>location.replace(r));else location.replace(r)}})}
  // pagamento annullato su Stripe, o pagina riaperta senza aver pagato: prima si liberano le notti trattenute, poi si guarda la disponibilità
  const att=attGet(),s0=accGet(),rel=pagamento==='annullato'&&cc&&s0&&s0.c===cc?{c:cc,t:s0.t}:att;
  if(pagamento==='annullato')history.replaceState(null,'',qui());
  if(rel){attSet(null);await api('checkout_cancel',{code:rel.c,t:rel.t}).catch(()=>{})}
  // date e ospiti arrivano dalla scheda dell'appartamento: un indirizzo incompleto o vecchio rimanda lì
  if(!p||!RE_D.test(da)||!RE_D.test(a)||a<=da||da<oggiRoma()||!(ad>=1)||!(bam>=0)||ad+bam>p.max){
    box.innerHTML=torna('Scegli prima le date','Date e ospiti si scelgono nella pagina dell\'appartamento: lì vedi subito disponibilità e prezzo.',c.apts);return}
  document.title='Prenota '+short(p)+' · La Columbera';
  const bz=await get('a=busy&id='+p.id+'&v='+Date.now()),g=days(da,a);      // sempre dal server (non la copia di pochi secondi fa): le notti appena liberate sono libere
  if(!bz||bz.v!==2||!Array.isArray(bz.dates)){box.innerHTML=offline;return}
  const first=bz.notice&&RE_D.test(bz.notice.primoArrivo||'')?bz.notice.primoArrivo:'';
  if(g.some(d=>bz.dates.includes(d))||(first&&da<first)||g.length<minFor(p,da)){
    box.innerHTML=torna('Queste date non sono più disponibili','Nel frattempo qualcuno le ha prenotate o non si possono più scegliere: scegline altre nel calendario.',[{id:p.id,t:'Scegli altre date'}]);return}
  const nn=g.length,totale=tot(p,da,a,ad),righe=[];for(const d of g){const pz=np(p,d),l=righe[righe.length-1];if(l&&l.prezzo===pz)l.notti++;else righe.push({dal:d,notti:1,prezzo:pz})}
  const su=sup(p,ad),foto=(p.foto||[])[0]||'',dati=prGet();
  box.innerHTML=`<div class="pr-grid">
   <ol class="bk-steps pr-steps" data-testid="booking-steps" aria-label="Fasi della prenotazione"><li class="done" data-s="1"><span>✓</span>Date</li><li class="on" data-s="2"><span>2</span>Dati</li><li data-s="3"><span>3</span>Pagamento</li></ol>
   <div class="pr-main">
    <p class="form-err" id="e" data-testid="booking-error" role="alert"></p>
    <section class="pr-card" data-testid="prenota-dati">
     <h2 class="pr-h">I tuoi dati</h2>
     <form id="f" data-testid="booking-form">
      <div class="field-row">
       <div class="field"><label for="bn">Nome</label><input id="bn" name="nome" required autocomplete="given-name" data-testid="booking-name"></div>
       <div class="field"><label for="bs">Cognome</label><input id="bs" name="cognome" required autocomplete="family-name" data-testid="booking-surname"></div>
      </div>
      <div class="field"><label for="be">Email</label><input id="be" name="email" type="email" required autocomplete="email" data-testid="booking-email"></div>
      <div class="field"><label for="bt">Telefono <small>(facoltativo)</small></label><input id="bt" name="tel" type="tel" autocomplete="tel" data-testid="booking-phone"></div>
      <p class="book-note" data-testid="booking-privacy">Nome ed email servono per registrare la prenotazione e inviarti la conferma; il telefono, se lo indichi, solo per contattarti in caso di necessità sul soggiorno. <a href="privacy.html" target="_blank" rel="noopener">Informativa privacy</a></p>
      <button class="btn btn-wine bk-cta" data-testid="booking-submit">Continua al pagamento</button>
     </form>
     <div class="pr-chi" id="chi" data-testid="prenota-chi" hidden></div>
    </section>
    <section class="pr-card" id="pag" data-testid="prenota-pagamento" hidden>
     <h2 class="pr-h">Pagamento</h2>
     <p class="book-note pr-tempo">Le notti sono riservate per te per 30 minuti, il tempo di completare il pagamento.</p>
     <div class="pr-pe" id="pe" data-testid="prenota-carta"></div>
     <button type="button" class="btn btn-wine bk-cta" id="paga" data-testid="prenota-paga">Paga ${money(totale)}</button>
     <p class="bk-secure">Pagamento sicuro con Stripe: i dati della carta vanno direttamente a Stripe, il nostro sito non li vede.</p>
    </section>
   </div>
   <aside class="pr-side">
    <div class="pr-recap" data-testid="booking-recap">
     <div class="pr-recap-top">${foto?`<img class="pr-foto" src="${esc(foto)}" alt="" decoding="async">`:''}
      <div class="pr-recap-t"><span class="pr-kicker">La Columbera</span><h2>${esc(short(p))}</h2>${p.sotto?`<p class="pr-sotto">${esc(p.sotto)}</p>`:''}</div></div>
     <div class="pr-recap-in">
      <div class="bc-grid">
       <div class="bc-cell"><span>Arrivo</span><b>${esc(fmtW(da))}</b></div>
       <div class="bc-cell"><span>Partenza</span><b>${esc(fmtW(a))}</b></div>
       <div class="bc-cell"><span>Notti</span><b>${nn}</b></div>
       <div class="bc-cell"><span>Ospiti</span><b data-testid="prenota-ospiti">${esc(chiTxt(ad,bam))}</b>${bam?'<small>sotto i 4 anni: gratis</small>':''}</div>
      </div>
      <div class="ga-rows" data-testid="prenota-conto">${righe.map(r=>`<div><span>${r.notti} ${r.notti===1?'notte':'notti'} × ${money(r.prezzo)}${righe.length>1?' · dal '+esc(fmtS(r.dal)):''}</span><b>${money(r.notti*r.prezzo)}</b></div>`).join('')}${su>0?`<div><span>Ospiti in più: ${nn} ${nn===1?'notte':'notti'} × ${money(su)}</span><b>${money(su*nn)}</b></div>`:''}${bam?`<div><span>${bam===1?'Bambino':'Bambini'} sotto i 4 anni</span><b>gratis</b></div>`:''}<div class="ga-tot"><span>Totale</span><b data-testid="booking-total">${money(totale)}</b></div></div>
      <p class="pr-ann" data-testid="booking-recap-policy">${esc(annullo(da))}</p>
      <a class="link-btn" href="${esc(p.id)}.html#prenota" data-testid="booking-back">← Modifica date e ospiti</a>
     </div>
    </div>
   </aside>
  </div>`;
  for(const[k,id]of[['nome','bn'],['cognome','bs'],['email','be'],['tel','bt']])if(dati[k])$('#'+id).value=dati[k];      // i dati già scritti in questa scheda
  const msg=t=>{const el=$('#e');el.textContent=t||'';if(t&&el.scrollIntoView)el.scrollIntoView({block:'nearest',behavior:'smooth'})};
  if(pagamento==='annullato')msg('Pagamento annullato: le date sono ancora libere, puoi riprovare quando vuoi.');
  const passi=k=>box.querySelectorAll('.pr-steps li').forEach(li=>{const s=+li.dataset.s;li.classList.toggle('on',s===k);li.classList.toggle('done',s<k);li.firstElementChild.textContent=s<k?'✓':String(s)});
  const carica=(btn,t)=>{const orig=btn.textContent;btn.dataset.loading='1';btn.disabled=true;btn.classList.add('is-loading');btn.textContent=t;
    return()=>{btn.disabled=false;btn.classList.remove('is-loading');btn.textContent=orig;delete btn.dataset.loading}};
  // pend = prenotazione in attesa di pagamento (notti trattenute); pagando = il pagamento è partito (anche se la banca porta su un'altra pagina)
  let pend=null,pagando=false,el=null,azioni=null,timer=0;
  const libera=()=>{if(!pend||pagando)return;const b=JSON.stringify({code:pend.code,t:pend.t});pend=null;attSet(null);clearTimeout(timer);
    try{fetch('api/x?a=checkout_cancel',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:b}).catch(()=>{})}catch{}};
  const aiDati=t=>{libera();try{if(el)el.destroy()}catch{}el=null;azioni=null;$('#pe').innerHTML='';$('#pag').hidden=$('#chi').hidden=true;$('#f').hidden=false;passi(2);msg(t||'')};
  addEventListener('pagehide',libera);
  addEventListener('pageshow',e=>{if(e.persisted&&(pagando||!$('#pag').hidden))location.reload()});      // pagina ripresa dalla cronologia (anche tornando indietro dalla pagina di Stripe): si riparte, con le notti liberate
  $('#chi').addEventListener('click',e=>{if(e.target.closest('[data-act=modifica]'))aiDati()});
  $('#f').onsubmit=async e=>{e.preventDefault();
    const btn=e.target.querySelector('[data-testid=booking-submit]');if(btn.dataset.loading)return;
    const fd=new FormData(e.target),v=k=>String(fd.get(k)||'').trim();
    prSet({nome:v('nome'),cognome:v('cognome'),email:v('email'),tel:v('tel')});
    const fine=carica(btn,'Preparo il pagamento…');msg('');
    let r;try{r=await api('checkout',{id:p.id,da,a,adulti:ad,bambini:bam,ospiti:ad+bam,nome:`${v('nome')} ${v('cognome')}`.trim(),email:v('email'),tel:v('tel'),ui:'elements'})}
    catch(x){fine();msg(x.message);return}
    accSet(r.code,r.t);attSet({c:r.code,t:r.t});
    if(!r.cs){if(!r.url){fine();msg('Non è stato possibile avviare il pagamento: riprova tra qualche minuto.');return}
      pagando=true;location.href=r.url;return}      // chiave pubblicabile non impostata su Vercel: si paga sulla pagina di Stripe, come prima
    pend={code:r.code,t:r.t};
    // dopo 30 minuti le notti non sono più trattenute e Stripe chiude il pagamento: si riparte dai dati, già scritti
    timer=setTimeout(()=>{if(!pagando)aiDati('Sono passati 30 minuti e le notti non sono più riservate: premi «Continua al pagamento» per riprovare.')},29*60e3);
    $('#chi').innerHTML=`<div><b>${esc(v('nome')+' '+v('cognome'))}</b><span>${esc(v('email'))}${v('tel')?' · '+esc(v('tel')):''}</span></div><button type="button" class="link-btn" data-act="modifica" data-testid="prenota-modifica">Modifica</button>`;
    $('#f').hidden=true;$('#chi').hidden=false;$('#pag').hidden=false;passi(3);fine();
    if($('#pag').scrollIntoView)$('#pag').scrollIntoView({behavior:'smooth',block:'start'});      // su telefono il pagamento è più in basso
    try{const S=await stripeJs(),ck=S(r.pk,{locale:'it'}).initCheckoutElementsSdk({clientSecret:r.cs,elementsOptions:{appearance:ASPETTO,fonts:FONTI()}});
      el=ck.createPaymentElement({layout:'tabs'});el.mount('#pe');
      azioni=ck.loadActions().then(x=>{if(x.type!=='success')throw Error(x.error&&x.error.message||'Stripe');return x.actions});await azioni}
    catch(x){aiDati('Non riesco a caricare il modulo di pagamento: ricarica la pagina e riprova. Se il problema continua scrivici a lacolumbera@gmail.com.')}};
  $('#paga').onclick=async()=>{const btn=$('#paga');if(btn.dataset.loading||!pend||!azioni)return;
    const fine=carica(btn,'Pagamento in corso…');msg('');
    pagando=true;      // da qui le notti restano trattenute anche lasciando la pagina: la banca può chiedere una conferma su un'altra pagina
    let r;try{r=await(await azioni).confirm({redirect:'if_required'})}catch(x){r={type:'error',error:{}}}
    if(r&&r.type==='success'){clearTimeout(timer);const code=pend.code;pend=null;attSet(null);history.replaceState(null,'',location.pathname);
      if(window.scrollTo)window.scrollTo({top:0,behavior:'smooth'});return esito(box,code,{cls:'pr-esito'})}
    pagando=false;fine();msg((r&&r.error&&r.error.message)||'Il pagamento non è andato a buon fine: controlla i dati della carta e riprova.')};
}

// eventi automatici e inseriti in Gestione: quelli già caricati da js/site.js appena l'ospite è entrato nel sito (window.lcEventi), altrimenti si chiedono ora
const eventiList=()=>window.lcEventi?window.lcEventi():Promise.all([get('a=events_feed'),get('a=events')]).then(([f,m])=>[...(Array.isArray(f)?f:[]),...(Array.isArray(m)?m:[])]);
async function eventi(c){
  const box=$('#events');
  const safeUrl=u=>{u=String(u||'').trim();if(!u)return'';if(/^https?:\/\//i.test(u))return u;if(u[0]==='/')return'https://www.visittrentino.info'+u;return'https://'+u};
  const today=iso(new Date());
  const all=(await eventiList()).filter(x=>x&&x.date>=today).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  if(!all.length){box.innerHTML='<p class="book-note">Nessun evento in programma al momento.</p>';return}
  // gli eventi sono raggruppati per mese: la pagina resta leggibile anche con molti appuntamenti
  let mese='';
  box.innerHTML=all.map(x=>{
    const m=String(x.date).slice(0,7),
    head=m!==mese?(mese=m,`<h2 class="ev-month" data-testid="ev-month-${esc(m)}">${esc(new Date(x.date+'T00:00:00').toLocaleDateString('it-IT',{month:'long',year:'numeric'}))}</h2>`):'',
    u=safeUrl(x.url),
    inner=`
      <div class="body">
        <span class="section-kicker">${esc(new Date(x.date+'T00:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long'}))}${x.source?' · '+esc(x.source):''}</span>
        <h3>${esc(x.title)}</h3>
        <div class="meta"><span>${esc(x.time||'da definire')}</span><span>${esc(x.location||'Trento')}</span></div>
        ${u?`<div class="cta"><span class="cta-link">Scopri di più <span aria-hidden="true">→</span></span></div>`:''}
      </div>`;
    return head+(u
      ?`<a class="apt-card ev-card ev-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer" aria-label="Apri la pagina dell'evento: ${esc(x.title)}" data-testid="ev-${esc(x.date)}">${inner}</a>`
      :`<article class="apt-card ev-card" data-testid="ev-${esc(x.date)}">${inner}</article>`)}).join('');
}

// L'area clienti vive in js/area.js (caricato solo da area-clienti.html, parte da sé) e usa gli stessi strumenti di questa pagina
// (accesso con codice e token, chiamate al server, date): stessa sessione e stesse regole della Guest Card.
window.LCP={esc,api,get,iso,fmtD,fmtW,fmtL,mdLite,modal,accGet,accSet,accDel,accFromHash,accBody,fmtCode,codeIn,eventiList};
const P={apt,guestcard,eventi,prenota};
// la pagina Eventi non usa la configurazione del sito: parte subito, senza aspettarla
if(B.p==='eventi')eventi();
else if(P[B.p])get('a=cfg').then(c=>c||fetch('data/default.json').then(r=>r.json())).then(c=>P[B.p](c));
