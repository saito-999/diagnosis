// BUILD: r7-20260101-105052
import { QUESTIONS } from "./data_questions.js";
import { computeAllPhases } from "./contrib_table.js";
import { calcRarity } from "./rarity_logic.js";
import { calcAlias } from "./alias_logic.js";
import { getText } from "./text.js";

const PHASE_KEYS = ["matching","firstMeet","date","relationship","marriage"];
const PHASE_LABELS_JA = {
  matching: "出会い（マッチング）",
  firstMeet: "初対面",
  date: "デート",
  relationship: "交際",
  marriage: "結婚",
};
const SCORE_LABEL = { 1:"激弱", 2:"弱", 3:"普通", 4:"強", 5:"激強" };
const RARITY_LEGEND_FIXED = [
  ["C","35%"], ["U","25%"], ["R","20%"], ["E","12%"], ["M","6%"], ["Lg","1.5%"], ["Sg","0.5%"],
];

const STORAGE_KEY = "love_diag_state_r7";
const SCREENS = { TITLE:"title", START:"start", Q1_10:"q1_10", Q11_20:"q11_20", ALIAS:"alias", RESULT:"result" };

const state = {
  screen: SCREENS.TITLE,
  answersMap: {},      // Q1..Q20 -> 1..5
  result: null,
  runMode: "manual",   // "manual" | "random"
  scrollByScreen: {},
};

function $(sel){ return document.querySelector(sel); }
function safeJsonParse(s,f){ try{ return JSON.parse(s);}catch{ return f; } }
function clampInt(n,min,max){ const x=parseInt(n,10); return Number.isNaN(x)?min:Math.min(max,Math.max(min,x)); }

async function stableHash(str){
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const arr = Array.from(new Uint8Array(buf));
  const hex = arr.slice(0, 10).map(b=>b.toString(16).padStart(2,"0")).join("");
  const bi = BigInt("0x" + hex);
  return bi.toString(36).toUpperCase().padStart(8,"0").slice(0, 10);
}

function saveState(){
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
    screen: state.screen,
    answersMap: state.answersMap,
    result: state.result,
    runMode: state.runMode,
    scrollByScreen: state.scrollByScreen,
  }));
}
function restoreState(){
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  const s = safeJsonParse(raw, null);
  if (!s) return;
  if (s.screen) state.screen = s.screen;
  if (s.answersMap) state.answersMap = s.answersMap;
  if (s.result) state.result = s.result;
  if (s.runMode) state.runMode = s.runMode;
  if (s.scrollByScreen) state.scrollByScreen = s.scrollByScreen;
}

function setScreen(next){
  state.scrollByScreen[state.screen] = window.scrollY || 0;
  state.screen = next;
  saveState();
  render();
  window.scrollTo({ top: (state.scrollByScreen[next] ?? 0), behavior:"auto" });
}
function clearToStart(){
  state.screen = SCREENS.START;
  state.answersMap = {};
  state.result = null;
  state.runMode = "manual";
  state.scrollByScreen = {};
  saveState();
  render();
  window.scrollTo({ top: 0, behavior:"auto" });
}

function hasAllAnswered(start,end){
  for(let i=start;i<=end;i++){ if(!state.answersMap[`Q${i}`]) return false; }
  return true;
}
function buildAnswersNormalized(){
  const arr = [];
  for(let i=1;i<=20;i++) arr.push(clampInt(state.answersMap[`Q${i}`],1,5));
  return arr;
}
function buildAnswersPairs(){
  const pairs = [];
  for(let i=1;i<=20;i++){
    const qid = `Q${i}`;
    pairs.push({ qid, v: clampInt(state.answersMap[qid],1,5) });
  }
  return pairs;
}
function randomizeAnswersMap(){
  const m = {};
  for(let i=1;i<=20;i++) m[`Q${i}`] = 1 + Math.floor(Math.random()*5);
  return m;
}
function scoreLabel(n){
  const x = clampInt(n,1,5);
  return SCORE_LABEL[x] || String(x);
}

