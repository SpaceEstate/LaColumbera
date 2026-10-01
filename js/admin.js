// La Columbera · Pannello di gestione
// Sezioni: Panoramica · Appartamenti (Testi, Foto, Prezzi, Disponibilità, Calendari) · Prenotazioni · Guest Card · Eventi · Home
// Tutto quello che modifichi resta in memoria finché non premi "Salva modifiche" (barra in basso).
(function(){
'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today=ymd(new Date());
const eur=n=>{n=+n||0;return '€'+(Number.isInteger(n)?n:n.toFixed(2).replace('.',','))};
const addDays=(s,n)=>{const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const days=(da,a)=>{const o=[];for(let d=da;d<a&&o.length<800;d=addDays(d,1))o.push(d);return o};
const rangeIncl=(a,b)=>{const o=[];for(let d=a;d<=b&&o.length<800;d=addDays(d,1))o.push(d);return o};
const fmtD=s=>s?new Date(s+'T00:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'}):'';
const fmtS=s=>new Date(s+'T00:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short'});
const short=p=>String(p.nome||p.id).replace('La Columbera ','');
const api=(a,b,t)=>fetch('api/x?a='+a,{method:'POST',headers:{'Content-Type':'application/json',Authorization:t||''},body:JSON.stringify(b||{})}).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok){const e=Error(j.err||'Servizio non disponibile');e.status=r.status;throw e}return j});
const get=q=>fetch('api/x?'+q).then(r=>r.ok?r.json():null).catch(()=>null);

// prezzi: stesse regole del sito
const np=(p,d)=>{if(p.prices&&p.prices[d]!=null)return +p.prices[d];const x=(p.periodi||[]).find(q=>q.da&&q.a&&d>=q.da&&d<=q.a);return+(x?x.prezzo:p.base)};
const sup=(p,n)=>{const k=Math.max(0,n-(p.inclusi||1)),st=(p.extraSteps&&p.extraSteps.length)?p.extraSteps:[0];let s=0;for(let i=0;i<k;i++)s+=+st[Math.min(i,st.length-1)]||0;return s};

const M=$('#m');
let t=sessionStorage.lc_t||'',S=null,D={bk:[],ext:[]},EV=[],GC=[],BUSY={},dirty=false;
const V={month:{},sel:{},anchor:{},bkf:'tutte'};
const idx=id=>S.apts.findIndex(p=>p.id===id);
const aptById=id=>S.apts.find(p=>p.id===id);
const route=()=>{const[s,sub]=(location.hash||'#panoramica').slice(1).split('/');return{s:s||'panoramica',sub:sub||''}};

const norm=()=>{S.ical=S.ical||{};S.closed=S.closed||{};S.chi=S.chi||'';
  S.apts.forEach(p=>{p.prices=p.prices||{};p.periodi=p.periodi||[];p.blocked=p.blocked||{};p.minPeriodi=p.minPeriodi||[];p.foto=p.foto||[];p.inclusi=p.inclusi||1;
    if(!Array.isArray(p.extraSteps)||!p.extraSteps.length)p.extraSteps=(+p.extra>0)?[+p.extra]:[0]})};
const buildBusy=()=>{BUSY={};S.apts.forEach(p=>BUSY[p.id]=new Set());
  (D.ext||[]).forEach(e=>days(e.da,e.a).forEach(x=>BUSY[e.id]&&BUSY[e.id].add(x)));
  (D.bk||[]).filter(x=>x.stato!=='annullata').forEach(x=>days(x.da,x.a).forEach(z=>BUSY[x.id]&&BUSY[x.id].add(z)))};
const markDirty=()=>{dirty=true;const o=$('#o');if(o){o.textContent='Modifiche non salvate';o.className='admin-msg warn'}};
const pending=()=>D.bk.filter(x=>['richiesta','in_attesa'].includes(x.stato));

// ---------- Accesso ----------
function login(){
  M.innerHTML=`<div class="auth-card" style="margin:0 auto;max-width:440px" data-testid="admin-login-card"><span class="section-eyebrow">Area riservata</span><h1 style="font-size:2rem;margin-bottom:8px;font-style:italic">Gestione</h1><p class="sub">Accedi per gestire appartamenti, prezzi, disponibilità, prenotazioni e Guest Card.</p><form id="l" data-testid="admin-login-form"><div class="field"><label for="au">Nome utente</label><input id="au" name="u" autocomplete="username" data-testid="admin-user"></div><div class="field"><label for="ap">Password</label><input id="ap" name="p" type="password" autocomplete="current-password" data-testid="admin-pass"></div><button class="btn btn-wine" style="width:100%;justify-content:center" data-testid="admin-login-submit">Accedi</button><p class="form-err" id="e" data-testid="admin-login-error"></p></form></div>`;
  $('#l').onsubmit=async e=>{e.preventDefault();
    try{t=sessionStorage.lc_t=(await api('login',Object.fromEntries(new FormData(e.target)))).t;start()}
    catch(x){$('#e').textContent=x.message}}}

async function start(){
  try{D=await api('adm',{},t)}catch(x){if(x.status===401||x.status===undefined){sessionStorage.removeItem('lc_t');t='';return login()}return login()}
  const[c,ev,gc]=await Promise.all([get('a=cfg'),get('a=events'),api('gc_manual_list',{},t).catch(()=>[])]);
  S=structuredClone(c||await fetch('data/default.json').then(r=>r.json()));EV=ev||[];GC=gc||[];
  norm();buildBusy();shell();body()}
const refreshAdm=async()=>{try{D=await api('adm',{},t);buildBusy()}catch{}};

function shell(){
  M.innerHTML=`<div class="admin-top"><h1>Gestione</h1><div class="adm-top-actions"><a class="btn btn-line" href="index.html" target="_blank" rel="noopener">Vedi il sito ↗</a><button class="btn btn-line" id="out" data-testid="admin-logout">Esci</button></div></div>
  <div class="adm-shell"><nav class="adm-nav" id="adm-nav" aria-label="Sezioni della gestione"></nav><section class="adm-body" id="adm-body"></section></div>
  <div class="admin-card save-bar"><button class="btn btn-wine" id="save" data-testid="admin-save">Salva modifiche</button> <span class="admin-msg" id="o" data-testid="admin-save-msg"></span></div>`}

