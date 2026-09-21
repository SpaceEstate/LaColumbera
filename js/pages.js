// La Columbera · pagine appartamento, area clienti, gestione
const $=s=>document.querySelector(s),B=document.body.dataset;
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const eur=n=>'€'+Math.round(n);
const api=(a,b,t)=>fetch('api/x?a='+a,{method:'POST',headers:{'Content-Type':'application/json',Authorization:t||''},body:JSON.stringify(b||{})}).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.err||'Servizio non disponibile su questa versione del sito');return j});
const get=q=>fetch('api/x?'+q).then(r=>r.ok?r.json():null).catch(()=>null);
const iso=d=>d.toISOString().slice(0,10);
const days=(da,a)=>{const o=[];for(let d=new Date(da);d<new Date(a);d.setUTCDate(d.getUTCDate()+1))o.push(iso(d));return o};
const np=(p,d)=>{const x=(p.periodi||[]).find(q=>d>=q.da&&d<=q.a);return+(x?x.prezzo:p.base)};
const tot=(p,da,a,n)=>days(da,a).reduce((s,d)=>s+np(p,d)+Math.max(0,n-p.inclusi)*p.extra,0);
const fmtD=s=>new Date(s+'T00:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'});
const short=p=>p.nome.replace('La Columbera ','');
const nomeA=(c,id)=>esc(short(c.apts.find(p=>p.id===id)||{nome:id}));

async function apt(c){
  const p=c.apts.find(x=>x.id===B.id);if(!p)return;
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

  // galleria
  let cur=0;
  const gm=$('#gm');gm.src=p.foto[0]||'';
  const drawTh=()=>{$('#th').innerHTML=p.foto.map((u,i)=>`<button type="button" class="${i===cur?'on':''}" data-i="${i}" aria-label="Mostra foto ${i+1}"><img src="${u}" alt="" loading="lazy"></button>`).join('')};
  drawTh();
  $('#th').onclick=e=>{const b=e.target.closest('button');if(!b)return;cur=+b.dataset.i;gm.src=p.foto[cur];drawTh()};

  // disponibilità e prenotazione
  const box=$('#bk'),bz=await get('a=busy&id='+p.id);
  if(!bz){
    box.innerHTML=`<div class="offline-note" data-testid="booking-offline"><h3>Disponibilità e prenotazioni</h3><p>La prenotazione online non è attiva in questo momento. Scrivici per verificare la disponibilità: <a href="mailto:info@lacolumbera.it">info@lacolumbera.it</a></p></div>`;
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
    <button class="btn btn-wine" style="width:100%;justify-content:center" data-testid="booking-submit">Richiedi prenotazione</button>
    <p class="form-err" id="e" data-testid="booking-error"></p>
  </form>`;
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
    try{const r=await api('book',{...Object.fromEntries(new FormData(e.target)),id:p.id,da,a});
      box.innerHTML=`<div class="form-ok" data-testid="booking-success"><h3>Richiesta inviata</h3><p>Il tuo codice prenotazione è <b>${r.code}</b> (totale ${eur(r.totale)}). Conservalo: insieme alla tua email ti serve per consultare la prenotazione nell'<a href="area-clienti.html">area personale</a>.</p></div>`}
    catch(x){$('#e').textContent=x.message}};
  draw();
}

function clienti(c){
  $('#f').onsubmit=async e=>{e.preventDefault();
    try{const r=await api('mie',Object.fromEntries(new FormData(e.target)));
      $('#r').innerHTML='<div class="table-wrap"><table class="data"><thead><tr><th>Codice</th><th>Appartamento</th><th>Dal</th><th>Al</th><th>Ospiti</th><th>Totale</th><th>Stato</th></tr></thead><tbody>'
        +r.map(x=>`<tr><td><b>${x.code}</b></td><td>${nomeA(c,x.id)}</td><td>${fmtD(x.da)}</td><td>${fmtD(x.a)}</td><td>${x.ospiti}</td><td>${eur(x.totale)}</td><td><span class="stato ${x.stato}">${x.stato}</span></td></tr>`).join('')
        +'</tbody></table></div>'}
    catch(x){$('#r').innerHTML=`<p class="form-err">${esc(x.message)}</p>`}};
}

