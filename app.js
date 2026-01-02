import { QUESTIONS } from "./data_questions.js";
import { computeAllPhases } from "./contrib_table.js";
import { calcRarity } from "./rarity_logic.js";
import { calcAlias } from "./alias_logic.js";
import { getText } from "./text.js";

import { renderTitle } from "./ui_title.js";
import { renderStart } from "./ui_start.js";
import { renderQuestions1to10 } from "./ui_questions_1_10.js";
import { renderQuestions11to20 } from "./ui_questions_11_20.js";
import { renderAlias } from "./ui_alias.js";
import { renderResult } from "./ui_result.js";

const state = {
  screen: "title",
  answers: [],
  result: null,
};

function setScreen(next) {
  state.screen = next;
  render();
}

function updateAnswer(qid, v) {
  const idx = state.answers.findIndex(a => a.qid === qid);
  if (idx === -1) {
    state.answers.push({ qid, v });
  } else {
    state.answers[idx].v = v;
  }
}

function canProceed(qids) {
  return qids.every(qid => state.answers.some(a => a.qid === qid));
}

function normalizeAnswers() {
  const sorted = [...state.answers].sort((a, b) => {
    const na = Number(a.qid.replace("Q", ""));
    const nb = Number(b.qid.replace("Q", ""));
    return na - nb;
  });
  return sorted.map(a => a.v);
}

function computeResult() {
  const answersNormalized = normalizeAnswers();
  const phases = computeAllPhases(answersNormalized);
  const rarity = calcRarity(answersNormalized);
  const nickname = calcAlias(answersNormalized, rarity);

  const phaseKeys = ["matching","firstMeet","date","relationship","marriage"];
  const phaseTexts = {};
  phaseKeys.forEach(k => {
    const patternKey = phases?.patternKeysByPhase?.[k] ?? "_default";
    phaseTexts[k] = getText(k, patternKey);
  });

  state.result = {
    ...phases,
    rarity,
    nickname,
    phaseTexts,
  };
}

function render() {
  const root = document.getElementById("app");
  root.innerHTML = "";

  switch (state.screen) {
    case "title":
      renderTitle(root, () => setScreen("start"));
      break;
    case "start":
      renderStart(root, {
        onStart: () => setScreen("q1"),
        onRandom: () => {}
      });
      break;
    case "q1":
      renderQuestions1to10(root, {
        questions: QUESTIONS,
        onAnswer: updateAnswer,
        onNext: () => {
          const qids = QUESTIONS.slice(0,10).map(q => q.qid);
          if (canProceed(qids)) setScreen("q2");
        }
      });
      break;
    case "q2":
      renderQuestions11to20(root, {
        questions: QUESTIONS,
        onAnswer: updateAnswer,
        onNext: () => {
          const qids = QUESTIONS.slice(10,20).map(q => q.qid);
          if (canProceed(qids)) {
            computeResult();
            setScreen("alias");
          }
        }
      });
      break;
    case "alias":
      renderAlias(root, state.result, () => setScreen("result"));
      break;
    case "result":
      renderResult(root, state.result, () => {
        state.answers = [];
        state.result = null;
        setScreen("start");
      });
      break;
  }
}

document.addEventListener("DOMContentLoaded", render);
