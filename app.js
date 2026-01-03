// app.js
// 本紙（仕様書_本紙_6th_r2.md）に従属：状態管理・画面遷移・別紙ロジック呼び出し・結果統合のみ
// DOMの直接生成は行わない（ui_*.js が render(root, ctx) で生成する）

import { render as renderTitle } from "./ui_title.js";
import { render as renderStart } from "./ui_start.js";
import { render as renderQ1_10 } from "./ui_questions_1_10.js";
import { render as renderQ11_20 } from "./ui_questions_11_20.js";
import { render as renderAlias } from "./ui_alias.js";
import { render as renderResult } from "./ui_result.js";

import { QUESTIONS } from "./data_questions.js";
import { computeAllPhases } from "./contrib_table.js";
import { calcRarity } from "./rarity_logic.js";
import { calcAlias } from "./alias_logic.js";
import { calcResultKeys } from "./result_key_logic.js";
import { getText } from "./text.js";

const STORAGE_KEY = "love_diagnosis_beta_state_v1"; // 同一タブ内（sessionStorage）

const SCREENS = ["title", "start", "q1_10", "q11_20", "alias", "result"];
const PHASE_ORDER = ["matching", "firstMeet", "date", "relationship", "marriage"];

const SCORE_LABEL = {
  1: "激弱",
  2: "弱",
  3: "普通",
  4: "強",
  5: "激強",
};

function createInitialState() {
  return {
    screen: "title",
    // UI入力: { qid:"Q1".."Q20", v:1..5 } の配列
    answers: [],
    meta: { runMode: "manual" }, // "manual" | "random"
    result: null,               // app.js が統合生成
  };
}

function isValidAnswerValue(v) {
  return Number.isInteger(v) && v >= 1 && v <= 5;
}

function sanitizeQid(qid) {
  if (typeof qid !== "string") return null;
  const m = qid.match(/^Q(\d{1,2})$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 1 || n > 20) return null;
  return `Q${n}`;
}

function setAnswerInState(state, qidRaw, v) {
  const qid = sanitizeQid(qidRaw);
  if (!qid) return;
  if (!isValidAnswerValue(v)) return;

  const idx = state.answers.findIndex(a => a.qid === qid);
  if (idx >= 0) state.answers[idx] = { qid, v };
  else state.answers.push({ qid, v });
}

function isAnsweredRange(state, from, to) {
  for (let i = from; i <= to; i++) {
    const qid = `Q${i}`;
    if (!state.answers.some(a => a.qid === qid)) return false;
  }
  return true;
}

function answersForRange(state, from, to) {
  const out = [];
  for (let i = from; i <= to; i++) {
    const qid = `Q${i}`;
    const found = state.answers.find(a => a.qid === qid);
    if (found) out.push(found);
  }
  return out;
}

function normalizeAnswersInput(answers) {
  // 本紙: {qid,v}[] を Q1..Q20 昇順に並べ、length=20 の number[] に正規化（未回答があれば null）
  const byQid = new Map();
  for (const a of (Array.isArray(answers) ? answers : [])) {
    const qid = sanitizeQid(a?.qid);
    const v = a?.v;
    if (!qid) continue;
    if (!isValidAnswerValue(v)) continue;
    byQid.set(qid, v);
  }
  const out = [];
  for (let i = 1; i <= 20; i++) {
    const qid = `Q${i}`;
    if (!byQid.has(qid)) return null;
    out.push(byQid.get(qid));
  }
  return out;
}

async function sha256HexUpper(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex.toUpperCase();
}

async function makeSaveCode(answersNormalized) {
  // 本紙G-4: answersNormalized を JSON文字列化 → SHA-256 → 先頭10文字（英数字・大文字）
  const json = JSON.stringify(answersNormalized);
  const hexUpper = await sha256HexUpper(json);
  return hexUpper.slice(0, 10);
}

function safePatternKey(patternKeysByPhase, phaseKey) {
  const k = patternKeysByPhase?.[phaseKey];
  return (typeof k === "string" && k.trim() !== "") ? k : null;
}

