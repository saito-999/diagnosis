// 別紙：結果文章キー算出ロジック（v1準拠）
// - 本モジュールは「結果文章キー（MT-XX / FM-XX / DT-XX / RL-XX / MR-XX）」を一意に算出して返す。
// - 文章本文の選択・生成・加工は行わない（禁止）。
// - 寄与表の数値・係数はここでは定義しない（寄与表に従属）。
// - 入力（answers, contrib）と出力（patternKeysByPhase）は本紙のI/Oに完全一致させる。

const PHASES = ["matching", "firstMeet", "date", "relationship", "marriage"];

// 完全同点（全軸0など）時のフォールバック（別紙：結果文章設計）
const FALLBACK_BY_PHASE = {
  matching: "MT-08",
  firstMeet: "_default",
  date: "DT-08",
  relationship: "RL-08",
  marriage: "MR-01",
};

const MT_PREFIX = "MT";
const DT_PREFIX = "DT";

// RL（3軸：A,B,C）パターン定義（別紙：結果文章設計）
// A=継続コミット, B=摩擦処理, C=期待調整
const RL_TABLE = new Map([
  ["LLL", "RL-01"],
  ["LLH", "RL-02"],
  ["LHL", "RL-03"],
  ["LHH", "RL-04"],
  ["HLL", "RL-05"],
  ["HLH", "RL-06"],
  ["HHL", "RL-07"],
  ["HHH", "RL-08"],
  ["NLN", "RL-09"], // 中 / 低 / 中
  ["NHN", "RL-10"], // 中 / 高 / 中
  ["NNL", "RL-11"], // 中 / 中 / 低
  ["NNH", "RL-12"], // 中 / 中 / 高
]);

/**
 * export function calcResultKeys(input)
 * 入力:
 *   answers: number[] (length=20, 1..5, Q1..Q20)
 *   contrib: ReturnType<computeAllPhases>（任意。debug.tag_totals を含み得る）
 *
 * 出力（必須）:
 *   patternKeysByPhase: {
 *     matching: string,
 *     firstMeet: string,
 *     date: string,
 *     relationship: string,
 *     marriage: string
 *   }
 */
export function calcResultKeys(input) {
  const answers = input?.answers;
  const contrib = input?.contrib;

  // answers の最低限検証（不正でも必ず戻り値を返す：別紙フォールバック規約）
  const answersOk = Array.isArray(answers)
    && answers.length === 20
    && answers.every(v => Number.isInteger(v) && v >= 1 && v <= 5);

  const tagTotals = contrib?.debug?.tag_totals ?? null;

  const patternKeysByPhase = {};
  for (const phase of PHASES) {
    const tagTotalsForPhase = (tagTotals && typeof tagTotals === "object") ? tagTotals[phase] : null;
    patternKeysByPhase[phase] = pickKeyForPhase({
      phase,
      answersOk,
      tagTotalsForPhase,
    });
  }

  return { patternKeysByPhase };
}

