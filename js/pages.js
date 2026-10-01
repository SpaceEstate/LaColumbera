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
// testo leggibile degli scaglioni: "+10 € dal 2° ospite · +25 € dal 3° · +50 € dal 4°"
const stepsTxt=p=>{const st=(p.extraSteps&&p.extraSteps.length)?p.extraSteps:[+p.extra||0],base=(p.inclusi||1);if(!st.some(v=>+v))return'';const o=[];for(let i=0;i<Math.min(p.max-base,6);i++){const v=+st[Math.min(i,st.length-1)]||0;o.push(`+${eur(v)} ${i?'dal':'dal'} ${base+i+1}° ospite`)}return o.join(' · ')};
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
  $('#note').textContent=`${p.inclusi} ${p.inclusi===1?'ospite incluso':'ospiti inclusi'} nel prezzo${stepsTxt(p)?' · a notte: '+stepsTxt(p):''} · soggiorno minimo ${p.min} notti${(p.minPeriodi||[]).length?' (in alcuni periodi di più)':''}`;
  $('#desc').textContent=p.testo;
  $('#chips').innerHTML=[`fino a ${p.max} ospiti`,p.id==='torre'?'due livelli':'piano terra',`${p.inclusi} ${p.inclusi===1?'ospite incluso':'ospiti inclusi'}`,`minimo ${p.min} notti`,'check-in autonomo'].map(x=>`<span>${esc(x)}</span>`).join('');
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
      const mn=minFor(p,da);if(g.length<mn){$('#e').textContent='Soggiorno minimo per queste date: '+mn+' notti';return}
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
  const renderCard=g=>`<div class="admin-card" data-testid="gc-success"><h2>Richiesta Trentino Guest Card inviata 🎉</h2>${g.gc_id?`<p>Codice: <b>${esc(g.gc_id)}</b></p>`:''}<p>Periodo: <b>${fmtD(g.valid_from)} → ${fmtD(g.valid_to)}</b></p><p>Ospiti coperti: <b>${g.ospiti}</b></p><p class="book-note">Controlla la mail che arriverà a <b>${esc(g.email)}</b>: apri il link per completare l'attivazione — ti verrà chiesto di indicare eventuali bambini nel gruppo, la provenienza, e di creare la password del tuo account Trentino Guest Card. Fatto questo la card sarà pronta sull'app Mio Trentino.</p>${g.gc_id?`<button type="button" class="btn btn-wine" data-copy="${esc(g.gc_id)}" data-testid="gc-copy">Copia codice</button>`:''}</div>`;
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

const P={apt,clienti,guestcard,eventi};
get('a=cfg').then(c=>c||fetch('data/default.json').then(r=>r.json())).then(c=>P[B.p]&&P[B.p](c));
