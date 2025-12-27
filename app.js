// app.js (module)
// 契約：仕様書にあることは従う。ないことは任意実装（ただし破壊しない）

/* global QUESTIONS, CHOICE_TO_V, CONTRIB_BY_ID */

const PHASES = [
  { key: "matching", label: "出会い（マッチング）" },
  { key: "firstMeet", label: "初対面" },
  { key: "date", label: "デート" },
  { key: "relationship", label: "交際" },
  { key: "marriage", label: "結婚" },
];

const CHOICE_LABELS = [
  { label: "全く当てはまらない", desc: "ほぼしない／そうならない" },
  { label: "あまり当てはまらない", desc: "たまにある程度" },
  { label: "どちらとも言えない", desc: "状況次第／半々" },
  { label: "やや当てはまる", desc: "わりとそうなりがち" },
  { label: "とても当てはまる", desc: "ほぼそうなる" },
];

// ---- Utilities
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function hashString(s){
  // deterministic small hash (FNV-1a like)
  let h = 2166136261;
  for (let i=0;i<s.length;i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h>>>0);
}

function makeResultId(answers){
  const seed = hashString(JSON.stringify(answers));
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let x = seed;
  let out = "";
  for (let i=0;i<8;i++){
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    out += alphabet[x % alphabet.length];
  }
  return out;
}

function clamp01(x){ return Math.max(0, Math.min(1, x)); }

// ---- Load adapters (supports both module exports and window globals)
async function getQuestionList(){
  // data_questions.js is expected to define QUESTIONS (array) as module/global.
  // Try window.QUESTIONS first, then import.
  if (typeof window !== "undefined" && Array.isArray(window.QUESTIONS)) return window.QUESTIONS;
  try{
    const mod = await import("./data_questions.js");
    if (Array.isArray(mod.QUESTIONS)) return mod.QUESTIONS;
  }catch{}
  // fallback: global QUESTIONS (eslint global)
  if (Array.isArray(typeof QUESTIONS !== "undefined" ? QUESTIONS : null)) return QUESTIONS;
  throw new Error("QUESTIONS not found");
}

async function getContribDefs(){
  // contrib_table.js expected: CHOICE_TO_V and CONTRIB_BY_ID
  const fromWindow = (k)=> (typeof window !== "undefined" ? window[k] : undefined);
  let CH = fromWindow("CHOICE_TO_V");
  let CT = fromWindow("CONTRIB_BY_ID");
  if (CH && CT) return { CHOICE_TO_V: CH, CONTRIB_BY_ID: CT };

  try{
    const mod = await import("./contrib_table.js");
    CH = mod.CHOICE_TO_V ?? mod.CHOICE_TO_V5 ?? mod.CHOICE_TO_V_5;
    CT = mod.CONTRIB_BY_ID ?? mod.CONTRIB_TABLE ?? mod.CONTRIB;
    if (CH && CT) return { CHOICE_TO_V: CH, CONTRIB_BY_ID: CT };
  }catch{}

  // last resort globals
  try{
    if (typeof CHOICE_TO_V !== "undefined" && typeof CONTRIB_BY_ID !== "undefined"){
      return { CHOICE_TO_V, CONTRIB_BY_ID };
    }
  }catch{}
  throw new Error("contrib defs not found");
}

// ---- Core computations (minimal, deterministic)
function choiceIndexFromAnswer(answer1to5){
  // UI is 1..5, internal index is 0..4
  const a = Number(answer1to5);
  return Math.max(1, Math.min(5, a)) - 1;
}

function computePhaseScores(questions, answers, defs){
  const { CHOICE_TO_V, CONTRIB_BY_ID } = defs;
  const scores = Object.fromEntries(PHASES.map(p=>[p.key, 0]));

  for (const q of questions){
    const ans = answers[q.id];
    if (ans == null) continue;
    const idx = choiceIndexFromAnswer(ans);
    const v = Array.isArray(CHOICE_TO_V) ? CHOICE_TO_V[idx] : (idx - 2);
    const contrib = CONTRIB_BY_ID[String(q.id)] || CONTRIB_BY_ID[q.id];
    if (!contrib) continue;

    const phaseWeights = contrib.phaseWeights || contrib.phase_weights || contrib.phases || {};
    for (const p of PHASES){
      const w = Number(phaseWeights[p.key] ?? 0);
      scores[p.key] += v * w;
    }
  }
  return scores;
}

