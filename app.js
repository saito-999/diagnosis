import { QUESTIONS } from "./data_questions.js";
import { computeAllPhases } from "./contrib_table.js";
import { calcRarity } from "./rarity_logic.js";
import { calcAlias } from "./alias_logic.js";
import { getText } from "./text.js";

const PHASE_KEYS = ["matching","firstMeet","date","relationship","marriage"];
const PHASE_LABELS_JA = {
  matching: "出会い（マッチング）",
  firstMeet: "初対面",
  date: "デート",
  relationship: "交際",
  marriage: "結婚",
};
const SCORE_LABEL = { 1:"激弱", 2:"弱", 3:"普通", 4:"強", 5:"激強" };
const RARITY_LEGEND_FIXED = [["C","35%"],["U","25%"],["R","20%"],["E","12%"],["M","6%"],["Lg","1.5%"],["Sg","0.5%"]];

const STORAGE_KEY="love_diag_state_r7";
const SCREENS={TITLE:"title",START:"start",Q1_10:"q1_10",Q11_20:"q11_20",ALIAS:"alias",RESULT:"result"};
const state={screen:SCREENS.TITLE,answersMap:{},result:null,runMode:"manual"};

const $=s=>document.querySelector(s);
const clampInt=(n,min,max)=>{const x=parseInt(n,10);return Number.isNaN(x)?min:Math.min(max,Math.max(min,x));};
const scoreLabel=n=>SCORE_LABEL[clampInt(n,1,5)]||"";

async function stableHash(str){
  const enc=new TextEncoder().encode(str);
  const buf=await crypto.subtle.digest("SHA-256",enc);
  const arr=Array.from(new Uint8Array(buf));
  const hex=arr.slice(0,10).map(b=>b.toString(16).padStart(2,"0")).join("");
  return BigInt("0x"+hex).toString(36).toUpperCase().padStart(8,"0").slice(0,10);
}
const buildAnswers=()=>Array.from({length:20},(_,i)=>clampInt(state.answersMap[`Q${i+1}`],1,5));
const hasAll=(a,b)=>{for(let i=a;i<=b;i++) if(!state.answersMap[`Q${i}`]) return false; return true;};
const qText=qid=>Array.isArray(QUESTIONS)?String((QUESTIONS.find(x=>x?.qid===qid)?.text)||""):"";

function save(){sessionStorage.setItem(STORAGE_KEY,JSON.stringify({screen:state.screen,answersMap:state.answersMap,result:state.result,runMode:state.runMode}));}
function restore(){const s=sessionStorage.getItem(STORAGE_KEY); if(!s) return; try{const o=JSON.parse(s); Object.assign(state,o);}catch{}}
function setScreen(s){state.screen=s; save(); render(); window.scrollTo({top:0,behavior:"auto"});}

async function getPatternKeysByPhase(answers){
  try{
    const mod=await import("./result_key_logic.js");
    const fn=(typeof mod.calcResultKeys==="function")?mod.calcResultKeys:(typeof mod.default==="function")?mod.default:null;
    if(!fn) return {};
    const r=await Promise.resolve(fn({answersNormalized:answers,answers}));
    return r?.patternKeysByPhase||r?.pattern_keys_by_phase||r?.keysByPhase||{};
  }catch{return {};}
}

async function computeResult(){
  const answers=buildAnswers();
  const rarityRes=await Promise.resolve(calcRarity(answers));
  const rarity=(rarityRes&&typeof rarityRes==="object"?rarityRes.rarity:rarityRes)||"C";
  const aliasRes=await Promise.resolve(calcAlias(answers,rarity));
  const nickname=(aliasRes&&typeof aliasRes==="object"?(aliasRes.aliasOverall||aliasRes.nickname||aliasRes.name||""):String(aliasRes||""));
  const aliasAsset=(aliasRes&&typeof aliasRes==="object"?(aliasRes.aliasAssetOverall||aliasRes.asset||aliasRes.image||""):"");
  const phasesRes=await Promise.resolve(computeAllPhases({answers,meta:{runMode:state.runMode}}));
  const scoreBandByPhase=phasesRes?.scoreBandByPhase||phasesRes?.phase_scores||phasesRes?.phaseScores||{};
  const patternKeysByPhase=await getPatternKeysByPhase(answers);
  const saveCode=await stableHash(JSON.stringify(answers));
  const phaseTexts=[];
  for(const phaseKey of PHASE_KEYS){
    const patternKey=patternKeysByPhase[phaseKey]||"_default";
    const t=await Promise.resolve(getText(phaseKey,patternKey));
    const sections=t?.sections||t||{};
    phaseTexts.push({phaseKey,patternKey,sections});
  }
  const tableRows=PHASE_KEYS.map(phaseKey=>{
    const scoreN=scoreBandByPhase[phaseKey];
    const score=(scoreN==null?"":scoreLabel(scoreN));
    const sec=phaseTexts.find(x=>x.phaseKey===phaseKey)?.sections;
    const note=Array.isArray(sec?.scene?.bullets)&&sec.scene.bullets.length?String(sec.scene.bullets[0]):"";
    return {phaseKey,phaseLabel:PHASE_LABELS_JA[phaseKey],score,note};
  });
  return {saveCode,nickname,rarity,aliasAsset,tableRows,phaseTexts};
}