function nav(){
  const r=route(),n=pending().length;
  const L=(h,label,extra='')=>`<a href="#${h}" class="${r.s===h?'on':''}">${label}${extra}</a>`;
  $('#adm-nav').innerHTML=L('panoramica','Panoramica')
    +'<div class="grp">Appartamenti</div>'+S.apts.map(p=>L(p.id,esc(short(p)))).join('')
    +'<div class="grp">Gestione</div>'+L('prenotazioni','Prenotazioni',n?`<span class="adm-badge">${n}</span>`:'')+L('guestcard','Guest Card')+L('eventi','Eventi')+L('home','Home · Chi siamo')}

function body(){
  const r=route(),p=aptById(r.s),el=$('#adm-body');if(!el)return;
  if(p){const sub=['testi','foto','prezzi','disponibilita','calendari'].includes(r.sub)?r.sub:'testi';el.innerHTML=aptView(p,sub);aptAfter(p,sub)}
  else el.innerHTML=({panoramica:vPano,home:vHome,prenotazioni:vBook,guestcard:vGc,eventi:vEv}[r.s]||vPano)();
  nav()}

// ---------- Panoramica ----------
function vPano(){
  const pend=pending();
  const arr=[...D.bk.filter(x=>x.stato==='confermata').map(x=>({id:x.id,da:x.da,a:x.a,chi:x.nome,osp:x.ospiti,src:'Sito'})),
    ...(D.ext||[]).map(e=>({id:e.id,da:e.da,a:e.a,chi:'',osp:'',src:e.src||'Esterno'}))]
    .filter(x=>x.a>=today).sort((x,y)=>x.da<y.da?-1:x.da>y.da?1:0).slice(0,10);
  const nx=arr[0];
  const cards=S.apts.map(p=>{const nb=Object.keys(p.blocked).filter(d=>p.blocked[d]&&d>=today).length;
    return `<div class="adm-stat"><span>${esc(short(p))}</span><b>${S.closed[p.id]?'Chiuso':'Aperto'}</b><small>da ${eur(p.base)}/notte · ${nb} ${nb===1?'notte bloccata':'notti bloccate'}</small><a href="#${p.id}">Gestisci →</a></div>`}).join('');
  return `<div class="admin-card"><h2>Panoramica</h2>
  <div class="adm-stats">
   <div class="adm-stat"><span>Da gestire</span><b>${pend.length}</b><small>prenotazioni in attesa o richieste</small><a href="#prenotazioni">Apri →</a></div>
   <div class="adm-stat"><span>Prossimo arrivo</span><b>${nx?fmtS(nx.da):'—'}</b><small>${nx?esc(short(aptById(nx.id)||{nome:nx.id}))+' · '+esc(nx.src):'nessuno in programma'}</small></div>
   ${cards}</div>
  <h3>Prossimi arrivi</h3>
  <div class="table-wrap tw-stack"><table class="data stack"><thead><tr><th>Appartamento</th><th>Dal</th><th>Al</th><th>Ospite</th><th>Origine</th></tr></thead><tbody>${arr.length?arr.map(x=>`<tr><td data-label="Appartamento">${esc(short(aptById(x.id)||{nome:x.id}))}</td><td data-label="Dal">${fmtD(x.da)}</td><td data-label="Al">${fmtD(x.a)}</td><td data-label="Ospite">${esc(x.chi||'—')}${x.osp?' · '+x.osp+' osp.':''}</td><td data-label="Origine">${esc(x.src)}</td></tr>`).join(''):'<tr><td colspan="5" class="td-empty">Nessun arrivo in programma.</td></tr>'}</tbody></table></div>
  <h3>Azioni rapide</h3>
  <div class="adm-quick">${S.apts.map(p=>`<a class="btn btn-line" href="#${p.id}/disponibilita">Blocca date · ${esc(short(p))}</a><a class="btn btn-line" href="#${p.id}/prezzi">Prezzi · ${esc(short(p))}</a>`).join('')}<a class="btn btn-wine" href="#guestcard">Emetti Guest Card</a></div></div>`}

// ---------- Home ----------
function vHome(){return `<div class="admin-card"><h2>Home · Chi siamo</h2><div class="field"><label for="achi">Testo della sezione «Chi siamo»</label><textarea id="achi" rows="8" data-b="c:chi" data-testid="admin-chi">${esc(S.chi)}</textarea></div></div>`}

// ---------- Appartamento ----------
function aptView(p,sub){
  const tabs=[['testi','Testi'],['foto','Foto'],['prezzi','Prezzi'],['disponibilita','Disponibilità'],['calendari','Calendari iCal']];
  const i=idx(p.id),f={testi:sTesti,foto:sFoto,prezzi:sPrezzi,disponibilita:sDisp,calendari:sCal}[sub];
  return `<div class="admin-card" data-testid="admin-apt-${p.id}"><div class="adm-head"><h2>Appartamento <span class="n">${esc(short(p))}</span></h2><a class="btn btn-line" href="${p.id}.html" target="_blank" rel="noopener">Anteprima ↗</a></div>
  <div class="adm-tabs">${tabs.map(([k,l])=>`<a href="#${p.id}/${k}" class="${k===sub?'on':''}">${l}</a>`).join('')}</div>${f(p,i)}</div>`}
function aptAfter(p,sub){const i=idx(p.id);
  if(sub==='foto')phRender(i);
  if(sub==='prezzi'){stepsRender(i);prevRender(i);perRender(i);calRender(i)}
  if(sub==='disponibilita'){minRender(i);chipsRender(i);calRender(i);brRender(i)}}

const sTesti=(p,i)=>`<div class="field"><label>Nome</label><input data-b="a:${i}:nome" value="${esc(p.nome)}"></div>
  <div class="field"><label>Sottotitolo</label><input data-b="a:${i}:sotto" value="${esc(p.sotto)}"></div>
  <div class="field"><label>Descrizione</label><textarea rows="10" data-b="a:${i}:testo">${esc(p.testo)}</textarea></div>
  <div class="fields-grid"><div class="field"><label>Ospiti massimi</label><input type="number" min="1" data-b="a:${i}:max" value="${p.max}"></div></div>`;

const sFoto=(p,i)=>`<p class="book-note">Trascina le foto per cambiare l'ordine oppure usa le frecce. La <b>prima</b> è la copertina (★ per usarne un'altra). Le foto vengono ridimensionate automaticamente.</p>
  <div class="pm-grid" id="pm-${i}"></div>
  <div class="upload-row"><label class="upload-btn">+ Aggiungi foto<input type="file" accept="image/*" multiple class="up" data-i="${i}"></label><span class="admin-msg" id="om${i}"></span></div>`;

