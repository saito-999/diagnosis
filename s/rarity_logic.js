// rarity_logic.js
// 別紙②：レアリティ算出ロジック（LOCKED / 契約）に完全準拠
// - 入力 answers: Array(20) of int 1..5
// - 出力 rarity: "C"|"U"|"R"|"E"|"M"|"Lg"|"Sg"
// - フェーズ別レアリティは存在しない（内部計算はするが出力はoverallのみ）
// 参照：別紙② 仕様（更新日 2025-12-26 JST）

/**
 * @param {number[]} answers Array(20) of int 1..5
 * @returns {Promise<"C"|"U"|"R"|"E"|"M"|"Lg"|"Sg">}
 */
export async function calcRarity(answers) {
  const { rarity } = calcRarityInternal(answers, { withDebug: false });
  return rarity;
}

/**
 * 任意：デバッグ（UI非表示推奨）
 * @param {number[]} answers
 * @returns {Promise<{rarity: string, rarityDebug: object}>}
 */
export async function calcRarityWithDebug(answers) {
  const { rarity, rarityDebug } = calcRarityInternal(answers, { withDebug: true });
  return { rarity, rarityDebug };
}

/* =========================
 * 仕様固定値（LOCKED）
 * ========================= */

// 2-1: 単一設問の基準分布（固定）:contentReference[oaicite:1]{index=1}
const P = { 1: 0.08, 2: 0.22, 3: 0.40, 4: 0.22, 5: 0.08 };

// 4-1: フェーズ重み phase_w_rarity[i][phase] :contentReference[oaicite:2]{index=2}
const PHASES = ["match", "first", "date", "relationship", "marriage"];

const PHASE_W = [
  // Q1..Q20（0-indexで保持）
  { match: 0.7, first: 0.9, date: 0.4, relationship: 0.2, marriage: 0.0 }, // 1
  { match: 0.8, first: 0.8, date: 0.4, relationship: 0.2, marriage: 0.0 }, // 2
  { match: 0.6, first: 0.7, date: 0.6, relationship: 0.3, marriage: 0.1 }, // 3
  { match: 0.5, first: 0.9, date: 0.4, relationship: 0.2, marriage: 0.0 }, // 4
  { match: 0.7, first: 0.8, date: 0.4, relationship: 0.2, marriage: 0.0 }, // 5
  { match: 0.1, first: 0.4, date: 0.8, relationship: 0.7, marriage: 0.6 }, // 6
  { match: 0.0, first: 0.3, date: 0.6, relationship: 0.9, marriage: 0.8 }, // 7
  { match: 0.0, first: 0.2, date: 0.5, relationship: 0.9, marriage: 0.9 }, // 8
  { match: 0.7, first: 0.7, date: 0.5, relationship: 0.2, marriage: 0.0 }, // 9
  { match: 0.0, first: 0.1, date: 0.3, relationship: 0.8, marriage: 1.0 }, // 10
  { match: 0.0, first: 0.1, date: 0.4, relationship: 0.8, marriage: 1.0 }, // 11
  { match: 0.3, first: 0.5, date: 0.5, relationship: 0.5, marriage: 0.4 }, // 12
  { match: 0.0, first: 0.1, date: 0.4, relationship: 0.9, marriage: 1.0 }, // 13
  { match: 0.0, first: 0.1, date: 0.4, relationship: 0.9, marriage: 1.0 }, // 14
  { match: 0.0, first: 0.0, date: 0.3, relationship: 0.9, marriage: 1.0 }, // 15
  { match: 0.0, first: 0.0, date: 0.2, relationship: 0.8, marriage: 1.0 }, // 16
  { match: 0.0, first: 0.0, date: 0.2, relationship: 0.7, marriage: 1.0 }, // 17
  { match: 0.0, first: 0.0, date: 0.2, relationship: 0.8, marriage: 1.0 }, // 18
  { match: 0.0, first: 0.0, date: 0.2, relationship: 0.7, marriage: 1.0 }, // 19
  { match: 0.0, first: 0.1, date: 0.3, relationship: 0.8, marriage: 1.0 }, // 20
];