function safeFirstSceneBullet(sections) {
  const bullets = sections?.scene?.bullets;
  if (!Array.isArray(bullets) || bullets.length === 0) return "";
  return (typeof bullets[0] === "string") ? bullets[0] : "";
}

async function computeResult(answersNormalized) {
  // 本紙: result は app.js が統合生成。別紙は result 全体を返さない。
  const contrib = await computeAllPhases({ answers: answersNormalized });
  const scoreBandByPhase = contrib?.phase_scores ?? null;

  const rarityOut = await calcRarity(answersNormalized);
  const rarity = (typeof rarityOut?.rarity === "string") ? rarityOut.rarity : "";

  const aliasOut = await calcAlias(answersNormalized, rarity);
  const nickname = (typeof aliasOut?.aliasOverall === "string") ? aliasOut.aliasOverall : "";
  const aliasAssetOverall = (typeof aliasOut?.aliasAssetOverall === "string") ? aliasOut.aliasAssetOverall : "";

  const keysOut = await calcResultKeys({ answers: answersNormalized, contrib });
  const patternKeysByPhase = keysOut?.patternKeysByPhase ?? null;

  const phaseTexts = [];
  for (const phaseKey of PHASE_ORDER) {
    const pk = safePatternKey(patternKeysByPhase, phaseKey);
    const patternKeyToUse = pk ?? "_default"; // 本紙: 文章キーのみフォールバック許可（text.js 呼び出し時のみ）
    const sections = getText(phaseKey, patternKeyToUse);
    phaseTexts.push({ phaseKey, patternKey: patternKeyToUse, sections });
  }

  const tableRows = [];
  for (const phaseKey of PHASE_ORDER) {
    const scoreBand = scoreBandByPhase?.[phaseKey];
    const scoreLabel = SCORE_LABEL[scoreBand] ?? "";
    const pt = phaseTexts.find(x => x.phaseKey === phaseKey);
    const note = safeFirstSceneBullet(pt?.sections);
    tableRows.push({ phaseKey, scoreBand, scoreLabel, note });
  }

  const saveCode = await makeSaveCode(answersNormalized);

  return {
    saveCode,
    nickname,
    rarity,
    aliasAssetOverall,
    scoreBandByPhase,
    patternKeysByPhase,
    phaseTexts,
    tableRows,
  };
}

function loadState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    const s = createInitialState();

    const screen = parsed?.screen;
    if (typeof screen === "string" && SCREENS.includes(screen)) s.screen = screen;

    const answers = parsed?.answers;
    if (Array.isArray(answers)) {
      s.answers = answers
        .map(a => ({ qid: sanitizeQid(a?.qid), v: a?.v }))
        .filter(a => a.qid && isValidAnswerValue(a.v));
    }

    const runMode = parsed?.meta?.runMode;
    if (runMode === "manual" || runMode === "random") s.meta.runMode = runMode;

    if (parsed?.result && typeof parsed.result === "object") s.result = parsed.result;

    return s;
  } catch {
    return createInitialState();
  }
}

function saveState(state) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      screen: state.screen,
      answers: state.answers,
      meta: state.meta,
      result: state.result,
    }));
  } catch {
    // ignore
  }
}

function clearAll(state) {
  state.answers = [];
  state.meta = { runMode: "manual" };
  state.result = null;
}

function getQuestionsByQids(qids) {
  // 本紙: 質問データは配列形式。qid/text 欠損は UIで表示してはならない。
  if (!Array.isArray(qids)) return [];
  const want = qids
    .map(q => (typeof q === "string" ? q.trim() : ""))
    .filter(Boolean);

  if (want.length === 0) return [];

  const list = Array.isArray(QUESTIONS) ? QUESTIONS : [];
  const byId = new Map();
  for (const item of list) {
    const qid = sanitizeQid(item?.qid);
    const text = item?.text;
    if (!qid) continue;
    if (typeof text !== "string" || text.trim() === "") continue;
    byId.set(qid, item);
  }

  const out = [];
  for (const qid of want) {
    const k = sanitizeQid(qid);
    if (!k) continue;
    const found = byId.get(k);
    if (found) out.push(found);
  }
  return out;
}

