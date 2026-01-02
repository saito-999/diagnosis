import { QUESTIONS } from "./data_questions.js";
import { showScreen, renderQuestions, renderAliasScreen, renderResult, qs } from "./ui.js";
import { loadState, saveState, clearState } from "./storage.js";
import { buildResult } from "./logic_adapter.js";

const STATE_DEFAULT = {
  screen: "title",      // title | start | q1 | q2 | alias | result
  answers: [],          // [{qid, v}]
  result: null,         // last result object
  scrollByScreen: {},   // {screenKey: number}
};

function mergeState(base, patch){
  const out = { ...base, ...patch };
  out.scrollByScreen = { ...(base.scrollByScreen||{}), ...(patch.scrollByScreen||{}) };
  return out;
}

let state = (() => {
  const saved = loadState();
  return mergeState(STATE_DEFAULT, saved || {});
})();

function persist(){
  saveState(state);
}

function setScreen(next){
  // save scroll
  state.scrollByScreen = { ...(state.scrollByScreen||{}), [state.screen]: window.scrollY || 0 };
  state.screen = next;
  persist();

  showScreen(next);

  // restore scroll
  const y = state.scrollByScreen?.[next];
  if(typeof y === "number" && Number.isFinite(y)){
    window.scrollTo(0, y);
  }else{
    window.scrollTo(0, 0);
  }
}

function setAnswer(qid, v){
  // upsert
  const idx = state.answers.findIndex(a => a.qid === qid);
  if(idx >= 0) state.answers[idx] = { qid, v };
  else state.answers.push({ qid, v });
  persist();
}

function getAnswersMap(){
  const m = new Map();
  for(const a of state.answers){
    if(a && typeof a.qid === "string" && Number.isInteger(a.v)) m.set(a.qid, a.v);
  }
  return m;
}

function ensureQuestions(){
  const q = Array.isArray(QUESTIONS) ? QUESTIONS : [];
  const q1 = q.slice(0, 10);
  const q2 = q.slice(10, 20);

  const c1 = qs("#questions-1-10");
  const c2 = qs("#questions-11-20");

  const answersMap = getAnswersMap();
  renderQuestions(c1, q1, answersMap);
  renderQuestions(c2, q2, answersMap);

  c1.addEventListener("answer-change", (e) => setAnswer(e.detail.qid, e.detail.v));
  c2.addEventListener("answer-change", (e) => setAnswer(e.detail.qid, e.detail.v));
}

function canProceed(rangeStart, rangeEnd){
  const m = getAnswersMap();
  for(let i=rangeStart;i<=rangeEnd;i++){
    if(!m.has(`Q${i}`)) return false;
  }
  return true;
}

function runDiagnosis(runMode){
  const meta = { runMode };
  const result = buildResult(state.answers, meta);
  state.result = result;
  persist();

  // alias screen display elements: nickname text + nickname image only
  const nick = result?.nickname ?? "";
  const imgSrc = result?.nicknameImageSrc;
  renderAliasScreen(nick, imgSrc);
  setScreen("alias");
}

function randomAnswers(){
  const out = [];
  for(let i=1;i<=20;i++){
    out.push({ qid: `Q${i}`, v: 1 + Math.floor(Math.random()*5) });
  }
  return out;
}

function wire(){
  // Title screen: tap to go start
  qs("#screen-title").addEventListener("click", () => setScreen("start"));

  qs("#btn-start").addEventListener("click", () => {
    setScreen("q1");
  });

  qs("#btn-random").addEventListener("click", () => {
    state.answers = randomAnswers();
    persist();
    ensureQuestions();
    runDiagnosis("random");
  });

  qs("#btn-q1-to-start").addEventListener("click", () => setScreen("start"));
  qs("#btn-q1-next").addEventListener("click", () => {
    if(!canProceed(1,10)) return;
    setScreen("q2");
  });

  qs("#btn-q2-back").addEventListener("click", () => setScreen("q1"));
  qs("#btn-q2-to-start").addEventListener("click", () => setScreen("start"));
  qs("#btn-q2-finish").addEventListener("click", () => {
    if(!canProceed(11,20)) return;
    runDiagnosis("manual");
  });

  // Alias screen: tap to results
  qs("#screen-alias").addEventListener("click", () => {
    if(state.result){
      renderResult(state.result);
    }
    setScreen("result");
  });

  qs("#btn-retry").addEventListener("click", () => {
    clearState();
    state = { ...STATE_DEFAULT };
    persist();
    ensureQuestions();
    setScreen("title");
  });

  qs("#btn-save").addEventListener("click", () => {
    if(!state.result) return;
    // Download result JSON
    const blob = new Blob([JSON.stringify(state.result, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `result_${state.result.saveCode || "result"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  qs("#btn-copy").addEventListener("click", async () => {
    const code = state.result?.saveCode ?? "";
    if(!code) return;
    try{
      await navigator.clipboard.writeText(code);
    }catch{
      // ignore
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  ensureQuestions();

  // Restore UI from saved state
  showScreen(state.screen);

  if(state.screen === "alias"){
    const nick = state.result?.nickname ?? "";
    const imgSrc = state.result?.nicknameImageSrc;
    renderAliasScreen(nick, imgSrc);
  }
  if(state.screen === "result" && state.result){
    renderResult(state.result);
  }

  // restore scroll after initial render
  const y = state.scrollByScreen?.[state.screen];
  if(typeof y === "number" && Number.isFinite(y)) window.scrollTo(0, y);

  wire();
});