async function getScoresByPhase(answersNormalized, answersPairs){
  try{
    const res = await Promise.resolve(computeAllPhases({ answers: answersPairs, meta:{ runMode: state.runMode } }));
    const sb = res?.scoreBandByPhase || res?.phase_scores || res?.phaseScores || null;
    if (sb) return sb;
  }catch{}
  try{
    const res = await Promise.resolve(computeAllPhases(answersNormalized));
    const sb = res?.scoreBandByPhase || res?.phase_scores || res?.phaseScores || null;
    if (sb) return sb;
  }catch{}
  return {};
}

async function getPatternKeysByPhase(answersNormalized, answersPairs){
  try{
    const res = await Promise.resolve(computeAllPhases({ answers: answersPairs, meta:{ runMode: state.runMode } }));
    const pk = res?.patternKeysByPhase || res?.pattern_keys_by_phase || res?.resultKeysByPhase || res?.phasePatternKeys || null;
    if (pk) return pk;
  }catch{}
  try{
    const res = await Promise.resolve(computeAllPhases(answersNormalized));
    const pk = res?.patternKeysByPhase || res?.pattern_keys_by_phase || res?.resultKeysByPhase || res?.phasePatternKeys || null;
    if (pk) return pk;
  }catch{}
  // 任意：存在すれば利用（本紙で禁止はされていない）
  try{
    const mod = await import("./result_key_logic.js");
    const fn =
      (typeof mod.calcResultKeys === "function") ? mod.calcResultKeys :
      (typeof mod.calc_keys === "function") ? mod.calc_keys :
      (typeof mod.default === "function") ? mod.default :
      null;
    if (fn){
      const r = await Promise.resolve(fn({ answersNormalized, answers: answersNormalized }));
      const pk = r?.patternKeysByPhase || r?.pattern_keys_by_phase || r?.keysByPhase || r?.patternKeys || null;
      if (pk) return pk;
    }
  }catch{}
  return {};
}

async function computeResult(){
  if (!hasAllAnswered(1,20)) return null;

  const answersNormalized = buildAnswersNormalized();
  const answersPairs = buildAnswersPairs();

  // rarity
  let rarity = "C";
  try{
    const r = await Promise.resolve(calcRarity(answersNormalized));
    rarity = (r && typeof r === "object" ? (r.rarity ?? r.rarityOverall ?? r.value) : r) || "C";
  }catch{}

  // alias
  let nickname = "";
  let aliasAsset = "";
  try{
    const a = await Promise.resolve(calcAlias(answersNormalized, rarity));
    if (a && typeof a === "object"){
      nickname = a.nickname || a.aliasOverall || a.name || "";
      aliasAsset = a.aliasAssetOverall || a.asset || a.image || "";
    } else {
      nickname = String(a || "");
    }
  }catch{}

  const scoreBandByPhase = await getScoresByPhase(answersNormalized, answersPairs);
  const patternKeysByPhase = await getPatternKeysByPhase(answersNormalized, answersPairs);
  const saveCode = await stableHash(JSON.stringify(answersNormalized));

  const phaseTexts = [];
  for (const phaseKey of PHASE_KEYS){
    const patternKey = patternKeysByPhase[phaseKey] || "_default";
    const t = await Promise.resolve(getText(phaseKey, patternKey));
    phaseTexts.push({ phaseKey, patternKey, sections: t?.sections || t || {} });
  }

  const tableRows = PHASE_KEYS.map(phaseKey=>{
    const scoreN = scoreBandByPhase?.[phaseKey];
    const score = (scoreN == null) ? "" : scoreLabel(scoreN);
    const pt = phaseTexts.find(x=>x.phaseKey===phaseKey);
    const note = Array.isArray(pt?.sections?.scene?.bullets) && pt.sections.scene.bullets.length
      ? String(pt.sections.scene.bullets[0])
      : "";
    return { phaseKey, phaseLabel: PHASE_LABELS_JA[phaseKey], score, note };
  });

  return { saveCode, nickname, rarity, aliasAsset, scoreBandByPhase, patternKeysByPhase, phaseTexts, tableRows };
}

