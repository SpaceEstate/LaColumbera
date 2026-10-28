// La Columbera · pagine appartamento, area clienti, gestione, guest card, eventi
const $=s=>document.querySelector(s),B=document.body.dataset;
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const eur=n=>'€'+Math.round(n);
const api=(a,b,t)=>fetch('api/x?a='+a,{method:'POST',headers:{'Content-Type':'application/json',Authorization:t||''},body:JSON.stringify(b||{})}).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.err||'Servizio non disponibile');return j});
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
// Accesso alla prenotazione: il codice è solo un identificativo, l'accesso lo dà un token segreto (api/_accesso.js).
// Il token arriva dal checkout o dal link della mail ("#c=…&t=…": il frammento non va mai al server né ad altri siti),
// resta solo in sessionStorage (si cancella chiudendo la scheda) e viene tolto subito dall'indirizzo.
const ACC_KEY='lc_acc';
const accGet=()=>{try{const v=JSON.parse(sessionStorage.getItem(ACC_KEY)||'null');return v&&v.c&&v.t?v:null}catch{return null}};
const accSet=(c,t)=>{try{if(c&&t)sessionStorage.setItem(ACC_KEY,JSON.stringify({c:String(c).toUpperCase(),t}))}catch{}};
const accDel=()=>{try{sessionStorage.removeItem(ACC_KEY)}catch{}};
try{sessionStorage.removeItem('lc_code')}catch{}      // chiave della versione precedente: non serve più
const accFromHash=()=>{const h=new URLSearchParams(location.hash.slice(1)),c=(h.get('c')||'').trim().toUpperCase(),t=(h.get('t')||'').trim();
  if(location.hash)history.replaceState(null,'',location.pathname+location.search);
  if(c&&t){accSet(c,t);return{c,t}}return null};
// credenziali da mandare al server: token se c'è (per QUEL codice), altrimenti data di arrivo ed email digitate
const accBody=(code,f)=>{const s=accGet();if(s&&s.c===code)return{code,t:s.t};const d=f?Object.fromEntries(new FormData(f)):{};return{code,da:String(d.da||'').trim(),email:String(d.email||'').trim()}};
const short=p=>p.nome.replace('La Columbera ','');
const nomeA=(c,id)=>esc(short(c.apts.find(p=>p.id===id)||{nome:id}));