const sPrezzi=(p,i)=>`<h3>Prezzo base</h3>
  <div class="fields-grid"><div class="field"><label>Prezzo a notte (€)</label><input type="number" min="0" data-b="a:${i}:base" value="${p.base}"></div>
  <div class="field"><label>Ospiti inclusi nel prezzo</label><input type="number" min="1" data-b="a:${i}:inclusi" value="${p.inclusi}"></div></div>
  <h3>Supplemento per ospiti extra (a notte)</h3>
  <p class="book-note">Ogni ospite oltre quelli inclusi aggiunge un importo a notte, diverso per ciascun ospite. Esempio: 1 ospite incluso e scaglioni +10 · +25 · +50 → 2 ospiti €110, 3 ospiti €135, 4 ospiti €185 (a notte, sul prezzo base di €100). L'ultimo importo vale anche per gli ospiti successivi.</p>
  <div id="steps-${i}"></div>
  <button type="button" class="btn btn-line" data-act="stepAdd" data-i="${i}">+ Aggiungi scaglione</button>
  <div id="prev-${i}" class="adm-prev"></div>
  <h3>Prezzi per periodo (stagioni)</h3>
  <p class="book-note">Un prezzo base diverso per un intervallo di date (es. estate, Natale). I prezzi impostati sulle singole notti hanno la precedenza.</p>
  <div id="per-${i}"></div>
  <button type="button" class="btn btn-line" data-act="perAdd" data-i="${i}">+ Aggiungi periodo</button>
  <h3>Prezzo per singola notte</h3>${calTools(i,'price')}<div id="cal-${i}"></div>`;

const sDisp=(p,i)=>`<div class="field"><label class="closed-toggle"><input type="checkbox" data-b="closed:${p.id}" ${S.closed[p.id]?'checked':''} data-testid="admin-closed-${p.id}"> Chiudi appartamento — blocca tutte le prenotazioni dal sito</label></div>
  <h3>Notti minime</h3>
  <div class="fields-grid"><div class="field"><label>Minimo generale (notti)</label><input type="number" min="1" data-b="a:${i}:min" value="${p.min}"></div></div>
  <p class="book-note">Puoi fissare un minimo diverso per un periodo (es. 5 notti a Natale). Vale la regola del periodo in cui cade la <b>data di arrivo</b>.</p>
  <div id="minper-${i}"></div>
  <button type="button" class="btn btn-line" data-act="minAdd" data-i="${i}">+ Aggiungi periodo</button>
  <h3>Blocca date</h3>
  <p class="book-note">Le notti bloccate risultano non prenotabili sul sito e vengono segnalate anche ad Airbnb e Booking tramite il calendario iCal.</p>
  <div class="adm-chips" id="chips-${i}"></div>
  ${calTools(i,'avail')}<div id="cal-${i}"></div>
  <h4 class="adm-h4">Notti bloccate</h4><div id="br-${i}" class="adm-ranges"></div>`;

const sCal=(p,i)=>`<div class="field"><label>Link iCal Booking / Airbnb (separati da virgola — chiudono automaticamente le date)</label><input data-b="ical:${p.id}" value="${esc(S.ical[p.id]||'')}" placeholder="https://...booking.ics, https://...airbnb.ics" data-testid="admin-ical-${p.id}"></div>
  <div class="field"><label>Calendario iCal di questo appartamento (inseriscilo su Booking e Airbnb per riservare le date prenotate dal sito e le notti bloccate qui)</label><div class="adm-copy"><input readonly onclick="this.select()" value="${location.origin}/api/x?a=ical&id=${p.id}" data-testid="admin-ical-export-${p.id}"><button type="button" class="btn btn-line" data-act="copy" data-v="${location.origin}/api/x?a=ical&id=${p.id}">Copia</button></div></div>`;

// --- scaglioni ospiti ---
function stepsRender(i){const p=S.apts[i],el=$('#steps-'+i);if(!el)return;
  el.innerHTML=`<div class="adm-rows">${p.extraSteps.map((v,j)=>`<div class="adm-row"><span>Dal <b>${p.inclusi+j+1}° ospite</b>${j===p.extraSteps.length-1&&p.max>p.inclusi+j+1?' in poi':''}</span><div class="adm-inp"><span>+ €</span><input type="number" min="0" data-step="${i}:${j}" value="${v}" aria-label="Supplemento a notte"></div>${p.extraSteps.length>1?`<button type="button" class="stato-select" data-act="stepDel" data-i="${i}" data-j="${j}" aria-label="Rimuovi">✕</button>`:''}</div>`).join('')}</div>`}
function prevRender(i){const p=S.apts[i],el=$('#prev-'+i);if(!el)return;
  const o=[];for(let n=1;n<=Math.max(1,p.max);n++)o.push(`<span><b>${n} ${n===1?'ospite':'ospiti'}</b> ${eur((+p.base||0)+sup(p,n))}<small>/notte</small></span>`);
  el.innerHTML='<div class="adm-prev-t">Anteprima prezzo a notte (sul prezzo base)</div><div class="adm-prev-r">'+o.join('')+'</div>'}

// --- periodi (stagioni) ---
function perRender(i){const p=S.apts[i],el=$('#per-'+i);if(!el)return;
  el.innerHTML=p.periodi.length?`<div class="adm-rows">${p.periodi.map((q,j)=>`<div class="adm-row"><div class="adm-inp"><span>Dal</span><input type="date" data-per="${i}:${j}:da" value="${esc(q.da)}"></div><div class="adm-inp"><span>al</span><input type="date" data-per="${i}:${j}:a" value="${esc(q.a)}"></div><div class="adm-inp"><span>€</span><input type="number" min="0" data-per="${i}:${j}:prezzo" value="${q.prezzo}" style="max-width:110px"></div><button type="button" class="stato-select" data-act="perDel" data-i="${i}" data-j="${j}" aria-label="Rimuovi">✕</button></div>`).join('')}</div>`:'<p class="book-note">Nessun periodo: vale sempre il prezzo base.</p>'}

