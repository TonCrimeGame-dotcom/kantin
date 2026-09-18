(function(root){
  const selector='.word-result-overlay,.batak-result-overlay,.pisti-result-overlay,.university-result-overlay,.okey-result-overlay';
  let matchKey=null,deadline=0,timer=null;
  function installCoins(container,key){
    const coin=root.KANTIN_MATCH?.lastSettlement;
    if(!coin||coin.matchId!==key||!coin.stake)return;
    const board=container.querySelector(selector)?.querySelector('section');
    if(!board||board.querySelector('.match-coin-result'))return;
    const net=Number(coin.net??(coin.delta-coin.stake)),notice=document.createElement('div');
    notice.className='match-coin-result '+(net>0?'gain':net<0?'loss':'refund');
    notice.setAttribute('role','status');
    const amount=(root.KANTIN_I18N?.number(Math.abs(net))||Math.abs(net).toLocaleString());
    notice.textContent=net>0?'+'+amount+' Coin kazandın':net<0?'−'+amount+' Coin kaybettin':'Giriş ücreti iade edildi · 0 Coin';
    board.insertBefore(notice,board.querySelector('footer'));
  }
  function install(container,key){
    installCoins(container,key);
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
  root.KANTIN_GAME_RESULTS={install,installCoins};
})(window);
