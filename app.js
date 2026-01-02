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
import { getText } from "./text.js";
import { calcResultKeys } from "./result_key_logic.js";

const STORAGE_KEY = "love_diagnosis_beta_state_v1";

const PHASE_ORDER = ["matching", "firstMeet", "date", "relationship", "marriage"];
const PHASE_LABEL = {
  matching: "出会い",
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

const SCREEN_RENDERERS = {
  title: renderTitle,
  start: renderStart,
  q1_10: renderQ1_10,
  q11_20: renderQ11_20,
  alias: renderAlias,
  result: renderResult,
};

const initialState = () => ({
  screen: "title",
  answers: [], // { qid, v }
  result: null,
  runMode: "manual",
  scrollByScreen: {}, // { [screen]: number }
});

let state = initialState();

function loadState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    if (!parsed.screen || !(parsed.screen in SCREEN_RENDERERS)) return;
    state = {
      ...initialState(),
      ...parsed,
      scrollByScreen: parsed.scrollByScreen && typeof parsed.scrollByScreen === "object" ? parsed.scrollByScreen : {},
    };
  } catch {
    // ignore
  }
}

function persistState() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function saveScroll() {
  state.scrollByScreen[state.screen] = window.scrollY || 0;
  persistState();
}

function restoreScroll() {
  const y = state.scrollByScreen?.[state.screen];
  if (typeof y === "number") {
    window.scrollTo(0, y);
  } else {
    window.scrollTo(0, 0);
  }
}

function setState(patch) {
  state = { ...state, ...patch };
  persistState();
}

function setAnswer(qid, v) {
  if (!qid) return;
  if (!Number.isInteger(v) || v < 1 || v > 5) return;

  const next = state.answers.slice();
  const idx = next.findIndex(a => a && a.qid === qid);
  if (idx >= 0) next[idx] = { qid, v };
  else next.push({ qid, v });

  setState({ answers: next });
}

function getAnswerValue(qid) {
  const hit = state.answers.find(a => a && a.qid === qid);
  return hit ? hit.v : null;
}

function isAllAnswered(qids) {
  for (const qid of qids) {
    const v = getAnswerValue(qid);
    if (!Number.isInteger(v)) return false;
  }
  return true;
}

function normalizeAnswers() {
  // { qid, v } (20) -> number[20] ordered Q1..Q20
  const map = new Map(state.answers.filter(Boolean).map(a => [a.qid, a.v]));
  const arr = [];
  for (let i = 1; i <= 20; i += 1) {
    const qid = `Q${i}`;
    const v = map.get(qid);
    if (!Number.isInteger(v) || v < 1 || v > 5) return null;
    arr.push(v);
  }
  return arr;
}

async function makeSaveCodeFromAnswersNormalized(answersNormalized) {
  // Spec: answersNormalized を JSON 文字列化 → SHA-256 → 先頭10文字を英数字（大文字）
  // 実装: SHA-256 bytes を BigInt 化 → base36 → 先頭10文字（不足は0埋め）
  const json = JSON.stringify(answersNormalized);
  const bytes = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
  const bi = BigInt("0x" + hex);
  const base36 = bi.toString(36).toUpperCase();
  const padded = base36.padStart(10, "0");
  return padded.slice(0, 10);
}

function getQuestionsByQids(qids) {
  const byId = new Map(Array.isArray(QUESTIONS) ? QUESTIONS.map(q => [q?.qid, q]) : []);
  return qids.map(qid => byId.get(qid)).filter(Boolean);
}

function phaseLabel(phaseKey) {
  return PHASE_LABEL[phaseKey] ?? String(phaseKey ?? "");
}

function getPhaseOrder() {
  return PHASE_ORDER.slice();
}