// --- minimo notti per periodo ---
function minRender(i){const p=S.apts[i],el=$('#minper-'+i);if(!el)return;
  el.innerHTML=p.minPeriodi.length?`<div class="adm-rows">${p.minPeriodi.map((q,j)=>`<div class="adm-row"><div class="adm-inp"><span>Arrivo dal</span><input type="date" data-mp="${i}:${j}:da" value="${esc(q.da)}"></div><div class="adm-inp"><span>al</span><input type="date" data-mp="${i}:${j}:a" value="${esc(q.a)}"></div><div class="adm-inp"><span>minimo</span><input type="number" min="1" data-mp="${i}:${j}:min" value="${q.min}" style="max-width:90px"><span>notti</span></div><button type="button" class="stato-select" data-act="minDel" data-i="${i}" data-j="${j}" aria-label="Rimuovi">✕</button></div>`).join('')}</div>`:'<p class="book-note">Nessun periodo particolare: vale il minimo generale.</p>'}

// --- foto ---
function phRender(i){const p=S.apts[i],el=$('#pm-'+i);if(!el)return;
  el.innerHTML=p.foto.length?p.foto.map((u,j)=>`<div class="pm-item${j===0?' cover':''}" draggable="true" data-i="${i}" data-j="${j}" data-testid="pm-item-${i}-${j}"><img src="${esc(u)}" alt=""><span class="pm-num">${j+1}</span>${j===0?'<span class="pm-cover-badge">Copertina</span>':''}<div class="pm-tools"><button type="button" data-act="phL" data-i="${i}" data-j="${j}" title="Sposta a sinistra">‹</button><button type="button" data-act="phR" data-i="${i}" data-j="${j}" title="Sposta a destra">›</button>${j?`<button type="button" data-act="phC" data-i="${i}" data-j="${j}" title="Usa come copertina">★</button>`:''}<button type="button" data-act="phD" data-i="${i}" data-j="${j}" title="Rimuovi">✕</button></div></div>`).join(''):'<p class="book-note">Nessuna foto: aggiungine qualcuna.</p>'}
const movePh=(i,from,to)=>{const f=S.apts[i].foto;if(to<0||to>=f.length||from===to)return;const[x]=f.splice(from,1);f.splice(to,0,x);markDirty();phRender(i)};
const resize=f=>new Promise((res,rej)=>{const im=new Image;im.onload=()=>{const k=Math.min(1,1600/Math.max(im.width,im.height)),cv=document.createElement('canvas');cv.width=im.width*k;cv.height=im.height*k;cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);res(cv.toDataURL('image/jpeg',.82))};im.onerror=()=>rej(Error('Immagine non leggibile'));im.src=URL.createObjectURL(f)});

// --- calendario (prezzi / disponibilità) ---
const calTools=(i,mode)=>`<div class="pcal-sel"><div class="adm-inp"><span>Intervallo dal</span><input type="date" id="rf-${i}" min="${today}"></div><div class="adm-inp"><span>al</span><input type="date" id="rt-${i}" min="${today}"></div><button type="button" class="btn btn-line" data-act="selRange" data-i="${i}">Aggiungi alla selezione</button><button type="button" class="btn btn-line" data-act="selMonth" data-i="${i}">Seleziona mese</button><button type="button" class="btn btn-line" data-act="selClear" data-i="${i}">Deseleziona</button></div>
  <div class="pcal-tools">${mode==='price'
   ?`<div class="field" style="margin:0"><label>Prezzo a notte (€)</label><input type="number" min="0" id="pv-${i}" placeholder="es. 200"></div><button type="button" class="btn btn-wine" data-act="applyPrice" data-i="${i}">Applica a <span data-selcount="${i}">0</span> giorni</button><button type="button" class="btn btn-line" data-act="resetPrice" data-i="${i}">Ripristina prezzo base</button>`
   :`<button type="button" class="btn btn-wine" data-act="block" data-i="${i}">Blocca <span data-selcount="${i}">0</span> notti</button><button type="button" class="btn btn-line" data-act="unblock" data-i="${i}">Sblocca</button>`}</div>`;
function calRender(i){const p=S.apts[i],el=$('#cal-'+i);if(!el)return;
  const mode=route().sub==='prezzi'?'price':'avail';
  const m=V.month[i]||(V.month[i]=(()=>{const d=new Date();d.setDate(1);return d})()),sel=V.sel[i]||(V.sel[i]=new Set());
  const y=m.getFullYear(),mo=m.getMonth(),f=(new Date(y,mo,1).getDay()+6)%7,n=new Date(y,mo+1,0).getDate(),busy=BUSY[p.id]||new Set();
  let h=`<div class="pcal-head"><button type="button" class="cal-nav" data-act="calPrev" data-i="${i}" aria-label="Mese precedente">‹</button><b>${m.toLocaleDateString('it-IT',{month:'long',year:'numeric'})}</b><button type="button" class="cal-nav" data-act="calNext" data-i="${i}" aria-label="Mese successivo">›</button></div><div class="pcal-grid">`+'Lun Mar Mer Gio Ven Sab Dom'.split(' ').map(x=>`<b>${x}</b>`).join('')+'<i></i>'.repeat(f);
  for(let d=1;d<=n;d++){const ds=`${y}-${pad(mo+1)}-${pad(d)}`,past=ds<today,bs=busy.has(ds),bl=!!p.blocked[ds],ov=p.prices[ds]!=null&&mode==='price';
    const lab=bs?'<span class="pstate">occupato</span>':bl?'<span class="pstate blk-l">bloccato</span>':mode==='price'?`<span class="pprice">${eur(np(p,ds))}</span>`:'<span class="pstate free-l">libero</span>';
    h+=`<div class="pcell${past?' past':''}${bs?' busy':''}${bl?' blk':''}${ov?' ov':''}${sel.has(ds)?' sel':''}" data-day="${ds}" data-i="${i}"><span class="pday">${d}</span>${lab}</div>`}
  h+='</div><p class="book-note">Clicca i giorni per selezionarli (Maiusc + clic per un intervallo). <b>Occupato</b> = prenotazioni o iCal Booking/Airbnb (non modificabile).'+(mode==='price'?' Oro = prezzo personalizzato.':' Tratteggiato = bloccato da te.')+'</p>';
  el.innerHTML=h;selCount(i)}
const selCount=i=>$$(`[data-selcount="${i}"]`).forEach(e=>e.textContent=(V.sel[i]||new Set()).size);

