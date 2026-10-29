// La Columbera · Gestione → OPERATIVITÀ → Pulizie: nel periodo scelto, per ogni appartamento chi esce e chi entra giorno per giorno
// (ospiti, notti, come preparare i letti, una nota) e il testo pronto da copiare e mandare a chi fa le pulizie.
// Nel testo non ci sono nomi né contatti degli ospiti: a chi pulisce bastano giorni, orari, persone e letti (i nomi li vedi solo tu, qui).
// Le prenotazioni lette male o doppie (es. un blocco del calendario di Airbnb, la stessa prenotazione dal foglio e dal calendario con date
// diverse) si tolgono dal testo con la spunta «Nel testo»: restano qui in grigio. Chi si sovrappone a un'altra prenotazione è segnalato.
// Letti: quanti matrimoniali e quanti singoli (si combinano: 3 ospiti = 1 matrimoniale e 1 singolo), più la culla. Nel testo non c'è l'orario
// d'ingresso (a chi pulisce non serve), resta quello d'uscita. Letti, culla, nota e «Nel testo» si salvano subito (api/x.js, azioni pul_info
// e pul_set). Si registra in window.LCAdmParts (vedi js/admin.js).
(window.LCAdmParts=window.LCAdmParts||[]).push(function(A){
'use strict';
const {$,esc,addDays,today,short,V}=A;
const MAX={mat:3,sing:6};      // per arrivo, come sul server
// letti dell'arrivo: i contatori; una scelta salvata prima dei contatori vale ancora (m = un matrimoniale, s = «letti singoli», senza numero)
const letti=i=>i.mat!=null||i.sing!=null?{mat:+i.mat||0,sing:+i.sing||0}:i.letto==='m'?{mat:1,sing:0}:{mat:0,sing:0};
const lettiTxt=i=>{const l=letti(i),p=[];
  if(l.mat)p.push(l.mat===1?'1 letto matrimoniale':l.mat+' letti matrimoniali');
  if(l.sing)p.push(l.sing===1?'1 letto singolo':l.sing+' letti singoli');
  return (p.length?p.join(' e '):i.letto==='s'?'letti singoli':'letti da confermare')+(i.culla?', culla':'')};
const giorno=d=>new Date(d+'T00:00:00').toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});
const breve=d=>new Date(d+'T00:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long'});
const maiusc=s=>s.charAt(0).toUpperCase()+s.slice(1);
const chiave=(p,x)=>x.code||'cal:'+p.id+':'+x.da;      // prenotazione vista solo nei calendari iCal: appartamento + giorno di arrivo
const info=k=>(V.pul||{})[k]||{};
const persone=n=>n?n+(n===1?' ospite':' ospiti'):'ospiti da confermare';
const notti=x=>Math.max(1,Math.round((Date.parse(x.a)-Date.parse(x.da))/864e5));
const chi=x=>x.nome||(x.code?x.fonte+' · '+x.code:x.fonte+' (solo calendario'+(x.cal?': «'+x.cal+'»':'')+')');      // solo per te, mai nel testo
const fuori=(p,x)=>!!info(chiave(p,x)).fuori;      // tolta dal testo dal titolare
// le altre prenotazioni dello stesso appartamento con cui le notti si accavallano (solo tra quelle rimaste nel testo; arrivare il giorno in cui un altro parte va bene)
const sovrapposte=(p,x,tutte)=>fuori(p,x)?[]:tutte.filter(y=>chiave(p,y)!==chiave(p,x)&&!fuori(p,y)&&x.da<y.a&&y.da<x.a);      // per chiave: A.soggiorni() crea oggetti nuovi a ogni chiamata

// entrate e uscite dell'appartamento nel periodo, giorno per giorno (stesse prenotazioni di Oggi: sito, foglio, calendari, senza doppioni)
const suoi=p=>(A.soggiorni?A.soggiorni():[]).filter(x=>x.id===p.id);
function movimenti(p,da,al){const g={},add=(d,k,x)=>{(g[d]=g[d]||{d,esce:[],entra:[]})[k].push(x)};
  suoi(p).forEach(x=>{if(x.a>=da&&x.a<=al)add(x.a,'esce',x);if(x.da>=da&&x.da<=al)add(x.da,'entra',x)});
  return Object.values(g).sort((x,y)=>x.d<y.d?-1:1)}
