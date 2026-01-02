// contrib_table.js
// 出典：仕様書_別紙_寄与表_v5
// - 入力: answers (length=20, 各1..5, Q1..Q20)
// - 正規化: v = 3 - answer
// - 出力契約: { phase_scores: {matching:1..5, firstMeet:1..5, date:1..5, relationship:1..5, marriage:1..5} }
//
// 注意:
// - 本モジュールは寄与表（別紙）を正として集計する。
// - UI/文章キーは責務外（ここでは扱わない）。

const PHASES = ["matching", "firstMeet", "date", "relationship", "marriage"];
const THRESHOLDS = [
  { max: -10, band: 1 },
  { max:  -4, band: 2 },
  // -4 < raw < 4 -> 3
  { max:   3.999999, band: 3 },
  { max:   9.999999, band: 4 },
  { max:  Infinity, band: 5 },
];

const CONTRIBUTIONS = [
  {
    "qid": "Q1",
    "tags": {
      "PACE_SLOW": 1.2,
      "HARM_AVOID": 0.8,
      "BOUNDARY": 0.6
    },
    "phase_w": {
      "matching": 0.4,
      "firstMeet": 1.0,
      "date": 0.6,
      "relationship": 0.2,
      "marriage": 0.1
    },
    "polarity": "+"
  },
  {
    "qid": "Q2",
    "tags": {
      "PACE_SLOW": 1.5,
      "READ_REACTION": 0.8,
      "LOSS_FEAR": 0.4
    },
    "phase_w": {
      "matching": 0.7,
      "firstMeet": 1.0,
      "date": 0.6,
      "relationship": 0.3,
      "marriage": 0.1
    },
    "polarity": "+"
  },
  {
    "qid": "Q3",
    "tags": {
      "BOUNDARY": 1.0,
      "AMBIG_TOL": 0.8,
      "EDGE_PREFERENCE": 0.4
    },
    "phase_w": {
      "matching": 0.3,
      "firstMeet": 0.8,
      "date": 0.8,
      "relationship": 0.4,
      "marriage": 0.2
    },
    "polarity": "+"
  },
  {
    "qid": "Q4",
    "tags": {
      "HARM_AVOID": 0.9,
      "READ_REACTION": 1.0,
      "SELF_OPEN_LOW": 0.6
    },
    "phase_w": {
      "matching": 0.4,
      "firstMeet": 1.0,
      "date": 0.6,
      "relationship": 0.3,
      "marriage": 0.2
    },
    "polarity": "+"
  },
  {
    "qid": "Q5",
    "tags": {
      "READ_REACTION": 1.2,
      "TRUST_ACTION": 0.6,
      "PACE_SLOW": 0.7
    },
    "phase_w": {
      "matching": 0.8,
      "firstMeet": 0.9,
      "date": 0.5,
      "relationship": 0.3,
      "marriage": 0.2
    },
    "polarity": "+"
  },
  {
    "qid": "Q6",
    "tags": {
      "MOOD_SYNC": 1.1,
      "DEVOTION": 0.7,
      "READ_REACTION": 0.4
    },
    "phase_w": {
      "matching": 0.2,
      "firstMeet": 0.6,
      "date": 0.9,
      "relationship": 0.7,
      "marriage": 0.6
    },
    "polarity": "+"
  },
  {
    "qid": "Q7",
    "tags": {
      "AMBIG_TOL": 1.4,
      "BOUNDARY": 0.7,
      "TRUST_ACTION": 0.3
    },
    "phase_w": {
      "matching": 0.2,
      "firstMeet": 0.7,
      "date": 0.7,
      "relationship": 0.8,
      "marriage": 0.7
    },
    "polarity": "+"
  },
  {
    "qid": "Q8",
    "tags": {
      "TRUST_ACTION": 1.6,
      "LONG_TERM": 0.5
    },
    "phase_w": {
      "matching": 0.3,
      "firstMeet": 0.5,
      "date": 0.8,
      "relationship": 0.9,
      "marriage": 0.9
    },
    "polarity": "+"
  },
  {
    "qid": "Q9",
    "tags": {
      "BOUNDARY": 1.3,
      "PACE_SLOW": 1.0,
      "AMBIG_TOL": 0.3
    },
    "phase_w": {
      "matching": 0.7,
      "firstMeet": 0.9,
      "date": 0.6,
      "relationship": 0.4,
      "marriage": 0.2
    },
    "polarity": "+"
  },
  {
    "qid": "Q10",
    "tags": {
      "LONG_TERM": 1.4,
      "DEVOTION": 0.8,
      "TRUST_ACTION": 0.4
    },
    "phase_w": {
      "matching": 0.2,
      "firstMeet": 0.4,
      "date": 0.6,
      "relationship": 0.9,
      "marriage": 1.0
    },
    "polarity": "+"
  },
  {
    "qid": "Q11",
    "tags": {
      "AMBIG_TOL": 0.8,
      "DEVOTION": 0.6,
      "LONG_TERM": 0.6
    },
    "phase_w": {
      "matching": 0.1,
      "firstMeet": 0.3,
      "date": 0.7,
      "relationship": 0.8,
      "marriage": 0.8
    },
    "polarity": "+"
  },
  {
    "qid": "Q12",
    "tags": {
      "SELF_OPEN_LOW": 1.6,
      "BOUNDARY": 0.6,
      "READ_REACTION": 0.5
    },
    "phase_w": {
      "matching": 0.5,
      "firstMeet": 0.8,
      "date": 0.7,
      "relationship": 0.6,
      "marriage": 0.4
    },
    "polarity": "+"
  },
  {
    "qid": "Q13",
    "tags": {
      "DEVOTION": 1.3,
      "HARM_AVOID": 0.6,
      "LOSS_FEAR": 0.4
    },
    "phase_w": {
      "matching": 0.2,
      "firstMeet": 0.3,
      "date": 0.7,
      "relationship": 0.9,
      "marriage": 0.8
    },
    "polarity": "+"
  },
  {
    "qid": "Q14",
    "tags": {
      "BOUNDARY": 1.2,
      "PACE_SLOW": 0.7,
      "AMBIG_INTOL": 0.4
    },
    "phase_w": {
      "matching": 0.2,
      "firstMeet": 0.4,
      "date": 0.7,
      "relationship": 0.9,
      "marriage": 0.8
    },
    "polarity": "+"
  },
  {
    "qid": "Q15",
    "tags": {
      "LOSS_FEAR": 1.6,
      "AMBIG_INTOL": 0.9,
      "READ_REACTION": 0.4
    },
    "phase_w": {
      "matching": 0.1,
      "firstMeet": 0.3,
      "date": 0.6,
      "relationship": 1.0,
      "marriage": 0.9
    },
    "polarity": "+"
  },
  {
    "qid": "Q16",
    "tags": {
      "LOSS_FEAR": 1.8,
      "AMBIG_INTOL": 0.6
    },
    "phase_w": {
      "matching": 0.0,
      "firstMeet": 0.1,
      "date": 0.4,
      "relationship": 0.9,
      "marriage": 1.0
    },
    "polarity": "+"
  },
  {
    "qid": "Q17",
    "tags": {
      "DEVOTION": 1.6,
      "LONG_TERM": 0.7
    },
    "phase_w": {
      "matching": 0.1,
      "firstMeet": 0.2,
      "date": 0.5,
      "relationship": 0.8,
      "marriage": 0.9
    },
    "polarity": "+"
  },
  {
    "qid": "Q18",
    "tags": {
      "TRUST_ACTION": 1.0,
      "LONG_TERM": 1.0,
      "DEVOTION": 0.6
    },
    "phase_w": {
      "matching": 0.1,
      "firstMeet": 0.3,
      "date": 0.6,
      "relationship": 0.9,
      "marriage": 1.0
    },
    "polarity": "+"
  },
  {
    "qid": "Q19",
    "tags": {
      "LONG_TERM": 1.6,
      "DEVOTION": 0.8,
      "BOUNDARY": 0.3
    },
    "phase_w": {
      "matching": 0.1,
      "firstMeet": 0.2,
      "date": 0.5,
      "relationship": 0.9,
      "marriage": 1.0
    },
    "polarity": "+"
  },
  {
    "qid": "Q20",
    "tags": {
      "LONG_TERM": 0.8,
      "DEVOTION": 0.8,
      "INITIATIVE": 0.6,
      "EDGE_PREFERENCE": 0.4
    },
    "phase_w": {
      "matching": 0.2,
      "firstMeet": 0.4,
      "date": 0.7,
      "relationship": 0.9,
      "marriage": 1.0
    },
    "polarity": "+"
  }
];

