// app.js
// 本紙_4th最終版_r3.md を正として UI を生成する（過去仕様・過去生成物は参照しない）
//
// 依存（生成不要ファイル）:
//  - data_questions.js: 質問データ
//  - contrib_table.js: スコア/パターン算出（computeAllPhases）
//  - rarity_logic.js: 全体レアリティ算出（calcRarity）
//  - alias_logic.js: 異名算出（computeAliasOverall）
//  - text.js: 結果文章（ES Modules）

import { QUESTIONS, PHASES, PHASE_LABELS } from "./data_questions.js";
import { computeAllPhases } from "./contrib_table.js";
import { calcRarity } from "./rarity_logic.js";
import { computeAliasOverall } from "./alias_logic.js";

// --------------------
// Utilities
// --------------------
const STORAGE_KEY = "love_diag_r3_state";

function clampInt(n, min, max){
  const v = Number.isFinite(n) ? Math.trunc(n) : NaN;
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}
function nowISO(){ return new Date().toISOString(); }

function saveState(s){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }catch{}
}
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  }catch{ return null; }
}
function clearState(){
  try{ localStorage.removeItem(STORAGE_KEY); }catch{}
}

function seededRand(seedStr){
  // xorshift32
  let x = 0;
  for (let i=0;i<seedStr.length;i++){
    x = (x ^ seedStr.charCodeAt(i)) >>> 0;
    x = (x * 16777619) >>> 0;
  }
  if (x === 0) x = 0x12345678;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17; x >>>= 0;
    x ^= x << 5; x >>>= 0;
    return (x >>> 0) / 4294967296;
  };
}

function simpleHash32(str){
  let h = 2166136261 >>> 0;
  for (let i=0;i<str.length;i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function el(tag, attrs={}, ...children){
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)){
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else if (v === false || v == null) continue;
    else e.setAttribute(k, String(v));
  }
  for (const c of children){
    if (c == null) continue;
    if (typeof c === "string") e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  }
  return e;
}

function setView(node){
  const root = document.getElementById("app");
  root.innerHTML = "";
  root.appendChild(node);
}

function phaseLabel(phaseKey){
  return PHASE_LABELS?.[phaseKey] ?? phaseKey;
}

function answerLabelEnds(q){
  // 1 が「あてはまらない側」、5 が「あてはまる側」（本紙の表示仕様）
  return {
    left: q?.scaleLeft ?? "あてはまらない",
    right: q?.scaleRight ?? "あてはまる",
  };
}

// --------------------
// text.js loader (robust)
// --------------------
async function loadTextModule(){
  // Prefer ES module contract
  try{
    const m = await import("./text.js");
    return m;
  }catch(e){
    // Fallback: if text.js is JSON file
    try{
      const res = await fetch("./text.js", { cache: "no-store" });
      const txt = await res.text();
      const obj = JSON.parse(txt);
      const TEXT_BY_PHASE = {};
      if (obj && typeof obj === "object"){
        if (obj.phase && obj.results){
          TEXT_BY_PHASE[obj.phase] = Object.fromEntries(
            Object.entries(obj.results).map(([k,v])=>[k, v.sections ?? v])
          );
        }else{
          // assume already phase->pattern->sections
          Object.assign(TEXT_BY_PHASE, obj);
        }
      }
      return {
        TEXT_BY_PHASE,
        getTextSet(phaseKey, patternKey){
          const phase = TEXT_BY_PHASE?.[phaseKey] || {};
          const hit = phase?.[patternKey] || phase?._default;
          return hit || emptyTextSet();
        }
      };
    }catch(_){
      return { getTextSet(){ return emptyTextSet(); } };
    }
  }
}

function emptyTextSet(){
  return {
    scene: { bullets: [], sentences: ["", ""] },
    why: { bullets: [], sentences: ["", ""] },
    awareness: { bullets: [], sentences: ["", ""] },
    recommend: { bullets: [], sentences: ["", ""] }
  };
}

