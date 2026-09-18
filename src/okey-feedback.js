/* Visual feedback only: the authoritative hand always comes from the server. */
(function(){
 let flight=null,source=null;
 function clear(){flight?.remove();flight=null;if(source)source.style.visibility='';source=null;document.querySelector('.okey-table-screen')?.removeAttribute('aria-busy')}
 KANTIN_MATCH.addEventListener('game:pending',({detail})=>{
  clear();const table=document.querySelector('.okey-table-screen');
  if(!table||!['draw','take','discard'].includes(detail.action))return;
  const rack=table.querySelector('.okey-rack-row'),discard=table.querySelector('[data-discard-zone]');
  const node=detail.action==='discard'?table.querySelector('[data-rack-tile="'+CSS.escape(detail.payload.tileId||'')+'"]'):detail.action==='take'?table.querySelector('.can-take .tile'):table.querySelector('.okey-stock');
  const target=detail.action==='discard'?discard:rack;
  if(!node||!target)return;
  table.setAttribute('aria-busy','true');
  const from=node.getBoundingClientRect(),to=target.getBoundingClientRect();
  flight=document.createElement('div');flight.className='okey-pending-flight';
  if(detail.action!=='draw'){const copy=node.cloneNode(true);copy.removeAttribute('data-rack-tile');copy.removeAttribute('data-tile');copy.removeAttribute('id');copy.style.cssText='width:100%;height:100%;margin:0;transform:none;position:static';flight.append(copy)}
  else{flight.textContent='';flight.setAttribute('aria-label','Taş çekiliyor')}
  Object.assign(flight.style,{left:from.left+'px',top:from.top+'px',width:from.width+'px',height:from.height+'px'});
  document.body.append(flight);
  if(detail.action==='discard'){source=node;node.style.visibility='hidden'}
  flight.animate([{transform:'translate(0,0)'},{transform:`translate(${to.left+to.width/2-from.left-from.width/2}px,${to.top+to.height/2-from.top-from.height/2}px)`}],{duration:220,easing:'ease-out',fill:'forwards'});
 });
 KANTIN_MATCH.addEventListener('game:settled',clear);
 KANTIN_MATCH.addEventListener('error',clear);
 new MutationObserver(()=>{if(flight&&!document.querySelector('.okey-table-screen'))clear()}).observe(document.getElementById('screen'),{childList:true});
})();
