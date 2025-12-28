// alias_logic.js
// 契約: 別紙_異名選出ロジック_LOCKED_v6.md に準拠（完全決定論 / 乱数なし）
// NOTE: フェーズ遷移（weak→strong/flat/strong→weak）は “参照する” が、
//       具体的なしきい値は別紙に未定義のため、入力 phaseTrend を受け取る設計とする。
//       （本紙/スコア側で phaseTrend を決定し、この関数へ渡す）

export const PHASES = ["match", "first", "date", "relationship", "marriage"];
export const PHASE_TRENDS = ["weak_to_strong", "flat", "strong_to_weak"];

// ----------------------------
// 1) 異名候補マスタ（別紙 5章）
// ----------------------------
export const ALIAS_MASTER = {
  C: {
    distance: ["距離を測る慎重派", "距離感キープ派"],
    temperature: ["温度管理タイプ"],
    emotion: ["感情整理待ち"],
    phase_weak_to_strong: ["静観選択派"],
    phase_flat: ["可能性重視型"],
    phase_strong_to_weak: ["スタートダッシュ型", "先読み反応派"],
    blank: ["リズム非同期型", "余白保持タイプ"],
  },
  U: {
    distance: ["近接コミュニケーター"],
    temperature: ["温度感知型", "反応即決派"],
    emotion: ["理想ドリブン", "心理同調型"],
    phase_weak_to_strong: ["内省ドリブン"],
    phase_flat: ["同期した接点", "接触の等位相"],
    phase_strong_to_weak: ["期待感応型"],
    blank: ["介入非選択者", "可変の間合い"],
  },
  R: {
    distance: ["距離操作型"],
    temperature: ["温度揺らぎ型", "心理加速型"],
    emotion: ["感情振幅型", "共鳴探索者"],
    phase_weak_to_strong: ["理想先行設計"],
    phase_flat: ["観測優位型"],
    phase_strong_to_weak: ["関係選別志向"],
    blank: ["可変を孕む者"],
  },
  E: {
    distance: ["連関の回廊", "位相の境目"],
    temperature: ["温度の輪郭"],
    emotion: ["共鳴の設計図", "折り重なる線"],
    phase_weak_to_strong: ["構造の奥行", "深部の配列"],
    phase_flat: ["配置の秩序"],
    phase_strong_to_weak: ["ほどける深度", "離れる構造"],
    blank: ["配列の余白"],
  },
  M: {
    distance: ["距離熱量均衡体", "境界を読む者", "距離を識る者"],
    temperature: ["温度統合適応体", "熱量天秤"],
    emotion: ["感情制御適応体", "心理戦略適応体"],
    phase_weak_to_strong: ["深まる均衡", "集約する境界"],
    phase_flat: ["関係構造理解者"],
    phase_strong_to_weak: ["解ける統合", "退く位相"],
    blank: ["構造の余域", "均衡の間"],
  },
  Lg: {
    distance: ["距離統合者", "連関の要"],
    temperature: ["集積する熱相"],
    emotion: ["心理構築体", "感情均衡体"],
    phase_weak_to_strong: ["核化する連関"],
    phase_flat: ["関係設計者", "関係の中枢"],
    phase_strong_to_weak: ["輪郭の支柱", "位相の統合"],
    blank: ["核の静域", "統合の空隙"],
  },
  // Sgは main/sub を1候補として扱う（表示は main + "\n　" + sub）
  Sg: {
    distance: [
      { main: "距離を統べる者《THE DISTANT ONE》", sub: "〜触れずに支配が成立する〜" },
      { main: "縁の終縁《EDGE OF BOND》", sub: "〜触れたら戻れない〜" },
    ],
    temperature: [
      { main: "関係性の終端点《TERMINUS》", sub: "〜すべてがここで決まる〜" },
    ],
    emotion: [
      { main: "感情臨界の統治者《EMOTION REGENT》", sub: "〜熱が支配権を渡す瞬間〜" },
      { main: "感情重力核《EMOTIONAL CORE》", sub: "〜引き寄せずにいられない〜" },
      { main: "感情の原点《ORIGIN》", sub: "〜始まりであり、逃げ場でもある〜" },
    ],
    phase_weak_to_strong: [
      { main: "深縁の覇王《DEPTH SOVEREIGN》", sub: "〜縁が臨界を越える場所〜" },
      { main: "深層選別者《DEPTH SELECTOR》", sub: "〜選ばれるのは縁だけ〜" },
    ],
    phase_flat: [
      { main: "関係構造の特異点《SINGULAR POINT》", sub: "〜すべてが歪む中心〜" },
      { main: "終極の真中《ULTIMATE MID》", sub: "〜始まりでも終わりでもない〜" },
      { main: "静寂《ETERNAL STILLNESS》", sub: "〜時間なき場所〜" },
    ],
    phase_strong_to_weak: [
      { main: "密度の極《APEX DENSITY》", sub: "〜これ以上、詰められない〜" },
    ],
    blank: [
      { main: "例外として生きる者《THE OUTLIER》", sub: "〜規則の外で成立する〜" },
      { main: "零位相《ZERO SPACE》", sub: "〜選ばないという選択〜" },
    ],
  },
};