async function aliasImgSrc(asset){
  const base="./assets/alias/";
  const fallback=base+"_default.png";
  if(!asset) return fallback;
  try{const r=await fetch(base+asset,{method:"HEAD"}); if(r.ok) return base+asset;}catch{}
  return fallback;
}

function el(tag,attrs={},...kids){
  const n=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs||{})){
    if(k==="class") n.className=v; else n.setAttribute(k,v);
  }
  for(const c of kids.flat()){
    if(c==null) continue;
    n.appendChild(typeof c==="string"?document.createTextNode(c):c);
  }
  return n;
}
function btn(label,cls,fn,attrs={}){
  const b=el("button",{type:"button",class:cls,...attrs},label);
  b.addEventListener("click",e=>{e.stopPropagation(); fn();});
  return b;
}

function renderTitle(root){
  const card=el("section",{class:"card stack center"},
    el("h1",{class:"h1"},"恋愛戦場タイプ診断"),
    el("div",{class:"h2"},"あなたが下手でも悪いんでもない。逢ってないだけ。"),
    el("hr",{class:"hr"}),
    el("div",{id:"loopLines",class:"loopLines"}),
    el("div",{class:"tapHint"},"画面をタップすると次へ")
  );
  card.addEventListener("click",()=>setScreen(SCREENS.START));
  root.appendChild(card);
  const lines=["会ってる。","合ってない。","遇ってる。","遭ってない。"];
  const wrap=card.querySelector("#loopLines"); let idx=0;
  const show=()=>{wrap.innerHTML=""; for(let i=0;i<lines.length;i++){const j=(idx+i)%lines.length; wrap.appendChild(el("div",{class:`line${i===0?"":" dim"}`},lines[j]));} idx=(idx+1)%lines.length;};
  show(); clearInterval(window.__loveDiagLoopTimer); window.__loveDiagLoopTimer=setInterval(show,400);
}

function renderStart(root){
  root.appendChild(el("section",{class:"card stack"},
    el("h1",{class:"h1"},"恋愛戦場タイプ診断"),
    el("div",{class:"btnRow"},
      btn("診断開始","primary",()=>{state.runMode="manual";save();setScreen(SCREENS.Q1_10);}),
      btn("ランダム診断","secondary",async()=>{state.runMode="random"; for(let i=1;i<=20;i++) state.answersMap[`Q${i}`]=1+Math.floor(Math.random()*5); save(); state.result=await computeResult(); save(); setScreen(SCREENS.ALIAS);})
    ),
    el("div",{class:"p"},"これは、あなたの価値や優劣・人間性を決めつける診断ではありません。"),
    el("div",{class:"p"},"恋愛の傾向を統計的にモデル化したものであり、正解とは限りません。"),
    el("div",{class:"p"},"恋愛心理学・行動科学・交際統計など複数研究の傾向から「出会い〜交際〜結婚」フェーズ別のデータを用いて作成しています。"),
    el("div",{class:"small"},"※この診断は医学的・医療的評価を目的としたものではありません")
  ));
}

function renderQuestions(root,a,b){
  const list=el("div",{class:"qList"});
  for(let i=a;i<=b;i++){
    const qid=`Q${i}`; const text=qText(qid); if(!text) continue;
    const wrap=el("div",{class:"qItem"}, el("p",{class:"qTitle"},text));
    const choices=el("div",{class:"choices"});
    for(let v=1;v<=5;v++){
      const sel=state.answersMap[qid]===v;
      const c=btn(String(v),`choiceBtn${sel?" selected":""}`,()=>{state.answersMap[qid]=v;save(); render();});
      choices.appendChild(c);
    }
    wrap.appendChild(choices); list.appendChild(wrap);
  }
  const nextDisabled=!hasAll(a,b);
  root.appendChild(el("section",{class:"card stack"},
    el("div",{class:"small"},`質問 ${a}〜${b}`),
    el("div",{class:"legendInline"}, el("span",{},"凡例： "), "1=あてはまらない / 2=あまりあてはまらない / 3=どちらともいえない / 4=すこしあてはまる / 5=あてはまる"),
    list,
    el("div",{class:"btnRow"},
      btn("戻る","ghost",()=>{ if(a===1) setScreen(SCREENS.START); else setScreen(SCREENS.Q1_10); }),
      btn("最初へ","ghost",()=>{state.answersMap={};state.result=null;state.runMode="manual";save();setScreen(SCREENS.START);}),
      btn("次へ","primary",async()=>{
        if(!hasAll(a,b)) return;
        if(b===10){ setScreen(SCREENS.Q11_20); return; }
        state.result=await computeResult(); save(); setScreen(SCREENS.ALIAS);
      }, {disabled: nextDisabled})
    )
  ));
}