// 4-2: tags_rarity（coherence用）:contentReference[oaicite:3]{index=3}
const TAGS_RARITY = [
  { PACE_SLOW: 1.0, BOUNDARY: 0.8, READ_REACTION: 0.4 },                // Q1
  { PACE_SLOW: 1.2, READ_REACTION: 0.6, LOSS_FEAR: 0.4 },               // Q2
  { BOUNDARY: 0.8, AMBIG_TOL: 0.8, EDGE_PREFERENCE: 0.4 },              // Q3
  { READ_REACTION: 1.0, HARM_AVOID: 0.6, SELF_OPEN_LOW: 0.6 },          // Q4
  { READ_REACTION: 1.1, TRUST_ACTION: 0.7, PACE_SLOW: 0.5 },            // Q5
  { MOOD_SYNC: 1.0, DEVOTION: 0.7, READ_REACTION: 0.3 },                // Q6
  { AMBIG_TOL: 1.1, BOUNDARY: 0.7, TRUST_ACTION: 0.4 },                 // Q7
  { TRUST_ACTION: 1.0, LONG_TERM: 0.9 },                                // Q8
  { BOUNDARY: 1.0, PACE_SLOW: 0.8, SELF_OPEN_LOW: 0.4 },                // Q9
  { LONG_TERM: 1.1, DEVOTION: 0.8, TRUST_ACTION: 0.4 },                 // Q10
  { AMBIG_TOL: 0.7, DEVOTION: 0.6, LONG_TERM: 0.7 },                    // Q11
  { SELF_OPEN_LOW: 1.1, BOUNDARY: 0.6, READ_REACTION: 0.5 },            // Q12
  { DEVOTION: 1.0, HARM_AVOID: 0.6, LOSS_FEAR: 0.5 },                   // Q13
  { BOUNDARY: 1.0, PACE_SLOW: 0.6, AMBIG_INTOL: 0.6 },                  // Q14
  { LOSS_FEAR: 1.2, AMBIG_INTOL: 1.0, READ_REACTION: 0.4 },             // Q15
  { LOSS_FEAR: 1.4, AMBIG_INTOL: 0.8 },                                 // Q16
  { DEVOTION: 1.1, LONG_TERM: 0.9 },                                    // Q17
  { TRUST_ACTION: 1.0, LONG_TERM: 1.0, DEVOTION: 0.6 },                 // Q18
  { LONG_TERM: 1.2, DEVOTION: 0.9, BOUNDARY: 0.3 },                     // Q19
  { LONG_TERM: 0.8, DEVOTION: 0.8, INITIATIVE: 0.7, EDGE_PREFERENCE: 0.4 } // Q20
];

// 反対タグ写像（coherence用）:contentReference[oaicite:4]{index=4}
const OPP_TAG = {
  PACE_SLOW: "PACE_FAST",
  PACE_FAST: "PACE_SLOW",
  SELF_OPEN_LOW: "SELF_OPEN_HIGH",
  SELF_OPEN_HIGH: "SELF_OPEN_LOW",
  AMBIG_TOL: "AMBIG_INTOL",
  AMBIG_INTOL: "AMBIG_TOL",
};

// 6-3 しきい値 :contentReference[oaicite:5]{index=5}
const TH = {
  C: 0.40,
  U: 0.48,
  R: 0.56,
  E: 0.64,
  M: 0.72,
  Lg: 0.80, // 0.72.. <0.80
  Sg: 0.80, // >=0.80 かつゲート
};

// 7-4 分散閾値（全フェーズ同一除外）:contentReference[oaicite:6]{index=6}
const VARIANCE_SG_FLOOR = 0.0025;

// 6-1 固定値 I1..I3 :contentReference[oaicite:7]{index=7}
const I = {
  1: 2.5257,
  2: 1.5141,
  3: 0.9163,
  4: 1.5141,
  5: 2.5257,
};

const RANK = ["C", "U", "R", "E", "M", "Lg", "Sg"];

/* =========================
 * 実装
 * ========================= */