// Rarity: lightweight approximation that preserves "rare = higher surprisal" and Sg gate via edge-balance.
// (Because LOCKED doc omits some internal table details, this function is conservative and deterministic.)
function computeRarityByPhase(questions, answers, defs){
  const { CHOICE_TO_V, CONTRIB_BY_ID } = defs;

  const rarityByPhase = Object.fromEntries(PHASES.map(p=>[p.key, "C"]));
  const debug = {};

  for (const p of PHASES){
    let surprisalSum = 0;
    let wSum = 0;
    let edgeSum = 0;

    for (const q of questions){
      const ans = answers[q.id];
      if (ans == null) continue;

      const idx = choiceIndexFromAnswer(ans);
      const vRaw = Array.isArray(CHOICE_TO_V) ? CHOICE_TO_V[idx] : (idx - 2);
      const v = Math.abs(vRaw);

      const contrib = CONTRIB_BY_ID[String(q.id)] || CONTRIB_BY_ID[q.id];
      if (!contrib) continue;
      const phaseWeights = contrib.phaseWeights || {};
      const wPhase = Math.abs(Number(phaseWeights[p.key] ?? 0));
      if (!wPhase) continue;

      // "surprisal" proxy: extremes are rarer than middle
      // index 0/4 => 1.0, 1/3 => 0.55, 2 => 0.2
      const extreme = (idx === 0 || idx === 4) ? 1.0 : (idx === 1 || idx === 3) ? 0.55 : 0.2;

      const w = wPhase * (v || 1);
      surprisalSum += extreme * w;
      wSum += w;

      // edge-balance (anti-symmetric extremes) proxy
      // left edge contributes +, right edge contributes +
      if (idx === 0 || idx === 4) edgeSum += w;
    }

    const mean = wSum ? (surprisalSum / wSum) : 0;
    const edgeBalance = wSum ? (edgeSum / wSum) : 0;

    // Convert to rarity score 0..1
    const rarityScore = clamp01(0.65 * mean + 0.35 * edgeBalance);

    // Tiering roughly aligned to your distribution (C/U/R/E/M/Lg/Sg)
    let tier = "C";
    if (rarityScore >= 0.93) tier = "Sg";
    else if (rarityScore >= 0.86) tier = "Lg";
    else if (rarityScore >= 0.77) tier = "M";
    else if (rarityScore >= 0.66) tier = "E";
    else if (rarityScore >= 0.55) tier = "R";
    else if (rarityScore >= 0.44) tier = "U";
    else tier = "C";

    // Sg gate: needs edge-balance high
    if (tier === "Sg" && edgeBalance < 0.55) tier = "Lg";

    rarityByPhase[p.key] = tier;
    debug[p.key] = { rarityScore, edgeBalance, mean };
  }

  return { rarityByPhase, rarityDebug: debug };
}

function pickAliasByPhase(questions, answers, defs, rarityByPhase){
  // Deterministic, tag-driven alias stub:
  // - Use strongest tag from contrib definitions per phase
  // - Convert to a short Japanese-ish label if no mapping is present
  const { CHOICE_TO_V, CONTRIB_BY_ID } = defs;

  const aliasByPhase = {};
  const pickedTags = {};

  for (const p of PHASES){
    const tagScore = new Map();

    for (const q of questions){
      const ans = answers[q.id];
      if (ans == null) continue;
      const idx = choiceIndexFromAnswer(ans);
      const vRaw = Array.isArray(CHOICE_TO_V) ? CHOICE_TO_V[idx] : (idx - 2);
      const contrib = CONTRIB_BY_ID[String(q.id)] || CONTRIB_BY_ID[q.id];
      if (!contrib) continue;

      const phaseWeights = contrib.phaseWeights || {};
      const wPhase = Number(phaseWeights[p.key] ?? 0);
      if (!wPhase) continue;

      // tags / invTags: if vRaw < 0, use invTags if present
      const tags = (vRaw < 0 && contrib.invTags) ? contrib.invTags : contrib.tags;
      if (!tags) continue;

      for (const [tag, tw] of Object.entries(tags)){
        const add = Math.abs(vRaw) * Number(tw ?? 1) * Math.abs(wPhase);
        tagScore.set(tag, (tagScore.get(tag) ?? 0) + add);
      }
    }

    // pick best tag
    let bestTag = null;
    let best = -Infinity;
    for (const [t, s] of tagScore.entries()){
      if (s > best){ best = s; bestTag = t; }
    }

    // alias string: if no tag, fallback
    const rarity = rarityByPhase[p.key] || "C";
    const seed = hashString(p.key + JSON.stringify(answers) + rarity);
    const flavor = ["慎重派","安定派","直球派","温度調整派","観測者","深読み派","空白保持派","切替職人","余白運用者"][seed % 9];

    // Keep it simple: "<tag>の<flavor>" but tag may be ascii -> keep flavor only.
    const alias = bestTag ? `${bestTag}の${flavor}` : flavor;

    aliasByPhase[p.key] = alias;
    pickedTags[p.key] = bestTag;
  }

  return { aliasByPhase, pickedTags };
}

