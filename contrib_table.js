// contrib_table.js（ES Modules）
// 別紙：寄与表_v5 に基づく「フェーズ別スコア（1..5）」算出のみ。
// 文章結果キー（MT-XX 等）は扱わない。

const PHASE_KEYS = ["matching", "firstMeet", "date", "relationship", "marriage"];

/**
 * 寄与表（Q1〜Q20）
 * - tags: {tag_id: weight}（この実装では phase_raw 算出に「重み合計」を使用）
 * - phase_w: {phase_id: weight}
 */
const CONTRIBUTIONS = [
  // Q1
  {
    qid: "Q1",
    tags: { PACE_SLOW: 1.2, HARM_AVOID: 0.8, BOUNDARY: 0.6 },
    phase_w: { matching: 0.4, firstMeet: 1.0, date: 0.6, relationship: 0.2, marriage: 0.1 },
  },
  // Q2
  {
    qid: "Q2",
    tags: { PACE_SLOW: 1.5, READ_REACTION: 0.8, LOSS_FEAR: 0.4 },
    phase_w: { matching: 0.7, firstMeet: 1.0, date: 0.6, relationship: 0.3, marriage: 0.1 },
  },
  // Q3
  {
    qid: "Q3",
    tags: { BOUNDARY: 1.0, AMBIG_TOL: 0.8, EDGE_PREFERENCE: 0.4 },
    phase_w: { matching: 0.3, firstMeet: 0.8, date: 0.8, relationship: 0.4, marriage: 0.2 },
  },
  // Q4
  {
    qid: "Q4",
    tags: { HARM_AVOID: 0.9, READ_REACTION: 1.0, SELF_OPEN_LOW: 0.6 },
    phase_w: { matching: 0.4, firstMeet: 1.0, date: 0.6, relationship: 0.3, marriage: 0.2 },
  },
  // Q5
  {
    qid: "Q5",
    tags: { READ_REACTION: 1.2, TRUST_ACTION: 0.6, PACE_SLOW: 0.7 },
    phase_w: { matching: 0.8, firstMeet: 0.9, date: 0.5, relationship: 0.3, marriage: 0.2 },
  },
  // Q6
  {
    qid: "Q6",
    tags: { MOOD_SYNC: 1.1, DEVOTION: 0.7, READ_REACTION: 0.4 },
    phase_w: { matching: 0.2, firstMeet: 0.6, date: 0.9, relationship: 0.7, marriage: 0.6 },
  },
  // Q7
  {
    qid: "Q7",
    tags: { AMBIG_TOL: 1.4, BOUNDARY: 0.7, TRUST_ACTION: 0.3 },
    phase_w: { matching: 0.2, firstMeet: 0.7, date: 0.7, relationship: 0.8, marriage: 0.7 },
  },
  // Q8
  {
    qid: "Q8",
    tags: { TRUST_ACTION: 1.6, LONG_TERM: 0.5 },
    phase_w: { matching: 0.3, firstMeet: 0.5, date: 0.8, relationship: 0.9, marriage: 0.9 },
  },
  // Q9
  {
    qid: "Q9",
    tags: { BOUNDARY: 1.3, PACE_SLOW: 1.0, AMBIG_TOL: 0.3 },
    phase_w: { matching: 0.7, firstMeet: 0.9, date: 0.6, relationship: 0.4, marriage: 0.2 },
  },
  // Q10
  {
    qid: "Q10",
    tags: { LONG_TERM: 1.4, DEVOTION: 0.8, TRUST_ACTION: 0.4 },
    phase_w: { matching: 0.2, firstMeet: 0.4, date: 0.6, relationship: 0.9, marriage: 1.0 },
  },
  // Q11
  {
    qid: "Q11",
    tags: { AMBIG_TOL: 0.8, DEVOTION: 0.6, LONG_TERM: 0.6 },
    phase_w: { matching: 0.1, firstMeet: 0.3, date: 0.7, relationship: 0.8, marriage: 0.8 },
  },
  // Q12
  {
    qid: "Q12",
    tags: { SELF_OPEN_LOW: 1.6, BOUNDARY: 0.6, READ_REACTION: 0.5 },
    phase_w: { matching: 0.5, firstMeet: 0.8, date: 0.7, relationship: 0.6, marriage: 0.4 },
  },
  // Q13
  {
    qid: "Q13",
    tags: { DEVOTION: 1.3, HARM_AVOID: 0.6, LOSS_FEAR: 0.4 },
    phase_w: { matching: 0.2, firstMeet: 0.3, date: 0.7, relationship: 0.9, marriage: 0.8 },
  },
  // Q14
  {
    qid: "Q14",
    tags: { BOUNDARY: 1.2, PACE_SLOW: 0.7, AMBIG_INTOL: 0.4 },
    phase_w: { matching: 0.2, firstMeet: 0.4, date: 0.7, relationship: 0.9, marriage: 0.8 },
  },
  // Q15
  {
    qid: "Q15",
    tags: { LOSS_FEAR: 1.6, AMBIG_INTOL: 0.9, READ_REACTION: 0.4 },
    phase_w: { matching: 0.1, firstMeet: 0.3, date: 0.6, relationship: 1.0, marriage: 0.9 },
  },
  // Q16
  {
    qid: "Q16",
    tags: { LOSS_FEAR: 1.8, AMBIG_INTOL: 0.6 },
    phase_w: { matching: 0.0, firstMeet: 0.1, date: 0.4, relationship: 0.9, marriage: 1.0 },
  },
  // Q17
  {
    qid: "Q17",
    tags: { DEVOTION: 1.6, LONG_TERM: 0.7 },
    phase_w: { matching: 0.1, firstMeet: 0.2, date: 0.5, relationship: 0.8, marriage: 0.9 },
  },
  // Q18
  {
    qid: "Q18",
    tags: { TRUST_ACTION: 1.0, LONG_TERM: 1.0, DEVOTION: 0.6 },
    phase_w: { matching: 0.1, firstMeet: 0.3, date: 0.6, relationship: 0.9, marriage: 1.0 },
  },
  // Q19
  {
    qid: "Q19",
    tags: { LONG_TERM: 1.6, DEVOTION: 0.8, BOUNDARY: 0.3 },
    phase_w: { matching: 0.1, firstMeet: 0.2, date: 0.5, relationship: 0.9, marriage: 1.0 },
  },
  // Q20
  {
    qid: "Q20",
    tags: { LONG_TERM: 0.8, DEVOTION: 0.8, INITIATIVE: 0.6, EDGE_PREFERENCE: 0.4 },
    phase_w: { matching: 0.2, firstMeet: 0.4, date: 0.7, relationship: 0.9, marriage: 1.0 },
  },
];