function admin(c){
  let t=sessionStorage.lc_t||'';
  const M=$('#m'),S=structuredClone(c),today=iso(new Date());
  const nA=id=>esc(short(S.apts.find(p=>p.id===id)||{nome:id}));
  const login=()=>{M.innerHTML=`<div class="auth-card" style="margin:0 auto;max-width:440px" data-testid="admin-login-card"><span class="section-eyebrow">Area riservata</span><h1 style="font-size:2rem;margin-bottom:8px;font-style:italic">Gestione</h1><p class="sub">Accedi per modificare contenuti, foto, prezzi e prenotazioni.</p><form id="l" data-testid="admin-login-form"><div class="field"><label for="au">Nome utente</label><input id="au" name="u" autocomplete="username" data-testid="admin-user"></div><div class="field"><label for="ap">Password</label><input id="ap" name="p" type="password" autocomplete="current-password" data-testid="admin-pass"></div><button class="btn btn-wine" style="width:100%;justify-content:center" data-testid="admin-login-submit">Accedi</button><p class="form-err" id="e" data-testid="admin-login-error"></p></form></div>`;
    $('#l').onsubmit=async e=>{e.preventDefault();
      try{t=sessionStorage.lc_t=(await api('login',Object.fromEntries(new FormData(e.target)))).t;panel()}
      catch(x){$('#e').textContent=x.message}}};
  const ph=i=>{document.querySelector(`[data-i="${i}"] .photo-grid`).innerHTML=S.apts[i].foto.map((u,j)=>`<div class="ph${j===0?' cover':''}"><img src="${u}" alt=""><div class="ph-tools">${j?`<button type="button" title="Imposta come copertina" data-c="${j}">★</button>`:''}<button type="button" title="Rimuovi foto" data-x="${j}">✕</button></div></div>`).join('')};
  const rs=f=>new Promise(r=>{const im=new Image;im.onload=()=>{const k=Math.min(1,1600/Math.max(im.width,im.height)),cv=document.createElement('canvas');cv.width=im.width*k;cv.height=im.height*k;cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);r(cv.toDataURL('image/jpeg',.82))};im.src=URL.createObjectURL(f)});
  const panel=async()=>{let d;try{d=await api('adm',{},t)}catch(x){return login()}
    M.innerHTML=`<div class="admin-top"><h1>Gestione</h1><button class="btn btn-line" id="out" data-testid="admin-logout">Esci</button></div>
    <form id="s" data-testid="admin-save-form">
      <div class="admin-card"><h2>Home</h2><div class="field"><label for="achi">Chi siamo</label><textarea id="achi" name="chi" rows="4" data-testid="admin-chi">${esc(S.chi)}</textarea></div></div>
      ${S.apts.map((p,i)=>`<div class="admin-card" data-testid="admin-apt-${p.id}"><h2>Appartamento <span class="n">${esc(short(p))}</span></h2><div data-i="${i}">
        <div class="field"><label>Nome</label><input name="nome" value="${esc(p.nome)}"></div>
        <div class="field"><label>Sottotitolo</label><input name="sotto" value="${esc(p.sotto)}"></div>
        <div class="field"><label>Descrizione</label><textarea name="testo" rows="6">${esc(p.testo)}</textarea></div>
        <div class="fields-grid">
          <div class="field"><label>Prezzo a notte (€)</label><input name="base" type="number" value="${p.base}"></div>
          <div class="field"><label>Ospiti inclusi</label><input name="inclusi" type="number" value="${p.inclusi}"></div>
          <div class="field"><label>Ospite extra (€/notte)</label><input name="extra" type="number" value="${p.extra}"></div>
          <div class="field"><label>Ospiti massimi</label><input name="max" type="number" value="${p.max}"></div>
          <div class="field"><label>Notti minime</label><input name="min" type="number" value="${p.min}"></div>
        </div>
        <div class="field"><label>Prezzi per periodo — una riga per periodo: primo giorno, ultimo giorno, prezzo (es. 2026-12-20 2027-01-06 200)</label><textarea name="periodi" rows="3">${(p.periodi||[]).map(q=>q.da+' '+q.a+' '+q.prezzo).join('\n')}</textarea></div>
        <div class="field"><label>Foto (bordata in oro = copertina)</label><div class="photo-grid"></div>
          <div class="upload-row"><label class="upload-btn">+ Aggiungi foto<input type="file" accept="image/*" multiple class="up"></label><span class="admin-msg" id="om${i}"></span></div></div>
      </div></div>`).join('')}
      <div class="admin-card"><button class="btn btn-wine" data-testid="admin-save">Salva modifiche</button> <span class="admin-msg" id="o" data-testid="admin-save-msg"></span></div>
    </form>
    <div class="admin-card"><h2>Prenotazioni dal sito</h2><div class="table-wrap" data-testid="admin-bookings"><table class="data"><thead><tr><th>Codice</th><th>Appartamento</th><th>Dal</th><th>Al</th><th>Ospiti</th><th>Cliente</th><th>Totale</th><th>Stato</th></tr></thead><tbody>${d.bk.length?d.bk.map(x=>`<tr><td><b>${x.code}</b></td><td>${nA(x.id)}</td><td>${fmtD(x.da)}</td><td>${fmtD(x.a)}</td><td>${x.ospiti}</td><td>${esc(x.nome)}<br>${esc(x.email)} ${esc(x.tel)}</td><td>${eur(x.totale)}</td><td><select class="stato-select" data-code="${x.code}">${['richiesta','confermata','annullata'].map(s=>`<option${s===x.stato?' selected':''}>${s}</option>`).join('')}</select></td></tr>`).join(''):'<tr><td colspan="8">Nessuna prenotazione per ora.</td></tr>'}</tbody></table></div></div>
    <div class="admin-card"><h2>Occupazioni da Booking e Airbnb</h2><div class="table-wrap" data-testid="admin-external"><table class="data"><thead><tr><th>Appartamento</th><th>Dal</th><th>Al</th><th>Fonte</th></tr></thead><tbody>${(()=>{const f=d.ext.filter(x=>x.a>=today).sort((x,y)=>x.da<y.da?-1:1);return f.length?f.map(x=>`<tr><td>${nA(x.id)}</td><td>${fmtD(x.da)}</td><td>${fmtD(x.a)}</td><td>${x.src}</td></tr>`).join(''):'<tr><td colspan="4">Nessuna occupazione esterna futura.</td></tr>'})()}</tbody></table></div></div>`;
    $('#out').onclick=()=>{sessionStorage.removeItem('lc_t');t='';login()};
    S.apts.forEach((_,i)=>ph(i));
    const s=$('#s');
    s.onclick=e=>{const z=e.target.closest('[data-i]');if(!z)return;const i=+z.dataset.i,f=S.apts[i]?.foto,D=e.target.dataset;
      if(!f)return;
      if(D.x)f.splice(+D.x,1);else if(D.c)f.unshift(...f.splice(+D.c,1));else return;
      ph(i)};
    s.onchange=async e=>{if(!e.target.classList.contains('up'))return;
      const i=+e.target.closest('[data-i]').dataset.i,msg=$('#om'+i);
      msg.textContent='Carico le foto…';
      try{for(const f of e.target.files)S.apts[i].foto.push((await api('up',{id:S.apts[i].id,img:await rs(f)},t)).url);
        ph(i);msg.textContent='Foto caricate. Salva per pubblicarle.'}
      catch(x){msg.textContent=x.message}};
    s.onsubmit=async e=>{e.preventDefault();
      S.chi=s.chi.value;
      document.querySelectorAll('[data-i]').forEach(z=>{const p=S.apts[+z.dataset.i],g=n=>z.querySelector(`[name=${n}]`).value;
        for(const k of['nome','sotto','testo'])p[k]=g(k);
        for(const k of['base','inclusi','extra','max','min'])p[k]=+g(k);
        p.periodi=g('periodi').split('\n').map(l=>l.trim().split(/\s+/)).filter(x=>x.length===3).map(([da,a,prezzo])=>({da,a,prezzo:+prezzo}))});
      try{await api('save',S,t);$('#o').textContent='Salvato: le modifiche sono già online.'}
      catch(x){$('#o').textContent=x.message}};
    M.onchange=e=>{if(e.target.dataset.code)api('stato',{code:e.target.dataset.code,stato:e.target.value},t)};
  };
  t?panel():login();
}

const P={apt,clienti,admin};
get('a=cfg').then(c=>c||fetch('data/default.json').then(r=>r.json())).then(c=>P[B.p]&&P[B.p](c));