// ----------------------------
// 2) 参照タグ（別紙 3章）
// ----------------------------
const TAGS = [
  "PACE_SLOW","PACE_FAST","SELF_OPEN_LOW","SELF_OPEN_HIGH","HARM_AVOID","EDGE_PREFERENCE","READ_REACTION","INITIATIVE",
  "TRUST_ACTION","MOOD_SYNC","AMBIG_TOL","AMBIG_INTOL","LOSS_FEAR","LONG_TERM","BOUNDARY","DEVOTION"
];

// 反対タグ写像（別紙 10-3）
const OPP_TAG = {
  PACE_SLOW: "PACE_FAST",
  PACE_FAST: "PACE_SLOW",
  SELF_OPEN_LOW: "SELF_OPEN_HIGH",
  SELF_OPEN_HIGH: "SELF_OPEN_LOW",
  AMBIG_TOL: "AMBIG_INTOL",
  AMBIG_INTOL: "AMBIG_TOL",
};

// ----------------------------
// 3) 寄与表（別紙 10章）
// ----------------------------
const phase_w_alias = [
  { match:0.8, first:1.0, date:0.4, relationship:0.2, marriage:0.0 },
  { match:0.9, first:0.8, date:0.4, relationship:0.2, marriage:0.0 },
  { match:0.7, first:0.8, date:0.6, relationship:0.2, marriage:0.0 },
  { match:0.5, first:1.0, date:0.4, relationship:0.2, marriage:0.0 },
  { match:0.8, first:0.9, date:0.4, relationship:0.2, marriage:0.0 },
  { match:0.2, first:0.5, date:1.0, relationship:0.7, marriage:0.4 },
  { match:0.1, first:0.5, date:0.8, relationship:1.0, marriage:0.7 },
  { match:0.1, first:0.3, date:0.7, relationship:1.0, marriage:0.9 },
  { match:0.8, first:0.8, date:0.5, relationship:0.2, marriage:0.0 },
  { match:0.1, first:0.2, date:0.4, relationship:0.9, marriage:1.0 },
  { match:0.0, first:0.2, date:0.6, relationship:0.9, marriage:0.9 },
  { match:0.4, first:0.7, date:0.6, relationship:0.5, marriage:0.3 },
  { match:0.0, first:0.2, date:0.6, relationship:1.0, marriage:0.9 },
  { match:0.0, first:0.2, date:0.6, relationship:1.0, marriage:0.9 },
  { match:0.0, first:0.1, date:0.5, relationship:1.0, marriage:1.0 },
  { match:0.0, first:0.0, date:0.3, relationship:0.8, marriage:1.0 },
  { match:0.0, first:0.1, date:0.3, relationship:0.8, marriage:1.0 },
  { match:0.0, first:0.1, date:0.4, relationship:0.9, marriage:1.0 },
  { match:0.0, first:0.0, date:0.3, relationship:0.8, marriage:1.0 },
  { match:0.1, first:0.2, date:0.5, relationship:0.9, marriage:1.0 },
];