function createActions(state, rerender) {
  return {
    // ui側が必要に応じて質問定義を取得するための補助
    getQuestionsByQids,

    // 汎用遷移（screen は固定文字列のみ）
    go(screen) {
      if (typeof screen !== "string" || !SCREENS.includes(screen)) return;
      state.screen = screen;
      rerender();
    },

    // 本紙: タイトル画面はボタンなし。画面タップで遷移。
    onTitleTap() {
      state.screen = "start";
      rerender();
    },

    // 開始画面
    startManual() {
      state.meta.runMode = "manual";
      state.screen = "q1_10";
      rerender();
    },

    async startRandom() {
      clearAll(state);
      state.meta.runMode = "random";
      for (let i = 1; i <= 20; i++) {
        state.answers.push({ qid: `Q${i}`, v: 1 + Math.floor(Math.random() * 5) });
      }
      const answersNormalized = normalizeAnswersInput(state.answers);
      if (!answersNormalized) return;

      try {
        state.result = await computeResult(answersNormalized);
        state.screen = "alias";
      } catch {
        // 本紙: 補完禁止。算出できない場合は未表示（遷移しない）
      }
      rerender();
    },

    // 質問回答（UIが state を直接書き換えない）
    setAnswer(qid, v) {
      setAnswerInState(state, qid, v);
      state.result = null;
      rerender();
    },

    nextFromQ1_10() {
      if (!isAnsweredRange(state, 1, 10)) return;
      state.screen = "q11_20";
      rerender();
    },

    backToQ1_10() {
      state.screen = "q1_10";
      rerender();
    },

    backToStart() {
      state.screen = "start";
      rerender();
    },

    async finishManual() {
      if (!isAnsweredRange(state, 11, 20)) return;
      state.meta.runMode = "manual";
      const answersNormalized = normalizeAnswersInput(state.answers);
      if (!answersNormalized) return;

      try {
        state.result = await computeResult(answersNormalized);
        state.screen = "alias";
      } catch {
        // 本紙: 補完禁止。算出できない場合は未表示（遷移しない）
      }
      rerender();
    },

    // 本紙: 異名画面はタップで結果へ
    goResultFromAlias() {
      state.screen = "result";
      rerender();
    },

    // 結果画面
    restart() {
      clearAll(state);
      state.screen = "start";
      rerender();
    },

    async copySaveCode() {
      const code = state.result?.saveCode;
      if (typeof code !== "string" || code.trim() === "") return;
      try {
        await navigator.clipboard.writeText(code);
      } catch {
        // ignore
      }
    },
  };
}

function renderScreen(root, state, actions) {
  // app.js はDOM生成を行わず、ui_*.js の render(root, ctx) のみを呼ぶ
  const ctx = { state, actions };

  switch (state.screen) {
    case "title":
      renderTitle(root, ctx);
      return;
    case "start":
      renderStart(root, ctx);
      return;
    case "q1_10":
      ctx.state.pageAnswers = answersForRange(state, 1, 10);
      renderQ1_10(root, ctx);
      return;
    case "q11_20":
      ctx.state.pageAnswers = answersForRange(state, 11, 20);
      renderQ11_20(root, ctx);
      return;
    case "alias":
      renderAlias(root, ctx);
      return;
    case "result":
      renderResult(root, ctx);
      return;
    default:
      state.screen = "title";
      renderTitle(root, ctx);
  }
}

function init() {
  const root = document.getElementById("app");
  if (!root) return;

  const state = loadState();

  let actions;
  const rerender = () => {
    saveState(state);
    renderScreen(root, state, actions);
  };

  actions = createActions(state, rerender);

  // 本紙: 初期化は DOMContentLoaded 後
  rerender();
}

document.addEventListener("DOMContentLoaded", init);
