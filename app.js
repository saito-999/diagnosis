// app.js
// 本紙（仕様書_本紙_6th_r2.md）に従属：統合制御のみ（DOM直接生成は禁止）

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

const STORAGE_KEY = "love_diagnosis_beta_state_v1";

const PHASE_ORDER = ["matching", "firstMeet", "date", "relationship", "marriage"];

const PHASE_LABEL = {
  matching: "出会い（マッチング）",
  firstMeet: "初対面",
  date: "デート",
  relationship: "交際",
  marriage: "結婚",
};

const SCORE_LABEL = {
  1: "激弱",
  2: "弱",
  3: "普通",
  4: "強",
  5: "激強",
};

function createInitialState() {
  return {
    screen: "title", // title / start / q1_10 / q11_20 / alias / result
    answers: [], // { qid: "Q1".."Q20", v: 1..5 }[]
    meta: { runMode: "manual" },
    result: null, // app.js が統合生成
  };
}

function sanitizeQid(qid) {
  if (typeof qid !== "string") return null;
  const m = qid.match(/^Q(\d{1,2})$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 1 || n > 20) return null;
  return `Q${n}`;
}

function normalizeAnswersInput(answers) {
  // UI入力: {qid,v}[] を qid昇順に並べて、number[20] を作る
  const byQid = new Map();
  for (const a of answers) {
    const qid = sanitizeQid(a?.qid);
    const v = a?.v;
    if (!qid) continue;
    if (!Number.isInteger(v) || v < 1 || v > 5) continue;
    byQid.set(qid, v);
  }

  // 未回答が存在する場合は null
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
  // answersNormalized を JSON文字列化 → SHA-256 → 先頭10文字（英数字・大文字）
  const json = JSON.stringify(answersNormalized);
  const hexUpper = await sha256HexUpper(json);
  return hexUpper.slice(0, 10);
}

function safeGetSceneNote(sections) {
  const bullets = sections?.scene?.bullets;
  if (!Array.isArray(bullets)) return "";
  const first = bullets[0];
  return typeof first === "string" ? first : "";
}

function safePatternKey(patternKeysByPhase, phaseKey) {
  const k = patternKeysByPhase?.[phaseKey];
  return typeof k === "string" && k ? k : null;
}

function getTextWithFallback(phaseKey, patternKeyMaybeNull) {
  // 本紙：キー未取得時は _default を text.js 呼び出し時のみ使用
  const keyToUse = patternKeyMaybeNull ?? "_default";
  const sections = getText(phaseKey, keyToUse);
  return { patternKey: keyToUse, sections };
}

async function computeResultFromState(state) {
  const answersNormalized = normalizeAnswersInput(state.answers);
  if (!answersNormalized) {
    throw new Error("未回答が存在するため算出できません。");
  }

  // 1) 寄与表（別紙）
  const contrib = await computeAllPhases({ answers: answersNormalized });

  // 2) スコア（別紙）
  const scoreBandByPhase = contrib?.phase_scores ?? null;

  // 3) レアリティ（別紙）
  const rarityOut = await calcRarity(answersNormalized);
  const rarity =
    typeof rarityOut === "string"
      ? rarityOut
      : (rarityOut?.rarity ?? "");

  // 4) 異名（別紙）
  const aliasOut = await calcAlias(answersNormalized, rarity);
  const nickname = aliasOut?.aliasOverall ?? "";
  const aliasAssetOverall = aliasOut?.aliasAssetOverall ?? "";

  // 5) 結果文章キー（別紙）
  const keysOut = await calcResultKeys({ answers: answersNormalized, contrib });
  const patternKeysByPhase = keysOut?.patternKeysByPhase ?? null;

  // 6) 文章取得（text.js）
  const phaseTexts = [];
  for (const phaseKey of PHASE_ORDER) {
    const pk = safePatternKey(patternKeysByPhase, phaseKey);
    const { patternKey, sections } = getTextWithFallback(phaseKey, pk);
    phaseTexts.push({ phaseKey, patternKey, sections });
  }

  // 7) 結果表用データ（app.js）
  const tableRows = [];
  for (const phaseKey of PHASE_ORDER) {
    const scoreBand = scoreBandByPhase?.[phaseKey];
    const scoreLabel = SCORE_LABEL[scoreBand] ?? "";
    const pt = phaseTexts.find(x => x.phaseKey === phaseKey);
    const note = safeGetSceneNote(pt?.sections);
    tableRows.push({
      phaseKey,
      phaseLabel: PHASE_LABEL[phaseKey] ?? phaseKey,
      scoreBand,
      scoreLabel,
      note,
    });
  }

  // 8) 保存コード（app.js）
  const saveCode = await makeSaveCode(answersNormalized);

  return {
    saveCode,
    nickname,
    aliasAssetOverall,
    rarity,
    scoreBandByPhase,
    patternKeysByPhase,
    phaseTexts,
    tableRows,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    const s = createInitialState();

    const screen = parsed?.screen;
    if (typeof screen === "string") s.screen = screen;

    const answers = parsed?.answers;
    if (Array.isArray(answers)) {
      s.answers = answers
        .map(a => ({ qid: sanitizeQid(a?.qid), v: a?.v }))
        .filter(a => a.qid && Number.isInteger(a.v) && a.v >= 1 && a.v <= 5);
    }

    const runMode = parsed?.meta?.runMode;
    if (runMode === "manual" || runMode === "random") {
      s.meta.runMode = runMode;
    }

    if (parsed?.result && typeof parsed.result === "object") {
      s.result = parsed.result;
    }

    return s;
  } catch {
    return createInitialState();
  }
}

