// La Columbera · pagine appartamento, area clienti, gestione, guest card, eventi
const $=s=>document.querySelector(s),B=document.body.dataset;
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const eur=n=>'€'+Math.round(n);
const api=(a,b,t)=>fetch('api/x?a='+a,{method:'POST',headers:{'Content-Type':'application/json',Authorization:t||''},body:JSON.stringify(b||{})}).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.err||'Servizio non disponibile');return j});
const get=q=>fetch('api/x?'+q).then(r=>r.ok?r.json():null).catch(()=>null);
const iso=d=>d.toISOString().slice(0,10);
const days=(da,a)=>{const o=[];for(let d=new Date(da);d<new Date(a);d.setUTCDate(d.getUTCDate()+1))o.push(iso(d));return o};
const np=(p,d)=>{if(p.prices&&p.prices[d]!=null)return +p.prices[d];const x=(p.periodi||[]).find(q=>d>=q.da&&d<=q.a);return+(x?x.prezzo:p.base)};
const tot=(p,da,a,n)=>days(da,a).reduce((s,d)=>s+np(p,d)+Math.max(0,n-p.inclusi)*p.extra,0);
const fmtD=s=>new Date(s+'T00:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'});
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
  $('#note').textContent=`${p.inclusi} ospiti inclusi nel prezzo · ogni ospite extra +${eur(p.extra)} a notte · soggiorno minimo ${p.min} notti`;
  $('#desc').textContent=p.testo;
  $('#chips').innerHTML=[`fino a ${p.max} ospiti`,p.id==='torre'?'due livelli':'piano terra',`${p.inclusi} ospiti inclusi`,`minimo ${p.min} notti`,'check-in autonomo'].map(x=>`<span>${esc(x)}</span>`).join('');
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
  document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')goTo(cur+1);if(e.key==='ArrowLeft')goTo(cur-1)});

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
    box.innerHTML=`<div class="form-ok" data-testid="booking-success"><h3>Pagamento ricevuto 🎉</h3><p>Il tuo codice prenotazione è <b>${esc(qp.get('code')||'')}</b>. Conservalo: con questo codice accedi alla tua <a href="area-clienti.html">area clienti</a> e crei la tua Trentino Guest Card. Riceverai a breve anche una conferma via email.</p></div>`;
    return;
  }
  const bz=await get('a=busy&id='+p.id);
  if(!bz){
    box.innerHTML=`<div class="offline-note" data-testid="booking-offline"><h3>Disponibilità e prenotazioni</h3><p>Al momento non riesco a caricare la disponibilità. Scrivici: <a href="mailto:lacolumbera@gmail.com">lacolumbera@gmail.com</a></p></div>`;
    return;
  }
  const busy=new Set(bz),today=iso(new Date());
  let da='',a='',m=new Date();m.setDate(1);
  box.innerHTML=`
  <div class="cal-head"><button type="button" class="cal-nav" id="pv" aria-label="Mese precedente">‹</button><b id="mt" data-testid="cal-month"></b><button type="button" class="cal-nav" id="nx" aria-label="Mese successivo">›</button></div>
  <div class="cal" id="cal" data-testid="calendar"></div>
  <p class="quote-line" id="q" data-testid="quote"></p>
  <form id="f" data-testid="booking-form">
    <div class="field"><label for="osp">Ospiti (max ${p.max})</label><select id="osp" name="ospiti" data-testid="booking-guests">${Array.from({length:p.max},(_,i)=>`<option value="${i+1}"${i===1?' selected':''}>${i+1}</option>`).join('')}</select></div>
    <div class="field"><label for="bn">Nome e cognome</label><input id="bn" name="nome" required data-testid="booking-name"></div>
    <div class="field"><label for="be">Email</label><input id="be" name="email" type="email" required data-testid="booking-email"></div>
    <div class="field"><label for="bt">Telefono</label><input id="bt" name="tel" data-testid="booking-phone"></div>
    <button class="btn btn-wine" style="width:100%;justify-content:center" data-testid="booking-submit">Prenota</button>
    <p class="form-err" id="e" data-testid="booking-error"></p>
  </form>`;
  if(pagamento==='annullato'){history.replaceState(null,'',location.pathname);$('#e').textContent='Pagamento annullato: le date sono ancora libere, puoi riprovare quando vuoi.'}
  const draw=()=>{const y=m.getFullYear(),mo=m.getMonth(),f=(new Date(y,mo,1).getDay()+6)%7,n=new Date(y,mo+1,0).getDate();
    $('#mt').textContent=m.toLocaleDateString('it-IT',{month:'long',year:'numeric'});
    let h='LMMGVSD'.split('').map(x=>`<b>${x}</b>`).join('')+'<i></i>'.repeat(f);
    for(let i=1;i<=n;i++){const d=`${y}-${String(mo+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`,x=d<today||busy.has(d);
      h+=`<div class="d${x?' x':''}${d===da||d===a?' s':''}${da&&a&&d>da&&d<a?' r':''}" data-d="${d}">${i}<small>${x?'':eur(np(p,d))}</small></div>`}
    $('#cal').innerHTML=h;
    $('#q').textContent=a?`${days(da,a).length} notti · totale ${eur(tot(p,da,a,+$('#osp').value))}`:'Scegli arrivo e partenza. Sotto ogni giorno trovi il prezzo per notte.'};
  $('#pv').onclick=()=>{m.setMonth(m.getMonth()-1);draw()};
  $('#nx').onclick=()=>{m.setMonth(m.getMonth()+1);draw()};
  $('#osp').onchange=draw;
  $('#cal').onclick=e=>{const el=e.target.closest('.d');if(!el)return;const d=el.dataset.d,second=da&&!a&&d>da;
    if(el.classList.contains('x')&&!second)return;
    if(!second){da=d;a='';$('#e').textContent=''}
    else{const g=days(da,d);
      if(g.length<p.min){$('#e').textContent='Soggiorno minimo: '+p.min+' notti';return}
      if(g.some(z=>busy.has(z))){$('#e').textContent='Nel periodo scelto ci sono date occupate';return}
      a=d;$('#e').textContent=''}
    draw()};
  $('#f').onsubmit=async e=>{e.preventDefault();
    if(!a){$('#e').textContent='Scegli le date sul calendario';return}
    const btn=e.target.querySelector('[data-testid="booking-submit"]');
    if(btn.dataset.loading)return;btn.dataset.loading='1';const orig=btn.textContent;btn.disabled=true;btn.classList.add('is-loading');btn.textContent='Reindirizzo al pagamento…';$('#e').textContent='';
    try{const r=await api('checkout',{...Object.fromEntries(new FormData(e.target)),id:p.id,da,a});
      location.href=r.url}
    catch(x){$('#e').textContent=x.message;btn.disabled=false;btn.classList.remove('is-loading');btn.textContent=orig;delete btn.dataset.loading}};
  draw();
}

