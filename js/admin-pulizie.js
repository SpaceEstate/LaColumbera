// La Columbera · Gestione → OPERATIVITÀ → Pulizie: nel periodo scelto, per ogni appartamento chi esce e chi entra giorno per giorno
// (ospiti, notti, come preparare i letti, una nota) e il testo pronto da copiare e mandare a chi fa le pulizie.
// Nel testo non ci sono nomi né contatti degli ospiti: a chi pulisce bastano giorni, orari, persone e letti (i nomi li vedi solo tu, qui).
// Le prenotazioni lette male o doppie (es. un blocco del calendario di Airbnb, la stessa prenotazione dal foglio e dal calendario con date
// diverse) si tolgono dal testo con la spunta «Nel testo»: restano qui in grigio. Chi si sovrappone a un'altra prenotazione è segnalato.
// La scelta dei letti, la nota e «Nel testo» si salvano subito (api/x.js, azioni pul_info e pul_set). Si registra in window.LCAdmParts (vedi js/admin.js).
(window.LCAdmParts=window.LCAdmParts||[]).push(function(A){
'use strict';
const {$,esc,addDays,today,short,V}=A;
const LETTO={m:'letto matrimoniale',s:'letti singoli'};
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
// il messaggio per chi pulisce
function testo(p,tutti,da,al){const S=A.S,L=['PULIZIE '+short(p).toUpperCase(),'dal '+breve(da)+' al '+breve(al),''],mov=nelTesto(p,tutti);
  if(!mov.length)L.push('Nessuna entrata e nessuna uscita in questo periodo.');
  for(const g of mov){
    L.push(maiusc(giorno(g.d))+(g.esce.length&&g.entra.length?' — cambio':''));
    g.esce.forEach(x=>L.push('• esce: '+persone(x.ospiti)+(S.checkoutOra?', entro le '+S.checkoutOra:'')));
    g.entra.forEach(x=>{const i=info(chiave(p,x)),n=notti(x);L.push('• entra: '+persone(x.ospiti)+', '+n+(n===1?' notte':' notti')+', '+(LETTO[i.letto]||'letti da confermare')+(S.checkinOra?', dalle '+S.checkinOra:'')+(i.nota?' — '+i.nota:''))});
    L.push('')}
  return L.join('\n').trim()}
function scheda(p,da,al){const mov=movimenti(p,da,al),S=A.S,tutte=suoi(p),dentro=nelTesto(p,mov);let ne=0,nu=0,nf=0;dentro.forEach(g=>{nu+=g.esce.length;ne+=g.entra.length});
  mov.forEach(g=>[...g.esce,...g.entra].forEach(x=>{if(fuori(p,x))nf++}));
  // la spunta «Nel testo» e l'avviso se le notti si accavallano con un'altra prenotazione
  const inc=(x,cosa)=>{const k=chiave(p,x);return `<label class="pul-inc"><input type="checkbox" class="pul-chk" data-pk="${esc(k)}" data-a="${esc(x.a)}"${fuori(p,x)?'':' checked'} data-testid="admin-pul-inc-${esc(k)}-${cosa}"> Nel testo</label>`};
  const avviso=x=>{const o=sovrapposte(p,x,tutte);return o.length?`<span class="pul-warn" data-testid="admin-pul-warn-${esc(chiave(p,x))}">⚠ Si sovrappone a ${o.map(y=>esc(chi(y))+' ('+esc(breve(y.da))+' → '+esc(breve(y.a))+')').join(', ')}: togli dal testo quella sbagliata</span>`:fuori(p,x)?'<span class="pul-off">Tolta dal testo</span>':''};
  const esce=x=>`<div class="pul-mov${fuori(p,x)?' fuori':''}"><span class="pul-k esce">Esce</span><span class="pul-d">${esc(persone(x.ospiti))}${S.checkoutOra?' · entro le '+esc(S.checkoutOra):''}<small>${esc(chi(x))}</small>${avviso(x)}</span>${inc(x,'esce')}</div>`;
  const entra=x=>{const k=chiave(p,x),i=info(k),n=notti(x);
    return `<div class="pul-mov${fuori(p,x)?' fuori':''}"><span class="pul-k entra">Entra</span><span class="pul-d">${esc(persone(x.ospiti))} · ${n} ${n===1?'notte':'notti'}${S.checkinOra?' · dalle '+esc(S.checkinOra):''}<small>${esc(chi(x))}</small>${avviso(x)}</span>${inc(x,'entra')}
     <div class="pul-letto" role="group" aria-label="Come preparare i letti">${['m','s'].map(v=>`<button type="button" data-act="pulLetto" data-k="${esc(k)}" data-v="${v}" data-a="${esc(x.a)}" class="${i.letto===v?'on':''}" aria-pressed="${i.letto===v}" data-testid="admin-pul-letto-${esc(k)}-${v}">${v==='m'?'Matrimoniale':'Singoli'}</button>`).join('')}${i.letto?'':'<span class="pul-ask">da scegliere</span>'}</div>
     <input class="pul-nota" data-pk="${esc(k)}" data-a="${esc(x.a)}" data-id="${p.id}" value="${esc(i.nota||'')}" maxlength="200" placeholder="Nota per le pulizie (facoltativa): culla, letto aggiuntivo…" aria-label="Nota per le pulizie" data-testid="admin-pul-nota-${esc(k)}"></div>`};
  const cambio=g=>g.esce.some(x=>!fuori(p,x))&&g.entra.some(x=>!fuori(p,x));
  return `<div class="admin-card pul-card" data-testid="admin-pul-${p.id}"><div class="adm-head"><h2>Pulizie <span class="n">${esc(short(p))}</span></h2><span class="adm-sub">${nu} ${nu===1?'uscita':'uscite'} · ${ne} ${ne===1?'entrata':'entrate'}${nf?` · ${nf} ${nf===1?'tolta':'tolte'} dal testo`:''}</span></div>
   ${mov.length?mov.map(g=>`<div class="pul-day"><h4 class="adm-h4">${esc(maiusc(giorno(g.d)))}${cambio(g)?' <span class="stato da_verificare">cambio</span>':''}</h4>${g.esce.map(esce).join('')}${g.entra.map(entra).join('')}</div>`).join(''):'<p class="book-note">Nessuna entrata e nessuna uscita in questo periodo.</p>'}
   <h4 class="adm-h4">Testo da mandare</h4><pre class="pul-txt" id="pul-txt-${p.id}" data-testid="admin-pul-txt-${p.id}">${esc(testo(p,mov,da,al))}</pre>
   <div class="adm-quick"><button type="button" class="btn btn-wine" data-act="pulCopy" data-id="${p.id}" data-testid="admin-pul-copy-${p.id}">Copia il testo</button>${navigator.share?`<button type="button" class="btn btn-line" data-act="pulShare" data-id="${p.id}">Condividi…</button>`:''}</div></div>`}
// ridisegna le schede; il focus torna sul controllo appena usato (una spunta, un pulsante dei letti), che dopo il ridisegno è un elemento nuovo
const repaint=focusTid=>{const el=$('#pul-cards');if(!el)return;el.innerHTML=A.S.apts.map(p=>scheda(p,V.pulDa,V.pulAl)).join('');
  if(focusTid){const f=el.querySelector('[data-testid="'+focusTid+'"]');if(f)f.focus()}};
// solo il testo di un appartamento (dopo una nota): i campi restano dove sono, anche se intanto tocchi un altro pulsante
const ritesto=id=>{const p=A.aptById(id),t=$('#pul-txt-'+id);if(p&&t)t.textContent=testo(p,movimenti(p,V.pulDa,V.pulAl),V.pulDa,V.pulAl)};

A.view.pulizie=()=>{if(!V.pulDa){V.pulDa=today;V.pulAl=addDays(today,13)}
  return `<div class="admin-card" data-testid="admin-pulizie"><h2>Pulizie</h2>
   <p class="book-note">Scegli il periodo: per ogni appartamento trovi chi esce e chi entra, con il numero di ospiti. Per ogni arrivo scegli come preparare i letti e, se serve, scrivi una nota (si salvano subito); poi copia il testo e mandalo a chi fa le pulizie. Nel testo non ci sono nomi né contatti degli ospiti.</p>
   <p class="book-note">Una prenotazione letta male o doppia (⚠ quando si sovrappone a un'altra)? Togli la spunta <b>Nel testo</b>: resta qui in grigio e non va nel messaggio. Vale anche per le prossime volte.</p>
   <div class="pul-per"><div class="adm-inp"><span>Dal</span><input type="date" id="pul-da" value="${V.pulDa}" data-testid="admin-pul-da"></div><div class="adm-inp"><span>al</span><input type="date" id="pul-al" value="${V.pulAl}" data-testid="admin-pul-al"></div>
    <span class="pul-q">${[[7,'7 giorni'],[14,'14 giorni'],[31,'Un mese']].map(([n,l])=>`<button type="button" class="adm-chip" data-act="pulPer" data-n="${n}" data-testid="admin-pul-per-${n}">${l}</button>`).join('')}</span></div></div>
   <div id="pul-cards">${A.S.apts.map(p=>scheda(p,V.pulDa,V.pulAl)).join('')}</div>`};
A.after.pulizie=()=>{A.api('pul_info',{}).then(o=>{V.pul=o||{};repaint()}).catch(()=>{})};

// scelta dei letti e nota: si salvano subito; se il salvataggio non riesce si torna a com'era
async function salva(k,i,partenza,id,focusTid){V.pul=V.pul||{};const prima=V.pul[k],ridisegna=()=>id?ritesto(id):repaint(focusTid);
  if(i.letto||i.nota||i.fuori)V.pul[k]=Object.assign({letto:i.letto||'',nota:i.nota||'',a:partenza},i.fuori?{fuori:true}:{});else delete V.pul[k];ridisegna();
  try{await A.api('pul_set',{k,letto:i.letto||'',nota:i.nota||'',fuori:!!i.fuori,a:partenza})}
  catch(x){if(prima)V.pul[k]=prima;else delete V.pul[k];repaint();alert(x.message)}}
Object.assign(A.act,{
  pulPer:a=>{V.pulDa=today;V.pulAl=addDays(today,+a.dataset.n-1);$('#pul-da').value=V.pulDa;$('#pul-al').value=V.pulAl;repaint()},
  pulLetto:a=>{const k=a.dataset.k,i=Object.assign({},info(k));i.letto=i.letto===a.dataset.v?'':a.dataset.v;salva(k,i,a.dataset.a,'',a.dataset.testid)},      // toccare di nuovo la scelta la toglie
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
  return false});
});
