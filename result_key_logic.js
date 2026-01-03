// result_key_logic.js
// 別紙：結果文章キー算出_v5 / 寄与表_v5 に完全従属
// 本ファイルは「結果文章キーの算出のみ」を行う

const PHASES = ["matching", "firstMeet", "date", "relationship", "marriage"];

const PHASE_PREFIX = {
  matching: "MT-",
  firstMeet: "FM-",
  date: "DT-",
  relationship: "RL-",
  marriage: "MR-",
};

const FALLBACK = {
  matching: "MT-08",
  firstMeet: "_default",
  date: "DT-08",
  relationship: "RL-08",
  marriage: "MR-01",
};

const KEY_RE = /^(MT|FM|DT|RL|MR)-\d{2}$/;

export function calcResultKeys({ answers, contrib }) {
  // answers は検証のみ
  const validAnswers =
    Array.isArray(answers) &&
    answers.length === 20 &&
    answers.every(v => Number.isInteger(v) && v >= 1 && v <= 5);

  const tagTotals = contrib?.debug?.tag_totals;

  const result = {};

  for (const phase of PHASES) {
    result[phase] = pickPhaseKey({
      phase,
      validAnswers,
      phaseTotals: tagTotals?.[phase],
    });
  }

  return result;
}

function pickPhaseKey({ phase, validAnswers, phaseTotals }) {
  const fallback = FALLBACK[phase];

  if (!validAnswers) return fallback;
  if (!phaseTotals || typeof phaseTotals !== "object") return fallback;

  const prefix = PHASE_PREFIX[phase];

  const candidates = Object.entries(phaseTotals).filter(([k, v]) => {
    return (
      typeof k === "string" &&
      KEY_RE.test(k) &&
      k.startsWith(prefix) &&
      typeof v === "number" &&
      Number.isFinite(v)
    );
  });

  if (candidates.length === 0) return fallback;

  let maxAbs = 0;
  for (const [, v] of candidates) {
    const a = Math.abs(v);
    if (a > maxAbs) maxAbs = a;
  }

  if (maxAbs === 0) return fallback;

  const tied = candidates
    .filter(([, v]) => Math.abs(v) === maxAbs)
    .map(([k]) => k)
    .sort();

  return tied[0] ?? fallback;
}
