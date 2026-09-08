(function(global){
  'use strict';
  const MODES=Object.freeze({
    spvp:{title:'Standart Tavla',family:'backgammon',players:'1v1'},upvp:{title:'Üniversite Tavlası',family:'university',players:'2v2'},
    pistiSolo:{title:'Pişti',family:'pisti',players:'1v1',engineMode:'solo'},pistiTeam:{title:'Eşli Pişti',family:'pisti',players:'2v2',engineMode:'team'},
    okeyClassic:{title:'Klasik Okey',family:'okey',players:'4 kişi',engineMode:'classic'},
    okeySolo:{title:'101 Okey',family:'okey',players:'4 kişi',engineMode:'solo'},okeyTeam:{title:'Eşli 101',family:'okey',players:'2v2',engineMode:'team'},
    batakKozMaca:{title:'Koz Maça',family:'batak',players:'4 kişi',engineMode:'kozMaca'},batakGommeli:{title:'Gömmeli Batak',family:'batak',players:'4 kişi',engineMode:'gommeli'},
    sozcukDuel:{title:'Sözcük Kapışması',family:'sozcuk',players:'4 kişi',engineMode:'solo'}
  });
  class GameManager{
    constructor(){this.mode=null;this.game=null;this.viewerId=null;this.wordLocale='tr'}
    start(mode,options={}){const config=MODES[mode];if(!config)throw new Error(`Bilinmeyen oyun modu: ${mode}`);this.mode=mode;
      if(config.family==='backgammon'){if(!global.SPVP?.StandardBackgammonPvP)throw new Error('Tavla oyun motoru yüklenemedi.');this.viewerId='white';this.game=new global.SPVP.StandardBackgammonPvP()}
      else if(config.family==='university'){if(!global.UPVP?.UniversityBackgammonPvP)throw new Error('Üniversite Tavlası oyun motoru yüklenemedi.');this.viewerId='A1';this.game=new global.UPVP.UniversityBackgammonPvP()}
      else if(config.family==='pisti'){if(!global.PISTI?.SoloPisti||!global.PISTI?.TeamPisti)throw new Error('Pişti oyun motoru yüklenemedi.');this.viewerId=config.engineMode==='solo'?'P1':'A1';this.game=config.engineMode==='solo'?new global.PISTI.SoloPisti():new global.PISTI.TeamPisti()}
      else if(config.family==='okey'){if(!global.OKEY101?.Solo101Okey||!global.OKEY101?.Team101Okey||!global.OKEY101?.ClassicOkey)throw new Error('Okey oyun motoru yüklenemedi.');this.viewerId=config.engineMode==='team'?'A1':'P1';this.game=config.engineMode==='classic'?new global.OKEY101.ClassicOkey():config.engineMode==='solo'?new global.OKEY101.Solo101Okey():new global.OKEY101.Team101Okey()}
      else if(config.family==='batak'){if(!global.BATAK?.BatakGame)throw new Error('Batak oyun motoru yüklenemedi.');this.viewerId='P1';this.game=new global.BATAK.BatakGame({mode:config.engineMode})}
      else{if(!global.SOZCUK?.WordClashGame)throw new Error('Sözcük oyunu motoru yüklenemedi.');this.viewerId='P1';this.wordLocale=global.KANTIN_WORD_LANGUAGES.normalizeLocale(options.wordLocale||this.wordLocale);this.game=new global.SOZCUK.WordClashGame({language:this.wordLocale})}
      return this.game
    }
    config(){return MODES[this.mode]}
    restart(){return this.start(this.mode,{wordLocale:this.wordLocale})}
  }
  global.KANTIN=Object.freeze({GameManager,MODES});
})(window);
