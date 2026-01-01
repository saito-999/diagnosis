/**
 * result_key_logic.js（ES Modules）
 * 根拠: 仕様書_別紙_結果文章キー算出_v0
 *
 * 役割:
 * - 質問回答（answers: 1..5）と寄与表（contrib_table.js）に基づき
 *   フェーズ別の「結果文章キー」（例: MT-03）を算出して返す。
 *
 * 重要:
 * - 文章本文には一切触れない（text.js は別責務）
 * - フェーズを跨いだ合算はしない
 * - 寄与表にない質問IDは使わない（contrib_table.js が担保）
 *
 * I/O:
 * - input: { answers:number[] }  // 20問、1..5
 * - output: { patternKeysByPhase: Record<phaseKey,string> }
 *
 * 依存:
 * - contrib_table.js の computeAllPhases() が返す debug.tag_totals を利用し、
 *   「評価軸スコア（フェーズ別）」を元にパターンを決定する。
 *
 * NOTE:
 * - この別紙(v0)は「どう判定するか（どの軸が最も高い、差分、正負偏り等）」の方針のみで
 *   “具体的な” ルールテーブルが未定義のため、
 *   本実装は「評価軸の上位2つ（符号付き）の組み合わせ」から 1..25 を一意に割り当てる。
 *   ルールが固まったら、このファイルの decidePatternNo() を置換する。
 */

import { computeAllPhases } from "./contrib_table.js";

// フェーズキー（本紙と一致）
export const PHASES = ["matching","firstMeet","date","relationship","marriage"];

// 結果文章キーのプレフィックス（結果文章別紙と一致）
const PREFIX_BY_PHASE = {
  matching: "MT",
  firstMeet: "FM",
  date: "DT",
  relationship: "RL",
  marriage: "MR",
};

// フォールバック（結果文章設計別紙のデフォルト想定）
const DEFAULT_KEY_BY_PHASE = {
  matching: "MT-08",
  firstMeet: "FM-05",
  date: "DT-08",
  relationship: "RL-08",
  marriage: "MR-01",
};

function pad2(n){
  const x = Math.max(0, Math.min(99, Number(n)||0));
  return String(x).padStart(2, "0");
}

function safeAnswers(answers){
  const a = Array.isArray(answers) ? answers : [];
  const out = [];
  for (let i=0;i<20;i++){
    const v = Number.parseInt(a[i], 10);
    out.push(Number.isFinite(v) ? Math.min(5, Math.max(1, v)) : 3);
  }
  return out;
}

function sortedAxisEntries(axisTotals){
  const entries = Object.entries(axisTotals || {}).filter(([,v])=>Number.isFinite(v) && v !== 0);
  // 大きい順（絶対値優先→符号付き→キー名）
  entries.sort((a,b)=>{
    const av = Math.abs(a[1]), bv = Math.abs(b[1]);
    if (bv !== av) return bv - av;
    if (b[1] !== a[1]) return b[1] - a[1];
    return String(a[0]).localeCompare(String(b[0]));
  });
  return entries;
}

function decidePatternNo(axisTotals, desiredMax){
  const entries = sortedAxisEntries(axisTotals);
  if (entries.length === 0) return null;

  // 登場軸の固定順（アルファベット）
  const axisOrder = Object.keys(axisTotals || {}).sort((a,b)=>String(a).localeCompare(String(b)));
  const top = entries[0][0];
  const second = (entries[1] ? entries[1][0] : top);

  const i = Math.max(0, axisOrder.indexOf(top));
  const j = Math.max(0, axisOrder.indexOf(second));

  // desiredMax 個に一意化（5*5=25の想定）
  const base = 5;
  const ii = i % base;
  const jj = j % base;
  const no = ii * base + jj + 1;

  const finalNo = ((no - 1) % desiredMax) + 1;
  return finalNo;
}

function patternNoByPhase(phaseKey, axisTotals){
  if (phaseKey === "matching") return decidePatternNo(axisTotals, 25);
  return decidePatternNo(axisTotals, 8);
}

function buildKey(phaseKey, patternNo){
  const prefix = PREFIX_BY_PHASE[phaseKey];
  if (!prefix || !patternNo) return DEFAULT_KEY_BY_PHASE[phaseKey] || "";
  return `${prefix}-${pad2(patternNo)}`;
}

/**
 * フェーズ別の結果文章キーを算出して返す
 * @param {{ answers:number[] }} input
 * @returns {{ patternKeysByPhase: Record<string,string>, debug?: any }}
 */
export async function calcResultKeys(input){
  const answers = safeAnswers(input?.answers);

  const res = await Promise.resolve(computeAllPhases({ answers, meta: { purpose: "resultKey" } }));
  const tagTotalsByPhase = (res && res.debug && res.debug.tag_totals) ? res.debug.tag_totals : {};

  const patternKeysByPhase = {};
  for (const phaseKey of PHASES){
    const axisTotals = tagTotalsByPhase[phaseKey] || {};
    const n = patternNoByPhase(phaseKey, axisTotals);
    patternKeysByPhase[phaseKey] = buildKey(phaseKey, n) || (DEFAULT_KEY_BY_PHASE[phaseKey] || "");
  }

  return { patternKeysByPhase, debug: { tagTotalsByPhase } };
}
