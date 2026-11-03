const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET','POST'] },
  transports: ['websocket','polling'],
  pingTimeout: 20000,
  pingInterval: 10000,
});

const PORT = process.env.PORT || 3001;

const ROOM_CLEANUP_DELAY = 5 * 60 * 1000;
const RECONNECT_WINDOW   = 60 * 1000;   // 60s reconnect window
const AFK_TIMEOUT        = 30 * 1000;   // 30s auto-PASS
const AFK_WARN_SECS      = [10, 5];     // warn at these seconds remaining

/* ═══════════════════════════════════
   GAME DATA
═══════════════════════════════════ */
const CLS = {
  ASSAULT:{ name:'アサルト', hp:100, agi:3, hl:4, ap:4 },
  SNIPER: { name:'スナイパー',hp:70,  agi:2, hl:3, ap:3 },
  MEDIC:  { name:'メディック',hp:90,  agi:3, hl:4, ap:3 },
  TANK:   { name:'タンク',    hp:130, agi:1, hl:3, ap:3 },
  HACKER: { name:'ハッカー',  hp:80,  agi:4, hl:5, ap:3 },
};
const CARD = {
  TAP_FIRE:     { cost:2, type:'attack',       range:3,  dmg:15,                tgt:'enemy' },
  HEADSHOT:     { cost:3, type:'attack',       range:99, dmg:30,sniperOnly:true, tgt:'enemy' },
  DOOR_BREACH:  { cost:1, type:'attack',       range:1,  dmg:15,                tgt:'enemy' },
  FLASH_BANG:   { cost:1, type:'debuff',       range:3,                         tgt:'enemy' },
  JAMMING:      { cost:0, type:'debuff',       range:3,                         tgt:'enemy' },
  SPRINT:       { cost:0, type:'move',         range:2,                         tgt:'tile'  },
  COVER:        { cost:0, type:'defense',                                       tgt:'self'  },
  TURTLE:       { cost:0, type:'defense',                                       tgt:'self'  },
  RELOAD:       { cost:0, type:'utility',      ammo:5,                          tgt:'self'  },
  DEFIBRILLATOR:{ cost:0, type:'heal',         heal:30,                         tgt:'self'  },
  BURST_FIRE:   { cost:3, type:'attack',       range:2,  dmg:12, hits:2,        tgt:'enemy' },
  KNIFE:        { cost:1, type:'attack',       range:1,  dmg:25,                tgt:'enemy' },
  RECON:        { cost:0, type:'move',         range:3,                         tgt:'tile'  },
  MEDKIT:       { cost:1, type:'heal',         heal:50,                         tgt:'self'  },
  FRAG_GRENADE: { cost:4, type:'attack_aoe',   range:3,  dmg:25, aoeR:2,        tgt:'tile'  },
  EXECUTE:      { cost:4, type:'attack',       range:99, dmg:50, execute:0.4, sniperOnly:true, chargeReq:1, tgt:'enemy' },
  REVIVAL_SURGE:{ cost:2, type:'heal_cleanse', heal:60,                         tgt:'self'  },
  IRON_WALL:    { cost:1, type:'defense_full',                                  tgt:'self'  },
  BLACKOUT:     { cost:2, type:'debuff_aoe',   range:2,                         tgt:'self'  },
  GRENADE:      { cost:0, type:'attack_aoe',   range:2, dmg:22, aoeR:1,         tgt:'self'  },
  DEMOLISH:     { cost:0, type:'destroy_obs',  range:1,                         tgt:'tile'  },
  BARRICADE:    { cost:0, type:'create_obs',   range:1,                         tgt:'tile'  },
  // ── 状態異常カード ──
  BLEEDING_SHOT:{ cost:2, type:'attack',       range:3,  dmg:10, bleed:3,      tgt:'enemy' },
  SLOW_TRAP:    { cost:1, type:'debuff',       range:2,  slow:2,               tgt:'enemy' },
  SMOKE_GRENADE:{ cost:0, type:'create_smoke', range:2,  aoeR:1, smokeTurns:3, tgt:'tile'  },
};
const MAX_HAND_SIZE=12;
const KILL_REWARDS=['TAP_FIRE','BURST_FIRE','KNIFE','FLASH_BANG','GRENADE','DEFIBRILLATOR','MEDKIT','DEMOLISH','RECON','COVER'];
const DECKS = {
  ASSAULT:['TAP_FIRE','TAP_FIRE','TAP_FIRE','DOOR_BREACH','DOOR_BREACH','SPRINT','SPRINT','COVER','COVER','FLASH_BANG','TAP_FIRE','SPRINT','BURST_FIRE','KNIFE','GRENADE','DEMOLISH','DEMOLISH','BARRICADE','BARRICADE','DEFIBRILLATOR','DEFIBRILLATOR','DEFIBRILLATOR','BLEEDING_SHOT','SMOKE_GRENADE','FRAG_GRENADE'],
  SNIPER: ['HEADSHOT','HEADSHOT','HEADSHOT','HEADSHOT','TAP_FIRE','TAP_FIRE','SPRINT','COVER','COVER','FLASH_BANG','TAP_FIRE','COVER','RECON','GRENADE','DEMOLISH','DEMOLISH','BARRICADE','BARRICADE','DEFIBRILLATOR','DEFIBRILLATOR','DEFIBRILLATOR','SMOKE_GRENADE','EXECUTE'],
  MEDIC:  ['DEFIBRILLATOR','DEFIBRILLATOR','DEFIBRILLATOR','DEFIBRILLATOR','TAP_FIRE','TAP_FIRE','SPRINT','SPRINT','COVER','FLASH_BANG','TAP_FIRE','COVER','SPRINT','MEDKIT','GRENADE','DEMOLISH','DEMOLISH','BARRICADE','BARRICADE','DEFIBRILLATOR','DEFIBRILLATOR','DEFIBRILLATOR','SMOKE_GRENADE','REVIVAL_SURGE'],
  TANK:   ['TURTLE','TURTLE','TURTLE','TURTLE','TAP_FIRE','TAP_FIRE','SPRINT','COVER','COVER','COVER','FLASH_BANG','TAP_FIRE','SPRINT','KNIFE','DOOR_BREACH','GRENADE','DEMOLISH','DEMOLISH','BARRICADE','BARRICADE','DEFIBRILLATOR','DEFIBRILLATOR','DEFIBRILLATOR','SLOW_TRAP','IRON_WALL'],
  HACKER: ['JAMMING','JAMMING','JAMMING','JAMMING','TAP_FIRE','TAP_FIRE','SPRINT','SPRINT','COVER','FLASH_BANG','TAP_FIRE','JAMMING','COVER','FLASH_BANG','RECON','BURST_FIRE','GRENADE','DEMOLISH','DEMOLISH','BARRICADE','BARRICADE','DEFIBRILLATOR','DEFIBRILLATOR','SLOW_TRAP','BLEEDING_SHOT','BLACKOUT'],
};
const OBS_INIT = ['0,3','1,1','1,5','2,3','3,3','4,3','5,1','5,5','6,3'];
const gsObs = gs => new Set(gs?.obstacles || OBS_INIT);
const AI_CLS    = ['ASSAULT','SNIPER','TANK','HACKER','MEDIC'];

