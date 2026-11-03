import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { io } from "socket.io-client";

/* ══════════════════════════════════════════
   DESIGN TOKENS
══════════════════════════════════════════ */
const T = {
  bg:     '#07090e',
  bg1:    '#0c1118',
  bg2:    '#111824',
  bg3:    '#1a2333',
  border: '#1e2d42',
  text:   '#dde4ee',
  dim:    '#5a7090',
  faint:  '#1a3050',
  green:  '#22c55e',
  blue:   '#3b82f6',
  amber:  '#f59e0b',
  red:    '#ef4444',
  purple: '#a78bfa',
  font:   '"Courier New",Courier,monospace',
  cls: { ASSAULT:'#ef4444', SNIPER:'#c084fc', MEDIC:'#4ade80', TANK:'#60a5fa', HACKER:'#fbbf24' },
};

/* ══════════════════════════════════════════
   GAME DATA
══════════════════════════════════════════ */
const CLS = {
  ASSAULT:{ name:'アサルト', e:'⚔️',  hp:100, agi:3, hl:4, ap:4, desc:'バランス型・接近戦' },
  SNIPER: { name:'スナイパー',e:'🎯', hp:70,  agi:2, hl:3, ap:3, desc:'射程∞・ガラス砲' },
  MEDIC:  { name:'メディック',e:'💊', hp:90,  agi:3, hl:4, ap:3, desc:'自己回復・支援' },
  TANK:   { name:'タンク',   e:'🛡️', hp:130, agi:1, hl:3, ap:3, desc:'高耐久・防御特化' },
  HACKER: { name:'ハッカー', e:'💻', hp:80,  agi:4, hl:5, ap:3, desc:'妨害・高速行動' },
};
const CARD = {
  // ── 既存カード ──────────────────────────────────────
  TAP_FIRE:     {n:'タップファイア', cost:2, type:'attack',  range:3,  dmg:15,       desc:'射程3・15ダメ',            tgt:'enemy'},
  HEADSHOT:     {n:'ヘッドショット', cost:3, type:'attack',  range:99, dmg:30, sniperOnly:true, desc:'射程∞・30ダメ(COVER無効化でスタン)',tgt:'enemy'},
  DOOR_BREACH:  {n:'ドアブリーチ',   cost:1, type:'attack',  range:1,  dmg:15,       desc:'隣接・15ダメ',             tgt:'enemy'},
  FLASH_BANG:   {n:'フラッシュバン', cost:1, type:'debuff',  range:3,                desc:'行動封じ(1T)',             tgt:'enemy'},
  JAMMING:      {n:'ジャミング',     cost:0, type:'debuff',  range:3,                desc:'手札1枚破棄',              tgt:'enemy'},
  SPRINT:       {n:'スプリント',     cost:0, type:'move',    range:2,                desc:'2マス移動',                tgt:'tile' },
  COVER:        {n:'カバー',         cost:0, type:'defense',                         desc:'被ダメ-50%',               tgt:'self' },
  TURTLE:       {n:'タートル',       cost:0, type:'defense',                         desc:'被ダメ-80%',               tgt:'self' },
  RELOAD:       {n:'リロード',       cost:0, type:'utility', ammo:5,                 desc:'弾薬+5',                   tgt:'self' },
  DEFIBRILLATOR:{n:'デフィブ',       cost:0, type:'heal',    heal:30,                desc:'HP+30',                    tgt:'self' },
  BURST_FIRE:   {n:'バーストファイア',cost:3,type:'attack',  range:2,  dmg:12,hits:2, desc:'射程2・12×2ヒット',        tgt:'enemy'},
  KNIFE:        {n:'クニフェ',        cost:1,type:'attack',  range:1,  dmg:25,        desc:'隣接・25ダメ(低コスト)',   tgt:'enemy'},
  RECON:        {n:'リーコン',        cost:0,type:'move',    range:3,                 desc:'3マス高速移動',            tgt:'tile' },
  MEDKIT:       {n:'メドキット',      cost:1,type:'heal',    heal:50,                 desc:'HP+50',                    tgt:'self' },
  FRAG_GRENADE: {n:'フラグ手榴弾',   cost:4,type:'attack_aoe', range:3,aoeR:2,dmg:25,isUlt:true, desc:'範囲爆破・半径2の全敵25ダメ', tgt:'tile'},
  EXECUTE:      {n:'エグゼキュート', cost:4,type:'attack',  range:99, dmg:50,execute:0.4,sniperOnly:true,isUlt:true,chargeReq:1, desc:'HP40%以下かつ無防御で即死 照準1T溜め必要(50ダメ)',tgt:'enemy'},
  REVIVAL_SURGE:{n:'リバイバルサージ',cost:2,type:'heal_cleanse',heal:60,isUlt:true,  desc:'HP+60＋全状態異常解除',    tgt:'self' },
  IRON_WALL:    {n:'アイアンウォール',cost:1,type:'defense_full',        isUlt:true,  desc:'このターン完全無敵',       tgt:'self' },
  BLACKOUT:     {n:'ブラックアウト', cost:2,type:'debuff_aoe',range:2,  isUlt:true,  desc:'周囲2マス内全敵フラッシュ',tgt:'self' },
  GRENADE:      {n:'グレネード',    cost:0,type:'attack_aoe',range:2,aoeR:1,dmg:22,    desc:'自己中心・周囲1マス22ダメ(自爆あり)',tgt:'self'},
  DEMOLISH:     {n:'デモリッシュ',  cost:0,type:'destroy_obs',range:1,                 desc:'隣接障害物を破壊',        tgt:'tile'},
  BARRICADE:    {n:'バリケード',    cost:0,type:'create_obs', range:1,                 desc:'隣接空きマスに壁生成',    tgt:'tile'},
  // ── 新状態異常カード ────────────────────────────────
  BLEEDING_SHOT:{n:'出血弾',       cost:2,type:'attack',    range:3, dmg:10,bleed:3,  desc:'10ダメ+出血3ターン(毎T8ダメ)',tgt:'enemy'},
  SLOW_TRAP:    {n:'スロートラップ',cost:1,type:'debuff',   range:2, slow:2,          desc:'AGI-2を2ターン付与',      tgt:'enemy'},
  SMOKE_GRENADE:{n:'スモーク',     cost:0,type:'create_smoke',range:2,aoeR:1,smokeTurns:3,desc:'煙幕3T(煙内への攻撃50%ミス)',tgt:'tile'},
  HIDDEN:       {n:'???',            cost:0, type:'hidden',                           desc:'相手の手札' },
};
const CARD_COL = {
  attack:'#ef4444', attack_aoe:'#f97316',
  debuff:'#f59e0b', debuff_aoe:'#f59e0b',
  move:'#06b6d4',
  defense:'#6366f1', defense_full:'#c084fc',
  utility:'#10b981',
  heal:'#34d399',    heal_cleanse:'#34d399',
  destroy_obs:'#d97706', create_obs:'#16a34a',
  create_smoke:'#94a3b8',
  hidden:'#334155',
};
const DECKS = {
  ASSAULT:['TAP_FIRE','TAP_FIRE','TAP_FIRE','DOOR_BREACH','DOOR_BREACH','SPRINT','SPRINT','COVER','COVER','FLASH_BANG','TAP_FIRE','SPRINT','BURST_FIRE','KNIFE','GRENADE','DEMOLISH','DEMOLISH','BARRICADE','BARRICADE','DEFIBRILLATOR','DEFIBRILLATOR','DEFIBRILLATOR','BLEEDING_SHOT','SMOKE_GRENADE','FRAG_GRENADE'],
  SNIPER: ['HEADSHOT','HEADSHOT','HEADSHOT','HEADSHOT','TAP_FIRE','TAP_FIRE','SPRINT','COVER','COVER','FLASH_BANG','TAP_FIRE','COVER','RECON','GRENADE','DEMOLISH','DEMOLISH','BARRICADE','BARRICADE','DEFIBRILLATOR','DEFIBRILLATOR','DEFIBRILLATOR','SMOKE_GRENADE','EXECUTE'],
  MEDIC:  ['DEFIBRILLATOR','DEFIBRILLATOR','DEFIBRILLATOR','DEFIBRILLATOR','TAP_FIRE','TAP_FIRE','SPRINT','SPRINT','COVER','FLASH_BANG','TAP_FIRE','COVER','SPRINT','MEDKIT','GRENADE','DEMOLISH','DEMOLISH','BARRICADE','BARRICADE','DEFIBRILLATOR','DEFIBRILLATOR','DEFIBRILLATOR','SMOKE_GRENADE','REVIVAL_SURGE'],
  TANK:   ['TURTLE','TURTLE','TURTLE','TURTLE','TAP_FIRE','TAP_FIRE','SPRINT','COVER','COVER','COVER','FLASH_BANG','TAP_FIRE','SPRINT','KNIFE','DOOR_BREACH','GRENADE','DEMOLISH','DEMOLISH','BARRICADE','BARRICADE','DEFIBRILLATOR','DEFIBRILLATOR','DEFIBRILLATOR','SLOW_TRAP','IRON_WALL'],
  HACKER: ['JAMMING','JAMMING','JAMMING','JAMMING','TAP_FIRE','TAP_FIRE','SPRINT','SPRINT','COVER','FLASH_BANG','TAP_FIRE','JAMMING','COVER','FLASH_BANG','RECON','BURST_FIRE','GRENADE','DEMOLISH','DEMOLISH','BARRICADE','BARRICADE','DEFIBRILLATOR','DEFIBRILLATOR','SLOW_TRAP','BLEEDING_SHOT','BLACKOUT'],
};
const KILL_REWARDS=['TAP_FIRE','BURST_FIRE','KNIFE','FLASH_BANG','GRENADE','DEFIBRILLATOR','MEDKIT','DEMOLISH','RECON','COVER'];
const OBS_INIT = ['0,3','1,1','1,5','2,3','3,3','4,3','5,1','5,5','6,3'];
const gsObs = gs => new Set(gs?.obstacles || OBS_INIT);
const AI_CLS    = ['ASSAULT','SNIPER','TANK','HACKER','MEDIC'];
const dist = (a,b) => Math.abs(a.r-b.r)+Math.abs(a.c-b.c);
const AFK_SECS = 30;
const DIFF = { EASY:'EASY', NORMAL:'NORMAL', HARD:'HARD' };
const DIFF_LABELS = { EASY:'やさしい', NORMAL:'ふつう', HARD:'むずかしい' };

// ── ランダムマップ生成 ──────────────────────────────────
const MAP_CONFIGS = {
  RANDOM:   {name:'ランダム',  e:'🎲', desc:'毎回異なる配置'},
  OPEN:     {name:'オープン',  e:'🏜️', desc:'障害物少・長距離戦有利'},
  DENSE:    {name:'密集',      e:'🏙️', desc:'障害物多・近距離戦中心'},
  CORRIDOR: {name:'廊下型',   e:'🏚️', desc:'縦横の通路・戦略的配置'},
};
const DEFAULT_MAX_ROUNDS = 20;
const MAX_HAND_SIZE = 12;
const _shuffle=a=>{const b=[...a];for(let i=b.length-1;i>0;i--){const j=0|Math.random()*(i+1);[b[i],b[j]]=[b[j],b[i]];}return b;};