function chipsRender(i){const p=S.apts[i],el=$('#chips-'+i);if(!el)return;const busy=BUSY[p.id]||new Set(),o=[],d0=new Date();d0.setDate(1);
  for(let k=0;k<18;k++){const d=new Date(d0.getFullYear(),d0.getMonth()+k,1),y=d.getFullYear(),mo=d.getMonth(),n=new Date(y,mo+1,0).getDate();let tot=0,bl=0;
    for(let x=1;x<=n;x++){const ds=`${y}-${pad(mo+1)}-${pad(x)}`;if(ds<today||busy.has(ds))continue;tot++;if(p.blocked[ds])bl++}
    const st=!tot?'na':bl===tot?'full':bl?'part':'none';
    o.push(`<button type="button" class="adm-chip ${st}" data-act="chipMonth" data-i="${i}" data-y="${y}" data-m="${mo}" ${st==='na'?'disabled':''} title="${st==='full'?'Clicca per sbloccare il mese':'Clicca per bloccare tutto il mese'}">${d.toLocaleDateString('it-IT',{month:'short'})}${mo===0||k===0?' '+String(y).slice(2):''}</button>`)}
  el.innerHTML='<span class="adm-chips-l">Blocca/sblocca un mese intero:</span>'+o.join('')}
function brRender(i){const p=S.apts[i],el=$('#br-'+i);if(!el)return;
  const ks=Object.keys(p.blocked).filter(d=>p.blocked[d]&&d>=today).sort(),rs=[];
  ks.forEach(d=>{const l=rs[rs.length-1];if(l&&addDays(l.b,1)===d)l.b=d;else rs.push({a:d,b:d})});
  el.innerHTML=rs.length?rs.map(r=>`<span class="adm-range">${r.a===r.b?fmtS(r.a):fmtS(r.a)+' → '+fmtS(r.b)} <small>(${rangeIncl(r.a,r.b).length} ${r.a===r.b?'notte':'notti'})</small><button type="button" data-act="brDel" data-i="${i}" data-a="${r.a}" data-b="${r.b}" aria-label="Sblocca">✕</button></span>`).join(''):'<p class="book-note">Nessuna notte bloccata a mano.</p>'}
const afterCal=i=>{calRender(i);if(route().sub==='disponibilita'){chipsRender(i);brRender(i)}};

// ---------- Prenotazioni ----------
function vBook(){
  const f=V.bkf,rows=D.bk.filter(x=>f==='tutte'||(f==='gestire'&&['richiesta','in_attesa'].includes(x.stato))||x.stato===f);
  const ext=(D.ext||[]).filter(e=>e.a>=today).sort((a,b)=>a.da<b.da?-1:a.da>b.da?1:0).slice(0,60);
  const flt=[['tutte','Tutte'],['gestire','Da gestire'],['confermata','Confermate'],['annullata','Annullate']];
  return `<div class="admin-card"><h2>Prenotazioni dal sito</h2>
  <div class="adm-tabs">${flt.map(([k,l])=>`<a href="#prenotazioni" data-act="bkf" data-f="${k}" class="${f===k?'on':''}">${l}</a>`).join('')}</div>
  <div class="table-wrap tw-bk" data-testid="admin-bookings"><table class="data bkt"><thead><tr><th>Codice</th><th>App.</th><th>Dal</th><th>Al</th><th>Ospiti</th><th>Cliente</th><th>Totale</th><th>Stato</th><th></th></tr></thead><tbody>${rows.length?rows.map(x=>`<tr><td data-label="Codice"><b>${esc(x.code)}</b></td><td data-label="App.">${esc(short(aptById(x.id)||{nome:x.id}))}</td><td data-label="Dal">${fmtD(x.da)}</td><td data-label="Al">${fmtD(x.a)}</td><td data-label="Ospiti">${x.ospiti}</td><td data-label="Cliente" class="td-cliente">${esc(x.nome)}<br>${esc(x.email)}${x.tel?'<br>'+esc(x.tel):''}</td><td data-label="Totale">${eur(x.totale)}</td><td data-label="Stato"><select class="stato-select" data-code="${esc(x.code)}">${['richiesta','in_attesa','confermata','annullata'].map(s=>`<option${s===x.stato?' selected':''}>${s}</option>`).join('')}</select></td><td class="td-azioni"><button type="button" class="stato-select btn-del-book" data-act="bookDel" data-code="${esc(x.code)}" data-testid="admin-book-del-${esc(x.code)}">Rimuovi</button></td></tr>`).join(''):'<tr><td colspan="9" class="td-empty">Nessuna prenotazione in questa vista.</td></tr>'}</tbody></table></div></div>
  <div class="admin-card"><h2>Occupazione esterna</h2><p class="book-note">Soggiorni importati da Airbnb, Booking o dal foglio (sola lettura, prossimi arrivi).</p>
  <div class="table-wrap tw-stack"><table class="data stack"><thead><tr><th>App.</th><th>Dal</th><th>Al</th><th>Origine</th></tr></thead><tbody>${ext.length?ext.map(e=>`<tr><td data-label="App.">${esc(short(aptById(e.id)||{nome:e.id}))}</td><td data-label="Dal">${fmtD(e.da)}</td><td data-label="Al">${fmtD(e.a)}</td><td data-label="Origine">${esc(e.src||'')}</td></tr>`).join(''):'<tr><td colspan="4" class="td-empty">Nessun soggiorno esterno in arrivo.</td></tr>'}</tbody></table></div></div>`}