/* ── マップ生成 ── */
function genObstacles(mapType='RANDOM') {
  if(mapType==='OPEN'){
    return [{r:1,c:3},{r:3,c:1},{r:3,c:5},{r:5,c:3}].map(({r,c})=>`${r},${c}`);
  }
  if(mapType==='DENSE'){
    return [{r:1,c:2},{r:1,c:4},{r:2,c:1},{r:2,c:3},{r:2,c:5},
      {r:3,c:2},{r:3,c:4},{r:4,c:1},{r:4,c:3},{r:4,c:5},
      {r:5,c:2},{r:5,c:4}].map(({r,c})=>`${r},${c}`);
  }
  if(mapType==='CORRIDOR'){
    return [{r:0,c:2},{r:0,c:4},{r:2,c:0},{r:2,c:6},
      {r:3,c:2},{r:3,c:4},{r:4,c:0},{r:4,c:6},
      {r:6,c:2},{r:6,c:4}].map(({r,c})=>`${r},${c}`);
  }
  // RANDOM
  const safe=new Set(['0,0','0,1','1,0','0,5','0,6','1,5','1,6','5,0','5,1','6,0','6,1','5,5','5,6','6,5','6,6']);
  const candidates=[];
  for(let r=0;r<7;r++) for(let c=0;c<7;c++){if(!safe.has(`${r},${c}`))candidates.push({r,c});}
  const picked=[];
  for(const {r,c} of shuffle(candidates)){
    if(picked.length>=9)break;
    if(picked.some(o=>Math.abs(o.r-r)+Math.abs(o.c-c)<=1))continue;
    picked.push({r,c});
  }
  return picked.map(({r,c})=>`${r},${c}`);
}

function genStarts(n,obstacles=[]) {
  const obsSet=new Set(obstacles);
  const all=[];
  for(let r=0;r<7;r++) for(let c=0;c<7;c++){if(!obsSet.has(`${r},${c}`))all.push({r,c});}
  const shuffled=shuffle(all);
  const picked=[];
  for(const pos of shuffled){
    if(picked.length>=n)break;
    if(picked.every(p=>Math.abs(p.r-pos.r)+Math.abs(p.c-pos.c)>=3))picked.push(pos);
  }
  if(picked.length<n){
    for(const pos of shuffled){
      if(picked.length>=n)break;
      if(!picked.some(p=>p.r===pos.r&&p.c===pos.c))picked.push(pos);
    }
  }
  return picked;
}

/* ═══════════════════════════════════
   HELPERS
═══════════════════════════════════ */
const shuffle = a => { const b=[...a]; for(let i=b.length-1;i>0;i--){const j=0|Math.random()*(i+1);[b[i],b[j]]=[b[j],b[i]];} return b; };
const dist = (a,b) => Math.abs(a.r-b.r)+Math.abs(a.c-b.c);
const genToken = () => crypto.randomBytes(8).toString('hex');

function genCode() {
  const ch='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for(let i=0;i<100;i++){
    let c=''; for(let j=0;j<4;j++) c+=ch[0|Math.random()*ch.length];
    if(!rooms.has(c)) return c;
  }
  throw new Error('no unique code');
}

function sanitizeName(n) {
  if(typeof n!=='string') return null;
  const s=n.trim().slice(0,12);
  return s.length>0?s:null;
}

function mkPlayer(id, cls, socketId, pos, name, isAI=false, handSize=3) {
  const d=CLS[cls]; const deck=shuffle([...DECKS[cls]]); const hs=Math.min(Math.max(2,handSize),6); const hand=deck.splice(0,hs);
  return { id, cls, socketId, isAI,
    name: name||(isAI?`AI-${d.name}`:`P${id+1}`),
    hp:d.hp, maxHp:d.hp, agi:d.agi,
    hand, deck, pos:{...pos}, alive:true,
    covered:false, turtled:false, flashed:false, ironwall:false,
    bleedTurns:0, slowTurns:0, chargeMap:{}, pendingCharge:null,
    submitted:false,
    reconnectToken: isAI ? null : genToken(),
    disconnectedAt: null,
  };
}

/* ═══════════════════════════════════
   VALIDATION
═══════════════════════════════════ */
function validateAction(action, player, players, gs={}) {
  if(!action||typeof action!=='object') return false;
  const {cardId,target}=action;
  if(cardId==='PASS') return true;
  if(cardId==='STEP_MOVE'){
    if(!target||typeof target.r!=='number'||typeof target.c!=='number') return false;
    const{r,c}=target;
    if(r<0||r>6||c<0||c>6) return false;
    if(gsObs(gs).has(`${r},${c}`)) return false;
    if(players.some(p=>p.alive&&p.pos.r===r&&p.pos.c===c)) return false;
    return dist(player.pos,{r,c})===1;
  }
  const c=CARD[cardId]; if(!c) return false;
  if(!player.hand.includes(cardId)) return false;
  if(c.tgt==='self') return true;
  if(c.tgt==='tile'){
    if(!target||typeof target.r!=='number'||typeof target.c!=='number') return false;
    const{r,c:col}=target;
    if(r<0||r>6||col<0||col>6) return false;
    if(c.type==='attack_aoe'){
      if(dist(player.pos,{r,c:col})>(CARD[cardId].range||3)) return false;
      return true;
    }
    if(c.type==='destroy_obs'){
      return gsObs(gs).has(`${r},${col}`)&&dist(player.pos,{r,c:col})<=1;
    }
    if(c.type==='create_obs'){
      if(gsObs(gs).has(`${r},${col}`)) return false;
      if(players.some(p=>p.alive&&p.pos.r===r&&p.pos.c===col)) return false;
      return dist(player.pos,{r,c:col})<=1;
    }
    if(c.type==='create_smoke'){
      return dist(player.pos,{r,c:col})<=(CARD[cardId].range||2);
    }
    if(gsObs(gs).has(`${r},${col}`)) return false;
    if(players.some(p=>p.alive&&p.pos.r===r&&p.pos.c===col)) return false;
    if(dist(player.pos,{r,c:col})>(CARD[cardId].range||2)) return false;
    return true;
  }
  if(c.tgt==='enemy'){
    if(typeof target!=='number') return false;
    const tp=players.find(p=>p.id===target);
    if(!tp||!tp.alive||tp.id===player.id) return false;
    if(dist(player.pos,tp.pos)>(CARD[cardId].range||1)) return false;
    return true;
  }
  return false;
}