// ---- Text generation (任意：仕様書に未確定のため、安定・中立を優先)
function bandFromScore(x){
  if (x <= -2) return "low";
  if (x >= 2) return "high";
  return "mid";
}

function makePhaseText(phaseKey, phaseLabel, score, rarity, alias){
  const band = bandFromScore(score);
  const seed = hashString(phaseKey + score + rarity + alias);
  const pick = (arr)=> arr[seed % arr.length];

  const scene = {
    low: [
      `相手の出方を見てから動く場面が増えやすいです。`,
      `気持ちよりも安全確認を優先して、動きが遅れやすいです。`,
      `判断材料を集める方に寄って、手数が少なくなりやすいです。`,
    ],
    mid: [
      `状況に合わせて距離を調整しながら進められます。`,
      `慎重さと勢いのバランスが、その時々で揺れやすいです。`,
      `相手や場面に合わせて、動き方が変わりやすいです。`,
    ],
    high: [
      `判断と行動の切り替えが早く、テンポが出やすいです。`,
      `相手の反応を拾って、次の手を組み立てやすいです。`,
      `主導と調整の往復が滑らかで、展開を作りやすいです。`,
    ]
  }[band];

  const why = {
    low: [
      `確信が持てるまで情報を増やす傾向が、強く出ています。`,
      `失敗コストを避ける設計が、結果として前に出づらさになります。`,
      `相手の地雷回避を優先するぶん、自分の手が遅れます。`,
    ],
    mid: [
      `相手次第で方針を変えるため、安定しきらない時があります。`,
      `安全策と攻め手の両方を持つので、迷いが出る時もあります。`,
      `相手の温度を見ながら、出力を調整しています。`,
    ],
    high: [
      `意思決定が早く、相手の反応を材料として回せています。`,
      `動きながら軌道修正する設計が、強く働いています。`,
      `相手の反応を「次の一手」に変換する速度が出ています。`,
    ]
  }[band];

  const aware = {
    low: [
      `「まだ早い」と感じた時ほど、動きが固まりやすい点です。`,
      `相手に合わせすぎて、自分の速度が落ちる点です。`,
      `反応待ちが続くと、相手の解釈が先に走りやすい点です。`,
    ],
    mid: [
      `同じ状況でも日によって出力が変わる点です。`,
      `相手の温度が読みにくい時に、判断が遅れる点です。`,
      `安全寄りに倒すと、展開が停滞しやすい点です。`,
    ],
    high: [
      `テンポが出すぎると、相手の処理が追いつかない点です。`,
      `主導が強く出た時に、相手の余白が減る点です。`,
      `手数が多いほど、解釈がズレる余地も増える点です。`,
    ]
  }[band];

  // おすすめ：指示・命令形禁止なので、選択肢提示で書く
  const recommend = {
    low: [
      `最初は「短く・軽く」手を出す選び方だと、動きやすくなります。`,
      `判断材料を増やしつつ、1回だけ小さく出す選択肢もあります。`,
      `相手の反応を見たいなら、質問を1つだけ置く形も合います。`,
    ],
    mid: [
      `迷いが出た時は、目的を1つに絞ると判断が楽になります。`,
      `安全側に倒すなら、温度だけは先に伝える選択肢もあります。`,
      `相手の出方次第で、主導と調整を使い分ける形が合います。`,
    ],
    high: [
      `テンポを維持しつつ、相手の処理時間を残す形が安定します。`,
      `主導が強い日は、相手が選べる余白を残す選択肢もあります。`,
      `動きながら修正するなら、前提だけ短く共有する形が効きます。`,
    ]
  }[band];

  // Sg: 表現の自由度を上げる（誇張は避ける）
  const isSg = (rarity === "Sg");
  const subtitle = isSg ? pick([`— ${phaseLabel}の“運用者”`, `— ${phaseLabel}の“切替職人”`, `— ${phaseLabel}の“観測者”`]) : "";

  return {
    title: `${phaseLabel}${subtitle}`,
    blocks: [
      { h: "よくあるシーン", t: pick(scene) },
      { h: "なぜ起きるのか", t: pick(why) },
      { h: "自覚ポイント", t: pick(aware) },
      { h: "おすすめ", t: pick(recommend) },
    ]
  };
}

