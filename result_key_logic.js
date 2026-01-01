/**
 * result_key_logic.js（ES Modules）
 * 根拠: 別紙「結果文章キー算出_v0」
 *
 * 役割:
 * - 回答配列（長さ20 / 値1..5）から、各フェーズの「結果文章キー（MT-XX等）」を算出して返す
 * - 文章本文や text.js の内容には依存しない（禁止事項に従う）
 *
 * 入力として使う情報:
 * - answers（質問IDごとの回答値）
 * - contrib_table.js が返す debug.tag_totals（寄与表に基づく評価軸スコア集計）
 *
 * 注意:
 * - 本ファイルは「キー算出」だけを担う。文章の選択・生成は行わない。
 */

import { computeAllPhases } from "./contrib_table.js";

const PHASES = ["matching","firstMeet","date","relationship","marriage"];
const PREFIX = {
  matching: "MT",
  firstMeet: "FM",
  date: "DT",
  relationship: "RL",
  marriage: "MR",
};

// ※分岐数は本紙に規定がないため任意（テストで分岐が起きるための本実装用デフォルト）
const PATTERN_COUNT = {
  matching: 25,
  firstMeet: 25,
  date: 12,
  relationship: 12,
  marriage: 8,
};

function clampInt(n, min, max){
  const x = Number.parseInt(n, 10);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, x));
}

function pad2(n){
  return String(n).padStart(2, "0");
}

/**
 * tag_totals[phase] の内容から、フェーズ内パターン番号(1..N)を決める。
 * 判定方式（別紙 5. の範囲で具体化）:
 * - 特定評価軸（タグ）が最も高い（topTag）
 * - top と second の差分
 * - 正負（topTagの符号）
 * を用いて、N個に写像する
 */
function patternIndexFromTagTotals(phaseKey, tagTotals){
  const entries = Object.entries(tagTotals || {}).map(([k,v])=>[k, Number(v||0)]);
  if (!entries.length) return 1;

  // 絶対値で大きい順
  entries.sort((a,b)=>Math.abs(b[1]) - Math.abs(a[1]));

  const [topTag, topVal] = entries[0];
  const secondVal = entries[1]?.[1] ?? 0;

  const signBit = topVal >= 0 ? 1 : 0;
  const diff = Math.abs(topVal) - Math.abs(secondVal);

  // diff bucket (0..2)
  const diffBucket = diff >= 6 ? 2 : (diff >= 2 ? 1 : 0);

  // magnitude bucket (0..2)
  const mag = Math.abs(topVal);
  const magBucket = mag >= 10 ? 2 : (mag >= 4 ? 1 : 0);

  // topTag order index for determinism
  const tagNames = entries.map(([k])=>k).slice().sort();
  const tagIndex = tagNames.indexOf(topTag); // 0..(T-1)

  const N = PATTERN_COUNT[phaseKey] || 8;

  // combine features -> 0..N-1
  const seed = (
    (tagIndex + 1) * 17 +
    signBit * 31 +
    diffBucket * 13 +
    magBucket * 7
  );

  const idx0 = ((seed % N) + N) % N;
  return idx0 + 1;
}

export async function calcResultTextKeys(answers){
  // answers: number[] length 20 (1..5)
  const norm = Array.isArray(answers) ? answers.map(a=>clampInt(a,1,5)) : [];
  const res = await Promise.resolve(computeAllPhases({ answers: norm, meta: {} }));
  const tagTotalsByPhase = (res && res.debug && res.debug.tag_totals) ? res.debug.tag_totals : {};

  const patternKeysByPhase = {};
  const meta = {};

  for (const phaseKey of PHASES){
    const idx = patternIndexFromTagTotals(phaseKey, tagTotalsByPhase[phaseKey] || {});
    const key = `${PREFIX[phaseKey]}-${pad2(idx)}`;
    patternKeysByPhase[phaseKey] = key;
    meta[phaseKey] = {
      idx,
      key,
      top: (() => {
        const e = Object.entries(tagTotalsByPhase[phaseKey] || {}).map(([k,v])=>[k, Number(v||0)]);
        e.sort((a,b)=>Math.abs(b[1]) - Math.abs(a[1]));
        return e[0] ? { axis: e[0][0], value: e[0][1] } : null;
      })(),
    };
  }

  return { patternKeysByPhase, meta };
}
