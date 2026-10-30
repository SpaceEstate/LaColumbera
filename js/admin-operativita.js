// La Columbera · Gestione → OPERATIVITÀ: Oggi, Prenotazioni (elenco con ricerca e dettaglio), Guest Card.
// Si registra in window.LCAdmParts: stato e utilità comuni arrivano da js/admin.js (oggetto A).
(window.LCAdmParts=window.LCAdmParts||[]).push(function(A){
'use strict';
const {$,esc,eur,fmtD,fmtS,fmtW,addDays,today,short,V}=A;
const FONTE={BOOKING:'Booking.com',AIRBNB:'Airbnb',MANUALE:'Manuale',SITO:'Sito'};
const aptName=id=>{const p=A.aptById(id);return p?short(p):(id||'—')};
const fmtCode=c=>{c=String(c||'');return /^[0-9A-Z]{13}$/.test(c)?c.slice(0,4)+' '+c.slice(4,8)+' '+c.slice(8):c};
const notti=(da,a)=>Math.max(0,Math.round((Date.parse(a)-Date.parse(da))/864e5));
const STATO={richiesta:'richiesta',in_attesa:'in attesa di pagamento',da_verificare:'da verificare',confermata:'confermata',annullata:'annullata',calendario:'dal calendario'};
const chip=s=>`<span class="stato ${esc(s)}">${esc(STATO[s]||s)}</span>`;

// Tutte le prenotazioni note, una volta sola: sito (con il nome), foglio (Booking, Airbnb… con il loro numero), calendari iCal non ancora nel foglio.
// Il foglio contiene anche le prenotazioni del sito: quelle si prendono dal sito, che ha nome, importo e stato del pagamento.
function soggiorni(){const D=A.D,out=[],sito=new Set();
  (D.bk||[]).filter(x=>x.stato==='confermata'||x.stato==='da_verificare').forEach(x=>{sito.add(String(x.code).toUpperCase());out.push({code:x.code,id:x.id,da:x.da,a:x.a,ospiti:x.ospiti,nome:x.nome,fonte:'Sito',stato:x.stato})});
  (D.reg||[]).forEach(r=>{if(r.fonte==='SITO'||sito.has(String(r.codice).toUpperCase()))return;out.push({code:r.codice,id:r.apt,da:r.da,a:r.a,ospiti:r.ospiti,nome:'',fonte:FONTE[r.fonte]||'Altro',stato:'confermata',portale:1})});
  (D.ext||[]).forEach(e=>{if(e.src==='Foglio'||out.some(o=>o.id===e.id&&o.da===e.da))return;out.push({code:'',id:e.id,da:e.da,a:e.a,ospiti:0,nome:'',fonte:e.src||'Calendario',stato:'calendario',cal:e.t||''})});      // cal: il titolo dell'evento nel calendario
  return out.sort((x,y)=>x.da<y.da?-1:x.da>y.da?1:0)}
A.soggiorni=soggiorni;
const chi=x=>x.nome||(x.code?x.fonte+' · '+fmtCode(x.code):x.fonte+' (solo calendario)');

// ---------- Oggi ----------
// Semaforo unico: sincronizzazione (subito) + pagamenti ed email (controllo su Stripe, al più ogni 5 minuti).
function semaforo(){
  const si=A.syncIssues(),h=V.health,rows=h&&h.data?A.payRows(h.data):null;
  const err=si+(rows?rows.filter(r=>r[0]==='err').length:0),warn=(rows?rows.filter(r=>r[0]==='warn').length:0)+(h&&!h.data?1:0);
  const lv=err?'err':warn?'warn':rows?'ok':'wait';
  const pb=[...(si?['Sincronizzazione ('+si+(si===1?' punto)':' punti)')]:[]),...(rows||[]).filter(r=>r[0]==='err'||r[0]==='warn').map(r=>r[1]),...(h&&!h.data?['Controllo dei pagamenti non riuscito']:[])];
  return `<a class="adm-stat sem sem-${lv}" href="#sistema" id="oggi-sem" data-testid="admin-sync-card"><span>Stato del sistema</span><b>${{err:'Da sistemare',warn:'Da guardare',ok:'Tutto ok',wait:'Controllo…'}[lv]}</b><small>${pb.length?esc(pb.slice(0,3).join(' · ')):lv==='ok'?'calendari, foglio, pagamenti ed email funzionano':'controllo pagamenti ed email…'}</small></a>`}
const riga=x=>`<li><span class="adm-apt">${esc(aptName(x.id))}</span><span class="adm-who">${x.code?`<a href="#prenotazioni/${esc(x.code)}">${esc(chi(x))}</a>`:esc(chi(x))}${x.ospiti?` <small>· ${x.ospiti} ${x.ospiti===1?'ospite':'ospiti'}</small>`:''}${x.stato==='da_verificare'?' '+chip('da_verificare'):''}</span><small class="adm-when">${fmtS(x.da)} → ${fmtS(x.a)}</small></li>`;
const lista=(tit,l)=>l.length?`<h4 class="adm-h4">${tit} <small>${l.length}</small></h4><ul class="adm-list">${l.map(riga).join('')}</ul>`:'';
// un giorno: chi arriva e chi parte (se nessuno, una riga sola)
const giorno=(tit,d,arr,dep,casa)=>`<h3>${tit} <small class="adm-sub">${esc(fmtW(d))}</small></h3>${arr.length||dep.length||(casa&&casa.length)?lista('Arrivano',arr)+lista('Partono',dep)+(casa?lista('In casa',casa):''):'<p class="book-note">Nessun arrivo e nessuna partenza.</p>'}`;
// prossimi 7 giorni: una riga per appartamento, una casella per notte (chi c'è, bloccata o libera con il prezzo)
function settimana(st){
  const ds=[];for(let d=today;ds.length<7;d=addDays(d,1))ds.push(d);
  const cell=(p,i,d)=>{const x=st.find(z=>z.id===p.id&&z.da<=d&&d<z.a),bl=!!p.blocked[d]||!!A.S.closed[p.id];
    const lab=x?(x.nome?x.nome.split(' ')[0]:x.fonte):bl?'bloccata':eur(A.np(p,d));
    return `<a href="#calendario/${esc(p.id)}" data-act="calGo" data-i="${i}" data-d="${d}" class="wk-c${x?' busy':bl?' blk':''}" title="${esc(fmtW(d)+' · '+(x?chi(x):bl?'bloccata':'libera, '+lab))}">${esc(lab)}</a>`};
  return `<div class="wk" data-testid="admin-oggi-settimana" style="--n:${ds.length}"><span></span>${ds.map(d=>`<b>${esc(new Date(d+'T00:00:00').toLocaleDateString('it-IT',{weekday:'short'}))}<small>${+d.slice(8)}</small></b>`).join('')}
   ${A.S.apts.map((p,i)=>`<span class="wk-a">${esc(short(p))}</span>${ds.map(d=>cell(p,i,d)).join('')}`).join('')}</div>`}
A.view.oggi=()=>{
  const D=A.D,st=soggiorni(),dom=addDays(today,1),pend=A.pending(),arr=d=>st.filter(x=>x.da===d),dep=d=>st.filter(x=>x.a===d),casa=st.filter(x=>x.da<today&&x.a>today);
  const nA=arr(today).length,nP=dep(today).length,nm=+D.msgNonLetti||0;
  return `<div class="admin-card" data-testid="admin-oggi"><div class="adm-head"><h2>Oggi <small class="adm-sub">${esc(fmtW(today))}</small></h2><button type="button" class="btn btn-line" data-act="oggiRefresh" data-testid="admin-oggi-refresh">Aggiorna</button></div>
  <div class="adm-stats oggi-stats">
   <a class="adm-stat" href="#prenotazioni" data-act="bkGo" data-f="gestire" data-testid="admin-oggi-gestire"><span>Da gestire</span><b>${pend.length}</b><small>${pend.length?(pend.length===1?'prenotazione da confermare o verificare':'prenotazioni da confermare o verificare'):'nessuna prenotazione in sospeso'}</small></a>
   <a class="adm-stat" href="#messaggi" data-testid="admin-oggi-msg"><span>Messaggi</span><b>${nm}</b><small>${nm?(nm===1?'messaggio da leggere':'messaggi da leggere'):'nessun messaggio da leggere'}</small></a>
   <div class="adm-stat"><span>Oggi</span><b>${nA} · ${nP}</b><small>${nA===1?'arrivo':'arrivi'} · ${nP===1?'partenza':'partenze'}</small></div>
   ${semaforo()}</div></div>
  <div class="adm-cols">
   <div class="admin-card" data-testid="admin-oggi-fare"><h3>Da fare</h3>
    <div id="oggi-todo" data-testid="admin-oggi-todo">${V.todo?todoHtml():'<p class="book-note">Carico…</p>'}</div>
    ${pend.length?`<h4 class="adm-h4">Prenotazioni da gestire</h4><ul class="adm-list">${pend.slice(0,5).map(x=>`<li><span class="adm-apt">${esc(aptName(x.id))}</span><span class="adm-who"><a href="#prenotazioni/${esc(x.code)}">${esc(x.nome||x.code)}</a> ${chip(x.stato)}</span><small class="adm-when">${fmtS(x.da)} → ${fmtS(x.a)}</small></li>`).join('')}</ul>`:''}
    <div id="oggi-msg">${nm?'<p class="book-note">Carico i messaggi…</p>':''}</div><div id="oggi-ric"></div>
    ${!pend.length&&!nm?'<p class="adm-ok" style="margin-top:0">Niente in sospeso: prenotazioni e messaggi sono in ordine.</p>':''}
    <h4 class="adm-h4">Invii automatici di oggi e domani</h4><div id="oggi-auto" data-testid="admin-oggi-auto"><p class="book-note">Carico…</p></div></div>
   <div class="admin-card" data-testid="admin-oggi-oggi">${giorno('Oggi',today,arr(today),dep(today),casa)}${giorno('Domani',dom,arr(dom),dep(dom))}</div></div>
  <div class="admin-card"><h3 style="margin-top:0">Prossimi 7 giorni</h3>${settimana(st)}<p class="book-note">Tocca una casella per aprire il calendario di quell'appartamento.</p>
   <div class="adm-quick"><a class="btn btn-line" href="#calendario">Blocca notti o cambia prezzi</a><a class="btn btn-line" href="#prenotazioni">Cerca una prenotazione</a><a class="btn btn-line" href="#pulizie">Pulizie dei prossimi giorni</a><a class="btn btn-line" href="#messaggi">Scrivi a un ospite</a><a class="btn btn-line" href="#guestcard">Emetti Guest Card</a></div></div>`};
const rep=(id,html)=>{const el=document.getElementById(id);if(el)el.outerHTML=html};
// Cose da fare: registrare gli ospiti su Alloggiati Web a ogni arrivo (Torre e Corte), ISTAT negli ultimi 7 giorni del mese, e quelle scritte a mano.
// Ogni voce ha la sua spunta: spuntata resta sbiadita per tutto il giorno, dal giorno dopo sparisce; non spuntata resta finché non la spunti.
// Le spunte stanno sul server (todo_*): valgono su tutti i dispositivi. Contano gli arrivi dal giorno in cui la lista è partita (dal), al più 90 giorni fa.
const MESI=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
function todoAuto(t){const out=[],dal=t.dal>addDays(today,-90)?t.dal:addDays(today,-90);
  soggiorni().filter(x=>x.da>=dal&&x.da<=today&&A.aptById(x.id)).forEach(x=>out.push({id:'all:'+x.id+':'+x.da,apt:aptName(x.id),
    html:`${x.da===today?'Entra oggi':'Entrato '+esc(fmtS(x.da))}: ${x.code?`<a href="#prenotazioni/${esc(x.code)}">${esc(chi(x))}</a>`:esc(chi(x))}${x.ospiti?` <small>· ${x.ospiti} ${x.ospiti===1?'ospite':'ospiti'}</small>`:''}`,
    fare:'<a href="#adempimenti">Registra ospiti</a> <small>Alloggiati Web</small>'}));
  // ISTAT: dal primo degli ultimi 7 giorni del mese; un mese non spuntato resta anche nei mesi dopo (al più gli ultimi 3)
  for(let k=2;k>=0;k--){const d=new Date(+today.slice(0,4),+today.slice(5,7)-1-k,1),y=d.getFullYear(),mo=d.getMonth(),ym=y+'-'+String(mo+1).padStart(2,'0'),last=new Date(y,mo+1,0).getDate(),da=ym+'-'+String(last-6).padStart(2,'0');
    if(today>=da&&ym>=t.dal.slice(0,7))out.push({id:'istat:'+ym,apt:'ISTAT',html:`Movimento ospiti di ${MESI[mo]} ${y}`,fare:'<a href="#adempimenti/istat">Registra ospiti ISTAT</a>'})}
  return out}
const todoVisibile=f=>!f||f>=today;      // spuntata oggi: c'è ancora (sbiadita); spuntata prima: sparisce
function todoHtml(){const t=V.todo;if(!t)return '';
  const auto=todoAuto(t).filter(x=>todoVisibile(t.fatti[x.id])),man=t.manuali.filter(x=>todoVisibile(x.fatto)).sort((a,b)=>(!!a.fatto-!!b.fatto)||(a.creata<b.creata?-1:a.creata>b.creata?1:0));
  const spunta=(id,f,lab)=>`<input type="checkbox" class="todo-chk" data-todo="${esc(id)}"${f?' checked':''} aria-label="${esc((f?'Fatto: ':'Segna come fatto: ')+lab)}" data-testid="admin-todo-chk-${esc(id)}">`;
  // una voce: la spunta a sinistra, il contenuto impilato (resta leggibile anche nella colonna stretta del telefono)
  return `${auto.length?`<ul class="todo-list" data-testid="admin-todo-auto">${auto.map(x=>{const f=t.fatti[x.id];
    return `<li class="${f?'todo-fatto':''}" data-testid="admin-todo-${esc(x.id)}">${spunta(x.id,f,x.apt+' '+x.id)}<div class="todo-body"><span class="adm-apt">${esc(x.apt)}</span><span class="todo-txt">${x.html}</span><span class="todo-fare">${x.fare}</span></div></li>`}).join('')}</ul>`:''}
   <h4 class="adm-h4">Le mie cose da fare</h4>
   <ul class="todo-list" data-testid="admin-todo-manuali">${man.length?man.map(x=>`<li class="${x.fatto?'todo-fatto':''}" data-testid="admin-todo-${esc(x.id)}">${spunta(x.id,x.fatto,x.testo)}<div class="todo-body"><span class="todo-txt">${esc(x.testo)}</span><small class="todo-quando">scritta ${esc(fmtS(x.creata))}</small></div><button type="button" class="link-btn todo-del" data-act="todoDel" data-id="${esc(x.id)}" data-testid="admin-todo-del-${esc(x.id)}">Togli</button></li>`).join('')
     :'<li class="todo-vuota"><span class="book-note">Nessuna cosa da fare scritta da te.</span></li>'}</ul>
   <form id="todo-f" class="todo-add" data-testid="admin-todo-form"><input name="testo" maxlength="200" required placeholder="Nuova cosa da fare…" aria-label="Nuova cosa da fare" data-testid="admin-todo-testo"><button class="btn btn-line" data-testid="admin-todo-add">Aggiungi</button></form>
   <p class="admin-msg" id="todo-msg" role="alert"></p>`}
const todoPaint=()=>{const el=$('#oggi-todo');if(el)el.innerHTML=todoHtml()};
const todoErr=e=>{const m=$('#todo-msg');if(m){m.className='admin-msg warn';m.textContent=e.message}};
const todoCall=(a,b)=>A.api(a,b).then(t=>{V.todo=t;todoPaint()});
A.after.oggi=()=>{
  A.api('todo_get',{}).then(t=>{V.todo=t;todoPaint()},()=>{const el=$('#oggi-todo');if(el&&!V.todo)el.innerHTML='<p class="book-note">Cose da fare non disponibili in questo momento.</p>'});
  if(!V.health||Date.now()-V.health.ts>5*60e3)A.api('health',{}).then(d=>{V.health={ts:Date.now(),data:d}},()=>{V.health={ts:Date.now(),data:null}}).then(()=>rep('oggi-sem',semaforo()));
  if(+A.D.msgNonLetti)A.api('msg_inbox',{}).then(r=>{const el=$('#oggi-msg');if(!el)return;const c=(r.conversazioni||[]).filter(x=>x.nonLetti>0).slice(0,5);
    el.innerHTML=c.length?`<h4 class="adm-h4">Messaggi da leggere</h4><ul class="adm-list">${c.map(x=>`<li><span class="adm-apt">${esc(aptName(x.apt))}</span><span class="adm-who"><a href="#messaggi/c/${esc(x.code)}" data-testid="admin-oggi-conv-${esc(x.code)}">${esc(x.nome||x.code)}</a> <span class="adm-badge">${x.nonLetti}</span><small class="adm-prev1">${esc(x.anteprima)}</small></span></li>`).join('')}</ul>`:''},()=>{});
  // ricevute chieste dagli ospiti e non ancora mandate
  A.api('ricevute',{}).then(r=>{const el=$('#oggi-ric'),l=(r.ricevute||[]).filter(q=>q.stato==='richiesta');if(!el||!l.length)return;const by=new Map(elenco().map(x=>[x.code,x]));
    el.innerHTML=`<h4 class="adm-h4">Ricevute da mandare <small>${l.length}</small></h4><ul class="adm-list" data-testid="admin-oggi-ric">${l.slice(0,5).map(q=>{const x=by.get(q.code)||{};return `<li><span class="adm-apt">${esc(aptName(x.id))}</span><span class="adm-who"><a href="#prenotazioni/${esc(q.code)}">${esc(q.nome||q.code)}</a></span><small class="adm-when">chiesta ${esc(fmtS(String(q.richiesta_il).slice(0,10)))}</small></li>`}).join('')}</ul>`},()=>{});
  // invii automatici previsti oggi e domani (ora di Roma): li prepara il server con le regole attive
  const fino=addDays(today,2);
  A.api('msg_auto',{}).then(r=>{const el=$('#oggi-auto');if(!el)return;
    const l=(r.prossimi||[]).filter(x=>A.ymd(new Date(x.quando))<fino);
    el.innerHTML=l.length?`<ul class="adm-list">${l.map(x=>`<li><span class="adm-apt">${esc(new Date(x.quando).toLocaleString('it-IT',{weekday:'short',hour:'2-digit',minute:'2-digit'}))}</span><span class="adm-who">${esc(x.nomeRegola||x.template)} → <a href="#prenotazioni/${esc(x.code)}">${esc(x.nome||x.code)}</a>${x.stato==='saltato'?' <small>(saltato)</small>':''}</span></li>`).join('')}</ul><p class="book-note"><a href="#messaggi/automatici">Gestisci i messaggi automatici →</a></p>`
      :`<p class="book-note">Nessun invio automatico previsto. <a href="#messaggi/automatici">Messaggi automatici →</a></p>`},()=>{const el=$('#oggi-auto');if(el)el.innerHTML='<p class="book-note">Non disponibile in questo momento.</p>'})};

// ---------- Prenotazioni ----------
// Elenco: prenotazioni del sito (tutti gli stati) e quelle dei portali dal foglio (numero di Booking o Airbnb, senza nome).
function elenco(){const D=A.D,sito=new Set((D.bk||[]).map(x=>String(x.code).toUpperCase()));
  return [...(D.bk||[]).map(x=>Object.assign({fonte:'Sito'},x)),
    ...(D.reg||[]).filter(r=>r.fonte!=='SITO'&&!sito.has(String(r.codice).toUpperCase())).map(r=>({code:r.codice,id:r.apt,da:r.da,a:r.a,ospiti:r.ospiti,nome:'',email:'',tel:'',stato:'confermata',fonte:FONTE[r.fonte]||'Altro',portale:1,manuale:r.fonte==='MANUALE'?1:0,nota:r.note||''}))]}      // manuale: scritta a mano nel foglio (telefono, di persona), con la nota del foglio
const FLT=[['tutte','Tutte'],['gestire','Da gestire'],['prossime','Prossime'],['passate','Passate'],['annullata','Annullate']];
const passa=(x,f)=>f==='tutte'||(f==='gestire'&&A.GEST.includes(x.stato))||(f==='prossime'&&x.stato==='confermata'&&x.a>=today)||(f==='passate'&&x.stato==='confermata'&&x.a<today)||x.stato===f;
const ordine=(x,y)=>{const fx=x.a>=today,fy=y.a>=today;if(fx!==fy)return fx?-1:1;return (fx?1:-1)*(x.da<y.da?-1:x.da>y.da?1:0)};      // prima soggiorni in corso e futuri (dal più vicino), poi i passati (dal più recente)
const cerca=(x,q)=>{if(!q)return true;const n=s=>String(s||'').toLowerCase().replace(/\s+/g,'');q=n(q);
  return [x.code,x.nome,x.email,String(x.tel||'').replace(/\D/g,''),aptName(x.id),x.fonte].some(v=>n(v).includes(q))};
const scelte=()=>elenco().filter(x=>passa(x,V.bkf)&&(!V.bksrc||x.fonte===V.bksrc)&&cerca(x,V.bkq)).sort(ordine);
const quante=n=>n+(n===1?' prenotazione':' prenotazioni');
// ricerca e origine ridisegnano solo le righe (il campo di ricerca non perde il cursore)
const bkUpdate=()=>{const b=$('#bk-body'),rows=scelte();if(!b)return;b.innerHTML=bkRows(rows);$('#bk-n').textContent=quante(rows.length)};
function bkRows(rows){
  return rows.length?rows.map(x=>x.portale
    ?`<tr data-portale="1"><td data-label="Codice"><a href="#prenotazioni/${esc(x.code)}"><b>${esc(x.code)}</b></a></td><td data-label="App.">${esc(aptName(x.id))}</td><td data-label="Dal">${fmtD(x.da)}</td><td data-label="Al">${fmtD(x.a)}</td><td data-label="Ospiti">${x.ospiti||'—'}</td><td data-label="Cliente" class="td-cliente">${x.manuale?`Prenotazione manuale<br><small data-testid="admin-book-nota-${esc(x.code)}">${esc(x.nota?x.nota.length>90?x.nota.slice(0,90)+'…':x.nota:'presa da te, dal foglio')}</small>`:`Ospite di ${esc(x.fonte)}<br><small>nome e pagamento sul portale</small>`}</td><td data-label="Totale">—</td><td data-label="Stato">${chip('confermata')}</td><td class="td-azioni"><a class="stato-select" href="#prenotazioni/${esc(x.code)}" data-testid="admin-book-open-${esc(x.code)}">Apri</a></td></tr>`
    :`<tr><td data-label="Codice"><a href="#prenotazioni/${esc(x.code)}"><b>${esc(x.code)}</b></a></td><td data-label="App.">${esc(aptName(x.id))}</td><td data-label="Dal">${fmtD(x.da)}</td><td data-label="Al">${fmtD(x.a)}</td><td data-label="Ospiti">${x.ospiti}</td><td data-label="Cliente" class="td-cliente">${esc(x.nome)}<br>${esc(x.email)}${x.tel?'<br>'+esc(x.tel):''}${x.stato==='da_verificare'&&x.note?'<br><small class="adm-note" data-testid="admin-book-note">⚠ '+esc(x.note)+'</small>':''}</td><td data-label="Totale">${eur(x.totale)}</td><td data-label="Stato">${selStato(x)}</td><td class="td-azioni"><a class="stato-select" href="#prenotazioni/${esc(x.code)}" data-testid="admin-book-open-${esc(x.code)}">Apri</a> <button type="button" class="stato-select btn-del-book" data-act="bookDel" data-code="${esc(x.code)}" data-testid="admin-book-del-${esc(x.code)}">Rimuovi</button></td></tr>`).join('')
    :'<tr><td colspan="9" class="td-empty">Nessuna prenotazione in questa vista.</td></tr>'}
const selStato=x=>`<select class="stato-select" data-code="${esc(x.code)}" aria-label="Stato della prenotazione">${(x.stato==='da_verificare'?['da_verificare','confermata','annullata']:['richiesta','in_attesa','confermata','annullata']).map(s=>`<option${s===x.stato?' selected':''}>${s}</option>`).join('')}</select>`;
function vElenco(){
  const ext=(A.D.ext||[]).filter(e=>e.a>=today).sort((a,b)=>a.da<b.da?-1:a.da>b.da?1:0).slice(0,60),fonti=[...new Set(elenco().map(x=>x.fonte))],rows=scelte();
  return `<div class="admin-card"><div class="adm-head"><h2>Prenotazioni</h2><span class="adm-sub" id="bk-n">${quante(rows.length)}</span></div>
  <div class="bk-tools"><input type="search" id="bk-q" value="${esc(V.bkq||'')}" placeholder="Cerca: codice, nome, email, telefono" aria-label="Cerca una prenotazione" data-testid="admin-book-search">
   <select id="bk-src" aria-label="Origine" data-testid="admin-book-src"><option value="">Tutte le origini</option>${fonti.map(f=>`<option${V.bksrc===f?' selected':''}>${esc(f)}</option>`).join('')}</select></div>
  <div class="adm-tabs">${FLT.map(([k,l])=>`<a href="#prenotazioni" data-act="bkf" data-f="${k}" class="${V.bkf===k?'on':''}">${l}</a>`).join('')}</div>
  <div class="table-wrap tw-bk" data-testid="admin-bookings"><table class="data bkt"><thead><tr><th>Codice</th><th>App.</th><th>Dal</th><th>Al</th><th>Ospiti</th><th>Cliente</th><th>Totale</th><th>Stato</th><th></th></tr></thead><tbody id="bk-body">${bkRows(rows)}</tbody></table></div>
  <p class="book-note">Le prenotazioni di Booking.com e Airbnb arrivano dal foglio: nome e pagamento restano sul portale, qui hai il numero da dare all'ospite per l'area clienti. Una prenotazione presa da te (telefono, di persona) la scrivi nel foglio Prenotazioni senza numero: data di check-in, appartamento, ospiti, notti e, nella colonna NOTE, quello che vuoi ricordare (per esempio il prezzo). Il codice lo mette il foglio da solo e qui compare come «Manuale».</p></div>
  <div class="admin-card"><details><summary class="adm-sum">Occupazione dai calendari e dal foglio (sola lettura)</summary><p class="book-note">Soggiorni importati da Airbnb, Booking o dal foglio, prossimi arrivi.</p>
  <div class="table-wrap tw-stack"><table class="data stack"><thead><tr><th>App.</th><th>Dal</th><th>Al</th><th>Origine</th></tr></thead><tbody>${ext.length?ext.map(e=>`<tr><td data-label="App.">${esc(aptName(e.id))}</td><td data-label="Dal">${fmtD(e.da)}</td><td data-label="Al">${fmtD(e.a)}</td><td data-label="Origine">${esc(e.src||'')}</td></tr>`).join(''):'<tr><td colspan="4" class="td-empty">Nessun soggiorno esterno in arrivo.</td></tr>'}</tbody></table></div></details></div>
  <div class="admin-card adm-link-card"><p class="book-note" style="margin:0">Preavviso minimo, orari di check-in e check-out, informazioni dell'area ospiti: <a href="#regole">Sito → Regole di prenotazione →</a></p></div>`}

// Dettaglio: soggiorno, ospite, pagamento, accesso all'area ospiti (codice e messaggio da copiare), messaggi, azioni.
function vDettaglio(code){
  const x=elenco().find(z=>String(z.code).toUpperCase()===String(code).toUpperCase()),back='<a href="#prenotazioni" class="adm-back">← Tutte le prenotazioni</a>';
  if(!x)return `<div class="admin-card" data-testid="admin-book-missing">${back}<h2>Prenotazione non trovata</h2><p class="book-note">Il codice ${esc(code)} non è tra le prenotazioni del sito né nel foglio.</p></div>`;
  const n=x.notti||notti(x.da,x.a),S=A.S,ct=x.conto&&Array.isArray(x.conto.righe)?x.conto:null;
  const cella=(k,v)=>`<div class="bc-cell"><span>${k}</span><b>${v}</b></div>`;
  const tel=String(x.tel||'').replace(/[^\d+]/g,''),wa=tel.replace(/^\+/,'').replace(/^00/,'');
  const pay=x.manuale?'<p>Pagamento fuori dal sito (contanti, bonifico…): lo segui tu. Se vuoi ricordarlo, scrivilo nella colonna NOTE del foglio.</p>'
    :x.portale?`<p>Pagamento gestito da ${esc(x.fonte)}: importo e ricevuta sono sul portale.</p>`
    :`<div class="ga-rows">${ct?ct.righe.map(r=>`<div><span>${r.notti} ${r.notti===1?'notte':'notti'} × ${eur(r.prezzo)}${ct.righe.length>1?' · dal '+fmtS(r.dal):''}</span><b>${eur(r.notti*r.prezzo)}</b></div>`).join('')+(ct.supplemento>0?`<div><span>Ospiti in più: ${n} ${n===1?'notte':'notti'} × ${eur(ct.supplemento)}</span><b>${eur(ct.supplemento*n)}</b></div>`:''):''}<div class="ga-tot"><span>Totale</span><b data-testid="admin-book-total">${eur(x.totale)}</b></div></div>
      ${x.rimborso?`<p class="adm-ok" data-testid="admin-book-rimborso">↩ Rimborsati ${eur(x.rimborso.importo)} ${A.ilD(String(x.rimborso.il||x.annullata_il||'').slice(0,10))} · ${x.annullata_da==='ospite'?'annullata dall\'ospite dall\'area clienti':'annullata da te'}${x.rimborso.stato==='pending'?' · rimborso in corso su Stripe':x.rimborso.stato==='gia_rimborsato'?' · era già rimborsata su Stripe':''}</p>`:''}
      <p class="book-note">${x.pagamento?`✓ Pagata con carta${x.confermata_il?' '+A.ilD(String(x.confermata_il).slice(0,10)):''}. <a href="https://dashboard.stripe.com/payments/${esc(encodeURIComponent(x.pagamento))}" target="_blank" rel="noopener">Vedi su Stripe ↗</a>`:x.stato==='in_attesa'?'In attesa del pagamento (l\'ospite è sulla pagina di Stripe o l\'ha lasciata).':x.stato==='da_verificare'?'Pagata, ma serve una tua decisione: vedi lo stato qui sotto.':'Nessun pagamento registrato.'}</p>`;
  const chat=!x.portale&&x.stato==='confermata';
  return `<div class="admin-card" data-testid="admin-book-${esc(x.code)}">${back}
   <div class="adm-head"><h2>${esc(x.nome||(x.manuale?'Prenotazione manuale':'Ospite di '+x.fonte))} <small class="adm-sub">${esc(aptName(x.id))}</small></h2>${chip(x.stato)}</div>
   <div class="bc-grid bc-4">${cella('Arrivo',esc(fmtW(x.da))+' · dalle '+esc(S.checkinOra))}${cella('Partenza',esc(fmtW(x.a))+(S.checkoutOra?' · entro le '+esc(S.checkoutOra):''))}${cella('Notti',n)}${cella('Ospiti',x.ospiti||'—')}${cella('Origine',esc(x.fonte))}${x.creato?cella('Prenotata il',fmtD(String(x.creato).slice(0,10))):''}</div>
   ${x.note?`<p class="adm-warn" data-testid="admin-book-note">⚠ ${esc(x.note)}</p>`:''}${x.manuale&&x.nota?`<p class="book-note" data-testid="admin-book-nota"><b>Nota del foglio:</b> ${esc(x.nota)}</p>`:''}</div>
  <div class="adm-cols">
   <div class="admin-card"><h3>Ospite</h3>${x.manuale?'<p>Prenotazione presa da te: nome e contatti non sono nel sito. Puoi scriverli nella colonna NOTE del foglio.</p>':x.portale?`<p>Nome e contatti sono su ${esc(x.fonte)}: scrivigli dalla chat del portale.</p>`:`<p><b>${esc(x.nome)}</b></p><p>${x.email?`<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>`:'—'}</p>${tel?`<p><a href="tel:${esc(tel)}">${esc(x.tel)}</a> · <a href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">WhatsApp ↗</a></p>`:''}`}</div>
   <div class="admin-card" data-testid="admin-book-pay"><h3>Pagamento</h3>${pay}</div></div>
  <div class="admin-card" data-testid="admin-book-area"><h3>Area ospiti</h3>
   <p class="book-note">Con questo codice l'ospite entra nell'area clienti (check-in online, Guest Card, informazioni${chat?', messaggi':''}).${x.manuale?' Mandaglielo per WhatsApp, SMS o email con il messaggio qui sotto.':x.portale?' Mandalo dalla chat del portale con il messaggio qui sotto.':''}</p>
   <div class="adm-copy"><b class="code-g" data-testid="admin-book-code">${esc(fmtCode(x.code))}</b><button type="button" class="btn btn-line" data-act="copy" data-v="${esc(x.code)}" data-testid="admin-book-copy">Copia il codice</button></div>
   <div class="field" style="margin-top:14px;max-width:460px"><label for="bk-tpl">Messaggio da mandare</label><select id="bk-tpl" data-testid="admin-book-tpl"><option value="">Carico i template…</option></select></div>
   <button type="button" class="btn btn-wine" data-act="bkFill" data-code="${esc(x.code)}" data-testid="admin-book-fill">Prepara e copia</button> <span class="admin-msg" id="bk-fill-msg"></span>
   <textarea id="bk-fill" rows="6" readonly hidden data-testid="admin-book-text" style="margin-top:12px"></textarea></div>
  <div class="admin-card" data-testid="admin-book-ric"><h3>Ricevuta</h3><div id="bk-ric"><p class="book-note">Carico…</p></div></div>
  <div class="admin-card" data-testid="admin-book-msg"><h3>Messaggi</h3><div id="bk-msg">${chat?'<p class="book-note">Carico…</p>':x.manuale?'<p>Per le prenotazioni manuali la chat del sito non c\'è: il messaggio qui sopra, con il link all\'area ospiti, mandaglielo per WhatsApp, SMS o email.</p>':x.portale?`<p>Gli ospiti di ${esc(x.fonte)} ti scrivono sul portale: dal sito non si chatta. Qui sopra trovi il messaggio con il link all'area ospiti da incollare nella chat.</p>`:'<p class="book-note">Si può scrivere all\'ospite quando la prenotazione è confermata.</p>'}</div></div>
  <div class="admin-card" data-testid="admin-book-actions"><h3>Azioni</h3><div class="adm-quick">
   ${x.manuale?'<p class="book-note" data-testid="admin-book-manuale">Per cambiarla o annullarla modifica la sua riga nel foglio Prenotazioni: con STATO = ANNULLATA le notti tornano libere. Sette giorni dopo il check-out la riga si cancella da sola.</p>':x.portale?'':`<label class="adm-inp">Stato ${selStato(x)}</label>`}
   <a class="btn btn-line" href="#guestcard" data-act="gcFrom" data-code="${esc(x.code)}" data-testid="admin-book-gc">Emetti Guest Card</a>
   <a class="btn btn-line" href="#calendario/${esc(x.id)}" data-act="calGo" data-i="${A.idx(x.id)}" data-d="${esc(x.da)}">Vedi nel calendario</a>
   ${!x.portale&&x.pagamento&&(x.stato==='confermata'||x.stato==='da_verificare')?`<button type="button" class="btn btn-line btn-del-book" data-act="bkRimborsa" data-code="${esc(x.code)}" data-testid="admin-book-rimborsa">Annulla e rimborsa ${eur(x.totale)}</button>`:''}
   ${x.portale?'':`<button type="button" class="btn btn-line btn-del-book" data-act="bookDel" data-code="${esc(x.code)}" data-back="1">Rimuovi dallo storico</button>`}</div></div>`}
A.view.prenotazioni=r=>r.sub?vDettaglio(r.sub):vElenco();
A.after.prenotazioni=r=>{
  if(!r.sub)return;
  const x=elenco().find(z=>String(z.code).toUpperCase()===r.sub.toUpperCase());if(!x)return;
  ricLoad(x);
  // template: per Booking e Airbnb quello con il link all'area ospiti, per il sito il benvenuto
  A.api('msg_tpl',{}).then(j=>{const el=$('#bk-tpl');if(!el)return;const l=j.templates||[],pre=x.portale?'portale':'benvenuto';
    el.innerHTML=l.length?l.map(t=>`<option value="${esc(t.id)}"${t.id===pre?' selected':''}>${esc(t.nome)}</option>`).join(''):'<option value="">Nessun template</option>';V.tpl=l},()=>{});
  if(x.portale||x.stato!=='confermata')return;
  Promise.all([A.api('msg_inbox',{}).catch(()=>null),A.api('msg_auto',{}).catch(()=>null)]).then(([ib,au])=>{const el=$('#bk-msg');if(!el)return;
    const c=ib&&(ib.conversazioni||[]).find(z=>z.code===x.code),pr=au?(au.prossimi||[]).filter(z=>z.code===x.code):[],pg=au?(au.programmati||[]).filter(z=>z.code===x.code):[];
    const quando=ms=>new Date(ms).toLocaleString('it-IT',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
    el.innerHTML=(c?`<p>${c.nonLetti?`<span class="adm-badge">${c.nonLetti}</span> da leggere · `:''}ultimo messaggio ${c.da==='ospite'?'dell\'ospite':'tuo'}: «${esc(c.anteprima)}»</p>`:'<p>Nessun messaggio finora.</p>')
      +(pr.length||pg.length?`<h4 class="adm-h4">In programma</h4><ul class="adm-list">${pr.map(z=>`<li><span class="adm-apt">${esc(quando(z.quando))}</span><span class="adm-who">${esc(z.nomeRegola||z.template)} <small>(automatico${z.stato==='saltato'?', saltato':''})</small></span></li>`).join('')}${pg.map(z=>`<li><span class="adm-apt">${esc(quando(Date.parse(z.quando)))}</span><span class="adm-who">«${esc(String(z.testo).slice(0,80))}» <small>(programmato da te)</small></span></li>`).join('')}</ul>`:'')
      +`<a class="btn btn-wine" href="#messaggi/c/${esc(x.code)}" data-testid="admin-book-chat">${c?'Apri la conversazione':'Scrivi all\'ospite'}</a>`})};

// ---------- Ricevuta (api/_ricevute.js): l'ospite la chiede dall'area clienti, tu la emetti e la mandi da qui ----------
const ricDati=q=>[['Intestata a',q.nome],['Codice fiscale',q.cf||'—'],['Indirizzo',[q.indirizzo,[q.cap,q.citta].filter(Boolean).join(' '),q.paese].filter(Boolean).join(', ')],...(q.nota?[['Nota',q.nota]]:[])];
function ricHtml(x,q){
  const dove=(q&&q.email)||x.email||'',invio=`<div class="field"><label for="ric-file">Ricevuta (PDF, oppure foto JPG o PNG; al massimo 3 MB)</label><input type="file" id="ric-file" accept="application/pdf,image/jpeg,image/png" data-testid="admin-ric-file"></div>
   <div class="field"><label for="ric-msg">Messaggio per l'ospite (facoltativo)</label><textarea id="ric-msg" rows="2" maxlength="1000" placeholder="es. Grazie ancora per il soggiorno!"></textarea></div>
   <div class="adm-quick"><button type="button" class="btn btn-wine" data-act="ricInvia" data-code="${esc(x.code)}" data-testid="admin-ric-invia">Manda la ricevuta${dove?' a '+esc(dove):''}</button>`;
  if(!q)return x.portale?'<p class="book-note">L\'ospite la può chiedere dall\'area clienti: ti arriva un\'email con i dati per intestarla.</p>'
    :dove?`<p class="book-note">L'ospite non l'ha chiesta (la può chiedere dall'area clienti). Se vuoi mandargliela lo stesso, carica il file:</p>${invio}</div><span class="admin-msg" id="ric-out"></span>`:'<p class="book-note">Nessuna richiesta.</p>';
  const dati=ricDati(q),testo=dati.map(([k,v])=>k+': '+v).join('\n');
  return `<p>${q.stato==='inviata'?`<span class="stato confermata">mandata</span> ${A.ilD(String(q.inviata_il).slice(0,10))} a ${esc(dove)}${q.file?' · '+esc(q.file):''}`:`<span class="stato da_verificare">da mandare</span> chiesta ${A.ilD(String(q.richiesta_il).slice(0,10))}`}</p>
   <dl class="ric-dati" data-testid="admin-ric-dati">${dati.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}<dt>Mandala a</dt><dd>${esc(dove||'—')}${q.email?'':' <small>(email della prenotazione)</small>'}</dd></dl>
   <div class="adm-quick"><button type="button" class="btn btn-line" data-act="copy" data-v="${esc(testo)}" data-testid="admin-ric-copy">Copia i dati</button></div>
   ${q.stato==='inviata'?`<details class="ric-di-nuovo"><summary>Manda di nuovo</summary>${invio}</div></details><div class="adm-quick"><button type="button" class="btn btn-line" data-act="ricStato" data-stato="richiesta" data-code="${esc(x.code)}">Segna come da mandare</button></div>`
     :`${invio}<button type="button" class="btn btn-line" data-act="ricStato" data-stato="inviata" data-code="${esc(x.code)}" data-testid="admin-ric-fatta">Segna come mandata</button><button type="button" class="btn btn-line btn-del-book" data-act="ricStato" data-stato="elimina" data-code="${esc(x.code)}" data-testid="admin-ric-togli">Togli la richiesta</button></div>`}
   <span class="admin-msg" id="ric-out"></span>`}
const ricLoad=x=>A.api('ricevute',{}).then(r=>{V.ric=r.ricevute||[];const el=$('#bk-ric');if(el)el.innerHTML=ricHtml(x,V.ric.find(q=>q.code===x.code))},()=>{const el=$('#bk-ric');if(el)el.innerHTML='<p class="book-note">Non disponibile in questo momento.</p>'});
const leggiFile=f=>new Promise((ok,ko)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>ko(Error('File non leggibile'));r.readAsDataURL(f)});

// ---------- Guest Card ----------
function vGc(){
  const conf=A.D.bk.filter(x=>x.stato==='confermata'&&x.a>=today),GC=A.GC;
  return `<div class="admin-card" data-testid="admin-gc"><h2>Emetti una Guest Card</h2>
  <p class="book-note">Per ospiti arrivati da Airbnb, Booking o fuori sito: scegli date e numero di ospiti, l'ospite riceve la mail per attivare la card (Trentino Guest Card).</p>
  ${conf.length?`<div class="field"><label>Precompila da una prenotazione confermata del sito</label><select id="gc-pre"><option value="">— scegli —</option>${conf.map(x=>`<option value="${esc(x.code)}">${esc(x.nome)} · ${fmtS(x.da)}→${fmtS(x.a)} · ${esc(aptName(x.id))}</option>`).join('')}</select></div>`:''}
  <form id="gcf" class="adm-form">
   <div class="fields-grid">
    <div class="field"><label>Appartamento</label><select name="apt">${A.S.apts.map(p=>`<option value="${p.id}">${esc(short(p))}</option>`).join('')}<option value="">Altro / esterno</option></select></div>
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
// precompila il modulo: da una prenotazione del sito (anche con nome ed email) o del foglio (solo appartamento, date e ospiti)
const gcFill=code=>{const x=elenco().find(k=>k.code===code),f=$('#gcf');if(!x||!f)return;const E=f.elements;
  E.apt.value=A.aptById(x.id)?x.id:'';E.nome.value=x.nome||'';E.email.value=x.email||'';E.da.value=x.da;E.a.value=x.a;E.ospiti.value=x.ospiti||2;
  const s=$('#gc-pre');if(s)s.value=x.portale?'':code};
A.view.guestcard=vGc;
A.after.guestcard=()=>{if(V.gcFrom){gcFill(V.gcFrom);V.gcFrom=''}};

Object.assign(A.act,{
  bkf:(a,e)=>{e.preventDefault();V.bkf=a.dataset.f;A.body()},
  todoDel:a=>{if(confirm('Togliere questa cosa da fare?'))todoCall('todo_del',{id:a.dataset.id}).catch(todoErr)},
  bkGo:a=>{V.bkf=a.dataset.f||'tutte'},
  gcFrom:a=>{V.gcFrom=a.dataset.code},
  oggiRefresh:async a=>{a.disabled=true;V.health=null;await A.refreshAdm();A.body()},
  bkRimborsa:async a=>{const x=elenco().find(z=>z.code===a.dataset.code);if(!x)return;
    if(!confirm('Annullare la prenotazione di '+(x.nome||x.code)+' e rimborsare '+eur(x.totale)+' sulla carta con cui ha pagato? Non si può tornare indietro: le notti tornano libere e all\'ospite arriva un\'email.'))return;
    a.disabled=true;a.textContent='Rimborso in corso…';
    try{await A.api('rimborsa',{code:x.code});await A.refreshAdm();A.body()}catch(e){alert(e.message);a.disabled=false;a.textContent='Annulla e rimborsa '+eur(x.totale)}},
  ricInvia:async a=>{const inp=$('#ric-file'),o=$('#ric-out'),f=inp&&inp.files&&inp.files[0];o.className='admin-msg';
    if(!f){o.className='admin-msg warn';o.textContent='Scegli prima il file della ricevuta';return}
    if(f.size>3*1024*1024){o.className='admin-msg warn';o.textContent='Il file è troppo grande: al massimo 3 MB';return}
    a.disabled=true;o.textContent='Invio in corso…';
    try{const r=await A.api('ricevuta_invia',{code:a.dataset.code,file:await leggiFile(f),nome:f.name,messaggio:($('#ric-msg')||{}).value||''});
      const x=elenco().find(z=>z.code===a.dataset.code);if(x)await ricLoad(x);const o2=$('#ric-out');if(o2){o2.className='admin-msg ok';o2.textContent='Ricevuta mandata a '+r.ricevuta.invio+'.'}}
    catch(e){o.className='admin-msg warn';o.textContent=e.message;a.disabled=false}},
  ricStato:async a=>{if(a.dataset.stato==='elimina'&&!confirm('Togliere la richiesta di ricevuta? I dati inseriti dall\'ospite si cancellano.'))return;
    try{await A.api('ricevuta_stato',{code:a.dataset.code,stato:a.dataset.stato});const x=elenco().find(z=>z.code===a.dataset.code);if(x)await ricLoad(x)}catch(e){alert(e.message)}},
  bookDel:a=>{if(confirm('Rimuovere definitivamente questa prenotazione dallo storico?'))A.api('book_del',{code:a.dataset.code}).then(async()=>{await A.refreshAdm();if(a.dataset.back)location.hash='#prenotazioni';else A.body()}).catch(x=>alert(x.message))},
  bkFill:async a=>{const id=($('#bk-tpl')||{}).value,tp=(V.tpl||[]).find(x=>x.id===id),o=$('#bk-fill-msg'),out=$('#bk-fill');if(!tp){o.textContent='Scegli un template';return}
    o.className='admin-msg';o.textContent='Preparo…';
    // per la chat del portale, WhatsApp o un'email: i link «[testo](indirizzo)» diventano «testo: indirizzo», le foto del template indirizzi da aprire
    try{const r=await A.api('msg_fill',{code:a.dataset.code,testo:tp.testo}),foto=tp.foto||[];
      const testo=String(r.testo||'').replace(/\[([^\]\n]{1,200})\]\s?\((https?:\/\/[^\s()<>"]+)\)/g,'$1: $2')+(foto.length?(r.testo?'\n\n':'')+(foto.length>1?'Foto:\n':'Foto: ')+foto.join('\n'):'');
      out.value=testo;out.hidden=false;
      A.copy(testo);o.className='admin-msg ok';o.textContent=navigator.clipboard?'Copiato: incollalo nella chat o in una email.':'Copialo dal riquadro qui sotto.'}
    catch(x){o.className='admin-msg warn';o.textContent=x.message}},
  gcAuth:async()=>{const o=$('#gcout');o.textContent='Reindirizzo a Trentino Marketing…';try{const{url}=await A.api('gc_oauth_start',{});location.href=url}catch(x){o.textContent='Errore: '+x.message}},
  gcTip:async()=>{const o=$('#gcout');o.textContent='Carico…';try{o.textContent=JSON.stringify(await A.api('gc_tipologie',{}),null,2)}catch(x){o.textContent='Errore: '+x.message}},
  gcAttr:async()=>{const o=$('#gcout'),id=$('#gcattrid').value.trim();if(!id){o.textContent='Inserisci prima l\'idTipologiaCard (dal pulsante "Mostra tipologie card")';return}o.textContent='Carico…';try{o.textContent=JSON.stringify(await A.api('gc_attributi',{idTipologiaCard:id}),null,2)}catch(x){o.textContent='Errore: '+x.message}}
});
A.onInput.push(el=>{if(el.id!=='bk-q')return false;V.bkq=el.value;bkUpdate();return true});
A.onChange.push(el=>{
  if(el.dataset.todo){const id=el.dataset.todo,fatto=el.checked,r=el.closest('li');if(r)r.classList.toggle('todo-fatto',fatto);
    todoCall('todo_check',{id,fatto}).catch(e=>{el.checked=!fatto;if(r)r.classList.toggle('todo-fatto',!fatto);todoErr(e)});return true}
  if(el.id==='bk-src'){V.bksrc=el.value;bkUpdate();return true}
  if(el.dataset.code&&el.tagName==='SELECT'){A.setStato(el.dataset.code,el.value);return true}
  if(el.id==='gc-pre'){gcFill(el.value);return true}
  return false});
A.onSubmit.push((f,e)=>{if(f.id!=='todo-f')return false;e.preventDefault();
  const testo=f.elements.testo.value.trim(),btn=f.querySelector('button');if(!testo)return true;btn.disabled=true;
  todoCall('todo_add',{testo}).then(()=>{const i=$('#todo-f input');if(i)i.focus()}).catch(e=>{btn.disabled=false;todoErr(e)});
  return true});
A.onSubmit.push((f,e)=>{if(f.id!=='gcf')return false;e.preventDefault();
  const b=Object.fromEntries(new FormData(f)),msg=$('#gc-msg'),btn=$('#gc-go');
  if(b.a<=b.da){msg.textContent='La partenza deve essere dopo l\'arrivo';return true}
  btn.disabled=true;msg.textContent='Emissione in corso…';
  A.api('gc_manual_issue',b).then(r=>{A.GC.unshift(r);msg.textContent='';
    $('#gc-res').innerHTML=`<div class="adm-ok" data-testid="gc-success"><b>Guest Card richiesta ✔</b><br>${r.gc_id?'Codice: <b>'+esc(r.gc_id)+'</b><br>':''}Periodo: ${fmtD(r.da)} → ${fmtD(r.a)} · ${r.ospiti} ospiti<br>L'ospite riceverà una mail a <b>${esc(r.email)}</b> per completare l'attivazione.</div>`;
    f.reset();f.elements.ospiti.value=2}).catch(x=>{msg.textContent=x.message}).finally(()=>{btn.disabled=false});
  return true});
});