async function apt(c){
  const p=c.apts.find(x=>x.id===B.id);if(!p)return;
  p.prices=p.prices||{};p.periodi=p.periodi||[];
  const other=c.apts.find(x=>x.id!==B.id);
  document.title=p.nome+' · La Columbera';
  $('#ph-img').src=p.foto[0]||'';
  $('#apt-nome').textContent=short(p);
  $('#apt-sotto').textContent=p.sotto;
  $('#pr').textContent=eur(p.base);
  $('#note').textContent=`Soggiorno minimo ${p.min} notti${(p.minPeriodi||[]).length?' (in alcuni periodi di più)':''} · fino a ${p.max} ospiti`;
  $('#desc').textContent=p.testo;
  $('#chips').innerHTML=[`fino a ${p.max} ospiti`,p.id==='torre'?'due livelli':'piano terra',`minimo ${p.min} notti`,'check-in autonomo'].map(x=>`<span>${esc(x)}</span>`).join('');
  // CIN e CIPAT: obbligatori negli annunci. Si impostano da Gestione (il CIPAT può arrivare dalla struttura); senza valore la riga non compare.
  const cd=window.lcCodici?window.lcCodici(p,c.cipat):'';
  if(cd){$('#codes').innerHTML=cd;$('#codes').hidden=false}
  // testo di approfondimento (Gestione → appartamento → Testi)
  const more=mdLite(p.dettagli);
  if(more.length){$('#more').innerHTML=more.map(b=>b.h?`<h3>${esc(b.h)}</h3>`:b.p!==undefined?`<p>${esc(b.p)}</p>`:`<ul>${b.li.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`).join('');$('#more').hidden=false}
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
    $('#other-sub').textContent=other.sotto+'. Nella stessa dimora storica a Ravina, con lo stesso carattere e gli stessi comfort.';
    $('#other-link').href=other.id+'.html';
  }

  // Galleria: freccia avanti/indietro + strip di anteprime (solo alcune, scorrevoli)
  let cur=0;const N=p.foto.length;
  const gm=$('#gm'),gmWrap=gm.parentElement,th=$('#th');
  gmWrap.insertAdjacentHTML('beforeend',
    `<button type="button" class="g-arrow prev" id="g-prev" aria-label="Foto precedente" data-testid="gallery-prev">‹</button>
     <button type="button" class="g-arrow next" id="g-next" aria-label="Foto successiva" data-testid="gallery-next">›</button>
     <span class="g-counter" id="g-count" data-testid="gallery-counter"></span>`);
  th.innerHTML=p.foto.map((u,i)=>`<button type="button" data-i="${i}" data-testid="gallery-thumb-${i}"><img src="${u}" alt="" loading="lazy"></button>`).join('');
  const goTo=i=>{cur=(i+N)%N;gm.src=p.foto[cur];[cur+1,cur-1].forEach(k=>{if(N>1)new Image().src=p.foto[(k+N)%N]});$('#g-count').textContent=`${cur+1} / ${N}`;
    th.querySelectorAll('button').forEach((b,j)=>b.classList.toggle('on',j===cur));
    const act=th.querySelector(`[data-i="${cur}"]`);act&&act.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'})};
  goTo(0);
  if(N<2){$('#g-prev').style.display=$('#g-next').style.display='none';th.style.display='none'}
  $('#g-prev').onclick=()=>goTo(cur-1);
  $('#g-next').onclick=()=>goTo(cur+1);
  th.onclick=e=>{const b=e.target.closest('button');if(b)goTo(+b.dataset.i)};
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
      if(!drag)return;drag=false;
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
  if(pagamento==='successo'){
    history.replaceState(null,'',location.pathname);
    // La conferma arriva di norma dal webhook di Stripe pochi secondi dopo il pagamento. Qui si chiede lo stato al server (che, se il webhook ritarda,
    // controlla direttamente su Stripe) e si dice all'ospite com'è davvero: confermata, in verifica oppure ancora in registrazione.
    const cc=(qp.get('code')||'').trim().toUpperCase(),s=accGet(),tk=s&&s.c===cc?s.t:'',
      mail='<a href="mailto:lacolumbera@gmail.com">lacolumbera@gmail.com</a>',
      view=(st,em)=>{
        if(st==='confermata')return`<h3>Prenotazione confermata 🎉</h3><p>Il tuo codice è <b>${esc(cc)}</b>. Ti abbiamo scritto una email di conferma${em?` a <b>${esc(em)}</b>`:''} (controlla anche lo spam), con il link alla tua <a href="area-clienti.html">area clienti</a>, dove fai il check-in online e crei la tua Trentino Guest Card.</p>`;
        if(st==='da_verificare'||st==='annullata')return`<h3>Pagamento ricevuto</h3><p>Il tuo codice è <b>${esc(cc)}</b>. Stiamo verificando la tua prenotazione e ti scriviamo al più presto. Per qualsiasi dubbio scrivici a ${mail} indicando il codice.</p>`;
        return`<h3>Grazie, stiamo registrando la prenotazione</h3><p>Il tuo codice è <b>${esc(cc)}</b>. Riceverai a breve una email di conferma con il link alla tua <a href="area-clienti.html">area clienti</a>. Se entro qualche minuto non la vedi (controlla anche lo spam), scrivici a ${mail} indicando il codice.</p>`};
    const paint=(st,em)=>{box.innerHTML=`<div class="form-ok" data-testid="booking-success" data-stato="${esc(st||'')}">${view(st,em)}</div>`};
    paint('');
    if(cc&&tk)for(let i=0;i<6;i++){      // fino a ~15 s: di solito la conferma c'è al primo o al secondo controllo
      if(i)await new Promise(r=>setTimeout(r,3000));
      let r;try{r=await api('checkout_status',{code:cc,t:tk})}catch(e){break}
      if(r.stato&&r.stato!=='in_attesa'){paint(r.stato,r.email);break}
    }
    return;
  }
  // Risposta v2: {v:2,status:'ok'|'degraded',asOf,dates:[…],notice,limit}. Se la disponibilità non è verificabile il server risponde 503 (get() → null):
  // in quel caso non si mostra mai un calendario "libero" a caso, ma si invita a scrivere o chiamare.
  const bz=await get('a=busy&id='+p.id);
  if(!bz||bz.v!==2||!Array.isArray(bz.dates)){
    box.innerHTML=`<div class="offline-note" data-testid="booking-offline"><h3>Disponibilità e prenotazioni</h3><p>In questo momento non riesco a verificare la disponibilità del calendario. Per prenotare scrivici a <a href="mailto:lacolumbera@gmail.com">lacolumbera@gmail.com</a> o chiamaci al <a href="tel:+393517043594">+39 351 704 3594</a>.</p></div>`;
    return;
  }
  let busy=new Set(bz.dates);const today=iso(new Date()),RE_D=/^\d{4}-\d\d-\d\d$/;
  // preavviso minimo: il primo arrivo prenotabile lo calcola il SERVER (ora di Roma), il browser non fa conti sull'orologio.
  // I giorni prima di quella data compaiono come non disponibili; l'avviso si vede solo se il titolare ha impostato almeno 1 giorno.
  const first=bz.notice&&RE_D.test(bz.notice.primoArrivo||'')?bz.notice.primoArrivo:'',
    nt=first&&+bz.notice.giorni>0?+bz.notice.giorni:0,
    ntMsg=nt?`Prenotazioni online con almeno ${nt} ${nt===1?'giorno':'giorni'} di preavviso: il primo arrivo possibile è il ${fmtD(first)}.`:'';
  // orizzonte: dal sito si prenota al massimo 6 mesi in avanti. L'ultimo giorno lo indica il server; se manca si calcola qui.
  const lim={mesi:+(bz.limit&&bz.limit.mesi)||6,last:bz.limit&&RE_D.test(bz.limit.ultimoGiorno||'')?bz.limit.ultimoGiorno:''};
  if(!lim.last){const d=new Date();d.setMonth(d.getMonth()+lim.mesi);lim.last=iso(d)}
  const last=lim.last,mk=d=>d.getFullYear()*12+d.getMonth(),kLast=+last.slice(0,4)*12+(+last.slice(5,7)-1);
  let da='',a='',n=Math.min(2,p.max),stale=false,m=new Date();m.setDate(1);const k0=mk(m);
  box.innerHTML=`
  <ol class="bk-steps" data-testid="booking-steps" aria-label="Fasi della prenotazione"><li class="on" data-s="1"><span>1</span>Date</li><li data-s="2"><span>2</span>Dati</li><li data-s="3"><span>3</span>Pagamento</li></ol>
  <p class="form-err" id="e" data-testid="booking-error" role="alert"></p>
  <div class="bk-pane" id="p1">
    <div class="cal-head"><button type="button" class="cal-nav" id="pv" aria-label="Mese precedente">‹</button><b id="mt" data-testid="cal-month" aria-live="polite"></b><button type="button" class="cal-nav" id="nx" aria-label="Mese successivo">›</button></div>
    <div class="cal" id="cal" data-testid="calendar"></div>
    <p class="book-note" data-testid="booking-limit">Prenotabile fino al ${esc(fmtD(last))}.</p>
    ${ntMsg?`<p class="book-note" id="nt" data-testid="notice-note">${esc(ntMsg)}</p>`:''}
    <div class="bk-range"><div class="bk-box on" id="b-in"><span>Arrivo</span><b id="v-in" data-testid="booking-arrival">—</b></div><div class="bk-box" id="b-out"><span>Partenza</span><b id="v-out" data-testid="booking-departure">—</b></div></div>
    <div class="bk-guests"><div class="lab">Ospiti<small>massimo ${p.max}</small></div><div class="stepper"><button type="button" id="g-dec" aria-label="Un ospite in meno" data-testid="booking-guests-minus">−</button><b id="g-val" data-testid="booking-guests" aria-live="polite">${n}</b><button type="button" id="g-inc" aria-label="Un ospite in più" data-testid="booking-guests-plus">+</button></div></div>
    <div class="bk-quote">
      <p class="quote-line" id="q" data-testid="quote"></p>
      <div class="bk-total" id="tot" hidden><span>Totale soggiorno</span><b id="tot-v" data-testid="booking-total"></b></div>
      <button type="button" class="btn btn-wine bk-cta" id="go" data-testid="booking-continue" hidden>Prenota</button>
    </div>
  </div>
  <div class="bk-pane" id="p2" hidden>
    <div class="bk-recap" data-testid="booking-recap"><b id="r-apt"></b><span id="r-dates"></span><div class="r-tot" id="r-tot"></div><button type="button" class="link-btn" id="back" data-testid="booking-back">Modifica date e ospiti</button></div>
    <form id="f" data-testid="booking-form">
      <div class="field-row">
        <div class="field"><label for="bn">Nome</label><input id="bn" name="nome" required autocomplete="given-name" data-testid="booking-name"></div>
        <div class="field"><label for="bs">Cognome</label><input id="bs" name="cognome" required autocomplete="family-name" data-testid="booking-surname"></div>
      </div>
      <div class="field"><label for="be">Email</label><input id="be" name="email" type="email" required autocomplete="email" data-testid="booking-email"></div>
      <div class="field"><label for="bt">Telefono <small>(facoltativo)</small></label><input id="bt" name="tel" type="tel" autocomplete="tel" data-testid="booking-phone"></div>
      <p class="book-note" data-testid="booking-privacy">Nome ed email servono per registrare la prenotazione e inviarti la conferma; il telefono, se lo indichi, solo per contattarti in caso di necessità sul soggiorno. <a href="privacy.html" target="_blank" rel="noopener">Informativa privacy</a></p>
      <button class="btn btn-wine bk-cta" data-testid="booking-submit">Vai al pagamento</button>
      <p class="bk-secure">Il pagamento avviene sulla pagina sicura di Stripe: l'importo è quello che vedi qui sopra.</p>
    </form>
  </div>`;
  const msg=t=>{const el=$('#e');el.textContent=t||'';if(t&&el.scrollIntoView)el.scrollIntoView({block:'nearest',behavior:'smooth'})};
  if(pagamento==='annullato'){
    const cc=(qp.get('code')||'').trim().toUpperCase(),s=accGet();if(cc&&s&&s.c===cc)api('checkout_cancel',{code:cc,t:s.t}).catch(()=>{});      // libera subito le notti trattenute durante il pagamento (serve il token del checkout)
    history.replaceState(null,'',location.pathname);$('#e').textContent='Pagamento annullato: le date sono ancora libere, puoi riprovare quando vuoi.'}
  // importo e pulsante "Prenota": compaiono solo con arrivo e partenza scelti. Qui non si mostra mai il prezzo di una singola notte.
  const upd=()=>{
    const ok=!!a,nn=ok?days(da,a).length:0;
    $('#v-in').textContent=da?fmtW(da):'—';$('#v-out').textContent=a?fmtW(a):'—';
    $('#b-in').classList.toggle('on',!da);$('#b-out').classList.toggle('on',!!da&&!a);
    $('#g-dec').disabled=n<=1;$('#g-inc').disabled=n>=p.max;
    $('#q').textContent=ok?`${nn} ${nn===1?'notte':'notti'} · ${n} ${n===1?'ospite':'ospiti'}`:da?'Ora scegli il giorno di partenza.':'Scegli arrivo e partenza: qui compare l’importo.';
    $('#tot').hidden=!ok;$('#go').hidden=!ok;
    if(ok)$('#tot-v').textContent=money(tot(p,da,a,n))};
  const draw=()=>{const y=m.getFullYear(),mo=m.getMonth(),f=(new Date(y,mo,1).getDay()+6)%7,nd=new Date(y,mo+1,0).getDate();
    $('#mt').textContent=m.toLocaleDateString('it-IT',{month:'long',year:'numeric'});
    $('#pv').disabled=mk(m)<=k0;$('#nx').disabled=mk(m)>=kLast;      // né indietro oltre il mese in corso né avanti oltre i 6 mesi
    let h='LMMGVSD'.split('').map(x=>`<b aria-hidden="true">${x}</b>`).join('')+'<i></i>'.repeat(f);
    for(let i=1;i<=nd;i++){const d=`${y}-${pad(mo+1)}-${pad(i)}`,beyond=d>last,x=beyond||d<today||(first&&d<first)||busy.has(d);
      h+=`<button type="button" class="d${x?' x':''}${beyond||d<today?' f':''}${d===da||d===a?' s':''}${da&&a&&d>da&&d<a?' r':''}" data-d="${d}" aria-label="${esc(fmtL(d))}${x?', non disponibile':''}"${x?' aria-disabled="true"':''}>${i}</button>`}
    $('#cal').innerHTML=h;upd()};
  $('#pv').onclick=()=>{m.setMonth(m.getMonth()-1);draw()};
  $('#nx').onclick=()=>{m.setMonth(m.getMonth()+1);draw()};
  const setN=v=>{n=Math.min(p.max,Math.max(1,v));$('#g-val').textContent=n;upd()};
  $('#g-dec').onclick=()=>setN(n-1);$('#g-inc').onclick=()=>setN(n+1);
  $('#cal').onclick=e=>{const el=e.target.closest('.d');if(!el)return;const d=el.dataset.d,second=da&&!a&&d>da;
    if(d>last){msg(`Si può prenotare fino al ${fmtD(last)}: al massimo ${lim.mesi} mesi in anticipo.`);return}
    if(el.classList.contains('x')&&!second){if(nt&&d>=today&&d<first)msg(ntMsg);return}
    if(!second){da=d;a='';msg('')}
    else{const g=days(da,d);
      const mn=minFor(p,da);if(g.length<mn){msg('Soggiorno minimo per queste date: '+mn+' notti');return}
      if(g.some(z=>busy.has(z))){msg('Nel periodo scelto ci sono date occupate');return}
      a=d;msg('')}
    draw()};
  // passo 1 (date e ospiti) → passo 2 (dati e pagamento)
  const goStep=k=>{$('#p1').hidden=k!==1;$('#p2').hidden=k!==2;
    box.querySelectorAll('.bk-steps li').forEach(li=>{const s=+li.dataset.s;li.classList.toggle('on',s===k);li.classList.toggle('done',s<k);li.firstElementChild.textContent=s<k?'✓':String(s)});
    $('.book-card').classList.toggle('step2',k===2);      // con il modulo aperto basta il riepilogo: la carta resta corta
    if(window.matchMedia&&matchMedia('(max-width:960px)').matches)$('.book-card').scrollIntoView({behavior:'smooth',block:'start'})};
  $('#go').onclick=()=>{if(!a)return;msg('');
    const nn=days(da,a).length;
    $('#r-apt').textContent=short(p);$('#r-dates').textContent=`${fmtW(da)} → ${fmtW(a)} · ${nn} ${nn===1?'notte':'notti'} · ${n} ${n===1?'ospite':'ospiti'}`;$('#r-tot').textContent=money(tot(p,da,a,n));
    goStep(2);$('#bn').focus({preventScroll:true})};
  $('#back').onclick=async()=>{msg('');goStep(1);
    if(stale){stale=false;      // dopo un errore del server le date potrebbero non essere più libere: si ricarica il calendario
      const z=await get('a=busy&id='+p.id);
      if(z&&z.v===2&&Array.isArray(z.dates)){busy=new Set(z.dates);if(a&&days(da,a).some(d=>busy.has(d))){da=a='';msg('Queste date non sono più disponibili: scegline altre.')}draw()}}};
  $('#f').onsubmit=async e=>{e.preventDefault();
    if(!a){goStep(1);msg('Scegli le date sul calendario');return}
    const btn=e.target.querySelector('[data-testid="booking-submit"]');
    if(btn.dataset.loading)return;btn.dataset.loading='1';const orig=btn.textContent;btn.disabled=true;btn.classList.add('is-loading');btn.textContent='Reindirizzo al pagamento…';msg('');
    const fd=Object.fromEntries(new FormData(e.target));
    try{const r=await api('checkout',{id:p.id,da,a,ospiti:n,nome:`${String(fd.nome||'').trim()} ${String(fd.cognome||'').trim()}`.trim(),email:fd.email,tel:fd.tel});
      accSet(r.code,r.t);location.href=r.url}
    catch(x){stale=true;msg(x.message);btn.disabled=false;btn.classList.remove('is-loading');btn.textContent=orig;delete btn.dataset.loading}};
  draw();
}