// Choose patternKey deterministically when computeAllPhases doesn't provide it.
// This is "任意決定"（本紙未定義）だが、回答差分で文章が変わらない実装を避ける。
function choosePatternKey({ phaseKey, answers, textModule }){
  const byPhase = textModule?.TEXT_BY_PHASE?.[phaseKey];
  const keys = byPhase ? Object.keys(byPhase).filter(k => k !== "_default") : [];
  if (!keys.length) return "_default";
  const h = simpleHash32(`${phaseKey}:${answers.join(",")}`);
  return keys[h % keys.length];
}

// --------------------
// App state
// --------------------
const State = {
  // screen: "title" | "start" | "question" | "alias" | "result"
  screen: "title",
  qIndex: 0,           // 0..QUESTIONS.length-1
  answers: {},         // { [qid:number]: 1..5 }
  seed: "",            // random seed for random diagnosis
  computed: null,      // computed result object
};

function defaultState(){
  return {
    screen: "title",
    qIndex: 0,
    answers: {},
    seed: "",
    computed: null,
    updatedAt: nowISO(),
  };
}

function normalizeAnswersToArray(){
  // answers is keyed by questionId (1..20)
  const arr = [];
  for (let qid=1; qid<=QUESTIONS.length; qid++){
    arr.push(clampInt(State.answers[qid] ?? 3, 1, 5));
  }
  return arr;
}

// --------------------
// Screens
// --------------------
function TitleScreen(){
  const container = el("div", { class:"container" });
  const card = el("section", { class:"card hero", role:"button", tabindex:"0", "aria-label":"タイトル画面。タップで次へ" });

  const h = el("h1", { class:"h1" }, "恋愛戦場タイプ診断");
  const sub = el("div", { class:"muted" }, "あなたが下手でも悪いんでもない。逢ってないだけ。");

  const loop = el("div", { class:"loopLine fade", id:"loopLine" }, "会ってる。");
  card.append(h, sub, loop, el("div", { class:"tapHint" }, "画面をタップして進む"));

  let i=0;
  const words = ["会ってる。","合ってない。","遇ってる。","遭ってない。"];
  function step(){
    loop.classList.remove("on");
    setTimeout(()=>{
      loop.textContent = words[i % words.length];
      loop.classList.add("on");
      i++;
    }, 80);
  }
  // first show
  requestAnimationFrame(()=>{ loop.classList.add("on"); });
  const timer = setInterval(step, 400);

  function go(){
    clearInterval(timer);
    State.screen = "start";
    State.updatedAt = nowISO();
    saveState(State);
    render();
  }

  card.addEventListener("click", go);
  card.addEventListener("keydown", (ev)=>{
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); }
  });

  container.appendChild(card);
  return container;
}

function StartScreen(){
  const container = el("div", { class:"container" });
  const card = el("section", { class:"card pad" });

  card.appendChild(el("h1", { class:"h1" }, "恋愛戦場タイプ診断"));

  // Spec: start button + random button
  const btnStart = el("button", { class:"btn primary block", onclick: ()=>startDiagnosis(false) }, "▶ 診断を始める");
  const btnRandom = el("button", { class:"btn block", onclick: ()=>startDiagnosis(true) }, "ランダム診断");

  card.appendChild(el("div", { class:"btnRow mt12" }, btnStart, btnRandom));

  const desc = `これは、あなたの価値や優劣・人間性を決めつける診断ではありません。
恋愛の傾向を統計的にモデル化したものであり、正解とは限りません。

恋愛心理学・行動科学・交際統計など複数研究の傾向から
「出会い〜交際〜結婚」フェーズ別のデータを用いて作成しています。`;

  card.appendChild(el("div", { class:"notice mt16" }, desc));

  card.appendChild(el("div", { class:"notice foot mt16" }, "※この診断は医学的・医療的評価を目的としたものではありません"));

  container.appendChild(card);
  return container;
}