/* ═══════════════════════════════════
   AI
═══════════════════════════════════ */
function aiPlan(ai, players, gs={}) {
  // チャージ中は強制パス（次ターン自動発射）
  if(ai.pendingCharge)return{playerId:ai.id,cardId:'PASS',target:null};
  const foes=players.filter(p=>p.alive&&p.id!==ai.id);
  if(!foes.length||!ai.hand.length) return {playerId:ai.id,cardId:'PASS',target:null};
  const near=foes.reduce((a,b)=>dist(ai.pos,a.pos)<dist(ai.pos,b.pos)?a:b);
  // defense/heal when low
  if(ai.hp<ai.maxHp*0.5){
    for(const cid of ai.hand){const c=CARD[cid];
      if((c.type==='heal'||c.type==='heal_cleanse'||c.type==='defense'||c.type==='defense_full'||c.type==='utility'))
        return{playerId:ai.id,cardId:cid,target:null};
    }
  }
  // attack_aoe: tgt:'self'(GRENADE)はself-center、tgt:'tile'(FRAG_GRENADE)はタイル指定
  for(const cid of ai.hand){const c=CARD[cid];
    if(c.type==='attack_aoe'){
      if(c.tgt==='self'){
        const inBlast=foes.filter(f=>dist(ai.pos,f.pos)<=(c.aoeR||1));
        if(inBlast.length>=1)return{playerId:ai.id,cardId:cid,target:null};
      } else {
        const nearFoes=foes.filter(f=>dist(ai.pos,f.pos)<=(c.range||3)+(c.aoeR||2));
        if(nearFoes.length>=1){
          const tile=nearFoes.reduce((a,b)=>dist(ai.pos,a.pos)<dist(ai.pos,b.pos)?a:b).pos;
          return{playerId:ai.id,cardId:cid,target:tile};
        }
      }
    }
  }
  // debuff_aoe
  for(const cid of ai.hand){const c=CARD[cid];
    if(c.type==='debuff_aoe'&&foes.some(f=>dist(ai.pos,f.pos)<=(c.range||2)))
      return{playerId:ai.id,cardId:cid,target:null};
  }
  // attack (including execute)
  for(const cid of ai.hand){const c=CARD[cid];
    if(c.type==='attack'){
      const rng=c.range===99?999:c.range||1;
      const inRng=foes.filter(f=>dist(ai.pos,f.pos)<=rng);
      if(!inRng.length) continue;
      // execute: prioritize lowest-HP foe; otherwise nearest
      const tgt=c.execute
        ? inRng.slice().sort((a,b)=>a.hp-b.hp)[0]
        : (inRng.includes(near) ? near : inRng.slice().sort((a,b)=>dist(ai.pos,a.pos)-dist(ai.pos,b.pos))[0]);
      return{playerId:ai.id,cardId:cid,target:tgt.id};
    }
  }
  // debuff
  for(const cid of ai.hand){const c=CARD[cid];
    if(c.type==='debuff'&&dist(ai.pos,near.pos)<=(c.range||1))
      return{playerId:ai.id,cardId:cid,target:near.id};
  }
  // move
  for(const cid of ai.hand){const c=CARD[cid];
    if(c.type==='move'){const dr=Math.sign(near.pos.r-ai.pos.r),dc=Math.sign(near.pos.c-ai.pos.c);
      for(const t of[{r:ai.pos.r+dr,c:ai.pos.c},{r:ai.pos.r,c:ai.pos.c+dc}]){
        if(t.r<0||t.r>6||t.c<0||t.c>6)continue;
        if(gsObs(gs).has(`${t.r},${t.c}`))continue;
        if(players.some(p=>p.alive&&p.pos.r===t.r&&p.pos.c===t.c))continue;
        return{playerId:ai.id,cardId:cid,target:t};
      }
    }
  }
  for(const cid of ai.hand){const c=CARD[cid];if(c.tgt==='self')return{playerId:ai.id,cardId:cid,target:null};}
  return{playerId:ai.id,cardId:ai.hand[0]||'PASS',target:null};
}