function clienti(c){
  const show=r=>{
      const list=r.prenotazioni||[];
      const totNotti=list.reduce((s,x)=>s+(+x.notti||0),0);
      $('#r').innerHTML=`
      <div class="admin-card"><h2>Ciao 👋</h2><p>Hai <b>${list.length}</b> prenotazion${list.length===1?'e':'i'} — totale <b>${totNotti} notti</b>. Qui trovi i dettagli, puoi generare la tua <b>Trentino Guest Card</b> e fare il <b>check-in online</b>.</p></div>
      <div class="booking-cards" data-testid="mie-cards">${list.map(x=>`
        <article class="booking-card" data-testid="mie-card-${esc(x.code)}">
          <div class="bc-top"><span class="bc-code">${esc(x.code)}</span><span class="stato ${esc(x.stato||'confermata')}">${esc(x.stato||'confermata')}</span></div>
          <h3 class="bc-title">${nomeA(c,x.id)}</h3>
          <div class="bc-grid">
            <div class="bc-cell"><span>Check-in</span><b>${fmtD(x.da)}</b></div>
            <div class="bc-cell"><span>Check-out</span><b>${fmtD(x.a)}</b></div>
            <div class="bc-cell"><span>Notti</span><b>${x.notti}</b></div>
            <div class="bc-cell"><span>Ospiti</span><b>${x.ospiti||'—'}</b></div>
          </div>
          <div class="bc-actions">
            <a class="btn btn-wine" href="guest-card.html" data-testid="gc-link-${esc(x.code)}">Crea Guest Card</a>
            <a class="btn btn-line" href="https://spaceestate.github.io/Checkin/index.html" target="_blank" rel="noopener noreferrer" data-testid="checkin-link-${esc(x.code)}">Check-in online</a>
            <a class="btn btn-line" href="https://search.google.com/local/writereview?placeid=ChIJmXdr3vNzgkcR3O0jehZOocQ" target="_blank" rel="noopener noreferrer" data-testid="review-link-${esc(x.code)}">Lascia una recensione</a>
          </div>
        </article>`).join('')}</div>`};
  const load=async(body,btn)=>{
    let orig;if(btn){if(btn.dataset.loading)return;btn.dataset.loading='1';orig=btn.textContent;btn.disabled=true;btn.classList.add('is-loading');btn.textContent='Cerco…'}
    try{const r=await api('mie',body);if(r.t)accSet(body.code,r.t);show(r)}
    catch(x){if(body.t)accDel();$('#r').innerHTML=`<p class="form-err">${esc(x.message)}</p>`}
    finally{if(btn){btn.disabled=false;btn.classList.remove('is-loading');btn.textContent=orig;delete btn.dataset.loading}}};
  $('#f').onsubmit=e=>{e.preventDefault();
    const code=String($('#cd').value||'').trim().toUpperCase();if(!code)return;
    load(accBody(code,e.target),e.target.querySelector('[data-testid="area-clienti-submit"]'))};
  // Link della mail di conferma (#c=…&t=…) o sessione già aperta in questa scheda: accesso diretto.
  // Link delle mail precedenti (?code=…): il codice si precompila, poi servono data di arrivo ed email.
  const h=accFromHash()||accGet(),qc=new URLSearchParams(location.search).get('code');
  if(qc)history.replaceState(null,'',location.pathname);
  if(h){$('#cd').value=h.c;load({code:h.c,t:h.t})}
  else if(qc)$('#cd').value=qc.trim().toUpperCase();
}

