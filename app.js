// app.js (ES Modules) — UI/制御のみ
import { QUESTIONS } from "./data_questions.js";
import { computeAllPhases } from "./contrib_table.js";
import { calcRarity } from "./rarity_logic.js";
import { calcAlias } from "./alias_logic.js";
import * as TextMod from "./text.js";

const APP_KEY = "love_diag_state_v1";

const PHASES = [
  { key: "matching", label: "出会い（マッチング）" },
  { key: "firstMeet", label: "初対面" },
  { key: "date", label: "デート" },
  { key: "relationship", label: "交際" },
  { key: "marriage", label: "結婚" },
];

const CHOICES = [
  { n: 1, t: "あてはまらない" },
  { n: 2, t: "" },
  { n: 3, t: "" },
  { n: 4, t: "" },
  { n: 5, t: "あてはまる" },
];

function nowMs(){ return Date.now(); }

function safeJsonParse(s, fallback){
  try{ return JSON.parse(s); }catch{ return fallback; }
}

function getState(){
  const raw = sessionStorage.getItem(APP_KEY);
  const st = safeJsonParse(raw, null);
  if(!st) return initState();
  return {
    ...initState(),
    ...st,
    answersByQid: st.answersByQid || {},
    scrollByScreen: st.scrollByScreen || {},
  };
}

function setState(patch){
  state = { ...state, ...patch };
  sessionStorage.setItem(APP_KEY, JSON.stringify(state));
}

function initState(){
  return {
    screen: "title", // title | intro | q | alias | result
    qPage: 1,        // 1..2
    answersByQid: {},// {Q1:1..5}
    result: null,    // computed object
    scrollByScreen: {},
    lastUpdated: nowMs(),
  };
}

function clearAll(){
  sessionStorage.removeItem(APP_KEY);
  state = initState();
}

function qids(){
  return QUESTIONS.map(q => q.qid);
}

function normalizeAnswers(){
  // UI入力: [{qid,v}] (長さ20) を answersNormalized: number[20] にする
  const list = qids().map(qid => ({ qid, v: state.answersByQid[qid] }));
  if(list.some(x => typeof x.v !== "number")) return null;

  // sort Q1..Q20
  list.sort((a,b) => {
    const na = parseInt(a.qid.replace("Q",""), 10);
    const nb = parseInt(b.qid.replace("Q",""), 10);
    return na - nb;
  });

  return list.map(x => x.v);
}