const tags_alias = [
  { PACE_SLOW:1.0, BOUNDARY:1.0, READ_REACTION:0.4 },
  { PACE_SLOW:1.2, READ_REACTION:0.8, LOSS_FEAR:0.3 },
  { BOUNDARY:0.9, AMBIG_TOL:0.9, EDGE_PREFERENCE:0.4 },
  { READ_REACTION:1.0, HARM_AVOID:0.6, SELF_OPEN_LOW:0.6 },
  { READ_REACTION:1.2, TRUST_ACTION:0.6, PACE_SLOW:0.6 },
  { MOOD_SYNC:1.2, DEVOTION:0.6, READ_REACTION:0.4 },
  { AMBIG_TOL:1.3, BOUNDARY:0.7, TRUST_ACTION:0.3 },
  { TRUST_ACTION:1.2, LONG_TERM:0.7 },
  { BOUNDARY:1.2, PACE_SLOW:0.9, SELF_OPEN_LOW:0.3 },
  { LONG_TERM:1.3, DEVOTION:0.7, TRUST_ACTION:0.4 },
  { AMBIG_TOL:0.7, DEVOTION:0.6, LONG_TERM:0.6 },
  { SELF_OPEN_LOW:1.3, BOUNDARY:0.5, READ_REACTION:0.5 },
  { DEVOTION:1.1, HARM_AVOID:0.6, LOSS_FEAR:0.5 },
  { BOUNDARY:1.1, PACE_SLOW:0.6, AMBIG_INTOL:0.5 },
  { LOSS_FEAR:1.4, AMBIG_INTOL:1.0, READ_REACTION:0.4 },
  { LOSS_FEAR:1.6, AMBIG_INTOL:0.7 },
  { DEVOTION:1.3, LONG_TERM:0.8 },
  { TRUST_ACTION:1.0, LONG_TERM:1.0, DEVOTION:0.5 },
  { LONG_TERM:1.4, DEVOTION:0.8, BOUNDARY:0.3 },
  { LONG_TERM:0.8, DEVOTION:0.7, INITIATIVE:0.7, EDGE_PREFERENCE:0.4 },
];

// ----------------------------
// 4) ユーティリティ（決定論）
// ----------------------------
function assertAnswers(answers) {
  if (!Array.isArray(answers) || answers.length !== 20) throw new Error("answers must be Array(20)");
  for (const a of answers) if (![1,2,3,4,5].includes(a)) throw new Error("answers must be ints 1..5");
}
function assertRarityOverall(r) {
  if (!["C","U","R","E","M","Lg","Sg"].includes(r)) throw new Error("rarityOverall invalid");
}
function assertPhaseTrend(t) {
  if (t == null) return;
  if (!PHASE_TRENDS.includes(t)) throw new Error("phaseTrend invalid");
}

// FNV-1a 32bit（完全決定論）
function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}
function round1(x) { return Math.round(x * 10) / 10; }

// ----------------------------
// 5) タグ寄与（phase別→overall）
// ----------------------------
function computeTagTotalsByPhase(answers) {
  const tag_total = {};
  for (const p of PHASES) {
    tag_total[p] = {};
    for (const t of TAGS) tag_total[p][t] = 0;
  }

  for (let i = 0; i < 20; i++) {
    const v = 3 - answers[i]; // +2..-2
    const wByPhase = phase_w_alias[i];
    const tags = tags_alias[i];

    for (const p of PHASES) {
      const pw = wByPhase[p] || 0;
      if (!pw) continue;

      for (const [tag, tw] of Object.entries(tags)) {
        if (v >= 0) {
          tag_total[p][tag] += v * tw * pw;
        } else {
          const opp = OPP_TAG[tag];
          if (opp) tag_total[p][opp] += (-v) * tw * pw;
          else tag_total[p][tag] += v * tw * pw;
        }
      }
    }
  }
  return tag_total;
}

function sumOverall(tagTotalsByPhase) {
  const overall = {};
  for (const t of TAGS) overall[t] = 0;
  for (const p of PHASES) for (const t of TAGS) overall[t] += tagTotalsByPhase[p][t] || 0;
  return overall;
}

// ----------------------------
// 6) カテゴリraw → カテゴリ
// ----------------------------
function categoryRaws(tagTotal) {
  const abs = (x) => Math.abs(x);

  const distance_raw =
    1.2*abs(tagTotal.BOUNDARY||0) +
    1.0*abs((tagTotal.PACE_SLOW||0)-(tagTotal.PACE_FAST||0)) +
    0.8*abs((tagTotal.SELF_OPEN_LOW||0)-(tagTotal.SELF_OPEN_HIGH||0)) +
    0.6*abs(tagTotal.READ_REACTION||0);

  const temperature_raw =
    1.2*abs(tagTotal.MOOD_SYNC||0) +
    0.7*abs(tagTotal.EDGE_PREFERENCE||0) +
    0.7*abs((tagTotal.AMBIG_TOL||0)-(tagTotal.AMBIG_INTOL||0));

  const emotion_raw =
    1.1*abs(tagTotal.LOSS_FEAR||0) +
    0.8*abs(tagTotal.HARM_AVOID||0) +
    0.8*abs(tagTotal.DEVOTION||0) +
    0.6*abs(tagTotal.TRUST_ACTION||0);

  const phase_raw =
    0.9*abs(tagTotal.LONG_TERM||0) +
    0.7*abs(tagTotal.INITIATIVE||0) +
    0.6*abs(tagTotal.TRUST_ACTION||0) +
    0.4*abs(tagTotal.READ_REACTION||0);

  return { distance: distance_raw, temperature: temperature_raw, emotion: emotion_raw, phase: phase_raw };
}

