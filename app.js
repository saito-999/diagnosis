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

const STORAGE_KEY = "love_diag_beta_v1";

const PHASE_KEYS = ["matching", "firstMeet", "date", "relationship", "marriage"];
const SCORE_LABEL = {
  1: "激弱",
  2: "弱",
  3: "普通",
  4: "強",
  5: "激強",
};

const state = {
  screen: "title", // title | start | q1_10 | q11_20 | alias | result
  runMode: "manual", // manual | random
  answers: [], // [{qid, v}]
  result: null, // 統合 result
  scrollByScreen: {}, // { [screen]: number }
};

function safeParse(jsonStr) {
  try { return JSON.parse(jsonStr); } catch { return null; }
}

function persist() {
  const snapshot = {
    screen: state.screen,
    runMode: state.runMode,
    answers: state.answers,
    result: state.result,
    scrollByScreen: state.scrollByScreen,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {}
}

function restore() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const saved = safeParse(raw);
  if (!saved || typeof saved !== "object") return;
  if (typeof saved.screen === "string") state.screen = saved.screen;
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
  setScrollForScreen(state.screen, window.scrollY);
  state.screen = next;
  persist();
  render();
}

function setAnswer(qid, v) {
  const value = Number(v);
  if (!qid || !(value >= 1 && value <= 5)) return;
  const idx = state.answers.findIndex(a => a && a.qid === qid);
  if (idx === -1) state.answers.push({ qid, v: value });
  else state.answers[idx] = { qid, v: value };
  persist();
}

function isValidQuestion(q) {
  return q && typeof q.qid === "string" && q.qid && typeof q.text === "string" && q.text;
}

function pageQids(page) {
  // page: 0 => Q1..Q10, 1 => Q11..Q20
  const valid = Array.isArray(QUESTIONS) ? QUESTIONS.filter(isValidQuestion) : [];
  const slice = page === 0 ? valid.slice(0, 10) : valid.slice(10, 20);
  return slice.map(q => q.qid);
}

function hasAllAnswered(qids) {
  if (!Array.isArray(qids) || qids.length === 0) return false;
  const set = new Set(state.answers.filter(a => a && a.qid).map(a => a.qid));
  return qids.every(qid => set.has(qid));
}

function normalizeAnswers() {
  // returns number[] length 20 in Q1..Q20 order, or null if incomplete
  const qids = Array.from({ length: 20 }, (_, i) => `Q${i + 1}`);
  const map = new Map();
  for (const a of state.answers) {
    if (!a || typeof a.qid !== "string") continue;
    const v = Number(a.v);
    if (v >= 1 && v <= 5) map.set(a.qid, v);
  }
  if (!qids.every(qid => map.has(qid))) return null;
  return qids.map(qid => map.get(qid));
}

function toBase36AZ09(num) {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let n = num >>> 0;
  let out = "";
  do {
    out = chars[n % 36] + out;
    n = Math.floor(n / 36);
  } while (n > 0);
  return out || "0";
}

function genSaveCode(answersNormalized) {
  // 決定的：answersNormalized を連結してハッシュ化 → A-Z0-9 10桁
  const joined = answersNormalized.join("");
  // sha256 -> take first 8 hex as 32-bit int
  const hex = cryptoHashHex(joined);
  const n = parseInt(hex.slice(0, 8), 16) >>> 0;
  const b36 = toBase36AZ09(n).padStart(10, "0");
  return b36.slice(0, 10);
}

function cryptoHashHex(s) {
  // 同期APIのみで決定的にするため、簡易32bitを併用（ブラウザ互換）
  // FNV-1a 32bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // 8桁hex相当を返す
  return (h >>> 0).toString(16).padStart(8, "0") + "00000000000000000000000000000000";
}

function computeResult(answersNormalized) {
  // 1) contrib（スコア）
  const contrib = computeAllPhases({ answers: answersNormalized });
  const scoreBandByPhase = contrib?.phase_scores;

  // 2) rarity
  const rarityOut = calcRarity(answersNormalized);
  const rarity = rarityOut?.rarity;

  // 3) alias
  const aliasOut = calcAlias(answersNormalized, rarity);
  const nickname = aliasOut?.aliasOverall;
  const aliasAssetOverall = aliasOut?.aliasAssetOverall;

  // 4) pattern keys
  const keysOut = calcResultKeys({ answers: answersNormalized, contrib });
  const patternKeysByPhase = keysOut?.patternKeysByPhase;

  // 5) phase texts (array固定順)
  const phaseTexts = PHASE_KEYS.map(phaseKey => {
    const rawKey = patternKeysByPhase?.[phaseKey];
    const keyForText = (typeof rawKey === "string" && rawKey) ? rawKey : "_default";
    const sections = getText(phaseKey, keyForText);
    return { phaseKey, patternKey: keyForText, sections };
  });

  // 6) tableRows
  const tableRows = PHASE_KEYS.map(phaseKey => {
    const scoreBand = scoreBandByPhase?.[phaseKey];
    const scoreLabel = SCORE_LABEL?.[scoreBand] ?? "";
    const sections = phaseTexts.find(p => p.phaseKey === phaseKey)?.sections;
    const note = (sections?.scene?.bullets && sections.scene.bullets[0]) ? sections.scene.bullets[0] : "";
    return { phaseKey, scoreBand, scoreLabel, note };
  });

  // 7) saveCode
  const saveCode = genSaveCode(answersNormalized);

  const result = {
    saveCode,
    nickname,
    rarity,
    scoreBandByPhase,
    tableRows,
    phaseTexts,
    debug: contrib?.debug,
    // 表示用（異名画像）
    aliasAssetOverall,
  };

  return result;
}

function startManual() {
  state.runMode = "manual";
  persist();
  setScreen("q1_10");
}

function startRandom() {
  state.runMode = "random";
  state.answers = Array.from({ length: 20 }, (_, i) => {
    const qid = `Q${i + 1}`;
    const v = 1 + Math.floor(Math.random() * 5);
    return { qid, v };
  });
  const answersNormalized = normalizeAnswers();
  if (!answersNormalized) return;
  state.result = computeResult(answersNormalized);
  persist();
  setScreen("alias");
}

function goNextFromQ1to10() {
  if (!hasAllAnswered(pageQids(0))) return;
  setScreen("q11_20");
}

function goNextFromQ11to20() {
  if (!hasAllAnswered(pageQids(1))) return;
  const answersNormalized = normalizeAnswers();
  if (!answersNormalized) return;
  state.result = computeResult(answersNormalized);
  persist();
  setScreen("alias");
}

function goAliasNext() {
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
  // 仕様未定義：UI側での保存動作は行わない（通知のみ）
}

function render() {
  const root = document.getElementById("app");
  if (!root) return;
  root.innerHTML = "";

  const ctx = {
    state: {
      screen: state.screen,
      runMode: state.runMode,
      answers: state.answers,
      result: state.result,
    },
    actions: {
      setScreen,
      setAnswer,
      startManual,
      startRandom,
      goNextFromQ1to10,
      goNextFromQ11to20,
      goAliasNext,
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