// solo ciò che va nel testo: le prenotazioni tolte non ci sono, e un giorno senza movimenti rimasti sparisce
const nelTesto=(p,mov)=>mov.map(g=>({d:g.d,esce:g.esce.filter(x=>!fuori(p,x)),entra:g.entra.filter(x=>!fuori(p,x))})).filter(g=>g.esce.length||g.entra.length);
// il messaggio per chi pulisce: il nome dell'appartamento e poi i giorni; il periodo scelto qui («dal … al …») nel testo non c'è
function testo(p,tutti){const S=A.S,L=['PULIZIE '+short(p).toUpperCase(),''],mov=nelTesto(p,tutti);
  if(!mov.length)L.push('Nessuna entrata e nessuna uscita in questo periodo.');
  for(const g of mov){
    L.push(maiusc(giorno(g.d))+(g.esce.length&&g.entra.length?' — cambio':''));
    g.esce.forEach(x=>L.push('• esce: '+persone(x.ospiti)+(S.checkoutOra?', entro le '+S.checkoutOra:'')));
    g.entra.forEach(x=>{const i=info(chiave(p,x)),n=notti(x);L.push('• entra: '+persone(x.ospiti)+', '+n+(n===1?' notte':' notti')+', '+lettiTxt(i)+(i.nota?' — '+i.nota:''))});
    L.push('')}
  return L.join('\n').trim()}
function scheda(p,da,al){const mov=movimenti(p,da,al),S=A.S,tutte=suoi(p),dentro=nelTesto(p,mov);let ne=0,nu=0,nf=0;dentro.forEach(g=>{nu+=g.esce.length;ne+=g.entra.length});
  mov.forEach(g=>[...g.esce,...g.entra].forEach(x=>{if(fuori(p,x))nf++}));
  // la spunta «Nel testo» e l'avviso se le notti si accavallano con un'altra prenotazione
  const inc=(x,cosa)=>{const k=chiave(p,x);return `<label class="pul-inc"><input type="checkbox" class="pul-chk" data-pk="${esc(k)}" data-a="${esc(x.a)}"${fuori(p,x)?'':' checked'} data-testid="admin-pul-inc-${esc(k)}-${cosa}"> Nel testo</label>`};
  const avviso=x=>{const o=sovrapposte(p,x,tutte);return o.length?`<span class="pul-warn" data-testid="admin-pul-warn-${esc(chiave(p,x))}">⚠ Si sovrappone a ${o.map(y=>esc(chi(y))+' ('+esc(breve(y.da))+' → '+esc(breve(y.a))+')').join(', ')}: togli dal testo quella sbagliata</span>`:fuori(p,x)?'<span class="pul-off">Tolta dal testo</span>':''};
  const esce=x=>`<div class="pul-mov${fuori(p,x)?' fuori':''}"><span class="pul-k esce">Esce</span><span class="pul-d">${esc(persone(x.ospiti))}${S.checkoutOra?' · entro le '+esc(S.checkoutOra):''}<small>${esc(chi(x))}</small>${avviso(x)}</span>${inc(x,'esce')}</div>`;
  // un contatore: − numero + (matrimoniali o singoli)
  const passo=(k,x,f,n)=>{const nome=f==='mat'?(n===1?'matrimoniale':'matrimoniali'):(n===1?'singolo':'singoli'),cosa=f==='mat'?'letto matrimoniale':'letto singolo';
    return `<span class="pul-step"><button type="button" data-act="pulLetti" data-k="${esc(k)}" data-f="${f}" data-d="-1" data-a="${esc(x.a)}" aria-label="Un ${cosa} in meno" data-testid="admin-pul-${f}-${esc(k)}-meno">−</button><b data-testid="admin-pul-${f}-${esc(k)}">${n}</b><button type="button" data-act="pulLetti" data-k="${esc(k)}" data-f="${f}" data-d="1" data-a="${esc(x.a)}" aria-label="Un ${cosa} in più" data-testid="admin-pul-${f}-${esc(k)}-piu">+</button><span>${nome}</span></span>`};
  const entra=x=>{const k=chiave(p,x),i=info(k),n=notti(x),l=letti(i),posti=l.mat*2+l.sing+(i.culla?1:0);
    const nota=l.mat||l.sing?(x.ospiti&&posti<x.ospiti?`<span class="pul-ask" data-testid="admin-pul-posti-${esc(k)}">⚠ ${posti} ${posti===1?'posto':'posti'} per ${x.ospiti} ospiti</span>`:''):i.letto==='s'?'<span class="pul-ask">scelta di prima: letti singoli</span>':'<span class="pul-ask">da scegliere</span>';
    return `<div class="pul-mov${fuori(p,x)?' fuori':''}"><span class="pul-k entra">Entra</span><span class="pul-d">${esc(persone(x.ospiti))} · ${n} ${n===1?'notte':'notti'}<small>${esc(chi(x))}</small>${avviso(x)}</span>${inc(x,'entra')}
     <div class="pul-letto" role="group" aria-label="Letti da preparare">${passo(k,x,'mat',l.mat)}${passo(k,x,'sing',l.sing)}<label class="pul-culla"><input type="checkbox" class="pul-culla-chk" data-pk="${esc(k)}" data-a="${esc(x.a)}"${i.culla?' checked':''} data-testid="admin-pul-culla-${esc(k)}"> Culla</label>${nota}</div>
     <input class="pul-nota" data-pk="${esc(k)}" data-a="${esc(x.a)}" data-id="${p.id}" value="${esc(i.nota||'')}" maxlength="200" placeholder="Nota per le pulizie (facoltativa): seggiolone, asciugamani in più…" aria-label="Nota per le pulizie" data-testid="admin-pul-nota-${esc(k)}"></div>`};
  const cambio=g=>g.esce.some(x=>!fuori(p,x))&&g.entra.some(x=>!fuori(p,x));
  return `<div class="admin-card pul-card" data-testid="admin-pul-${p.id}"><div class="adm-head"><h2>Pulizie <span class="n">${esc(short(p))}</span></h2><span class="adm-sub">${nu} ${nu===1?'uscita':'uscite'} · ${ne} ${ne===1?'entrata':'entrate'}${nf?` · ${nf} ${nf===1?'tolta':'tolte'} dal testo`:''}</span></div>
   ${mov.length?mov.map(g=>`<div class="pul-day"><h4 class="adm-h4">${esc(maiusc(giorno(g.d)))}${cambio(g)?' <span class="stato da_verificare">cambio</span>':''}</h4>${g.esce.map(esce).join('')}${g.entra.map(entra).join('')}</div>`).join(''):'<p class="book-note">Nessuna entrata e nessuna uscita in questo periodo.</p>'}
   <h4 class="adm-h4">Testo da mandare</h4><pre class="pul-txt" id="pul-txt-${p.id}" data-testid="admin-pul-txt-${p.id}">${esc(testo(p,mov))}</pre>
   <div class="adm-quick"><button type="button" class="btn btn-wine" data-act="pulCopy" data-id="${p.id}" data-testid="admin-pul-copy-${p.id}">Copia il testo</button>${navigator.share?`<button type="button" class="btn btn-line" data-act="pulShare" data-id="${p.id}">Condividi…</button>`:''}</div></div>`}