// ---------- Guest Card ----------
function vGc(){
  const conf=D.bk.filter(x=>x.stato==='confermata'&&x.a>=today);
  return `<div class="admin-card" data-testid="admin-gc"><h2>Emetti una Guest Card</h2>
  <p class="book-note">Per ospiti arrivati da Airbnb, Booking o fuori sito: scegli date e numero di ospiti, l'ospite riceve la mail per attivare la card (Trentino Guest Card).</p>
  ${conf.length?`<div class="field"><label>Precompila da una prenotazione confermata del sito</label><select id="gc-pre"><option value="">— scegli —</option>${conf.map(x=>`<option value="${esc(x.code)}">${esc(x.nome)} · ${fmtS(x.da)}→${fmtS(x.a)} · ${esc(short(aptById(x.id)||{nome:x.id}))}</option>`).join('')}</select></div>`:''}
  <form id="gcf" class="adm-form">
   <div class="fields-grid">
    <div class="field"><label>Appartamento</label><select name="apt">${S.apts.map(p=>`<option value="${p.id}">${esc(short(p))}</option>`).join('')}<option value="">Altro / esterno</option></select></div>
    <div class="field"><label>Nome ospite</label><input name="nome" autocomplete="off"></div>
    <div class="field"><label>Email ospite *</label><input name="email" type="email" required autocomplete="off"></div>
    <div class="field"><label>Arrivo *</label><input name="da" type="date" required></div>
    <div class="field"><label>Partenza *</label><input name="a" type="date" required></div>
    <div class="field"><label>Ospiti *</label><input name="ospiti" type="number" min="1" max="12" value="2" required></div>
   </div>
   <div class="field"><label>Note interne (facoltative)</label><input name="note"></div>
   <button class="btn btn-wine" id="gc-go">Emetti Guest Card</button> <span class="admin-msg" id="gc-msg"></span>
  </form><div id="gc-res"></div></div>
  <div class="admin-card"><h2>Card emesse a mano</h2><div class="table-wrap tw-stack"><table class="data stack"><thead><tr><th>Emessa</th><th>Ospite</th><th>Periodo</th><th>Ospiti</th><th>Codice</th></tr></thead><tbody>${GC.length?GC.map(g=>`<tr><td data-label="Emessa">${fmtD((g.creato||'').slice(0,10))}</td><td data-label="Ospite">${esc(g.nome||'—')}<br><small>${esc(g.email)}</small></td><td data-label="Periodo">${fmtD(g.da)} → ${fmtD(g.a)}</td><td data-label="Ospiti">${g.ospiti}</td><td data-label="Codice">${esc(g.gc_id||g.codice)}</td></tr>`).join(''):'<tr><td colspan="5" class="td-empty">Nessuna card emessa a mano.</td></tr>'}</tbody></table></div></div>
  <div class="admin-card"><details><summary class="adm-sum">Configurazione Trentino Guest Card</summary>
  <p class="book-note">1) Premi "Autorizza Trentino Guest Card" e accedi con le credenziali della struttura (una volta sola: poi il collegamento si rinnova da solo). 2) Premi "Mostra tipologie card": copia l'ID della tipologia giusta e mettilo su Vercel come <b>TGC_CARD_TYPE_ID</b>. Se quella tipologia richiede un attributo, incolla il suo ID qui sotto e premi "Mostra attributi".</p>
  <button class="btn btn-wine" data-act="gcAuth" type="button">Autorizza Trentino Guest Card</button> <button class="btn btn-line" data-act="gcTip" type="button">Mostra tipologie card</button>
  <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input id="gcattrid" type="number" placeholder="idTipologiaCard" style="max-width:160px" data-testid="admin-gc-attrid"><button class="btn btn-line" data-act="gcAttr" type="button">Mostra attributi</button></div>
  <pre id="gcout" style="white-space:pre-wrap;word-break:break-word;margin-top:12px;font-size:.85rem"></pre></details></div>`}

// ---------- Eventi ----------
function vEv(){return `<div class="admin-card" data-testid="admin-events"><h2>Eventi a Trento</h2><p class="book-note">Gli eventi principali sono estratti automaticamente. Qui puoi aggiungere eventi speciali: compaiono anche nella sezione «Eventi in programma» della pagina Luoghi di interesse.</p>
  <form id="evform" class="ev-form"><div class="field" style="margin:0"><label>Titolo</label><input name="title" required data-testid="ev-title"></div><div class="field" style="margin:0"><label>Data</label><input name="date" type="date" required data-testid="ev-date"></div><div class="field" style="margin:0"><label>Ora</label><input name="time" placeholder="21:00" data-testid="ev-time"></div><div class="field" style="margin:0"><label>Luogo</label><input name="location" data-testid="ev-loc"></div><div class="field" style="margin:0"><label>Link (facoltativo)</label><input name="url" placeholder="https://" data-testid="ev-url"></div><button class="btn btn-wine" data-testid="ev-add">+ Aggiungi</button></form>
  <div class="table-wrap tw-stack" style="margin-top:16px"><table class="data stack" data-testid="ev-table"><thead><tr><th>Titolo</th><th>Data</th><th>Ora</th><th>Luogo</th><th></th></tr></thead><tbody>${EV.length?EV.map(x=>`<tr><td data-label="Titolo"><b>${esc(x.title)}</b></td><td data-label="Data">${esc(x.date)}</td><td data-label="Ora">${esc(x.time||'')}</td><td data-label="Luogo">${esc(x.location||'')}</td><td class="td-azioni"><button type="button" class="stato-select" data-act="evDel" data-id="${esc(x.id)}">Elimina</button></td></tr>`).join(''):'<tr><td colspan="5" class="td-empty">Nessun evento manuale.</td></tr>'}</tbody></table></div></div>`}