function renderAlias(root){
  const r=state.result;
  const card=el("section",{class:"card stack"},
    el("div",{class:"aliasRow"},
      el("div",{class:"aliasTextBlock"}, el("h1",{class:"h1"}, r?.nickname || "—")),
      el("div",{class:"aliasImgWrap"}, el("img",{alt:"",src:"./assets/alias/_default.png"}))
    ),
    el("div",{class:"tapHint"},"画面をタップすると次へ")
  );
  const img=card.querySelector("img");
  aliasImgSrc(r?.aliasAsset||"").then(src=>{img.src=src;});
  card.addEventListener("click",()=>setScreen(SCREENS.RESULT));
  root.appendChild(card);
}

function phaseDetails(phaseKey,sections){
  const d=el("details",{}, el("summary",{}, PHASE_LABELS_JA[phaseKey]));
  const order=[["scene","よくあるシーン"],["why","なぜ起きるのか"],["awareness","自覚ポイント"],["recommend","おすすめ"]];
  for(const [k,label] of order){
    const sec=sections?.[k]||{};
    const bullets=Array.isArray(sec.bullets)?sec.bullets:[];
    const sentences=Array.isArray(sec.sentences)?sec.sentences:[];
    d.appendChild(el("div",{},
      el("div",{class:"secTitle"},label),
      bullets.length?el("ul",{class:"bullets"},...bullets.map(x=>el("li",{},String(x)))):el("div",{class:"small"},""),
      sentences.length?el("div",{class:"sentences"},sentences.map(String).join(" ")):el("div",{class:"small"},"")
    ));
  }
  return d;
}

function renderResult(root){
  const r=state.result;
  if(!r){ root.appendChild(el("section",{class:"card stack"}, el("div",{class:"p"},"結果がありません。"))); return; }
  const aliasBlock=el("section",{class:"card stack"},
    el("div",{class:"topRightCode"}, el("div",{class:"saveCode"}, r.saveCode||"")),
    el("div",{class:"aliasRow"},
      el("div",{class:"aliasTextBlock"},
        el("div",{class:"p"},`異名： ${r.nickname||"—"}`),
        el("div",{class:"p"},`レアリティ： ${r.rarity||"—"}`)
      ),
      el("div",{class:"aliasImgWrap"}, el("img",{alt:"",src:"./assets/alias/_default.png"}))
    )
  );
  aliasImgSrc(r.aliasAsset||"").then(src=>{aliasBlock.querySelector("img").src=src;});

  const tbody=el("tbody",{},...r.tableRows.map(row=>el("tr",{}, el("td",{},row.phaseLabel), el("td",{},row.score||""), el("td",{},row.note||""))));
  const table=el("table",{class:"table"},
    el("thead",{}, el("tr",{}, el("th",{},"フェーズ"), el("th",{},"スコア"), el("th",{},"備考"))),
    tbody
  );
  const legend=el("div",{style:"display:flex;flex-wrap:wrap;gap:12px;font-size:13px"},
    ...RARITY_LEGEND_FIXED.map(([k,v])=>el("div",{style:"display:flex;gap:6px"}, el("div",{class:"small"},k), el("div",{},v)))
  );
  const details=el("section",{class:"stack"}, ...PHASE_KEYS.map(pk=>phaseDetails(pk, r.phaseTexts.find(x=>x.phaseKey===pk)?.sections||{})));

  root.appendChild(el("div",{class:"stack"},
    aliasBlock,
    el("section",{class:"card stack"}, table),
    el("section",{class:"card stack"}, legend),
    details,
    el("section",{class:"card stack"}, el("div",{class:"btnRow"},
      btn("もう一度診断","primary",()=>{state.answersMap={};state.result=null;state.runMode="manual";save();setScreen(SCREENS.START);} ),
      btn("結果を保存","secondary",async()=>{ try{await navigator.clipboard.writeText(r.saveCode||"");}catch{} })
    ))
  ));
}

function render(){
  const root=$("#app"); if(!root) return; root.innerHTML="";
  if(state.screen===SCREENS.TITLE) return renderTitle(root);
  if(state.screen===SCREENS.START) return renderStart(root);
  if(state.screen===SCREENS.Q1_10) return renderQuestions(root,1,10);
  if(state.screen===SCREENS.Q11_20) return renderQuestions(root,11,20);
  if(state.screen===SCREENS.ALIAS) return renderAlias(root);
  if(state.screen===SCREENS.RESULT) return renderResult(root);
}

document.addEventListener("DOMContentLoaded",()=>{restore(); render();});