function clampInt(n, min, max) {
  const x = parseInt(n, 10);
  if (Number.isNaN(x)) return min;
  return Math.min(max, Math.max(min, x));
}

function bandFromRaw(raw) {
  for (const t of THRESHOLDS) {
    if (raw <= t.max) return t.band;
  }
  return 3;
}

export function computeAllPhases({ answers }) {
  const a = Array.isArray(answers) ? answers : [];
  const answersNorm = Array.from({ length: 20 }, (_, i) => clampInt(a[i], 1, 5));

  // v = 3 - answer（別紙定義）
  const v = answersNorm.map(x => 3 - x);

  const phase_raw = Object.fromEntries(PHASES.map(p => [p, 0]));

  for (const item of CONTRIBUTIONS) {
    const qi = parseInt(String(item.qid).slice(1), 10) - 1;
    const vv = v[qi] ?? 0;

    // polarity: + はそのまま、- は符号反転
    const pol = item.polarity === "-" ? -1 : 1;

    // フェーズ raw は「v * Σtag_weight * phase_w」を足し込む（別紙 7-2/7-3 の用途向け）
    const tagSum = Object.values(item.tags || {}).reduce((acc, x) => acc + Number(x || 0), 0);

    for (const [phase, pw] of Object.entries(item.phase_w || {})) {
      if (!phase_raw.hasOwnProperty(phase)) continue;
      const add = vv * pol * tagSum * Number(pw || 0);
      phase_raw[phase] += add;
    }
  }

  const phase_scores = Object.fromEntries(PHASES.map(p => [p, bandFromRaw(phase_raw[p])]));

  return {
    phase_scores,
    debug: {
      phase_raw,
      vByQuestion: v,
    },
  };
}