function makeSaveCode(result){
  // 本紙が未定義のため、安定IDとして簡易ハッシュを使用（同一回答→同一）
  const src = JSON.stringify({
    a: normalizeAnswers(),
    r: result?.rarityOverall || result?.rarity,
    al: result?.aliasOverall || result?.alias,
  });
  let h = 2166136261;
  for(let i=0;i<src.length;i++){
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const code = (h >>> 0).toString(16).toUpperCase().padStart(8,"0");
  return code.slice(0,4) + "-" + code.slice(4);
}

function tryGetText(phaseKey, patternKey){
  // text.js export は本紙に未固定のため、複数形を許容して呼ぶ（データ変換はしない）
  const fn =
    TextMod.getText ||
    TextMod.getResultText ||
    TextMod.getPhaseText ||
    TextMod.getTextByKey ||
    (TextMod.default && (typeof TextMod.default === "function" ? TextMod.default : null));

  if(typeof fn === "function"){
    return fn({ phaseKey, patternKey });
  }

  // データ直参照形式
  const data = TextMod.TEXT_DATA || TextMod.TEXT || TextMod.textData;
  if(data && data[phaseKey] && data[phaseKey][patternKey]) return data[phaseKey][patternKey];

  return null;
}

function computeResult(){
  const answersNormalized = normalizeAnswers();
  if(!answersNormalized) return { ok:false, error:"未回答があります。" };

  // --- call locked logic modules (black boxes) ---
  const phaseScores = computeAllPhases({ answers: answersNormalized });
  const rarityRes = calcRarity(answersNormalized);
  const rarityOverall = (typeof rarityRes === "string") ? rarityRes : (rarityRes?.rarity || rarityRes?.rarityOverall);
  const aliasRes = calcAlias(answersNormalized, rarityOverall);
  const aliasOverall = (typeof aliasRes === "string") ? aliasRes : (aliasRes?.alias || aliasRes?.aliasOverall || aliasRes?.name);

  // patternKey extraction (prefer logic output)
  const patternKeys = {};
  // supported structures:
  // 1) phaseScores.patternKeys[phaseKey] = "DT-07"
  // 2) phaseScores[phaseKey].patternKey = "DT-07"
  // 3) phaseScores.phases[phaseKey].patternKey = ...
  if(phaseScores?.patternKeys){
    for(const p of PHASES) patternKeys[p.key] = phaseScores.patternKeys[p.key];
  }else if(phaseScores?.phases){
    for(const p of PHASES) patternKeys[p.key] = phaseScores.phases?.[p.key]?.patternKey;
  }else{
    for(const p of PHASES) patternKeys[p.key] = phaseScores?.[p.key]?.patternKey;
  }

  // Build text by phase (if keys exist)
  const texts = {};
  for(const p of PHASES){
    const pk = patternKeys[p.key];
    if(typeof pk === "string"){
      const t = tryGetText(p.key, pk);
      if(t) texts[p.key] = { patternKey: pk, ...t };
    }
  }

  const result = {
    answersNormalized,
    phaseScores,
    rarityOverall,
    aliasOverall,
    texts,
  };
  result.saveCode = makeSaveCode(result);
  return { ok:true, result };
}

function el(tag, attrs={}, ...children){
  const e = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs||{})){
    if(k === "class") e.className = v;
    else if(k === "html") e.innerHTML = v;
    else if(k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, String(v));
  }
  for(const c of children){
    if(c == null) continue;
    if(typeof c === "string") e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  }
  return e;
}

function saveScroll(){
  state.scrollByScreen[state.screen] = window.scrollY || 0;
  setState({ scrollByScreen: state.scrollByScreen, lastUpdated: nowMs() });
}

function restoreScroll(){
  const y = state.scrollByScreen?.[state.screen];
  if(typeof y === "number"){
    requestAnimationFrame(() => window.scrollTo(0, y));
  }else{
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }
}

function nav(screen, patch={}){
  saveScroll();
  setState({ screen, ...patch, lastUpdated: nowMs() });
  render();
  restoreScroll();
}

function confirmReset(){
  // 本紙に文言未指定 → 最小の確認
  return window.confirm("回答をリセットして最初へ戻ります。よろしいですか？");
}

function renderTitle(){
  const shell = el("div", {class:"shell"});
  const card = el("div", {class:"card section"});
  card.appendChild(el("div", {class:"h1"}, "恋愛戦場タイプ診断"));
  card.appendChild(el("div", {class:"sub"}, "あなたが下手でも悪いんでもない。逢ってないだけ。"));

  const loopWrap = el("div", {class:"kv"});
  const loop = el("div", {class:"loopLine", id:"loopLine"}, "会ってる。");
  loopWrap.appendChild(loop);
  card.appendChild(loopWrap);

  const btnRow = el("div", {class:"row"});
  btnRow.appendChild(el("button", {class:"btn btnPrimary", onClick: () => nav("intro")}, "次へ"));
  card.appendChild(btnRow);

  shell.appendChild(card);

  // loop animation (0.4s diff fade)
  setTimeout(() => {
    const lines = ["会ってる。","合ってない。","遇ってる。","遭ってない。"];
    let i = 0;
    const node = document.getElementById("loopLine");
    if(!node) return;
    node.classList.add("show");
    setInterval(() => {
      i = (i+1) % lines.length;
      node.classList.remove("show");
      setTimeout(() => {
        node.textContent = lines[i];
        node.classList.add("show");
      }, 160);
    }, 400);
  }, 30);

  return shell;
}

