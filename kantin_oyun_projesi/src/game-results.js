(function(root){
  const selector='.word-result-overlay,.batak-result-overlay,.pisti-result-overlay,.university-result-overlay,.okey-result-overlay';
  let matchKey=null,deadline=0,timer=null;
  function install(container,key){
    const overlay=container.querySelector(selector);
    if(!overlay)return;
    if(overlay.dataset.introInstalled)return;
    overlay.dataset.introInstalled='true';
    const board=overlay.querySelector('section'),heading=board?.querySelector('h2');
    if(!board||!heading)return;
    if(key!==matchKey){matchKey=key;deadline=Date.now()+1800}
    const remaining=deadline-Date.now();
    if(remaining<=0)return;
    clearTimeout(timer);
    const notice=document.createElement('div');
    notice.className='match-ending-notice '+(heading.textContent==='KAZANDIN'?'victory':'defeat');
    notice.textContent=heading.textContent;
    notice.setAttribute('role','status');
    notice.setAttribute('aria-live','polite');
    board.hidden=true;board.inert=true;
    overlay.classList.add('match-ending-intro');
    overlay.append(notice);
    timer=setTimeout(()=>{
      notice.remove();overlay.classList.remove('match-ending-intro');
      board.hidden=false;board.inert=false;
    },remaining);
  }
  root.KANTIN_GAME_RESULTS={install};
})(window);
