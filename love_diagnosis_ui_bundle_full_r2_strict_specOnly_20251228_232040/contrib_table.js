window.generateRandomResult = function(){
  return {
    phaseScores: {
      matching: "普通",
      firstMeet: "普通",
      date: "普通",
      relation: "普通",
      marriage: "普通"
    },
    rarity: "E",
    alias: "心理構築アーキテクト",
    matchingExtra: []
  };
};
// --- fallback implementation (if locked contrib table file does not export computeAllPhases) ---
import { PHASES } from "./data_questions.js";

export function computeAllPhases({ answers, seed }) {
  // Very simple deterministic model for beta safety
  const phaseWeights = {
    "出会い（マッチング）":[1,1,1,1,1, 0.5,0.5,0.5,0.5,0.5, 0.2,0.2,0.2,0.2,0.2, 0.2,0.2,0.2,0.2,0.2],
    "初対面":[0.6,0.8,1,1,0.8, 1,1,0.7,0.8,0.6, 0.3,0.4,0.3,0.4,0.3, 0.3,0.3,0.4,0.5,0.4],
    "デート":[0.4,0.6,0.6,0.6,0.6, 0.8,0.8,0.8,0.8,0.6, 0.6,0.6,0.5,0.6,0.5, 0.7,0.4,0.4,0.6,0.5],
    "交際":[0.3,0.4,0.4,0.4,0.4, 0.5,0.5,0.6,0.6,0.6, 0.9,0.9,0.9,0.9,0.9, 0.9,0.8,0.8,0.8,0.8],
    "結婚":[0.2,0.3,0.3,0.3,0.3, 0.4,0.4,0.5,0.5,0.6, 1,1,1,1,1, 0.8,0.9,1,1,1],
  };

  function scorePhase(phase){
    const w = phaseWeights[phase];
    let sum=0, ws=0;
    for(let i=1;i<=20;i++){
      const a = answers[i] ?? 3;
      // convert 1..5 to +2..-2 (reverse score)
      const v = 3 - a; // 1->2, 5->-2
      const wi = w[i-1] ?? 0;
      sum += v*wi;
      ws += Math.abs(wi);
    }
    const norm = ws ? (sum/ws) : 0;
    // band
    let band = "普通";
    if (norm <= -1.2) band="激弱";
    else if (norm <= -0.5) band="弱";
    else if (norm >= 1.2) band="激強";
    else if (norm >= 0.5) band="強";
    // rarity dummy
    const rarity = "E";
    return { norm, band, rarity };
  }

  function mkSections(phase, band){
    // simple distinct text per phase + band so it changes
    const base = {
      "出会い（マッチング）":"入口の置き方",
      "初対面":"場の温度の扱い",
      "デート":"距離と遊びの配合",
      "交際":"安心と不安の両立",
      "結婚":"長期の設計",
    }[phase] || "扱い方";
    const scene = { bullets:[`${base}が静かに出やすい`], tail:`${band}帯では、その傾向が目立つことがある。` };
    const why = { bullets:[`判断の順番が「安全→表現」になりやすい`], tail:`能力ではなく、順番の癖として出やすい。` };
    const aware = { bullets:[`反応を見てから言葉を選びがち`,`テンポが崩れると疲れやすい`], tail:`気づけると調整がしやすくなる。` };
    const reco = { bullets:[`一言だけ自分の軸を置く`,`温度を1ミリ残す`], tail:`正解に寄せるより、選択肢を増やす方向が合う。` };
    const effect = { bullets:[`相手が「読みやすい」と感じやすい`], tail:`結果が出やすい入口が作れることがある。` };
    const matchingExtra = phase==="出会い（マッチング）" ? { bullets:[`会って判断したい人`,`距離を詰めすぎない人`], tail:`最初の接点の置き方で決まりやすい。` } : null;
    return { scene, why, aware, reco, effect, matchingExtra, closing1:"一つだけ触れるところがあるなら、そこだけで十分動くこともある。", closing2:"固定ではなく、少しの調整で景色が変わる人もいる。" };
  }

  const phases = {};
  for(const p of PHASES){
    const s = scorePhase(p);
    phases[p] = {
      scoreBand: s.band,
      scoreLabel: s.band,
      rarity: s.rarity,
      sections: mkSections(p, s.band),
    };
  }

  return {
    overall: { alias: "心理構築アーキテクト" },
    phases,
    legendText: "C:よくある / U:少し珍しい / R:珍しい / E:かなり珍しい / M:希少 / Lg:伝説級 / Sg:唯一",
  };
}
export const CONTRIB_BY_ID = {};