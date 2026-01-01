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
const el=(t,c)=>document.createElement(t);

function render(){
  const root=$("#app"); root.innerHTML="";
  if(state.screen===SCREENS.TITLE) root.append(title());
  if(state.screen===SCREENS.START) root.append(start());
  if(state.screen===SCREENS.Q1) root.append(questions(1,10));
  if(state.screen===SCREENS.Q2) root.append(questions(11,20));
  if(state.screen===SCREENS.ALIAS) root.append(alias());
  if(state.screen===SCREENS.RESULT) root.append(result());
}

function title(){
  const c=el("div"); c.className="card stack center";
  c.textContent="恋愛戦場タイプ診断";
  c.onclick=()=>{state.screen=SCREENS.START;render()};
  return c;
}

function start(){
  const c=el("div"); c.className="card stack";
  const b=el("button"); b.className="primary"; b.textContent="診断開始";
  b.onclick=()=>{state.screen=SCREENS.Q1;render()};
  c.append(b); return c;
}

function questions(s,e){
  const c=el("div"); c.className="card stack";
  const legend=el("div"); legend.className="legendInline";
  legend.textContent="1=あてはまらない / 5=あてはまる";
  c.append(legend);

  for(let i=s;i<=e;i++){
    const q=QUESTIONS.find(x=>x.qid==="Q"+i);
    const qi=el("div"); qi.className="qItem";
    qi.append(document.createTextNode(q?.text||("Q"+i)));
    const ch=el("div"); ch.className="choices";
    for(let v=1;v<=5;v++){
      const b=el("button"); b.textContent=v;
      b.onclick=()=>{state.answers["Q"+i]=v;};
      ch.append(b);
    }
    qi.append(ch); c.append(qi);
  }

  const next=el("button"); next.className="primary"; next.textContent="次へ";
  next.onclick=async()=>{
    if(e===10){state.screen=SCREENS.Q2;render()}
    else{state.result=await compute();state.screen=SCREENS.ALIAS;render()}
  };
  c.append(next); return c;
}

async function compute(){
  const answers=Array.from({length:20},(_,i)=>state.answers["Q"+(i+1)]);
  const rarity=calcRarity(answers);
  const alias=calcAlias(answers,rarity);
  const keys=await calcResultKeys({answers});
  const texts={};
  for(const p of PHASES) texts[p]=getText(p,keys.patternKeysByPhase[p]);
  return {rarity,alias,keys,texts};
}

function alias(){
  const c=el("div"); c.className="card center";
  c.textContent=state.result.alias?.aliasOverall||"";
  c.onclick=()=>{state.screen=SCREENS.RESULT;render()};
  return c;
}

function result(){
  const c=el("div"); c.className="card stack";
  c.append(document.createTextNode("結果表示"));
  return c;
}

document.addEventListener("DOMContentLoaded",render);