// ridisegna le schede; il focus torna sul controllo appena usato (una spunta, un pulsante dei letti), che dopo il ridisegno è un elemento nuovo
const repaint=focusTid=>{const el=$('#pul-cards');if(!el)return;el.innerHTML=A.S.apts.map(p=>scheda(p,V.pulDa,V.pulAl)).join('');
  if(focusTid){const f=el.querySelector('[data-testid="'+focusTid+'"]');if(f)f.focus()}};
// solo il testo di un appartamento (dopo una nota): i campi restano dove sono, anche se intanto tocchi un altro pulsante
const ritesto=id=>{const p=A.aptById(id),t=$('#pul-txt-'+id);if(p&&t)t.textContent=testo(p,movimenti(p,V.pulDa,V.pulAl))};

A.view.pulizie=()=>{if(!V.pulDa){V.pulDa=today;V.pulAl=addDays(today,13)}
  return `<div class="admin-card" data-testid="admin-pulizie"><h2>Pulizie</h2>
   <p class="book-note">Scegli il periodo: per ogni appartamento trovi chi esce e chi entra, con il numero di ospiti. Per ogni arrivo indica i letti da preparare, quanti matrimoniali e quanti singoli (per esempio 3 ospiti: 1 matrimoniale e 1 singolo), la culla e, se serve, una nota: si salvano subito. Poi copia il testo e mandalo a chi fa le pulizie. Nel testo non ci sono nomi né contatti degli ospiti.</p>
   <p class="book-note">Una prenotazione letta male o doppia (⚠ quando si sovrappone a un'altra)? Togli la spunta <b>Nel testo</b>: resta qui in grigio e non va nel messaggio. Vale anche per le prossime volte.</p>
   <div class="pul-per"><div class="adm-inp"><span>Dal</span><input type="date" id="pul-da" value="${V.pulDa}" data-testid="admin-pul-da"></div><div class="adm-inp"><span>al</span><input type="date" id="pul-al" value="${V.pulAl}" data-testid="admin-pul-al"></div>
    <span class="pul-q">${[[7,'7 giorni'],[14,'14 giorni'],[31,'Un mese']].map(([n,l])=>`<button type="button" class="adm-chip" data-act="pulPer" data-n="${n}" data-testid="admin-pul-per-${n}">${l}</button>`).join('')}</span></div></div>
   <div id="pul-cards">${A.S.apts.map(p=>scheda(p,V.pulDa,V.pulAl)).join('')}</div>`};