function genObstacles(mapType='RANDOM') {
  if(mapType==='OPEN'){
    // 4マスのみ散在
    const preset=[{r:1,c:3},{r:3,c:1},{r:3,c:5},{r:5,c:3}];
    return preset.map(({r,c})=>`${r},${c}`);
  }
  if(mapType==='DENSE'){
    // 中央密集・周囲散在
    const preset=[
      {r:1,c:2},{r:1,c:4},{r:2,c:1},{r:2,c:3},{r:2,c:5},
      {r:3,c:2},{r:3,c:4},{r:4,c:1},{r:4,c:3},{r:4,c:5},
      {r:5,c:2},{r:5,c:4}
    ];
    return preset.map(({r,c})=>`${r},${c}`);
  }
  if(mapType==='CORRIDOR'){
    // 縦横の廊下パターン
    const preset=[
      {r:0,c:2},{r:0,c:4},{r:2,c:0},{r:2,c:6},
      {r:3,c:2},{r:3,c:4},{r:4,c:0},{r:4,c:6},
      {r:6,c:2},{r:6,c:4}
    ];
    return preset.map(({r,c})=>`${r},${c}`);
  }
  // RANDOM: 既存ロジック
  const safe=new Set(['0,0','0,1','1,0','0,5','0,6','1,5','1,6','5,0','5,1','6,0','6,1','5,5','5,6','6,5','6,6']);
  const candidates=[];
  for(let r=0;r<7;r++) for(let c=0;c<7;c++){if(!safe.has(`${r},${c}`))candidates.push({r,c});}
  const picked=[];
  for(const {r,c} of _shuffle(candidates)){
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
  const shuffled=_shuffle(all);
  const picked=[];
  for(const pos of shuffled){
    if(picked.length>=n)break;
    if(picked.every(p=>dist(p,pos)>=3))picked.push(pos);
  }
  // 3マス確保できない場合は制約を緩めて補完
  if(picked.length<n){
    for(const pos of shuffled){
      if(picked.length>=n)break;
      if(!picked.some(p=>p.r===pos.r&&p.c===pos.c))picked.push(pos);
    }
  }
  return picked;
}

/* ══════════════════════════════════════════
   STYLE HELPERS
══════════════════════════════════════════ */
const row  = (ex={}) => ({display:'flex',alignItems:'center',...ex});
const col_ = (ex={}) => ({display:'flex',flexDirection:'column',...ex});
const page = (center=false) => ({minHeight:'100dvh',background:T.bg,color:T.text,fontFamily:T.font,
  display:'flex',flexDirection:'column',alignItems:'center',
  ...(center?{justifyContent:'center'}:{}),
  gap:'1.5rem',padding:'1.5rem'});
const label_ = (ex={}) => ({fontSize:'0.68rem',color:T.dim,letterSpacing:'0.14em',...ex});
const Btn = (col,ex={}) => ({
  padding:'0.45rem 0.9rem',background:'transparent',border:`1px solid ${col}`,color:col,
  borderRadius:6,cursor:'pointer',fontSize:'0.78rem',fontFamily:T.font,
  minHeight:40,transition:'opacity 0.1s',...ex,
});
const Card_ = (active,col) => ({
  background:active?`${col}1a`:T.bg2,border:`2px solid ${active?col:T.border}`,
  borderRadius:8,cursor:'pointer',transition:'all 0.1s',WebkitTapHighlightColor:'transparent',
});

/* ══════════════════════════════════════════
   HOOKS
══════════════════════════════════════════ */
function useIsMobile() {
  const [v,setV]=useState(()=>window.innerWidth<640);
  useEffect(()=>{
    let t; const fn=()=>{clearTimeout(t);t=setTimeout(()=>setV(window.innerWidth<640),100);};
    window.addEventListener('resize',fn); return()=>{window.removeEventListener('resize',fn);clearTimeout(t);};
  },[]);
  return v;
}
function useLockBody(){
  useEffect(()=>{
    const prev=document.body.style.overflow;
    document.body.style.overflow='hidden';
    return()=>{document.body.style.overflow=prev;};
  },[]);
}

function useCellSize() {
  const get=()=>{
    const isMob=window.innerWidth<640;
    const wBased=Math.floor((window.innerWidth-(isMob?12:24))/7);
    if(!isMob) return Math.min(52,wBased);
    // モバイル: 画面高さも考慮してグリッドがはみ出さないようにする
    // StatusBar(~35)+EnemyBar(~50)+ActionFooter(~145)+padding(~24)=254
    const hAvail=window.innerHeight-254;
    const hBased=Math.floor(Math.max(hAvail,0)/7);
    return Math.min(52,wBased,Math.max(28,hBased));
  };
  const [v,setV]=useState(get);
  useEffect(()=>{
    let t; const fn=()=>{clearTimeout(t);t=setTimeout(()=>setV(get()),100);};
    window.addEventListener('resize',fn); return()=>{window.removeEventListener('resize',fn);clearTimeout(t);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  return v;
}

function useCountdown(deadline) {
  const [secs,setSecs]=useState(null);
  useEffect(()=>{
    if(!deadline){setSecs(null);return;}
    const tick=()=>setSecs(Math.max(0,Math.ceil((deadline-Date.now())/1000)));
    tick(); const id=setInterval(tick,250); return()=>clearInterval(id);
  },[deadline]);
  return secs;
}

function useMounted() {
  const ref=useRef(true);
  useEffect(()=>()=>{ref.current=false;},[]);
  return ref;
}

function useSound() {
  const ctx=useRef(null);
  const play=useCallback((freq,dur,vol=0.07,type='sine')=>{
    try {
      if(!ctx.current) ctx.current=new(window.AudioContext||window.webkitAudioContext)();
      const c=ctx.current,o=c.createOscillator(),g=c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type=type; o.frequency.value=freq;
      g.gain.setValueAtTime(vol,c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+dur);
      o.start(); o.stop(c.currentTime+dur);
    } catch(e){}
  },[]);
  const noise=useCallback((dur,vol=0.06)=>{
    try{
      if(!ctx.current) ctx.current=new(window.AudioContext||window.webkitAudioContext)();
      const c=ctx.current,buf=c.createBuffer(1,c.sampleRate*dur,c.sampleRate);
      const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1);
      const src=c.createBufferSource(),g=c.createGain(),flt=c.createBiquadFilter();
      flt.type='bandpass';flt.frequency.value=200;flt.Q.value=0.8;
      src.buffer=buf;src.connect(flt);flt.connect(g);g.connect(c.destination);
      g.gain.setValueAtTime(vol,c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+dur);
      src.start();src.stop(c.currentTime+dur);
    }catch(e){}
  },[]);
  return {
    select:  ()=>play(440,0.06),
    plan:    ()=>play(660,0.07),
    submit:  ()=>{play(523,0.08,0.09);setTimeout(()=>play(659,0.08,0.09),90);},
    damage:  ()=>play(180,0.18,0.09,'sawtooth'),
    round:   ()=>{play(523,0.1,0.09);setTimeout(()=>play(784,0.15,0.09),130);},
    win:     ()=>{play(523,0.1,0.11);setTimeout(()=>play(659,0.1,0.11),150);setTimeout(()=>play(784,0.2,0.14),300);},
    // 新規SE
    kill:    ()=>{play(180,0.12,0.13,'sawtooth');setTimeout(()=>play(110,0.25,0.1,'sawtooth'),80);},
    heal:    ()=>{play(660,0.08,0.08);setTimeout(()=>play(880,0.12,0.1),80);setTimeout(()=>play(1100,0.15,0.09),180);},
    explode: ()=>{noise(0.35,0.14);play(80,0.3,0.1,'sawtooth');},
    flash:   ()=>{play(1200,0.06,0.06,'square');setTimeout(()=>play(600,0.1,0.04,'square'),60);},
    draw:    ()=>play(880,0.05,0.05),
    sniper:  ()=>{play(2000,0.04,0.05);setTimeout(()=>play(1000,0.08,0.05,'sawtooth'),40);},
  };
}

/* FIX: stale closure — cbRef pattern */
function useKeyboard({enabled,onSelect,onExecute,onPass,onCancel,onToggleAuto,handSize=0}) {
  const cb=useRef({onSelect,onExecute,onPass,onCancel,onToggleAuto,handSize});
  useEffect(()=>{cb.current={onSelect,onExecute,onPass,onCancel,onToggleAuto,handSize};});
  useEffect(()=>{
    if(!enabled)return;
    const fn=(e)=>{
      if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;
      const{onSelect,onExecute,onPass,onCancel,onToggleAuto,handSize}=cb.current;
      if(e.code==='Escape')     {e.preventDefault();onCancel();}
      else if(e.code==='Enter') {e.preventDefault();onExecute();}
      else if(e.code==='Space') {e.preventDefault();onPass();}
      else if(e.key==='a'||e.key==='A'){e.preventDefault();onToggleAuto&&onToggleAuto();}
      else if(e.key>='1'&&e.key<='5'){
        const idx=Number(e.key)-1;
        if(idx<handSize){e.preventDefault();onSelect(idx);}
      }
    };
    window.addEventListener('keydown',fn);
    return()=>window.removeEventListener('keydown',fn);
  },[enabled]);
}

/* FIX: timer tracked for unmount cleanup */
function useDamageTracker(gs) {
  const prevHp=useRef({});
  const [events,setEvents]=useState([]);
  const keyRef=useRef(0);
  const timers=useRef([]);
  useEffect(()=>()=>{timers.current.forEach(clearTimeout);},[]);
  useEffect(()=>{
    if(!gs?.players)return;
    const next={},newEvts=[];
    for(const p of gs.players){
      const prev=prevHp.current[p.id];
      if(prev!=null&&prev!==p.hp){
        const diff=p.hp-prev;
        newEvts.push({id:keyRef.current++,playerId:p.id,diff,col:diff<0?'#ef4444':'#34d399'});
      }
      next[p.id]=p.hp;
    }
    prevHp.current=next;
    if(newEvts.length){
      setEvents(e=>[...e,...newEvts]);
      const t=setTimeout(()=>setEvents(e=>e.filter(ev=>!newEvts.find(n=>n.id===ev.id))),900);
      timers.current=[...timers.current.filter(Boolean),t];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs]);
  return events;
}

function useToast() {
  const [toasts,setToasts]=useState([]);
  const keyRef=useRef(0);
  const timers=useRef([]);
  useEffect(()=>()=>{timers.current.forEach(clearTimeout);},[]);
  const show=useCallback((msg,col=T.red,dur=1800)=>{
    const id=keyRef.current++;
    setToasts(t=>[...t.slice(-3),{id,msg,col}]);
    const t=setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),dur);
    timers.current=[...timers.current.filter(Boolean),t];
  },[]);
  return{toasts,show};
}

function useStat() {
  const [stat,setStat]=useState(()=>{
    try{const s=JSON.parse(localStorage.getItem('sc_stat')||'{}');return{win:s.win||0,loss:s.loss||0,total:s.total||0};}
    catch(e){return{win:0,loss:0,total:0};}
  });
  const record=useCallback((isWin)=>{
    setStat(s=>{
      const n={win:s.win+(isWin?1:0),loss:s.loss+(isWin?0:1),total:(s.total||0)+1};
      try{localStorage.setItem('sc_stat',JSON.stringify(n));}catch(e){}
      return n;
    });
  },[]);
  const reset=useCallback(()=>{
    const z={win:0,loss:0,total:0};
    try{localStorage.setItem('sc_stat',JSON.stringify(z));}catch(e){}
    setStat(z);
  },[]);
  return{stat,record,reset};
}

/* ══════════════════════════════════════════
   SOCKET SINGLETON
══════════════════════════════════════════ */
// GitHub Pages などゲームサーバーのない静的デモ用ビルド (VITE_STATIC_DEMO=1)
const STATIC_DEMO=import.meta.env.VITE_STATIC_DEMO==='1';
let _sock=null;
const getSocket=()=>{
  if(!_sock)_sock=io({transports:['websocket','polling'],autoConnect:false});
  return _sock;
};

/* ══════════════════════════════════════════
   SP GAME ENGINE
══════════════════════════════════════════ */
const shuffle=a=>{const b=[...a];for(let i=b.length-1;i>0;i--){const j=0|Math.random()*(i+1);[b[i],b[j]]=[b[j],b[i]];}return b;};

function mkPlayer(id,cls,socketId,pos,name,isAI=false,handSize=3) {
  const d=CLS[cls],deck=shuffle([...DECKS[cls]]),hs=Math.min(Math.max(2,handSize),6),hand=deck.splice(0,hs);
  return{id,cls,socketId,isAI,name,hp:d.hp,maxHp:d.hp,agi:d.agi,
    hand,deck,pos:{...pos},alive:true,covered:false,turtled:false,flashed:false,ironwall:false,
    bleedTurns:0,slowTurns:0,chargeMap:{},pendingCharge:null};
}

function aiPlan(ai,players,difficulty=DIFF.NORMAL,gs={},round=1) {
  // チャージ中は強制パス（次ターン自動発射）
  if(ai.pendingCharge)return{playerId:ai.id,cardId:'PASS',target:null};
  const foes=players.filter(p=>p.alive&&p.id!==ai.id);
  if(!foes.length||!ai.hand.length)return{playerId:ai.id,cardId:'PASS',target:null};
  if(difficulty===DIFF.EASY&&Math.random()<0.4)return{playerId:ai.id,cardId:'PASS',target:null};
  const targetFoe=difficulty===DIFF.HARD
    ?foes.reduce((a,b)=>a.hp<b.hp?a:b)
    :foes.reduce((a,b)=>dist(ai.pos,a.pos)<dist(ai.pos,b.pos)?a:b);
  const near=foes.reduce((a,b)=>dist(ai.pos,a.pos)<dist(ai.pos,b.pos)?a:b);
  const defThreshold=difficulty===DIFF.HARD?0.7:0.5;
  const deckLow=ai.deck.length<5; // デッキ枯渇意識

  // Defense / heal / utility when hurt
  if(ai.hp<ai.maxHp*defThreshold){
    for(const cid of ai.hand){const c=CARD[cid];
      if((c.type==='heal'||c.type==='heal_cleanse'||c.type==='defense'||c.type==='defense_full'||c.type==='utility'))
        return{playerId:ai.id,cardId:cid,target:null};
    }
  }

  // ラウンド上限が近い(残5R以内)場合: HARDはHP差逆転を狙い攻撃優先
  const roundsLeft=DEFAULT_MAX_ROUNDS-round;
  const myHpAdvantage=ai.hp>=(foes.reduce((s,f)=>s+f.hp,0)/foes.length);
  if(roundsLeft<=5&&difficulty===DIFF.HARD&&!myHpAdvantage){
    // 引き分け負けを防ぐため積極的に攻撃
  }

  // AOE: GRENADE自爆回避 — 自分のHP低い時は使わない
  for(const cid of ai.hand){const c=CARD[cid];
    if(c.type==='attack_aoe'){
      if(c.tgt==='self'){
        const selfDmg=Math.ceil((c.dmg||22)*0.35);
        if(ai.hp<=selfDmg+10)continue; // 自爆死リスクがある場合スキップ
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
  // debuff_aoe (blackout)
  for(const cid of ai.hand){const c=CARD[cid];
    if(c.type==='debuff_aoe'){
      if(foes.some(f=>dist(ai.pos,f.pos)<=(c.range||2)))return{playerId:ai.id,cardId:cid,target:null};
    }
  }
  // スモーク — 自分がダメージを受けやすい位置にいる時
  for(const cid of ai.hand){const c=CARD[cid];
    if(c.type==='create_smoke'&&ai.hp<ai.maxHp*0.5){
      // 自分の前方タイルに設置
      const dr=Math.sign(near.pos.r-ai.pos.r),dc=Math.sign(near.pos.c-ai.pos.c);
      const tile={r:ai.pos.r+dr,c:ai.pos.c+dc};
      if(tile.r>=0&&tile.r<7&&tile.c>=0&&tile.c<7&&!gsObs(gs).has(`${tile.r},${tile.c}`))
        return{playerId:ai.id,cardId:cid,target:tile};
    }
  }
  // Normal attack (including execute + bleed)
  for(const cid of ai.hand){const c=CARD[cid];
    if(c.type==='attack'){
      const rng=c.range===99?999:c.range||1;
      const inRng=foes.filter(f=>dist(ai.pos,f.pos)<=rng);
      if(!inRng.length)continue;
      const tgt=c.execute
        ? inRng.slice().sort((a,b)=>a.hp-b.hp)[0]
        : (inRng.includes(targetFoe)?targetFoe:inRng.slice().sort((a,b)=>dist(ai.pos,a.pos)-dist(ai.pos,b.pos))[0]);
      return{playerId:ai.id,cardId:cid,target:tgt.id};
    }
  }
  // Debuff (FLASH_BANG, SLOW_TRAP, JAMMING)
  for(const cid of ai.hand){const c=CARD[cid];
    if(c.type==='debuff'&&dist(ai.pos,near.pos)<=(c.range||1))
      return{playerId:ai.id,cardId:cid,target:near.id};
  }
  // Move: デッキ枯渇時は防御よりカードドローを優先して積極移動
  for(const cid of ai.hand){const c=CARD[cid];
    if(c.type==='move'){
      const dr=Math.sign(near.pos.r-ai.pos.r),dc=Math.sign(near.pos.c-ai.pos.c);
      for(const t of[{r:ai.pos.r+dr,c:ai.pos.c},{r:ai.pos.r,c:ai.pos.c+dc}]){
        if(t.r<0||t.r>6||t.c<0||t.c>6)continue;
        if(gsObs(gs).has(`${t.r},${t.c}`))continue;
        if(players.some(p=>p.alive&&p.pos.r===t.r&&p.pos.c===t.c))continue;
        return{playerId:ai.id,cardId:cid,target:t};
      }
    }
  }
  // デッキ枯渇時はPASSでドロー
  if(deckLow)return{playerId:ai.id,cardId:'PASS',target:null};
  for(const cid of ai.hand){const c=CARD[cid];if(c.tgt==='self')return{playerId:ai.id,cardId:cid,target:null};}
  return{playerId:ai.id,cardId:ai.hand[0]||'PASS',target:null};
}

function resolveRound(gs,actions) {
  const s=JSON.parse(JSON.stringify(gs)),logs=['━━ 解決フェーズ ━━'];
  if(!s.smokes)s.smokes=[];
  const drawCard=(p)=>{if(p.hand.length>=MAX_HAND_SIZE)return null;if(!p.deck.length){p.deck=shuffle([...DECKS[p.cls]]);}return p.deck.pop()||null;};

  // ── Pre-Phase: チャージ完了カードの自動発射 ─────────────────────
  for(const a of s.players){
    if(!a.alive||!a.pendingCharge)continue;
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
        if(a.hand.length<MAX_HAND_SIZE)a.hand.push(_kr);logs.push(`🎖️ ${a.name}: キル報酬 +${CARD[_kr]?.n||_kr}`);
      } else {
        let dmg=c.dmg||0;
        if(t.turtled)dmg=Math.max(1,Math.ceil(dmg*0.2));else if(t.covered)dmg=Math.max(1,Math.ceil(dmg*0.5));
        t.hp=Math.max(0,t.hp-dmg);
        logs.push(`🔫 ${a.name}→${t.name}: ${c.n} [${dmg}ダメ] HP:${t.hp}`);
        if(t.hp<=0&&t.alive){
          t.alive=false;t.pendingCharge=null;
          logs.push(`💀 ${t.name} 撃破！`);
          const _kr=KILL_REWARDS[0|Math.random()*KILL_REWARDS.length];
          if(a.hand.length<MAX_HAND_SIZE)a.hand.push(_kr);logs.push(`🎖️ ${a.name}: キル報酬 +${CARD[_kr]?.n||_kr}`);
        }
      }
    } else { logs.push(`🎯 ${a.name}: ターゲット不在 — 不発`); }
  }

  // ── Phase 0: 防御カード（全攻撃より先に発動）───────────────────
  for(const act of actions){
    if(act.cardId==='PASS')continue;
    const c=CARD[act.cardId];if(!c||!(c.type==='defense'||c.type==='defense_full'))continue;
    const a=s.players.find(p=>p.id===act.playerId);if(!a||!a.alive)continue;
    const hi=a.hand.indexOf(act.cardId);if(hi!==-1)a.hand.splice(hi,1);
    if(act.cardId==='TURTLE'){a.turtled=true;logs.push(`🛡️ ${a.name}: タートル`);}
    else if(act.cardId==='IRON_WALL'){a.ironwall=true;logs.push(`🔰 ${a.name}: アイアンウォール（完全無敵）`);}
    else{a.covered=true;logs.push(`🛡️ ${a.name}: カバー`);}
    // カード使用後ドロー
    const _ddc=drawCard(a);if(_ddc){a.hand.push(_ddc);logs.push(`🎴 ${a.name}: +${CARD[_ddc]?.n||_ddc}`);}
  }

  // ── Phase 1: AGI順・同値ランダム ──────────────────────────────
  const sorted=[...actions].sort((a,b)=>{
    const pa=s.players.find(p=>p.id===a.playerId),pb=s.players.find(p=>p.id===b.playerId);
    const d=(pb?.agi||0)-(pa?.agi||0);return d!==0?d:Math.random()-0.5;
  });
  for(const act of sorted){
    const a=s.players.find(p=>p.id===act.playerId);if(!a||!a.alive)continue;
    if(act.cardId==='PASS'){
      const _pdc=drawCard(a);if(_pdc)a.hand.push(_pdc);
      logs.push(`⏭ ${a.name}: パス [+1ドロー]`);continue;
    }
    if(act.cardId==='STEP_MOVE'){
      if(a.flashed){logs.push(`⚡ ${a.name}: フラッシュ中 — 1歩スキップ`);continue;}
      if(act.target&&typeof act.target==='object'){
        a.pos=act.target;
        const _sdc=drawCard(a);if(_sdc)a.hand.push(_sdc);
        logs.push(`👣 ${a.name}: 1歩移動 →(${act.target.r},${act.target.c}) [+1ドロー]`);
      }
      continue;
    }
    if(a.flashed){logs.push(`⚡ ${a.name}: フラッシュ中 — 行動スキップ`);continue;}
    const c=CARD[act.cardId];if(!c||c.type==='defense'||c.type==='defense_full')continue;
    const _hi2=a.hand.indexOf(act.cardId);if(_hi2!==-1)a.hand.splice(_hi2,1);

    switch(c.type){
      case'attack':{
        // スナイパー照準チャージ: カード消費→強制パス→次ターン自動発射
        if(c.chargeReq){
          a.pendingCharge={cardId:act.cardId,target:act.target};
          logs.push(`🎯 ${a.name}: 照準チャージ開始 — 次ターン自動発射`);
          // チャージ中はパス扱い（ドローあり）
          const _cdc=drawCard(a);if(_cdc){a.hand.push(_cdc);logs.push(`🎴 ${a.name}: +${CARD[_cdc]?.n||_cdc}`);}
          break;
        }
        const t=s.players.find(p=>p.id===act.target);
        if(t&&t.alive){
          if(t.ironwall){logs.push(`🔰 ${t.name}: アイアンウォール！ダメ無効`);break;}
          // エグゼキュート: 防御なし・HP閾値以下なら即死。COVER/TURTLEで防御可
          if(c.execute&&t.hp/t.maxHp<c.execute&&!t.covered&&!t.turtled){
            t.hp=0;t.alive=false;t.pendingCharge=null;
            logs.push(`💥 ${a.name}→${t.name}: エグゼキュート — 即死！`);
            logs.push(`💀 ${t.name} 撃破！`);
            const _kr=KILL_REWARDS[0|Math.random()*KILL_REWARDS.length];
            if(a.hand.length<MAX_HAND_SIZE)a.hand.push(_kr);logs.push(`🎖️ ${a.name}: キル報酬 +${CARD[_kr]?.n||_kr}`);
            break;
          }
          // COVER/TURTLEがある場合 or 閾値外: 通常ダメージ(reduced)
          // スナイパーペナルティ: COVER/TURTLEで防がれた場合スタン
          if(c.sniperOnly&&(t.covered||t.turtled)){
            a.flashed=true;
            logs.push(`⚡ ${a.name}: スナイパースタン（防御に阻まれた）`);
          }
          if(c.hits&&c.hits>1){
            // スモーク内への攻撃: 50%ミス判定（連射も同様）
            const _inSmokeM=s.smokes&&s.smokes.some(sm=>dist(sm.pos,t.pos)<=sm.aoeR);
            if(_inSmokeM&&Math.random()<0.5){logs.push(`💨 ${a.name}→${t.name}: スモークでミス！`);break;}
            let total=0;
            for(let h=0;h<c.hits;h++){
              if(t.hp<=0)break;
              let d=c.dmg||0;
              if(t.turtled)d=Math.max(1,Math.ceil(d*0.2));else if(t.covered)d=Math.max(1,Math.ceil(d*0.5));
              t.hp=Math.max(0,t.hp-d);total+=d;
            }
            logs.push(`🔫 ${a.name}→${t.name}: ${c.n} [${total}ダメ / ${c.hits}ヒット] HP:${t.hp}`);
          } else {
            let dmg=c.dmg||0;
            // スモーク内への攻撃: 50%ミス判定
            const _inSmoke=s.smokes&&s.smokes.some(sm=>dist(sm.pos,t.pos)<=sm.aoeR);
            if(_inSmoke&&Math.random()<0.5){logs.push(`💨 ${a.name}→${t.name}: スモークでミス！`);break;}
            if(t.turtled)dmg=Math.max(1,Math.ceil(dmg*0.2));else if(t.covered)dmg=Math.max(1,Math.ceil(dmg*0.5));
            t.hp=Math.max(0,t.hp-dmg);
            // 出血付与
            if(c.bleed&&!t.ironwall){t.bleedTurns=Math.max(t.bleedTurns||0,c.bleed);logs.push(`🩸 ${t.name}: 出血${c.bleed}T付与！`);}
            logs.push(`🔫 ${a.name}→${t.name}: ${c.n} [${dmg}ダメ] HP:${t.hp}`);
          }
          if(t.hp<=0&&t.alive){
            t.alive=false;t.pendingCharge=null;
            logs.push(`💀 ${t.name} 撃破！`);
            const _kr2=KILL_REWARDS[0|Math.random()*KILL_REWARDS.length];
            if(a.hand.length<MAX_HAND_SIZE)a.hand.push(_kr2);logs.push(`🎖️ ${a.name}: キル報酬 +${CARD[_kr2]?.n||_kr2}`);
          }
        }
        break;
      }
      case'attack_aoe':{
        const _aoeCtr=(act.target&&typeof act.target==='object')?act.target:a.pos;
        if(_aoeCtr){
          const aoeR=c.aoeR||2,dmg=c.dmg||20;
          const victims=s.players.filter(p=>p.alive&&p.id!==a.id&&dist(p.pos,_aoeCtr)<=aoeR);
          const parts=[];
          for(const t of victims){
            if(t.ironwall){logs.push(`🔰 ${t.name}: アイアンウォール！ダメ無効`);continue;}
            // AOEスモークミス判定
            const _inSmAoe=s.smokes&&s.smokes.some(sm=>dist(sm.pos,t.pos)<=sm.aoeR);
            if(_inSmAoe&&Math.random()<0.5){parts.push(`${t.name}[MISS💨]`);continue;}
            let d=dmg;
            if(t.turtled)d=Math.max(1,Math.ceil(d*0.2));else if(t.covered)d=Math.max(1,Math.ceil(d*0.5));
            t.hp=Math.max(0,t.hp-d);parts.push(`${t.name}[${d}]`);
            if(t.hp<=0&&t.alive){t.alive=false;t.pendingCharge=null;}
          }
          logs.push(parts.length?`💥 ${a.name}: ${c.n} → ${parts.join(' ')}`:
            `💥 ${a.name}: ${c.n}（命中なし）`);
          const killed=victims.filter(t=>!t.alive&&t.hp<=0);
          for(const t of killed){
            logs.push(`💀 ${t.name} 撃破！`);
            const _kr=KILL_REWARDS[0|Math.random()*KILL_REWARDS.length];
            if(a.hand.length<MAX_HAND_SIZE)a.hand.push(_kr);logs.push(`🎖️ ${a.name}: キル報酬 +${CARD[_kr]?.n||_kr}`);
          }
          // GRENADE自爆ダメージ
          if(c.tgt==='self'&&!a.ironwall){
            const selfDmg=Math.ceil(dmg*0.35);
            a.hp=Math.max(0,a.hp-selfDmg);
            logs.push(`💥 ${a.name}: 自爆 [${selfDmg}ダメ] HP:${a.hp}`);
            if(a.hp<=0&&a.alive){a.alive=false;logs.push(`💀 ${a.name} 自爆死！`);}
          }
        }
        break;
      }
      case'heal':
        a.hp=a.hp+(c.heal||30);
        logs.push(`💊 ${a.name}: ${c.n} HP→${a.hp}${a.hp>a.maxHp?' 🔺超過':''}${a.hp>=a.maxHp?'/'+a.maxHp:''}`);break;
      case'heal_cleanse':
        a.hp=a.hp+(c.heal||60);
        a.flashed=false;a.bleedTurns=0;a.slowTurns=0;a.agi=CLS[a.cls]?.agi||a.agi;
        logs.push(`💊 ${a.name}: ${c.n} HP→${a.hp}${a.hp>a.maxHp?' 🔺超過':''}（全状態異常解除）`);break;
      case'move':
        if(act.target&&typeof act.target==='object'){a.pos=act.target;logs.push(`🏃 ${a.name}: ${c.n} →(${act.target.r},${act.target.c})`);}
        break;
      case'debuff':{
        const t=s.players.find(p=>p.id===act.target);
        if(t&&t.alive){
          if(act.cardId==='FLASH_BANG'){t.flashed=true;logs.push(`⚡ ${a.name}→${t.name}: フラッシュ！`);}
          else if(act.cardId==='JAMMING'&&t.hand.length){t.hand.splice(0|Math.random()*t.hand.length,1);logs.push(`📡 ${a.name}→${t.name}: ジャミング！`);}
          else if(c.slow){t.slowTurns=Math.max(t.slowTurns||0,c.slow);t.agi=Math.max(1,(t.agi||1)-c.slow);logs.push(`🐢 ${a.name}→${t.name}: スロー${c.slow}T（AGI-${c.slow}）！`);}
        }break;
      }
      case'debuff_aoe':{
        // 自分周囲 range マス内の全生存敵をフラッシュ
        const range=c.range||2;
        const targets=s.players.filter(p=>p.alive&&p.id!==a.id&&dist(a.pos,p.pos)<=range);
        const flashed=targets.filter(t=>{if(t.ironwall)return false;t.flashed=true;return true;});
        logs.push(flashed.length
          ?`⚡ ${a.name}: ${c.n} → ${flashed.map(t=>t.name).join(' ')} フラッシュ！`
          :`⚡ ${a.name}: ${c.n}（範囲内に敵なし）`);
        break;
      }
      case'utility':{
        const _udc=drawCard(a);if(_udc)a.hand.push(_udc);
        logs.push(`🃏 ${a.name}: ${c.n} →カードドロー`);break;
      }
      case'destroy_obs':{
        if(act.target&&typeof act.target==='object'){
          const _k=`${act.target.r},${act.target.c}`;
          if(gsObs(s).has(_k)){
            s.obstacles=(s.obstacles||[...OBS_INIT]).filter(k=>k!==_k);
            logs.push(`🔨 ${a.name}: デモリッシュ → 障害物(${act.target.r},${act.target.c})破壊！`);
          } else logs.push(`🔨 ${a.name}: デモリッシュ → 障害物なし`);
        }break;
      }
      case'create_obs':{
        if(act.target&&typeof act.target==='object'){
          const _ck=`${act.target.r},${act.target.c}`;
          const _cocc=s.players.some(p=>p.alive&&p.pos.r===act.target.r&&p.pos.c===act.target.c);
          if(!_cocc&&!gsObs(s).has(_ck)){
            s.obstacles=[...(s.obstacles||[...OBS_INIT]),_ck];
            logs.push(`🧱 ${a.name}: バリケード → 障害物(${act.target.r},${act.target.c})生成！`);
          } else logs.push(`🧱 ${a.name}: バリケード → 設置不可`);
        }break;
      }
      case'create_smoke':{
        if(act.target&&typeof act.target==='object'){
          if(!s.smokes)s.smokes=[];
          const aoeR=c.aoeR||1;
          s.smokes.push({pos:{...act.target},aoeR,turns:(c.smokeTurns||3)+1});
          logs.push(`💨 ${a.name}: スモーク設置(${act.target.r},${act.target.c}) ${c.smokeTurns||3}T有効`);
        }break;
      }
    }
    // カード使用後ドロー（utility=効果がドローなので除外して二重ドロー防止）
    if(c.type!=='utility'){
      const _adc=drawCard(a);if(_adc){a.hand.push(_adc);logs.push(`🎴 ${a.name}: +${CARD[_adc]?.n||_adc}`);}
    }
  } // ── Phase 1 end ────────────────────────────────────────────

  // ── Phase 2: ターン終了処理 ──────────────────────────────────
  for(const p of s.players){
    if(!p.alive)continue;
    p.covered=false;p.turtled=false;p.flashed=false;p.ironwall=false;
    // 出血ダメージ（3ターン間）
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
        // AGIを元に戻す（CLS定義値を参照）
        p.agi=CLS[p.cls]?.agi||p.agi;
        logs.push(`⚡ ${p.name}: スロー解除（AGI回復）`);
      }
    }
    // スモーク残りターン
  }
  // スモークタイル更新
  if(s.smokes){
    s.smokes=s.smokes.map(sm=>({...sm,turns:sm.turns-1})).filter(sm=>sm.turns>0);
  }
  return{state:s,logs};
}

/* ══════════════════════════════════════════
   CONFIRM DIALOG
══════════════════════════════════════════ */
function ConfirmDialog({msg,onOk,onCancel}) {
  return(
    <div style={{position:'fixed',inset:0,zIndex:400,display:'flex',alignItems:'center',
      justifyContent:'center',background:'#00000099',backdropFilter:'blur(3px)'}}>
      <div style={{background:T.bg1,border:`1px solid ${T.border}`,borderRadius:12,
        padding:'1.6rem 2rem',maxWidth:300,width:'90%',textAlign:'center',
        boxShadow:'0 8px 40px #000c',display:'flex',flexDirection:'column',gap:'1.2rem'}}>
        <div style={{fontSize:'0.95rem',color:T.text}}>{msg}</div>
        <div style={row({gap:'0.8rem',justifyContent:'center'})}>
          <button onClick={onCancel} style={Btn(T.dim,{minWidth:80})}>続ける</button>
          <button onClick={onOk}    style={Btn(T.red,{minWidth:80,fontWeight:900})}>退出</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   HELP MODAL — rules & card reference
══════════════════════════════════════════ */
function HelpModal({onClose}) {
  const isMobile=useIsMobile();
  const sections=[
    {title:'🎯 目標',body:'全員のHPを0にして最後の1人になれ。ターン制・同時行動解決。'},
    {title:'🔄 ターンの流れ',body:'① カード選択 → ② 対象指定 → ③ 送信 → ④ 全員同時解決（AGI順）'},
    {title:'🃏 ドロー',body:'パスまたは1歩移動で山札から1枚ドロー。手持ち枚数に上限なし。'},
    {title:'📋 カード種別',body:'🔴攻撃 / 🟠範囲爆破 / 🟡妨害・範囲妨害 / 🔵移動 / 🟣防御・無敵 / 🟢回復・全回復 / ⚪弾薬補充'},
    {title:'🛡️ 防御効果',body:'カバー:被ダメ-50% / タートル:被ダメ-80% / アイアンウォール🔰:完全無敵（当ターン。全て先に解決）'},
    {title:'⚡ フラッシュ',body:'フラッシュバンまたはブラックアウトを受けると1ターン行動不能。PASSのみ送信可。'},
    {title:'📡 ジャミング',body:'受けると手札1枚がランダムに破棄される。'},
    {title:'✦ アルティメット',body:'⚔️アサルト: フラグ手榴弾（範囲爆破・💥4） / 🎯スナイパー: エグゼキュート（HP40%以下かつ無防御で即死・COVER/TURTLE有効・💥4） / 💊メディック: リバイバルサージ（HP+60＋状態異常解除・💥2） / 🛡️タンク: アイアンウォール（完全無敵・💥1） / 💻ハッカー: ブラックアウト（周囲全員フラッシュ・💥2）'},
    {title:'🩸 状態異常',body:'出血（🩸）: 3ターン間毎ターン8ダメ / スロー（🐢）: AGI-2を指定ターン / フラッシュ（⚡）: 1ターン行動不能 / 出血中は回復カードで自然回復可'},
    {title:'💨 スモーク',body:'スモーク内への攻撃は50%の確率でミスになる。自分がスモーク内にいる時は防御効果あり。'},
    {title:'🎯 スナイパー照準',body:'ヘッドショット/エグゼキュートは使用した次のターンに発射（照準チャージ1T必要）。チャージ中は行動なし。'},
    {title:'⏱️ ラウンド上限',body:`最大20ラウンド（設定可変）。上限到達時はHP最多プレイヤーの勝利。残5ラウンドからラウンド表示がオレンジになる。`},
    {title:'⌨️ ショートカット',body:'1-5: カード選択 / Space: パス / Enter: 確定・送信 / Esc: キャンセル / A: 自動即確定切替'},
    {title:'🗺️ マップ',body:'ランダム（毎回異なる） / オープン（障害物少・長射程向き） / 密集（近接戦・AOE有利） / 廊下型（通路戦・スモーク有効）'},
    {title:'🆕 新カード',body:'グレネード（自己中心・周囲1マス22ダメ） / デモリッシュ（隣接障害物破壊） / バリケード（隣接マスに壁生成）'},
    {title:'🎮 操作',body:'1〜5:カード選択 / Space:パス / Enter:確定 / Esc:取消・キャンセル / 👣1歩ボタン:隣接1マス移動＋ドロー'},
    {title:'⚡ 即確定モード',body:'フッターの⚡ボタンONで、カード計画完了と同時に自動送信する。'},
  ];
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:500,display:'flex',alignItems:'center',
      justifyContent:'center',background:'#00000099',backdropFilter:'blur(4px)'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.bg1,border:`1px solid ${T.border}`,
        borderRadius:14,padding:isMobile?'1.2rem 1rem':'1.4rem 1.6rem',
        maxWidth:480,width:'93%',maxHeight:'85vh',overflowY:'auto',
        boxShadow:'0 12px 50px #000e',display:'flex',flexDirection:'column',gap:'0.8rem'}}>
        <div style={row({justifyContent:'space-between',marginBottom:'0.2rem'})}>
          <span style={{fontWeight:900,fontSize:'0.9rem',color:T.green,letterSpacing:'0.1em'}}>HOW TO PLAY</span>
          <button onClick={onClose} style={{background:'none',border:'none',color:T.dim,
            cursor:'pointer',fontSize:'1.2rem',padding:'0 4px',lineHeight:1}}>✕</button>
        </div>
        {sections.map(({title,body})=>(
          <div key={title} style={{borderBottom:`1px solid ${T.border}`,paddingBottom:'0.65rem'}}>
            <div style={{fontSize:'0.72rem',color:T.text,fontWeight:900,marginBottom:'0.25rem'}}>{title}</div>
            <div style={{fontSize:'0.66rem',color:T.dim,lineHeight:1.7}}>{body}</div>
          </div>
        ))}
        <div style={{textAlign:'center',marginTop:'0.3rem'}}>
          <button onClick={onClose} style={Btn(T.green,{padding:'0.4rem 1.6rem',fontWeight:900})}>OK</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   TOAST
══════════════════════════════════════════ */
function ToastLayer({toasts}) {
  if(!toasts.length)return null;
  const icon=col=>col===T.red?'❌':col===T.amber?'⚠️':col===T.green?'✅':'ℹ️';
  return(
    <div style={{position:'fixed',top:50,left:'50%',transform:'translateX(-50%)',
      zIndex:600,display:'flex',flexDirection:'column',gap:'0.3rem',
      alignItems:'center',pointerEvents:'none'}}>
      {toasts.map(t=>(
        <div key={t.id} style={{background:T.bg1,border:`1px solid ${t.col}66`,
          borderRadius:8,padding:'0.4rem 1rem',fontSize:'0.8rem',color:t.col,
          boxShadow:'0 4px 20px #000d',whiteSpace:'nowrap',animation:'slideDown 0.12s ease',
          display:'flex',gap:'0.4rem',alignItems:'center'}}>
          <span style={{fontSize:'0.75rem'}}>{icon(t.col)}</span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════
   HP BAR
══════════════════════════════════════════ */
function HPBar({hp,max,w=60,h=4}) {
  const over=hp>max;
  const pct=Math.min(100,Math.max(0,hp/max*100));
  const col=over?'#60a5fa':pct>50?T.green:pct>25?T.amber:T.red;
  return(
    <div style={{width:w,height:h,background:T.bg3,borderRadius:h,flexShrink:0,position:'relative'}}>
      <div style={{width:`${pct}%`,height:'100%',background:col,borderRadius:h,transition:'width 0.4s,background 0.3s',
        boxShadow:over?`0 0 6px ${col}`:'none'}}/>
    </div>
  );
}

/* ══════════════════════════════════════════
   ROUND TIMER
══════════════════════════════════════════ */
function RoundTimer({deadline,progress}) {
  const secs=useCountdown(deadline);
  if(secs===null)return null;
  const pct=Math.max(0,Math.min(100,secs/AFK_SECS*100));
  const col=secs>10?T.green:secs>5?T.amber:T.red;
  return(
    <div style={{background:T.bg1,borderBottom:`1px solid ${T.border}`,
      padding:'0.22rem 0.8rem 0.28rem',flexShrink:0}}>
      <div style={row({justifyContent:'space-between',marginBottom:2})}>
        <span style={label_()}>TIMER</span>
        <div style={row({gap:'0.7rem'})}>
          {progress?.total>0&&(
            <div style={row({gap:3})}>
              {Array.from({length:progress.total},(_,i)=>(
                <span key={i} style={{color:i<progress.count?T.green:T.faint,fontSize:'0.7rem'}}>
                  {i<progress.count?'●':'○'}
                </span>
              ))}
            </div>
          )}
          <span style={{color:col,fontWeight:900,fontSize:'0.78rem',minWidth:28,textAlign:'right',
            animation:secs<=5?'blink 0.5s step-end infinite':'none'}}>{secs}s</span>
        </div>
      </div>
      <div style={{height:2,background:T.bg3,borderRadius:2}}>
        <div style={{height:'100%',width:`${pct}%`,background:col,borderRadius:2,
          transition:'width 0.25s linear,background 0.4s'}}/>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   RESULT BANNER — tap to dismiss
══════════════════════════════════════════ */
function ResultBanner({lines,onDone}) {
  const timerRef=useRef(null);
  const [expanded,setExpanded]=useState(false);
  useEffect(()=>{
    if(!expanded){timerRef.current=setTimeout(onDone,2800);return()=>clearTimeout(timerRef.current);}
    clearTimeout(timerRef.current);
  },[onDone,expanded]);
  const kills=lines.filter(l=>l.includes('💀')||l.includes('即死'));
  const key=lines.filter(l=>l.includes('🔫')||l.includes('💥')||l.includes('💊')||l.includes('🏃')||l.includes('👣')||l.includes('⚡')||l.includes('🎖️')).slice(0,5);
  const isImpactful=kills.length>0;
  return(
    <div onClick={()=>{if(!expanded){clearTimeout(timerRef.current);onDone();}}}
      style={{position:'fixed',inset:0,zIndex:300,display:'flex',alignItems:'center',
        justifyContent:'center',background:'#00000088',backdropFilter:'blur(2px)',
        cursor:expanded?'default':'pointer',animation:'fadeIn 0.15s ease'}}>
      <div style={{background:T.bg1,
        border:`1px solid ${isImpactful?T.red:T.border}`,borderRadius:12,
        padding:'1.3rem 1.8rem',maxWidth:360,width:'90%',
        boxShadow:isImpactful?`0 8px 40px #000c,0 0 20px ${T.red}33`:'0 8px 40px #000c',
        animation:'slideUp 0.15s ease',maxHeight:'70vh',overflowY:expanded?'auto':'hidden'}}
        onClick={e=>e.stopPropagation()}>
        <div style={row({justifyContent:'space-between',marginBottom:'0.7rem'})}>
          <span style={{...label_(),color:isImpactful?T.red:T.dim}}>{isImpactful?'💀 KILL FEED':'— ROUND RESULT —'}</span>
          <button onClick={()=>setExpanded(v=>!v)}
            style={{background:'none',border:`1px solid ${T.border}`,color:T.faint,
              cursor:'pointer',fontSize:'0.6rem',padding:'2px 6px',borderRadius:3}}>
            {expanded?'▲ 閉じる':'▼ 全ログ'}
          </button>
        </div>
        {kills.length>0&&(
          <div style={{marginBottom:'0.5rem'}}>
            {kills.map((l,i)=>(
              <div key={i} style={{fontSize:'0.88rem',color:T.red,fontWeight:900,lineHeight:1.8,
                textShadow:`0 0 10px ${T.red}66`}}>{l}</div>
            ))}
          </div>
        )}
        {key.length>0
          ?key.map((l,i)=><div key={i} style={{fontSize:'0.75rem',color:T.text,lineHeight:1.8}}>{l}</div>)
          :<div style={{fontSize:'0.8rem',color:T.dim,textAlign:'center'}}>全員パス</div>}
        {expanded&&(
          <div style={{marginTop:'0.7rem',borderTop:`1px solid ${T.border}`,paddingTop:'0.7rem'}}>
            <div style={{...label_(),marginBottom:'0.4rem'}}>全ログ</div>
            {lines.map((l,i)=><div key={i} style={{fontSize:'0.65rem',color:logColor(l),lineHeight:1.7}}>{l}</div>)}
          </div>
        )}
        {!expanded&&<div style={{fontSize:'0.58rem',color:T.faint,textAlign:'center',marginTop:'0.6rem'}}>タップで閉じる / 全ログ ▼</div>}
        {expanded&&<button onClick={()=>{clearTimeout(timerRef.current);onDone();}}
          style={{...Btn(T.dim,{width:'100%',marginTop:'0.7rem',fontSize:'0.72rem'})}}>閉じる</button>}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   GRID
══════════════════════════════════════════ */
const Grid=React.memo(function Grid({gs,myPlayer,selMode,selCard,onTileClick,cellSize=48,damageEvents=[]}) {
  const smokes=gs.smokes||[];
  const cells=[];
  for(let r=0;r<7;r++) for(let c=0;c<7;c++){
    const key=`${r},${c}`,isObs=gsObs(gs).has(key);
    const occ=gs.players.find(p=>p.alive&&p.pos.r===r&&p.pos.c===c);
    const isMe=occ&&myPlayer&&occ.id===myPlayer.id;
    const selCD=selCard!=null&&myPlayer?CARD[myPlayer.hand?.[selCard]]:null;
    const isAoeTgt=selMode==='tile'&&selCD?.type==='attack_aoe'&&myPlayer&&
      dist(myPlayer.pos,{r,c})<=(selCD.range||3);
    const canMove=selMode==='tile'&&!isAoeTgt&&!isObs&&!occ&&selCD?.type!=='attack_aoe'&&selCD?.type!=='destroy_obs'&&selCD?.type!=='create_obs'&&selCD?.type!=='create_smoke'&&selCard!=null&&myPlayer&&
      dist(myPlayer.pos,{r,c})<=(selCD?.range||0);
    const canSmoke=selMode==='tile'&&selCD?.type==='create_smoke'&&!isObs&&myPlayer&&
      dist(myPlayer.pos,{r,c})<=(selCD?.range||2);
    const canStep=selMode==='step'&&!isObs&&!occ&&myPlayer&&dist(myPlayer.pos,{r,c})===1;
    const canDemolish=selMode==='tile'&&selCD?.type==='destroy_obs'&&isObs&&myPlayer&&dist(myPlayer.pos,{r,c})<=1;
    const canBarricade=selMode==='tile'&&selCD?.type==='create_obs'&&!isObs&&!occ&&myPlayer&&dist(myPlayer.pos,{r,c})<=1;
    const canAtk=selMode==='enemy'&&occ&&myPlayer&&occ.id!==myPlayer.id;
    // 攻撃射程内ハイライト（敵がいなくても範囲を示す）
    const inAtkRange=selMode==='enemy'&&selCD&&myPlayer&&!canAtk&&
      dist(myPlayer.pos,{r,c})<=(selCD.range===99?99:selCD.range||1);
    const inSmoke=smokes.some(sm=>dist(sm.pos,{r,c})<=sm.aoeR);
    const col=T.cls[occ?.cls]||T.dim;
    const dmgEvt=occ?damageEvents.find(e=>e.playerId===occ.id):null;
    let bg=isObs?'#0a1520':T.bg1,bc=isObs?T.faint:T.bg3,cur='default';
    if(inSmoke)       {bg='#1a1a2a';bc='#94a3b855';}
    if(canSmoke)      {bg='#1a1f2a';bc='#94a3b8';cur='pointer';}
    if(inAtkRange)    {bg='#1a0808';bc='#ef444422';}
    if(canMove)      {bg='#0a2418';bc=T.green;cur='pointer';}
    if(isAoeTgt)     {bg='#2a1200';bc='#f97316';cur='pointer';}
    if(canDemolish)  {bg='#2a1400';bc='#d97706';cur='pointer';}
    if(canBarricade) {bg='#0a2a00';bc='#16a34a';cur='pointer';}
    if(canStep)      {bg='#0a1a2a';bc='#06b6d4';cur='pointer';}
    if(canAtk)       {bg=`${col}18`;bc=col;cur='pointer';}
    if(isMe&&!canMove&&!canAtk&&!isAoeTgt){bc=`${T.green}88`;}
    if(dmgEvt?.diff<0){bg='#2a0808';bc=T.red;}
    if(dmgEvt?.diff>0){bg='#082a14';bc=T.green;}
    cells.push(
      <div key={key} onClick={()=>onTileClick(r,c)}
        style={{width:cellSize,height:cellSize,display:'flex',alignItems:'center',
          justifyContent:'center',background:bg,border:`1px solid ${bc}`,
          borderRadius:3,cursor:cur,position:'relative',
          transition:'background 0.12s,border-color 0.12s',flexShrink:0}}>
        {isObs&&<span style={{color:T.faint,fontSize:'0.9rem',userSelect:'none'}}>▪</span>}
        {inSmoke&&!isObs&&<span style={{position:'absolute',top:1,right:2,fontSize:'0.55rem',opacity:0.7,pointerEvents:'none'}}>💨</span>}
        {canSmoke&&<span style={{position:'absolute',top:1,right:2,fontSize:'0.55rem',opacity:0.9,pointerEvents:'none'}}>💨</span>}
        {occ&&(
          <div style={{textAlign:'center',lineHeight:1,pointerEvents:'none',position:'relative'}}>
            <div style={{fontSize:cellSize<40?'0.95rem':'1.2rem'}}>{CLS[occ.cls]?.e}</div>
            <div style={{fontSize:'0.5rem',color:isMe?T.green:col,
              background:'#000000bb',padding:'1px 3px',borderRadius:2,marginTop:1}}>{occ.hp}</div>
            {isMe&&<div style={{position:'absolute',bottom:'100%',left:'50%',
              transform:'translateX(-50%)',fontSize:'0.44rem',color:T.green,
              background:'#000000cc',padding:'1px 3px',borderRadius:2,
              whiteSpace:'nowrap',marginBottom:1}}>YOU</div>}
            {dmgEvt&&<div style={{position:'absolute',top:-16,left:'50%',
              transform:'translateX(-50%)',fontSize:'0.72rem',fontWeight:900,
              color:dmgEvt.col,textShadow:'0 0 6px #000',
              animation:'floatUp 0.9s ease forwards',pointerEvents:'none',whiteSpace:'nowrap'}}>
              {dmgEvt.diff>0?`+${dmgEvt.diff}`:dmgEvt.diff}</div>}
          </div>
        )}
        {canAtk&&<div style={{position:'absolute',top:-7,left:'50%',
          transform:'translateX(-50%)',fontSize:'0.5rem',color:col,
          background:T.bg,padding:'1px 2px',borderRadius:2}}>▶</div>}
        {canMove&&<div style={{position:'absolute',inset:0,border:`2px solid ${T.green}55`,
          borderRadius:3,pointerEvents:'none'}}/>}
        {isAoeTgt&&<div style={{position:'absolute',inset:0,border:`2px solid #f9731677`,
          borderRadius:3,pointerEvents:'none'}}/>}
        {canDemolish&&<div style={{position:'absolute',inset:0,border:`2px solid #d9770677`,
          borderRadius:3,pointerEvents:'none'}}/>}
        {canBarricade&&<div style={{position:'absolute',inset:0,border:`2px solid #16a34a77`,
          borderRadius:3,pointerEvents:'none'}}/>}
        {canStep&&<div style={{position:'absolute',inset:0,border:`2px solid #06b6d477`,
          borderRadius:3,pointerEvents:'none'}}/>}
      </div>
    );
  }
  return <div style={{display:'grid',gridTemplateColumns:`repeat(7,${cellSize}px)`,gap:2}}>{cells}</div>;
});

/* ══════════════════════════════════════════
   CARD VIEW
══════════════════════════════════════════ */
function CardView({cid,onClick,isSelected,isPlanned,disabled,compact=false,idx=null,inRange=false}) {
  const c=CARD[cid]||CARD.HIDDEN,isH=cid==='HIDDEN';
  const col=CARD_COL[c.type]||T.dim;
  const W=compact?70:86,H=compact?92:112;
  const [tip,setTip]=useState(false);
  const tipRef=useRef(null);
  const showTip=()=>{tipRef.current=setTimeout(()=>setTip(true),350);};
  const hideTip=()=>{if(tipRef.current){clearTimeout(tipRef.current);tipRef.current=null;}setTip(false);};
  useEffect(()=>()=>{if(tipRef.current)clearTimeout(tipRef.current);},[]);
  let borderCol=T.border,borderW=1;
  if(isSelected){borderCol=col;borderW=2;}
  else if(isPlanned){borderCol=T.green;borderW=2;}
  else if(inRange&&!disabled){borderCol=`${col}88`;borderW=1;}
  return(
    <div onMouseEnter={showTip} onMouseLeave={hideTip}
      onTouchStart={showTip} onTouchEnd={hideTip}
      onClick={disabled||isH?undefined:onClick}
      style={{position:'relative',width:W,minWidth:W,height:H,flexShrink:0,
        padding:compact?'0.35rem 0.28rem':'0.5rem 0.36rem',borderRadius:7,
        display:'flex',flexDirection:'column',justifyContent:'space-between',textAlign:'center',
        border:`${borderW}px solid ${borderCol}`,
        background:isSelected?`${col}22`:isPlanned?`${T.green}12`:isH?T.bg:T.bg2,
        cursor:disabled||isH?'default':'pointer',
        opacity:disabled&&!isPlanned?0.3:1,
        transform:isSelected?'translateY(-9px)':isPlanned?'translateY(-4px)':'none',
        transition:'all 0.12s',userSelect:'none',
        boxShadow:isSelected?`0 6px 22px ${col}44`:isPlanned?`0 3px 12px ${T.green}33`
          :inRange&&!disabled?`0 0 10px ${col}22`:'none',
        WebkitTapHighlightColor:'transparent'}}>
      {!isH&&tip&&(
        <div style={{position:'absolute',bottom:'110%',left:'50%',transform:'translateX(-50%)',
          zIndex:500,background:T.bg1,border:`1px solid ${col}55`,borderRadius:8,
          padding:'0.55rem 0.75rem',minWidth:130,pointerEvents:'none',
          boxShadow:'0 4px 20px #000e'}}>
          <div style={{fontSize:'0.72rem',color:col,fontWeight:900,marginBottom:3}}>{c.n}</div>
          <div style={{fontSize:'0.65rem',color:T.dim,marginBottom:5}}>{c.desc}</div>
          <div style={row({gap:7,flexWrap:'wrap',justifyContent:'center'})}>
            {c.range&&<span style={{fontSize:'0.6rem',color:T.blue}}>🎯{c.range===99?'∞':c.range}</span>}
            {c.dmg&&<span style={{fontSize:'0.6rem',color:T.red}}>⚔️{c.dmg}{c.hits?`×${c.hits}`:''}</span>}
            {c.aoeR&&<span style={{fontSize:'0.6rem',color:'#f97316'}}>💥R{c.aoeR}</span>}
            {c.execute&&<span style={{fontSize:'0.6rem',color:T.red}}>⚡HP{Math.round(c.execute*100)}%↓即死</span>}
            {c.heal&&<span style={{fontSize:'0.6rem',color:T.green}}>❤️{c.heal}</span>}
            {c.ammo&&<span style={{fontSize:'0.6rem',color:T.amber}}>🔄+{c.ammo}</span>}
            {c.bleed&&<span style={{fontSize:'0.6rem',color:'#f43f5e'}}>🩸出血{c.bleed}T</span>}
            {c.slow&&<span style={{fontSize:'0.6rem',color:'#818cf8'}}>🐢スロー{c.slow}T</span>}
            {c.smokeTurns&&<span style={{fontSize:'0.6rem',color:'#94a3b8'}}>💨煙幕{c.smokeTurns}T</span>}
            {c.chargeReq&&<span style={{fontSize:'0.6rem',color:'#f59e0b'}}>⏱️照準{c.chargeReq}T</span>}
          </div>
        </div>
      )}
      {idx!==null&&<div style={{position:'absolute',top:3,left:4,fontSize:'0.5rem',
        color:inRange&&!disabled?col:T.faint,fontWeight:900,lineHeight:1}}>{idx+1}</div>}
      {c.isUlt&&<div style={{position:'absolute',top:3,right:4,fontSize:'0.58rem',
        color:'#f59e0b',fontWeight:900,lineHeight:1,textShadow:'0 0 6px #f59e0b99'}}>✦</div>}
      <div style={{fontSize:compact?'0.56rem':'0.63rem',color:col,fontWeight:900,lineHeight:1.3}}>{c.n}</div>
      <div style={{fontSize:compact?'0.5rem':'0.56rem',color:T.dim,lineHeight:1.3}}>{c.desc}</div>
      <div style={row({justifyContent:'center',gap:4,flexWrap:'wrap'})}>
        {!isH&&c.range&&<span style={{fontSize:'0.52rem',background:T.bg3,padding:'1px 4px',borderRadius:3,color:T.blue}}>R:{c.range===99?'∞':c.range}</span>}
      </div>
      {isPlanned&&<div style={{fontSize:'0.52rem',color:T.green,fontWeight:900}}>✓ 計画済</div>}
    </div>
  );
}

/* ══════════════════════════════════════════
   CLASS PICKER
══════════════════════════════════════════ */
function DeckPreviewModal({cls,onClose}) {
  const col=T.cls[cls]||T.dim;
  const deck=DECKS[cls]||[];
  const counts={};deck.forEach(c=>{counts[c]=(counts[c]||0)+1;});
  const entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  return(
    <div style={{position:'fixed',inset:0,zIndex:500,display:'flex',alignItems:'center',
      justifyContent:'center',background:'#00000099',backdropFilter:'blur(3px)'}}
      onClick={onClose}>
      <div style={{background:T.bg1,border:`1px solid ${col}`,borderRadius:12,
        padding:'1.2rem 1.4rem',maxWidth:380,width:'92%',maxHeight:'80vh',overflowY:'auto',
        boxShadow:`0 8px 40px #000c,0 0 20px ${col}22`}}
        onClick={e=>e.stopPropagation()}>
        <div style={row({justifyContent:'space-between',marginBottom:'0.8rem'})}>
          <span style={{color:col,fontWeight:900,fontSize:'0.85rem'}}>
            {CLS[cls]?.e} {CLS[cls]?.name} デッキ ({deck.length}枚)
          </span>
          <button onClick={onClose} style={{background:'none',border:'none',color:T.dim,cursor:'pointer',fontSize:'1.1rem'}}>✕</button>
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:'0.4rem'}}>
          {entries.map(([cid,cnt])=>{
            const cd=CARD[cid];if(!cd)return null;
            const cc=CARD_COL[cd.type]||T.dim;
            return(
              <div key={cid} style={{background:T.bg2,border:`1px solid ${cc}44`,borderRadius:6,
                padding:'0.4rem 0.6rem',minWidth:100,flex:'0 0 auto'}}>
                <div style={{fontSize:'0.68rem',color:cc,fontWeight:900}}>{cd.n} ×{cnt}</div>
                <div style={{fontSize:'0.55rem',color:T.faint,marginTop:2}}>{cd.desc||cd.type}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ClassPicker({selected,onChange}) {
  const isMobile=useIsMobile(),sz=isMobile?74:90;
  const [preview,setPreview]=useState(null);
  return(
    <>
    {preview&&<DeckPreviewModal cls={preview} onClose={()=>setPreview(null)}/>}
    <div style={row({gap:'0.45rem',flexWrap:'wrap',justifyContent:'center'})}>
      {Object.entries(CLS).map(([k,d])=>{
        const col=T.cls[k],active=selected===k;
        return(
          <div key={k} style={{...Card_(active,col),width:sz,padding:'0.65rem 0.25rem',textAlign:'center',position:'relative'}}>
            <div onClick={()=>onChange(k)}>
              <div style={{fontSize:'1.4rem',marginBottom:2}}>{d.e}</div>
              <div style={{fontSize:'0.68rem',fontWeight:900,color:active?col:T.dim}}>{d.name}</div>
              <div style={{fontSize:'0.54rem',color:T.faint,marginTop:2}}>HP{d.hp} AGI{d.agi}</div>
              {active&&<div style={{fontSize:'0.5rem',color:col,marginTop:3,lineHeight:1.3}}>{d.desc}</div>}
            </div>
            <div onClick={e=>{e.stopPropagation();setPreview(k);}}
              style={{fontSize:'0.48rem',color:T.faint,marginTop:4,cursor:'pointer',
                borderTop:`1px solid ${T.border}`,paddingTop:3,
                ':hover':{color:col}}}>
              📋 デッキ確認
            </div>
          </div>
        );
      })}
    </div>
    </>
  );
}

/* ══════════════════════════════════════════
   DIFFICULTY PICKER
══════════════════════════════════════════ */
function DifficultyPicker({selected,onChange}) {
  const items=[
    {k:DIFF.EASY,  col:T.green, sub:'ゆっくり練習'},
    {k:DIFF.NORMAL,col:T.amber, sub:'標準的な強さ'},
    {k:DIFF.HARD,  col:T.red,   sub:'容赦しない'},
  ];
  return(
    <div style={row({gap:'0.5rem',justifyContent:'center'})}>
      {items.map(({k,col,sub})=>{
        const active=selected===k;
        return(
          <div key={k} onClick={()=>onChange(k)}
            style={{...Card_(active,col),padding:'0.5rem 0.8rem',textAlign:'center',minWidth:80}}>
            <div style={{fontSize:'0.72rem',fontWeight:900,color:active?col:T.dim}}>{DIFF_LABELS[k]}</div>
            <div style={{fontSize:'0.52rem',color:T.faint,marginTop:2}}>{sub}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════
   STATUS BAR — with alive count
══════════════════════════════════════════ */
function StatusBar({player,round,maxRounds=DEFAULT_MAX_ROUNDS,mode,aliveCount,totalCount,onHelp}) {
  const isMobile=useIsMobile();
  if(!player)return null;
  return(
    <div style={{...row({flexWrap:'wrap',gap:'0.4rem'}),
      background:T.bg1,borderBottom:`1px solid ${T.border}`,
      padding:isMobile?'0.3rem 0.65rem':'0.38rem 0.9rem',flexShrink:0}}>
      <span style={{color:T.green,fontWeight:900,letterSpacing:'0.18em',
        fontSize:isMobile?'0.72rem':'0.82rem'}}>SECTOR CLEAR</span>
      <span style={{color:T.faint}}>│</span>
      <span style={{color:round>maxRounds-5?T.amber:T.dim,fontSize:'0.72rem'}}>R{round}/{maxRounds}</span>
      {aliveCount!=null&&<span style={{fontSize:'0.62rem',color:T.dim}}>
        <span style={{color:T.green}}>{aliveCount}</span>/{totalCount}生存
      </span>}
      {mode&&<span style={{color:T.faint,fontSize:'0.6rem'}}>{mode}</span>}
      <div style={{...row({gap:'0.45rem',flexWrap:'wrap'}),marginLeft:'auto'}}>
        {onHelp&&<button onClick={onHelp} style={{...Btn(T.faint,{fontSize:'0.6rem',padding:'0.1rem 0.4rem',minHeight:24,minWidth:24})}}>?</button>}
        <span style={{fontSize:'0.95rem'}}>{CLS[player.cls]?.e}</span>
        {!isMobile&&<span style={{fontSize:'0.75rem',color:T.dim}}>{player.name}</span>}
        <HPBar hp={player.hp} max={player.maxHp} w={isMobile?48:60}/>
        <span style={{fontSize:'0.75rem',minWidth:24,
          color:player.hp/player.maxHp<0.25?T.red:T.green,
          animation:player.hp/player.maxHp<0.25?'blink 0.7s step-end infinite':'none',
          fontWeight:player.hp/player.maxHp<0.25?900:400}}>{player.hp}</span>
        {player.deck!=null&&<span style={{fontSize:'0.58rem',color:T.faint,border:`1px solid ${T.faint}33`,padding:'1px 4px',borderRadius:3}}>📚{player.deck.length??'?'}</span>}
        {player.covered&&<span style={{fontSize:'0.55rem',color:T.purple,border:`1px solid ${T.purple}44`,padding:'1px 4px',borderRadius:3}}>CVR</span>}
        {player.turtled&&<span style={{fontSize:'0.55rem',color:T.blue,border:`1px solid ${T.blue}44`,padding:'1px 4px',borderRadius:3}}>TRT</span>}
        {player.ironwall&&<span style={{fontSize:'0.55rem',color:'#c084fc',border:`1px solid #c084fc44`,padding:'1px 4px',borderRadius:3,fontWeight:900}}>🔰</span>}
        {player.flashed&&<span style={{fontSize:'0.55rem',color:T.amber,border:`1px solid ${T.amber}44`,padding:'1px 4px',borderRadius:3,animation:'blink 0.5s step-end infinite'}}>FLS</span>}
        {player.bleedTurns>0&&<span style={{fontSize:'0.55rem',color:'#f43f5e',border:`1px solid #f43f5e44`,padding:'1px 4px',borderRadius:3,animation:'blink 0.7s step-end infinite'}}>🩸{player.bleedTurns}T</span>}
        {player.slowTurns>0&&<span style={{fontSize:'0.55rem',color:'#818cf8',border:`1px solid #818cf844`,padding:'1px 4px',borderRadius:3}}>🐢{player.slowTurns}T</span>}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   ENEMY BAR — inRange highlight
══════════════════════════════════════════ */
function EnemyBar({enemies,myId,selMode,onEnemyClick,isMobile,myPlayer=null,selCardData=null}) {
  const alive=enemies.filter(e=>e.alive);
  const dead=enemies.filter(e=>!e.alive);
  const [showDead,setShowDead]=useState(false);
  const list=showDead?enemies:alive;
  return(
    <div style={{background:T.bg,borderBottom:`1px solid ${T.border}`,
      padding:isMobile?'0.28rem 0.5rem':'0.3rem 0.9rem',
      display:'flex',gap:isMobile?'0.35rem':'0.6rem',overflowX:'auto',
      flexShrink:0,alignItems:'center',WebkitOverflowScrolling:'touch'}}>
      {list.map(e=>{
        const col=T.cls[e.cls]||T.dim;
        const canTarget=selMode==='enemy'&&e.alive&&e.id!==myId;
        const inRange=canTarget&&myPlayer&&selCardData&&
          dist(myPlayer.pos,e.pos)<=(selCardData.range===99?999:selCardData.range||1);
        return(
          <div key={e.id} onClick={()=>canTarget&&onEnemyClick(e.id)}
            style={{...row({gap:'0.35rem'}),flexShrink:0,
              padding:isMobile?'0.22rem 0.45rem':'0.28rem 0.6rem',borderRadius:6,
              border:inRange?`1px solid ${col}`:canTarget?`1px solid ${col}55`
                :e.disconnected?`1px solid ${T.amber}44`:`1px solid ${T.border}`,
              background:inRange?`${col}1e`:canTarget?`${col}0c`:T.bg1,
              cursor:canTarget?'pointer':'default',opacity:e.alive?1:0.25,
              transition:'all 0.1s',
              boxShadow:inRange?`0 0 14px ${col}55`:canTarget?`0 0 6px ${col}22`:'none',
              WebkitTapHighlightColor:'transparent',minHeight:40}}>
            <span style={{fontSize:isMobile?'0.95rem':'1.05rem'}}>{e.alive?CLS[e.cls]?.e||'❓':'💀'}</span>
            <div>
              <div style={{fontSize:'0.62rem',color:inRange?col:T.dim,marginBottom:2,...row({gap:3})}}>
                <span>{e.name}{e.isAI?' 🤖':''}</span>
                {e.disconnected&&<span style={{color:T.amber,animation:'blink 1s step-end infinite'}}>⚠</span>}
                {e.submitted&&e.alive&&!e.isAI&&<span style={{color:T.green}}>✓</span>}
              </div>
              {e.alive&&<><HPBar hp={e.hp} max={e.maxHp} w={isMobile?46:56}/>
              <div style={{fontSize:'0.5rem',color:T.faint,marginTop:1,...row({gap:3})}}>
                <span>{e.hp}/{e.maxHp}</span>
                {e.bleedTurns>0&&<span style={{color:'#f43f5e'}}>🩸{e.bleedTurns}</span>}
                {e.slowTurns>0&&<span style={{color:'#818cf8'}}>🐢{e.slowTurns}</span>}
                {e.pendingCharge&&<span style={{color:T.amber}}>🎯</span>}
              </div></>}
            </div>
            {inRange&&<span style={{color:col,fontWeight:900,fontSize:'0.75rem',animation:'blink 0.8s step-end infinite'}}>▶</span>}
            {canTarget&&!inRange&&<span style={{color:T.faint,fontSize:'0.75rem'}}>·</span>}
          </div>
        );
      })}
      {dead.length>0&&(
        <button onClick={()=>setShowDead(v=>!v)}
          style={{...Btn(T.faint,{fontSize:'0.58rem',padding:'0.2rem 0.5rem',minHeight:36,flexShrink:0})}}>
          {showDead?'▲':'💀'}{dead.length}
        </button>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   LOG PANEL
══════════════════════════════════════════ */
const logColor=l=>
  l.includes('━━')?T.green:l.includes('💀')?T.red:l.includes('🏆')?T.amber:
  l.includes('❌')?T.red:l.includes('✅')?T.blue:T.dim;

function LogPanel({log,isMobile}) {
  const [open,setOpen]=useState(false);
  const ref=useRef();
  const dirty=useRef(false);
  useEffect(()=>{dirty.current=true;},[log]);
  useEffect(()=>{
    if((open||!isMobile)&&dirty.current&&ref.current){
      ref.current.scrollTop=ref.current.scrollHeight;dirty.current=false;
    }
  },[log,open,isMobile]);
  const entries=useMemo(()=>log.map((l,i)=>(
    <div key={i} style={{fontSize:'0.68rem',lineHeight:1.75,color:logColor(l)}}>{l}</div>
  )),[log]);
  if(isMobile) return(
    <>
      <button onClick={()=>setOpen(o=>!o)}
        style={{position:'fixed',bottom:'calc(env(safe-area-inset-bottom,0px) + 156px)',right:10,
          zIndex:100,background:T.bg1,border:`1px solid ${T.border}`,color:T.dim,
          borderRadius:'50%',width:42,height:42,fontSize:'0.95rem',cursor:'pointer',
          boxShadow:'0 4px 14px #000a',display:'flex',alignItems:'center',justifyContent:'center'}}>📋</button>
      {open&&(
        <div style={{position:'fixed',bottom:0,left:0,right:0,height:'40vh',
          background:T.bg1,borderTop:`2px solid ${T.border}`,zIndex:200,
          display:'flex',flexDirection:'column',padding:'0.5rem 0.75rem'}}>
          <div style={row({justifyContent:'space-between',marginBottom:'0.35rem',flexShrink:0})}>
            <span style={label_()}>COMBAT LOG</span>
            <button onClick={()=>setOpen(false)}
              style={{background:'none',border:'none',color:T.dim,cursor:'pointer',fontSize:'1.1rem',padding:'0 4px'}}>✕</button>
          </div>
          <div ref={ref} style={{flex:1,overflowY:'auto'}}>{entries}</div>
        </div>
      )}
    </>
  );
  return(
    <div ref={ref} style={{flex:1,padding:'0.65rem',overflowY:'auto',background:T.bg,
      borderLeft:`1px solid ${T.border}`,display:'flex',flexDirection:'column',gap:1,minWidth:0}}>
      <div style={{...label_(),marginBottom:4,flexShrink:0}}>COMBAT LOG</div>
      {entries}
    </div>
  );
}

/* ══════════════════════════════════════════
   ACTION FOOTER
   FIX: isFlashed indicator; clean submit label; scroll fade
══════════════════════════════════════════ */
function ActionFooter({planned,selMode,submitted,isMobile,autoExec,onToggleAuto,
                       onCancel,onClearPlan,onPass,onStepMove,onExecute,execLabel,progress,
                       onBack,isFlashed,isCharging,onEmote,children}) {
  const state=submitted?'waiting':selMode?'targeting':planned?'ready':'idle';
  const hint={
    waiting:  `⏳ 送信済み${progress?.total>0?` (${progress.count}/${progress.total}人)`:''}`,
    targeting: selMode==='enemy'?'▶ 敵をタップ':selMode==='step'?'👣 隣接マスをタップ':'▶ マスをタップ',
    ready:    '✓ 行動計画済み',
    idle:     isCharging?'🎯 照準チャージ中！パスのみ可':isFlashed?'⚡ フラッシュ中！パスのみ可':'▶ カードを選択',
  }[state];
  const hintCol={waiting:T.amber,targeting:T.amber,ready:T.green,
    idle:(isCharging||isFlashed)?T.amber:T.faint}[state];
  return(
    <div style={{background:T.bg1,borderTop:`2px solid ${isFlashed&&state==='idle'?T.amber:T.border}`,
      padding:isMobile?'0.45rem 0.55rem':'0.55rem 0.9rem',flexShrink:0}}>
      <div style={row({justifyContent:'space-between',marginBottom:'0.45rem',gap:'0.4rem'})}>
        <div style={col_({gap:2,minWidth:0,flex:1})}>
          <div style={row({gap:'0.4rem'})}>
            {onBack&&<button onClick={onBack}
              style={{...Btn(T.dim,{fontSize:'0.62rem',padding:'0.2rem 0.45rem',minHeight:30,flexShrink:0})}}>←</button>}
            <span style={{fontSize:'0.86rem',fontWeight:900,color:hintCol,
              animation:state==='targeting'||state==='waiting'||(isFlashed&&state==='idle')?'blink 1.2s step-end infinite':'none',
              overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{hint}</span>
          </div>
          {!isMobile&&state==='idle'&&!isFlashed&&
            <span style={{fontSize:'0.56rem',color:T.faint,paddingLeft:onBack?38:0}}>
              1-5:選択 · Space:パス · Enter:確定 · Esc:取消
            </span>}
          {!isMobile&&state==='ready'&&
            <span style={{fontSize:'0.56rem',color:T.faint,paddingLeft:onBack?38:0}}>
              Enter:確定 · Esc:取消
            </span>}
          {!isMobile&&state==='targeting'&&
            <span style={{fontSize:'0.56rem',color:T.faint,paddingLeft:onBack?38:0}}>
              Esc:キャンセル
            </span>}
        </div>
        <div style={row({gap:'0.3rem',flexShrink:0})}>
          {onEmote&&<button onClick={onEmote} title='エモート'
            style={Btn(T.faint,{fontSize:'0.72rem',padding:'0.2rem 0.42rem',minHeight:30,minWidth:30})}>
            💬
          </button>}
          <button onClick={onToggleAuto} title={autoExec?'即確定ON':'即確定OFF'}
            style={Btn(autoExec?T.green:T.faint,{fontSize:'0.68rem',padding:'0.2rem 0.42rem',minHeight:30,minWidth:30})}>
            ⚡
          </button>
          {selMode&&!submitted&&
            <button onClick={onCancel} style={Btn(T.red,{minHeight:30,minWidth:30,padding:'0.2rem'})}>✕</button>}
          {planned&&!selMode&&!submitted&&
            <button onClick={onClearPlan} style={Btn(T.red,{minHeight:30,fontSize:'0.72rem'})}>取消</button>}
          {!planned&&!submitted&&
            <button onClick={onPass} style={Btn(T.dim,{minHeight:30,fontSize:'0.72rem'})}>パス</button>}
          {!planned&&!submitted&&!isFlashed&&!selMode&&onStepMove&&
            <button onClick={onStepMove} style={Btn('#06b6d4',{minHeight:30,fontSize:'0.72rem'})}>👣 1歩</button>}
          <button onClick={onExecute} disabled={!planned||submitted}
            style={{...Btn(T.green,{padding:'0.3rem 0.9rem',fontWeight:900,fontSize:'0.82rem',minHeight:30}),
              opacity:planned&&!submitted?1:0.22,
              boxShadow:planned&&!submitted?`0 0 16px ${T.green}44`:'none'}}>
            {submitted?'送信済 ✓':execLabel}
          </button>
        </div>
      </div>
      {/* Card hand — show PASS-only UI when flashed, else normal hand */}
      {isFlashed&&state==='idle'
        ?<div style={{display:'flex',justifyContent:'center',padding:'0.5rem 0'}}>
          <button onClick={onPass}
            style={{...Btn(T.amber,{padding:'0.55rem 2.2rem',fontWeight:900,fontSize:'0.88rem'}),
              boxShadow:`0 0 18px ${T.amber}44`,animation:'blink 1.2s step-end infinite'}}>
            ⚡ PASS（フラッシュ中）
          </button>
        </div>
        :<div style={{position:'relative'}}>
          <div style={{display:'flex',gap:'0.35rem',overflowX:'auto',paddingBottom:'0.25rem',
            WebkitOverflowScrolling:'touch',scrollbarWidth:'none',msOverflowStyle:'none'}}>
            {children}
          </div>
          <div style={{position:'absolute',top:0,right:0,bottom:'0.25rem',width:24,
            background:`linear-gradient(to right,transparent,${T.bg1})`,pointerEvents:'none'}}/>
        </div>}
    </div>
  );
}


/* ══════════════════════════════════════════
   SPECTATOR PANEL — 観戦モード: 全員の手札表示
══════════════════════════════════════════ */
function SpectatorPanel({players,isMobile,onBack}) {
  const [chatMsg,setChatMsg]=useState('');
  const [chatLog,setChatLog]=useState([]);
  const sendChat=()=>{
    if(!chatMsg.trim())return;
    setChatLog(l=>[...l.slice(-19),{t:Date.now(),msg:chatMsg.trim()}]);
    setChatMsg('');
  };
  return(
    <div style={{background:T.bg1,borderTop:`2px solid ${T.red}`,flexShrink:0,
      padding:isMobile?'0.4rem 0.55rem':'0.5rem 0.9rem',overflowY:'auto',maxHeight:'42vh'}}>
      <div style={row({gap:'0.5rem',marginBottom:'0.4rem',flexWrap:'wrap'})}>
        <span style={{fontSize:'0.62rem',color:T.red,fontWeight:900,letterSpacing:'0.12em'}}>💀 SPECTATING</span>
        <span style={{fontSize:'0.58rem',color:T.faint}}>— 全プレイヤーの手札を閲覧中</span>
        {onBack&&<button onClick={onBack}
          style={{...Btn(T.dim,{fontSize:'0.6rem',padding:'0.2rem 0.6rem',minHeight:24}),marginLeft:'auto'}}>
          退出 →</button>}
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:'0.7rem',marginBottom:'0.5rem'}}>
        {players.map(p=>{
          const col=T.cls[p.cls]||T.dim;
          return(
            <div key={p.id} style={{border:`1px solid ${p.alive?col+'44':'#33334444'}`,borderRadius:6,padding:'0.35rem 0.5rem',background:p.alive?`${col}08`:'#0a0a0a',opacity:p.alive?1:0.45}}>
              <div style={{fontSize:'0.6rem',color:p.alive?col:T.faint,fontWeight:900,marginBottom:'0.3rem'}}>
                {p.alive?CLS[p.cls]?.e:'💀'} {p.name} HP:{p.alive?p.hp:0}</div>
              <div style={{display:'flex',gap:'0.25rem',flexWrap:'wrap'}}>
                {p.hand.length===0&&<span style={{fontSize:'0.52rem',color:T.faint}}>手札なし</span>}
                {p.hand.map((cid,i)=>{
                  if(cid==='HIDDEN') return(
                    <div key={i} style={{fontSize:'0.52rem',color:T.faint,background:T.bg3,
                      border:`1px solid ${T.border}`,borderRadius:3,padding:'2px 5px',whiteSpace:'nowrap'}}>???</div>
                  );
                  const cd=CARD[cid];if(!cd)return null;
                  const cc=CARD_COL[cd.type]||T.dim;
                  return(
                    <div key={i} style={{fontSize:'0.52rem',color:cc,background:T.bg2,
                      border:`1px solid ${cc}44`,borderRadius:3,padding:'2px 5px',whiteSpace:'nowrap'}}>
                      {cd.n}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {/* 観戦チャット */}
      {chatLog.length>0&&(
        <div style={{borderTop:`1px solid ${T.border}`,paddingTop:'0.35rem',marginBottom:'0.3rem',maxHeight:60,overflowY:'auto'}}>
          {chatLog.map((c,i)=><div key={i} style={{fontSize:'0.58rem',color:T.amber,lineHeight:1.6}}>💬 {c.msg}</div>)}
        </div>
      )}
      <div style={row({gap:'0.4rem'})}>
        <input value={chatMsg} onChange={e=>setChatMsg(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter')sendChat();}}
          placeholder='観戦コメント...' maxLength={40}
          style={{flex:1,background:T.bg2,border:`1px solid ${T.border}`,color:T.text,
            padding:'0.3rem 0.5rem',borderRadius:4,fontFamily:T.font,fontSize:'0.72rem',outline:'none'}}/>
        <button onClick={sendChat}
          style={{...Btn(T.amber,{padding:'0.3rem 0.6rem',minHeight:28,fontSize:'0.68rem'})}}>送信</button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   HOME
══════════════════════════════════════════ */
function HomeScreen({onSP,onMP}) {
  const isMobile=useIsMobile();
  const [help,setHelp]=useState(false);
  const {stat,reset}=useStat();
  const winRate=stat.total>0?Math.round(stat.win/stat.total*100):null;
  return(
    <div style={page(true)}>
      {help&&<HelpModal onClose={()=>setHelp(false)}/>}
      <div style={{textAlign:'center'}}>
        <div style={{...label_({letterSpacing:'0.4em',marginBottom:'0.9rem'}),color:T.green}}>
          [ FPS × TACTICAL CARD GAME ]
        </div>
        <h1 style={{fontSize:'clamp(2.8rem,13vw,4.8rem)',fontWeight:900,
          letterSpacing:'0.3em',margin:0,color:T.text,
          textShadow:`0 0 36px ${T.green}55`,lineHeight:1}}>
          SECTOR<br/>CLEAR
        </h1>
      </div>
      {stat.total>0&&(
        <div style={{background:T.bg1,border:`1px solid ${T.border}`,borderRadius:8,
          padding:'0.5rem 1.2rem',textAlign:'center'}}>
          <div style={{fontSize:'0.58rem',color:T.faint,marginBottom:4,letterSpacing:'0.1em'}}>BATTLE RECORD</div>
          <div style={row({gap:'1.2rem',justifyContent:'center'})}>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:'1.1rem',fontWeight:900,color:T.green}}>{stat.win}</div>
              <div style={{fontSize:'0.52rem',color:T.faint}}>WIN</div>
            </div>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:'1.1rem',fontWeight:900,color:T.red}}>{stat.loss}</div>
              <div style={{fontSize:'0.52rem',color:T.faint}}>LOSS</div>
            </div>
            {winRate!==null&&<div style={{textAlign:'center'}}>
              <div style={{fontSize:'1.1rem',fontWeight:900,color:T.amber}}>{winRate}%</div>
              <div style={{fontSize:'0.52rem',color:T.faint}}>WIN RATE</div>
            </div>}
          </div>
          <button onClick={reset} style={{...Btn(T.faint,{fontSize:'0.52rem',padding:'2px 8px',minHeight:20,marginTop:6})}}>リセット</button>
        </div>
      )}
      <div style={row({gap:'0.9rem',flexWrap:'wrap',justifyContent:'center',width:'100%',maxWidth:360})}>
        {[
          {e:'🤖',label:'ひとりで',sub:'AI と対戦',          cb:onSP,col:T.green},
          {e:'👥',label:'みんなで',sub:'最大5人 リアルタイム',cb:onMP,col:T.blue},
        ].map(m=>(
          <div key={m.label} onClick={m.cb}
            style={{...Card_(false,m.col),flex:1,minWidth:130,padding:'1.4rem 0.5rem',
              textAlign:'center',minHeight:isMobile?86:96,
              display:'flex',flexDirection:'column',alignItems:'center',
              justifyContent:'center',gap:'0.35rem'}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=m.col}
            onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
            <div style={{fontSize:'1.9rem'}}>{m.e}</div>
            <div style={{fontWeight:900,fontSize:'0.95rem',color:T.dim}}>{m.label}</div>
            <div style={{fontSize:'0.62rem',color:T.faint}}>{m.sub}</div>
          </div>
        ))}
      </div>
      <button onClick={()=>setHelp(true)} style={Btn(T.faint,{fontSize:'0.72rem',padding:'0.3rem 1rem',minHeight:34})}>
        ？ ルール・操作説明
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════
   SP SETUP — with difficulty picker
══════════════════════════════════════════ */
/* ══════════════════════════════════════════
   MAP PICKER
══════════════════════════════════════════ */
function MapPicker({selected,onChange}) {
  const isMobile=useIsMobile();
  const maps=Object.entries(MAP_CONFIGS);
  return(
    <div style={row({gap:'0.4rem',justifyContent:'center',flexWrap:'wrap'})}>
      {maps.map(([k,m])=>{
        const active=selected===k;
        return(
          <div key={k} onClick={()=>onChange(k)}
            style={{...Card_(active,T.blue),padding:'0.45rem 0.6rem',textAlign:'center',minWidth:isMobile?68:80}}>
            <div style={{fontSize:'1.0rem'}}>{m.e}</div>
            <div style={{fontSize:'0.62rem',fontWeight:900,color:active?T.blue:T.dim,marginTop:2}}>{m.name}</div>
            <div style={{fontSize:'0.44rem',color:T.faint,marginTop:1}}>{m.desc}</div>
          </div>
        );
      })}
    </div>
  );
}

function SPSetupScreen({onStart,onBack}) {
  const [cls,setCls]=useState(null);
  const [bots,setBots]=useState(1);
  const [diff,setDiff]=useState(DIFF.NORMAL);
  const [handSize,setHandSize]=useState(3);
  const [mapType,setMapType]=useState('RANDOM');
  const [maxRounds,setMaxRounds]=useState(20);
  const isMobile=useIsMobile();
  return(
    <div style={page()}>
      <div style={{color:T.green,...label_({letterSpacing:'0.3em',fontSize:'0.78rem'})}}>— SOLO VS AI —</div>
      <div style={{width:'100%'}}>
        <div style={label_({textAlign:'center',marginBottom:'0.5rem'})}>クラスを選択</div>
        <ClassPicker selected={cls} onChange={setCls}/>
      </div>
      <div>
        <div style={label_({textAlign:'center',marginBottom:'0.5rem'})}>AI 難易度</div>
        <DifficultyPicker selected={diff} onChange={setDiff}/>
      </div>
      <div style={{textAlign:'center'}}>
        <div style={label_({marginBottom:'0.5rem'})}>AI ボット数</div>
        <div style={row({gap:'0.5rem',justifyContent:'center'})}>
          {[1,2,3,4].map(n=>(
            <div key={n} onClick={()=>setBots(n)}
              style={{...Card_(bots===n,T.green),width:isMobile?50:46,height:isMobile?50:46,
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:'1.1rem',fontWeight:900,color:bots===n?T.green:T.dim}}>{n}</div>
          ))}
        </div>
      </div>
      <div style={{textAlign:'center'}}>
        <div style={label_({marginBottom:'0.5rem'})}>初期手札枚数</div>
        <div style={row({gap:'0.5rem',justifyContent:'center'})}>
          {[2,3,4,5].map(n=>(
            <div key={n} onClick={()=>setHandSize(n)}
              style={{...Card_(handSize===n,T.amber),width:isMobile?50:46,height:isMobile?50:46,
                display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                gap:1}}>
              <span style={{fontSize:'1.0rem',fontWeight:900,color:handSize===n?T.amber:T.dim}}>{n}</span>
              <span style={{fontSize:'0.42rem',color:T.faint}}>枚</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{textAlign:'center'}}>
        <div style={label_({marginBottom:'0.5rem'})}>ラウンド上限</div>
        <div style={row({gap:'0.5rem',justifyContent:'center'})}>
          {[10,15,20,30,50,75,100].map(n=>(
            <div key={n} onClick={()=>setMaxRounds(n)}
              style={{...Card_(maxRounds===n,T.purple),width:isMobile?50:50,height:isMobile?50:46,
                display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:1}}>
              <span style={{fontSize:'0.9rem',fontWeight:900,color:maxRounds===n?T.purple:T.dim}}>{n}</span>
              <span style={{fontSize:'0.42rem',color:T.faint}}>R</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{textAlign:'center'}}>
        <div style={label_({marginBottom:'0.5rem'})}>マップ選択</div>
        <MapPicker selected={mapType} onChange={setMapType}/>
      </div>
      <div style={row({gap:'0.9rem'})}>
        <button onClick={onBack} style={Btn(T.dim,{minWidth:80})}>← 戻る</button>
        <button onClick={()=>cls&&onStart(cls,bots,diff,handSize,mapType,maxRounds)}
          style={{...Btn(T.green,{padding:'0.55rem 1.8rem',fontWeight:900}),
            opacity:cls?1:0.3,boxShadow:cls?`0 0 18px ${T.green}33`:'none'}}>START ▶</button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   MP SETUP
══════════════════════════════════════════ */
function MPSetupScreen({onBack}) {
  const [name,setName]=useState('');
  const [cls,setCls]=useState(null);
  const [code,setCode]=useState('');
  const [mode,setMode]=useState(null);
  const [bots,setBots]=useState(0);
  const [handSize,setHandSize]=useState(3);
  const [timerSecs,setTimerSecs]=useState(30);
  const [mapType,setMapType]=useState('RANDOM');
  const [maxRounds,setMaxRounds]=useState(20);
  const [err,setErr]=useState('');
  const [room,setRoom]=useState(null);
  const [mySocketId,setMySocketId]=useState(null);
  const [connected,setConnected]=useState(false);
  const sockRef=useRef(null);
  const inp={background:T.bg2,border:`1px solid ${T.border}`,color:T.text,
    padding:'0.55rem 0.75rem',borderRadius:6,fontFamily:T.font,fontSize:'1rem',
    width:'100%',outline:'none',minHeight:42};
  useEffect(()=>{
    const s=getSocket(); sockRef.current=s;
    if(!s.connected)s.connect();
    const onConn=()=>setConnected(true),onDisc=()=>setConnected(false);
    const onCreate=({code:c,room:r,mySocketId:sid})=>{setRoom(r);setMySocketId(sid);setMode('created');};
    const onJoin=({room:r,mySocketId:sid})=>{setRoom(r);setMySocketId(sid);setMode('joined');};
    const onUpd=({room:r})=>setRoom(r),onErr=({msg})=>setErr(msg);
    s.on('connect',onConn);s.on('disconnect',onDisc);
    s.on('room_created',onCreate);s.on('room_joined',onJoin);
    s.on('room_updated',onUpd);s.on('error',onErr);
    return()=>{s.off('connect',onConn);s.off('disconnect',onDisc);
      s.off('room_created',onCreate);s.off('room_joined',onJoin);
      s.off('room_updated',onUpd);s.off('error',onErr);};
  },[]);
  const isMobile=useIsMobile();
  const sz=isMobile?50:46;
  if(mode==='created'||mode==='joined')
    return <LobbyScreen room={room} mySocketId={mySocketId} sockRef={sockRef}
      onBack={()=>{sockRef.current?.emit('leave_room');setMode(null);setRoom(null);}}/>;
  return(
    <div style={page()}>
      <div style={{color:T.blue,...label_({letterSpacing:'0.3em',fontSize:'0.78rem'})}}>— MULTIPLAYER —</div>
      <div style={row({gap:'0.45rem'})}>
        <div style={{width:8,height:8,borderRadius:'50%',background:connected?T.green:T.red,flexShrink:0}}/>
        <span style={{fontSize:'0.7rem',color:connected?T.green:T.red}}>{connected?'接続済み':STATIC_DEMO?'デモ版ではマルチプレイは使えません（ひとりプレイをどうぞ）':'接続中...'}</span>
      </div>
      <div style={{width:'100%'}}>
        <div style={label_({marginBottom:'0.5rem'})}>プレイヤー名</div>
        <div style={{maxWidth:320,margin:'0 auto'}}>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder='名前を入力' maxLength={12}
            style={inp}
            onFocus={e=>e.target.style.borderColor=T.blue}
            onBlur={e=>e.target.style.borderColor=T.border}/>
        </div>
      </div>
      <div style={{width:'100%'}}>
        <div style={label_({textAlign:'center',marginBottom:'0.55rem'})}>クラスを選択</div>
        <ClassPicker selected={cls} onChange={setCls}/>
      </div>
      <div style={{textAlign:'center'}}>
        <div style={label_({marginBottom:'0.5rem'})}>AI ボット数</div>
        <div style={row({gap:'0.5rem',justifyContent:'center'})}>
          {[0,1,2,3].map(n=>(
            <div key={n} onClick={()=>setBots(n)}
              style={{...Card_(bots===n,T.green),width:sz,height:sz,
                display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:1}}>
              <span style={{fontSize:'1.1rem',fontWeight:900,color:bots===n?T.green:T.dim}}>{n}</span>
              <span style={{fontSize:'0.42rem',color:T.faint}}>AI</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{textAlign:'center'}}>
        <div style={label_({marginBottom:'0.5rem'})}>初期手札枚数</div>
        <div style={row({gap:'0.5rem',justifyContent:'center'})}>
          {[2,3,4,5].map(n=>(
            <div key={n} onClick={()=>setHandSize(n)}
              style={{...Card_(handSize===n,T.amber),width:sz,height:sz,
                display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:1}}>
              <span style={{fontSize:'1.0rem',fontWeight:900,color:handSize===n?T.amber:T.dim}}>{n}</span>
              <span style={{fontSize:'0.42rem',color:T.faint}}>枚</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{textAlign:'center'}}>
        <div style={label_({marginBottom:'0.5rem'})}>ラウンドタイマー</div>
        <div style={row({gap:'0.5rem',justifyContent:'center'})}>
          {[15,30,60,0].map(s=>(
            <div key={s} onClick={()=>setTimerSecs(s)}
              style={{...Card_(timerSecs===s,T.purple),width:sz,height:sz,
                display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:1}}>
              <span style={{fontSize:'0.9rem',fontWeight:900,color:timerSecs===s?T.purple:T.dim}}>{s===0?'∞':s+'s'}</span>
              <span style={{fontSize:'0.42rem',color:T.faint}}>{s===0?'無制限':'秒'}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{textAlign:'center'}}>
        <div style={label_({marginBottom:'0.5rem'})}>ラウンド上限</div>
        <div style={row({gap:'0.5rem',justifyContent:'center',flexWrap:'wrap'})}>
          {[10,15,20,30,50,75,100].map(n=>(
            <div key={n} onClick={()=>setMaxRounds(n)}
              style={{...Card_(maxRounds===n,T.purple),width:isMobile?44:50,height:isMobile?44:46,
                display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:1}}>
              <span style={{fontSize:'0.9rem',fontWeight:900,color:maxRounds===n?T.purple:T.dim}}>{n}</span>
              <span style={{fontSize:'0.42rem',color:T.faint}}>R</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{textAlign:'center'}}>
        <div style={label_({marginBottom:'0.5rem'})}>マップ選択</div>
        <MapPicker selected={mapType} onChange={setMapType}/>
      </div>
      <div style={row({gap:'0.9rem',flexWrap:'wrap',justifyContent:'center',width:'100%',maxWidth:400})}>
        <div style={{flex:1,minWidth:150}}>
          <button onClick={()=>{
            if(!name.trim())return setErr('名前を入力');
            if(!cls)return setErr('クラスを選択');
            setErr('');sockRef.current.emit('create_room',{name:name.trim(),cls,bots,handSize,timerSecs,mapType,maxRounds});
          }} style={{...Btn(T.blue,{width:'100%',fontWeight:900}),boxShadow:`0 0 10px ${T.blue}33`}}>ルーム作成</button>
        </div>
        <div style={{flex:1,minWidth:150}}>
          <div style={row({gap:'0.4rem',marginBottom:'0.45rem'})}>
            <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())}
              placeholder='ABCD' maxLength={4}
              style={{...inp,fontSize:'1.2rem',letterSpacing:'0.3em',textAlign:'center',color:T.green,flex:1}}
              onFocus={e=>e.target.style.borderColor=T.green}
              onBlur={e=>e.target.style.borderColor=T.border}/>
          </div>
          <button onClick={()=>{
            if(!name.trim())return setErr('名前を入力');
            if(!cls)return setErr('クラスを選択');
            if(code.length!==4)return setErr('4文字のコードを入力');
            setErr('');sockRef.current.emit('join_room',{code,name:name.trim(),cls});
          }} style={{...Btn(T.green,{width:'100%',fontWeight:900}),boxShadow:`0 0 10px ${T.green}33`}}>ルームに参加</button>
        </div>
      </div>
      {err&&<div style={{color:T.red,fontSize:'0.76rem',background:'#1a0808',
        padding:'0.45rem 0.85rem',borderRadius:6,border:`1px solid ${T.red}33`,
        maxWidth:400,textAlign:'center'}}>{err}</div>}
      <button onClick={onBack} style={Btn(T.dim,{minWidth:100})}>← 戻る</button>
    </div>
  );
}

/* ══════════════════════════════════════════
   LOBBY — copy button
══════════════════════════════════════════ */
function LobbyScreen({room:init,mySocketId,sockRef,onBack}) {
  const [room,setRoom]=useState(init);
  const [sysMsg,setSysMsg]=useState('');
  const [gameData,setGameData]=useState(null);
  const [copied,setCopied]=useState(false);
  const [starting,setStarting]=useState(false); // FIX: double-click lock
  const s=sockRef.current,isHost=room?.host===mySocketId;
  const isMobile=useIsMobile();
  useEffect(()=>{
    const onUpd=({room:r})=>setRoom(r),onSys=({msg})=>setSysMsg(msg),onStart=d=>setGameData(d);
    s.on('room_updated',onUpd);s.on('system_msg',onSys);s.on('game_started',onStart);
    return()=>{s.off('room_updated',onUpd);s.off('system_msg',onSys);s.off('game_started',onStart);};
  },[s]);
  const copyCode=useCallback(()=>{
    try{navigator.clipboard.writeText(room?.code||'').then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1800);});}catch(e){}
  },[room?.code]);
  const handleStart=useCallback(()=>{
    if(starting)return;
    setStarting(true);
    s.emit('start_game');
    // Reset lock after 4s in case server returns error
    setTimeout(()=>setStarting(false),4000);
  },[s,starting]);
  if(gameData)return <MultiGameScreen initData={gameData} mySocketId={mySocketId}
    sockRef={sockRef} onRestart={onBack}/>;
  return(
    <div style={page()}>
      <div style={{textAlign:'center'}}>
        <div style={label_({marginBottom:'0.45rem'})}>ROOM CODE</div>
        <div style={row({gap:'0.6rem',justifyContent:'center',alignItems:'center'})}>
          <div style={{fontSize:isMobile?'2.4rem':'3rem',fontWeight:900,letterSpacing:'0.45em',
            color:T.green,textShadow:`0 0 20px ${T.green}66`}}>{room?.code}</div>
          <button onClick={copyCode}
            style={Btn(copied?T.green:T.dim,{fontSize:'0.7rem',padding:'0.3rem 0.6rem',minHeight:34})}>
            {copied?'✓ コピー済':'コピー'}
          </button>
        </div>
        <div style={{...label_(),marginTop:'0.35rem',fontSize:'0.6rem'}}>このコードを友達に共有</div>
      </div>
      <div style={{width:'100%',maxWidth:360}}>
        <div style={label_({marginBottom:'0.5rem'})}>PLAYERS ({room?.members?.length}/5)
          {room?.bots>0&&<span style={{color:T.faint,marginLeft:'0.4rem'}}>+{room.bots} AI</span>}
        </div>
        {room?.members?.map((m,i)=>{const col=T.cls[m.cls]||T.dim,isMe=m.socketId===mySocketId;return(
          <div key={m.socketId||i} style={{...row({gap:'0.55rem'}),
            padding:'0.5rem 0.75rem',borderRadius:6,marginBottom:'0.35rem',
            background:isMe?`${T.green}0c`:T.bg1,
            border:`1px solid ${isMe?T.green+'44':T.border}`,minHeight:42}}>
            <span style={{fontSize:'1.05rem'}}>{CLS[m.cls]?.e||'❓'}</span>
            <span style={{flex:1,fontSize:'0.82rem',color:isMe?T.green:T.text}}>{m.name}</span>
            <span style={{fontSize:'0.65rem',color:col}}>{CLS[m.cls]?.name||'—'}</span>
            {room.host===m.socketId&&<span style={{fontSize:'0.58rem',color:T.amber,border:`1px solid ${T.amber}44`,padding:'1px 4px',borderRadius:3}}>HOST</span>}
            {isMe&&<span style={{fontSize:'0.58rem',color:T.green,border:`1px solid ${T.green}44`,padding:'1px 4px',borderRadius:3}}>YOU</span>}
          </div>
        );})}
        {Array.from({length:room?.bots||0},(_,i)=>(
          <div key={`ai${i}`} style={{...row({gap:'0.55rem'}),padding:'0.5rem 0.75rem',
            borderRadius:6,marginBottom:'0.35rem',background:T.bg1,
            border:`1px solid ${T.border}`,minHeight:42}}>
            <span style={{fontSize:'1.05rem'}}>🤖</span>
            <span style={{flex:1,fontSize:'0.8rem',color:T.faint}}>AI ボット</span>
          </div>
        ))}
      </div>
      <div style={{...row({gap:'0.8rem',justifyContent:'center',flexWrap:'wrap'}),fontSize:'0.65rem',color:T.dim}}>
        <span>🗺️ {MAP_CONFIGS[room?.mapType]?.name||'ランダム'}</span>
        <span>⏱️ {room?.timerSecs===0?'無制限':((room?.timerSecs||30)+'秒')}</span>
        <span>📊 {room?.maxRounds||20}R上限</span>
      </div>
      {sysMsg&&<div style={{color:T.amber,fontSize:'0.75rem'}}>{sysMsg}</div>}
      <div style={row({gap:'0.9rem',flexWrap:'wrap',justifyContent:'center'})}>
        <button onClick={onBack} style={Btn(T.dim,{minWidth:80})}>← 退出</button>
        {isHost&&<button onClick={handleStart} disabled={starting}
          style={{...Btn(T.green,{padding:'0.55rem 1.8rem',fontWeight:900}),
            opacity:starting?0.5:1,
            boxShadow:starting?'none':`0 0 18px ${T.green}33`}}>
          {starting?'起動中..':'ゲーム開始 ▶'}
        </button>}
        {!isHost&&<span style={{...label_(),padding:'0.6rem'}}>ホスト待ち...</span>}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   GAME OVER
══════════════════════════════════════════ */
function GameOverScreen({winnerName,isMe,log,onRestart,onReplay,gs}) {
  const snd=useSound();
  const [showFullLog,setShowFullLog]=useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{if(isMe)snd.win();},[]);
  // ログからキル数とダメージ統計を集計
  const stats=useMemo(()=>{
    if(!log)return[];
    const kills={},dmgDealt={};
    for(const l of log){
      const km=l.match(/💀\s*(.+?)\s*撃破/);if(km){
        // 直前のログから誰がキルしたか推定
        const idx=log.indexOf(l);
        for(let i=idx-1;i>=Math.max(0,idx-3);i--){
          const am=log[i].match(/^[🔫💥🎯⚡]\s*(.+?)[→:]/);
          if(am){kills[am[1]]=(kills[am[1]]||0)+1;break;}
        }
      }
      const dm=l.match(/[🔫💥]\s*(.+?)→.+?\[(\d+)ダメ/);
      if(dm)dmgDealt[dm[1]]=(dmgDealt[dm[1]]||0)+parseInt(dm[2]);
    }
    const players=gs?.players||[];
    return players.map(p=>({name:p.name,cls:p.cls,hp:p.hp,maxHp:p.maxHp,alive:p.alive,
      kills:kills[p.name]||0,dmg:dmgDealt[p.name]||0}))
      .sort((a,b)=>(b.alive?1:0)-(a.alive?1:0)||(b.kills-a.kills)||(b.dmg-a.dmg));
  },[log,gs]);
  return(
    <div style={page(true)}>
      <div style={{fontSize:'3.8rem'}}>{isMe?'🏆':winnerName?'💀':'🤝'}</div>
      <h2 style={{fontSize:'clamp(1.9rem,8vw,2.7rem)',fontWeight:900,
        letterSpacing:'0.2em',color:isMe?T.green:T.red,margin:0,textAlign:'center'}}>
        {isMe?'VICTORY':'GAME OVER'}
      </h2>
      <p style={{color:T.dim,margin:0}}>{winnerName?`${winnerName} の勝利`:'引き分け'}</p>
      {stats.length>0&&(
        <div style={{maxWidth:360,width:'100%',background:T.bg1,borderRadius:6,border:`1px solid ${T.border}`,marginBottom:'0.5rem'}}>
          <div style={{padding:'0.5rem 0.75rem',borderBottom:`1px solid ${T.border}`}}>
            <span style={label_()}>SCOREBOARD</span>
          </div>
          <div style={{padding:'0.4rem 0.55rem'}}>
            <div style={{...row({gap:0}),fontSize:'0.52rem',color:T.faint,padding:'0 0 0.25rem',borderBottom:`1px solid ${T.border}22`}}>
              <span style={{flex:1}}>PLAYER</span>
              <span style={{width:40,textAlign:'center'}}>HP</span>
              <span style={{width:35,textAlign:'center'}}>KILL</span>
              <span style={{width:45,textAlign:'center'}}>DMG</span>
            </div>
            {stats.map((p,i)=>(
              <div key={i} style={{...row({gap:0}),padding:'0.3rem 0',fontSize:'0.68rem',
                opacity:p.alive?1:0.4,borderBottom:`1px solid ${T.border}11`}}>
                <span style={{flex:1,color:p.alive?T.text:T.dim,...row({gap:4})}}>
                  <span>{CLS[p.cls]?.e||'❓'}</span>
                  <span>{p.name}</span>
                </span>
                <span style={{width:40,textAlign:'center',fontWeight:700,
                  color:p.alive?T.green:T.red}}>{p.hp}/{p.maxHp}</span>
                <span style={{width:35,textAlign:'center',fontWeight:700,
                  color:p.kills>0?T.amber:T.dim}}>{p.kills}</span>
                <span style={{width:45,textAlign:'center',fontWeight:700,
                  color:p.dmg>0?T.red:T.dim}}>{p.dmg}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {log&&(
        <div style={{maxWidth:360,width:'100%',background:T.bg1,borderRadius:6,border:`1px solid ${T.border}`}}>
          <div style={row({justifyContent:'space-between',padding:'0.5rem 0.75rem',borderBottom:`1px solid ${T.border}`})}>
            <span style={label_()}>BATTLE LOG</span>
            <button onClick={()=>setShowFullLog(v=>!v)}
              style={{background:'none',border:`1px solid ${T.border}`,color:T.faint,
                cursor:'pointer',fontSize:'0.6rem',padding:'2px 8px',borderRadius:3,fontFamily:T.font}}>
              {showFullLog?'▲ 折りたたむ':'▼ 全ログ表示 ('+log.length+')'}
            </button>
          </div>
          <div style={{padding:'0.6rem 0.75rem',maxHeight:showFullLog?'45vh':130,overflowY:'auto'}}>
            {(showFullLog?log:log.slice(-10)).map((l,i)=>(
              <div key={i} style={{fontSize:'0.65rem',color:logColor(l),lineHeight:1.75}}>{l}</div>
            ))}
          </div>
        </div>
      )}
      <div style={row({gap:'0.8rem',flexWrap:'wrap',justifyContent:'center'})}>
        {onReplay&&<button onClick={onReplay}
          style={{...Btn(T.amber,{padding:'0.6rem 1.6rem',fontWeight:900}),
            boxShadow:`0 0 16px ${T.amber}33`}}>もう一度 ↺</button>}
        <button onClick={onRestart}
          style={{...Btn(T.green,{padding:'0.65rem 2.2rem',fontWeight:900}),
            boxShadow:`0 0 20px ${T.green}33`}}>TOP へ ▶</button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   SHARED GAME ACTIONS
   FIX: removed `planned` from onCardClick deps
   FIX: showToast optional-chain
══════════════════════════════════════════ */
function useGameActions({gs,myPlayer,submitted,selCard,selMode,autoExec,
                          setPlanned,setSelCard,setSelMode,addLog,showToast,onExecute,snd}) {
  const onCardClick=useCallback(idx=>{
    if(!myPlayer||submitted)return;
    if(myPlayer.pendingCharge){showToast?.('🎯 照準チャージ中！パスのみ可',T.amber);return;}
    if(myPlayer.flashed){showToast?.('⚡ フラッシュ中！行動不可',T.amber);return;}
    const cid=myPlayer.hand[idx];if(!cid||cid==='HIDDEN'){console.warn('[onCardClick] no card at',idx);return;}
    const c=CARD[cid];if(!c){console.warn('[onCardClick] unknown card:',cid);return;}
    snd.select();
    if(c.tgt==='self'){
      const act={playerId:myPlayer.id,cardId:cid,target:null,_handIdx:idx};
      setPlanned(act);setSelCard(null);setSelMode(null);
      addLog(`📋 ${c.n} を計画`);
      if(autoExec){snd.submit();setTimeout(()=>onExecute(act),50);}
    } else {
      if(selCard===idx){setSelCard(null);setSelMode(null);return;}
      setSelCard(idx);setSelMode(c.tgt);
      addLog(`👆 ${c.n} — ${c.tgt==='enemy'?'敵をタップ':'マスをタップ'}`);
    }
  },[myPlayer,submitted,selCard,autoExec,addLog,onExecute,snd,setPlanned,setSelCard,setSelMode,showToast]);

  const onEnemyTap=useCallback(eid=>{
    if(!myPlayer||submitted||selMode!=='enemy'||selCard===null)return;
    const cid=myPlayer.hand[selCard],cd=CARD[cid];
    const e=gs.players.find(p=>p.id===eid&&p.alive);if(!e||!cd)return;
    const d=dist(myPlayer.pos,e.pos);
    if(d>(cd.range||1)){
      showToast?.(`❌ 射程外 — 射程:${cd.range===99?'∞':cd.range} / 距離:${d}`);
      snd.damage();return;
    }
    snd.plan();
    const act={playerId:myPlayer.id,cardId:cid,target:eid,_handIdx:selCard};
    setPlanned(act);setSelCard(null);setSelMode(null);
    addLog(`📋 ${cd.n} → ${e.name}`);
    if(autoExec){snd.submit();setTimeout(()=>onExecute(act),50);}
  },[gs,myPlayer,selMode,selCard,submitted,autoExec,addLog,onExecute,snd,setPlanned,setSelCard,setSelMode,showToast]);

  const onTileClick=useCallback((r,c)=>{
    if(!myPlayer||submitted)return;
    if(selMode==='enemy'){
      const occ=gs.players.find(p=>p.alive&&p.id!==myPlayer.id&&p.pos.r===r&&p.pos.c===c);
      if(occ)onEnemyTap(occ.id);
      return;
    }
    if(selMode==='step'){
      if(gsObs(gs).has(`${r},${c}`)){showToast?.('❌ 障害物 — 移動不可');return;}
      if(gs.players.some(p=>p.alive&&p.pos.r===r&&p.pos.c===c)){showToast?.('❌ 他のプレイヤーがいます');return;}
      if(dist(myPlayer.pos,{r,c})!==1){showToast?.('❌ 隣接1マスのみ');return;}
      snd.plan();
      const act={playerId:myPlayer.id,cardId:'STEP_MOVE',target:{r,c}};
      setPlanned(act);setSelCard(null);setSelMode(null);
      addLog('📋 1歩移動');
      if(autoExec){snd.submit();setTimeout(()=>onExecute(act),50);}
      return;
    }
    if(selMode!=='tile'||selCard===null)return;
    const cid=myPlayer.hand[selCard],cd=CARD[cid];
    // attack_aoe: any tile within range (no obstacle/occupant restriction)
    if(cd?.type==='attack_aoe'){
      if(dist(myPlayer.pos,{r,c})>(cd.range||3)){showToast?.('❌ 射程外');return;}
      snd.plan();
      const act={playerId:myPlayer.id,cardId:cid,target:{r,c},_handIdx:selCard};
      setPlanned(act);setSelCard(null);setSelMode(null);
      addLog(`📋 ${cd.n} → 爆心地(${r},${c})`);
      if(autoExec){snd.submit();setTimeout(()=>onExecute(act),50);}
      return;
    }
    // 通常移動
    if(cd?.type==='destroy_obs'){
      if(!gsObs(gs).has(`${r},${c}`)){showToast?.('❌ 障害物がありません');return;}
      if(dist(myPlayer.pos,{r,c})>1){showToast?.('❌ 隣接マスのみ');return;}
      snd.plan();
      const act={playerId:myPlayer.id,cardId:cid,target:{r,c},_handIdx:selCard};
      setPlanned(act);setSelCard(null);setSelMode(null);
      addLog(`📋 ${cd.n} → (${r},${c})`);
      if(autoExec){snd.submit();setTimeout(()=>onExecute(act),50);}
      return;
    }
    if(cd?.type==='create_obs'){
      if(gsObs(gs).has(`${r},${c}`)){showToast?.('❌ 既に障害物があります');return;}
      if(gs.players.some(p=>p.alive&&p.pos.r===r&&p.pos.c===c)){showToast?.('❌ プレイヤーがいます');return;}
      if(dist(myPlayer.pos,{r,c})>1){showToast?.('❌ 隣接マスのみ');return;}
      snd.plan();
      const act={playerId:myPlayer.id,cardId:cid,target:{r,c},_handIdx:selCard};
      setPlanned(act);setSelCard(null);setSelMode(null);
      addLog(`📋 ${cd.n} → (${r},${c})`);
      if(autoExec){snd.submit();setTimeout(()=>onExecute(act),50);}
      return;
    }
    if(cd?.type==='create_smoke'){
      if(dist(myPlayer.pos,{r,c})>(cd.range||2)){showToast?.('❌ 射程外（スモーク）');return;}
      snd.plan();
      const act={playerId:myPlayer.id,cardId:cid,target:{r,c},_handIdx:selCard};
      setPlanned(act);setSelCard(null);setSelMode(null);
      addLog(`📋 ${cd.n} → (${r},${c})`);
      if(autoExec){snd.submit();setTimeout(()=>onExecute(act),50);}
      return;
    }
    if(gsObs(gs).has(`${r},${c}`)){showToast?.('❌ 障害物 — 移動不可');return;}
    if(gs.players.some(p=>p.alive&&p.pos.r===r&&p.pos.c===c)){showToast?.('❌ 他のプレイヤーがいます');return;}
    if(dist(myPlayer.pos,{r,c})>(cd?.range||2)){showToast?.('❌ 移動射程外');return;}
    snd.plan();
    const act={playerId:myPlayer.id,cardId:cid,target:{r,c},_handIdx:selCard};
    setPlanned(act);setSelCard(null);setSelMode(null);
    addLog(`📋 ${cd.n} → (${r},${c})`);
    if(autoExec){snd.submit();setTimeout(()=>onExecute(act),50);}
  },[gs,myPlayer,selMode,selCard,submitted,autoExec,addLog,onExecute,onEnemyTap,snd,setPlanned,setSelCard,setSelMode,showToast]);

  const onStepMove=useCallback(()=>{
    if(!myPlayer||submitted||myPlayer.flashed)return;
    setSelCard(null);setSelMode('step');
    addLog('👣 1歩移動先を選択（隣接マス）');
  },[myPlayer,submitted,addLog,setSelCard,setSelMode]);

  return{onCardClick,onEnemyTap,onTileClick,onStepMove};
}

/* ══════════════════════════════════════════
   HAND CARDS — computes inRange per card
══════════════════════════════════════════ */
function HandCards({player,enemies,selCard,planned,submitted,compact,onCardClick}) {
  if(!player?.hand)return null;
  const isFlashed=!!player.flashed;
  return player.hand.map((cid,i)=>{
    const c=CARD[cid];
    const ok=true; // コスト制廃止
    // フラッシュ中は行動不可
    const blockedByFlash=isFlashed&&c?.type!=='hidden';
    // 射程内かどうかのハイライト
    const cardInRange=ok&&!submitted&&!blockedByFlash&&(
      (c?.tgt==='enemy'&&Array.isArray(enemies)&&enemies.some(e=>{
        if(!e.alive)return false;
        return dist(player.pos,e.pos)<=(c.range===99?999:c.range||1);
      }))||
      (c?.type==='attack_aoe'&&Array.isArray(enemies)&&enemies.some(e=>{
        if(!e.alive)return false;
        // tgt:'self'(GRENADE等)は爆心地=自分 → aoeRのみ / tgt:'tile'は射程+aoeR
        if(c.tgt==='self') return dist(player.pos,e.pos)<=(c.aoeR||1);
        return dist(player.pos,e.pos)<=(c.range||3)+(c.aoeR||2);
      }))||
      (c?.type==='debuff_aoe'&&Array.isArray(enemies)&&enemies.some(e=>{
        if(!e.alive)return false;
        return dist(player.pos,e.pos)<=(c.range||2);
      }))
    );
    return(
      <CardView key={`${cid}-${i}`} cid={cid} onClick={()=>onCardClick(i)}
        isSelected={selCard===i}
        isPlanned={planned?.cardId===cid&&planned?._handIdx===i}
        disabled={!ok||!!planned||submitted||blockedByFlash}
        compact={compact} idx={i} inRange={!!cardInRange}/>
    );
  });
}

/* ══════════════════════════════════════════
   SP GAME SCREEN
   FIX: unmount timer leak via useMounted
   NEW: difficulty prop passed to aiPlan
══════════════════════════════════════════ */
function SPGameScreen({playerCls,botCount,difficulty=DIFF.NORMAL,handSize=3,mapType='RANDOM',maxRounds=DEFAULT_MAX_ROUNDS,onBack,onReplay}) {
  useLockBody();
  const isMobile=useIsMobile(),cellSize=useCellSize();
  const snd=useSound();
  const mounted=useMounted();
  const {record}=useStat();
  const [showHelp,setShowHelp]=useState(false);

  const initialGs=useMemo(()=>{
    const obstacles=genObstacles(mapType);
    const aiCls=AI_CLS.filter(c=>c!==playerCls).slice(0,botCount);
    const n=1+aiCls.length;
    const starts=genStarts(n,obstacles);
    return{players:[
      mkPlayer(0,playerCls,'player',starts[0],'あなた',false,handSize),
      ...aiCls.map((c,i)=>mkPlayer(i+1,c,null,starts[i+1],`AI-${CLS[c].name}`,true,handSize)),
    ],obstacles};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const [gs,setGs]=useState(initialGs),[round,setRound]=useState(1);
  const [selCard,setSelCard]=useState(null),[selMode,setSelMode]=useState(null),[planned,setPlanned]=useState(null);
  const [log,setLog]=useState(['━━ ゲーム開始！━━','▶ カードを選択してください']);
  const [gameOver,setGameOver]=useState(false),[winner,setWinner]=useState(null);
  const [banner,setBanner]=useState(null);
  const [autoExec,setAutoExec]=useState(false);
  const [showConfirm,setShowConfirm]=useState(false);
  const addLog=useCallback(lines=>setLog(l=>[...l,...(Array.isArray(lines)?lines:[lines])].slice(-60)),[]);
  const{toasts,show:showToast}=useToast();

  const player=gs.players[0],enemies=gs.players.filter(p=>p.id!==0);
  const damageEvents=useDamageTracker(gs);
  const selCardData=selCard!=null&&player?CARD[player.hand[selCard]]||null:null;
  const aliveCount=gs.players.filter(p=>p.alive).length;

  const execute=useCallback((act)=>{
    try{
    const action=act||planned;if(!action)return;
    const aiA=gs.players.filter(p=>p.isAI&&p.alive)
      .map(p=>aiPlan(p,gs.players,difficulty,gs)).filter(Boolean);
    const{state,logs}=resolveRound(gs,[action,...aiA]);
    // SE選択
    const hasKill=logs.some(l=>l.includes('💀'));
    const hasExplode=logs.some(l=>l.includes('自爆')||l.includes('フラグ')||l.includes('グレネード'));
    const hasHeal=logs.some(l=>l.includes('💊'));
    const hasFlash=logs.some(l=>l.includes('フラッシュ'));
    if(hasKill)snd.kill();else if(hasExplode)snd.explode();else if(hasHeal)snd.heal();else if(hasFlash)snd.flash();else snd.round();
    const alive=state.players.filter(p=>p.alive);
    setBanner(logs);
    if(alive.length<=1){
      const w=alive[0]||null;setWinner(w);
      addLog([...logs,w?`🏆 ${w.name} の勝利！`:'引き分け']);
      const isWin=w?.socketId==='player';
      record(isWin);
      setTimeout(()=>{if(mounted.current)setGameOver(true);},2300);
    } else if(round+1>maxRounds){
      const sortedHP=[...alive].sort((a,b)=>b.hp-a.hp);
      const w=sortedHP[0];setWinner(w);
      addLog([...logs,`⏱️ ${maxRounds}ラウンド終了！HP最多 ${w.name} の勝利！`]);
      const isWin=w?.socketId==='player';
      record(isWin);
      setTimeout(()=>{if(mounted.current)setGameOver(true);},2300);
    } else {
      addLog([...logs,`━━ ラウンド${round+1} スタート ━━`]);
      setRound(r=>r+1);
    }
    setGs(state);setPlanned(null);setSelCard(null);setSelMode(null);
    }catch(err){console.error('[execute] ERROR:',err);showToast('❌ エラー: '+err.message,T.red);}
  },[gs,planned,round,difficulty,snd,addLog,mounted,showToast]);

  const{onCardClick,onEnemyTap,onTileClick,onStepMove}=useGameActions({
    gs,myPlayer:player,submitted:false,selCard,selMode,autoExec,
    setPlanned,setSelCard,setSelMode,addLog,showToast,onExecute:execute,snd});

  // 観戦モード: プレイヤー死亡時に自動でラウンドを進行
  const gsRef=useRef(gs);const roundRef=useRef(round);
  useEffect(()=>{gsRef.current=gs;},[gs]);
  useEffect(()=>{roundRef.current=round;},[round]);
  useEffect(()=>{
    if(!player?.alive&&!gameOver&&!banner){
      const t=setTimeout(()=>{
        if(!mounted.current)return;
        const cgs=gsRef.current,cr=roundRef.current;
        // 生存確認（既に終了していれば何もしない）
        const alive2=cgs.players.filter(p=>p.alive);
        if(alive2.length<=1){setGameOver(true);return;}
        // 死亡プレイヤーのPASSは含めない（resolveRoundでskipされるが無駄）
        const aiA=cgs.players.filter(p=>p.isAI&&p.alive).map(p=>aiPlan(p,cgs.players,difficulty,cgs)).filter(Boolean);
        // 生存AI全員が手番を実行
        const{state,logs}=resolveRound(cgs,aiA);
        snd.round();
        const alive=state.players.filter(p=>p.alive);
        setBanner(logs);
        if(alive.length<=1){
          const w=alive[0]||null;setWinner(w);
          addLog([...logs,w?`🏆 ${w.name} の勝利！`:'引き分け']);
          setTimeout(()=>{if(mounted.current)setGameOver(true);},2300);
        } else {
          addLog([...logs,`━━ ラウンド${cr+1} スタート ━━`]);
          setRound(r=>r+1);
        }
        setGs(state);
      },2000);
      return()=>clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[player?.alive,gameOver,banner]);

  useKeyboard({
    enabled:!gameOver&&!showConfirm&&!!player?.alive,
    onSelect:onCardClick,
    onExecute:()=>execute(),
    onToggleAuto:()=>setAutoExec(v=>!v),
    onPass:()=>{setPlanned({playerId:0,cardId:'PASS',target:null});addLog('📋 パス');},
    onCancel:()=>{setSelCard(null);setSelMode(null);setPlanned(null);},
    handSize:player?.hand?.length||0,
  });

  if(gameOver)return <GameOverScreen winnerName={winner?.name}
    isMe={winner?.socketId==='player'} log={log} gs={gs} onRestart={onBack} onReplay={onReplay}/>;

  const mapNode=(
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',
      padding:isMobile?'0.35rem':'0.55rem',flexShrink:0}}>
      <Grid gs={gs} myPlayer={player} selMode={selMode} selCard={selCard}
        onTileClick={onTileClick} cellSize={cellSize} damageEvents={damageEvents}/>
    </div>
  );

  return(
    <div style={{height:'100dvh',background:T.bg,color:T.text,fontFamily:T.font,
      display:'flex',flexDirection:'column',overflow:'hidden',position:'relative'}}>
      {showConfirm&&<ConfirmDialog msg='ゲームを中断して戻りますか？'
        onOk={onBack} onCancel={()=>setShowConfirm(false)}/>}
      {showHelp&&<HelpModal onClose={()=>setShowHelp(false)}/>}
      <ToastLayer toasts={toasts}/>
      {banner&&<ResultBanner lines={banner} onDone={()=>setBanner(null)}/>}
      <StatusBar player={player} round={round} maxRounds={maxRounds} mode={`VS AI · ${DIFF_LABELS[difficulty]}`}
        aliveCount={aliveCount} totalCount={gs.players.length} onHelp={()=>setShowHelp(true)}/>
      <EnemyBar enemies={enemies} myId={0} selMode={selMode} onEnemyClick={onEnemyTap}
        isMobile={isMobile} myPlayer={player} selCardData={selCardData}/>
      <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0,
        flexDirection:isMobile?'column':'row'}}>
        {isMobile
          ?<div style={{flex:1,display:'flex',
              justifyContent:'center',alignItems:'center',overflow:'hidden'}}>{mapNode}</div>
          :<><div style={{overflowY:'auto',flexShrink:0}}>{mapNode}</div>
             <LogPanel log={log} isMobile={false}/></>}
      </div>
      {player?.alive===false
        ?<SpectatorPanel players={gs.players} isMobile={isMobile} onBack={onBack}/>
        :<ActionFooter planned={planned} selMode={selMode} submitted={false} isMobile={isMobile}
          autoExec={autoExec} onToggleAuto={()=>setAutoExec(v=>!v)}
          onCancel={()=>{setSelCard(null);setSelMode(null);}}
          onClearPlan={()=>{setPlanned(null);setSelCard(null);setSelMode(null);}}
          onPass={()=>{setPlanned({playerId:0,cardId:'PASS',target:null});addLog('📋 パス');}}
          onStepMove={onStepMove}
          onExecute={()=>execute()} execLabel='実行 ▶'
          onBack={()=>setShowConfirm(true)} isFlashed={player?.flashed} isCharging={!!player?.pendingCharge}>
          <HandCards player={player} enemies={enemies} selCard={selCard}
            planned={planned} submitted={false}
            compact={isMobile} onCardClick={onCardClick}/>
        </ActionFooter>}
      {isMobile&&<LogPanel log={log} isMobile={true}/>}
      <style>{`
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideUp{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}
        @keyframes slideDown{from{transform:translateY(-8px);opacity:0}to{transform:none;opacity:1}}
        @keyframes floatUp{0%{transform:translateX(-50%) translateY(0);opacity:1}100%{transform:translateX(-50%) translateY(-20px);opacity:0}}
        *{-webkit-tap-highlight-color:transparent;}
        ::-webkit-scrollbar{display:none;}
      `}</style>
    </div>
  );
}

/* ══════════════════════════════════════════
   MULTI GAME SCREEN
══════════════════════════════════════════ */
function MultiGameScreen({initData,mySocketId,sockRef,onRestart}) {
  useLockBody();
  const handleLeave=useCallback(()=>{sockRef.current?.emit('leave_room');onRestart();},[onRestart,sockRef]);
  const isMobile=useIsMobile(),cellSize=useCellSize();
  const snd=useSound();
  const maxRounds=initData?.maxRounds||20;
  const [gs,setGs]=useState(initData?.gameState||{players:[]});
  const [round,setRound]=useState(initData?.round||1);
  const [selCard,setSelCard]=useState(null),[selMode,setSelMode]=useState(null),[planned,setPlanned]=useState(null);
  const [submitted,setSubmitted]=useState(initData?.submitted||false);
  const [gameOver,setGameOver]=useState(false),[winner,setWinner]=useState(null);
  const [log,setLog]=useState(['━━ ゲーム開始！━━']);
  const [deadline,setDeadline]=useState(initData?.deadline||null);
  const [progress,setProgress]=useState({count:0,total:0});
  const [banner,setBanner]=useState(null);
  const [autoExec,setAutoExec]=useState(false);
  const [timerDanger,setTimerDanger]=useState(false);
  const [showConfirm,setShowConfirm]=useState(false);
  const [emotes,setEmotes]=useState([]); // [{id,name,emote,ts}]
  const [showEmotePicker,setShowEmotePicker]=useState(false);
  const damageEvents=useDamageTracker(gs);
  const addLog=useCallback(lines=>setLog(l=>[...l,...(Array.isArray(lines)?lines:[lines])].slice(-60)),[]);
  const{toasts,show:showToast}=useToast();
  const s=sockRef.current;
  const myPlayer=gs?.players?.find(p=>p.socketId===mySocketId);
  const myIdRef=useRef(myPlayer?.id);
  useEffect(()=>{myIdRef.current=myPlayer?.id;},[myPlayer?.id]);

  useEffect(()=>{
    if(initData?.reconnectToken)try{sessionStorage.setItem('sc_token',initData.reconnectToken);}catch(e){}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{
    const onSub=({name,playerId,submittedCount,totalHumans})=>{
      if(playerId!==myIdRef.current)addLog(`⏳ ${name} が行動確定`);
      setProgress({count:submittedCount,total:totalHumans});
    };
    const onRes=({gameState,logs,round:r})=>{
      snd.round();setGs(gameState);setRound(r);setSubmitted(false);setPlanned(null);setSelCard(null);setSelMode(null);
      setSelCard(null);setSelMode(null);setProgress({count:0,total:0});setTimerDanger(false);
      setBanner(logs);addLog([...logs,`━━ ラウンド${r} スタート ━━`]);
    };
    const onOver=({gameState,winner:w,logs})=>{
      if(gameState)setGs(gameState);if(logs)addLog(logs);setWinner(w);setGameOver(true);
      try{sessionStorage.removeItem('sc_token');}catch(e){}
    };
    const onSys=({msg})=>addLog(msg);
    const onTimer=({deadline:dl})=>{setDeadline(dl);setTimerDanger(false);};
    const onWarn=({secondsLeft,missing})=>{
      if(secondsLeft<=5)setTimerDanger(true);
      addLog(`⏱ 残り${secondsLeft}秒！[${missing.join(', ')}] 未確定`);
    };
    const onRejoin=({gameState,round:r,submitted:sub,deadline:dl})=>{
      setGs(gameState);setRound(r);setSubmitted(sub||false);setDeadline(dl||null);
      addLog('🔄 ゲームに復帰しました');
    };
    const onEmote=({playerId,name,emote})=>{
      const id=Date.now()+Math.random();
      setEmotes(prev=>[...prev.slice(-5),{id,playerId,name,emote,ts:Date.now()}]);
      setTimeout(()=>setEmotes(prev=>prev.filter(e=>e.id!==id)),3000);
    };
    s.on('player_submitted',onSub);s.on('round_resolved',onRes);s.on('game_over',onOver);
    s.on('system_msg',onSys);s.on('round_timer',onTimer);s.on('timer_warning',onWarn);s.on('rejoined',onRejoin);
    s.on('player_emote',onEmote);
    return()=>{
      s.off('player_submitted',onSub);s.off('round_resolved',onRes);s.off('game_over',onOver);
      s.off('system_msg',onSys);s.off('round_timer',onTimer);s.off('timer_warning',onWarn);s.off('rejoined',onRejoin);
      s.off('player_emote',onEmote);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[s,addLog]);

  const execute=useCallback((act)=>{
    const action=act||planned;if(!action||submitted)return;
    snd.submit();
    s.emit('submit_action',{action});setSubmitted(true);
    if(action.cardId!=='PASS')addLog('✅ 行動を送信しました');
  },[planned,submitted,s,snd,addLog]);

  // 倒されたらPASSを自動送信
  useEffect(()=>{
    if(myPlayer&&!myPlayer.alive&&!submitted&&myPlayer.id!=null){
      s.emit('submit_action',{action:{playerId:myPlayer.id,cardId:'PASS',target:null}});
      setSubmitted(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[myPlayer?.alive,submitted]);

  const selCardData=selCard!=null&&myPlayer?CARD[myPlayer.hand[selCard]]||null:null;
  const{onCardClick,onEnemyTap,onTileClick,onStepMove}=useGameActions({
    gs,myPlayer,submitted,selCard,selMode,autoExec,
    setPlanned,setSelCard,setSelMode,addLog,showToast,onExecute:execute,snd});

  useKeyboard({
    enabled:!gameOver&&!submitted&&!showConfirm&&(myPlayer?.alive!==false),
    onSelect:onCardClick,
    onExecute:()=>execute(),
    onPass:()=>{if(!submitted){setPlanned({playerId:myPlayer?.id,cardId:'PASS',target:null});addLog('📋 パス');}},
    onCancel:()=>{setSelCard(null);setSelMode(null);setPlanned(null);},
    handSize:myPlayer?.hand?.length||0,
  });

  if(gameOver)return <GameOverScreen winnerName={winner?.name}
    isMe={winner?.isMe} log={log} gs={gs} onRestart={handleLeave}/>;

  const enemies=gs?.players?.filter(p=>p.id!==myPlayer?.id)||[];
  const aliveCount=gs?.players?.filter(p=>p.alive).length??0;
  const totalCount=gs?.players?.length??0;

  const mapNode=(
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',
      padding:isMobile?'0.35rem':'0.55rem',flexShrink:0}}>
      <Grid gs={gs} myPlayer={myPlayer} selMode={selMode} selCard={selCard}
        onTileClick={onTileClick} cellSize={cellSize} damageEvents={damageEvents}/>
    </div>
  );

  return(
    <div style={{height:'100dvh',background:T.bg,color:T.text,fontFamily:T.font,
      display:'flex',flexDirection:'column',overflow:'hidden',position:'relative',
      outline:timerDanger?`2px solid ${T.red}`:undefined,transition:'outline 0.3s'}}>
      {showConfirm&&<ConfirmDialog msg='ゲームを中断して退出しますか？'
        onOk={handleLeave} onCancel={()=>setShowConfirm(false)}/>}
      <ToastLayer toasts={toasts}/>
      {banner&&<ResultBanner lines={banner} onDone={()=>setBanner(null)}/>}
      {/* エモート表示 */}
      {emotes.length>0&&<div style={{position:'absolute',top:isMobile?50:60,right:10,zIndex:90,
        display:'flex',flexDirection:'column',gap:4,pointerEvents:'none'}}>
        {emotes.map(e=>(
          <div key={e.id} style={{background:`${T.bg1}ee`,border:`1px solid ${T.border}`,
            borderRadius:8,padding:'0.25rem 0.55rem',fontSize:'0.72rem',color:T.text,
            animation:'fadeIn 0.2s',display:'flex',gap:6,alignItems:'center'}}>
            <span style={{color:T.faint,fontSize:'0.6rem'}}>{e.name}</span>
            <span style={{fontSize:'1.1rem'}}>{e.emote}</span>
          </div>
        ))}
      </div>}
      {/* エモートピッカー */}
      {showEmotePicker&&<div style={{position:'absolute',bottom:isMobile?130:90,right:10,zIndex:95,
        background:T.bg1,border:`1px solid ${T.border}`,borderRadius:10,padding:'0.5rem',
        display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4,boxShadow:`0 4px 20px ${T.bg}cc`}}
        onClick={e=>e.stopPropagation()}>
        {['👍','😂','😤','🎯','💀','🔥','❓','gg'].map(em=>(
          <button key={em} onClick={()=>{s.emit('emote',{emote:em});setShowEmotePicker(false);}}
            style={{background:'none',border:`1px solid ${T.border}`,borderRadius:6,
              padding:'0.35rem',fontSize:'1.1rem',cursor:'pointer',color:T.text,
              minWidth:38,minHeight:38}}>
            {em}
          </button>
        ))}
      </div>}
      <StatusBar player={myPlayer} round={round} maxRounds={maxRounds} mode='MULTI'
        aliveCount={aliveCount} totalCount={totalCount}/>
      <RoundTimer deadline={deadline} progress={progress}/>
      <EnemyBar enemies={enemies} myId={myPlayer?.id} selMode={selMode}
        onEnemyClick={onEnemyTap} isMobile={isMobile}
        myPlayer={myPlayer} selCardData={selCardData}/>
      <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0,
        flexDirection:isMobile?'column':'row'}}>
        {isMobile
          ?<div style={{flex:1,display:'flex',
              justifyContent:'center',alignItems:'center',overflow:'hidden'}}>{mapNode}</div>
          :<><div style={{overflowY:'auto',flexShrink:0}}>{mapNode}</div>
             <LogPanel log={log} isMobile={false}/></>}
      </div>
      {myPlayer&&!myPlayer.alive
        ?<SpectatorPanel players={gs.players} isMobile={isMobile}/>
        :<ActionFooter planned={planned} selMode={selMode} submitted={submitted} isMobile={isMobile}
          autoExec={autoExec} onToggleAuto={()=>setAutoExec(v=>!v)}
          onCancel={()=>{setSelCard(null);setSelMode(null);}}
          onClearPlan={()=>{setPlanned(null);setSelCard(null);setSelMode(null);}}
          onPass={()=>{if(!submitted){setPlanned({playerId:myPlayer?.id,cardId:'PASS',target:null});addLog('📋 パス');}}}
          onStepMove={onStepMove}
          onExecute={()=>execute()} execLabel='送信 ▶'
          progress={progress} onBack={()=>setShowConfirm(true)}
          isFlashed={myPlayer?.flashed} isCharging={!!myPlayer?.pendingCharge}
          onEmote={()=>setShowEmotePicker(v=>!v)}>
          {myPlayer?.hand?.length
            ?<HandCards player={myPlayer} enemies={enemies} selCard={selCard}
                planned={planned} submitted={submitted}
                compact={isMobile} onCardClick={onCardClick}/>
            :<div style={{color:T.faint,fontSize:'0.78rem',padding:'0.9rem'}}>手札なし</div>}
        </ActionFooter>}
      {isMobile&&<LogPanel log={log} isMobile={true}/>}
      <style>{`
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideUp{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}
        @keyframes slideDown{from{transform:translateY(-8px);opacity:0}to{transform:none;opacity:1}}
        @keyframes floatUp{0%{transform:translateX(-50%) translateY(0);opacity:1}100%{transform:translateX(-50%) translateY(-20px);opacity:0}}
        *{-webkit-tap-highlight-color:transparent;}
        ::-webkit-scrollbar{display:none;}
      `}</style>
    </div>
  );
}

/* ══════════════════════════════════════════
   RECONNECT SCREEN
══════════════════════════════════════════ */
function ReconnectScreen({token,onDismiss}) {
  const [status,setStatus]=useState('connecting');
  const [initData,setInitData]=useState(null),[mySocketId,setMySocketId]=useState(null);
  const sockRef=useRef(null);
  const attempt=useCallback(()=>{
    setStatus('connecting');
    const s=getSocket();sockRef.current=s;
    if(!s.connected)s.connect();
    const onRejoin=(data)=>{setInitData(data);setMySocketId(s.id);setStatus('ok');};
    const onErr=()=>setStatus('failed');
    const tryEmit=()=>{s.once('rejoined',onRejoin);s.once('error',onErr);s.emit('rejoin_room',{token});};
    if(s.connected)tryEmit();else s.once('connect',tryEmit);
    return()=>{s.off('rejoined',onRejoin);s.off('error',onErr);};
  },[token]);
  useEffect(()=>attempt(),[attempt]);
  if(status==='ok'&&initData&&mySocketId)
    return <MultiGameScreen initData={initData} mySocketId={mySocketId}
      sockRef={sockRef} onRestart={onDismiss}/>;
  return(
    <div style={page(true)}>
      <div style={{fontSize:'2.4rem'}}>{status==='failed'?'❌':'🔄'}</div>
      <div style={{fontSize:'0.88rem',color:status==='failed'?T.red:T.amber,letterSpacing:'0.1em'}}>
        {status==='connecting'?'ゲームに再接続中...':status==='failed'?'再接続に失敗しました':'—'}
      </div>
      {status==='failed'&&(
        <div style={row({gap:'0.9rem'})}>
          <button onClick={attempt} style={Btn(T.amber,{minWidth:80})}>再試行</button>
          <button onClick={()=>{try{sessionStorage.removeItem('sc_token');}catch(e){}onDismiss();}}
            style={Btn(T.dim,{minWidth:80})}>キャンセル</button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   ROOT
══════════════════════════════════════════ */
export default function App() {
  const [screen,setScreen]=useState('home');
  const [spCls,setSpCls]=useState(null);
  const [spBots,setSpBots]=useState(1);
  const [spDiff,setSpDiff]=useState(DIFF.NORMAL);
  const [spHandSize,setSpHandSize]=useState(3);
  const [spMapType,setSpMapType]=useState('RANDOM');
  const [spMaxRounds,setSpMaxRounds]=useState(DEFAULT_MAX_ROUNDS);
  const [gameKey,setGameKey]=useState(0);
  const [reconnectToken]=useState(()=>{try{return sessionStorage.getItem('sc_token');}catch(e){return null;}});
  const [showReconnect,setShowReconnect]=useState(!!reconnectToken);

  if(showReconnect&&reconnectToken)
    return <ReconnectScreen token={reconnectToken} onDismiss={()=>setShowReconnect(false)}/>;
  if(screen==='home')
    return <HomeScreen onSP={()=>setScreen('sp-setup')} onMP={()=>setScreen('mp')}/>;
  if(screen==='sp-setup')
    return <SPSetupScreen onBack={()=>setScreen('home')}
      onStart={(cls,bots,diff,hs,mt,mr)=>{setSpCls(cls);setSpBots(bots);setSpDiff(diff);setSpHandSize(hs||3);setSpMapType(mt||'RANDOM');setSpMaxRounds(mr||DEFAULT_MAX_ROUNDS);setGameKey(k=>k+1);setScreen('sp-game');}}/>;
  if(screen==='sp-game')
    return <SPGameScreen key={gameKey} playerCls={spCls} botCount={spBots}
      handSize={spHandSize}
      mapType={spMapType}
      maxRounds={spMaxRounds}
      difficulty={spDiff} onBack={()=>setScreen('home')}
      onReplay={()=>setGameKey(k=>k+1)}/>;
  if(screen==='mp')
    return <MPSetupScreen onBack={()=>setScreen('home')}/>;
  return null;
}