async function guestcard(c){
  const q=new URLSearchParams(location.search),box=$('#r');
  // Copia negli appunti (con ripiego per i browser che non permettono navigator.clipboard)
  const copia=async t=>{
    try{await navigator.clipboard.writeText(t);return true}
    catch{try{const ta=document.createElement('textarea');ta.value=t;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.appendChild(ta);ta.select();const ok=document.execCommand('copy');ta.remove();return ok}catch{return false}}};
  box.addEventListener('click',async e=>{
    const b=e.target.closest('[data-copy]');if(!b)return;
    const orig=b.dataset.label||(b.dataset.label=b.textContent),ok=await copia(b.dataset.copy);
    b.textContent=ok?'Codice copiato ✓':'Copia non riuscita';
    clearTimeout(b._t);b._t=setTimeout(()=>{b.textContent=orig},2200)});
  const renderCard=g=>`<div class="admin-card" data-testid="gc-success"><h2>Richiesta Trentino Guest Card inviata 🎉</h2>${g.gc_id?`<p>Codice: <b>${esc(g.gc_id)}</b></p>`:''}<p>Periodo: <b>${fmtD(g.valid_from)} → ${fmtD(g.valid_to)}</b></p><p>Ospiti coperti: <b>${g.ospiti}</b></p><p class="book-note">Controlla la mail che arriverà a <b>${esc(g.email||'l\'indirizzo indicato')}</b>: apri il link per completare l'attivazione — ti verrà chiesto di indicare eventuali bambini nel gruppo, la provenienza, e di creare la password del tuo account Trentino Guest Card. Fatto questo la card sarà pronta sull'app Mio Trentino.</p>${g.gc_id?`<button type="button" class="btn btn-wine" data-copy="${esc(g.gc_id)}" data-testid="gc-copy">Copia codice</button>`:''}</div>`;
  const renderConfirm=x=>{
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
    </div>`;
    $('#gc-go').onclick=async()=>{
      const btn=$('#gc-go');if(btn.dataset.loading)return;
      const email=x.needsEmail?($('#gc-email').value||'').trim():undefined;
      if(x.needsEmail&&!/.+@.+\..+/.test(email||'')){$('#e2').textContent="Inserisci un'email valida";return}
      btn.dataset.loading='1';btn.disabled=true;const orig=btn.textContent;btn.textContent='Genero…';
      try{const s=accGet(),g=await api('gc_issue',{code:x.code,t:s&&s.c===x.code?s.t:'',email});box.innerHTML=renderCard(g)}
      catch(err){$('#e2').textContent=err.message;btn.disabled=false;btn.classList.remove('is-loading');btn.textContent=orig;delete btn.dataset.loading}};
  };
  const check=async body=>{
    $('#e').textContent='';box.innerHTML='';
    try{const r=await api('gc_check',body);if(r.t)accSet(body.code,r.t);
      if(r.card){box.innerHTML=renderCard(r.card);return}
      renderConfirm({...r.booking,code:body.code})}
    catch(x){if(body.t)accDel();$('#e').textContent=x.message}};
  $('#f').onsubmit=e=>{e.preventDefault();const code=$('#gc-code').value.trim().toUpperCase();if(code)check(accBody(code,e.target))};
  // dall'area clienti (stessa scheda) il token è già in sessionStorage; dai vecchi link ?code=… si precompila solo il codice
  const s=accGet(),qc=q.get('code');
  if(qc)history.replaceState(null,'',location.pathname);
  if(s){$('#gc-code').value=s.c;check({code:s.c,t:s.t})}
  else if(qc)$('#gc-code').value=qc.trim().toUpperCase();
}

async function eventi(c){
  const box=$('#events');
  const safeUrl=u=>{u=String(u||'').trim();if(!u)return'';if(/^https?:\/\//i.test(u))return u;if(u[0]==='/')return'https://www.visittrentino.info'+u;return'https://'+u};
  const [feed,manual]=await Promise.all([get('a=events_feed'),get('a=events')]);
  const auto=Array.isArray(feed)?feed:[];
  const man=Array.isArray(manual)?manual:[];
  const today=iso(new Date());
  const all=[...auto,...man].filter(x=>x&&x.date>=today).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
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

const P={apt,clienti,guestcard,eventi};
get('a=cfg').then(c=>c||fetch('data/default.json').then(r=>r.json())).then(c=>P[B.p]&&P[B.p](c));