function calcRarityInternal(answers, { withDebug }) {
  validateAnswers(answers);

  // 5-3 jitter は全フェーズ共通 :contentReference[oaicite:8]{index=8}
  const jitter = calcJitter(answers);

  const phaseScores = {};
  const phaseFactors = {};
  const phaseTiers = {};

  // まず全フェーズの rarity_score_p を算出 :contentReference[oaicite:9]{index=9}
  for (const p of PHASES) {
    const wSum = sumPhaseWeights(p);
    const surprisal = calcSurprisalPhase(answers, p);
    const coherence = calcCoherencePhase(answers, p);
    const neutral = calcNeutralPhase(answers, p, wSum);
    const antiNoise = clamp01(1.0 - 0.7 * neutral - 0.3 * (jitter / 4.0));

    // 6-1 S_norm :contentReference[oaicite:10]{index=10}
    const Smin = wSum * I[3];
    const Smax = wSum * I[1];
    const SNorm = clamp01((surprisal - Smin) / (Smax - Smin));

    // 6-2 rarity_score_p :contentReference[oaicite:11]{index=11}
    const rarityScore =
      0.55 * SNorm +
      0.25 * coherence +
      0.20 * antiNoise;

    phaseScores[p] = rarityScore;
    phaseFactors[p] = { wSum, surprisal, SNorm, coherence, neutral, antiNoise };

    // 一旦、しきい値で段階化（Sgはゲート後）:contentReference[oaicite:12]{index=12}
    phaseTiers[p] = tierFromScore(rarityScore);
  }

  // 7-4 分散でSg剥奪（Sg候補の有無に関わらず判定ロジックは固定）:contentReference[oaicite:13]{index=13}
  const variance = calcVariance(Object.values(phaseScores));
  const varianceLow = variance < VARIANCE_SG_FLOOR;

  // 7: Sgゲート判定（score>=0.80 + edge_balance等）:contentReference[oaicite:14]{index=14}
  for (const p of PHASES) {
    if (phaseScores[p] < TH.Sg) continue;

    const gate = calcSgGate(answers, p, phaseFactors[p].wSum);
    const passes = gate.edgeBalance >= 0.55 && gate.edgeP < 0.70 && gate.edgeDirP < 0.35;

    if (passes) {
      phaseTiers[p] = "Sg";
    } else {
      // score>=0.80でもゲート落ちならLgに留める（0.72.. <0.80 とは別だが、
      // 本書は「Sgは条件満たす場合のみ」なので、ここでは Sg を付与しない）
      // しきい値上は >=0.80 なので tierFromScore は一旦Sg候補扱いするが、ゲート落ち時は Lg へ
      phaseTiers[p] = "Lg";
    }

    // edge_balance等はデバッグ用に保持
    phaseFactors[p].edge = gate;
  }

  // 7-4 低分散ならSgをLgへ :contentReference[oaicite:15]{index=15}
  if (varianceLow) {
    for (const p of PHASES) {
      if (phaseTiers[p] === "Sg") phaseTiers[p] = "Lg";
    }
  }

  // Outputはフェーズ別レアリティ無し → overallのみ :contentReference[oaicite:16]{index=16}
  // overallは「最も高い段階」を採用（内部フェーズ計算を一つに射影）
  const overall = maxTier(Object.values(phaseTiers));

  const rarityDebug = withDebug
    ? {
        inputs: [...answers],
        jitter,
        phaseScores,
        phaseTiers,
        variance,
        varianceLow,
        phaseFactors,
      }
    : undefined;

  return { rarity: overall, rarityDebug };
}

/* =========================
 * 因子計算（LOCKED準拠）
 * ========================= */

// 5-1 surprisal: Σ w * I(answer) :contentReference[oaicite:17]{index=17}
function calcSurprisalPhase(answers, phaseKey) {
  let s = 0;
  for (let i = 0; i < 20; i++) {
    const w = PHASE_W[i][phaseKey] ?? 0;
    if (w === 0) continue;
    const a = answers[i];
    s += w * info(a);
  }
  return s;
}

function info(a) {
  // ここは fixed I を使う（6-1に固定値がある）:contentReference[oaicite:18]{index=18}
  // ただし 5-1の定義は -log(P(a)) :contentReference[oaicite:19]{index=19}
  // Iテーブルも同じ値なので、計算誤差を避けて I を採用する
  return I[a];
}

