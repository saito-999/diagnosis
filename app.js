import { QUESTIONS } from "./data_questions.js";
import { computeAllPhases } from "./contrib_table.js";
import { calcRarity } from "./rarity_logic.js";
import { calcAlias } from "./alias_logic.js";
import { getText } from "./text.js";
import { calcResultKeys } from "./result_key_logic.js";

const SCREENS={TITLE:"title",START:"start",Q1:"q1",Q2:"q2",ALIAS:"alias",RESULT:"result"};
const PHASE_KEYS=["matching","firstMeet","date","relationship","marriage"];
const PHASE_LABELS={matching:"出会い",firstMeet:"初対面",date:"デート",relationship:"交際",marriage:"結婚"};
const SCORE_LABEL={1:"激弱",2:"弱",3:"普通",4:"強",5:"激強"};

const state={screen:SCREENS.TITLE,answers:{},result:null};

const $=s=>document.querySelector(s);
const el=(t,a={},...c)=>{const n=document.createElement(t);for(const k in a)n.setAttribute(k,a[k]);c.flat().forEach(x=>n.append(x?.nodeType?x:document.createTextNode(x)));return n};

function render(){
  const app=$("#app"); app.innerHTML="";
  if(state.screen===SCREENS.TITLE)return app.append(title());
  if(state.screen===SCREENS.START)return app.append(start());
  if(state.screen===SCREENS.Q1)return app.append(questions(1,10));
  if(state.screen===SCREENS.Q2)return app.append(questions(11,20));
  if(state.screen===SCREENS.ALIAS)return app.append(alias());
  if(state.screen===SCREENS.RESULT)return app.append(result());
}

function title(){
  const c=el("section",{class:"card stack center"},
    el("h1",{class:"h1"},"恋愛戦場タイプ診断"),
    el("div",{class:"h2"},"あなたが下手でも悪いんでもない。逢ってないだけ。"),
    el("div",{class:"small"},"画面タップで開始")
  );
  c.onclick=()=>{state.screen=SCREENS.START;render()};
  return c;
}

function start(){
  return el("section",{class:"card stack"},
    el("button",{class:"primary"}, "診断開始").onclick=()=>{state.screen=SCREENS.Q1;render()},
    el("button",{class:"secondary"}, "ランダム診断").onclick=async()=>{
      for(let i=1;i<=20;i++)state.answers["Q"+i]=1+Math.floor(Math.random()*5);
      state.result=await compute(); state.screen=SCREENS.ALIAS; render();
    }
  );
}

function questions(s,e){
  const c=el("section",{class:"card stack"},
    el("div",{class:"legendInline"},"1=あてはまらない / 5=あてはまる"),
    ...Array.from({length:e-s+1},(_,i)=>questionItem("Q"+(s+i)))
  );
  const btn=el("button",{class:"primary"},"次へ");
  btn.onclick=async()=>{
    if(e===10){state.screen=SCREENS.Q2;render()}
    else{state.result=await compute();state.screen=SCREENS.ALIAS;render()}
  };
  c.append(btn); return c;
}

function questionItem(qid){
  const q=QUESTIONS.find(x=>x.qid===qid);
  const wrap=el("div",{class:"qItem"},
    el("div",{},q?.text||qid),
    el("div",{class:"choices"},
      ...[1,2,3,4,5].map(v=>{
        const b=el("button",{class:"choiceBtn"},v);
        b.onclick=()=>{state.answers[qid]=v; b.classList.add("selected")};
        return b;
      })
    )
  );
  return wrap;
}

async function compute(){
  const answersNorm=Array.from({length:20},(_,i)=>state.answers["Q"+(i+1)]);
  const rarity=calcRarity(answersNorm);
  const alias=calcAlias(answersNorm,rarity);
  const phases=computeAllPhases({answers:answersNorm});
  const keys=await calcResultKeys({answers:answersNorm});
  const texts={};
  for(const p of PHASE_KEYS)texts[p]=getText(p,keys.patternKeysByPhase[p]);
  return {rarity,alias,phases,keys,texts};
}

function alias(){
  const c=el("section",{class:"card stack center"},
    el("h1",{class:"h1"},state.result.alias?.aliasOverall||"")
  );
  c.onclick=()=>{state.screen=SCREENS.RESULT;render()};
  return c;
}

function result(){
  const r=state.result;
  return el("section",{class:"card stack"},
    el("div",{},`異名：${r.alias?.aliasOverall||""}`),
    el("div",{},`レアリティ：${r.rarity}`),
    el("table",{class:"table"},
      el("tr",{},el("th",{},"フェーズ"),el("th",{},"スコア")),
      ...PHASE_KEYS.map(p=>el("tr",{},el("td",{},PHASE_LABELS[p]),el("td",{},SCORE_LABEL[r.phases.scoreBandByPhase[p]])))
    ),
    ...PHASE_KEYS.map(p=>{
      const d=el("details",{},el("summary",{},PHASE_LABELS[p]));
      const t=r.texts[p]?.sections||{};
      ["scene","why","awareness","recommend"].forEach(k=>{
        const s=t[k]||{};
        if(s.bullets) d.append(el("ul",{},...s.bullets.map(x=>el("li",{},x))));
        if(s.sentences) d.append(el("div",{},s.sentences.join(" ")));
      });
      return d;
    })
  );
}

document.addEventListener("DOMContentLoaded",render);