/* ═══════════════════════════════════
   RESOLUTION ENGINE
═══════════════════════════════════ */
function resolveRound(gs, actions) {
  // _killTimer等の循環参照を除去してクローン
  const s=JSON.parse(JSON.stringify(gs,(key,val)=>key.startsWith('_')?undefined:val));
  if(!s.smokes)s.smokes=[];
  const logs=['━━ 解決フェーズ ━━'];
  // ドロー補助（手札上限チェック付き）
  const drawCard=(p)=>{if(p.hand.length>=MAX_HAND_SIZE)return null;if(!p.deck.length){p.deck=shuffle([...DECKS[p.cls]]);}return p.deck.pop()||null;};

  // Pre-Phase: チャージ完了カードの自動発射
  for(const a of s.players){
    if(!a.alive||!a.pendingCharge)continue;
    // 切断中はチャージキャンセル
    if(a.disconnectedAt){a.pendingCharge=null;logs.push(`🔌 ${a.name}: 切断中 — 照準キャンセル`);continue;}
    const pc=a.pendingCharge; a.pendingCharge=null;
    const c=CARD[pc.cardId]; if(!c)continue;
    if(a.flashed){logs.push(`⚡ ${a.name}: フラッシュ中 — 照準キャンセル`);continue;}
    const t=s.players.find(p=>p.id===pc.target);
    logs.push(`🎯 ${a.name}: 照準完了→発射！`);
    if(t&&t.alive){
      if(t.ironwall){logs.push(`🔰 ${t.name}: アイアンウォール！ダメ無効`);continue;}
      if(c.execute&&t.hp/t.maxHp<c.execute&&!t.covered&&!t.turtled){
        t.hp=0;t.alive=false;t.pendingCharge=null;
        logs.push(`💥 ${a.name}→${t.name}: エグゼキュート — 即死！`);
        logs.push(`💀 ${t.name} 撃破！`);
        const _kr=KILL_REWARDS[0|Math.random()*KILL_REWARDS.length];
        if(a.hand.length<MAX_HAND_SIZE)a.hand.push(_kr);logs.push(`🎖️ ${a.name}: キル報酬 +${_kr}`);
      } else {
        let dmg=c.dmg||0;
        if(t.turtled)dmg=Math.max(1,Math.ceil(dmg*0.2));else if(t.covered)dmg=Math.max(1,Math.ceil(dmg*0.5));
        t.hp=Math.max(0,t.hp-dmg);
        logs.push(`🔫 ${a.name}→${t.name}: ${pc.cardId} [${dmg}ダメ] HP:${t.hp}`);
        if(t.hp<=0&&t.alive){
          t.alive=false;t.pendingCharge=null;
          logs.push(`💀 ${t.name} 撃破！`);
          const _kr=KILL_REWARDS[0|Math.random()*KILL_REWARDS.length];
          if(a.hand.length<MAX_HAND_SIZE)a.hand.push(_kr);logs.push(`🎖️ ${a.name}: キル報酬 +${_kr}`);
        }
      }
    } else { logs.push(`🎯 ${a.name}: ターゲット${t?'は既に撃破':'不在'} — 不発`); }
  }

  // Phase 0: defense (COVER/TURTLE/IRON_WALL — all before attacks)
  for(const act of actions){
    if(act.cardId==='PASS') continue;
    const c=CARD[act.cardId]; if(!c||!(c.type==='defense'||c.type==='defense_full')) continue;
    const actor=s.players.find(p=>p.id===act.playerId); if(!actor||!actor.alive) continue;
    const hi=actor.hand.indexOf(act.cardId); if(hi!==-1)actor.hand.splice(hi,1);
    if(act.cardId==='TURTLE'){actor.turtled=true;logs.push(`🛡️ ${actor.name}: タートル`);}
    else if(act.cardId==='IRON_WALL'){actor.ironwall=true;logs.push(`🔰 ${actor.name}: アイアンウォール（完全無敵）`);}
    else{actor.covered=true;logs.push(`🛡️ ${actor.name}: カバー`);}
    // カード使用後ドロー
    const _ddc=drawCard(actor);if(_ddc){actor.hand.push(_ddc);logs.push(`🎴 ${actor.name}: +${_ddc}`);}
  }

  // Phase 1: AGI order
  const sorted=[...actions].sort((a,b)=>{
    const pa=s.players.find(p=>p.id===a.playerId),pb=s.players.find(p=>p.id===b.playerId);
    const d=(pb?.agi||0)-(pa?.agi||0); return d!==0?d:Math.random()-0.5;
  });
  for(const act of sorted){
    const actor=s.players.find(p=>p.id===act.playerId); if(!actor||!actor.alive) continue;
    if(act.cardId==='PASS'){
      const _pdc=drawCard(actor);if(_pdc)actor.hand.push(_pdc);
      logs.push(`⏭ ${actor.name}: パス [+1ドロー]`);continue;
    }
    if(act.cardId==='STEP_MOVE'){
      if(actor.flashed){logs.push(`⚡ ${actor.name}: フラッシュ中 — 1歩スキップ`);continue;}
      if(act.target&&typeof act.target==='object'){
        actor.pos=act.target;
        const _sdc=drawCard(actor);if(_sdc)actor.hand.push(_sdc);
        logs.push(`👣 ${actor.name}: 1歩移動 →(${act.target.r},${act.target.c}) [+1ドロー]`);
      }
      continue;
    }
    if(actor.flashed){logs.push(`⚡ ${actor.name}: フラッシュ中 — スキップ`);continue;}
    const c=CARD[act.cardId]; if(!c||c.type==='defense'||c.type==='defense_full') continue;
    const _hi2=actor.hand.indexOf(act.cardId); if(_hi2!==-1)actor.hand.splice(_hi2,1);
    switch(c.type){
      case'attack':{
        // スナイパー照準チャージ
        if(c.chargeReq){
          actor.pendingCharge={cardId:act.cardId,target:act.target};
          logs.push(`🎯 ${actor.name}: 照準チャージ開始 — 次ターン自動発射`);
          const _cdc=drawCard(actor);if(_cdc){actor.hand.push(_cdc);logs.push(`🎴 ${actor.name}: +${_cdc}`);}
          break;
        }
        const t=s.players.find(p=>p.id===act.target);
        if(t&&t.alive){
          if(t.ironwall){logs.push(`🔰 ${t.name}: アイアンウォール！ダメ無効`);break;}
          // エグゼキュート: 防御なし・HP閾値以下なら即死。COVER/TURTLEで防御可
          if(c.execute&&t.hp/t.maxHp<c.execute&&!t.covered&&!t.turtled){
            t.hp=0;t.alive=false;t.pendingCharge=null;
            logs.push(`💥 ${actor.name}→${t.name}: エグゼキュート 即死！`);
            logs.push(`💀 ${t.name} 撃破！`);
            const _kr=KILL_REWARDS[0|Math.random()*KILL_REWARDS.length];
            if(actor.hand.length<MAX_HAND_SIZE)actor.hand.push(_kr);
            logs.push(`🎖️ ${actor.name}: キル報酬 +${_kr}`);
            break;
          }
          // スナイパーペナルティ: COVER/TURTLEで防がれた場合スタン
          if(c.sniperOnly&&(t.covered||t.turtled)){
            actor.flashed=true;
            logs.push(`⚡ ${actor.name}: スナイパースタン（防御に阻まれた）`);
          }
          // スモーク内ミス判定
          const _inSmoke=s.smokes&&s.smokes.some(sm=>dist(sm.pos,t.pos)<=sm.aoeR);
          if(_inSmoke&&Math.random()<0.5){logs.push(`💨 ${actor.name}→${t.name}: スモークでミス！`);break;}
          if(c.hits&&c.hits>1){
            let total=0;
            for(let h=0;h<c.hits;h++){
              if(t.hp<=0)break;
              let d=c.dmg||0;
              if(t.turtled)d=Math.max(1,Math.ceil(d*0.2));else if(t.covered)d=Math.max(1,Math.ceil(d*0.5));
              t.hp=Math.max(0,t.hp-d);total+=d;
            }
            logs.push(`🔫 ${actor.name}→${t.name}: ${act.cardId} [${total}ダメ/${c.hits}ヒット] HP:${t.hp}`);
          } else {
            let dmg=c.dmg||0;
            if(t.turtled)dmg=Math.max(1,Math.ceil(dmg*0.2));else if(t.covered)dmg=Math.max(1,Math.ceil(dmg*0.5));
            t.hp=Math.max(0,t.hp-dmg);
            // 出血付与
            if(c.bleed&&!t.ironwall){t.bleedTurns=Math.max(t.bleedTurns||0,c.bleed);logs.push(`🩸 ${t.name}: 出血${c.bleed}T付与！`);}
            logs.push(`🔫 ${actor.name}→${t.name}: ${act.cardId} [${dmg}ダメ] HP:${t.hp}`);
          }
          if(t.hp<=0&&t.alive){
            t.alive=false;t.pendingCharge=null;
            logs.push(`💀 ${t.name} 撃破！`);
            const _kr2=KILL_REWARDS[0|Math.random()*KILL_REWARDS.length];
            if(actor.hand.length<MAX_HAND_SIZE)actor.hand.push(_kr2);
            logs.push(`🎖️ ${actor.name}: キル報酬 +${_kr2}`);
          }
        }
        break;
      }
      case'attack_aoe':{
        const _aoeCtr=(act.target&&typeof act.target==='object')?act.target:actor.pos;
        if(_aoeCtr){
          const aoeR=c.aoeR||2,dmg=c.dmg||20;
          const victims=s.players.filter(p=>p.alive&&p.id!==actor.id&&dist(p.pos,_aoeCtr)<=aoeR);
          const parts=[];
          for(const t of victims){
            if(t.ironwall){logs.push(`🔰 ${t.name}: アイアンウォール！ダメ無効`);continue;}
            // AOEスモークミス判定
            const _inSm=s.smokes&&s.smokes.some(sm=>dist(sm.pos,t.pos)<=sm.aoeR);
            if(_inSm&&Math.random()<0.5){parts.push(`${t.name}[MISS💨]`);continue;}
            let d=dmg;
            if(t.turtled)d=Math.max(1,Math.ceil(d*0.2));else if(t.covered)d=Math.max(1,Math.ceil(d*0.5));
            t.hp=Math.max(0,t.hp-d);parts.push(`${t.name}[${d}]`);
            if(t.hp<=0&&t.alive){t.alive=false;t.pendingCharge=null;}
          }
          logs.push(parts.length?`💥 ${actor.name}: ${act.cardId} → ${parts.join(' ')}`:
            `💥 ${actor.name}: ${act.cardId}（命中なし）`);
          const killed=victims.filter(t=>!t.alive&&t.hp<=0);
          for(const t of killed){
            logs.push(`💀 ${t.name} 撃破！`);
            const _kr=KILL_REWARDS[0|Math.random()*KILL_REWARDS.length];
            if(actor.hand.length<MAX_HAND_SIZE)actor.hand.push(_kr);
            logs.push(`🎖️ ${actor.name}: キル報酬 +${_kr}`);
          }
          // GRENADE自爆ダメージ
          if(c.tgt==='self'&&!actor.ironwall){
            const selfDmg=Math.ceil(dmg*0.35);
            actor.hp=Math.max(0,actor.hp-selfDmg);
            logs.push(`💥 ${actor.name}: 自爆 [${selfDmg}ダメ] HP:${actor.hp}`);
            if(actor.hp<=0&&actor.alive){actor.alive=false;logs.push(`💀 ${actor.name} 自爆死！`);}
          }
        }
        break;
      }
      case'heal':actor.hp=actor.hp+(c.heal||30);logs.push(`💊 ${actor.name}: 回復 HP→${actor.hp}${actor.hp>actor.maxHp?' 🔺超過':''}`);break;
      case'heal_cleanse':actor.hp=actor.hp+(c.heal||60);actor.flashed=false;actor.bleedTurns=0;actor.slowTurns=0;actor.agi=CLS[actor.cls]?.agi||actor.agi;logs.push(`💊 ${actor.name}: リバイバルサージ HP→${actor.hp}${actor.hp>actor.maxHp?' 🔺超過':''}（全状態異常解除）`);break;
      case'move':if(act.target&&typeof act.target==='object'){
        const{r:mr,c:mc}=act.target;
        // 境界・障害物チェック（validateActionをすり抜けた場合の安全弁）
        if(mr>=0&&mr<=6&&mc>=0&&mc<=6&&!gsObs(s).has(`${mr},${mc}`)){
          actor.pos=act.target;logs.push(`🏃 ${actor.name}: →(${mr},${mc})`);
        } else {
          logs.push(`🏃 ${actor.name}: 移動無効（障害物または範囲外）`);
        }
      } break;
      case'debuff':{const t=s.players.find(p=>p.id===act.target);if(t&&t.alive){if(act.cardId==='FLASH_BANG'){t.flashed=true;logs.push(`⚡ ${actor.name}→${t.name}: フラッシュ！`);}else if(act.cardId==='JAMMING'&&t.hand.length){t.hand.splice(0|Math.random()*t.hand.length,1);logs.push(`📡 ${actor.name}→${t.name}: ジャミング！`);}else if(c.slow){t.slowTurns=Math.max(t.slowTurns||0,c.slow);t.agi=Math.max(1,(t.agi||1)-c.slow);logs.push(`🐢 ${actor.name}→${t.name}: スロー${c.slow}T（AGI-${c.slow}）！`);}}break;}
      case'debuff_aoe':{
        const range=c.range||2;
        const targets=s.players.filter(p=>p.alive&&p.id!==actor.id&&dist(actor.pos,p.pos)<=range);
        const flashed=targets.filter(t=>{if(t.ironwall)return false;t.flashed=true;return true;});
        logs.push(flashed.length?`⚡ ${actor.name}: BLACKOUT → ${flashed.map(t=>t.name).join(' ')} フラッシュ！`:`⚡ ${actor.name}: BLACKOUT（範囲内に敵なし）`);
        break;
      }
      case'utility':{
        const _udc=drawCard(actor);if(_udc)actor.hand.push(_udc);
        logs.push(`🃏 ${actor.name}: リロード →カードドロー`);break;
      }
      case'destroy_obs':{
        if(act.target&&typeof act.target==='object'){
          const _k=`${act.target.r},${act.target.c}`;
          if(gsObs(s).has(_k)){
            s.obstacles=(s.obstacles||[...OBS_INIT]).filter(k=>k!==_k);
            logs.push(`🔨 ${actor.name}: デモリッシュ → 障害物(${act.target.r},${act.target.c})破壊！`);
          } else logs.push(`🔨 ${actor.name}: デモリッシュ → 障害物なし`);
        }break;
      }
      case'create_obs':{
        if(act.target&&typeof act.target==='object'){
          const _ck=`${act.target.r},${act.target.c}`;
          const _cocc=s.players.some(p=>p.alive&&p.pos.r===act.target.r&&p.pos.c===act.target.c);
          if(!_cocc&&!gsObs(s).has(_ck)){
            s.obstacles=[...(s.obstacles||[...OBS_INIT]),_ck];
            logs.push(`🧱 ${actor.name}: バリケード → 障害物(${act.target.r},${act.target.c})生成！`);
          } else logs.push(`🧱 ${actor.name}: バリケード → 設置不可`);
        }break;
      }
      case'create_smoke':{
        if(act.target&&typeof act.target==='object'){
          if(!s.smokes)s.smokes=[];
          const aoeR=c.aoeR||1;
          s.smokes.push({pos:{...act.target},aoeR,turns:(c.smokeTurns||3)+1});
          logs.push(`💨 ${actor.name}: スモーク設置(${act.target.r},${act.target.c}) ${c.smokeTurns||3}T有効`);
        }break;
      }
    }
    // カード使用後ドロー（utility=効果がドローなので除外）
    if(c.type!=='utility'){
      const _adc=drawCard(actor);if(_adc){actor.hand.push(_adc);logs.push(`🎴 ${actor.name}: +${_adc}`);}
    }
  }
  // Phase 2: ターン終了処理
  for(const p of s.players){
    if(!p.alive)continue;
    p.covered=false;p.turtled=false;p.flashed=false;p.ironwall=false;p.submitted=false;
    // 出血ダメージ
    if(p.bleedTurns>0){
      const bd=5;p.hp=Math.max(0,p.hp-bd);
      p.bleedTurns--;
      logs.push(`🩸 ${p.name}: 出血ダメ[${bd}] HP:${p.hp} 残${p.bleedTurns}T`);
      if(p.hp<=0&&p.alive){p.alive=false;logs.push(`💀 ${p.name} 出血死！`);}
    }
    // スロー終了カウント
    if(p.slowTurns>0){
      p.slowTurns--;
      if(p.slowTurns===0){
        p.agi=CLS[p.cls]?.agi||p.agi;
        logs.push(`⚡ ${p.name}: スロー解除（AGI回復）`);
      }
    }
  }
  // スモークタイル更新
  if(s.smokes){
    s.smokes=s.smokes.map(sm=>({...sm,turns:sm.turns-1})).filter(sm=>sm.turns>0);
  }
  return{state:s,logs};
}

