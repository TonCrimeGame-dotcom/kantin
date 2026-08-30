'use strict';
const{randomInt}=require('node:crypto');require('../src/spvp.js');require('../src/upvp.js');require('../src/pisti.js');require('../src/okey101.js');global.KANTIN_TURKISH_WORDS=require('../assets/data/turkish-words.json');require('../src/sozcuk.js');
const die=()=>randomInt(1,7);const clone=value=>structuredClone(value);const point=value=>{if(value==='bar'||value==='off')return value;const n=Number(value);if(!Number.isInteger(n)||n<0||n>23)throw new Error('Geçersiz tavla hanesi.');return n};
class GameRoom{
  constructor(match,options={}){this.id=match.matchId;this.mode=match.mode;this.players=match.players.map(clone);this.send=options.send||(()=>{});this.repository=options.repository||null;this.createdAt=match.createdAt||Date.now();this.lastActivity=match.updatedAt||this.createdAt;this.version=match.version||0;this.status='playing';this.processed=new Map(this.players.map(p=>[p.id,new Map()]));this.turnTimer=null;this.clockKeyActive=null;this.timeoutCounts=new Map();this.botPlayers=new Set();this.engine=this.createEngine();if(match.state)this.restoreEngine(match.state);else this.repository?.recordMatch({...match,state:this.fullState(),version:this.version});this.armClock()}
  createEngine(){switch(this.mode){case'spvp':return new SPVP.StandardBackgammonPvP();case'upvp':return new UPVP.UniversityBackgammonPvP({players:this.players.map(p=>({id:p.seat,username:p.username,team:p.team,boardId:p.seat.endsWith('1')?'board1':'board2'}))});case'pistiSolo':return new PISTI.PistiGame({mode:'solo',players:this.players.map(p=>({id:p.seat,username:p.username}))});case'pistiTeam':return new PISTI.PistiGame({mode:'team',players:this.players.map(p=>({id:p.seat,username:p.username,team:p.team}))});case'okeySolo':return new OKEY101.Okey101Game({mode:'solo',players:this.players.map(p=>({id:p.seat,username:p.username}))});case'okeyTeam':return new OKEY101.Okey101Game({mode:'team',players:this.players.map(p=>({id:p.seat,username:p.username,team:p.team}))});case'sozcukDuel':return new SOZCUK.WordClashGame({players:this.players.map(p=>({id:p.seat,username:p.username}))});default:throw new Error('Desteklenmeyen oyun modu.')}}
  fullState(){if(this.mode==='spvp')return this.engine.getState();if(this.mode==='upvp')return this.engine.getState();return this.engine.getFullState()}
  restoreEngine(snapshot){if(this.mode==='spvp')this.engine.loadState(snapshot);else if(this.mode==='upvp')this.engine.loadState(snapshot);else{if(snapshot.players)this.engine.players=clone(snapshot.players);if(snapshot.rules)this.engine.rules=clone(snapshot.rules);const state=clone(snapshot);delete state.players;delete state.rules;this.engine.state=state}}
  player(userId){const p=this.players.find(x=>x.id===userId);if(!p)throw new Error('Bu maçın oyuncusu değilsin.');return p}
  turnId(){return `${this.id}:${this.version}`}
  stateFor(userId){const p=this.player(userId);let state;if(this.mode==='spvp')state=this.engine.getState();else if(this.mode==='upvp')state=this.engine.getState();else state=this.engine.getStateForPlayer(p.seat);return{matchId:this.id,mode:this.mode,seat:p.seat,turnId:this.turnId(),status:this.status,state}}
  sync(userId){this.send(userId,'game:state',this.stateFor(userId))}
  broadcast(){for(const p of this.players)this.sync(p.id)}
  clockKey(){if(this.status!=='playing'||this.mode==='upvp'||this.engine.state?.status!=='playing')return null;const s=this.engine.state;if(this.mode==='spvp'){if(!s.openingComplete)return null;if(s.pendingDouble)return`double:${s.turnNumber}:${s.pendingDouble.from}:${s.pendingDouble.to}:${s.pendingDouble.proposedValue}`;return`turn:${s.turnNumber}:${s.turn}`}if(this.mode.startsWith('pisti'))return s.pendingBluff?`bluff:${s.moveNumber}:${s.pendingBluff.responderId}`:`turn:${s.moveNumber}:${this.engine.getCurrentPlayer().id}`;if(this.mode.startsWith('okey'))return`turn:${s.turnNumber}:${this.engine.getCurrentPlayer().id}`;return null}
  clockPlayer(){const s=this.engine.state;return this.mode==='spvp'?(s.pendingDouble?.to||s.turn):this.engine.getCurrentPlayer().id}
  armClock(){const key=this.clockKey();if(key===this.clockKeyActive&&this.turnTimer)return;clearTimeout(this.turnTimer);this.turnTimer=null;this.clockKeyActive=key;if(!key){if(this.mode==='spvp')this.engine.setTurnDeadline(null);return}const seat=this.clockPlayer(),member=this.players.find(p=>p.seat===seat),automatic=member&&this.botPlayers.has(member.id),existing=Number(this.engine.state.turnDeadlineAt),deadline=automatic?Date.now()+350:(existing>Date.now()?existing:Date.now()+20000);if(this.mode==='spvp')this.engine.setTurnDeadline(deadline);else this.engine.state.turnDeadlineAt=deadline;this.turnTimer=setTimeout(()=>this.handleTimeout(key),Math.max(1,deadline-Date.now()+15));this.turnTimer.unref?.()}
  botCompleteSpvpTurn(player){let guard=12;if(this.engine.state.turn!==player||this.engine.state.status!=='playing')return;if(!this.engine.state.remainingDice.length)this.engine.setDice(die(),die());while(this.engine.state.status==='playing'&&this.engine.state.turn===player&&guard-->0){const move=this.engine.getLegalMoves()[0];if(!move){this.engine.endTurn({reason:'timeout-bot-no-move'});break}this.engine.move(move.from,move.to,move.die)}}
  botCompleteTableTurn(player){if(this.mode.startsWith('pisti')){const hand=this.engine.getHand(player);if(hand.length)this.engine.playCard(player,hand[0].id);return}if(this.mode.startsWith('okey')){if(this.engine.state.phase==='draw')this.engine.drawFromStock(player);const hand=this.engine.state.hands[player];if(hand.length)this.engine.discard(player,hand[hand.length-1].id)}}
  handleTimeout(expectedKey){if(expectedKey!==this.clockKey()||this.status!=='playing')return;const player=this.clockPlayer();if(this.mode==='spvp'){const count=this.engine.registerTimeout(player);if(this.engine.state.pendingDouble)this.engine.declineDouble(player);else if(count>=2)this.engine.finishForfeit(player==='white'?'black':'white',player,'timeout-forfeit',this.engine.state.cubeValue);else this.botCompleteSpvpTurn(player)}else{const member=this.players.find(p=>p.seat===player),count=(this.timeoutCounts.get(member.id)||0)+1;this.timeoutCounts.set(member.id,count);this.engine.state.timeoutCounts=Object.fromEntries(this.players.map(p=>[p.seat,this.timeoutCounts.get(p.id)||0]));if(count>=2&&!this.botPlayers.has(member.id)){this.botPlayers.add(member.id);this.send(member.id,'game:kicked',{matchId:this.id,reason:'İki kez süre dolduğu için koltuğu bot devraldı.'})}this.botCompleteTableTurn(player)}this.version++;this.lastActivity=Date.now();this.clockKeyActive=null;this.repository?.updateMatchState(this.id,this.fullState(),this.version);this.refreshStatus();this.broadcast();this.armClock()}
  remember(userId,actionId,result){const map=this.processed.get(userId);map.set(actionId,result);if(map.size>250)map.delete(map.keys().next().value)}
  act(userId,request){
    if(this.status!=='playing')throw new Error('Maç tamamlanmış.');
    if(this.botPlayers.has(userId))throw new Error('Bu koltuğu oyun sonuna kadar bot devraldı.');
    const player=this.player(userId),actionId=String(request?.actionId||'');
    if(!/^[a-zA-Z0-9-]{8,80}$/.test(actionId))throw new Error('Geçersiz actionId.');
    const previous=this.processed.get(userId).get(actionId);
    if(previous){this.send(userId,'game:ack',{...previous,duplicate:true});return previous}
    if(request.turnId!==this.turnId())throw new Error('State güncel değil; yeni oyun durumu gönderildi.');
    try{
      this.apply(player,request.action,request.payload||{});
    }catch(error){
      // 101'de geçersiz açılış gerçek bir +101 cezasıdır; aksiyon reddedilse
      // bile değişen ceza durumu bütün istemcilere ve kalıcı kayda gönderilir.
      if(error.penaltyApplied){
        this.version++;
        this.lastActivity=Date.now();
        this.repository?.updateMatchState(this.id,this.fullState(),this.version);
        this.broadcast();
      }
      throw error;
    }
    this.version++;
    this.lastActivity=Date.now();
    this.clockKeyActive=null;
    this.armClock();
    this.repository?.updateMatchState(this.id,this.fullState(),this.version);
    this.refreshStatus();
    const result={actionId,turnId:this.turnId(),accepted:true};
    this.remember(userId,actionId,result);
    this.send(userId,'game:ack',result);
    this.broadcast();
    return result
  }
  apply(player,action,payload){if(this.mode==='spvp')return this.applySpvp(player,action,payload);if(this.mode==='upvp')return this.applyUpvp(player,action,payload);if(this.mode.startsWith('pisti'))return this.applyPisti(player,action,payload);if(this.mode.startsWith('okey'))return this.applyOkey(player,action,payload);return this.applyWord(player,action,payload)}
  applySpvp(player,action,payload){if(!this.engine.state.openingComplete){if(action!=='roll')throw new Error('Önce başlangıç zarları atılmalı.');return this.engine.submitOpeningRoll(player.seat,die())}if(action==='doubleAccept')return this.engine.acceptDouble(player.seat);if(action==='doubleDecline')return this.engine.declineDouble(player.seat);if(this.engine.state.turn!==player.seat)throw new Error('Sıra sende değil.');if(action==='doubleOffer')return this.engine.offerDouble(player.seat);if(this.engine.state.pendingDouble)throw new Error('Katlama teklifi cevap bekliyor.');if(action==='roll')return this.engine.setDice(die(),die());if(action==='move')return this.engine.move(point(payload.from),point(payload.to),payload.die??null);if(action==='moveCombined')return this.engine.moveCombined(point(payload.from),point(payload.to));throw new Error('Geçersiz Tavla aksiyonu.')}
  applyUpvp(player,action,payload){if(action==='roll')return this.engine.setSharedDice(die(),die(),player.seat,`roll-${this.version+1}`);if(action==='move')return this.engine.move(player.seat,point(payload.from),point(payload.to),payload.die??null);throw new Error('Geçersiz Üniversite Tavlası aksiyonu.')}
  applyPisti(player,action,payload){if(action==='play')return this.engine.playCard(player.seat,String(payload.cardId||''));if(action==='bluff')return this.engine.declareBluff(player.seat,String(payload.cardId||''));if(action==='bluff-believe')return this.engine.resolveBluff(player.seat,true);if(action==='bluff-challenge')return this.engine.resolveBluff(player.seat,false);throw new Error('Geçersiz Pişti aksiyonu.')}
  applyOkey(player,action,payload){const id=player.seat;if(action==='draw')return this.engine.drawFromStock(id);if(action==='take')return this.engine.takeDiscard(id);if(action==='returnDiscard')return this.engine.returnTakenDiscard(id);if(action==='openMelds')return this.engine.openMelds(id,payload.groups);if(action==='openPairs')return this.engine.openPairs(id,payload.groups);if(action==='autoOpenMelds')return this.engine.autoOpenMelds(id);if(action==='autoOpenPairs')return this.engine.autoOpenPairs(id);if(action==='autoLayoff')return this.engine.autoLayoff(id);if(action==='addToMeld')return this.engine.addToMeld(id,payload.ownerId,payload.meldId,payload.tileIds);if(action==='retrieveOkey')return this.engine.retrieveOkey(id,payload.ownerId,payload.meldId,payload.replacementTileId);if(action==='discard')return this.engine.discard(id,String(payload.tileId||''));throw new Error('Geçersiz 101 aksiyonu.')}
  applyWord(player,action,payload){const id=player.seat;if(action==='stage')return this.engine.stage(id,String(payload.tileId||''),payload.row,payload.col,payload.blankLetter);if(action==='unstage')return this.engine.unstage(id,payload.row,payload.col);if(action==='recall')return this.engine.recall(id);if(action==='submit')return this.engine.submit(id);if(action==='exchange')return this.engine.exchange(id,payload.tileIds);if(action==='pass')return this.engine.pass(id);throw new Error('Geçersiz Sözcük Kapışması aksiyonu.')}
  refreshStatus(){let finished=false,result=null;if(this.mode==='spvp'){finished=this.engine.state.status==='finished';result=finished?this.engine.getGameResult():null}else if(this.mode==='upvp'){finished=this.engine.match.status==='finished';result=finished?{winnerTeam:this.engine.match.winnerTeam,score:this.engine.match.score}:null}else{finished=this.engine.state.status==='finished';result=finished?(this.mode.startsWith('pisti')?{winner:this.engine.state.winner,winners:this.engine.state.winners,score:this.engine.state.score}:this.mode==='sozcukDuel'?{winnerPlayerId:this.engine.state.winner,scores:this.engine.state.scores}:{winnerPlayerId:this.engine.state.winnerPlayerId,scores:this.engine.state.scores}):null}if(finished){this.status='finished';this.repository?.finishMatch(this.id,result);for(const p of this.players)this.send(p.id,'game:finished',{matchId:this.id,result})}}
  setConnected(userId,connected){const p=this.player(userId);if(typeof this.engine.setPlayerConnected==='function')this.engine.setPlayerConnected(p.seat,connected);this.lastActivity=Date.now()}
}
class GameRoomManager{
  constructor(options={}){this.rooms=new Map();this.byUser=new Map();this.send=options.send||(()=>{});this.repository=options.repository||null}
  create(match){const room=new GameRoom(match,{send:this.send,repository:this.repository});this.rooms.set(room.id,room);for(const p of match.players)this.byUser.set(p.id,room.id);return room}
  restore(matches){return matches.map(match=>this.create(match))}
  get(id){const room=this.rooms.get(id);if(!room)throw new Error('Oyun odası bulunamadı.');return room}
  forUser(userId){const id=this.byUser.get(userId);return id?this.rooms.get(id)||null:null}
  remove(id){const room=this.rooms.get(id);if(!room)return false;for(const p of room.players)this.byUser.delete(p.id);return this.rooms.delete(id)}
  cleanup(finishedIdleMs=300000,activeIdleMs=86400000){const now=Date.now();for(const room of this.rooms.values()){if(room.status==='finished'&&now-room.lastActivity>finishedIdleMs)this.remove(room.id);else if(room.status==='playing'&&now-room.lastActivity>activeIdleMs){this.repository?.abandonMatch(room.id);this.remove(room.id)}}}
}
module.exports={GameRoom,GameRoomManager};