// 5-2 coherence（上位2タグ）:contentReference[oaicite:20]{index=20}
function calcCoherencePhase(answers, phaseKey) {
  const totals = {}; // tag -> signed total
  for (let i = 0; i < 20; i++) {
    const wPhase = PHASE_W[i][phaseKey] ?? 0;
    if (wPhase === 0) continue;

    const a = answers[i];
    const v = 3 - a; // 内部符号化 :contentReference[oaicite:21]{index=21}
    const tags = TAGS_RARITY[i];

    for (const [tag, wt] of Object.entries(tags)) {
      if (v === 0) continue;

      if (v < 0 && OPP_TAG[tag]) {
        // v<0で反対タグへ写像 :contentReference[oaicite:22]{index=22}
        const t2 = OPP_TAG[tag];
        totals[t2] = (totals[t2] ?? 0) + (-v) * wt * wPhase;
      } else {
        totals[tag] = (totals[tag] ?? 0) + v * wt * wPhase;
      }
    }
  }

  const entries = Object.entries(totals);
  if (entries.length === 0) return 0;

  entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const [topA, valA] = entries[0];
  const [topB, valB] = entries[1] ?? [topA, 0];

  const sumAbs = entries.reduce((acc, [, v]) => acc + Math.abs(v), 0);
  const eps = 1e-9;

  const part1 = 0.5 * (Math.abs(valA) / (sumAbs + eps));
  const part2 = 0.5 * (sign(valA) === sign(valB) ? 1 : 0);

  return clamp01(part1 + part2);
}

function sign(x) {
  // 0は+扱い :contentReference[oaicite:23]{index=23}
  return x >= 0 ? 1 : -1;
}

// 5-3 neutral_p :contentReference[oaicite:24]{index=24}
function calcNeutralPhase(answers, phaseKey, wSum) {
  let neutralW = 0;
  for (let i = 0; i < 20; i++) {
    const w = PHASE_W[i][phaseKey] ?? 0;
    if (w === 0) continue;
    if (answers[i] === 3) neutralW += w;
  }
  return wSum > 0 ? neutralW / wSum : 0;
}

// 5-3 jitter: 平均隣接差 :contentReference[oaicite:25]{index=25}
function calcJitter(answers) {
  let s = 0;
  for (let i = 0; i < 19; i++) {
    s += Math.abs(answers[i + 1] - answers[i]);
  }
  return s / 19;
}

// 5-4 edge_balance / 端率 / 片側偏り :contentReference[oaicite:26]{index=26}
function calcSgGate(answers, phaseKey, wSum) {
  let edgeW = 0;
  let w1 = 0;
  let w5 = 0;

  for (let i = 0; i < 20; i++) {
    const w = PHASE_W[i][phaseKey] ?? 0;
    if (w === 0) continue;
    const a = answers[i];
    if (a === 1 || a === 5) {
      edgeW += w;
      if (a === 1) w1 += w;
      if (a === 5) w5 += w;
    }
  }

  const edgeP = wSum > 0 ? edgeW / wSum : 0;
  const edgeDirP = wSum > 0 ? Math.abs(w1 - w5) / wSum : 0;

  const edgeBalance = 1 - 0.8 * edgeDirP - 0.4 * Math.max(0, edgeP - 0.45);

  return {
    edgeP,
    edgeDirP,
    edgeBalance: clamp01(edgeBalance),
  };
}

/* =========================
 * 段階化 & ユーティリティ
 * ========================= */

function tierFromScore(score) {
  // 6-3 段階しきい値（Sgは別途ゲート）:contentReference[oaicite:27]{index=27}
  if (score < TH.C) return "C";
  if (score < TH.U) return "U";
  if (score < TH.R) return "R";
  if (score < TH.E) return "E";
  if (score < TH.M) return "M";
  if (score < TH.Lg) return "Lg";
  // >=0.80 は「Sg候補」。ゲートで決めるので一旦Lgとして扱い、ゲート通過時にSgへ上げる
  return "Lg";
}

function maxTier(tiers) {
  let best = "C";
  for (const t of tiers) {
    if (RANK.indexOf(t) > RANK.indexOf(best)) best = t;
  }
  return best;
}

function sumPhaseWeights(phaseKey) {
  let s = 0;
  for (let i = 0; i < 20; i++) s += PHASE_W[i][phaseKey] ?? 0;
  return s;
}

function calcVariance(arr) {
  if (!arr.length) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const v = arr.reduce((acc, x) => acc + (x - mean) * (x - mean), 0) / arr.length;
  return v;
}

function clamp01(x) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function validateAnswers(answers) {
  if (!Array.isArray(answers) || answers.length !== 20) {
    throw new Error("answers は Array(20) が必須です。");
  }
  for (let i = 0; i < 20; i++) {
    const a = answers[i];
    if (!(Number.isInteger(a) && a >= 1 && a <= 5)) {
      throw new Error(`answers[${i}] は 1..5 の整数が必須です。`);
    }
  }
}