/* ═══════════════════════════════════
   ROOM MANAGER
═══════════════════════════════════ */
const rooms = new Map();
const socketToRoom = new Map();
const reconnectTokens = new Map();

function getRoomBySocket(sid){
  const code=socketToRoom.get(sid); if(!code) return null;
  const room=rooms.get(code); return room?{code,room}:null;
}

function viewForPlayer(gs, mySocketId){
  const me=gs.players.find(p=>p.socketId===mySocketId);
  const spectating=me&&!me.alive;
  return{obstacles:gs.obstacles||OBS_INIT,players:gs.players.map(p=>({
    id:p.id,cls:p.cls,socketId:p.socketId,isAI:p.isAI,name:p.name,
    hp:p.hp,maxHp:p.maxHp,agi:p.agi,ammo:p.ammo,maxAmmo:p.maxAmmo,
    pos:p.pos,alive:p.alive,covered:p.covered,turtled:p.turtled,flashed:p.flashed,ironwall:p.ironwall||false,
    hand:(p.socketId===mySocketId||spectating)?p.hand:new Array(p.hand.length).fill('HIDDEN'),
    handCount:p.hand.length,
    deckCount:p.deck.length,
    submitted:p.submitted||false,
    disconnected:!!p.disconnectedAt,
    pendingCharge:p.pendingCharge||null,
    bleedTurns:p.bleedTurns||0,
    slowTurns:p.slowTurns||0,
  })),smokes:gs.smokes||[]};
}

