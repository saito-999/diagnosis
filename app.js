import { QUESTIONS } from "./data_questions.js";
import { computeAllPhases } from "./contrib_table.js";
import { calcRarity } from "./rarity_logic.js";
import { calcAlias } from "./alias_logic.js";
import { calcResultKeys } from "./result_key_logic.js";
import { getText } from "./text.js";

import { render as renderTitle } from "./ui_title.js";
import { render as renderStart } from "./ui_start.js";
import { render as renderQ1to10 } from "./ui_questions_1_10.js";
import { render as renderQ11to20 } from "./ui_questions_11_20.js";
import { render as renderAlias } from "./ui_alias.js";
import { render as renderResult } from "./ui_result.js";

const PHASE_KEYS = ["matching","firstMeet","date","relationship","marriage"];
const SCORE_LABEL = { 1:"激弱", 2:"弱", 3:"普通", 4:"強", 5:"激強" };

const state = {
  screen: "title",
  runMode: "manual",
  answers: [],
  result: null
};

function setScreen(next) {
  state.screen = next;
  render();
}

function setAnswer(qid, v) {
  const value = Number(v);
  if (!(value >= 1 && value <= 5)) return;
  const i = state.answers.findIndex(a => a.qid === qid);
  if (i === -1) state.answers.push({ qid, v: value });
  else state.answers[i] = { qid, v: value };
}

function validQuestions() {
  return Array.isArray(QUESTIONS)
    ? QUESTIONS.filter(q => q && q.qid && q.text)
    : [];
}

function pageQids(page) {
  const v = validQuestions();
  const slice = page === 0 ? v.slice(0,10) : v.slice(10,20);
  return slice.map(q => q.qid);
}

function hasAllAnswered(qids) {
  const set = new Set(state.answers.map(a => a.qid));
  return qids.every(id => set.has(id));
}

function normalizeAnswers() {
  const order = Array.from({length:20},(_,i)=>`Q${i+1}`);
  const map = new Map(state.answers.map(a => [a.qid, a.v]));
  if (!order.every(q => map.has(q))) return null;
  return order.map(q => map.get(q));
}

function buildResult(answersNormalized) {
  const contrib = computeAllPhases({ answers: answersNormalized });
  const scoreBandByPhase = contrib?.phase_scores;

  const rarityOut = calcRarity(answersNormalized);
  const rarity = rarityOut?.rarity;

  const aliasOut = calcAlias(answersNormalized, rarity);
  const nickname = aliasOut?.aliasOverall;
  const aliasAssetOverall = aliasOut?.aliasAssetOverall;

  const keyOut = calcResultKeys({ answers: answersNormalized, contrib });
  const patternKeysByPhase = keyOut?.patternKeysByPhase;

  const phaseTexts = PHASE_KEYS.map(phaseKey => {
    const pk = patternKeysByPhase?.[phaseKey] || "_default";
    const sections = getText(phaseKey, pk);
    return { phaseKey, patternKey: pk, sections };
  });

  const tableRows = PHASE_KEYS.map(phaseKey => {
    const scoreBand = scoreBandByPhase?.[phaseKey];
    const scoreLabel = SCORE_LABEL[scoreBand] || "";
    const sections = phaseTexts.find(p => p.phaseKey === phaseKey)?.sections;
    const note = sections?.scene?.bullets?.[0] || "";
    return { phaseKey, scoreBand, scoreLabel, note };
  });

  return {
    nickname,
    rarity,
    scoreBandByPhase,
    tableRows,
    phaseTexts,
    aliasAssetOverall
  };
}

function startManual() {
  state.runMode = "manual";
  setScreen("q1_10");
}

function startRandom() {
  state.runMode = "random";
  state.answers = Array.from({length:20},(_,i)=>({ qid:`Q${i+1}`, v:1+Math.floor(Math.random()*5) }));
  const n = normalizeAnswers();
  if (!n) return;
  state.result = buildResult(n);
  setScreen("alias");
}

function nextFromQ1() {
  if (!hasAllAnswered(pageQids(0))) return;
  setScreen("q11_20");
}

function nextFromQ2() {
  if (!hasAllAnswered(pageQids(1))) return;
  const n = normalizeAnswers();
  if (!n) return;
  state.result = buildResult(n);
  setScreen("alias");
}

function aliasNext() {
  setScreen("result");
}

function retry() {
  state.answers = [];
  state.result = null;
  state.runMode = "manual";
  setScreen("start");
}

function render() {
  const root = document.getElementById("app");
  const ctx = {
    state,
    actions: {
      setAnswer,
      startManual,
      startRandom,
      nextFromQ1,
      nextFromQ2,
      aliasNext,
      retry
    }
  };

  if (state.screen === "title") renderTitle(root, ctx);
  else if (state.screen === "start") renderStart(root, ctx);
  else if (state.screen === "q1_10") renderQ1to10(root, ctx);
  else if (state.screen === "q11_20") renderQ11to20(root, ctx);
  else if (state.screen === "alias") renderAlias(root, ctx);
  else if (state.screen === "result") renderResult(root, ctx);
}

document.addEventListener("DOMContentLoaded", render);
