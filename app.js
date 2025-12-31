import { QUESTIONS } from "./data_questions.js";
import { computeAllPhases } from "./contrib_table.js";
import { calcRarity } from "./rarity_logic.js";
import { calcAlias } from "./alias_logic.js";
import { getText } from "./text.js";

/**
 * 本紙に基づくUI・制御のみ（算出ロジックは別紙ブラックボックス）
 * - index.html からの読み込みは app.js のみ（type=module）
 * - 初期化はDOMContentLoaded後
 */

const PHASE_KEYS = ["matching","firstMeet","date","relationship","marriage"];
const PHASE_LABELS_JA = {
  matching: "出会い（マッチング）",
  firstMeet: "初対面",
  date: "デート",
  relationship: "交際",
  marriage: "結婚"
};

const STORAGE_KEY = "love_diag_state_v1";

const RARITY_LEGEND_FIXED = [
  ["C",  "35%"],
  ["U",  "25%"],
  ["R",  "20%"],
  ["E",  "12%"],
  ["M",  "6%"],
  ["Lg", "1.5%"],
  ["Sg", "0.5%"],
];

// 画面ID
const SCREENS = {
  TITLE: "title",
  START: "start",
  Q1_10: "q1_10",
  Q11_20: "q11_20",
  ALIAS: "alias",
  RESULT: "result",
};

// 状態（同一タブ内、リロード復元はlocalStorage）
const state = {
  screen: SCREENS.TITLE,
  // answersMap: { "Q1": 1..5, ... }
  answersMap: {},
  result: null,
  runMode: "manual", // "manual"|"random"
  // 画面ごとのスクロール位置
  scrollByScreen: {},
};

function $(sel){ return document.querySelector(sel); }

function clampInt(n, min, max){
  const x = Number.parseInt(n, 10);
  if (Number.isNaN(x)) return min;
  return Math.min(max, Math.max(min, x));
}

function safeJsonParse(s, fallback){
  try{ return JSON.parse(s); } catch { return fallback; }
}

function stableHash(str){
  // 簡易・決定論：SHA-256 -> base36(短縮)
  const enc = new TextEncoder().encode(str);
  return crypto.subtle.digest("SHA-256", enc).then(buf=>{
    const arr = Array.from(new Uint8Array(buf));
    // 先頭10byteだけで短縮
    let hex = arr.slice(0, 10).map(b=>b.toString(16).padStart(2,"0")).join("");
    // BigInt -> base36
    const bi = BigInt("0x" + hex);
    return bi.toString(36).toUpperCase().padStart(8,"0").slice(0, 10);
  });
}

