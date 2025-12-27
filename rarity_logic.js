/**
 * rarity_logic.js
 * 役割：回答配列から「診断結果としてのレアリティ（単一）」を算出する
 * 契約：
 *  - Input : answers: number[]（長さ20、各要素は仕様書の回答値定義に従う）
 *  - Output: rarity_result: "C"|"U"|"R"|"E"|"M"|"Lg"|"Sg"
 *  - UI/表示は一切扱わない
 */

import { CONTRIB_BY_ID } from "./contrib_table.js";

/**
 * @param {number[]} answers
 * @returns {"C"|"U"|"R"|"E"|"M"|"Lg"|"Sg"}
 */
export function calcRarity(answers) {
  // ---- 防御（仕様外入力でも落ちない） ----
  if (!Array.isArray(answers) || answers.length === 0) {
    return "C";
  }

  // ---- 任意決定（仕様未定義部） ----
  // ・寄与表の tag / invTags を使い、全体の希少性スコアを合算
  // ・最終的に単一レアリティへ写像
  let rarityScore = 0;

  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    const contrib = CONTRIB_BY_ID?.[i];
    if (!contrib) continue;

    // tag寄与（存在すれば加算）
    if (Array.isArray(contrib.tags)) {
      rarityScore += contrib.tags.length * Math.max(0, a);
    }
    // 逆寄与（存在すれば減算）
    if (Array.isArray(contrib.invTags)) {
      rarityScore -= contrib.invTags.length * Math.max(0, a);
    }
  }

  // ---- スコア→レアリティ写像（最小・決定論） ----
  // ※境界は任意決定。仕様書に未規定のため後で調整可能。
  if (rarityScore >= 120) return "Sg";
  if (rarityScore >= 90)  return "Lg";
  if (rarityScore >= 65)  return "M";
  if (rarityScore >= 45)  return "E";
  if (rarityScore >= 30)  return "R";
  if (rarityScore >= 15)  return "U";
  return "C";
}
