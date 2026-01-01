import { QUESTIONS } from "./data_questions.js";
import { computeAllPhases } from "./contrib_table.js";
import { calcRarity } from "./rarity_logic.js";
import { calcAlias } from "./alias_logic.js";
import { getText } from "./text.js";
import { calcResultKeys } from "./result_key_logic.js";

const SCREENS = {
  TITLE: "title",
  START: "start",
  Q1: "q1",
  Q2: "q2",
  ALIAS: "alias",
  RESULT: "result"
};

const PHASE_KEYS = ["matching","firstMeet","date","relationship","marriage"];

const state = {
  screen: SCREENS.TITLE,
  answers: {}, // { Q1:1..5 }
  result: null
};

const $ = s => document.querySelector(s);
const el = (t, cls) => {
  const n = document.createElement(t);
  if (cls) n.className = cls;
  return n;
};

function render(){
  const root = $("#app");
  root.innerHTML = "";
  switch(state.screen){
    case SCREENS.TITLE: root.append(renderTitle()); break;
    case SCREENS.START: root.append(renderStart()); break;
    case SCREENS.Q1: root.append(renderQuestions(1,10)); break;
    case SCREENS.Q2: root.append(renderQuestions(11,20)); break;
    case SCREENS.ALIAS: root.append(renderAlias()); break;
    case SCREENS.RESULT: root.append(renderResult()); break;
  }
}

function renderTitle(){
  const c = el("div","card center");
  c.textContent = "恋愛戦場タイプ診断";
  c.onclick = () => { state.screen = SCREENS.START; render(); };
  return c;
}

function renderStart(){
  const c = el("div","card stack");
  const b = el("button","primary");
  b.textContent = "診断開始";
  b.onclick = () => { state.screen = SCREENS.Q1; render(); };
  c.append(b);
  return c;
}

function renderQuestions(start,end){
  const c = el("div","card stack");
  const legend = el("div","legendInline");
  legend.textContent = "1=あてはまらない / 2=あまりあてはまらない / 3=どちらともいえない / 4=すこしあてはまる / 5=あてはまる";
  c.append(legend);

  for(let i=start;i<=end;i++){
    const qid = "Q"+i;
    const q = QUESTIONS.find(x=>x.qid===qid);
    const qi = el("div","qItem");
    qi.append(document.createTextNode(q ? q.text : qid));

    const ch = el("div","choices");
    for(let v=1;v<=5;v++){
      const b = el("button","choiceBtn");
      b.textContent = v;
      if(state.answers[qid]===v) b.classList.add("selected");
      b.onclick = () => {
        state.answers[qid] = v;
        Array.from(ch.children).forEach(x=>x.classList.remove("selected"));
        b.classList.add("selected");
      };
      ch.append(b);
    }
    qi.append(ch);
    c.append(qi);
  }

  const next = el("button","primary");
  next.textContent = "次へ";
  next.onclick = async () => {
    for(let i=start;i<=end;i++){
      if(!state.answers["Q"+i]) return;
    }
    if(end===10){
      state.screen = SCREENS.Q2;
      render();
    }else{
      state.result = await computeResult();
      state.screen = SCREENS.ALIAS;
      render();
    }
  };
  c.append(next);
  return c;
}

async function computeResult(){
  const answersArray = Array.from({length:20},(_,i)=>state.answers["Q"+(i+1)]);
  const rarity = calcRarity(answersArray);
  const alias = calcAlias(answersArray, rarity);
  const keys = await calcResultKeys({ answersNormalized: answersArray });
  const phaseTexts = {};
  PHASE_KEYS.forEach(p=>{
    phaseTexts[p] = getText(p, keys.patternKeysByPhase[p]);
  });
  return { rarity, alias, keys, phaseTexts };
}

function renderAlias(){
  const c = el("div","card center");
  c.textContent = state.result?.alias?.nickname || "";
  c.onclick = () => { state.screen = SCREENS.RESULT; render(); };
  return c;
}

function renderResult(){
  const c = el("div","card");
  c.textContent = "診断結果";
  return c;
}

document.addEventListener("DOMContentLoaded", render);