function renderIntro(){
  const shell = el("div", {class:"shell"});
  const card = el("div", {class:"card"});
  const sec = el("div", {class:"section"});
  sec.appendChild(el("div", {class:"h1"}, "恋愛戦場タイプ診断"));
  sec.appendChild(el("div", {class:"sub"}, "あなたが下手でも悪いんでもない。逢ってないだけ。"));

  const p1 = `これは、あなたの価値や優劣・人間性を決めつける診断ではありません。
恋愛の傾向を統計的にモデル化したものであり、正解とは限りません。`;
  const p2 = `恋愛心理学・行動科学・交際統計など複数研究の傾向から
「出会い〜交際〜結婚」フェーズ別のデータを用いて作成しています。`;
  sec.appendChild(el("p", {class:"p"}, p1));
  sec.appendChild(el("p", {class:"p"}, p2));

  sec.appendChild(el("p", {class:"notice"}, "※この診断は医学的・医療的評価を目的としたものではありません"));

  const row = el("div", {class:"row"});
  row.appendChild(el("button", {class:"btn btnGhost", onClick: () => nav("title")}, "戻る"));
  row.appendChild(el("button", {class:"btn btnPrimary", onClick: () => nav("q", { qPage: 1 })}, "▶ 診断を始める"));
  sec.appendChild(row);

  card.appendChild(sec);
  shell.appendChild(card);
  return shell;
}

function renderQuestionPage(page){
  const shell = el("div", {class:"shell"});
  const totalPages = 2;
  const pageStart = (page-1)*10;
  const slice = QUESTIONS.slice(pageStart, pageStart+10);

  const top = el("div", {class:"pageTopBar"});
  top.appendChild(el("div", {class:"badge"}, `質問 ${page}/${totalPages}`));
  const prog = el("div", {class:"progress", style:"flex:1; max-width:320px"});
  const inner = el("div", {style:`width:${Math.round((page/totalPages)*100)}%`});
  prog.appendChild(inner);
  top.appendChild(prog);

  const resetBtn = el("button", {class:"btn btnDanger", onClick: () => {
    if(!confirmReset()) return;
    clearAll();
    nav("intro");
  }}, "最初へ");
  top.appendChild(resetBtn);

  shell.appendChild(top);

  const wrap = el("div", {class:"card section"});
  for(const q of slice){
    const box = el("div", {class:"qCard", "data-qid": q.qid});
    box.appendChild(el("div", {class:"qTitle"}, `${q.qid}　${q.text}`));

    const ans = el("div", {class:"answers"});
    const cur = state.answersByQid[q.qid];

    for(const c of CHOICES){
      const b = el("div", {class:"choice" + (cur===c.n ? " sel":""), "data-val": String(c.n)});
      b.appendChild(el("span", {class:"n"}, String(c.n)));
      if(c.t) b.appendChild(el("span", {class:"t"}, c.t));
      ans.appendChild(b);
    }

    // click handler (keep scroll position)
    ans.addEventListener("click", (ev) => {
      const tgt = ev.target.closest(".choice");
      if(!tgt) return;
      const val = Number(tgt.getAttribute("data-val"));
      const y = window.scrollY || 0;
      state.answersByQid[q.qid] = val;
      setState({ answersByQid: state.answersByQid, lastUpdated: nowMs() });
      // update selection UI in place (no full rerender)
      ans.querySelectorAll(".choice").forEach(n => n.classList.toggle("sel", Number(n.getAttribute("data-val"))===val));
      window.scrollTo(0, y);
    });

    wrap.appendChild(box);
    wrap.appendChild(el("div",{class:"hr"}));
  }

  // error / footer
  const footer = el("div", {class:"footerBar"});
  const innerBar = el("div", {class:"footerBarInner"});
  const back = el("button", {class:"btn", onClick: () => nav(page===1 ? "intro" : "q", { qPage: page-1 })}, "戻る");
  const next = el("button", {class:"btn btnPrimary", onClick: () => {
    const norm = normalizeAnswers();
    if(page < totalPages){
      nav("q", { qPage: page+1 });
      return;
    }
    if(!norm){
      showInlineError("未回答があります。すべて回答してください。");
      return;
    }
    const cr = computeResult();
    if(!cr.ok){
      showInlineError(cr.error || "エラーが発生しました。");
      return;
    }
    setState({ result: cr.result });
    nav("alias");
  }}, page < totalPages ? "次へ" : "結果へ");

  innerBar.appendChild(back);
  innerBar.appendChild(next);
  footer.appendChild(innerBar);

  const err = el("div", {class:"error", id:"inlineError", style:"display:none"});
  wrap.appendChild(err);
  wrap.appendChild(footer);

  shell.appendChild(wrap);

  function showInlineError(msg){
    const node = document.getElementById("inlineError");
    if(!node) return;
    node.textContent = msg;
    node.style.display = "block";
  }

  return shell;
}