function clienti(c){
  $('#f').onsubmit=async e=>{e.preventDefault();
    const btn=e.target.querySelector('[data-testid="area-clienti-submit"]');
    if(btn.dataset.loading)return;btn.dataset.loading='1';const orig=btn.textContent;btn.disabled=true;btn.classList.add('is-loading');btn.textContent='Cerco…';
    try{const d=Object.fromEntries(new FormData(e.target));const code=String(d.code||'').trim();
      const r=await api('mie',{code});
      sessionStorage.lc_code=code;
      const totNotti=r.reduce((s,x)=>s+(+x.notti||0),0);
      $('#r').innerHTML=`
      <div class="admin-card"><h2>Ciao 👋</h2><p>Hai <b>${r.length}</b> prenotazion${r.length===1?'e':'i'} — totale <b>${totNotti} notti</b>. Qui trovi i dettagli, puoi generare la tua <b>Trentino Guest Card</b> e fare il <b>check-in online</b>.</p></div>
      <div class="booking-cards" data-testid="mie-cards">${r.map(x=>`
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
            <a class="btn btn-wine" href="guest-card.html?code=${encodeURIComponent(x.code)}" data-testid="gc-link-${esc(x.code)}">Crea Guest Card</a>
            <a class="btn btn-line" href="https://spaceestate.github.io/Checkin/index.html" target="_blank" rel="noopener" data-testid="checkin-link-${esc(x.code)}">Check-in online</a>
            <a class="btn btn-line" href="https://search.google.com/local/writereview?placeid=ChIJmXdr3vNzgkcR3O0jehZOocQ" target="_blank" rel="noopener" data-testid="review-link-${esc(x.code)}">Lascia una recensione</a>
          </div>
        </article>`).join('')}</div>`;
    }
    catch(x){$('#r').innerHTML=`<p class="form-err">${esc(x.message)}</p>`}
    finally{btn.disabled=false;btn.classList.remove('is-loading');btn.textContent=orig;delete btn.dataset.loading}};
  // Link dalla mail di conferma: ?code=XXXX precompila il codice e mostra subito la prenotazione
  const qc=new URLSearchParams(location.search).get('code');
  if(qc){$('#cd').value=qc.trim().toUpperCase();$('#f').requestSubmit()}
}