function pickKeyForPhase({ phase, answersOk, tagTotalsForPhase }) {
  const fallback = FALLBACK_BY_PHASE[phase] ?? "_default";
  if (!answersOk) return fallback;
  if (!tagTotalsForPhase || typeof tagTotalsForPhase !== "object") return fallback;

  if (phase === "matching") {
    return pickBy4AxisBinary({
      prefix: MT_PREFIX,
      fallback,
      axisOrder: ["A", "B", "C", "D"], // 主体性 / 判断速度 / 距離感 / 観測姿勢（別紙）
      tiebreakAxisPriority: ["A", "B", "C", "D"], // 主体性 → 判断速度 → 距離感 → 観測姿勢
      axisTotals: tagTotalsForPhase,
    });
  }

  if (phase === "date") {
    return pickBy4AxisBinary({
      prefix: DT_PREFIX,
      fallback,
      axisOrder: ["A", "B", "C", "D"], // 主導性 / 深化志向 / 感情表現 / リスク回避（別紙）
      tiebreakAxisPriority: ["B", "A", "C", "D"], // 深化志向 → 主導性 → 感情表現 → リスク回避
      axisTotals: tagTotalsForPhase,
    });
  }

  if (phase === "relationship") {
    return pickBy3AxisTriState({
      fallback,
      axisOrder: ["A", "B", "C"], // 継続 / 摩擦 / 期待（別紙）
      axisTotals: tagTotalsForPhase,
      tiebreakAxisPriority: ["A", "B", "C"], // 継続 → 摩擦 → 期待
    });
  }

  if (phase === "marriage") {
    // 結婚：中立(=0)は低として扱う（別紙）
    return pickBy3AxisBinaryMarriage({
      fallback,
      axisOrder: ["A", "B", "C"], // 覚悟 / 役割 / 共同体（別紙）
      axisTotals: tagTotalsForPhase,
      tiebreakAxisPriority: ["A", "C", "B"], // 覚悟 → 共同体 → 役割
    });
  }

  if (phase === "firstMeet") {
    // 初対面：寄与表に基づく加重平均の具体定義は本モジュールで持たない（寄与表に従属）。
    // contrib 側が FM-01〜FM-07 の集計値を持つ場合のみ、それを最大傾向として採用する。
    // それ以外は text.js のフォールバック（_default）に落とす。
    const candidates = ["FM-01","FM-02","FM-03","FM-04","FM-05","FM-06","FM-07"];
    let best = null;
    let bestAbs = -1;
    for (const k of candidates) {
      const v = tagTotalsForPhase[k];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      const abs = Math.abs(v);
      if (abs > bestAbs) {
        bestAbs = abs;
        best = k;
      }
    }
    if (!best) return fallback;
    if (bestAbs === 0) return fallback;
    return best;
  }

  return fallback;
}

// --- 4軸（高/低/中立）→ 16基本パターン + タイブレーク + フォールバック ---
function pickBy4AxisBinary({ prefix, fallback, axisOrder, tiebreakAxisPriority, axisTotals }) {
  const states = axisOrder.map(a => triState(getAxisTotal(axisTotals, a)));
  if (states.some(s => s === null)) return fallback;

  // 完全同点（全軸0）
  if (states.every(s => s === "N")) return fallback;

  // 候補生成（Nは両方に展開）
  const candidates = expandHL(states); // array of ["H","L",...]
  if (!candidates.length) return fallback;

  if (candidates.length === 1) return prefixNum(prefix, fourAxisToIndex(candidates[0]));

  // タイブレーク（別紙）
  // 1) 寄与が最も強い軸（ここでは |軸合計| 最大）
  // 2) 優先順（別紙）
  const strongestAxes = pickStrongestAxes(axisTotals, axisOrder);
  const priority = (strongestAxes.length ? strongestAxes : []).concat(
    tiebreakAxisPriority.filter(a => !(strongestAxes || []).includes(a))
  );

  let narrowed = candidates;
  for (const axisKey of priority) {
    const idx = axisOrder.indexOf(axisKey);
    if (idx < 0) continue;

    const tot = getAxisTotal(axisTotals, axisKey);
    if (tot === null || tot === 0) continue;

    const want = (tot > 0) ? "H" : "L";
    const next = narrowed.filter(c => c[idx] === want);
    if (next.length) narrowed = next;
    if (narrowed.length === 1) break;
  }

  if (narrowed.length !== 1) return fallback;
  return prefixNum(prefix, fourAxisToIndex(narrowed[0]));
}

function fourAxisToIndex(hl4) {
  // 低=0 / 高=1 として 1..16 に割当（別紙の表と一致）
  const bit = (x) => (x === "H" ? 1 : 0);
  const b0 = bit(hl4[0]);
  const b1 = bit(hl4[1]);
  const b2 = bit(hl4[2]);
  const b3 = bit(hl4[3]);
  return (b0 * 8) + (b1 * 4) + (b2 * 2) + (b3 * 1) + 1;
}