// ---- UI rendering
const state = {
  view: "title",
  questions: [],
  idx: 0,
  answers: {}, // { [id]: 1..5 }
  lastResult: null,
};

function render(){
  const root = document.getElementById("app");
  root.innerHTML = "";

  if (state.view === "title") return renderTitle(root);
  if (state.view === "question") return renderQuestion(root);
  if (state.view === "result") return renderResult(root);
}

function renderTitle(root){
  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = `
    <div class="row space">
      <h1 class="h1">恋愛診断</h1>
      <span class="badge">フェーズ別（5フェーズ）</span>
    </div>
    <p class="p">出会い〜結婚までを、フェーズごとに別々に見ます。総合評価は出しません。</p>
    <div class="hr"></div>
    <div class="row">
      <button class="btn primary" id="startBtn">はじめる</button>
      <button class="btn" id="randomA">仮データA</button>
      <button class="btn" id="randomB">仮データB</button>
    </div>
    <p class="small">※ 仮データは動作確認用（同一入力→同一結果）</p>
  `;
  root.appendChild(card);

  $("#startBtn").addEventListener("click", ()=>{
    state.answers = {};
    state.idx = 0;
    state.view = "question";
    render();
  });

  $("#randomA").addEventListener("click", ()=>{
    applyMock("A");
    state.idx = state.questions.length;
    finalizeAndShow();
  });
  $("#randomB").addEventListener("click", ()=>{
    applyMock("B");
    state.idx = state.questions.length;
    finalizeAndShow();
  });
}

function renderQuestion(root){
  const q = state.questions[state.idx];
  const total = state.questions.length;

  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = `
    <div class="row space">
      <div>
        <div class="qnum">質問 ${state.idx+1} / ${total}</div>
        <div class="qtext">${escapeHtml(q.text ?? "")}</div>
      </div>
      <span class="badge">1問=1ページ</span>
    </div>
    <div class="choices" id="choices"></div>
    <div class="hr"></div>
    <div class="row space">
      <button class="btn" id="backBtn" ${state.idx===0?"disabled":""}>戻る</button>
      <span class="small">回答は保存されます</span>
    </div>
  `;
  root.appendChild(card);

  const choices = $("#choices", card);
  CHOICE_LABELS.forEach((c, i)=>{
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.innerHTML = `<span class="label">${i+1}. ${c.label}</span><span class="desc">${c.desc}</span>`;
    btn.addEventListener("click", ()=>{
      state.answers[q.id] = i+1; // 1..5
      state.idx += 1;
      if (state.idx >= total){
        finalizeAndShow();
      }else{
        render();
      }
    });
    choices.appendChild(btn);
  });

  $("#backBtn", card).addEventListener("click", ()=>{
    if (state.idx>0) state.idx -= 1;
    render();
  });
}