function QuestionScreen(){
  const container = el("div", { class:"container" });

  const q = QUESTIONS[State.qIndex];
  const total = QUESTIONS.length;

  const card = el("section", { class:"card pad" });

  const meta = el("div", { class:"qMeta" },
    el("div", {}, `質問 ${State.qIndex + 1} / ${total}`),
    el("div", {}, phaseLabel(q.phaseKey || q.phase || "")),
  );

  card.append(
    el("div", { class:"spread" },
      el("h2", { class:"h2" }, "質問"),
      el("span", { class:"pill" }, `回答は 1〜5`)
    ),
    meta,
    el("div", { class:"divider" }),
    el("p", { class:"qTitle" }, q.text ?? q.question ?? ""),
  );

  const ends = answerLabelEnds(q);
  const scaleRow = el("div", { class:"scale", role:"group", "aria-label":"回答" });

  for (let v=1; v<=5; v++){
    const pressed = (State.answers[q.id] === v);
    const b = el("button", {
      class:"scaleBtn",
      "aria-pressed": pressed ? "true" : "false",
      onclick: ()=>chooseAnswer(q.id, v)
    }, String(v));
    scaleRow.appendChild(b);
  }

  card.append(scaleRow, el("div", { class:"scaleEnds" },
    el("span", {}, ends.left),
    el("span", {}, ends.right),
  ));

  const nav = el("div", { class:"navRow" });

  const btnBack = el("button", { class:"btn", onclick: ()=>moveQuestion(-1) }, "戻る");
  const btnNext = el("button", { class:"btn primary", onclick: ()=>moveQuestion(1) }, State.qIndex === total-1 ? "結果へ" : "次へ");

  nav.append(btnBack, btnNext);
  card.appendChild(nav);

  container.appendChild(card);
  return container;
}

function AliasScreen(){
  // Spec: 「異名だけ」全画面表示。タップで結果へ。ID非表示。
  const container = el("div", { class:"container" });
  const card = el("section", { class:"card pad", role:"button", tabindex:"0", "aria-label":"異名画面。タップで結果へ" });

  const { aliasOverall, aliasAssetOverall } = State.computed.alias;

  const left = el("div", { class:"left" },
    el("div", { class:"kv" },
      el("div", { class:"value", style:"font-size:22px" }, aliasOverall)
    )
  );

  const img = el("img", {
    class:"aliasImg",
    alt:"異名画像",
    src: aliasAssetOverall,
    onerror: (ev)=>{ ev.currentTarget.src = "./assets/alias/_default.png"; }
  });

  const right = el("div", { class:"right" }, img);

  card.appendChild(el("div", { class:"aliasLayout" }, left, right));
  card.appendChild(el("div", { class:"tapHint" }, "画面をタップして結果へ"));

  function go(){
    State.screen = "result";
    State.updatedAt = nowISO();
    saveState(State);
    render();
  }
  card.addEventListener("click", go);
  card.addEventListener("keydown", (ev)=>{
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); }
  });

  container.appendChild(card);
  return container;
}