function prefixNum(prefix, n) {
  const num = String(n).padStart(2, "0");
  return `${prefix}-${num}`;
}

// --- 3軸（高/低/中立）→ RL-01..12 ---
function pickBy3AxisTriState({ fallback, axisOrder, axisTotals, tiebreakAxisPriority }) {
  const states = axisOrder.map(a => triState(getAxisTotal(axisTotals, a)));
  if (states.some(s => s === null)) return fallback;

  // 完全同点（全軸0）
  if (states.every(s => s === "N")) return fallback;

  const hit = RL_TABLE.get(states.join(""));
  if (hit) return hit;

  // テーブル外の組は、別紙タイブレーク順でNを解決→8種に寄せる
  let resolved = states.slice();
  for (const axisKey of tiebreakAxisPriority) {
    const idx = axisOrder.indexOf(axisKey);
    if (idx < 0) continue;
    if (resolved[idx] !== "N") continue;

    const tot = getAxisTotal(axisTotals, axisKey);
    if (tot === null || tot === 0) continue;
    resolved[idx] = (tot > 0) ? "H" : "L";
  }

  // 残るNはLへ寄せ（別紙に明記がないため、曖昧解消としてフォールバック優先）
  resolved = resolved.map(s => (s === "N" ? "L" : s));

  return RL_TABLE.get(resolved.join("")) ?? fallback;
}

// --- 3軸（結婚：中立は低）→ MR-01..04 ---
function pickBy3AxisBinaryMarriage({ fallback, axisOrder, axisTotals, tiebreakAxisPriority }) {
  const totals = axisOrder.map(a => getAxisTotal(axisTotals, a));
  if (totals.some(v => v === null)) return fallback;

  const hl = totals.map(v => (v > 0 ? "H" : "L")); // v==0 も L（別紙）
  const key = hl.join("");

  if (key === "HHH") return "MR-01";
  if (key === "HLH") return "MR-02";
  if (key === "LHL") return "MR-03";
  if (key === "LLL") return "MR-04";

  // 念のため：優先軸で近い形へ寄せ
  let resolved = hl.slice();
  for (const axisKey of tiebreakAxisPriority) {
    const idx = axisOrder.indexOf(axisKey);
    if (idx < 0) continue;
    if (totals[idx] > 0) resolved[idx] = "H";
  }
  const k2 = resolved.join("");
  if (k2 === "HHH") return "MR-01";
  if (k2 === "HLH") return "MR-02";
  if (k2 === "LHL") return "MR-03";
  if (k2 === "LLL") return "MR-04";

  return fallback;
}

// --- utilities ---
function getAxisTotal(axisTotals, axisKey) {
  const v = axisTotals?.[axisKey];
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function triState(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v > 0) return "H";
  if (v < 0) return "L";
  return "N";
}

function expandHL(states) {
  let acc = [[]];
  for (const s of states) {
    if (s === "H" || s === "L") {
      acc = acc.map(a => a.concat([s]));
      continue;
    }
    if (s === "N") {
      const next = [];
      for (const a of acc) {
        next.push(a.concat(["L"]));
        next.push(a.concat(["H"]));
      }
      acc = next;
      continue;
    }
    return [];
  }
  return acc;
}

function pickStrongestAxes(axisTotals, axisOrder) {
  let bestAbs = -1;
  let best = [];
  for (const a of axisOrder) {
    const v = getAxisTotal(axisTotals, a);
    if (v === null) continue;
    const abs = Math.abs(v);
    if (abs > bestAbs) {
      bestAbs = abs;
      best = [a];
    } else if (abs === bestAbs) {
      best.push(a);
    }
  }
  if (bestAbs <= 0) return [];
  return best;
}
