'use strict';
const{randomUUID}=require('node:crypto');

const MISSIONS=Object.freeze([
  {id:'first_table',title:'İlk masanı tamamla',metric:'completed_matches',target:1,reward:100},
  {id:'tavla_three',title:'3 Tavla maçı oyna',metric:'tavla_matches',target:3,reward:150},
  {id:'friend_invite',title:'Bir arkadaş davet et',metric:'accepted_friends',target:1,reward:250},
  {id:'rewarded_ad',title:'Reklam izle, Coin kazan',metric:'rewarded_ads',target:1,reward:100}
]);

class MissionManager{
  constructor(options={}){this.repository=options.repository;this.notify=options.notify||(()=>{});if(!this.repository?.db)throw new Error('Görev deposu gerekli.');this.db=this.repository.db;this.migrate()}
  migrate(){this.db.exec(`CREATE TABLE IF NOT EXISTS mission_claims(mission_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),transaction_id TEXT,claimed_at INTEGER NOT NULL,PRIMARY KEY(mission_id,user_id));CREATE INDEX IF NOT EXISTS idx_mission_claims_user ON mission_claims(user_id,claimed_at DESC);`)}
  finishedMatches(userId){return this.db.prepare("SELECT id,mode,players_json,result_json FROM matches WHERE status='finished' AND players_json LIKE ?").all(`%${userId}%`).flatMap(row=>{try{const players=JSON.parse(row.players_json||'[]'),player=players.find(item=>item.id===userId);return player?[{...row,player,result:JSON.parse(row.result_json||'{}')}]:[]}catch{return[]}})}
  won(match){const result=match.result||{},keys=new Set([result.winnerPlayerId,result.winnerTeam,result.winner,...(Array.isArray(result.winners)?result.winners:[])].filter(value=>value!=null));return keys.has(match.player.id)||keys.has(match.player.seat)||keys.has(match.player.team)}
  progress(userId,metric){if(metric==='accepted_friends')return this.db.prepare("SELECT count(*) AS n FROM friendships WHERE status='accepted' AND requester_id=?").get(userId).n;if(metric==='rewarded_ads')return this.db.prepare("SELECT count(*) AS n FROM coin_transactions WHERE user_id=? AND type='rewarded_ad'").get(userId).n;const matches=this.finishedMatches(userId);if(metric==='completed_matches')return matches.length;if(metric==='tavla_matches')return matches.filter(match=>match.mode==='spvp'||match.mode==='upvp').length;return metric==='won_matches'?matches.filter(match=>this.won(match)).length:0}
  list(userId){const claimed=new Set(this.db.prepare('SELECT mission_id FROM mission_claims WHERE user_id=?').all(userId).map(row=>row.mission_id));return MISSIONS.map(mission=>{const progress=Math.min(mission.target,this.progress(userId,mission.metric));return{...mission,progress,completed:progress>=mission.target,claimed:claimed.has(mission.id)}})}
  claim(missionId,userId){const mission=MISSIONS.find(item=>item.id===missionId);if(!mission)throw new Error('Görev bulunamadı.');const previous=this.db.prepare('SELECT transaction_id FROM mission_claims WHERE mission_id=? AND user_id=?').get(mission.id,userId);if(previous)return{alreadyClaimed:true,reward:0,balance:this.repository.get(userId).coins,missions:this.list(userId)};if(this.progress(userId,mission.metric)<mission.target)throw new Error('Bu görev henüz tamamlanmadı.');const transactionId=randomUUID(),key=`mission:${mission.id}:${userId}`;let balance;this.db.exec('BEGIN IMMEDIATE');try{const user=this.repository.get(userId);balance=user.coins+mission.reward;this.db.prepare('UPDATE users SET coins=? WHERE id=?').run(balance,userId);this.db.prepare('INSERT INTO coin_transactions VALUES(?,?,?,?,?,?,?,?)').run(transactionId,userId,mission.reward,balance,'mission_reward',mission.id,key,Date.now());this.db.prepare('INSERT INTO mission_claims VALUES(?,?,?,?)').run(mission.id,userId,transactionId,Date.now());this.db.exec('COMMIT')}catch(error){this.db.exec('ROLLBACK');throw error}const missions=this.list(userId);this.notify(userId,'coins:updated',{balance,delta:mission.reward,type:'mission_reward',missionId:mission.id});this.notify(userId,'mission:update',{missions});return{alreadyClaimed:false,reward:mission.reward,balance,missions}}
  emit(userId){this.notify(userId,'mission:update',{missions:this.list(userId)})}
  emitPlayers(players=[]){for(const player of players)if(!player.isBot&&!String(player.id).startsWith('BOT-'))this.emit(player.id)}
}

module.exports={MissionManager,MISSIONS};
