'use strict';
const {randomBytes,randomUUID}=require('node:crypto');

const MODE_SEATS=Object.freeze({spvp:['white','black'],upvp:['A1','B1','A2','B2'],pistiSolo:['P1','P2'],pistiTeam:['A1','B1','A2','B2'],okeyClassic:['P1','P2','P3','P4'],okeySolo:['P1','P2','P3','P4'],okeyTeam:['A1','B1','A2','B2'],batakKozMaca:['P1','P2','P3','P4'],batakGommeli:['P1','P2','P3','P4'],sozcukDuel:['P1','P2','P3','P4']});
const WORD_LOCALES=Object.freeze(['tr','en','de','ru','es','hi','ar']);
const BOT_DIFFICULTIES=Object.freeze(['ORTA','İYİ']);

function normalizeWordLocale(value='tr'){
  const locale=String(value||'').trim().replace('_','-').toLowerCase().split('-')[0];
  if(!WORD_LOCALES.includes(locale))throw new Error('Desteklenmeyen Sözcük dili.');
  return locale;
}
function normalizeStake(value){const stake=Number(value)||0;if(stake&&!([500,1500,5000].includes(stake)))throw new Error('Geçersiz lobi bahsi.');return stake}
function queueKey(mode,wordLocale,stake=0){const base=mode==='sozcukDuel'?`${mode}:${normalizeWordLocale(wordLocale)}`:mode;return normalizeStake(stake)?`${base}@${normalizeStake(stake)}`:base}
function modeFromQueueKey(key){return String(key).split('@')[0].split(':')[0]}
function defaultBot(difficulty='ORTA'){
  const code=randomBytes(3).toString('hex').toUpperCase(),level=difficulty==='İYİ'?18:9;
  return{id:`BOT-${difficulty==='İYİ'?'IYI':'ORTA'}-${code}`,username:`Misafir ${code}`,isBot:true,botDifficulty:difficulty,level};
}

