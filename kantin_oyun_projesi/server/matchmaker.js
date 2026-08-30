'use strict';
const { randomUUID } = require('node:crypto');
const MODE_SEATS = Object.freeze({spvp:['white','black'],upvp:['A1','B1','A2','B2'],pistiSolo:['P1','P2'],pistiTeam:['A1','B1','A2','B2'],okeySolo:['P1','P2','P3','P4'],okeyTeam:['A1','B1','A2','B2'],sozcukDuel:['P1','P2']});
class Matchmaker{
  constructor(options={}){this.id=options.id||randomUUID;this.queues=new Map(Object.keys(MODE_SEATS).map(m=>[m,[]]));this.byPlayer=new Map()}
  join(player,mode){if(!MODE_SEATS[mode])throw new Error('Geçersiz oyun modu.');if(!player?.id||typeof player.send!=='function')throw new Error('Geçersiz oyuncu.');this.leave(player.id);const ticket={ticketId:this.id(),player,mode,joinedAt:Date.now()};this.queues.get(mode).push(ticket);this.byPlayer.set(player.id,ticket);this.notifyQueue(mode);return this.formMatches(mode)}
  leave(playerId){const ticket=this.byPlayer.get(playerId);if(!ticket)return false;const queue=this.queues.get(ticket.mode);const index=queue.indexOf(ticket);if(index>=0)queue.splice(index,1);this.byPlayer.delete(playerId);this.notifyQueue(ticket.mode);return true}
  formMatches(mode){const queue=this.queues.get(mode),seats=MODE_SEATS[mode],matches=[];while(queue.length>=seats.length){const tickets=queue.splice(0,seats.length),matchId=this.id();const players=tickets.map((t,i)=>({id:t.player.id,username:t.player.username,seat:seats[i],team:seats[i].startsWith('A')?'teamA':seats[i].startsWith('B')?'teamB':null}));for(const ticket of tickets){this.byPlayer.delete(ticket.player.id);ticket.player.send('match:found',{matchId,mode,assignment:players.find(p=>p.id===ticket.player.id),players})}matches.push({matchId,mode,players})}this.notifyQueue(mode);return matches}
  notifyQueue(mode){const queue=this.queues.get(mode),required=MODE_SEATS[mode].length;queue.forEach((ticket,index)=>ticket.player.send('queue:update',{mode,position:index+1,waiting:queue.length,required,ticketId:ticket.ticketId}))}
  stats(){return Object.fromEntries([...this.queues].map(([mode,q])=>[mode,q.length]))}
}
module.exports={Matchmaker,MODE_SEATS};