// ---------- Azioni (click) ----------
const setSel=(i,days_)=>{const p=S.apts[i],busy=BUSY[p.id]||new Set(),s=V.sel[i]||(V.sel[i]=new Set());days_.forEach(d=>{if(d>=today&&!busy.has(d))s.add(d)})};
const ACT={
  calPrev:a=>{const i=+a.dataset.i,m=V.month[i];m.setMonth(m.getMonth()-1);calRender(i)},
  calNext:a=>{const i=+a.dataset.i,m=V.month[i];m.setMonth(m.getMonth()+1);calRender(i)},
  selMonth:a=>{const i=+a.dataset.i,m=V.month[i],y=m.getFullYear(),mo=m.getMonth(),n=new Date(y,mo+1,0).getDate();setSel(i,rangeIncl(`${y}-${pad(mo+1)}-01`,`${y}-${pad(mo+1)}-${pad(n)}`));calRender(i)},
  selClear:a=>{const i=+a.dataset.i;V.sel[i]=new Set();calRender(i)},
  selRange:a=>{const i=+a.dataset.i,f=$('#rf-'+i).value,t2=$('#rt-'+i).value;if(!f||!t2||t2<f){alert('Scegli le due date (dal ≤ al)');return}setSel(i,rangeIncl(f,t2));const m=V.month[i]||(V.month[i]=new Date());const d=new Date(f+'T00:00:00');m.setFullYear(d.getFullYear(),d.getMonth(),1);calRender(i)},
  applyPrice:a=>{const i=+a.dataset.i,v=$('#pv-'+i).value;if(v===''||+v<0){$('#pv-'+i).focus();return}const s=V.sel[i]||new Set();if(!s.size){alert('Seleziona prima i giorni sul calendario');return}s.forEach(d=>S.apts[i].prices[d]=+v);V.sel[i]=new Set();$('#pv-'+i).value='';markDirty();calRender(i)},
  resetPrice:a=>{const i=+a.dataset.i,s=V.sel[i]||new Set();if(!s.size){alert('Seleziona prima i giorni sul calendario');return}s.forEach(d=>delete S.apts[i].prices[d]);V.sel[i]=new Set();markDirty();calRender(i)},
  block:a=>{const i=+a.dataset.i,s=V.sel[i]||new Set();if(!s.size){alert('Seleziona prima le notti sul calendario');return}s.forEach(d=>S.apts[i].blocked[d]=true);V.sel[i]=new Set();markDirty();afterCal(i)},
  unblock:a=>{const i=+a.dataset.i,s=V.sel[i]||new Set();if(!s.size){alert('Seleziona prima le notti sul calendario');return}s.forEach(d=>delete S.apts[i].blocked[d]);V.sel[i]=new Set();markDirty();afterCal(i)},
  chipMonth:a=>{const i=+a.dataset.i,p=S.apts[i],y=+a.dataset.y,mo=+a.dataset.m,n=new Date(y,mo+1,0).getDate(),busy=BUSY[p.id]||new Set(),ds=rangeIncl(`${y}-${pad(mo+1)}-01`,`${y}-${pad(mo+1)}-${pad(n)}`).filter(d=>d>=today&&!busy.has(d)),full=ds.every(d=>p.blocked[d]);
    ds.forEach(d=>full?delete p.blocked[d]:p.blocked[d]=true);markDirty();afterCal(i)},
  brDel:a=>{const i=+a.dataset.i;rangeIncl(a.dataset.a,a.dataset.b).forEach(d=>delete S.apts[i].blocked[d]);markDirty();afterCal(i)},
  stepAdd:a=>{const i=+a.dataset.i,p=S.apts[i];if(p.extraSteps.length>=Math.max(1,p.max-p.inclusi)){alert('Hai già uno scaglione per ogni ospite extra possibile ('+Math.max(0,p.max-p.inclusi)+').');return}p.extraSteps.push(+p.extraSteps[p.extraSteps.length-1]||0);markDirty();stepsRender(i);prevRender(i)},
  stepDel:a=>{const i=+a.dataset.i;S.apts[i].extraSteps.splice(+a.dataset.j,1);markDirty();stepsRender(i);prevRender(i)},
  perAdd:a=>{const i=+a.dataset.i;S.apts[i].periodi.push({da:'',a:'',prezzo:S.apts[i].base});markDirty();perRender(i)},
  perDel:a=>{const i=+a.dataset.i;S.apts[i].periodi.splice(+a.dataset.j,1);markDirty();perRender(i);if($('#cal-'+i))calRender(i)},
  minAdd:a=>{const i=+a.dataset.i;S.apts[i].minPeriodi.push({da:'',a:'',min:S.apts[i].min+1});markDirty();minRender(i)},
  minDel:a=>{const i=+a.dataset.i;S.apts[i].minPeriodi.splice(+a.dataset.j,1);markDirty();minRender(i)},
  phL:a=>movePh(+a.dataset.i,+a.dataset.j,+a.dataset.j-1),phR:a=>movePh(+a.dataset.i,+a.dataset.j,+a.dataset.j+1),phC:a=>movePh(+a.dataset.i,+a.dataset.j,0),
  phD:a=>{const i=+a.dataset.i;S.apts[i].foto.splice(+a.dataset.j,1);markDirty();phRender(i)},
  copy:a=>{navigator.clipboard&&navigator.clipboard.writeText(a.dataset.v).then(()=>{a.textContent='Copiato ✓';setTimeout(()=>a.textContent='Copia',1800)})},
  bkf:(a,e)=>{e.preventDefault();V.bkf=a.dataset.f;body()},
  bookDel:a=>{if(confirm('Rimuovere definitivamente questa prenotazione dallo storico?'))api('book_del',{code:a.dataset.code},t).then(async()=>{await refreshAdm();body()}).catch(x=>alert(x.message))},
  evDel:a=>{if(confirm('Eliminare questo evento?'))api('event_del',{id:a.dataset.id},t).then(async()=>{EV=(await get('a=events'))||[];body()}).catch(x=>alert(x.message))},
  gcAuth:async()=>{const o=$('#gcout');o.textContent='Reindirizzo a Trentino Marketing…';try{const{url}=await api('gc_oauth_start',{},t);location.href=url}catch(x){o.textContent='Errore: '+x.message}},
  gcTip:async()=>{const o=$('#gcout');o.textContent='Carico…';try{o.textContent=JSON.stringify(await api('gc_tipologie',{},t),null,2)}catch(x){o.textContent='Errore: '+x.message}},
  gcAttr:async()=>{const o=$('#gcout'),id=$('#gcattrid').value.trim();if(!id){o.textContent='Inserisci prima l\'idTipologiaCard (dal pulsante "Mostra tipologie card")';return}o.textContent='Carico…';try{o.textContent=JSON.stringify(await api('gc_attributi',{idTipologiaCard:id},t),null,2)}catch(x){o.textContent='Errore: '+x.message}}
};

function cellClick(cell,e){
  if(cell.classList.contains('busy')||cell.classList.contains('past'))return;
  const i=+cell.dataset.i,day=cell.dataset.day,s=V.sel[i]||(V.sel[i]=new Set());
  if(e.shiftKey&&V.anchor[i]){const a=V.anchor[i]<day?V.anchor[i]:day,b=V.anchor[i]<day?day:V.anchor[i];setSel(i,rangeIncl(a,b))}
  else{s.has(day)?s.delete(day):s.add(day);V.anchor[i]=day}
  calRender(i)}