function aliasAssetPath(aliasOverall){
  // 本紙（ユーザー固定）: assets/alias/ に格納。画像が無い場合 _default.png
  // まず「レアリティ.png」等の固定名がある前提は置かない。aliasOverallをファイル名に使える場合のみ使う。
  // 実際の命名規則は別紙側で担保される想定。ここでは安全にフォールバック。
  const safe = String(aliasOverall || "").trim();
  // if it contains path separators, ignore
  if(!safe || /[\\/]/.test(safe)) return "./assets/alias/_default.png";
  // if file naming uses prefix "Rarity_Alias.png" etc, we cannot infer here.
  // Use _default and rely on alias_logic.js / asset conventions elsewhere.
  return "./assets/alias/_default.png";
}

function renderAliasOnly(){
  const shell = el("div", {class:"shell"});
  const r = state.result;
  const alias = r?.aliasOverall || "";
  const imgSrc = aliasAssetPath(alias);

  const card = el("div", {class:"card fullTap", onClick: () => nav("result")});
  const inner = el("div", {class:"fullTapInner"});
  const grid = el("div", {class:"resultGrid"});
  const left = el("div", {class:"resultLeft"});
  left.appendChild(el("div", {class:"kvLine"}, el("span",{class:"kvValue", style:"font-size:28px"}, alias)));
  left.appendChild(el("div", {class:"fullTapHint"}, "（画面をタップして結果へ）"));
  const right = el("div", {class:"resultRight"});
  right.appendChild(el("img", {class:"aliasImg", src: imgSrc, alt: alias, onError: (e)=>{ e.target.src = "./assets/alias/_default.png"; }}));
  grid.appendChild(left);
  grid.appendChild(right);
  inner.appendChild(grid);
  card.appendChild(inner);
  shell.appendChild(card);
  return shell;
}