async function resolveAliasImageSrc(aliasAsset){
  const base = "./assets/alias/";
  const fallback = base + "_default.png";
  const candidate = aliasAsset ? (base + aliasAsset) : "";
  if (!candidate) return fallback;
  try{ const r = await fetch(candidate, { method:"HEAD" }); if (r.ok) return candidate; }catch{}
  return fallback;
}

/* Questions (本紙契約: 配列 / qid,text必須 / 欠損は表示しない) */
function isValidQuestion(q){
  return !!(q && typeof q === "object" && typeof q.qid === "string" && typeof q.text === "string" && q.qid && q.text);
}
function getQuestionsSlice(start,end){
  if (!Array.isArray(QUESTIONS)) return [];
  const wanted = new Set(Array.from({length:end-start+1}, (_,k)=>`Q${start+k}`));
  return QUESTIONS.filter(isValidQuestion).filter(q => wanted.has(q.qid));
}

/* render */
function render(){
  const root = $("#app");
  if (!root) return;
  root.innerHTML = "";

  if (state.screen === SCREENS.TITLE) return renderTitle(root);
  if (state.screen === SCREENS.START) return renderStart(root);
  if (state.screen === SCREENS.Q1_10) return renderQuestions(root,1,10);
  if (state.screen === SCREENS.Q11_20) return renderQuestions(root,11,20);
  if (state.screen === SCREENS.ALIAS) return renderAlias(root);
  if (state.screen === SCREENS.RESULT) return renderResult(root);
}

function renderTitle(root){
  const card = el("section",{ class:"card stack center" },
    el("h1",{ class:"h1" },"恋愛戦場タイプ診断"),
    el("div",{ class:"h2" },"あなたが下手でも悪いんでもない。逢ってないだけ。"),
    el("hr",{ class:"hr" }),
    el("div",{ id:"loopLines", class:"loopLines" }),
    el("div",{ class:"tapHint" },"画面をタップすると次へ")
  );
  card.addEventListener("click", ()=> setScreen(SCREENS.START));
  root.appendChild(card);

  const lines=["会ってる。","合ってない。","遇ってる。","遭ってない。"];
  const wrap = card.querySelector("#loopLines");
  let idx=0;
  const show=()=>{
    wrap.innerHTML="";
    for(let i=0;i<lines.length;i++){
      const j=(idx+i)%lines.length;
      wrap.appendChild(el("div",{ class:`line${i===0?"":" dim"}` }, lines[j]));
    }
    idx=(idx+1)%lines.length;
  };
  show();
  if (window.__loveDiagLoopTimer) clearInterval(window.__loveDiagLoopTimer);
  window.__loveDiagLoopTimer = setInterval(show, 400);
}

function renderStart(root){
  const card = el("section",{ class:"card stack" },
    el("h1",{ class:"h1" },"恋愛戦場タイプ診断"),
    el("div",{ class:"btnRow" },
      elBtn("診断開始","primary", ()=>{ state.runMode="manual"; saveState(); setScreen(SCREENS.Q1_10); }),
      elBtn("ランダム診断","secondary", async ()=>{ state.runMode="random"; state.answersMap=randomizeAnswersMap(); saveState(); state.result=await computeResult(); saveState(); setScreen(SCREENS.ALIAS); })
    ),
    el("div",{ class:"p" },"これは、あなたの価値や優劣・人間性を決めつける診断ではありません。"),
    el("div",{ class:"p" },"恋愛の傾向を統計的にモデル化したものであり、正解とは限りません。"),
    el("div",{ class:"p" },"恋愛心理学・行動科学・交際統計など複数研究の傾向から「出会い〜交際〜結婚」フェーズ別のデータを用いて作成しています。"),
    el("div",{ class:"small" },"※この診断は医学的・医療的評価を目的としたものではありません")
  );
  root.appendChild(card);
}

