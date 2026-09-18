'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const globals={EventTarget,CustomEvent,setTimeout,clearTimeout,sessionStorage:{getItem:()=>null},window:{}};
vm.runInNewContext(fs.readFileSync('src/match-client.js','utf8'),globals);
const client=globals.window.KANTIN_MATCH,events=[];
globals.window.KANTIN_ECONOMY={applyWallet:wallet=>events.push(['wallet',wallet.balance])};
for(const name of ['coins:updated','game:state','game:finished'])client.addEventListener(name,event=>events.push([name,event.detail]));
const packet={match:{matchId:'m',stake:500},gameState:{matchId:'m',turnId:'m:1',status:'playing'},wallet:{balance:2000,version:2},coin:{type:'entry',delta:-500,balance:2000,stake:500}};
client.consume(packet);client.consume(packet);assert.equal(events.filter(e=>e[0]==='coins:updated').length,1);assert.equal(events[0][0],'wallet');
const finish={...packet,result:{winner:'P2'},gameState:{...packet.gameState,status:'finished'},coin:{type:'loss',delta:0,net:-500,stake:500,balance:2000}};
client.consume(finish);client.consume(finish);assert.equal(events.filter(e=>e[0]==='game:finished').length,1);assert.equal(client.lastSettlement.net,-500);assert.equal(events.find(e=>e[0]==='game:finished')[1].coin.type,'loss');
console.log('✓ HTTP wallet updates, loss results and duplicate polling');
(async()=>{
 const context={window:{KANTIN_AUTH:{isAuthenticated:()=>false}},EventTarget,CustomEvent};
 vm.runInNewContext(fs.readFileSync('src/economy-client.js','utf8'),context);
 const economy=context.window.KANTIN_ECONOMY;await economy.ready;
 economy.applyWallet({balance:3000,version:4});economy.applyWallet({balance:2000,version:3});assert.equal(economy.balance,3000);economy.applyWallet({balance:1500,version:5});assert.equal(economy.balance,1500);
 console.log('✓ Older wallet responses cannot undo a newer balance');
})().catch(error=>{console.error(error);process.exitCode=1});