function ResultScreen(){
  const container = el("div", { class:"container" });
  const card = el("section", { class:"card pad" });

  const { rarityOverall } = State.computed;
  const { aliasOverall, aliasAssetOverall } = State.computed.alias;

  // G-2: 異名ラベル + 異名、レアリティラベル + 略称。ラベル文字列は "異名：" "レアリティ："
  const left = el("div", { class:"left" },
    el("div", { class:"kv" },
      el("div", { class:"label" }, "異名："),
      el("div", { class:"value" }, aliasOverall),
    ),
    el("div", { class:"kv" },
      el("div", { class:"label" }, "レアリティ："),
      el("div", { class:"value" }, rarityOverall),
    )
  );

  const img = el("img", {
    class:"aliasImg",
    alt:"異名画像",
    src: aliasAssetOverall,
    onerror: (ev)=>{ ev.currentTarget.src = "./assets/alias/_default.png"; }
  });

  const right = el("div", { class:"right" }, img);

  card.appendChild(el("div", { class:"aliasLayout" }, left, right));

  // table: score / remarks（scene bullet1）
  const table = el("table", {});
  table.appendChild(el("thead", {}, el("tr", {},
    el("th", {}, "フェーズ"),
    el("th", {}, "スコア"),
    el("th", {}, "備考（よくあるシーン）"),
  )));
  const tbody = el("tbody", {});
  for (const phaseKey of PHASES){
    const p = State.computed.phases?.[phaseKey];
    const score = p?.scoreLabel ?? p?.scoreBand ?? "—";
    const remark = (p?.text?.scene?.bullets?.[0]) ?? "—";
    tbody.appendChild(el("tr", {},
      el("td", {}, phaseLabel(phaseKey)),
      el("td", {}, score),
      el("td", {}, remark),
    ));
  }
  table.appendChild(tbody);

  card.appendChild(el("div", { class:"divider" }));
  card.appendChild(el("div", { class:"tableWrap" }, table));

  // legend under table only
  const legend = el("div", { class:"legend" });
  for (const item of State.computed.rarityLegend){
    legend.appendChild(el("div", { class:"legendItem" }, `${item.code}：${item.rate}%`));
  }
  card.appendChild(legend);

  // details (collapsible) - per phase
  const detailsWrap = el("div", { class:"details" });
  for (const phaseKey of PHASES){
    const p = State.computed.phases?.[phaseKey];
    const d = el("details", {});
    d.appendChild(el("summary", {}, `${phaseLabel(phaseKey)} の詳細`));
    const t = p?.text ?? emptyTextSet();
    d.appendChild(renderTextSections(t, phaseKey));
    detailsWrap.appendChild(d);
  }
  card.appendChild(detailsWrap);

  const btnAgain = el("button", { class:"btn", onclick: ()=>restart() }, "もう一度診断");
  const btnSave = el("button", { class:"btn primary", onclick: ()=>saveResult() }, "結果を保存");
  card.appendChild(el("div", { class:"btnRow mt16" }, btnAgain, btnSave));

  container.appendChild(card);
  return container;
}

function renderTextSections(textSet, phaseKey){
  const wrap = el("div", {});
  wrap.append(
    renderOneSection("よくあるシーン", textSet.scene),
    renderOneSection("なぜ起きるのか", textSet.why),
    renderOneSection("自覚ポイント", textSet.awareness),
    renderOneSection("おすすめ", textSet.recommend, phaseKey === "matching"),
  );
  return wrap;
}
function renderOneSection(title, sec, allowMatchingLine=false){
  const section = el("div", { class:"section" });
  section.appendChild(el("div", { class:"sectionTitle" }, title));
  const ul = el("ul", { class:"bullets" });
  for (const b of (sec?.bullets ?? [])){
    ul.appendChild(el("li", {}, b));
  }
  section.appendChild(ul);
  const sentWrap = el("div", { class:"sentences" });
  for (const s of (sec?.sentences ?? [])){
    if (!s) continue;
    sentWrap.appendChild(el("p", {}, s));
  }
  if (allowMatchingLine && typeof sec?.matching === "string" && sec.matching.trim()){
    sentWrap.appendChild(el("p", {}, sec.matching.trim()));
  }
  section.appendChild(sentWrap);
  return section;
}

// --------------------
// Actions
// --------------------
function startDiagnosis(isRandom){
  State.answers = {};
  State.qIndex = 0;
  State.seed = isRandom ? String(Date.now()) : "";
  State.computed = null;
  State.screen = "question";
  State.updatedAt = nowISO();

  if (isRandom){
    const r = seededRand(State.seed);
    for (const q of QUESTIONS){
      State.answers[q.id] = 1 + Math.floor(r()*5);
    }
  }
  saveState(State);
  render();
}

function chooseAnswer(qid, value){
  State.answers[qid] = clampInt(value, 1, 5);
  State.updatedAt = nowISO();
  saveState(State);
  render(); // re-render to update pressed state
}

function moveQuestion(delta){
  const total = QUESTIONS.length;

  if (delta > 0){
    const q = QUESTIONS[State.qIndex];
    if (!State.answers[q.id]){
      alert("回答を選んでください");
      return;
    }
    if (State.qIndex === total-1){
      // compute
      computeResult().catch(err=>{
        console.error(err);
        alert("計算に失敗しました（コンソールを確認してください）");
      });
      return;
    }
  }

  State.qIndex = clampInt(State.qIndex + delta, 0, total-1);
  State.updatedAt = nowISO();
  saveState(State);
  render();
}

