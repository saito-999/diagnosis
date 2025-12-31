// contrib_table.js（ES Modules）
// 役割：寄与表（LOCKED）に基づき、answers[20] から phase_scores を算出して返す。
// 注意：文章キー（MT-XX等）は扱わない。UI/文章側の責務ではない。

const PHASE_KEYS = ["matching", "firstMeet", "date", "relationship", "marriage"];

// 寄与表（Q1〜Q20）から抽出（tags と phase_w のみ使用）
const CONTRIBUTIONS = [
  {
    "qid": "Q1",
    "tags": { "PACE_SLOW": 1.2, "HARM_AVOID": 0.8, "BOUNDARY": 0.6 },
    "phase_w": { "matching": 0.4, "firstMeet": 1.0, "date": 0.6, "relationship": 0.2, "marriage": 0.1 }
  },
  {
    "qid": "Q2",
    "tags": { "PACE_SLOW": 1.5, "READ_REACTION": 0.8, "LOSS_FEAR": 0.4 },
    "phase_w": { "matching": 0.7, "firstMeet": 1.0, "date": 0.6, "relationship": 0.3, "marriage": 0.1 }
  },
  {
    "qid": "Q3",
    "tags": { "BOUNDARY": 1.0, "AMBIG_TOL": 0.8, "EDGE_PREFERENCE": 0.4 },
    "phase_w": { "matching": 0.3, "firstMeet": 0.8, "date": 0.8, "relationship": 0.4, "marriage": 0.2 }
  },
  {
    "qid": "Q4",
    "tags": { "HARM_AVOID": 0.9, "READ_REACTION": 1.0, "SELF_OPEN_LOW": 0.6 },
    "phase_w": { "matching": 0.4, "firstMeet": 1.0, "date": 0.6, "relationship": 0.3, "marriage": 0.2 }
  },
  {
    "qid": "Q5",
    "tags": { "READ_REACTION": 1.2, "TRUST_ACTION": 0.6, "PACE_SLOW": 0.7 },
    "phase_w": { "matching": 0.8, "firstMeet": 0.9, "date": 0.5, "relationship": 0.3, "marriage": 0.2 }
  },
  {
    "qid": "Q6",
    "tags": { "MOOD_SYNC": 1.1, "DEVOTION": 0.7, "READ_REACTION": 0.4 },
    "phase_w": { "matching": 0.2, "firstMeet": 0.6, "date": 0.9, "relationship": 0.7, "marriage": 0.6 }
  },
  {
    "qid": "Q7",
    "tags": { "AMBIG_TOL": 1.4, "BOUNDARY": 0.7, "TRUST_ACTION": 0.3 },
    "phase_w": { "matching": 0.2, "firstMeet": 0.7, "date": 0.7, "relationship": 0.8, "marriage": 0.7 }
  },
  {
    "qid": "Q8",
    "tags": { "TRUST_ACTION": 1.6, "LONG_TERM": 0.5 },
    "phase_w": { "matching": 0.3, "firstMeet": 0.5, "date": 0.8, "relationship": 0.9, "marriage": 0.9 }
  },
  {
    "qid": "Q9",
    "tags": { "BOUNDARY": 1.3, "PACE_SLOW": 1.0, "AMBIG_TOL": 0.3 },
    "phase_w": { "matching": 0.7, "firstMeet": 0.9, "date": 0.6, "relationship": 0.4, "marriage": 0.2 }
  },
  {
    "qid": "Q10",
    "tags": { "LONG_TERM": 1.4, "DEVOTION": 0.8, "TRUST_ACTION": 0.4 },
    "phase_w": { "matching": 0.2, "firstMeet": 0.4, "date": 0.6, "relationship": 0.9, "marriage": 1.0 }
  },
  {
    "qid": "Q11",
    "tags": { "AMBIG_TOL": 0.8, "DEVOTION": 0.6, "LONG_TERM": 0.6 },
    "phase_w": { "matching": 0.1, "firstMeet": 0.3, "date": 0.7, "relationship": 0.8, "marriage": 0.8 }
  },
  {
    "qid": "Q12",
    "tags": { "SELF_OPEN_LOW": 1.6, "BOUNDARY": 0.6, "READ_REACTION": 0.5 },
    "phase_w": { "matching": 0.5, "firstMeet": 0.8, "date": 0.7, "relationship": 0.6, "marriage": 0.4 }
  },
  {
    "qid": "Q13",
    "tags": { "DEVOTION": 1.3, "HARM_AVOID": 0.6, "LOSS_FEAR": 0.4 },
    "phase_w": { "matching": 0.2, "firstMeet": 0.3, "date": 0.7, "relationship": 0.9, "marriage": 0.8 }
  },
  {
    "qid": "Q14",
    "tags": { "BOUNDARY": 1.2, "PACE_SLOW": 0.7, "AMBIG_INTOL": 0.4 },
    "phase_w": { "matching": 0.2, "firstMeet": 0.4, "date": 0.7, "relationship": 0.9, "marriage": 0.8 }
  },
  {
    "qid": "Q15",
    "tags": { "LOSS_FEAR": 1.6, "AMBIG_INTOL": 0.9, "READ_REACTION": 0.4 },
    "phase_w": { "matching": 0.1, "firstMeet": 0.3, "date": 0.6, "relationship": 1.0, "marriage": 0.9 }
  },
  {
    "qid": "Q16",
    "tags": { "LOSS_FEAR": 1.8, "AMBIG_INTOL": 0.6 },
    "phase_w": { "matching": 0.0, "firstMeet": 0.1, "date": 0.4, "relationship": 0.9, "marriage": 1.0 }
  },
  {
    "qid": "Q17",
    "tags": { "DEVOTION": 1.6, "LONG_TERM": 0.7 },
    "phase_w": { "matching": 0.1, "firstMeet": 0.2, "date": 0.5, "relationship": 0.8, "marriage": 0.9 }
  },
  {
    "qid": "Q18",
    "tags": { "TRUST_ACTION": 1.0, "LONG_TERM": 1.0, "DEVOTION": 0.6 },
    "phase_w": { "matching": 0.1, "firstMeet": 0.3, "date": 0.6, "relationship": 0.9, "marriage": 1.0 }
  },
  {
    "qid": "Q19",
    "tags": { "LONG_TERM": 1.6, "DEVOTION": 0.8, "BOUNDARY": 0.3 },
    "phase_w": { "matching": 0.1, "firstMeet": 0.2, "date": 0.5, "relationship": 0.9, "marriage": 1.0 }
  },
  {
    "qid": "Q20",
    "tags": { "LONG_TERM": 0.8, "DEVOTION": 0.8, "INITIATIVE": 0.6, "EDGE_PREFERENCE": 0.4 },
    "phase_w": { "matching": 0.2, "firstMeet": 0.4, "date": 0.7, "relationship": 0.9, "marriage": 1.0 }
  }
];

