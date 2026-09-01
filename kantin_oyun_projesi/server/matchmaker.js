'use strict';
const { randomUUID } = require('node:crypto');

const MODE_SEATS = Object.freeze({spvp:['white','black'],upvp:['A1','B1','A2','B2'],pistiSolo:['P1','P2'],pistiTeam:['A1','B1','A2','B2'],okeySolo:['P1','P2','P3','P4'],okeyTeam:['A1','B1','A2','B2'],sozcukDuel:['P1','P2','P3','P4']});
const WORD_LOCALES = Object.freeze(['tr','en','de','ru','es','hi','ar']);

function normalizeWordLocale(value='tr'){
  const locale=String(value||'').trim().replace('_','-').toLowerCase().split('-')[0];
  if(!WORD_LOCALES.includes(locale))throw new Error('Desteklenmeyen Sözcük dili.');
  return locale;
}
function queueKey(mode,wordLocale){return mode==='sozcukDuel'?`${mode}:${normalizeWordLocale(wordLocale)}`:mode}

class Matchmaker{
  constructor(options={}){
    this.id=options.id||randomUUID;
    this.queues=new Map(Object.keys(MODE_SEATS).filter(mode=>mode!=='sozcukDuel').map(mode=>[mode,[]]));
    for(const locale of WORD_LOCALES)this.queues.set(queueKey('sozcukDuel',locale),[]);
    this.byPlayer=new Map();
  }
  join(player,mode,options={}){
    if(!MODE_SEATS[mode])throw new Error('Geçersiz oyun modu.');
    if(!player?.id||typeof player.send!=='function')throw new Error('Geçersiz oyuncu.');
    const wordLocale=mode==='sozcukDuel'?normalizeWordLocale(options.wordLocale||'tr'):null,key=queueKey(mode,wordLocale);
    this.leave(player.id);
    const ticket={ticketId:this.id(),player,mode,wordLocale,queueKey:key,joinedAt:Date.now()};
    this.queues.get(key).push(ticket);this.byPlayer.set(player.id,ticket);this.notifyQueue(key);
    return this.formMatches(key);
  }
  leave(playerId){
    const ticket=this.byPlayer.get(playerId);if(!ticket)return false;
    const queue=this.queues.get(ticket.queueKey),index=queue.indexOf(ticket);if(index>=0)queue.splice(index,1);
    this.byPlayer.delete(playerId);this.notifyQueue(ticket.queueKey);return true;
  }
  formMatches(key){
    const queue=this.queues.get(key),mode=queue[0]?.mode||key.split(':')[0],seats=MODE_SEATS[mode],matches=[];
    while(queue.length>=seats.length){
      const tickets=queue.splice(0,seats.length),matchId=this.id(),wordLocale=mode==='sozcukDuel'?tickets[0].wordLocale:null;
      if(mode==='sozcukDuel'&&!tickets.every(ticket=>ticket.wordLocale===wordLocale))throw new Error('Farklı Sözcük dilleri aynı odaya alınamaz.');
      const players=tickets.map((ticket,index)=>({id:ticket.player.id,username:ticket.player.username,seat:seats[index],team:seats[index].startsWith('A')?'teamA':seats[index].startsWith('B')?'teamB':null}));
      for(const ticket of tickets){this.byPlayer.delete(ticket.player.id);ticket.player.send('match:found',{matchId,mode,wordLocale,assignment:players.find(player=>player.id===ticket.player.id),players})}
      matches.push({matchId,mode,wordLocale,players});
    }
    this.notifyQueue(key);return matches;
  }
  notifyQueue(key){
    const queue=this.queues.get(key),ticket=queue[0],mode=ticket?.mode||key.split(':')[0],wordLocale=mode==='sozcukDuel'?key.split(':')[1]:null,required=MODE_SEATS[mode].length;
    queue.forEach((item,index)=>item.player.send('queue:update',{mode,wordLocale,position:index+1,waiting:queue.length,required,ticketId:item.ticketId}));
  }
  stats(){
    const result=Object.fromEntries(Object.keys(MODE_SEATS).map(mode=>[mode,0]));
    for(const [key,queue] of this.queues){if(key.startsWith('sozcukDuel:')){result.sozcukDuel+=queue.length;result[key]=queue.length}else result[key]=queue.length}
    return result;
  }
}
module.exports={Matchmaker,MODE_SEATS,WORD_LOCALES,normalizeWordLocale,queueKey};
