import { computeAllPhases } from "./contrib_table.js";
import { calcRarity } from "./rarity_logic.js";
import { calcAlias } from "./alias_logic.js";
import { getText } from "./text.js";
import { PHASES } from "./phases.js";
import { hashAnswersToCode } from "./hash.js";

function safeObj(v){ return (v && typeof v === "object") ? v : null; }

export function normalizeAnswers(answers){
  // answers: [{qid, v}] length 20, qid Q1..Q20 (order independent)
  const map = new Map();
  for(const a of answers){
    if(!a || typeof a.qid !== "string") continue;
    const v = Number(a.v);
    if(Number.isInteger(v) && v >= 1 && v <= 5) map.set(a.qid, v);
  }
  const normalized = [];
  for(let i=1; i<=20; i++){
    const qid = `Q${i}`;
    if(!map.has(qid)) return null; // 未回答あり
    normalized.push(map.get(qid));
  }
  return normalized;
}

export function buildResult(answers, meta){
  const answersNormalized = normalizeAnswers(answers);
  if(!answersNormalized) return null;

  const saveCode = hashAnswersToCode(answersNormalized);

  // rarity
  let rarity;
  try{ rarity = calcRarity(answersNormalized); }catch{ rarity = undefined; }

  // nickname (+ image if provided)
  let nickname;
  let nicknameImageSrc;
  try{
    const aliasOut = calcAlias(answersNormalized, rarity);
    if(typeof aliasOut === "string"){
      nickname = aliasOut;
    }else{
      const o = safeObj(aliasOut);
      if(o){
        nickname = (typeof o.nickname === "string") ? o.nickname : (typeof o.name === "string" ? o.name : "");
        nicknameImageSrc = (typeof o.imageSrc === "string") ? o.imageSrc : (typeof o.image === "string" ? o.image : undefined);
      }
    }
  }catch{
    nickname = "";
  }

  // phase computations (black-box)
  let phasesOut = null;
  try{
    phasesOut = computeAllPhases({ answersNormalized, answers, meta });
  }catch{
    try{
      phasesOut = computeAllPhases(answersNormalized);
    }catch{
      phasesOut = null;
    }
  }

  const scoreBandByPhase = safeObj(phasesOut)?.scoreBandByPhase ?? safeObj(phasesOut)?.scoreBands ?? null;
  const patternKeysByPhase = safeObj(phasesOut)?.patternKeysByPhase ?? safeObj(phasesOut)?.patternKeyByPhase ?? null;

  // texts
  const phaseTextsByPhase = {};
  PHASES.forEach(ph => {
    const pk = (patternKeysByPhase && typeof patternKeysByPhase[ph.key] === "string")
      ? patternKeysByPhase[ph.key]
      : "_default";
    try{
      phaseTextsByPhase[ph.key] = getText(ph.key, pk);
    }catch{
      phaseTextsByPhase[ph.key] = null;
    }
  });

  return {
    saveCode,
    nickname: nickname ?? "",
    nicknameImageSrc,
    rarity,
    scoreBandByPhase: scoreBandByPhase ?? {},
    patternKeysByPhase: patternKeysByPhase ?? {},
    phaseTextsByPhase,
    debug: safeObj(phasesOut)?.debug,
  };
}
