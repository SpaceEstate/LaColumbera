// La Columbera · Gestione → OPERATIVITÀ → Calendario e prezzi: un calendario per appartamento (schede Torre / Corte) e la vista «Entrambi».
// Nel calendario si selezionano le notti e si cambia in un colpo prezzo, blocco o minimo di notti; sotto: prezzo base e ospiti in più,
// prezzi di stagione, notti minime, notti bloccate e chiusura. Stessi dati di prima (prices, periodi, blocked, minPeriodi, closed): cambia solo la schermata.
// Si registra in window.LCAdmParts: stato e utilità comuni arrivano da js/admin.js (oggetto A).
(window.LCAdmParts=window.LCAdmParts||[]).push(function(A){
'use strict';
const {$,$$,esc,eur,pad,fmtS,fmtW,addDays,rangeIncl,today,short,V}=A;
const S=()=>A.S;

// --- chi occupa una notte (per scriverlo nella casella): prenotazione del sito, del foglio o calendario iCal (st = A.soggiorni(), calcolato una volta) ---
const occupanti=()=>A.soggiorni?A.soggiorni():[];
const chiOccupa=(st,p,d)=>{const x=st.find(z=>z.id===p.id&&z.da<=d&&d<z.a);return x?{lab:x.nome?x.nome.split(' ')[0]:x.fonte,code:x.code,tit:(x.nome||x.fonte)+(x.code?' · '+x.code:'')}:null};
// toglie l'intervallo [da,a] dai periodi, spezzandoli se serve (per fissare o togliere un minimo di notti sui giorni selezionati)
const togli=(per,da,a)=>per.flatMap(q=>{if(!q.da||!q.a||q.a<da||q.da>a)return [q];const o=[];if(q.da<da)o.push(Object.assign({},q,{a:addDays(da,-1)}));if(q.a>a)o.push(Object.assign({},q,{da:addDays(a,1)}));return o});
// giorni selezionati → intervalli consecutivi
const gruppi=s=>{const out=[];[...s].sort().forEach(d=>{const l=out[out.length-1];if(l&&addDays(l.a,1)===d)l.a=d;else out.push({da:d,a:d})});return out};

function vCal(r){
  const apts=S().apts,p=A.aptById(r.sub)||(r.sub==='tutti'?null:A.aptById(V.calApt)||apts[0]);
  if(p)V.calApt=p.id;
  const tabs=`<div class="adm-tabs" data-testid="admin-cal-tabs">${apts.map(q=>`<a href="#calendario/${q.id}" class="${p&&p.id===q.id?'on':''}">${esc(short(q))}</a>`).join('')}<a href="#calendario/tutti" class="${p?'':'on'}" data-testid="admin-cal-tutti">Entrambi</a></div>`;
  return tabs+(p?vApt(p,A.idx(p.id)):vTutti())}

function vApt(p,i){const chiuso=!!S().closed[p.id];
  return `<div class="cal-wrap" data-testid="admin-apt-${p.id}"><div class="admin-card cal-card${chiuso?' is-closed':''}">
  <div class="adm-head"><h2>Calendario <span class="n">${esc(short(p))}</span></h2>
   <label class="closed-toggle"><input type="checkbox" data-b="closed:${p.id}" ${chiuso?'checked':''} data-testid="admin-closed-${p.id}"> Chiudi appartamento — blocca tutte le prenotazioni dal sito</label></div>
  <p class="adm-warn cal-closed-note" ${chiuso?'':'hidden'} id="closed-note-${i}">${esc(short(p))} è chiuso: dal sito non si può prenotare nessuna data. Ricordati di salvare.</p>
  <div class="pcal-mode" role="group" aria-label="Come selezionare i giorni"><span>Seleziona:</span><button type="button" data-act="selMode" data-m="giorni" class="${V.selMode==='intervallo'?'':'on'}" aria-pressed="${V.selMode==='intervallo'?'false':'true'}">giorno per giorno</button><button type="button" data-act="selMode" data-m="intervallo" class="${V.selMode==='intervallo'?'on':''}" aria-pressed="${V.selMode==='intervallo'?'true':'false'}" data-testid="admin-cal-mode-range">dal… al…</button></div>
  <div id="cal-${i}"></div>
  <div id="act-${i}" class="pcal-act" data-testid="admin-cal-act-${p.id}"></div>
  <details class="pcal-dates"><summary>Oppure scrivi le date</summary>
   <div class="pcal-sel"><div class="adm-inp"><span>Dal</span><input type="date" id="rf-${i}" min="${today}"></div><div class="adm-inp"><span>al</span><input type="date" id="rt-${i}" min="${today}"></div><button type="button" class="btn btn-line" data-act="selRange" data-i="${i}">Aggiungi alla selezione</button></div></details></div>
  <div class="adm-cols">
  <div class="admin-card"><h3 style="margin-top:0">Prezzo del 1° ospite</h3>
   <div class="fields-grid"><div class="field"><label>Prezzo a notte con 1 ospite (€)</label><input type="number" min="0" data-b="a:${i}:base" value="${p.base}" data-testid="admin-base-${p.id}"></div></div>
   <p class="book-note">È il prezzo a notte per il primo ospite: gli ospiti in più si aggiungono qui sotto. I prezzi di stagione e quelli per singola notte sostituiscono questo importo.</p>
   <h3>Ospiti in più (a notte)</h3>
   <p class="book-note">Ogni ospite dopo il primo aggiunge un importo a notte, diverso per ciascuno: metti 0 se quell'ospite non costa di più. Esempio: 1° ospite €100 e supplementi +10 · +25 · +50 → 2 ospiti €110, 3 ospiti €135, 4 ospiti €185 a notte. L'ultimo importo vale anche per gli ospiti successivi. I bambini sotto i 4 anni non pagano: non contano tra gli ospiti in più, ma sì per il numero massimo di ospiti.</p>
   <div id="steps-${i}"></div>
   <button type="button" class="btn btn-line" data-act="stepAdd" data-i="${i}">+ Aggiungi scaglione</button>
   <div id="prev-${i}" class="adm-prev"></div></div>
  <div class="admin-card"><h3 style="margin-top:0">Prezzi di stagione</h3>
   <p class="book-note">Un prezzo del 1° ospite diverso per un intervallo di date (es. estate, Natale): i supplementi per gli ospiti in più restano quelli accanto. I prezzi messi sulle singole notti dal calendario hanno la precedenza.</p>
   <div id="per-${i}"></div>
   <button type="button" class="btn btn-line" data-act="perAdd" data-i="${i}">+ Aggiungi periodo</button>
   <h3>Notti minime</h3>
   <div class="fields-grid"><div class="field"><label>Minimo generale (notti)</label><input type="number" min="1" data-b="a:${i}:min" value="${p.min}" data-testid="admin-min-${p.id}"></div></div>
   <p class="book-note">Puoi fissare un minimo diverso per un periodo (es. 5 notti a Natale), anche dal calendario. Vale la regola del periodo in cui cade la <b>data di arrivo</b>.</p>
   <div id="minper-${i}"></div>
   <button type="button" class="btn btn-line" data-act="minAdd" data-i="${i}">+ Aggiungi periodo</button></div></div>
  <div class="admin-card"><h3 style="margin-top:0">Notti bloccate</h3>
   <p class="book-note">Le notti bloccate risultano non prenotabili <b>solo sul sito</b>: il calendario che dai a Booking e Airbnb contiene soltanto le prenotazioni fatte dal sito, quindi chiudi le stesse notti anche su Booking e Airbnb.</p>
   <div class="adm-chips" id="chips-${i}"></div>
   <div id="br-${i}" class="adm-ranges"></div></div></div>`}

// --- vista «Entrambi»: le prossime 8 settimane, una riga per notte, una colonna per appartamento ---
function vTutti(){const apts=S().apts,ds=[],st=occupanti();for(let d=today;ds.length<56;d=addDays(d,1))ds.push(d);
  const cell=(p,i,d)=>{const busy=(A.BUSY[p.id]||new Set()).has(d),who=busy?chiOccupa(st,p,d):null,bl=!!p.blocked[d];
    return `<td data-label="${esc(short(p))}" class="${busy?'mx-busy':bl?'mx-blk':'mx-free'}"><a href="#calendario/${p.id}" data-act="calGo" data-i="${i}" data-d="${d}">${busy?esc(who?who.tit:'occupata'):bl?'bloccata':eur(A.np(p,d))+(S().closed[p.id]?' · chiuso':'')}</a></td>`};
  const giorno=d=>new Date(d+'T00:00:00').toLocaleDateString('it-IT',{weekday:'short',day:'numeric'});
  return `<div class="admin-card" data-testid="admin-cal-matrice"><h2>Entrambi gli appartamenti</h2><p class="book-note">Le prossime 8 settimane: chi c'è, le notti bloccate e il prezzo del 1° ospite delle notti libere. Tocca una notte per aprire il calendario di quell'appartamento.</p>
  <div class="table-wrap"><table class="data mx mx-cal"><thead><tr><th>Notte</th>${apts.map(p=>`<th>${esc(short(p))}</th>`).join('')}</tr></thead><tbody>${ds.map((d,k)=>(k===0||d.slice(8)==='01'?`<tr class="mx-month"><th colspan="${apts.length+1}">${esc(new Date(d+'T00:00:00').toLocaleDateString('it-IT',{month:'long',year:'numeric'}))}</th></tr>`:'')+`<tr><td data-label="Notte">${esc(giorno(d))}</td>${apts.map((p,i)=>cell(p,i,d)).join('')}</tr>`).join('')}</tbody></table></div></div>`}

// --- scaglioni ospiti ---
function stepsRender(i){const p=S().apts[i],el=$('#steps-'+i);if(!el)return;
  el.innerHTML=`<div class="adm-rows">${p.extraSteps.map((v,j)=>`<div class="adm-row"><span>Dal <b>${p.inclusi+j+1}° ospite</b>${j===p.extraSteps.length-1&&p.max>p.inclusi+j+1?' in poi':''}</span><div class="adm-inp"><span>+ €</span><input type="number" min="0" data-step="${i}:${j}" value="${v}" aria-label="Supplemento a notte"></div>${p.extraSteps.length>1?`<button type="button" class="stato-select" data-act="stepDel" data-i="${i}" data-j="${j}" aria-label="Rimuovi">✕</button>`:''}</div>`).join('')}</div>`}
function prevRender(i){const p=S().apts[i],el=$('#prev-'+i);if(!el)return;
  const o=[];for(let n=1;n<=Math.max(1,p.max);n++)o.push(`<span><b>${n} ${n===1?'ospite':'ospiti'}</b> ${eur((+p.base||0)+A.sup(p,n))}<small>/notte</small></span>`);
  el.innerHTML='<div class="adm-prev-t">Anteprima: prezzo a notte per numero di ospiti</div><div class="adm-prev-r">'+o.join('')+'</div>'}
// --- periodi (stagioni) ---
function perRender(i){const p=S().apts[i],el=$('#per-'+i);if(!el)return;
  el.innerHTML=p.periodi.length?`<div class="adm-rows">${p.periodi.map((q,j)=>`<div class="adm-row"><div class="adm-inp"><span>Dal</span><input type="date" data-per="${i}:${j}:da" value="${esc(q.da)}"></div><div class="adm-inp"><span>al</span><input type="date" data-per="${i}:${j}:a" value="${esc(q.a)}"></div><div class="adm-inp"><span>€</span><input type="number" min="0" data-per="${i}:${j}:prezzo" value="${q.prezzo}" style="max-width:110px"></div><button type="button" class="stato-select" data-act="perDel" data-i="${i}" data-j="${j}" aria-label="Rimuovi">✕</button></div>`).join('')}</div>`:'<p class="book-note">Nessun periodo: vale sempre il prezzo base.</p>'}
// --- minimo notti per periodo ---
function minRender(i){const p=S().apts[i],el=$('#minper-'+i);if(!el)return;
  el.innerHTML=p.minPeriodi.length?`<div class="adm-rows">${p.minPeriodi.map((q,j)=>`<div class="adm-row"><div class="adm-inp"><span>Arrivo dal</span><input type="date" data-mp="${i}:${j}:da" value="${esc(q.da)}"></div><div class="adm-inp"><span>al</span><input type="date" data-mp="${i}:${j}:a" value="${esc(q.a)}"></div><div class="adm-inp"><span>minimo</span><input type="number" min="1" data-mp="${i}:${j}:min" value="${q.min}" style="max-width:90px"><span>notti</span></div><button type="button" class="stato-select" data-act="minDel" data-i="${i}" data-j="${j}" aria-label="Rimuovi">✕</button></div>`).join('')}</div>`:'<p class="book-note">Nessun periodo particolare: vale il minimo generale.</p>'}

// --- calendario: una casella per notte con prezzo, stato e minimo di notti (se diverso dal generale) ---
function calRender(i){const p=S().apts[i],el=$('#cal-'+i);if(!el)return;
  const m=V.month[i]||(V.month[i]=(()=>{const d=new Date();d.setDate(1);return d})()),sel=V.sel[i]||(V.sel[i]=new Set());
  const y=m.getFullYear(),mo=m.getMonth(),f=(new Date(y,mo,1).getDay()+6)%7,n=new Date(y,mo+1,0).getDate(),busy=A.BUSY[p.id]||new Set(),an=V.anchor[i],st=occupanti();
  let h=`<div class="pcal-head"><button type="button" class="cal-nav" data-act="calPrev" data-i="${i}" aria-label="Mese precedente">‹</button><b>${m.toLocaleDateString('it-IT',{month:'long',year:'numeric'})}</b><button type="button" class="cal-nav" data-act="calNext" data-i="${i}" aria-label="Mese successivo">›</button></div><div class="pcal-grid">`+'Lun Mar Mer Gio Ven Sab Dom'.split(' ').map(x=>`<b>${x}</b>`).join('')+'<i></i>'.repeat(f);
  for(let d=1;d<=n;d++){const ds=`${y}-${pad(mo+1)}-${pad(d)}`,past=ds<today,bs=busy.has(ds),bl=!!p.blocked[ds],ov=p.prices[ds]!=null,mn=A.minFor(p,ds),who=bs?chiOccupa(st,p,ds):null;
    const lab=bs?`<span class="pstate">${esc(who?who.lab:'occupato')}</span>`:bl?'<span class="pstate blk-l">bloccato</span>':`<span class="pprice">${eur(A.np(p,ds))}</span>`;
    h+=`<div class="pcell${past?' past':''}${bs?' busy':''}${bl?' blk':''}${ov&&!bs?' ov':''}${sel.has(ds)?' sel':''}${an===ds&&V.selMode==='intervallo'?' anchor':''}" data-day="${ds}" data-i="${i}"${who&&who.code?` data-code="${esc(who.code)}"`:''}${who?` title="${esc(who.tit)}"`:''}><span class="pday">${d}</span>${lab}${!bs&&!past&&mn!==(+p.min||1)?`<span class="pmin">min ${mn}</span>`:''}</div>`}
  h+='</div><p class="book-note pcal-leg"><span class="lg lg-free"></span>libera, con il prezzo del 1° ospite · <span class="lg lg-ov"></span>prezzo messo a mano · <span class="lg lg-blk"></span>bloccata da te · <span class="lg lg-busy"></span>occupata (prenotazioni, Booking, Airbnb: non si modifica, tocca per aprirla) · «min» = notti minime diverse dal solito</p>';
  el.innerHTML=h;actRender(i)}
// --- pannello delle azioni sui giorni selezionati ---
function actRender(i){const p=S().apts[i],el=$('#act-'+i);if(!el)return;const s=V.sel[i]||new Set();
  if(!s.size){el.innerHTML=`<p class="book-note" style="margin:0">${V.selMode==='intervallo'?(V.anchor[i]?'Ora tocca l\'ultima notte dell\'intervallo.':'Tocca la prima notte, poi l\'ultima: si selezionano tutte quelle in mezzo.'):'Tocca una o più notti per cambiarne il prezzo, bloccarle o fissare un minimo di notti.'}</p><button type="button" class="btn btn-line" data-act="selMonth" data-i="${i}">Seleziona tutto il mese</button>`;return}
  const g=gruppi(s),dove=g.slice(0,3).map(r=>r.da===r.a?fmtS(r.da):fmtS(r.da)+' → '+fmtS(r.a)).join(', ')+(g.length>3?'…':'');
  el.innerHTML=`<div class="pcal-act-h"><b data-testid="admin-cal-sel-${p.id}"><span data-selcount="${i}">${s.size}</span> ${s.size===1?'notte selezionata':'notti selezionate'}</b> <small>${esc(dove)}</small><button type="button" class="btn btn-line" data-act="selClear" data-i="${i}">Deseleziona</button></div>
   <div class="pcal-act-g">
    <div class="pcal-act-b"><label for="pv-${i}">Prezzo a notte del 1° ospite</label><div class="pcal-act-r"><div class="adm-inp"><span>€</span><input type="number" min="0" id="pv-${i}" placeholder="${esc(p.base)}" data-testid="admin-cal-price-${p.id}"></div><button type="button" class="btn btn-wine" data-act="applyPrice" data-i="${i}" data-testid="admin-cal-apply-${p.id}">Applica</button><button type="button" class="btn btn-line" data-act="resetPrice" data-i="${i}" title="Torna al prezzo di stagione o al prezzo base">Prezzo normale</button></div></div>
    <div class="pcal-act-b"><label>Disponibilità sul sito</label><div class="pcal-act-r"><button type="button" class="btn btn-wine" data-act="block" data-i="${i}" data-testid="admin-cal-block-${p.id}">Blocca</button><button type="button" class="btn btn-line" data-act="unblock" data-i="${i}" data-testid="admin-cal-unblock-${p.id}">Sblocca</button></div></div>
    <div class="pcal-act-b"><label for="mv-${i}">Notti minime per chi arriva in questi giorni</label><div class="pcal-act-r"><div class="adm-inp"><input type="number" min="1" id="mv-${i}" placeholder="${esc(p.min)}" style="max-width:90px" data-testid="admin-cal-min-${p.id}"><span>notti</span></div><button type="button" class="btn btn-line" data-act="applyMin" data-i="${i}" data-testid="admin-cal-minapply-${p.id}">Applica</button><button type="button" class="btn btn-line" data-act="resetMin" data-i="${i}" title="Vale di nuovo il minimo generale">Togli</button></div></div>
   </div>`}
function chipsRender(i){const p=S().apts[i],el=$('#chips-'+i);if(!el)return;const busy=A.BUSY[p.id]||new Set(),o=[],d0=new Date();d0.setDate(1);
  for(let k=0;k<18;k++){const d=new Date(d0.getFullYear(),d0.getMonth()+k,1),y=d.getFullYear(),mo=d.getMonth(),n=new Date(y,mo+1,0).getDate();let tot=0,bl=0;
    for(let x=1;x<=n;x++){const ds=`${y}-${pad(mo+1)}-${pad(x)}`;if(ds<today||busy.has(ds))continue;tot++;if(p.blocked[ds])bl++}
    const st=!tot?'na':bl===tot?'full':bl?'part':'none';
    o.push(`<button type="button" class="adm-chip ${st}" data-act="chipMonth" data-i="${i}" data-y="${y}" data-m="${mo}" ${st==='na'?'disabled':''} title="${st==='full'?'Clicca per sbloccare il mese':'Clicca per bloccare tutto il mese'}">${d.toLocaleDateString('it-IT',{month:'short'})}${mo===0||k===0?' '+String(y).slice(2):''}</button>`)}
  el.innerHTML='<span class="adm-chips-l">Blocca/sblocca un mese intero:</span>'+o.join('')}
function brRender(i){const p=S().apts[i],el=$('#br-'+i);if(!el)return;
  const ks=Object.keys(p.blocked).filter(d=>p.blocked[d]&&d>=today).sort(),rs=[];
  ks.forEach(d=>{const l=rs[rs.length-1];if(l&&addDays(l.b,1)===d)l.b=d;else rs.push({a:d,b:d})});
  el.innerHTML=rs.length?rs.map(r=>`<span class="adm-range">${r.a===r.b?fmtS(r.a):fmtS(r.a)+' → '+fmtS(r.b)} <small>(${rangeIncl(r.a,r.b).length} ${r.a===r.b?'notte':'notti'})</small><button type="button" data-act="brDel" data-i="${i}" data-a="${r.a}" data-b="${r.b}" aria-label="Sblocca">✕</button></span>`).join(''):'<p class="book-note">Nessuna notte bloccata a mano.</p>'}
const afterCal=i=>{calRender(i);chipsRender(i);brRender(i)};

A.view.calendario=vCal;
A.after.calendario=r=>{const p=A.aptById(r.sub)||(r.sub==='tutti'?null:A.aptById(V.calApt));if(!p)return;const i=A.idx(p.id);
  stepsRender(i);prevRender(i);perRender(i);minRender(i);afterCal(i)};

const setSel=(i,ds)=>{const p=S().apts[i],busy=A.BUSY[p.id]||new Set(),s=V.sel[i]||(V.sel[i]=new Set());ds.forEach(d=>{if(d>=today&&!busy.has(d))s.add(d)})};
const need=i=>{const s=V.sel[i]||new Set();if(!s.size){alert('Seleziona prima le notti sul calendario');return null}return s};
const done=(i,cal)=>{V.sel[i]=new Set();V.anchor[i]='';A.markDirty();cal?afterCal(i):calRender(i)};
Object.assign(A.act,{
  calPrev:a=>{const i=+a.dataset.i,m=V.month[i];m.setMonth(m.getMonth()-1);calRender(i)},
  calNext:a=>{const i=+a.dataset.i,m=V.month[i];m.setMonth(m.getMonth()+1);calRender(i)},
  // da Oggi, dal dettaglio di una prenotazione o dalla vista «Entrambi»: apre il mese di quella notte (il link porta già all'appartamento)
  calGo:a=>{const i=+a.dataset.i,d=new Date((a.dataset.d||today)+'T00:00:00');if(i>=0)V.month[i]=new Date(d.getFullYear(),d.getMonth(),1)},
  selMode:a=>{V.selMode=a.dataset.m;$$('.pcal-mode button').forEach(b=>{const on=b.dataset.m===V.selMode;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on?'true':'false')});
    S().apts.forEach((p,i)=>{V.anchor[i]='';if($('#cal-'+i))calRender(i)})},
  selMonth:a=>{const i=+a.dataset.i,m=V.month[i],y=m.getFullYear(),mo=m.getMonth(),n=new Date(y,mo+1,0).getDate();setSel(i,rangeIncl(`${y}-${pad(mo+1)}-01`,`${y}-${pad(mo+1)}-${pad(n)}`));calRender(i)},
  selClear:a=>{const i=+a.dataset.i;V.sel[i]=new Set();V.anchor[i]='';calRender(i)},
  selRange:a=>{const i=+a.dataset.i,f=$('#rf-'+i).value,t2=$('#rt-'+i).value;if(!f||!t2||t2<f){alert('Scegli le due date (dal ≤ al)');return}setSel(i,rangeIncl(f,t2));const m=V.month[i]||(V.month[i]=new Date());const d=new Date(f+'T00:00:00');m.setFullYear(d.getFullYear(),d.getMonth(),1);calRender(i)},
  applyPrice:a=>{const i=+a.dataset.i,v=$('#pv-'+i).value;if(v===''||+v<0){$('#pv-'+i).focus();return}const s=need(i);if(!s)return;s.forEach(d=>S().apts[i].prices[d]=+v);done(i)},
  resetPrice:a=>{const i=+a.dataset.i,s=need(i);if(!s)return;s.forEach(d=>delete S().apts[i].prices[d]);done(i)},
  block:a=>{const i=+a.dataset.i,s=need(i);if(!s)return;s.forEach(d=>S().apts[i].blocked[d]=true);done(i,1)},
  unblock:a=>{const i=+a.dataset.i,s=need(i);if(!s)return;s.forEach(d=>delete S().apts[i].blocked[d]);done(i,1)},
  // minimo di notti per gli arrivi nei giorni selezionati: sostituisce, solo su quei giorni, le regole di periodo che c'erano
  applyMin:a=>{const i=+a.dataset.i,p=S().apts[i],v=Math.round(+$('#mv-'+i).value);if(!(v>=1)){$('#mv-'+i).focus();return}const s=need(i);if(!s)return;
    gruppi(s).forEach(g=>{p.minPeriodi=togli(p.minPeriodi,g.da,g.a)});gruppi(s).forEach(g=>p.minPeriodi.push({da:g.da,a:g.a,min:v}));
    p.minPeriodi.sort((x,y)=>String(x.da).localeCompare(String(y.da)));minRender(i);done(i)},
  resetMin:a=>{const i=+a.dataset.i,p=S().apts[i],s=need(i);if(!s)return;gruppi(s).forEach(g=>{p.minPeriodi=togli(p.minPeriodi,g.da,g.a)});minRender(i);done(i)},
  chipMonth:a=>{const i=+a.dataset.i,p=S().apts[i],y=+a.dataset.y,mo=+a.dataset.m,n=new Date(y,mo+1,0).getDate(),busy=A.BUSY[p.id]||new Set(),ds=rangeIncl(`${y}-${pad(mo+1)}-01`,`${y}-${pad(mo+1)}-${pad(n)}`).filter(d=>d>=today&&!busy.has(d)),full=ds.every(d=>p.blocked[d]);
    ds.forEach(d=>full?delete p.blocked[d]:p.blocked[d]=true);A.markDirty();afterCal(i)},
  brDel:a=>{const i=+a.dataset.i;rangeIncl(a.dataset.a,a.dataset.b).forEach(d=>delete S().apts[i].blocked[d]);A.markDirty();afterCal(i)},
  stepAdd:a=>{const i=+a.dataset.i,p=S().apts[i];if(p.extraSteps.length>=Math.max(1,p.max-p.inclusi)){alert('Hai già uno scaglione per ogni ospite extra possibile ('+Math.max(0,p.max-p.inclusi)+').');return}p.extraSteps.push(+p.extraSteps[p.extraSteps.length-1]||0);A.markDirty();stepsRender(i);prevRender(i)},
  stepDel:a=>{const i=+a.dataset.i;S().apts[i].extraSteps.splice(+a.dataset.j,1);A.markDirty();stepsRender(i);prevRender(i)},
  perAdd:a=>{const i=+a.dataset.i;S().apts[i].periodi.push({da:'',a:'',prezzo:S().apts[i].base});A.markDirty();perRender(i)},
  perDel:a=>{const i=+a.dataset.i;S().apts[i].periodi.splice(+a.dataset.j,1);A.markDirty();perRender(i);calRender(i)},
  minAdd:a=>{const i=+a.dataset.i;S().apts[i].minPeriodi.push({da:'',a:'',min:S().apts[i].min+1});A.markDirty();minRender(i)},
  minDel:a=>{const i=+a.dataset.i;S().apts[i].minPeriodi.splice(+a.dataset.j,1);A.markDirty();minRender(i);calRender(i)}
});

// clic su una notte: giorno per giorno (Maiusc + clic = intervallo, da computer) oppure «dal… al…» (primo tocco, ultimo tocco)
function cellClick(cell,e){
  if(cell.classList.contains('past'))return;
  if(cell.classList.contains('busy')){if(cell.dataset.code)location.hash='#prenotazioni/'+cell.dataset.code;return}
  const i=+cell.dataset.i,day=cell.dataset.day,s=V.sel[i]||(V.sel[i]=new Set()),an=V.anchor[i];
  if((e.shiftKey||V.selMode==='intervallo')&&an){setSel(i,rangeIncl(an<day?an:day,an<day?day:an));V.anchor[i]=''}
  else if(V.selMode==='intervallo'){V.anchor[i]=day;s.add(day)}
  else{s.has(day)?s.delete(day):s.add(day);V.anchor[i]=day}
  calRender(i)}
A.onClick.push(e=>{const c=e.target.closest('.pcell');if(!c)return false;cellClick(c,e);return true});
A.onInput.push(el=>{const d=el.dataset;
  if(d.step){const[i,j]=d.step.split(':').map(Number);S().apts[i].extraSteps[j]=Math.max(0,+el.value||0);A.markDirty();prevRender(i);return true}
  if(d.per){const[i,j,k]=d.per.split(':');S().apts[+i].periodi[+j][k]=k==='prezzo'?(+el.value||0):el.value;A.markDirty();calRender(+i);return true}
  if(d.mp){const[i,j,k]=d.mp.split(':');S().apts[+i].minPeriodi[+j][k]=k==='min'?Math.max(1,+el.value||1):el.value;A.markDirty();calRender(+i);return true}
  return false});
// prezzo base, ospiti massimi, minimo generale: l'anteprima e il calendario si aggiornano subito
A.afterBind.push((k,a,b)=>{
  if(k==='a'&&(b==='base'||b==='inclusi'||b==='max')&&$('#prev-'+a))prevRender(+a);
  if(k==='a'&&(b==='base'||b==='min')&&$('#cal-'+a))calRender(+a);
  if(k==='closed'){const i=A.idx(a),n=$('#closed-note-'+i),c=n&&n.closest('.cal-card');if(n){n.hidden=!S().closed[a];c.classList.toggle('is-closed',!!S().closed[a])}A.nav()}});
A.onChange.push(el=>{if(!el.dataset.b)return false;const[k,a,b]=el.dataset.b.split(':');
  if(k==='a'&&(b==='inclusi'||b==='max')&&$('#steps-'+a)){const p=S().apts[+a];if(b==='inclusi'&&(+p.inclusi||0)<1)p.inclusi=1;p.extraSteps.length=Math.max(1,Math.min(p.extraSteps.length,p.max-p.inclusi));stepsRender(+a);prevRender(+a)}
  return true});
});