function admin(c){
  let t=sessionStorage.lc_t||'';
  const M=$('#m'),S=structuredClone(c),today=iso(new Date());
  S.apts.forEach(p=>{p.prices=p.prices||{};p.periodi=p.periodi||[]});S.ical=S.ical||{};S.closed=S.closed||{};
  const months=S.apts.map(()=>{const m=new Date();m.setDate(1);return m});
  const sels=S.apts.map(()=>new Set());
  let busyMap={};
  const nA=id=>esc(short(S.apts.find(p=>p.id===id)||{nome:id}));

  const login=()=>{M.innerHTML=`<div class="auth-card" style="margin:0 auto;max-width:440px" data-testid="admin-login-card"><span class="section-eyebrow">Area riservata</span><h1 style="font-size:2rem;margin-bottom:8px;font-style:italic">Gestione</h1><p class="sub">Accedi per modificare contenuti, foto, prezzi ed eventi.</p><form id="l" data-testid="admin-login-form"><div class="field"><label for="au">Nome utente</label><input id="au" name="u" autocomplete="username" data-testid="admin-user"></div><div class="field"><label for="ap">Password</label><input id="ap" name="p" type="password" autocomplete="current-password" data-testid="admin-pass"></div><button class="btn btn-wine" style="width:100%;justify-content:center" data-testid="admin-login-submit">Accedi</button><p class="form-err" id="e" data-testid="admin-login-error"></p></form></div>`;
    $('#l').onsubmit=async e=>{e.preventDefault();
      try{t=sessionStorage.lc_t=(await api('login',Object.fromEntries(new FormData(e.target)))).t;panel()}
      catch(x){$('#e').textContent=x.message}}};

  // ----- Foto: render + drag & drop -----
  const phRender=i=>{const p=S.apts[i],el=document.querySelector(`[data-pm="${i}"]`);if(!el)return;
    el.innerHTML=p.foto.map((u,j)=>`<div class="pm-item${j===0?' cover':''}" draggable="true" data-pi="${i}" data-j="${j}" data-testid="pm-item-${i}-${j}"><img src="${u}" alt="">${j===0?'<span class="pm-cover-badge">Copertina</span>':''}<span class="pm-handle">↕</span><div class="pm-tools"><button type="button" data-pleft="${j}" title="Sposta a sinistra">‹</button><button type="button" data-pright="${j}" title="Sposta a destra">›</button>${j?`<button type="button" data-pcover="${j}" title="Copertina">★</button>`:''}<button type="button" data-pdel="${j}" title="Rimuovi">✕</button></div></div>`).join('')};
  const move=(i,from,to)=>{const f=S.apts[i].foto;if(to<0||to>=f.length)return;const[x]=f.splice(from,1);f.splice(to,0,x);phRender(i)};

  // ----- Calendario prezzi -----
  const pcalRender=i=>{const p=S.apts[i],m=months[i],el=document.querySelector(`[data-pcal="${i}"]`);if(!el)return;
    const y=m.getFullYear(),mo=m.getMonth(),f=(new Date(y,mo,1).getDay()+6)%7,n=new Date(y,mo+1,0).getDate();
    const busy=busyMap[p.id]||new Set();
    let h=`<div class="pcal-head"><button type="button" class="cal-nav" data-pv="${i}" aria-label="Mese precedente">‹</button><b>${m.toLocaleDateString('it-IT',{month:'long',year:'numeric'})}</b><button type="button" class="cal-nav" data-nx="${i}" aria-label="Mese successivo">›</button></div>`;
    h+=`<div class="pcal-grid">`+'Lun Mar Mer Gio Ven Sab Dom'.split(' ').map(x=>`<b>${x}</b>`).join('')+'<i></i>'.repeat(f);
    for(let d=1;d<=n;d++){const ds=`${y}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const past=ds<today,bs=busy.has(ds),ov=p.prices[ds]!=null,selc=sels[i].has(ds);
      h+=`<div class="pcell${past?' past':''}${bs?' busy':''}${ov?' ov':''}${selc?' sel':''}" data-day="${ds}" data-pi="${i}" data-testid="pcell-${i}-${ds}"><span class="pday">${d}</span>${bs?'<span class="pstate">occupato</span>':`<span class="pprice">${eur(np(p,ds))}</span>`}</div>`}
    h+=`</div><div class="pcal-tools"><div class="field" style="margin:0"><label>Prezzo a notte (€)</label><input type="number" placeholder="es. 200" data-price="${i}"></div><button type="button" class="btn btn-wine" data-apply="${i}">Applica ai ${sels[i].size} giorni</button><button type="button" class="btn btn-line" data-reset="${i}">Ripristina base</button><button type="button" class="btn btn-line" data-selmonth="${i}">Seleziona mese</button><button type="button" class="btn btn-line" data-clearsel="${i}">Deseleziona</button></div><p class="book-note">Seleziona i giorni disponibili e imposta il prezzo. Oro = prezzo personalizzato. I giorni <b>occupati</b> (prenotazioni o iCal Booking/Airbnb) non sono modificabili.</p>`;
    el.innerHTML=h};

  const rs=f=>new Promise(r=>{const im=new Image;im.onload=()=>{const k=Math.min(1,1600/Math.max(im.width,im.height)),cv=document.createElement('canvas');cv.width=im.width*k;cv.height=im.height*k;cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);r(cv.toDataURL('image/jpeg',.82))};im.src=URL.createObjectURL(f)});

  const panel=async()=>{let d;try{d=await api('adm',{},t)}catch(x){return login()}
    const ev=(await get('a=events'))||[];
    busyMap={};S.apts.forEach(p=>busyMap[p.id]=new Set());
    (d.ext||[]).forEach(e=>days(e.da,e.a).forEach(x=>busyMap[e.id]&&busyMap[e.id].add(x)));
    (d.bk||[]).filter(x=>x.stato!=='annullata').forEach(x=>days(x.da,x.a).forEach(z=>busyMap[x.id]&&busyMap[x.id].add(z)));
    M.innerHTML=`<div class="admin-top"><h1>Gestione</h1><button class="btn btn-line" id="out" data-testid="admin-logout">Esci</button></div>
    <div class="admin-card"><h2>Home</h2><div class="field"><label for="achi">Chi siamo</label><textarea id="achi" name="chi" rows="4" data-testid="admin-chi">${esc(S.chi)}</textarea></div></div>
    ${S.apts.map((p,i)=>`<div class="admin-card" data-testid="admin-apt-${p.id}"><h2>Appartamento <span class="n">${esc(short(p))}</span></h2><div data-i="${i}">
      <div class="field"><label>Nome</label><input name="nome" value="${esc(p.nome)}"></div>
      <div class="field"><label>Sottotitolo</label><input name="sotto" value="${esc(p.sotto)}"></div>
      <div class="field"><label>Descrizione</label><textarea name="testo" rows="6">${esc(p.testo)}</textarea></div>
      <div class="fields-grid">
        <div class="field"><label>Prezzo base (€/notte)</label><input name="base" type="number" value="${p.base}"></div>
        <div class="field"><label>Ospiti inclusi</label><input name="inclusi" type="number" value="${p.inclusi}"></div>
        <div class="field"><label>Ospite extra (€/notte)</label><input name="extra" type="number" value="${p.extra}"></div>
        <div class="field"><label>Ospiti massimi</label><input name="max" type="number" value="${p.max}"></div>
        <div class="field"><label>Notti minime</label><input name="min" type="number" value="${p.min}"></div>
      </div>
      <h3>Calendario prezzi</h3><div data-pcal="${i}"></div>
      <h3>Foto</h3><div class="pm-grid" data-pm="${i}"></div>
      <div class="upload-row"><label class="upload-btn">+ Aggiungi foto<input type="file" accept="image/*" multiple class="up" data-up="${i}"></label><span class="admin-msg" id="om${i}"></span></div>
      <div class="field" style="margin-top:14px"><label>Link iCal Booking / Airbnb (separati da virgola — chiudono automaticamente le date)</label><input name="ical" value="${esc(S.ical[p.id]||'')}" placeholder="https://...booking.ics, https://...airbnb.ics" data-testid="admin-ical-${p.id}"></div>
      <div class="field" style="margin-top:14px"><label class="closed-toggle"><input type="checkbox" name="closed" ${S.closed[p.id]?'checked':''} data-testid="admin-closed-${p.id}"> Chiudi appartamento — blocca tutte le prenotazioni dal sito</label></div>
      <div class="field" style="margin-top:8px"><label>Calendario iCal di questo appartamento (inseriscilo su Booking e Airbnb per riservare le date prenotate dal sito)</label><input readonly onclick="this.select()" value="${location.origin}/api/x?a=ical&id=${p.id}" data-testid="admin-ical-export-${p.id}"></div>
    </div></div>`).join('')}
    <div class="admin-card save-bar"><button class="btn btn-wine" id="save" data-testid="admin-save">Salva modifiche</button> <span class="admin-msg" id="o" data-testid="admin-save-msg"></span></div>
    <div class="admin-card"><h2>Prenotazioni dal sito</h2><div class="table-wrap tw-stack" data-testid="admin-bookings"><table class="data stack bk"><thead><tr><th>Codice</th><th>App.</th><th>Dal</th><th>Al</th><th>Ospiti</th><th>Cliente</th><th>Totale</th><th>Stato</th><th></th></tr></thead><tbody>${d.bk.length?d.bk.map(x=>`<tr><td data-label="Codice"><b>${x.code}</b></td><td data-label="App.">${nA(x.id)}</td><td data-label="Dal">${fmtD(x.da)}</td><td data-label="Al">${fmtD(x.a)}</td><td data-label="Ospiti">${x.ospiti}</td><td data-label="Cliente" class="td-cliente">${esc(x.nome)}<br>${esc(x.email)}${x.tel?'<br>'+esc(x.tel):''}</td><td data-label="Totale">${eur(x.totale)}</td><td data-label="Stato"><select class="stato-select" data-code="${x.code}">${['richiesta','in_attesa','confermata','annullata'].map(s=>`<option${s===x.stato?' selected':''}>${s}</option>`).join('')}</select></td><td class="td-azioni"><button class="stato-select btn-del-book" data-bookdel="${x.code}" data-testid="admin-book-del-${x.code}">Rimuovi</button></td></tr>`).join(''):'<tr><td colspan="9" class="td-empty">Nessuna prenotazione per ora.</td></tr>'}</tbody></table></div></div>
    <div class="admin-card" data-testid="admin-gc"><h2>Trentino Guest Card</h2><p class="book-note">Mostra le tipologie di card del tuo account: copia l'ID della tipologia giusta e mettilo su Vercel come <b>TGC_CARD_TYPE_ID</b>.</p><button class="btn btn-line" id="gctip" type="button">Mostra tipologie card</button><pre id="gcout" style="white-space:pre-wrap;word-break:break-word;margin-top:12px;font-size:.85rem"></pre></div>
    <div class="admin-card" data-testid="admin-events"><h2>Eventi a Trento</h2><p class="book-note">Gli eventi principali sono estratti automaticamente. Qui puoi aggiungere eventi speciali che verranno mostrati anch'essi sulla pagina Eventi.</p>
      <form id="evform" class="ev-form">
        <div class="field" style="margin:0"><label>Titolo</label><input name="title" required data-testid="ev-title"></div>
        <div class="field" style="margin:0"><label>Data</label><input name="date" type="date" required data-testid="ev-date"></div>
        <div class="field" style="margin:0"><label>Ora</label><input name="time" placeholder="21:00" data-testid="ev-time"></div>
        <div class="field" style="margin:0"><label>Luogo</label><input name="location" data-testid="ev-loc"></div>
        <button class="btn btn-wine" data-testid="ev-add">+ Aggiungi</button>
      </form>
      <div class="table-wrap tw-stack" style="margin-top:16px"><table class="data stack" data-testid="ev-table"><thead><tr><th>Titolo</th><th>Data</th><th>Ora</th><th>Luogo</th><th></th></tr></thead><tbody id="ev-body">${ev.map(x=>`<tr><td data-label="Titolo"><b>${esc(x.title)}</b></td><td data-label="Data">${esc(x.date)}</td><td data-label="Ora">${esc(x.time||'')}</td><td data-label="Luogo">${esc(x.location||'')}</td><td class="td-azioni"><button class="stato-select" data-del="${x.id}">Elimina</button></td></tr>`).join('')||'<tr><td colspan="5" class="td-empty">Nessun evento manuale.</td></tr>'}</tbody></table></div>
    </div>`;

    $('#out').onclick=()=>{sessionStorage.removeItem('lc_t');t='';login()};
    S.apts.forEach((_,i)=>{pcalRender(i);phRender(i)});

    // ---- Interazioni: calendario prezzi + foto tools ----
    M.addEventListener('click',e=>{
      const T=e.target,ds=T.dataset;
      if(T.closest('[data-pv]')){const i=+T.closest('[data-pv]').dataset.pv;months[i].setMonth(months[i].getMonth()-1);pcalRender(i);return}
      if(T.closest('[data-nx]')){const i=+T.closest('[data-nx]').dataset.nx;months[i].setMonth(months[i].getMonth()+1);pcalRender(i);return}
      const cell=T.closest('.pcell');
      if(cell&&!cell.classList.contains('busy')&&!cell.classList.contains('past')){const i=+cell.dataset.pi,day=cell.dataset.day;sels[i].has(day)?sels[i].delete(day):sels[i].add(day);pcalRender(i);return}
      if(ds.apply!=null){const i=+ds.apply,inp=document.querySelector(`[data-price="${i}"]`),v=inp.value===''?null:+inp.value;if(v==null){inp.focus();return}sels[i].forEach(day=>S.apts[i].prices[day]=v);sels[i].clear();inp.value='';pcalRender(i);return}
      if(ds.reset!=null){const i=+ds.reset;sels[i].forEach(day=>{delete S.apts[i].prices[day]});sels[i].clear();pcalRender(i);return}
      if(ds.selmonth!=null){const i=+ds.selmonth,m=months[i],y=m.getFullYear(),mo=m.getMonth(),n=new Date(y,mo+1,0).getDate();for(let d=1;d<=n;d++){const day=`${y}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;if(day>=today&&!(busyMap[S.apts[i].id]||new Set()).has(day))sels[i].add(day)}pcalRender(i);return}
      if(ds.clearsel!=null){const i=+ds.clearsel;sels[i].clear();pcalRender(i);return}
      // foto tools
      const item=T.closest('.pm-item');
      if(item){const i=+item.dataset.pi;
        if(T.closest('[data-pleft]')){move(i,+T.closest('[data-pleft]').dataset.pleft,+T.closest('[data-pleft]').dataset.pleft-1);return}
        if(T.closest('[data-pright]')){move(i,+T.closest('[data-pright]').dataset.pright,+T.closest('[data-pright]').dataset.pright+1);return}
        if(T.closest('[data-pcover]')){move(i,+T.closest('[data-pcover]').dataset.pcover,0);return}
        if(T.closest('[data-pdel]')){S.apts[i].foto.splice(+T.closest('[data-pdel]').dataset.pdel,1);phRender(i);return}
      }
      if(ds.bookdel){if(confirm('Rimuovere definitivamente questa prenotazione dallo storico?'))api('book_del',{code:ds.bookdel},t).then(panel);return}
      if(ds.del){if(confirm('Eliminare questo evento?'))api('event_del',{id:ds.del},t).then(panel)}
    });

    // ---- Drag & drop foto ----
    let dragI=null,dragFrom=null;
    M.addEventListener('dragstart',e=>{const it=e.target.closest('.pm-item');if(!it)return;dragI=+it.dataset.pi;dragFrom=+it.dataset.j;it.classList.add('dragging')});
    M.addEventListener('dragend',e=>{const it=e.target.closest('.pm-item');it&&it.classList.remove('dragging');document.querySelectorAll('.pm-item.dragover').forEach(x=>x.classList.remove('dragover'))});
    M.addEventListener('dragover',e=>{const it=e.target.closest('.pm-item');if(it&&+it.dataset.pi===dragI){e.preventDefault();it.classList.add('dragover')}});
    M.addEventListener('dragleave',e=>{const it=e.target.closest('.pm-item');it&&it.classList.remove('dragover')});
    M.addEventListener('drop',e=>{const it=e.target.closest('.pm-item');if(!it||+it.dataset.pi!==dragI)return;e.preventDefault();const to=+it.dataset.j;if(dragFrom!=null&&dragFrom!==to)move(dragI,dragFrom,to);dragI=dragFrom=null});

    // ---- Upload foto ----
    M.addEventListener('change',async e=>{
      if(e.target.classList.contains('up')){const i=+e.target.dataset.up,msg=$('#om'+i);
        msg.textContent='Carico le foto…';
        try{for(const f of e.target.files)S.apts[i].foto.push((await api('up',{id:S.apts[i].id,img:await rs(f)},t)).url);
          phRender(i);msg.textContent='Foto caricate. Ricordati di salvare.'}
        catch(x){msg.textContent=x.message}return}
      if(e.target.dataset.code)api('stato',{code:e.target.dataset.code,stato:e.target.value},t);
    });

    // ---- Salva ----
    $('#save').onclick=async()=>{
      S.chi=$('#achi').value;
      document.querySelectorAll('[data-i]').forEach(z=>{const p=S.apts[+z.dataset.i],g=n=>z.querySelector(`[name=${n}]`).value;
        for(const k of['nome','sotto','testo'])p[k]=g(k);
        for(const k of['base','inclusi','extra','max','min'])p[k]=+g(k);
        S.ical[p.id]=g('ical');const ck=z.querySelector('[name=closed]');S.closed[p.id]=!!(ck&&ck.checked)});
      try{await api('save',S,t);$('#o').textContent='Salvato: le modifiche sono già online.';setTimeout(()=>$('#o').textContent='',4000)}
      catch(x){$('#o').textContent=x.message}};

    // ---- Guest Card: elenco tipologie ----
    $('#gctip').onclick=async()=>{const o=$('#gcout');o.textContent='Carico…';try{o.textContent=JSON.stringify(await api('gc_tipologie',{},t),null,2)}catch(x){o.textContent='Errore: '+x.message}};
    // ---- Aggiungi evento ----
    $('#evform').onsubmit=async e=>{e.preventDefault();try{await api('event_add',Object.fromEntries(new FormData(e.target)),t);panel()}catch(x){alert(x.message)}};
  };
  t?panel():login();
}