async function computeResult(){
  const answersArr = normalizeAnswersToArray();

  // 1) overall rarity
  const rarityOverall = calcRarity(answersArr);

  // 2) scores / per phase
  const scoreResult = computeAllPhases({ answers: answersArr, seed: State.seed });

  // 3) alias (independent of text)
  // phaseTrend: 任意決定（本紙未定義）: scoreResult phases の推移から算出（弱→強 / flat / 強→弱）
  const phaseTrend = inferPhaseTrend(scoreResult);
  const alias = computeAliasOverall(answersArr, rarityOverall, phaseTrend);

  // 4) text.js
  const textModule = await loadTextModule();

  const phases = {};
  for (const phaseKey of PHASES){
    const src = scoreResult?.phases?.[phaseLabel(phaseKey)] || scoreResult?.phases?.[phaseKey] || scoreResult?.phases?.[phaseLabel(phaseKey)] || null;

    const scoreLabel = src?.scoreLabel ?? src?.scoreBand ?? src?.band ?? src?.score ?? "普通";

    const patternKey = src?.patternKey
      ?? choosePatternKey({ phaseKey, answers: answersArr, textModule });

    const getTextSet = textModule.getTextSet || textModule.getText || null;
    const textSet = typeof getTextSet === "function"
      ? getTextSet(phaseKey, patternKey)
      : emptyTextSet();

    phases[phaseKey] = {
      scoreLabel,
      patternKey,
      text: textSet,
    };
  }

  State.computed = {
    rarityOverall,
    alias,
    phases,
    rarityLegend: getRarityLegend(),
  };

  State.screen = "alias"; // per spec: alias-only screen then result
  State.updatedAt = nowISO();
  saveState(State);
  render();
}

function inferPhaseTrend(scoreResult){
  // "任意決定": scoreBand から弱/中/強の3値に落として、前半→後半の平均で傾向を決める
  const order = ["matching","firstMeet","date","relationship","marriage"];
  const bands = order.map(k => {
    const src = scoreResult?.phases?.[phaseLabel(k)] || scoreResult?.phases?.[k] || null;
    const b = (src?.scoreLabel ?? src?.scoreBand ?? "普通");
    if (String(b).includes("激弱") || String(b).includes("弱")) return -1;
    if (String(b).includes("激強") || String(b).includes("強")) return 1;
    return 0;
  });
  const a = (bands[0] + bands[1]) / 2;
  const b = (bands[3] + bands[4]) / 2;
  if (b - a >= 0.6) return "weak_to_strong";
  if (a - b >= 0.6) return "strong_to_weak";
  return "flat";
}

function getRarityLegend(){
  // 本紙の「凡例の文言・順序・割合は固定」に従い、ここは任意決定。
  // Sg:0.5% は FIX。その他はバランスの良い案。
  return [
    { code:"C",  rate:58.0 },
    { code:"U",  rate:20.0 },
    { code:"R",  rate:12.0 },
    { code:"E",  rate:6.0 },
    { code:"M",  rate:2.5 },
    { code:"Lg", rate:1.0 },
    { code:"Sg", rate:0.5 },
  ];
}

function restart(){
  clearState();
  Object.assign(State, defaultState());
  render();
}

function saveResult(){
  // 本紙未定義（savecode等は後で設計）: 現時点はダウンロードではなく localStorage 保存のみ（任意決定）
  try{
    const payload = {
      savedAt: nowISO(),
      answers: State.answers,
      computed: State.computed,
    };
    localStorage.setItem("love_diag_r3_saved_result", JSON.stringify(payload));
    alert("保存しました（このブラウザのローカルに保存）");
  }catch{
    alert("保存に失敗しました");
  }
}

// --------------------
// Render
// --------------------
function render(){
  const view = (() => {
    switch(State.screen){
      case "title": return TitleScreen();
      case "start": return StartScreen();
      case "question": return QuestionScreen();
      case "alias": return AliasScreen();
      case "result": return ResultScreen();
      default: return TitleScreen();
    }
  })();
  setView(view);
}

(function init(){
  const s = loadState();
  Object.assign(State, defaultState(), s || {});
  render();
})();
