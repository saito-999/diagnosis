/**
 * alias_logic.js
 * 役割：回答配列とレアリティを入力として「異名（単一）」を算出する
 * 契約：
 *  - Input :
 *      answers: number[]
 *      rarity: "C"|"U"|"R"|"E"|"M"|"Lg"|"Sg"
 *  - Output:
 *      alias_result: string（日本語の異名）
 *  - レアリティ算出は行わない（rarity_logic.js に従属）
 */

import { ALIAS_DEFINITIONS } from "./異名定義_別紙_v1.js"; // 参照専用想定

/**
 * @param {number[]} answers
 * @param {"C"|"U"|"R"|"E"|"M"|"Lg"|"Sg"} rarity
 * @returns {string}
 */
export function calcAlias(answers, rarity) {
  // ---- 防御 ----
  if (!Array.isArray(answers) || !rarity) {
    return ALIAS_DEFINITIONS?.default ?? "未定義の異名";
  }

  // ---- 任意決定（仕様未定義部） ----
  // ・answers 全体から最も強い分類（距離/温度/感情/空白など）を推定
  // ・同率の場合は rarity による優先度で決定
  const categoryScore = {};

  for (let i = 0; i < answers.length; i++) {
    const v = answers[i];
    const def = ALIAS_DEFINITIONS?.byQuestion?.[i];
    if (!def || !def.category) continue;
    categoryScore[def.category] = (categoryScore[def.category] || 0) + v;
  }

  // 最大スコアの分類を取得
  let topCategory = null;
  let topScore = -Infinity;
  for (const [cat, score] of Object.entries(categoryScore)) {
    if (score > topScore) {
      topScore = score;
      topCategory = cat;
    }
  }

  // 分類が取れなければフォールバック
  if (!topCategory) {
    return ALIAS_DEFINITIONS?.default ?? "未定義の異名";
  }

  // ---- 分類 × レアリティ で最終異名 ----
  // ※異名定義別紙に従う。無ければ安全フォールバック。
  const byCat = ALIAS_DEFINITIONS.byCategory?.[topCategory];
  if (!byCat) {
    return ALIAS_DEFINITIONS?.default ?? "未定義の異名";
  }

  return (
    byCat[rarity] ??
    byCat.default ??
    ALIAS_DEFINITIONS.default ??
    "未定義の異名"
  );
}