function saveState(){
  const payload = {
    screen: state.screen,
    answersMap: state.answersMap,
    result: state.result,
    runMode: state.runMode,
    scrollByScreen: state.scrollByScreen,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function restoreState(){
  const raw = localStorage.getItem(STORAGE_KEY);
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
  // スクロール位置保存
  state.scrollByScreen[state.screen] = window.scrollY || 0;
  state.screen = next;
  saveState();
  render();
  // スクロール復元（不自然に飛ばないように）
  const y = state.scrollByScreen[next] ?? 0;
  window.scrollTo({ top: y, behavior: "auto" });
}

function clearAll(){
  state.screen = SCREENS.TITLE;
  state.answersMap = {};
  state.result = null;
  state.runMode = "manual";
  state.scrollByScreen = {};
  localStorage.removeItem(STORAGE_KEY);
  render();
}

function buildAnswersArrayInOrder(){
  // UI入力 { qid, v } の配列（長さ20）→ 本紙で昇順正規化して配列化
  const ordered = [];
  for (let i = 1; i <= 20; i++){
    const qid = `Q${i}`;
    const v = state.answersMap[qid];
    ordered.push(clampInt(v, 1, 5));
  }
  return ordered;
}

function hasAllAnswered(rangeStart, rangeEnd){
  for (let i = rangeStart; i <= rangeEnd; i++){
    if (!state.answersMap[`Q${i}`]) return false;
  }
  return true;
}

function randomAnswersMap(){
  const m = {};
  for (let i=1; i<=20; i++){
    m[`Q${i}`] = 1 + Math.floor(Math.random()*5);
  }
  return m;
}

async function computeResult(){
  // 未回答が存在する状態では正規化・別紙引き渡しを行わない（本紙）
  if (!hasAllAnswered(1, 20)) return null;

  const answersNormalized = buildAnswersArrayInOrder();

  // 別紙：レアリティ（全体1つ）
  const rarityRes = await Promise.resolve(calcRarity(answersNormalized));
  const rarity = (rarityRes && typeof rarityRes === "object" ? rarityRes.rarity : rarityRes) || "C";

  // 別紙：異名（レアリティを入力）
  const aliasRes = await Promise.resolve(calcAlias(answersNormalized, rarity));
  const nickname = (aliasRes && typeof aliasRes === "object" ? (aliasRes.aliasOverall || aliasRes.nickname || "") : String(aliasRes || ""));

  // 異名画像アセット名（alias_logicが返す想定）
  const aliasAsset = (aliasRes && typeof aliasRes === "object" ? (aliasRes.aliasAssetOverall || "") : "");

  // 別紙：フェーズ採点等（ブラックボックス）
  // 本紙の公開I/Oは computeAllPhases(input)
  const phasesRes = await Promise.resolve(
    computeAllPhases({ answers: answersNormalized, meta: { runMode: state.runMode } })
  );

  // 想定される取り出し（別紙が返す形に合わせて“受け取れる範囲で”）
  const scoreBandByPhase =
    (phasesRes && phasesRes.scoreBandByPhase) ||
    (phasesRes && phasesRes.phase_scores) ||
    (phasesRes && phasesRes.phaseScores) ||
    {};

  const patternKeysByPhase =
    (phasesRes && phasesRes.patternKeysByPhase) ||
    (phasesRes && phasesRes.pattern_keys_by_phase) ||
    {};

  // 保存コード：answersから決定論生成（リロード復元のため）
  const saveCode = await stableHash(JSON.stringify(answersNormalized));

  // text.js で文章取得（本紙I/O）
  const phaseTexts = [];
  for (const phaseKey of PHASE_KEYS){
    const patternKey = patternKeysByPhase[phaseKey] || "_default";
    const t = await Promise.resolve(getText(phaseKey, patternKey));
    phaseTexts.push({ phaseKey, patternKey, sections: t?.sections || t || {} });
  }

  // 表：備考は「よくあるシーン箇条書き1つ」（本紙G-2）
  const tableRows = PHASE_KEYS.map(phaseKey=>{
    const score = scoreBandByPhase[phaseKey] ?? "";
    const phaseText = phaseTexts.find(x=>x.phaseKey===phaseKey);
    const sceneBullets = phaseText?.sections?.scene?.bullets;
    const note = Array.isArray(sceneBullets) && sceneBullets.length ? String(sceneBullets[0]) : "";
    return { phaseKey, phaseLabel: PHASE_LABELS_JA[phaseKey], score, note };
  });

  return {
    saveCode,
    nickname,
    rarity,
    aliasAsset,
    scoreBandByPhase,
    tableRows,
    patternKeysByPhase: Object.fromEntries(PHASE_KEYS.map(k=>[k, patternKeysByPhase[k] || "_default"])),
    phaseTexts,
    debug: (phasesRes && phasesRes.debug) ? phasesRes.debug : undefined,
  };
}

async function resolveAliasImageSrc(rarity, aliasAssetOverall){
  // alias_logic が「ファイル名」を返す想定。パス規約は本紙未定義のため任意で assets/alias/ を採用。
  // 欠損時は _default.png にフォールバック。
  const baseDir = "./assets/alias/";
  const fallback = baseDir + "_default.png";
  const candidate = aliasAssetOverall ? (baseDir + aliasAssetOverall) : "";
  if (!candidate) return fallback;

  // 存在チェック（同一オリジン前提）
  try{
    const r = await fetch(candidate, { method: "HEAD" });
    if (r.ok) return candidate;
  }catch{}

  // 拡張子だけ差し替え（gif/png）
  const m = candidate.match(/\.(png|gif)$/i);
  if (m){
    const swapped = candidate.replace(/\.(png|gif)$/i, (m[1].toLowerCase()==="png") ? ".gif" : ".png");
    try{
      const r2 = await fetch(swapped, { method: "HEAD" });
      if (r2.ok) return swapped;
    }catch{}
  }
  return fallback;
}

/* -------------------- Render -------------------- */

function render(){
  const root = $("#app");
  if (!root) return;
  root.innerHTML = "";

  if (state.screen === SCREENS.TITLE) return renderTitle(root);
  if (state.screen === SCREENS.START) return renderStart(root);
  if (state.screen === SCREENS.Q1_10) return renderQuestions(root, 1, 10);
  if (state.screen === SCREENS.Q11_20) return renderQuestions(root, 11, 20);
  if (state.screen === SCREENS.ALIAS) return renderAlias(root);
  if (state.screen === SCREENS.RESULT) return renderResult(root);
}

function renderTitle(root){
  const card = el("section", { class: "card stack center", "data-screen": "title" },
    el("h1", { class:"h1" }, "恋愛戦場タイプ診断"),
    el("div", { class:"h2" }, "あなたが下手でも悪いんでもない。逢ってないだけ。"),
    el("hr", { class:"hr" }),
    el("div", { class:"stack", style:"gap:6px" },
      el("div", { class:"p" }, "会ってる。"),
      el("div", { class:"p" }, "合ってない。"),
      el("div", { class:"p" }, "遇ってる。"),
      el("div", { class:"p" }, "遭ってない。"),
    ),
    el("div", { class:"tapHint" }, "画面をタップすると次へ"),
  );

  // タップで遷移（ボタンなし）
  card.addEventListener("click", ()=> setScreen(SCREENS.START));
  root.appendChild(card);
}

function renderStart(root){
  const card = el("section", { class:"card stack", "data-screen":"start" },
    el("h1", { class:"h1" }, "恋愛戦場タイプ診断"),
    el("div", { class:"p" },
      "これは、あなたの価値や優劣・人間性を決めつける診断ではありません。"
    ),
    el("div", { class:"p" },
      "恋愛の傾向を統計的にモデル化したものであり、正解とは限りません。"
    ),
    el("div", { class:"p" },
      "恋愛心理学・行動科学・交際統計など複数研究の傾向から「出会い〜交際〜結婚」フェーズ別のデータを用いて作成しています。"
    ),
    el("div", { class:"btnRow" },
      elBtn("診断開始", "primary", ()=>{
        state.runMode = "manual";
        saveState();
        setScreen(SCREENS.Q1_10);
      }),
      elBtn("ランダム診断", "secondary", async ()=>{
        state.runMode = "random";
        state.answersMap = randomAnswersMap();
        saveState();
        const res = await computeResult();
        state.result = res;
        saveState();
        setScreen(SCREENS.ALIAS);
      }),
    ),
    el("div", { class:"small" }, "※この診断は医学的・医療的評価を目的としたものではありません"),
  );

  root.appendChild(card);
}

function renderQuestions(root, start, end){
  const pageTitle = `${start}〜${end}`;
  const card = el("section", { class:"card stack", "data-screen":"questions" },
    el("div", { class:"small" }, `質問 ${pageTitle}`),
    el("div", { class:"qList" }, ...buildQuestionItems(start, end)),
    el("div", { class:"btnRow" },
      elBtn("戻る", "ghost", ()=>{
        if (start === 1) setScreen(SCREENS.START);
        else setScreen(SCREENS.Q1_10);
      }),
      elBtn("最初へ", "ghost", ()=>{
        // "最初へ" は必ず回答クリア（別紙質問定義のルール。UI実装として採用）
        state.answersMap = {};
        state.result = null;
        state.runMode = "manual";
        saveState();
        setScreen(SCREENS.START);
      }),
      elBtn("次へ", "primary", async ()=>{
        if (!hasAllAnswered(start, end)) return;
        if (end === 10){
          setScreen(SCREENS.Q11_20);
          return;
        }
        // 11-20の次は結果計算へ
        if (!hasAllAnswered(1, 20)) return;
        const res = await computeResult();
        state.result = res;
        saveState();
        setScreen(SCREENS.ALIAS);
      }, { disabled: !hasAllAnswered(start, end) })
    )
  );

  // 選択のたびに「次へ」のdisabledを更新
  card.addEventListener("click", (e)=>{
    const nextBtn = card.querySelector('button[data-role="next"]');
    if (!nextBtn) return;
    nextBtn.disabled = !hasAllAnswered(start, end);
  });

  // next button role
  const nextBtn = card.querySelector("button.primary");
  if (nextBtn) nextBtn.dataset.role = "next";

  root.appendChild(card);
}

function buildQuestionItems(start, end){
  const items = [];
  for (let i = start; i <= end; i++){
    const qid = `Q${i}`;
    const q = QUESTIONS.find(x => x.qid === qid) || { qid, text: qid };
    const selected = state.answersMap[qid] ?? null;

    const choices = el("div", { class:"choices", role:"group", "aria-label": `${qid} choices` });
    for (let v = 1; v <= 5; v++){
      const btn = el("button", { class:`choiceBtn${selected===v ? " selected":""}`, type:"button" }, String(v));
      btn.addEventListener("click", ()=>{
        state.answersMap[qid] = v;
        saveState();
        // 見た目更新
        [...choices.querySelectorAll("button")].forEach((b, idx)=>{
          b.classList.toggle("selected", (idx+1)===v);
        });
      });
      choices.appendChild(btn);
    }

    const item = el("div", { class:"qItem" },
      el("p", { class:"qTitle" }, q.text),
      choices
    );
    items.push(item);
  }
  return items;
}

function renderAlias(root){
  const nickname = state.result?.nickname || "";
  const card = el("section", { class:"card stack", "data-screen":"alias" },
    el("div", { class:"aliasRow" },
      el("div", { class:"aliasTextBlock" },
        el("h1", { class:"h1" }, nickname || "—")
      ),
      el("div", { class:"aliasImgWrap" },
        el("img", { alt:"", src:"./assets/alias/_default.png" })
      )
    ),
    el("div", { class:"tapHint" }, "画面をタップすると次へ")
  );

  // 画像差し替え（右側）
  const img = card.querySelector("img");
  const rarity = state.result?.rarity || "C";
  const aliasAsset = state.result?.aliasAsset || "";
  resolveAliasImageSrc(rarity, aliasAsset).then(src=>{
    if (img) img.src = src;
  });

  // タップで結果へ（ID等は表示しない）
  card.addEventListener("click", ()=> setScreen(SCREENS.RESULT));
  root.appendChild(card);
}

function renderResult(root){
  const r = state.result;
  if (!r){
    const card = el("section", { class:"card stack" },
      el("div", { class:"p" }, "結果がありません。"),
      el("div", { class:"btnRow" },
        elBtn("診断開始へ", "primary", ()=> setScreen(SCREENS.START))
      )
    );
    root.appendChild(card);
    return;
  }

  const container = el("div", { class:"stack", "data-screen":"result" });

  // 右上に保存コード（ラベルなし）
  container.appendChild(
    el("div", { class:"topRightCode" },
      el("div", { class:"saveCode", id:"saveCodeText" }, r.saveCode || "")
    )
  );

  // 異名 + レアリティ（ラベル文字列は固定）
  const aliasBlock = el("section", { class:"card stack" },
    el("div", { class:"aliasRow" },
      el("div", { class:"aliasTextBlock" },
        el("div", { class:"p" }, `異名： ${r.nickname || "—"}`),
        el("div", { class:"p" }, `レアリティ： ${r.rarity || "—"}`)
      ),
      el("div", { class:"aliasImgWrap" },
        el("img", { alt:"", src:"./assets/alias/_default.png" })
      )
    )
  );

  const img = aliasBlock.querySelector("img");
  resolveAliasImageSrc(r.rarity, r.aliasAsset).then(src=>{
    if (img) img.src = src;
  });

  container.appendChild(aliasBlock);

  // 表（フェーズ別：スコア/備考）
  const table = el("table", { class:"table" },
    el("thead", {},
      el("tr", {},
        el("th", {}, "フェーズ"),
        el("th", {}, "スコア"),
        el("th", {}, "備考")
      )
    ),
    el("tbody", {},
      ...r.tableRows.map(row => el("tr", {},
        el("td", {}, row.phaseLabel),
        el("td", {}, String(row.score ?? "")),
        el("td", {}, row.note || "")
      ))
    )
  );
  container.appendChild(el("section", { class:"card stack" }, table));

  // レアリティ凡例（表の下）
  const legend = el("div", { class:"legend" },
    ...RARITY_LEGEND_FIXED.map(([k, v]) => el("div", { class:"legendRow" },
      el("div", { class:"legendKey" }, k),
      el("div", {}, v)
    ))
  );
  container.appendChild(el("section", { class:"card stack" }, legend));

  // フェーズ詳細文章（折りたたみ）
  const detailsWrap = el("section", { class:"stack" },
    ...PHASE_KEYS.map(phaseKey=>{
      const pt = r.phaseTexts.find(x=>x.phaseKey===phaseKey);
      const sections = pt?.sections || {};
      return buildPhaseDetails(phaseKey, sections);
    })
  );
  container.appendChild(detailsWrap);

  // ボタン
  const btns = el("section", { class:"card stack" },
    el("div", { class:"btnRow" },
      elBtn("もう一度診断", "primary", ()=>{
        // 同一タブ内：開始へ。回答は残す/消すは本紙未定義のため、再診断＝回答クリアで開始に統一
        state.answersMap = {};
        state.result = null;
        state.runMode = "manual";
        saveState();
        setScreen(SCREENS.START);
      }),
      elBtn("結果を保存", "secondary", async ()=>{
        await copyToClipboard(r.saveCode || "");
        toast("保存コードをコピーしました");
      })
    )
  );
  container.appendChild(btns);

  // 「コピー」は近く（G-4）に。ラベルは付けない（保存コード表示は右上のみ）
  // → 上記「結果を保存」でコピーを提供（近接）。

  root.appendChild(container);
}

function buildPhaseDetails(phaseKey, sections){
  const d = el("details", { open:false },
    el("summary", {}, PHASE_LABELS_JA[phaseKey])
  );

  // 文章構造（sections: scene/why/awareness/recommend）
  const order = [
    ["scene", "よくあるシーン"],
    ["why", "なぜ起きるのか"],
    ["awareness", "自覚ポイント"],
    ["recommend", "おすすめ"],
  ];

  for (const [k, label] of order){
    const sec = sections?.[k] || {};
    const bullets = Array.isArray(sec.bullets) ? sec.bullets : [];
    const sentences = Array.isArray(sec.sentences) ? sec.sentences : [];

    const block = el("div", { class:"sectionBlock" },
      el("div", { class:"secTitle" }, label),
      bullets.length ? el("ul", { class:"bullets" }, ...bullets.map(x=>el("li", {}, String(x)))) : el("div", { class:"small" }, ""),
      sentences.length ? el("div", { class:"sentences" }, sentences.map(x=>String(x)).join(" ")) : el("div", { class:"small" }, "")
    );
    d.appendChild(block);
  }
  return d;
}

/* -------------------- Small helpers -------------------- */

function el(tag, attrs={}, ...children){
  const node = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs || {})){
    if (k === "class") node.className = v;
    else if (k === "style") node.setAttribute("style", v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()){
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function elBtn(label, kind, onClick, extraAttrs={}){
  const btn = el("button", { type:"button", class: kind ? kind : "", ...extraAttrs }, label);
  btn.addEventListener("click", (e)=>{ e.stopPropagation(); onClick?.(e); });
  return btn;
}

async function copyToClipboard(text){
  try{
    await navigator.clipboard.writeText(text);
  }catch{
    // fallback
    const ta = el("textarea", { style:"position:fixed;left:-9999px;top:-9999px" }, text);
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

let toastTimer = null;
function toast(msg){
  const existing = document.getElementById("toast");
  if (existing) existing.remove();
  const t = el("div", {
    id:"toast",
    style:"position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#111827;color:#fff;padding:10px 12px;border-radius:12px;font-size:13px;opacity:.92;z-index:9999;"
  }, msg);
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.remove(), 1300);
}

document.addEventListener("DOMContentLoaded", ()=>{
  restoreState();
  // 初期化はDOMContentLoaded後（本紙）
  render();
});
