(function(){
  'use strict';

  const readLaunchParams=()=>{
    const params=new URLSearchParams(location.search);
    const hash=location.hash.replace(/^#/,'');
    if(hash){
      const hashParams=new URLSearchParams(hash);
      hashParams.forEach((value,key)=>{if(!params.has(key))params.set(key,value)});
    }
    return params;
  };

  const params=readLaunchParams();
  const telegram=window.Telegram?.WebApp||null;
  const platform=String(telegram?.platform||params.get('tgWebAppPlatform')||'').toLowerCase();
  const telegramLaunch=Boolean(
    (platform&&platform!=='unknown')||telegram?.initData||params.has('tgWebAppVersion')||
    params.has('tgWebAppData')||/Telegram/i.test(navigator.userAgent)
  );
  if(!telegramLaunch)return;

  const mobilePlatform=/^(android|android_x|ios)$/i.test(platform);
  const desktopPlatform=/^(tdesktop|macos|windows|unigram)$/i.test(platform)||
    (/^(web|weba|webk)$/i.test(platform)&&innerWidth>=760);
  const mobileAgent=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const desktop=desktopPlatform||(!mobilePlatform&&!mobileAgent&&innerWidth>=760);
  const root=document.documentElement;

  root.classList.add('telegram-webapp',desktop?'telegram-desktop':'telegram-mobile');
  root.dataset.telegramPlatform=platform||'unknown';
  window.__KANTIN_TELEGRAM__={active:true,desktop,platform:platform||'unknown'};

  const viewport=()=>{
    const visual=window.visualViewport;
    const stableHeight=Number(telegram?.viewportStableHeight)||0;
    const currentHeight=Number(telegram?.viewportHeight)||0;
    const height=Math.round(stableHeight||currentHeight||visual?.height||innerHeight);
    const width=Math.round(visual?.width||innerWidth);
    root.style.setProperty('--telegram-viewport-height',`${Math.max(1,height)}px`);
    root.style.setProperty('--telegram-viewport-width',`${Math.max(1,width)}px`);
    root.style.setProperty('--telegram-viewport-offset',`${Math.max(0,Math.round(visual?.offsetTop||0))}px`);
    if(desktop){
      const stageWidth=Math.max(1,Math.min(932,width-24,(height-24)*(19.5/9)));
      root.style.setProperty('--telegram-stage-width',`${Math.round(stageWidth)}px`);
      root.style.setProperty('--telegram-stage-height',`${Math.round(stageWidth/(19.5/9))}px`);
    }
    if(scrollX||scrollY)scrollTo(0,0);
  };

  const installStage=()=>{
    if(document.getElementById('telegramStage'))return;
    const stage=document.createElement('div');
    stage.id='telegramStage';
    stage.setAttribute('data-telegram-stage',desktop?'desktop':'mobile');
    const children=[...document.body.children].filter(node=>node.tagName!=='SCRIPT');
    document.body.insertBefore(stage,document.body.firstChild);
    children.forEach(node=>stage.appendChild(node));
  };

  try{
    telegram?.ready?.();
    telegram?.expand?.();
    telegram?.disableVerticalSwipes?.();
    telegram?.setHeaderColor?.('#100b08');
    telegram?.setBackgroundColor?.('#080503');
    telegram?.onEvent?.('viewportChanged',viewport);
  }catch(_error){/* CSS viewport locking remains active on older Telegram clients. */}

  viewport();
  installStage();
  addEventListener('resize',viewport,{passive:true});
  addEventListener('orientationchange',viewport,{passive:true});
  addEventListener('scroll',viewport,{passive:true});
  window.visualViewport?.addEventListener('resize',viewport,{passive:true});
  window.visualViewport?.addEventListener('scroll',viewport,{passive:true});
})();
