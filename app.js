import { calcRarity } from "./rarity_logic.js";
import { calcAlias } from "./alias_logic.js";
import { QUESTIONS } from "./data_questions.js";
import { computeAllPhases } from "./contrib_table.js";
import { calcResultKeys } from "./result_key_logic.js";
import { getText } from "./text.js";

import { render as renderTitle } from "./ui_title.js";
import { render as renderStart } from "./ui_start.js";
import { render as renderQ1to10 } from "./ui_questions_1_10.js";
import { render as renderQ11to20 } from "./ui_questions_11_20.js";
import { render as renderAlias } from "./ui_alias.js";
import { render as renderResult } from "./ui_result.js";

const STORAGE_KEY = "love_diag_beta_session_v1";

const PHASE_KEYS = ["matching", "firstMeet", "date", "relationship", "marriage"];
const SCREEN_KEYS = ["title", "start", "q1_10", "q11_20", "alias", "result"];
const SCORE_LABEL = { 1: "激弱", 2: "弱", 3: "普通", 4: "強", 5: "激強" };

const state = {
  screen: "title",
  runMode: "manual",
  answers: [],
  result: null,
  scrollByScreen: {},
};

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function persist() {
  const snapshot = {
    screen: state.screen,
    runMode: state.runMode,
    answers: state.answers,
    result: state.result,
    scrollByScreen: state.scrollByScreen,
  };
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch {}
}

function restore() {
  const saved = safeParse(sessionStorage.getItem(STORAGE_KEY));
  if (!saved || typeof saved !== "object") return;

  if (SCREEN_KEYS.includes(saved.screen)) state.screen = saved.screen;
  if (saved.runMode === "manual" || saved.runMode === "random") state.runMode = saved.runMode;
  if (Array.isArray(saved.answers)) state.answers = saved.answers;
  if (saved.result && typeof saved.result === "object") state.result = saved.result;
  if (saved.scrollByScreen && typeof saved.scrollByScreen === "object") state.scrollByScreen = saved.scrollByScreen;
}

function setScrollForScreen(screen, y) {
  state.scrollByScreen[screen] = Math.max(0, Number(y) || 0);
}

function restoreScrollForScreen(screen) {
  const y = state.scrollByScreen?.[screen];
  if (typeof y !== "number") return;
  requestAnimationFrame(() => window.scrollTo(0, y));
}

function setScreen(next) {
  if (!SCREEN_KEYS.includes(next)) return;
  setScrollForScreen(state.screen, window.scrollY);
  state.screen = next;
  persist();
  render();
}

function isValidQuestion(q) {
  return q && typeof q.qid === "string" && q.qid && typeof q.text === "string" && q.text;
}

function validQuestions() {
  return Array.isArray(QUESTIONS) ? QUESTIONS.filter(isValidQuestion) : [];
}

function pageQids(pageIndex) {
  const v = validQuestions();
  const slice = pageIndex === 0 ? v.slice(0, 10) : v.slice(10, 20);
  return slice.map(q => q.qid);
}

function setAnswer(qid, v) {
  const value = Number(v);
  if (!qid || !(value >= 1 && value <= 5)) return;

  const idx = state.answers.findIndex(a => a && a.qid === qid);
  if (idx === -1) state.answers.push({ qid, v: value });
  else state.answers[idx] = { qid, v: value };

  persist();
}

function hasAllAnswered(qids) {
  if (!Array.isArray(qids) || qids.length === 0) return false;
  const set = new Set(state.answers.filter(a => a && a.qid).map(a => a.qid));
  return qids.every(qid => set.has(qid));
}

function normalizeAnswers() {
  const order = Array.from({ length: 20 }, (_, i) => `Q${i + 1}`);
  const map = new Map();

  for (const a of state.answers) {
    if (!a || typeof a.qid !== "string") continue;
    const v = Number(a.v);
    if (v >= 1 && v <= 5) map.set(a.qid, v);
  }

  if (!order.every(qid => map.has(qid))) return null;
  return order.map(qid => map.get(qid));
}

async function sha256HexUpper(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex.toUpperCase();
}

async function genSaveCode(answersNormalized) {
  const json = JSON.stringify(answersNormalized);
  const hex = await sha256HexUpper(json);
  return hex.slice(0, 10);
}

async function buildResult(answersNormalized) {
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
    const raw = patternKeysByPhase?.[phaseKey];
    const patternKey = (typeof raw === "string" && raw) ? raw : "_default";
    const sections = getText(phaseKey, patternKey);
    return { phaseKey, patternKey, sections };
  });

  const tableRows = PHASE_KEYS.map(phaseKey => {
    const scoreBand = scoreBandByPhase?.[phaseKey];
    const scoreLabel = SCORE_LABEL?.[scoreBand] ?? "";
    const sections = phaseTexts.find(p => p.phaseKey === phaseKey)?.sections;
    const note = sections?.scene?.bullets?.[0] ?? "";
    return { phaseKey, scoreBand, scoreLabel, note };
  });

  const saveCode = await genSaveCode(answersNormalized);

  return {
    saveCode,
    nickname,
    rarity,
    scoreBandByPhase,
    tableRows,
    phaseTexts,
    debug: contrib?.debug,
    aliasAssetOverall,
  };
}

function startManual() {
  state.runMode = "manual";
  persist();
  setScreen("q1_10");
}

async function startRandom() {
  state.runMode = "random";
  state.answers = Array.from({ length: 20 }, (_, i) => ({
    qid: `Q${i + 1}`,
    v: 1 + Math.floor(Math.random() * 5),
  }));

  const normalized = normalizeAnswers();
  if (!normalized) return;

  state.result = await buildResult(normalized);
  persist();
  setScreen("alias");
}

function nextFromQ1() {
  if (!hasAllAnswered(pageQids(0))) return;
  setScreen("q11_20");
}

async function nextFromQ2() {
  if (!hasAllAnswered(pageQids(1))) return;

  const normalized = normalizeAnswers();
  if (!normalized) return;

  state.result = await buildResult(normalized);
  persist();
  setScreen("alias");
}

function aliasNext() {
  setScreen("result");
}

function retry() {
  state.runMode = "manual";
  state.answers = [];
  state.result = null;
  state.scrollByScreen = {};
  persist();
  setScreen("start");
}

function saveResult() {
  // 未定義＝実装しない
}

function render() {
  const root = globalThis.__LOVE_DIAG_ROOT__;
  if (!root) return;

  const ctx = {
    state,
    actions: {
      setScreen,
      setAnswer,
      startManual,
      startRandom,
      nextFromQ1,
      nextFromQ2,
      aliasNext,
      retry,
      saveResult,
    },
  };

  if (state.screen === "title") renderTitle(root, ctx);
  else if (state.screen === "start") renderStart(root, ctx);
  else if (state.screen === "q1_10") renderQ1to10(root, ctx);
  else if (state.screen === "q11_20") renderQ11to20(root, ctx);
  else if (state.screen === "alias") renderAlias(root, ctx);
  else if (state.screen === "result") renderResult(root, ctx);
  else renderTitle(root, ctx);

  restoreScrollForScreen(state.screen);
}

document.addEventListener("scroll", () => {
  setScrollForScreen(state.screen, window.scrollY);
  persist();
}, { passive: true });

document.addEventListener("DOMContentLoaded", () => {
  restore();
  render();
});