A.after.pulizie=()=>{A.api('pul_info',{}).then(o=>{V.pul=o||{};repaint()}).catch(()=>{})};

// scelta dei letti e nota: si salvano subito; se il salvataggio non riesce si torna a com'era
async function salva(k,i,partenza,id,focusTid){V.pul=V.pul||{};const prima=V.pul[k],ridisegna=()=>id?ritesto(id):repaint(focusTid),l=letti(i),conti=i.mat!=null||i.sing!=null;
  if(i.letto||i.nota||i.fuori||l.mat||l.sing||i.culla)V.pul[k]=Object.assign({letto:i.letto||'',nota:i.nota||'',a:partenza},conti?{mat:l.mat,sing:l.sing}:{},i.culla?{culla:true}:{},i.fuori?{fuori:true}:{});else delete V.pul[k];ridisegna();
  try{await A.api('pul_set',Object.assign({k,letto:i.letto||'',nota:i.nota||'',fuori:!!i.fuori,culla:!!i.culla,a:partenza},conti?{mat:l.mat,sing:l.sing}:{}))}
  catch(x){if(prima)V.pul[k]=prima;else delete V.pul[k];repaint();alert(x.message)}}
Object.assign(A.act,{
  pulPer:a=>{V.pulDa=today;V.pulAl=addDays(today,+a.dataset.n-1);$('#pul-da').value=V.pulDa;$('#pul-al').value=V.pulAl;repaint()},
  // un letto in più o in meno (con i contatori la scelta di prima, m/s, non serve più)
  pulLetti:a=>{const k=a.dataset.k,f=a.dataset.f,i=Object.assign({},info(k)),l=letti(i),v=Math.max(0,Math.min(MAX[f],l[f]+(+a.dataset.d||0)));
    if(v===l[f])return;      // già al minimo o al massimo
    l[f]=v;i.mat=l.mat;i.sing=l.sing;i.letto='';salva(k,i,a.dataset.a,'',a.dataset.testid)},
  pulCopy:a=>{const t=$('#pul-txt-'+a.dataset.id);if(t)A.copy(t.textContent,a)},
  pulShare:a=>{const t=$('#pul-txt-'+a.dataset.id);if(t&&navigator.share)navigator.share({text:t.textContent}).catch(()=>{})}
});
A.onChange.push(el=>{
  if(el.id==='pul-da'||el.id==='pul-al'){let da=$('#pul-da').value,al=$('#pul-al').value;if(!da||!al)return true;
    // un «dal» dopo l'«al» sposta l'«al» due settimane più avanti; un «al» prima del «dal» porta lì anche il «dal»; al massimo tre mesi alla volta
    if(al<da){if(el.id==='pul-da')al=addDays(da,13);else da=al}
    if(al>addDays(da,92))al=addDays(da,92);
    V.pulDa=da;V.pulAl=al;$('#pul-da').value=da;$('#pul-al').value=al;repaint();return true}
  if(el.classList.contains('pul-nota')){const k=el.dataset.pk,i=Object.assign({},info(k));i.nota=el.value.replace(/\s+/g,' ').trim();salva(k,i,el.dataset.a,el.dataset.id);return true}
  if(el.classList.contains('pul-chk')){const k=el.dataset.pk,i=Object.assign({},info(k));i.fuori=!el.checked;salva(k,i,el.dataset.a,'',el.dataset.testid);return true}      // entrata e uscita della stessa prenotazione insieme
  if(el.classList.contains('pul-culla-chk')){const k=el.dataset.pk,i=Object.assign({},info(k));i.culla=el.checked;salva(k,i,el.dataset.a,'',el.dataset.testid);return true}
  return false});
});