function renderQuestions(root,start,end){
  const qs = getQuestionsSlice(start,end);

  const card = el("section",{ class:"card stack" },
    el("div",{ class:"small" },`質問 ${start}〜${end}`),
    el("div",{ class:"legendInline" },
      el("span",{}, "凡例： "),
      "1=あてはまらない / 2=あまりあてはまらない / 3=どちらともいえない / 4=すこしあてはまる / 5=あてはまる"
    ),
    el("div",{ class:"qList" }, ...qs.map(q => renderQuestionItem(q))),
    el("div",{ class:"btnRow" },
      elBtn("戻る","ghost", ()=>{ if(start===1) setScreen(SCREENS.START); else setScreen(SCREENS.Q1_10); }),
      elBtn("最初へ","ghost", ()=> clearToStart()),
      elBtn("次へ","primary", async ()=>{ if(!hasAllAnswered(start,end)) return; if(end===10){ setScreen(SCREENS.Q11_20); return; } state.result=await computeResult(); saveState(); setScreen(SCREENS.ALIAS); }, { disabled: !hasAllAnswered(start,end), "data-role":"next" })
    )
  );

  card.addEventListener("click", ()=>{
    const nextBtn = card.querySelector('button[data-role="next"]');
    if (nextBtn) nextBtn.disabled = !hasAllAnswered(start,end);
  });

  root.appendChild(card);
}

function renderQuestionItem(q){
  const qid = q.qid;
  const selected = state.answersMap[qid] ?? null;

  const choices = el("div",{ class:"choices", role:"group", "aria-label":`${qid} choices` });
  for(let v=1;v<=5;v++){
    const btn = el("button",{ class:`choiceBtn${selected===v?" selected":""}`, type:"button" }, String(v));
    btn.addEventListener("click", ()=>{
      state.answersMap[qid]=v; saveState();
      [...choices.querySelectorAll("button")].forEach((b,idx)=> b.classList.toggle("selected",(idx+1)===v));
    });
    choices.appendChild(btn);
  }

  return el("div",{ class:"qItem" }, el("p",{ class:"qTitle" }, q.text), choices);
}

function renderAlias(root){
  const nickname = state.result?.nickname || "";
  const card = el("section",{ class:"card stack" },
    el("div",{ class:"aliasRow" },
      el("div",{ class:"aliasTextBlock" }, el("h1",{ class:"h1" }, nickname || "—")),
      el("div",{ class:"aliasImgWrap" }, el("img",{ alt:"", src:"./assets/alias/_default.png" }))
    ),
    el("div",{ class:"tapHint" },"画面をタップすると次へ")
  );
  const img=card.querySelector("img");
  resolveAliasImageSrc(state.result?.aliasAsset || "").then(src=>{ if(img) img.src=src; });
  card.addEventListener("click", ()=> setScreen(SCREENS.RESULT));
  root.appendChild(card);
}