function clampInt(n, min, max) {
  const x = Number.parseInt(n, 10);
  if (Number.isNaN(x)) return min;
  return Math.min(max, Math.max(min, x));
}

function scoreBandFromRaw(raw) {
  // しきい値固定（寄与表_v5）
  if (raw <= -10) return 1;
  if (raw <= -4) return 2;
  if (raw < 4) return 3;
  if (raw < 10) return 4;
  return 5;
}

/**
 * 本紙/コードが受け取る形式：phase_scores は必須（寄与表_v5の出力契約）
 * input: { answers: number[20], meta?: any }
 * return: { phase_scores: {matching..marriage:1..5}, debug?: {...} }
 */
export function computeAllPhases(input) {
  const answers = Array.isArray(input?.answers) ? input.answers : [];
  if (answers.length !== 20) {
    throw new Error("contrib_table.js: answers must be length=20 (1..5).");
  }

  const phase_raw = Object.fromEntries(PHASE_KEYS.map((k) => [k, 0]));

  // 集計（寄与表_v5：v = 3 - answer）
  for (let i = 0; i < 20; i++) {
    const answer = clampInt(answers[i], 1, 5);
    const v = 3 - answer; // 1→+2, 2→+1, 3→0, 4→-1, 5→-2

    const c = CONTRIBUTIONS[i];
    const tagSum = Object.values(c.tags).reduce((a, b) => a + Number(b || 0), 0);

    for (const phaseKey of PHASE_KEYS) {
      const pw = Number(c.phase_w?.[phaseKey] ?? 0);
      phase_raw[phaseKey] += v * tagSum * pw;
    }
  }

  const phase_scores = {};
  for (const k of PHASE_KEYS) {
    phase_scores[k] = scoreBandFromRaw(phase_raw[k]);
  }

  return {
    phase_scores,
    debug: {
      phase_raw,
    },
  };
}

// 互換（呼び方が違う実装がいても壊れないように）
// ただし契約の正は computeAllPhases()
export function computePhaseScores(input) {
  return computeAllPhases(input);
}