function renderResult(){
  const shell = el("div", {class:"shell"});
  const r = state.result;
  if(!r){
    return renderIntro();
  }

  const saveCode = r.saveCode || makeSaveCode(r);
  const alias = r.aliasOverall || "";
  const rarity = r.rarityOverall || "";
  const imgSrc = aliasAssetPath(alias);

  const wrap = el("div", {class:"card", style:"position:relative"});
  wrap.appendChild(el("div", {class:"saveCode"}, saveCode));

  const grid = el("div", {class:"resultGrid"});
  const left = el("div", {class:"resultLeft"});
  left.appendChild(el("div", {class:"h2"}, "診断結果"));

  left.appendChild(el("div", {class:"kvLine"},
    el("div", {class:"kvLabel"}, "レアリティ:"),
    el("div", {class:"kvValue"}, rarity)
  ));
  left.appendChild(el("div", {class:"kvLine"},
    el("div", {class:"kvLabel"}, "異名:"),
    el("div", {class:"kvValue"}, alias)
  ));

  // phase sections — spec says only elements explicitly in本紙; include these only if text exists.
  for(const p of PHASES){
    const t = r.texts?.[p.key];
    if(!t) continue;
    const pk = t.patternKey;
    const sec = t.sections || t; // allow either {sections:{...}} or direct
    const card = el("div", {class:"qCard"});
    card.appendChild(el("div", {class:"qTitle"}, `${p.label}（${pk}）`));

    const parts = [
      ["よくあるシーン", sec.scene],
      ["なぜ起きるのか", sec.why],
      ["自覚ポイント", sec.awareness],
      ["おすすめ", sec.recommend],
    ];

    for(const [title, obj] of parts){
      if(!obj) continue;
      card.appendChild(el("div", {class:"small", style:"margin-top:10px"}, title));
      if(Array.isArray(obj.bullets)){
        const ul = el("ul", {class:"small", style:"margin:6px 0 0 18px; color:var(--text)"});
        for(const b of obj.bullets.slice(0,2)) ul.appendChild(el("li", {}, b));
        card.appendChild(ul);
      }
      if(Array.isArray(obj.sentences)){
        card.appendChild(el("div", {class:"small", style:"margin-top:6px; color:var(--muted)"}, obj.sentences.slice(0,2).join(" ")));
      }
      if(typeof obj.tail === "string"){
        card.appendChild(el("div", {class:"small", style:"margin-top:6px; color:var(--muted)"}, obj.tail));
      }
    }

    // matching only: attract line if present
    if(sec.matchingExtra){
      const m = sec.matchingExtra;
      card.appendChild(el("div", {class:"small", style:"margin-top:10px"}, "好かれやすい人"));
      if(Array.isArray(m.bullets)){
        const ul = el("ul", {class:"small", style:"margin:6px 0 0 18px; color:var(--text)"});
        for(const b of m.bullets.slice(0,2)) ul.appendChild(el("li", {}, b));
        card.appendChild(ul);
      }
      if(typeof m.tail === "string"){
        card.appendChild(el("div", {class:"small", style:"margin-top:6px; color:var(--muted)"}, m.tail));
      }
    }

    left.appendChild(card);
  }

  // rarity legend (under results)
  const legend = el("div", {class:"legend"});
  const legendItems = [
    ["C","よくある"],["U","少し珍しい"],["R","珍しい"],["E","かなり珍しい"],["M","希少"],["Lg","伝説級"],["Sg","唯一"]
  ];
  for(const [k, t] of legendItems){
    legend.appendChild(el("div", {class:"legendItem"}, `${k}: ${t}`));
  }
  left.appendChild(legend);

  const right = el("div", {class:"resultRight"});
  right.appendChild(el("img", {class:"aliasImg", src: imgSrc, alt: alias, onError: (e)=>{ e.target.src = "./assets/alias/_default.png"; }}));

  grid.appendChild(left);
  grid.appendChild(right);
  wrap.appendChild(grid);

  // controls
  const controls = el("div", {class:"section"});
  const row = el("div", {class:"row"});
  row.appendChild(el("button", {class:"btn btnGhost", onClick: async () => {
    try{
      await navigator.clipboard.writeText(saveCode);
      alert("コピーしました");
    }catch{
      prompt("コピーしてください", saveCode);
    }
  }}, "保存コードをコピー"));
  row.appendChild(el("button", {class:"btn btnPrimary", onClick: () => {
    clearAll();
    nav("intro");
  }}, "もう一度診断する"));
  controls.appendChild(row);
  wrap.appendChild(el("div",{class:"hr"}));
  wrap.appendChild(controls);

  shell.appendChild(wrap);
  return shell;
}

function render(){
  const root = document.getElementById("app");
  if(!root) return;
  root.innerHTML = "";
  root.appendChild(el("div", {class:"shell"})); // placeholder to avoid jump

  const shell = (() => {
    if(state.screen === "title") return renderTitle();
    if(state.screen === "intro") return renderIntro();
    if(state.screen === "q") return renderQuestionPage(state.qPage);
    if(state.screen === "alias") return renderAliasOnly();
    if(state.screen === "result") return renderResult();
    return renderTitle();
  })();

  root.innerHTML = "";
  root.appendChild(shell);
}

let state = getState();

window.addEventListener("beforeunload", () => {
  saveScroll();
});

// initial
document.addEventListener("DOMContentLoaded", () => {
  render();
  restoreScroll();
});