function renderResult(root){
  const r=state.result;
  if(!r){
    root.appendChild(el("section",{ class:"card stack" }, el("div",{ class:"p" },"結果がありません。"), el("div",{ class:"btnRow" }, elBtn("診断開始","primary", ()=> setScreen(SCREENS.START)) )));
    return;
  }

  const container = el("div",{ class:"stack" });

  // 保存コード（右上・ラベルなし）
  container.appendChild(el("div",{ class:"topRightCode" }, el("div",{ class:"saveCode" }, r.saveCode || "")));

  // 異名・レアリティ（ラベルあり）＋画像（右）
  const aliasBlock = el("section",{ class:"card stack" },
    el("div",{ class:"aliasRow" },
      el("div",{ class:"aliasTextBlock" },
        el("div",{ class:"p" }, `異名： ${r.nickname || "—"}`),
        el("div",{ class:"p" }, `レアリティ： ${r.rarity || "—"}`)
      ),
      el("div",{ class:"aliasImgWrap" }, el("img",{ alt:"", src:"./assets/alias/_default.png" }))
    )
  );
  const img = aliasBlock.querySelector("img");
  resolveAliasImageSrc(r.aliasAsset || "").then(src=>{ if(img) img.src=src; });
  container.appendChild(aliasBlock);

  // 結果表
  const table = el("table",{ class:"table" },
    el("thead",{}, el("tr",{}, el("th",{},"フェーズ"), el("th",{},"スコア"), el("th",{},"備考"))),
    el("tbody",{}, ...r.tableRows.map(row => el("tr",{}, el("td",{},row.phaseLabel), el("td",{},String(row.score??"")), el("td",{},row.note||""))))
  );
  container.appendChild(el("section",{ class:"card stack" }, table));

  // レアリティ凡例（横書き）
  const legend = el("div",{ style:"display:flex;flex-wrap:wrap;gap:12px;font-size:13px" },
    ...RARITY_LEGEND_FIXED.map(([k,v])=> el("div",{ style:"display:flex;gap:6px" }, el("div",{ class:"small" },k), el("div",{},v)))
  );
  container.appendChild(el("section",{ class:"card stack" }, legend));

  // フェーズ詳細
  const detailsWrap = el("section",{ class:"stack" },
    ...PHASE_KEYS.map(phaseKey=>{
      const pt = r.phaseTexts.find(x=>x.phaseKey===phaseKey);
      return buildPhaseDetails(phaseKey, pt?.sections || {});
    })
  );
  container.appendChild(detailsWrap);

  // ボタン2つ
  container.appendChild(el("section",{ class:"card stack" },
    el("div",{ class:"btnRow" },
      elBtn("もう一度診断","primary", ()=> clearToStart()),
      elBtn("結果を保存","secondary", async ()=>{ await copyToClipboard(r.saveCode||""); toast("保存コードをコピーしました"); })
    )
  ));

  root.appendChild(container);
}

function buildPhaseDetails(phaseKey, sections){
  const d = el("details",{ open:false }, el("summary",{}, PHASE_LABELS_JA[phaseKey]));
  const order=[["scene","よくあるシーン"],["why","なぜ起きるのか"],["awareness","自覚ポイント"],["recommend","おすすめ"]];
  for(const [k,label] of order){
    const sec = sections?.[k] || {};
    const bullets = Array.isArray(sec.bullets)?sec.bullets:[];
    const sentences = Array.isArray(sec.sentences)?sec.sentences:[];
    d.appendChild(el("div",{},
      el("div",{ class:"secTitle" }, label),
      bullets.length ? el("ul",{ class:"bullets" }, ...bullets.map(x=>el("li",{},String(x)))) : el("div",{ class:"small" },""),
      sentences.length ? el("div",{ class:"sentences" }, sentences.map(x=>String(x)).join(" ")) : el("div",{ class:"small" },"")
    ));
  }
  return d;
}

/* helpers */
function el(tag, attrs={}, ...children){
  const node=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs||{})){
    if(k==="class") node.className=v;
    else node.setAttribute(k, v);
  }
  for(const c of children.flat()){
    if(c==null) continue;
    node.appendChild(typeof c==="string"?document.createTextNode(c):c);
  }
  return node;
}
function elBtn(label, kind, onClick, extraAttrs={}){
  const btn=el("button",{ type:"button", class: kind||"", ...extraAttrs }, label);
  btn.addEventListener("click",(e)=>{ e.stopPropagation(); onClick?.(e); });
  return btn;
}
async function copyToClipboard(text){
  try{ await navigator.clipboard.writeText(text); }
  catch{
    const ta=el("textarea",{ style:"position:fixed;left:-9999px;top:-9999px" }, text);
    document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
}
let toastTimer=null;
function toast(msg){
  const existing=document.getElementById("toast"); if(existing) existing.remove();
  const t=el("div",{ id:"toast", style:"position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#111827;color:#fff;padding:10px 12px;border-radius:12px;font-size:13px;opacity:.92;z-index:9999;" }, msg);
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=> t.remove(), 1300);
}

document.addEventListener("DOMContentLoaded", ()=>{ restoreState(); render(); window.scrollTo({ top: (state.scrollByScreen[state.screen] ?? 0), behavior:"auto" }); });