function decideCategory(raws) {
  const entries = Object.entries(raws).sort((a,b)=>b[1]-a[1]);
  const total = entries.reduce((s,[,v])=>s+v,0);
  const gap = entries[0][1] - entries[1][1];

  // 規定値：空白判定（別紙で未定義のため暫定）
  if (total < 6.0 || gap < 1.0) return "blank";

  const max = entries[0][1];
  const tied = entries.filter(([,v])=>v===max).map(([k])=>k);
  const order = ["distance","temperature","emotion","phase"];
  for (const k of order) if (tied.includes(k)) return k;

  return entries[0][0];
}

// ----------------------------
// 7) phaseカテゴリのサブ分類
// ----------------------------
function phasePoolKeyFromTrend(phaseTrend) {
  if (phaseTrend === "weak_to_strong") return "phase_weak_to_strong";
  if (phaseTrend === "strong_to_weak") return "phase_strong_to_weak";
  return "phase_flat";
}

// ----------------------------
// 8) 同カテゴリ内の選択（fingerprint hash）
// ----------------------------
function signatureHashOverall(tagTotalOverall) {
  const parts = [
    round1(tagTotalOverall.BOUNDARY || 0),
    round1(tagTotalOverall.MOOD_SYNC || 0),
    round1(tagTotalOverall.LOSS_FEAR || 0),
    round1(tagTotalOverall.LONG_TERM || 0),
    round1(tagTotalOverall.INITIATIVE || 0),
  ];
  return fnv1a32(parts.join("|"));
}
function chooseFromList(list, k) {
  const N = list.length;
  const idx = N ? (k % N) : 0;
  return list[idx];
}

// ----------------------------
// 9) 画像ファイル名（別紙 9章）
// ----------------------------
export function aliasIdFromAliasOverall(rarityOverall, aliasOverall) {
  if (rarityOverall !== "Sg") return aliasOverall;

  const firstLine = String(aliasOverall).split("\n")[0] || "";
  const idx = firstLine.indexOf("《");
  return (idx >= 0 ? firstLine.slice(0, idx) : firstLine).trim();
}

export function buildAliasAssetCandidates(rarityOverall, aliasId) {
  const preferGif = (rarityOverall === "Lg" || rarityOverall === "Sg");
  const base = `${rarityOverall}_${aliasId}`;
  const first = preferGif ? `${base}.gif` : `${base}.png`;
  const second = preferGif ? `${base}.png` : `${base}.gif`;
  return [first, second, `_default.png`];
}

// ----------------------------
// 10) 公開API（別紙 1-2）
// ----------------------------
/**
 * @param {number[]} answers length=20 int 1..5
 * @param {"C"|"U"|"R"|"E"|"M"|"Lg"|"Sg"} rarityOverall
 * @param {"weak_to_strong"|"flat"|"strong_to_weak"} [phaseTrend] - phaseカテゴリ専用（未指定は flat）
 * @returns {{aliasOverall:string, aliasCategoryOverall:string, aliasAssetOverall:string, aliasId:string, assetCandidates:string[], debug?:object}}
 */
export function computeAliasOverall(answers, rarityOverall, phaseTrend = "flat") {
  assertAnswers(answers);
  assertRarityOverall(rarityOverall);
  assertPhaseTrend(phaseTrend);

  const tagByPhase = computeTagTotalsByPhase(answers);
  const tagOverall = sumOverall(tagByPhase);

  const raws = categoryRaws(tagOverall);
  const category = decideCategory(raws);

  let poolKey = category;
  if (category === "phase") poolKey = phasePoolKeyFromTrend(phaseTrend);

  const master = ALIAS_MASTER[rarityOverall];
  if (!master) throw new Error(`Unknown rarityOverall: ${rarityOverall}`);
  const pool = master[poolKey];
  if (!pool) throw new Error(`No alias pool for rarity=${rarityOverall} key=${poolKey}`);

  const k = signatureHashOverall(tagOverall);
  const chosen = chooseFromList(pool, k);

  let aliasOverall;
  if (rarityOverall === "Sg") aliasOverall = `${chosen.main}\n　${chosen.sub}`;
  else aliasOverall = chosen;

  const aliasId = aliasIdFromAliasOverall(rarityOverall, aliasOverall);
  const assetCandidates = buildAliasAssetCandidates(rarityOverall, aliasId);
  const aliasAssetOverall = assetCandidates[0];

  return { aliasOverall, aliasCategoryOverall: category, aliasAssetOverall, aliasId, assetCandidates, debug: { raws } };
}