function roomInfo(room){
  return{code:room.code,host:room.host,
    members:room.members.map(m=>({name:m.name,cls:m.cls,socketId:m.socketId})),
    bots:room.bots,phase:room.phase,mapType:room.mapType||'RANDOM',timerSecs:room.timerSecs??30,maxRounds:room.maxRounds||20};
}

function scheduleRoomCleanup(code){
  setTimeout(()=>{
    const room=rooms.get(code); if(!room) return;
    if(room.gameState){for(const p of room.gameState.players){if(p.reconnectToken)reconnectTokens.delete(p.reconnectToken);}}
    for(const m of room.members) socketToRoom.delete(m.socketId);
    rooms.delete(code);
    console.log(`[ROOM] ${code} cleaned up`);
  }, ROOM_CLEANUP_DELAY);
}

/* ═══════════════════════════════════
   AFK TIMER
═══════════════════════════════════ */
function clearRoundTimer(room){
  for(const t of['afkTimer','warnTimer1','warnTimer2']){
    if(room[t]){clearTimeout(room[t]);room[t]=null;}
  }
  room.roundDeadline=null;
}

function startRoundTimer(code, room){
  clearRoundTimer(room);
  if(room.phase!=='playing') return;
  const ts=room.timerSecs;
  // timerSecs===0 → 無制限
  if(ts===0){
    room.roundDeadline=null;
    io.to(code).emit('round_timer',{deadline:null});
    return;
  }
  const timeout=(ts||30)*1000;
  const warn1=Math.max(0,timeout-10000);
  const warn2=Math.max(0,timeout-5000);
  room.roundDeadline=Date.now()+timeout;

  room.warnTimer1=setTimeout(()=>{
    if(room.phase!=='playing') return;
    const missing=room.gameState.players.filter(p=>p.alive&&!p.isAI&&!room.pendingActions.has(p.id)&&!p.disconnectedAt).map(p=>p.name);
    if(missing.length) io.to(code).emit('timer_warning',{secondsLeft:10,missing});
  }, warn1);

  room.warnTimer2=setTimeout(()=>{
    if(room.phase!=='playing') return;
    const missing=room.gameState.players.filter(p=>p.alive&&!p.isAI&&!room.pendingActions.has(p.id)&&!p.disconnectedAt).map(p=>p.name);
    if(missing.length) io.to(code).emit('timer_warning',{secondsLeft:5,missing});
  }, warn2);

  room.afkTimer=setTimeout(()=>{
    if(room.phase!=='playing') return;
    const afk=room.gameState.players.filter(p=>p.alive&&!p.isAI&&!room.pendingActions.has(p.id)&&!p.disconnectedAt);
    if(!afk.length) return;
    for(const p of afk) room.pendingActions.set(p.id,{playerId:p.id,cardId:'PASS',target:null});
    io.to(code).emit('system_msg',{msg:`⏱ ${afk.map(p=>p.name).join(', ')} タイムアウト → 自動パス`});
    tryResolveRound(code, room);
  }, timeout);

  io.to(code).emit('round_timer',{deadline:room.roundDeadline});
}

/* ═══════════════════════════════════
   RESOLVER
═══════════════════════════════════ */
function tryResolveRound(code, room){
  if(room.phase!=='playing'||room._resolving) return;
  room._resolving=true;
  const aliveHumans=room.gameState.players.filter(p=>p.alive&&!p.isAI&&!p.disconnectedAt);
  const allIn=aliveHumans.length===0||aliveHumans.every(p=>room.pendingActions.has(p.id));
  if(!allIn) return;

  clearRoundTimer(room);

  const aiActions=room.gameState.players.filter(p=>p.alive&&p.isAI).map(p=>aiPlan(p,room.gameState.players,room.gameState)).filter(Boolean);
  const allActions=[...room.pendingActions.values(),...aiActions];
  const{state,logs}=resolveRound(room.gameState,allActions);
  room.gameState=state;
  room.pendingActions=new Map();
  room.round++;

  const alive=state.players.filter(p=>p.alive);
  const maxR=room.maxRounds||20;
  const roundLimitReached=room.round>maxR&&alive.length>1;
  if(alive.length<=1||roundLimitReached){
    room.phase='finished';
    let winner=null;
    if(alive.length===0){
      // 全滅: HP最後に高かったプレイヤーを判定（引き分け）
      const byHp=[...state.players].sort((a,b)=>b.hp-a.hp);
      if(byHp[0]?.hp===byHp[1]?.hp){
        logs.push(`☠️ 全滅！引き分け！`);
      } else {
        winner=byHp[0];
        logs.push(`☠️ 全滅！最後まで粘った ${winner.name} の辛勝！`);
      }
    } else if(roundLimitReached){
      // ラウンド上限: HP最多プレイヤーの勝利
      const sorted=[...alive].sort((a,b)=>b.hp-a.hp);
      winner=sorted[0]||null;
      logs.push(`⏱️ ${maxR}ラウンド終了！HP最多 ${winner?.name||'不明'} の勝利！`);
    } else {
      winner=alive[0]||null;
    }
    for(const m of room.members){
      const s=io.sockets.sockets.get(m.socketId); if(!s) continue;
      s.emit('game_over',{gameState:viewForPlayer(state,m.socketId),winner:winner?{name:winner.name,isMe:winner.socketId===m.socketId}:null,logs});
      // ゲーム終了後すぐにsocketToRoomをクリア → 新しいルーム参加可能に
      socketToRoom.delete(m.socketId);
      s.leave(code);
    }
    // reconnectトークンも即クリア
    for(const p of state.players){if(p.reconnectToken)reconnectTokens.delete(p.reconnectToken);}
    scheduleRoomCleanup(code);
  } else {
    for(const m of room.members){
      const s=io.sockets.sockets.get(m.socketId); if(!s) continue;
      s.emit('round_resolved',{gameState:viewForPlayer(state,m.socketId),logs,round:room.round});
    }
    startRoundTimer(code, room);
  }
  room._resolving=false;
}