function saveState(state) {
  const payload = {
    screen: state.screen,
    answers: state.answers,
    meta: state.meta,
    result: state.result,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
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

function isAnsweredRange(state, from, to) {
  for (let i = from; i <= to; i++) {
    const qid = `Q${i}`;
    const found = state.answers.find(a => a.qid === qid);
    if (!found) return false;
  }
  return true;
}

function setAnswer(state, qidRaw, v) {
  const qid = sanitizeQid(qidRaw);
  if (!qid) return;
  if (!Number.isInteger(v) || v < 1 || v > 5) return;

  const idx = state.answers.findIndex(a => a.qid === qid);
  if (idx >= 0) state.answers[idx] = { qid, v };
  else state.answers.push({ qid, v });
}

function clearAll(state) {
  state.answers = [];
  state.meta = { runMode: "manual" };
  state.result = null;
}

function createActions(state, rerender) {
  return {
    goTitle() { state.screen = "title"; rerender(); },
    goStart() { state.screen = "start"; rerender(); },
    goQ1_10() { state.screen = "q1_10"; rerender(); },
    goQ11_20() { state.screen = "q11_20"; rerender(); },
    goAlias() { state.screen = "alias"; rerender(); },
    goResult() { state.screen = "result"; rerender(); },
    restart() {
      clearAll(state);
      state.screen = "start";
      rerender();
    },
    setAnswer(qid, v) {
      setAnswer(state, qid, v);
      state.result = null;
      rerender();
    },
    nextFromQ1_10() {
      if (!isAnsweredRange(state, 1, 10)) return;
      state.screen = "q11_20";
      rerender();
    },
    backToStart() { state.screen = "start"; rerender(); },
    backToQ1_10() { state.screen = "q1_10"; rerender(); },

    async finishAndCompute(runMode) {
      if (!isAnsweredRange(state, 11, 20)) return;
      state.meta.runMode = runMode === "random" ? "random" : "manual";
      try {
        state.result = await computeResultFromState(state);
        state.screen = "alias";
      } catch {
        // 算出できない場合は画面遷移しない（未表示）
      }
      rerender();
    },

    async runRandomDiagnosis() {
      // 本紙：ランダムでも同一入力構造・同一評価関数を通す
      clearAll(state);
      state.meta.runMode = "random";
      for (let i = 1; i <= 20; i++) {
        const qid = `Q${i}`;
        const v = 1 + Math.floor(Math.random() * 5);
        state.answers.push({ qid, v });
      }
      try {
        state.result = await computeResultFromState(state);
        state.screen = "alias";
      } catch {
        // ignore
      }
      rerender();
    },

    async copySaveCode() {
      const code = state.result?.saveCode;
      if (typeof code !== "string" || !code) return;
      try {
        await navigator.clipboard.writeText(code);
      } catch {
        // ignore
      }
    },
  };
}

function renderScreen(root, state, actions) {
  const ctx = { state, actions };

  switch (state.screen) {
    case "title":
      renderTitle(root, ctx);
      return;

    case "start":
      renderStart(root, ctx);
      return;

    case "q1_10":
      ctx.state.questions = QUESTIONS;
      ctx.state.pageAnswers = answersForRange(state, 1, 10);
      renderQ1_10(root, ctx);
      return;

    case "q11_20":
      ctx.state.questions = QUESTIONS;
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

  rerender();
}

document.addEventListener("DOMContentLoaded", init);