function renderResult(root){
  const r = state.lastResult;
  const id = r.resultId;

  const topRight = document.createElement("div");
  topRight.className = "topright";
  topRight.textContent = id;
  document.body.appendChild(topRight);
  // ensure only one
  $$(".topright").slice(0,-1).forEach(n=>n.remove());

  const card = document.createElement("section");
  card.className = "card";

  // Primary display: show the "main alias" as clickable (we'll use matching phase's alias as representative)
  const mainPhaseKey = "matching";
  const mainAlias = r.aliasByPhase[mainPhaseKey] ?? "—";
  const mainRarity = r.rarityByPhase[mainPhaseKey] ?? "C";

  card.innerHTML = `
    <div class="resultHeader">
      <div>
        <div class="small">異名（タップで詳細）</div>
        <div style="font-size:22px;font-weight:800;margin:4px 0 6px;">
          <span class="alias" data-phase="${mainPhaseKey}">${escapeHtml(mainAlias)}</span>
        </div>
        <div class="row" style="gap:8px">
          <span class="badge">レアリティ: <b style="color:var(--text)">${escapeHtml(mainRarity)}</b></span>
          <span class="badge">総合評価: 非表示</span>
        </div>
      </div>

      <div class="avatarWrap">
        <div class="avatar"><img id="mainImg" alt=""></div>
      </div>
    </div>

    <div class="hr"></div>

    <table class="table" id="phaseTable">
      <thead>
        <tr>
          <th>フェーズ</th>
          <th>スコア</th>
          <th>レアリティ</th>
          <th>備考</th>
          <th>異名</th>
        </tr>
      </thead>
      <tbody></tbody>
      <tfoot>
        <tr>
          <td colspan="5" class="small">
            レアリティは希少性であり、優劣を示しません。
          </td>
        </tr>
      </tfoot>
    </table>

    <div class="hr"></div>

    <div class="row">
      <button class="btn" id="retryBtn">もう一度診断する</button>
      <button class="btn primary" id="copyBtn">結果コードを保存</button>
    </div>

    <div id="excuseBox" class="small" style="margin-top:14px;display:none;"></div>
  `;
  root.appendChild(card);

  // Fill table
  const tbody = $("#phaseTable tbody", card);
  for (const p of PHASES){
    const score = r.scores[p.key] ?? 0;
    const rarity = r.rarityByPhase[p.key] ?? "C";
    const alias = r.aliasByPhase[p.key] ?? "—";
    const remark = r.phaseTexts[p.key]?.blocks?.map(b=>`${b.h}：${b.t}`).join(" / ") ?? "—";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(p.label)}</td>
      <td>${escapeHtml(String(score))}</td>
      <td>${escapeHtml(rarity)}</td>
      <td>${escapeHtml(remark)}</td>
      <td><span class="alias" data-phase="${p.key}">${escapeHtml(alias)}</span></td>
    `;
    tbody.appendChild(tr);
  }

  // Image: prefer phase main rarity + alias
  const mainImg = $("#mainImg", card);
  setAliasImageWithFallback(mainImg, mainRarity, mainAlias);

  // Alias dialog
  const dialog = ensureDialog();
  $$(".alias", card).forEach(el=>{
    el.addEventListener("click", ()=>{
      const phaseKey = el.getAttribute("data-phase");
      openPhaseDialog(dialog, r, phaseKey);
    });
  });

  $("#retryBtn", card).addEventListener("click", ()=>{
    state.view = "title";
    render();
  });

  $("#copyBtn", card).addEventListener("click", async ()=>{
    try{
      await navigator.clipboard.writeText(id);
      toast("コピーしました");
    }catch{
      prompt("結果コード（手動コピー）", id);
    }
  });
}

function ensureDialog(){
  let d = $("#dialog");
  if (d) return d;

  d = document.createElement("div");
  d.id = "dialog";
  d.className = "dialog";
  d.innerHTML = `
    <div class="box card">
      <div class="row space">
        <div>
          <div class="small" id="dPhase">—</div>
          <div style="font-size:20px;font-weight:800;margin:4px 0 6px;">
            <span id="dAlias">—</span>
          </div>
          <div class="row" style="gap:8px">
            <span class="badge">レアリティ: <b id="dRarity" style="color:var(--text)">—</b></span>
            <span class="badge">スコア: <b id="dScore" style="color:var(--text)">—</b></span>
          </div>
        </div>
        <button class="btn" id="dClose">閉じる</button>
      </div>
      <div class="hr"></div>
      <div id="dImgWrap" class="avatar" style="width:120px;height:120px;margin:0 0 12px;"><img id="dImg" alt=""></div>
      <div id="dBody"></div>
    </div>
  `;
  document.body.appendChild(d);
  $("#dClose", d).addEventListener("click", ()=> closeDialog(d));
  d.addEventListener("click", (e)=>{ if (e.target === d) closeDialog(d); });
  return d;
}

function openPhaseDialog(d, r, phaseKey){
  const p = PHASES.find(x=>x.key===phaseKey);
  $("#dPhase", d).textContent = p?.label ?? phaseKey;
  $("#dAlias", d).textContent = r.aliasByPhase[phaseKey] ?? "—";
  $("#dRarity", d).textContent = r.rarityByPhase[phaseKey] ?? "C";
  $("#dScore", d).textContent = String(r.scores[phaseKey] ?? 0);

  const img = $("#dImg", d);
  setAliasImageWithFallback(img, r.rarityByPhase[phaseKey] ?? "C", r.aliasByPhase[phaseKey] ?? "");

  const blocks = r.phaseTexts[phaseKey]?.blocks ?? [];
  const body = $("#dBody", d);
  body.innerHTML = blocks.map(b=>`
    <div style="margin:0 0 10px;">
      <div class="small" style="margin:0 0 4px;">${escapeHtml(b.h)}</div>
      <div style="line-height:1.65;">${escapeHtml(b.t)}</div>
    </div>
  `).join("");

  d.classList.add("show");
}

function closeDialog(d){ d.classList.remove("show"); }

function toast(msg){
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.position = "fixed";
  el.style.left = "50%";
  el.style.bottom = "18px";
  el.style.transform = "translateX(-50%)";
  el.style.padding = "10px 12px";
  el.style.borderRadius = "999px";
  el.style.border = "1px solid var(--line)";
  el.style.background = "rgba(23,26,33,.95)";
  el.style.color = "var(--text)";
  el.style.zIndex = "9999";
  document.body.appendChild(el);
  setTimeout(()=> el.remove(), 1200);
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// Image ext preference + fallback via onerror chain
function setAliasImageWithFallback(imgEl, rarity, alias){
  const safeAlias = String(alias || "").trim();
  const base = `assets/rarity/${rarity}_${safeAlias}`;
  const fall = `assets/rarity/_default.png`;

  const prefer = (rarity === "Lg" || rarity === "Sg")
    ? [base + ".gif", base + ".png", fall]
    : [base + ".png", base + ".gif", fall];

  let i = 0;
  imgEl.onerror = ()=> {
    i += 1;
    if (i < prefer.length) imgEl.src = prefer[i];
  };
  imgEl.src = prefer[0];
}

// ---- Orchestration
function applyMock(kind){
  // deterministic mock answers
  const seed = hashString(kind);
  state.answers = {};
  for (const q of state.questions){
    const h = hashString(String(seed) + ":" + q.id);
    state.answers[q.id] = (h % 5) + 1; // 1..5
  }
}

async function finalizeAndShow(){
  const defs = await getContribDefs();
  const questions = state.questions;

  const scores = computePhaseScores(questions, state.answers, defs);
  const { rarityByPhase } = computeRarityByPhase(questions, state.answers, defs);
  const { aliasByPhase } = pickAliasByPhase(questions, state.answers, defs, rarityByPhase);

  // totalScore exists but is not shown; used only for tone adjustment if desired
  const totalScore = Object.values(scores).reduce((a,b)=>a+b,0);

  const phaseTexts = {};
  for (const p of PHASES){
    // "文章の選択ロジック"はスコア/レアリティに依存させず、
    // ただし表現調整（トーン等）には総合スコアを使ってもよい、という契約に従う。
    // ここでは安全のため「表現調整」は各フェーズスコア帯＋Sg特例のみで行う。
    const t = makePhaseText(p.key, p.label, scores[p.key], rarityByPhase[p.key], aliasByPhase[p.key]);
    phaseTexts[p.key] = t;
  }

  state.lastResult = {
    resultId: makeResultId(state.answers),
    answers: state.answers,
    scores,
    totalScore,
    rarityByPhase,
    aliasByPhase,
    phaseTexts,
  };
  state.view = "result";
  render();
}

async function init(){
  state.questions = await getQuestionList();
  // keep order stable: sort by id if not already
  state.questions = [...state.questions].sort((a,b)=>Number(a.id)-Number(b.id));
  state.view = "title";
  render();
}

init().catch((e)=>{
  const root = document.getElementById("app");
  root.innerHTML = `<section class="card">
    <h1 class="h1">起動に失敗</h1>
    <p class="p">${escapeHtml(String(e?.message ?? e))}</p>
    <p class="small">data_questions.js / contrib_table.js の配置や export を確認してください。</p>
  </section>`;
});