class Matchmaker{
  constructor(options={}){
    this.id=options.id||randomUUID;
    this.queues=new Map(Object.keys(MODE_SEATS).filter(mode=>mode!=='sozcukDuel').map(mode=>[mode,[]]));
    for(const locale of WORD_LOCALES)this.queues.set(queueKey('sozcukDuel',locale),[]);
    this.byPlayer=new Map();this.fillTimers=new Map();
    this.setTimer=options.setTimer||setTimeout;this.clearTimer=options.clearTimer||clearTimeout;
    this.initialBotDelay=options.initialBotDelay||(()=>3000+Math.floor(Math.random()*1001));
    this.botInterval=Number(options.botInterval)||1000;
    this.createBot=options.createBot||((difficulty)=>defaultBot(difficulty));
    this.onMatches=options.onMatches||(()=>{});
  }
  join(player,mode,options={}){
    if(!MODE_SEATS[mode])throw new Error('Geçersiz oyun modu.');
    if(!player?.id||typeof player.send!=='function')throw new Error('Geçersiz oyuncu.');
    const wordLocale=mode==='sozcukDuel'?normalizeWordLocale(options.wordLocale||'tr'):null,stake=normalizeStake(options.stake),key=queueKey(mode,wordLocale,stake);
    if(!this.queues.has(key))this.queues.set(key,[]);
    this.leave(player.id);
    const ticket={ticketId:this.id(),player,mode,wordLocale,stake,queueKey:key,joinedAt:Date.now(),isBot:Boolean(player.isBot),botDifficulty:player.botDifficulty||null};
    this.queues.get(key).push(ticket);this.byPlayer.set(player.id,ticket);this.notifyQueue(key);
    const matches=this.formMatches(key);this.scheduleBackfill(key);return matches;
  }
  leave(playerId){
    const ticket=this.byPlayer.get(playerId);if(!ticket)return false;
    const queue=this.queues.get(ticket.queueKey),index=queue.indexOf(ticket);if(index>=0)queue.splice(index,1);
    this.byPlayer.delete(playerId);this.notifyQueue(ticket.queueKey);this.scheduleBackfill(ticket.queueKey);return true;
  }
  queuedBotIds(){return new Set([...this.byPlayer.values()].filter(ticket=>ticket.isBot).map(ticket=>ticket.player.id))}
  scheduleBackfill(key,delay=null){
    const existing=this.fillTimers.get(key);
    const queue=this.queues.get(key),hasHuman=queue?.some(ticket=>!ticket.isBot),required=MODE_SEATS[queue?.[0]?.mode||modeFromQueueKey(key)]?.length||0;
    if(!hasHuman||queue.length>=required){if(existing){this.clearTimer(existing);this.fillTimers.delete(key)}return}
    if(existing&&delay==null)return;
    if(existing){this.clearTimer(existing);this.fillTimers.delete(key)}
    const timer=this.setTimer(()=>{this.fillTimers.delete(key);this.backfill(key)},delay==null?this.initialBotDelay():delay);
    timer?.unref?.();this.fillTimers.set(key,timer);
  }
  backfill(key){
    const queue=this.queues.get(key),firstHuman=queue?.find(ticket=>!ticket.isBot);if(!firstHuman)return;
    const difficulty=Math.random()<.38?'İYİ':'ORTA',profile=this.createBot(difficulty,this.queuedBotIds())||defaultBot(difficulty),player={...profile,isBot:true,botDifficulty:BOT_DIFFICULTIES.includes(profile.botDifficulty)?profile.botDifficulty:difficulty,send:()=>{}};
    if(!player.id||this.byPlayer.has(player.id))return this.scheduleBackfill(key,this.botInterval);
    const ticket={ticketId:this.id(),player,mode:firstHuman.mode,wordLocale:firstHuman.wordLocale,stake:firstHuman.stake,queueKey:key,joinedAt:Date.now(),isBot:true,botDifficulty:player.botDifficulty};
    queue.push(ticket);this.byPlayer.set(player.id,ticket);this.notifyQueue(key);
    const matches=this.formMatches(key);if(matches.length)this.onMatches(matches);
    this.scheduleBackfill(key,this.botInterval);
  }
  formMatches(key){
    const queue=this.queues.get(key),mode=queue[0]?.mode||modeFromQueueKey(key),seats=MODE_SEATS[mode],matches=[];
    while(queue.length>=seats.length){
      const tickets=queue.splice(0,seats.length),matchId=this.id(),wordLocale=mode==='sozcukDuel'?tickets[0].wordLocale:null,stake=tickets[0].stake||0;
      if(mode==='sozcukDuel'&&!tickets.every(ticket=>ticket.wordLocale===wordLocale))throw new Error('Farklı Sözcük dilleri aynı odaya alınamaz.');
      const players=tickets.map((ticket,index)=>({id:ticket.player.id,username:ticket.player.username,avatarUrl:ticket.player.avatarUrl||null,seat:seats[index],team:seats[index].startsWith('A')?'teamA':seats[index].startsWith('B')?'teamB':null,isBot:ticket.isBot,botDifficulty:ticket.botDifficulty,level:Number(ticket.player.level)||1}));
      for(const ticket of tickets){this.byPlayer.delete(ticket.player.id);if(!ticket.isBot)ticket.player.send('match:found',{matchId,mode,wordLocale,stake,pot:stake*players.length,assignment:players.find(player=>player.id===ticket.player.id),players})}
      matches.push({matchId,mode,wordLocale,stake,pot:stake*players.length,players});
    }
    this.notifyQueue(key);return matches;
  }
  notifyQueue(key){
    const queue=this.queues.get(key),ticket=queue[0],mode=ticket?.mode||modeFromQueueKey(key),wordLocale=mode==='sozcukDuel'?(ticket?.wordLocale||key.split(':')[1]?.split('@')[0]):null,required=MODE_SEATS[mode].length;
    queue.forEach((item,index)=>{if(!item.isBot)item.player.send('queue:update',{mode,wordLocale,position:index+1,waiting:queue.length,required,ticketId:item.ticketId})});
  }
  stats(){
    const result=Object.fromEntries(Object.keys(MODE_SEATS).map(mode=>[mode,0]));
    for(const [key,queue] of this.queues){const humanCount=queue.filter(ticket=>!ticket.isBot).length,mode=queue[0]?.mode||modeFromQueueKey(key);result[mode]=(result[mode]||0)+humanCount;if(key.startsWith('sozcukDuel:')&&!key.includes('@'))result[key]=humanCount}
    return result;
  }
}
module.exports={Matchmaker,MODE_SEATS,WORD_LOCALES,BOT_DIFFICULTIES,normalizeWordLocale,normalizeStake,queueKey,defaultBot};