async function guestcard(c){
  const q=new URLSearchParams(location.search),box=$('#r');
  const renderCard=g=>`<div class="admin-card" data-testid="gc-success"><h2>Richiesta Trentino Guest Card inviata 🎉</h2>${g.gc_id?`<p>Codice: <b>${esc(g.gc_id)}</b></p>`:''}<p>Periodo: <b>${fmtD(g.valid_from)} → ${fmtD(g.valid_to)}</b></p><p>Ospiti coperti: <b>${g.ospiti}</b></p><p class="book-note">Controlla la mail che arriverà a <b>${esc(g.email)}</b>: apri il link per completare l'attivazione — ti verrà chiesto di indicare eventuali bambini nel gruppo, la provenienza, e di creare la password del tuo account Trentino Guest Card. Fatto questo la card sarà pronta sull'app Mio Trentino.</p><a class="btn btn-wine" onclick="window.print()">Stampa</a></div>`;
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
      <button class="btn btn-wine" style="width:100%;justify-content:center" id="gc-go" data-testid="gc-issue">Genera Trentino Guest Card</button>
      <p class="form-err" id="e2"></p>
    </div>`;
    $('#gc-go').onclick=async()=>{
      const btn=$('#gc-go');if(btn.dataset.loading)return;
      const email=x.needsEmail?($('#gc-email').value||'').trim():undefined;
      if(x.needsEmail&&!/.+@.+\..+/.test(email||'')){$('#e2').textContent="Inserisci un'email valida";return}
      btn.dataset.loading='1';btn.disabled=true;const orig=btn.textContent;btn.textContent='Genero…';
      try{const g=await api('gc_issue',{code:x.code,email});box.innerHTML=renderCard(g)}
      catch(err){$('#e2').textContent=err.message;btn.disabled=false;btn.classList.remove('is-loading');btn.textContent=orig;delete btn.dataset.loading}};
  };
  const check=async code=>{
    $('#e').textContent='';box.innerHTML='';
    try{const r=await api('gc_check',{code});
      if(r.card){box.innerHTML=renderCard(r.card);return}
      renderConfirm({...r.booking,code})}
    catch(x){$('#e').textContent=x.message}};
  $('#f').onsubmit=e=>{e.preventDefault();const code=$('#gc-code').value.trim().toUpperCase();if(code)check(code)};
  if(q.get('code')){const code=q.get('code').trim().toUpperCase();$('#gc-code').value=code;check(code)}
}

async function eventi(c){
  const box=$('#events');
  const safeUrl=u=>{u=String(u||'').trim();if(!u)return'';if(/^https?:\/\//i.test(u))return u;if(u[0]==='/')return'https://www.visittrentino.info'+u;return'https://'+u};
  const [feed,manual]=await Promise.all([get('a=events_feed'),get('a=events')]);
  const auto=Array.isArray(feed)?feed:[];
  const man=Array.isArray(manual)?manual:[];
  const today=iso(new Date());
  const all=[...auto,...man].filter(x=>x.date>=today).sort((a,b)=>a.date<b.date?-1:1);
  if(!all.length){box.innerHTML='<p class="book-note">Nessun evento in programma al momento.</p>';return}
  box.innerHTML=all.map(x=>{
    const u=safeUrl(x.url),
    inner=`
      <div class="body">
        <span class="section-kicker">${esc(new Date(x.date+'T00:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long'}))}${x.source?' · '+esc(x.source):''}</span>
        <h3>${esc(x.title)}</h3>
        <div class="meta"><span>${esc(x.time||'da definire')}</span><span>${esc(x.location||'Trento')}</span></div>
        ${u?`<div class="cta"><span class="cta-link">Scopri di più <span aria-hidden="true">→</span></span></div>`:''}
      </div>`;
    return u
      ?`<a class="apt-card ev-card ev-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer" aria-label="Apri la pagina dell'evento: ${esc(x.title)}" data-testid="ev-${esc(x.date)}">${inner}</a>`
      :`<article class="apt-card ev-card" data-testid="ev-${esc(x.date)}">${inner}</article>`}).join('');
}

const P={apt,clienti,admin,guestcard,eventi};
get('a=cfg').then(c=>c||fetch('data/default.json').then(r=>r.json())).then(c=>P[B.p]&&P[B.p](c));