async function computeResult() {
  const answersNormalized = normalizeAnswers();
  if (!answersNormalized) return null;

  // contrib / scores
  const contrib = computeAllPhases({ answers: answersNormalized });
  const scoreBandByPhase = contrib?.phase_scores ?? null;

  // pattern keys
  const keysOut = calcResultKeys({ answers: answersNormalized, contrib });
  const patternKeysByPhase = keysOut?.patternKeysByPhase ?? null;

  // rarity
  const rarityOut = calcRarity(answersNormalized);
  const rarity = typeof rarityOut === "string" ? rarityOut : (rarityOut?.rarity ?? "");

  // alias (nickname + asset)
  const aliasOut = calcAlias(answersNormalized, rarity);
  const nickname = aliasOut?.aliasOverall ?? "";
  const aliasAssetOverall = aliasOut?.aliasAssetOverall ?? "_default.png";

  // phaseTexts (fixed order)
  const phaseTexts = PHASE_ORDER.map((phaseKey) => {
    const rawKey = patternKeysByPhase?.[phaseKey];
    const keyForText = (typeof rawKey === "string" && rawKey.trim()) ? rawKey.trim() : "_default";
    const textOut = getText(phaseKey, keyForText);
    const sections = textOut?.sections ?? textOut ?? {};
    return { phaseKey, patternKey: keyForText, sections };
  });

  // tableRows
  const tableRows = PHASE_ORDER.map((phaseKey) => {
    const band = scoreBandByPhase?.[phaseKey];
    const scoreBand = Number.isInteger(band) ? band : null;
    const scoreLabel = scoreBand ? (SCORE_LABEL[scoreBand] ?? "") : "";
    const scene = phaseTexts.find(p => p.phaseKey === phaseKey)?.sections?.scene ?? null;
    const note = Array.isArray(scene?.bullets) && scene.bullets.length ? String(scene.bullets[0]) : "";
    return {
      phaseKey,
      phaseLabel: phaseLabel(phaseKey),
      scoreBand: scoreBand ?? null,
      scoreLabel,
      note,
    };
  });

  const saveCode = await makeSaveCodeFromAnswersNormalized(answersNormalized);

  return {
    saveCode,
    nickname,
    aliasAssetOverall,
    rarity,
    scoreBandByPhase: scoreBandByPhase ?? {},
    patternKeysByPhase: patternKeysByPhase ?? {},
    phaseTexts,
    tableRows,
    debug: contrib?.debug ?? undefined,
  };
}

async function runRandom() {
  const answers = [];
  for (let i = 1; i <= 20; i += 1) {
    const qid = `Q${i}`;
    const v = 1 + Math.floor(Math.random() * 5);
    answers.push({ qid, v });
  }
  setState({ answers, runMode: "random" });
  const result = await computeResult();
  setState({ result });
  go("alias");
}

async function computeResultAndGoAlias() {
  const result = await computeResult();
  setState({ result });
  go("alias");
}

function resetToStart() {
  setState({ ...initialState(), screen: "start" });
  render();
}

async function copySaveCode() {
  const code = state?.result?.saveCode ?? "";
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
  } catch {
    // ignore
  }
}

async function saveResult() {
  const r = state?.result;
  if (!r) return;
  const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `result_${r.saveCode || "result"}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function go(screen) {
  if (!(screen in SCREEN_RENDERERS)) return;
  saveScroll();
  setState({ screen });
  render();
}

function render() {
  const root = document.getElementById("app");
  if (!root) return;

  const renderer = SCREEN_RENDERERS[state.screen] ?? renderTitle;

  const ctx = Object.freeze({
    state: Object.freeze(state),
    actions: Object.freeze({
      go,
      setAnswer,
      getAnswerValue,
      isAllAnswered,
      getQuestionsByQids,
      computeResultAndGoAlias,
      runRandom,
      phaseLabel,
      getPhaseOrder,
      resetToStart,
      copySaveCode,
      saveResult,
    }),
  });

  renderer(root, ctx);

  requestAnimationFrame(() => {
    restoreScroll();
    persistState();
  });
}

window.addEventListener("scroll", () => {
  // スクロール位置は画面ごとに保存
  // 高頻度で保存しすぎないよう軽いデバウンス
  if (saveScroll._t) window.clearTimeout(saveScroll._t);
  saveScroll._t = window.setTimeout(() => saveScroll(), 120);
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveScroll();
});

document.addEventListener("DOMContentLoaded", () => {
  loadState();
  render();
});