function clampAnswer(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 3;
  if (n < 1) return 1;
  if (n > 5) return 5;
  return Math.trunc(n);
}

function scoreBandFromRaw(raw) {
  // しきい値（固定）
  if (raw <= -10) return 1;
  if (raw <= -4) return 2;
  if (raw < 4) return 3;
  if (raw < 10) return 4;
  return 5;
}

/**
 * 主要I/F
 * @param {{answers:number[], meta?:any}} input
 * @returns {{phase_scores:Object, debug?:Object}}
 */
export function computeAllPhases(input) {
  const answers = Array.isArray(input?.answers) ? input.answers : [];
  if (answers.length !== 20) {
    throw new Error("computeAllPhases: answers は length=20 の配列である必要があります");
  }

  const phase_raw = Object.fromEntries(PHASE_KEYS.map(k => [k, 0]));
  // debug用（任意）
  const tag_totals = Object.fromEntries(
    PHASE_KEYS.map(p => [p, {}])
  );

  for (let i = 0; i < 20; i++) {
    const ans = clampAnswer(answers[i]); // 1..5
    const v = 3 - ans; // 寄与表の数値化（固定）

    const c = CONTRIBUTIONS[i];
    const sumTagW = Object.values(c.tags).reduce((a, b) => a + b, 0);

    for (const phaseKey of PHASE_KEYS) {
      const pw = Number(c.phase_w?.[phaseKey] ?? 0);
      const add = v * sumTagW * pw;
      phase_raw[phaseKey] += add;

      // tag_totals（フェーズ別）
      for (const [tag, w] of Object.entries(c.tags)) {
        const cur = tag_totals[phaseKey][tag] ?? 0;
        tag_totals[phaseKey][tag] = cur + (v * Number(w) * pw);
      }
    }
  }

  const phase_scores = Object.fromEntries(
    PHASE_KEYS.map(k => [k, scoreBandFromRaw(phase_raw[k])])
  );

  // 契約：phase_scores は必須
  return {
    phase_scores,
    // UI側互換（必要なら使えるように同値を入れておく）
    scoreBandByPhase: phase_scores,
    debug: {
      phase_raw,
      tag_totals
    }
  };
}
