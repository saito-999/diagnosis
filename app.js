import { QUESTIONS } from "./data_questions.js";
import { computeAllPhases } from "./contrib_table.js";
import { calcRarity } from "./rarity_logic.js";
import { calcAlias } from "./alias_logic.js";
import { getText } from "./text.js";
import { calcResultKeys } from "./result_key_logic.js";

const SCREENS={TITLE:"title",START:"start",Q1:"q1",Q2:"q2",ALIAS:"alias",RESULT:"result"};
const PHASES=["matching","firstMeet","date","relationship","marriage"];

const state={screen:SCREENS.TITLE,answers:{},result:null};

const $=s=>document.querySelector(s);
const el=(t,cls)=>{const n=document.createElement(t);if(cls)n.className=cls;return n};

function render(){
  const root=$("#app"); root.innerHTML="";
  if(state.screen===SCREENS.TITLE) root.append(title());
  else if(state.screen===SCREENS.START) root.append(start());
  else if(state.screen===SCREENS.Q1) root.append(questions(1,10));
  else if(state.screen===SCREENS.Q2) root.append(questions(11,20));
  else if(state.screen===SCREENS.ALIAS) root.append(alias());
  else if(state.screen===SCREENS.RESULT) root.append(result());
}

function title(){
  const c=el("div","card center");
  c.textContent="恋愛戦場タイプ診断";
  c.onclick=()=>{state.screen=SCREENS.START;render()};
  return c;
}

function start(){
  const c=el("div","card stack center");
  const b=el("button","primary");
  b.textContent="診断開始";
  b.onclick=()=>{state.screen=SCREENS.Q1;render()};
  c.append(b);
  return c;
}

function questions(s,e){
  const c=el("div","card stack");
  const legend=el("div","legendInline");
  legend.textContent="1=あてはまらない / 2=あまりあてはまらない / 3=どちらともいえない / 4=すこしあてはまる / 5=あてはまる";
  c.append(legend);

  for(let i=s;i<=e;i++){
    const qid="Q"+i;
    const q=QUESTIONS.find(x=>x.qid===qid);
    const qi=el("div","qItem");
    qi.append(document.createTextNode(q?.text||qid));
    const ch=el("div","choices");
    for(let v=1;v<=5;v++){
      const b=el("button","choiceBtn");
      b.textContent=v;
      if(state.answers[qid]===v) b.classList.add("selected");
      b.onclick=()=>{
        state.answers[qid]=v;
        Array.from(ch.children).forEach(x=>x.classList.remove("selected"));
        b.classList.add("selected");
      };
      ch.append(b);
    }
    qi.append(ch);
    c.append(qi);
  }

  const next=el("button","primary");
  next.textContent="次へ";
  next.onclick=async()=>{
    for(let i=s;i<=e;i++){ if(!state.answers["Q"+i]) return; }
    if(e===10){state.screen=SCREENS.Q2;render();}
    else{state.result=await compute();state.screen=SCREENS.ALIAS;render();}
  };
  c.append(next);
  return c;
}

async function compute(){
  const answersNorm=Array.from({length:20},(_,i)=>state.answers["Q"+(i+1)]);
  const rarity=calcRarity(answersNorm);
  const alias=calcAlias(answersNorm,rarity);
  const phases=computeAllPhases({answers:answersNorm});
  const keys=await calcResultKeys({answers:answersNorm});
  const texts={};
  for(const p of PHASES) texts[p]=getText(p,keys.patternKeysByPhase[p]);
  return {rarity,alias,phases,keys,texts};
}

function alias(){
  const c=el("div","card center");
  c.textContent=state.result.alias?.aliasOverall||"";
  c.onclick=()=>{state.screen=SCREENS.RESULT;render()};
  return c;
}

function result(){
  const c=el("div","card");
  c.textContent="結果画面";
  return c;
}

document.addEventListener("DOMContentLoaded",render);