/* ═══════════════════════════════════
   SOCKET HANDLERS
═══════════════════════════════════ */
const rateLimits=new Map(); // socketId→{lastCreate:ts}
io.on('connection', socket=>{
  console.log(`[+] ${socket.id}`);

  socket.on('create_room',({name,cls,bots=0,handSize=3,timerSecs=30,mapType='RANDOM',maxRounds=20})=>{
    // レート制限（5秒に1回）
    const now=Date.now(),rl=rateLimits.get(socket.id);
    if(rl&&now-rl.lastCreate<5000) return socket.emit('error',{msg:'しばらくお待ちください'});
    rateLimits.set(socket.id,{lastCreate:now});
    const safeName=sanitizeName(name);
    if(!safeName) return socket.emit('error',{msg:'名前を入力してください'});
    if(!CLS[cls]) return socket.emit('error',{msg:'無効なクラス'});
    if(socketToRoom.has(socket.id)) return socket.emit('error',{msg:'すでにルームに参加中'});
    if(rooms.size>=200) return socket.emit('error',{msg:'サーバー満員。しばらくお待ちください'});
    let code; try{code=genCode();}catch(e){return socket.emit('error',{msg:'ルーム作成失敗'});}
    const hs=Math.min(6,Math.max(2,Number(handSize)||3));
    const rawTs=Number(timerSecs);
    const ts=rawTs===0?0:Math.min(90,Math.max(10,rawTs||30));
    const mr=Math.min(200,Math.max(5,Number(maxRounds)||20));
    const validMaps=['RANDOM','OPEN','DENSE','CORRIDOR'];
    const mt=validMaps.includes(mapType)?mapType:'RANDOM';
    const room={code,host:socket.id,members:[{socketId:socket.id,name:safeName,cls}],
      bots:Math.min(4,Math.max(0,Number(bots)||0)),handSize:hs,timerSecs:ts,mapType:mt,maxRounds:mr,
      gameState:null,phase:'lobby',
      pendingActions:new Map(),round:1,afkTimer:null,warnTimer1:null,warnTimer2:null,roundDeadline:null};
    rooms.set(code,room); socketToRoom.set(socket.id,code); socket.join(code);
    socket.emit('room_created',{code,room:roomInfo(room),mySocketId:socket.id});
    console.log(`[ROOM] ${code} created by ${safeName} (hand:${hs} timer:${ts}s)`);
  });

  socket.on('join_room',({code,name,cls})=>{
    const safeName=sanitizeName(name);
    if(!safeName) return socket.emit('error',{msg:'名前を入力してください'});
    if(!CLS[cls]) return socket.emit('error',{msg:'無効なクラス'});
    if(typeof code!=='string'||code.length!==4) return socket.emit('error',{msg:'無効なコード'});
    if(socketToRoom.has(socket.id)) return socket.emit('error',{msg:'すでにルームに参加中'});
    const upperCode=code.toUpperCase(); const room=rooms.get(upperCode);
    if(!room) return socket.emit('error',{msg:'ルームが見つかりません'});
    if(room.phase!=='lobby') return socket.emit('error',{msg:'ゲームはすでに開始されています'});
    if(room.members.length>=5) return socket.emit('error',{msg:'満員 (最大5人)'});
    room.members.push({socketId:socket.id,name:safeName,cls}); socketToRoom.set(socket.id,upperCode); socket.join(upperCode);
    socket.emit('room_joined',{code:upperCode,room:roomInfo(room),mySocketId:socket.id});
    io.to(upperCode).emit('room_updated',{room:roomInfo(room)});
    console.log(`[ROOM] ${safeName} joined ${upperCode}`);
  });

  /* ── Reconnect ── */
  socket.on('rejoin_room',({token})=>{
    if(typeof token!=='string') return socket.emit('error',{msg:'無効なトークン'});
    const entry=reconnectTokens.get(token);
    if(!entry) return socket.emit('error',{msg:'再接続トークン無効または期限切れ'});
    const{code,playerId}=entry;
    const room=rooms.get(code);
    if(!room||room.phase==='finished') return socket.emit('error',{msg:'ゲームは終了しています'});
    const player=room.gameState?.players.find(p=>p.id===playerId);
    if(!player||!player.alive) return socket.emit('error',{msg:'プレイヤーが見つかりません'});

    // Cancel kill timer
    if(player._killTimer){clearTimeout(player._killTimer);player._killTimer=null;}
    player.disconnectedAt=null;

    // Update socket mappings
    const oldSid=player.socketId;
    if(oldSid&&oldSid!==socket.id){
      socketToRoom.delete(oldSid);
      const m=room.members.find(m=>m.socketId===oldSid);
      if(m) m.socketId=socket.id;
      if(room.host===oldSid) room.host=socket.id;
    }
    player.socketId=socket.id;
    socketToRoom.set(socket.id,code);
    socket.join(code);

    const hadSubmitted=room.pendingActions.has(playerId);
    socket.emit('rejoined',{code,gameState:viewForPlayer(room.gameState,socket.id),myPlayerId:playerId,round:room.round,submitted:hadSubmitted,deadline:room.roundDeadline});
    io.to(code).emit('system_msg',{msg:`🔄 ${player.name} が再接続しました`});
    // Now this player can submit, check if round can resolve
    tryResolveRound(code,room);
    console.log(`[REJOIN] ${player.name} reconnected to ${code}`);
  });

  socket.on('set_bots',({bots})=>{
    const found=getRoomBySocket(socket.id); if(!found||found.room.host!==socket.id) return;
    found.room.bots=Math.min(Math.max(0,5-found.room.members.length),Math.max(0,Number(bots)||0));
    io.to(found.code).emit('room_updated',{room:roomInfo(found.room)});
  });

  socket.on('start_game',()=>{
    const found=getRoomBySocket(socket.id); if(!found) return;
    const{code,room}=found;
    if(room.host!==socket.id) return socket.emit('error',{msg:'ホストのみ開始できます'});
    if(room.phase!=='lobby') return socket.emit('error',{msg:'すでに開始されています'});
    if(room.members.length<1) return socket.emit('error',{msg:'最低1人必要'});

    const obstacles=genObstacles(room.mapType||'RANDOM');
    const totalN=Math.min(room.members.length,5)+Math.min(room.bots,4);
    const starts=genStarts(totalN,obstacles);
    const hs=room.handSize||3;
    const humanPlayers=room.members.slice(0,5).map((m,i)=>mkPlayer(i,m.cls,m.socketId,starts[i],m.name,false,hs));
    const usedCls=humanPlayers.map(p=>p.cls);
    const freeAI=AI_CLS.filter(c=>!usedCls.includes(c));
    const botN=Math.min(room.bots,5-humanPlayers.length,freeAI.length);
    const aiPlayers=[];
    for(let i=0;i<botN;i++) aiPlayers.push(mkPlayer(humanPlayers.length+i,freeAI[i],null,starts[humanPlayers.length+i],`AI-${CLS[freeAI[i]].name}`,true,hs));

    room.gameState={players:[...humanPlayers,...aiPlayers],obstacles,smokes:[]};
    room.phase='playing'; room.pendingActions=new Map(); room.round=1;

    // Register reconnect tokens
    for(const p of room.gameState.players) if(p.reconnectToken) reconnectTokens.set(p.reconnectToken,{code,playerId:p.id});

    for(const m of room.members){
      const s=io.sockets.sockets.get(m.socketId); if(!s) continue;
      const myP=humanPlayers.find(p=>p.socketId===m.socketId);
      s.emit('game_started',{gameState:viewForPlayer(room.gameState,m.socketId),myPlayerId:myP?.id,round:1,reconnectToken:myP?.reconnectToken,maxRounds:room.maxRounds||20,timerSecs:room.timerSecs??30});
    }
    startRoundTimer(code,room);
    console.log(`[GAME] ${code} started (${room.gameState.players.length}p, ${botN} AI)`);
  });

  let _lastSubmit=0;
  socket.on('submit_action',({action})=>{
    const now=Date.now(); if(now-_lastSubmit<200) return; _lastSubmit=now;
    const found=getRoomBySocket(socket.id); if(!found) return;
    const{code,room}=found;
    if(room.phase!=='playing') return;
    const player=room.gameState.players.find(p=>p.socketId===socket.id&&p.alive); if(!player) return;
    if(room.pendingActions.has(player.id)) return;

    if(!validateAction(action,player,room.gameState.players,room.gameState)){
      console.warn(`[WARN] Invalid action from ${player.name} → PASS`);
      action={playerId:player.id,cardId:'PASS',target:null};
    } else {
      action={...action,playerId:player.id};
    }

    room.pendingActions.set(player.id,action);
    player.submitted=true;

    const aliveHumans=room.gameState.players.filter(p=>p.alive&&!p.isAI);
    const submittedCount=aliveHumans.filter(p=>room.pendingActions.has(p.id)).length;
    io.to(code).emit('player_submitted',{playerId:player.id,name:player.name,submittedCount,totalHumans:aliveHumans.length});
    tryResolveRound(code,room);
  });

  // クイックチャット / エモート
  const EMOTES=['👍','😂','😤','🎯','💀','🔥','❓','gg'];
  let _lastEmote=0;
  socket.on('emote',({emote})=>{
    const now=Date.now();if(now-_lastEmote<2000)return;_lastEmote=now;
    if(!EMOTES.includes(emote))return;
    const found=getRoomBySocket(socket.id);if(!found)return;
    const{code,room}=found;
    const player=room.gameState?.players.find(p=>p.socketId===socket.id);
    if(!player)return;
    io.to(code).emit('player_emote',{playerId:player.id,name:player.name,emote});
  });

  socket.on('leave_room',()=>{
    const found=getRoomBySocket(socket.id);
    if(!found) return;
    const{code,room}=found;
    socketToRoom.delete(socket.id);
    socket.leave(code);
    room.members=room.members.filter(m=>m.socketId!==socket.id);
    if(room.phase==='playing'){
      const p=room.gameState?.players.find(p=>p.socketId===socket.id);
      if(p){p.alive=false;p.disconnectedAt=null;}
      // ルーム内の残りプレイヤーに通知
      io.to(code).emit('system_msg',{msg:`🚪 プレイヤーが退出しました`});
      const aliveHumans=room.gameState.players.filter(p=>p.alive&&!p.isAI);
      if(aliveHumans.length===0){
        clearRoundTimer(room);room.phase='finished';
        scheduleRoomCleanup(code);
      }
    } else {
      if(room.members.length===0){rooms.delete(code);return;}
      if(room.host===socket.id) room.host=room.members[0].socketId;
      io.to(code).emit('room_updated',{room:roomInfo(room)});
    }
    console.log(`[LEAVE] ${socket.id} left room ${code}`);
  });

  socket.on('disconnect',()=>{
    console.log(`[-] ${socket.id}`);
    const found=getRoomBySocket(socket.id);
    socketToRoom.delete(socket.id);
    if(!found) return;
    const{code,room}=found;

    if(room.phase==='lobby'){
      room.members=room.members.filter(m=>m.socketId!==socket.id);
      if(room.members.length===0){rooms.delete(code);return;}
      if(room.host===socket.id) room.host=room.members[0].socketId;
      io.to(code).emit('room_updated',{room:roomInfo(room)});
      io.to(code).emit('system_msg',{msg:'プレイヤーが退出しました'});

    } else if(room.phase==='playing'){
      const p=room.gameState?.players.find(p=>p.socketId===socket.id);
      if(!p||!p.alive) return;

      if(p.reconnectToken){
        // Give reconnect window
        p.disconnectedAt=Date.now();
        io.to(code).emit('system_msg',{msg:`⚠️ ${p.name} が切断 (${RECONNECT_WINDOW/1000}秒以内に再接続可能)`});
        p._killTimer=setTimeout(()=>{
          const room2=rooms.get(code); if(!room2||room2.phase!=='playing') return;
          const p2=room2.gameState.players.find(pp=>pp.id===p.id);
          if(!p2||!p2.disconnectedAt) return; // reconnected
          p2.alive=false; p2.disconnectedAt=null;
          io.to(code).emit('system_msg',{msg:`💀 ${p2.name} が復帰できずリタイア`});
          const alive=room2.gameState.players.filter(pp=>pp.alive);
          if(alive.length<=1){
            clearRoundTimer(room2); room2.phase='finished';
            const winner=alive[0]||null;
            for(const m of room2.members){
              const s=io.sockets.sockets.get(m.socketId); if(!s) continue;
              s.emit('game_over',{gameState:viewForPlayer(room2.gameState,m.socketId),winner:winner?{name:winner.name,isMe:winner.socketId===m.socketId}:null,logs:[`🔌 ${p2.name} リタイア`]});
              socketToRoom.delete(m.socketId);
              s.leave(code);
            }
            for(const pp of room2.gameState.players){if(pp.reconnectToken)reconnectTokens.delete(pp.reconnectToken);}
            scheduleRoomCleanup(code);
          } else {
            tryResolveRound(code,room2);
          }
        }, RECONNECT_WINDOW);
      } else {
        p.alive=false;
        tryResolveRound(code,room);
      }
    }
  });
});

app.get('/health',(_,res)=>res.json({ok:true,rooms:rooms.size,sockets:socketToRoom.size,tokens:reconnectTokens.size}));
httpServer.listen(PORT,()=>console.log(`[SERVER] SECTOR CLEAR :${PORT}`));