// ---------- Eventi DOM ----------
function wire(){
  M.addEventListener('click',e=>{
    if(e.target.id==='out'){sessionStorage.removeItem('lc_t');t='';S=null;dirty=false;login();return}
    if(e.target.id==='save'){save();return}
    const a=e.target.closest('[data-act]');if(a){ACT[a.dataset.act]&&ACT[a.dataset.act](a,e);return}
    const c=e.target.closest('.pcell');if(c)cellClick(c,e)});
  M.addEventListener('input',e=>{const el=e.target,d=el.dataset;
    if(d.b){const[k,a,b]=d.b.split(':');const v=el.type==='checkbox'?el.checked:el.type==='number'?(el.value===''?0:+el.value):el.value;
      if(k==='c')S[a]=v;else if(k==='a')S.apts[+a][b]=v;else if(k==='ical')S.ical[a]=v;else if(k==='closed')S.closed[a]=!!v;
      markDirty();if(k==='a'&&(b==='base'||b==='inclusi'||b==='max')&&$('#prev-'+a))prevRender(+a);return}
    if(d.step){const[i,j]=d.step.split(':').map(Number);S.apts[i].extraSteps[j]=Math.max(0,+el.value||0);markDirty();prevRender(i);return}
    if(d.per){const[i,j,k]=d.per.split(':');S.apts[+i].periodi[+j][k]=k==='prezzo'?(+el.value||0):el.value;markDirty();calRender(+i);return}
    if(d.mp){const[i,j,k]=d.mp.split(':');S.apts[+i].minPeriodi[+j][k]=k==='min'?Math.max(1,+el.value||1):el.value;markDirty();return}});
  M.addEventListener('change',async e=>{const el=e.target;
    if(el.dataset.b){const[k,a,b]=el.dataset.b.split(':');if(k==='a'&&(b==='inclusi'||b==='max')&&$('#steps-'+a)){const p=S.apts[+a];if(b==='inclusi'&&(+p.inclusi||0)<1)p.inclusi=1;p.extraSteps.length=Math.max(1,Math.min(p.extraSteps.length,p.max-p.inclusi));stepsRender(+a);prevRender(+a)}if(k==='closed')nav();return}
    if(el.classList.contains('up')){const i=+el.dataset.i,msg=$('#om'+i);msg.textContent='Carico le foto…';
      try{for(const f of el.files)S.apts[i].foto.push((await api('up',{id:S.apts[i].id,img:await resize(f)},t)).url);el.value='';phRender(i);markDirty();msg.textContent='Foto caricate. Ricordati di salvare.'}catch(x){msg.textContent=x.message}return}
    if(el.dataset.code){api('stato',{code:el.dataset.code,stato:el.value},t).then(async()=>{await refreshAdm();nav()}).catch(x=>alert(x.message));return}
    if(el.id==='gc-pre'){const x=D.bk.find(k=>k.code===el.value),f=$('#gcf');if(!x||!f)return;const E=f.elements;E.apt.value=x.id;E.nome.value=x.nome||'';E.email.value=x.email||'';E.da.value=x.da;E.a.value=x.a;E.ospiti.value=x.ospiti}});
  M.addEventListener('submit',async e=>{
    if(e.target.id==='evform'){e.preventDefault();try{await api('event_add',Object.fromEntries(new FormData(e.target)),t);EV=(await get('a=events'))||[];body()}catch(x){alert(x.message)}}
    if(e.target.id==='gcf'){e.preventDefault();const b=Object.fromEntries(new FormData(e.target)),msg=$('#gc-msg'),btn=$('#gc-go');
      if(b.a<=b.da){msg.textContent='La partenza deve essere dopo l\'arrivo';return}
      btn.disabled=true;msg.textContent='Emissione in corso…';
      try{const r=await api('gc_manual_issue',b,t);GC.unshift(r);msg.textContent='';
        $('#gc-res').innerHTML=`<div class="adm-ok" data-testid="gc-success"><b>Guest Card richiesta ✔</b><br>${r.gc_id?'Codice: <b>'+esc(r.gc_id)+'</b><br>':''}Periodo: ${fmtD(r.da)} → ${fmtD(r.a)} · ${r.ospiti} ospiti<br>L'ospite riceverà una mail a <b>${esc(r.email)}</b> per completare l'attivazione.</div>`;
        e.target.reset();e.target.elements.ospiti.value=2}
      catch(x){msg.textContent=x.message}finally{btn.disabled=false}}});
  // drag & drop foto
  let dI=null,dF=null;
  M.addEventListener('dragstart',e=>{const it=e.target.closest('.pm-item');if(!it)return;dI=+it.dataset.i;dF=+it.dataset.j;it.classList.add('dragging')});
  M.addEventListener('dragend',e=>{const it=e.target.closest('.pm-item');it&&it.classList.remove('dragging');$$('.pm-item.dragover').forEach(x=>x.classList.remove('dragover'))});
  M.addEventListener('dragover',e=>{const it=e.target.closest('.pm-item');if(it&&+it.dataset.i===dI){e.preventDefault();it.classList.add('dragover')}});
  M.addEventListener('dragleave',e=>{const it=e.target.closest('.pm-item');it&&it.classList.remove('dragover')});
  M.addEventListener('drop',e=>{const it=e.target.closest('.pm-item');if(!it||+it.dataset.i!==dI)return;e.preventDefault();const to=+it.dataset.j;if(dF!=null&&dF!==to)movePh(dI,dF,to);dI=dF=null});
  window.addEventListener('hashchange',()=>{if(S){body();window.scrollTo({top:0,behavior:'smooth'})}});
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}})}

// ---------- Salvataggio ----------
async function save(){
  const o=$('#o'),btn=$('#save');btn.disabled=true;o.className='admin-msg';o.textContent='Salvo…';
  for(const p of S.apts){ // controlli di coerenza prima di inviare
    const bad=p.periodi.find(q=>!q.da||!q.a||q.a<q.da);if(bad){o.textContent='Controlla i periodi di prezzo di '+short(p)+': date mancanti o invertite';o.className='admin-msg warn';btn.disabled=false;return}
    const bm=p.minPeriodi.find(q=>!q.da||!q.a||q.a<q.da);if(bm){o.textContent='Controlla i periodi di soggiorno minimo di '+short(p)+': date mancanti o invertite';o.className='admin-msg warn';btn.disabled=false;return}}
  const payload=structuredClone(S);
  payload.apts.forEach(p=>{p.extraSteps=p.extraSteps.map(v=>Math.max(0,+v||0));p.extra=p.extraSteps[0]||0;
    p.blocked=Object.fromEntries(Object.keys(p.blocked).filter(d=>p.blocked[d]&&d>=today).map(d=>[d,true]))});
  try{await api('save',payload,t);dirty=false;o.textContent='Salvato: le modifiche sono già online.';o.className='admin-msg ok';setTimeout(()=>{if(!dirty)o.textContent=''},4500)}
  catch(x){o.textContent=x.message;o.className='admin-msg warn'}
  finally{btn.disabled=false}}

wire();
t?start():login();
})();
