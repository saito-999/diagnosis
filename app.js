/* 
契約:
- 仕様書にあることは契約として従属。
- 仕様書に明記されていない「画面構成・画面数・遷移・初期表示・ページ分割」を補完しない。
  （※本紙 r3 は「質問は1ページ10問」「回答ラベルは1〜5」「次へで遷移」を明記済み）
- 生成不要ファイルは “利用する前提” で import（ESM）する。
*/

import * as QMod from "./data_questions.js";
import * as ContribMod from "./contrib_table.js";
import * as RarityMod from "./rarity_logic.js";
import * as AliasMod from "./alias_logic.js";

const $ = (sel) => document.querySelector(sel);

const el = (tag, attrs={}, children=[]) => {
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v])=>{
    if(k==="class") n.className=v;
    else if(k==="html") n.innerHTML=v;
    else if(k==="style") n.setAttribute("style", v);
    else if(k.startsWith("on") && typeof v==="function") n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v);
  });
  for(const c of children) n.appendChild(c);
  return n;
};

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c)=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "\"":"&quot;",
    "'":"&#39;"
  }[c]));
}

function hardFail(message){
  const root = $("#app");
  if(!root) return;
  root.innerHTML = "";
  root.appendChild(el("div",{class:"card"},[
    el("h2",{html:"初期化エラー"}),
    el("p",{html:escapeHtml(message)}),
    el("p",{class:"mini", html:"※ data_questions.js / contrib_table.js / rarity_logic.js / alias_logic.js の配置と読み込み形式（module）を確認してください。"})
  ]));
}

function pickQuestions(){
  const q = (QMod.QUESTIONS ?? QMod.QUESTIONS_DATA ?? window.QUESTIONS ?? window.QUESTIONS_DATA);
  if(!Array.isArray(q)) return null;
  return q;
}

function getContribTable(){
  const CHOICE_TO_V = (ContribMod.CHOICE_TO_V ?? window.CHOICE_TO_V);
  const CONTRIB_BY_ID = (ContribMod.CONTRIB_BY_ID ?? window.CONTRIB_BY_ID);
  return { CHOICE_TO_V, CONTRIB_BY_ID };
}

function pickRarityFn(){
  return (RarityMod.calcRarity ?? RarityMod.getRarity ?? RarityMod.rarityLogic
          ?? window.calcRarity ?? window.getRarity ?? window.rarityLogic);
}

function pickAliasFn(){
  return (AliasMod.calcAlias ?? AliasMod.getAlias ?? AliasMod.aliasLogic
          ?? window.calcAlias ?? window.getAlias ?? window.aliasLogic);
}

function makeId(n){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s="";
  for(let i=0;i<n;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}

// ============ 仕様（本紙 r3） ============
const ANSWER_LABELS = ["1","2","3","4","5"];
const QUESTIONS_PER_PAGE = 10;

// ============ state ============
const state = {
  mode: "start", // start | questions | result
  page: 0,
  answers: [] // int 1..5（UI） ※内部値は contrib_table.js の CHOICE_TO_V がある場合はそこで変換
};

function render(){
  const root = $("#app");
  if(!root) return;
  root.innerHTML = "";

  if(state.mode === "start") root.appendChild(renderStart());
  else if(state.mode === "questions") root.appendChild(renderQuestions());
  else if(state.mode === "result") root.appendChild(renderResult());
  else hardFail("不明な画面状態です。");
}

function renderStart(){
  return el("div",{class:"card"},[
    el("h1",{html:"恋愛診断"}),
    el("p",{class:"mini", html:"質問は 1ページ10問 / 回答は 1〜5 / 「次へ」で遷移。"}),
    el("div",{class:"row"},[
      el("button",{class:"btn primary", onClick:()=>{
        state.mode="questions";
        state.page=0;
        render();
      }},[document.createTextNode("はじめる")])
    ])
  ]);
}

function renderLegend(){
  return el("div",{class:"legend"}, ANSWER_LABELS.map(t => el("span",{class:"pill", html:t})));
}

function renderQuestions(){
  const questions = pickQuestions();
  if(!questions){
    return el("div",{class:"card"},[
      el("h2",{html:"QUESTIONS が見つかりません"}),
      el("p",{html:"data_questions.js の変数名が QUESTIONS（推奨）/ QUESTIONS_DATA のどちらかになっているか確認してください。"})
    ]);
  }

  const start = state.page * QUESTIONS_PER_PAGE;
  const end = Math.min(start + QUESTIONS_PER_PAGE, questions.length);

  const qNodes = [];
  for(let i=start; i<end; i++){
    qNodes.push(renderQuestion(i, questions[i]));
  }

  const nextLabel = (end >= questions.length) ? "結果へ" : "次へ";

  return el("div",{class:"card"},[
    el("div",{class:"row"},[
      el("h2",{html:"質問"}),
      el("div",{style:"flex:1"}),
      el("div",{class:"mini", html:`${start+1}〜${end} / ${questions.length} 問`}),
    ]),
    renderLegend(),
    ...qNodes,
    el("div",{class:"navbar"},[
      el("button",{class:"btn secondary", onClick:()=>{
        const ok = confirm("最初の画面に戻りますか？（回答は破棄されます）");
        if(!ok) return;
        state.mode="start"; state.page=0; state.answers=[];
        const s=document.getElementById("saveId"); if(s) s.remove();
        render();
      }},[document.createTextNode("最初へ")]),
      el("button",{class:"btn primary", onClick:()=>{
        for(let i=start; i<end; i++){
          if(state.answers[i] == null){
            alert("未回答があります");
            return;
          }
        }
        if(end >= questions.length){
          state.mode="result";
          render();
          return;
        }
        state.page += 1;
        render();
      }},[document.createTextNode(nextLabel)]),
    ]),
  ]);
}

function renderQuestion(idx, q){
  const name = `q${idx}`;
  const current = state.answers[idx];

  const choices = el("div",{class:"choices"});
  for(let v=1; v<=5; v++){
    const input = el("input",{type:"radio", name, value:String(v)});
    if(current === v) input.checked = true;

    input.addEventListener("change", ()=>{
      state.answers[idx] = v; // UIは 1..5 を保持
    });

    const label = el("label",{class:"choice"});
    label.appendChild(input);
    label.appendChild(document.createTextNode(String(v)));
    choices.appendChild(label);
  }

  return el("div",{class:"q"},[
    el("div",{class:"q-title", html:escapeHtml(q?.text ?? `Q${idx+1}`)}),
    choices
  ]);
}

function normalizeAnswersForLogic(questions, answersUI){
  // contrib_table.js に CHOICE_TO_V があるならそれに従う。
  // ない場合は 0..4 / 1..5 のどちらを正とするか仕様書の範囲外なので、ここは「補完しない」。
  const { CHOICE_TO_V } = getContribTable();
  if(Array.isArray(CHOICE_TO_V) && CHOICE_TO_V.length === 5){
    // answersUI: 1..5 -> index 0..4
    return answersUI.map(v => {
      const idx = (typeof v==="number") ? (v-1) : null;
      if(idx==null || idx<0 || idx>4) return null;
      return CHOICE_TO_V[idx];
    });
  }
  // fallback: 1..5 をそのまま渡す（ロジック側が受ける前提の場合）
  return answersUI.slice();
}

function calcPhaseScores(questions, answersLogic){
  const { CONTRIB_BY_ID } = getContribTable();
  if(!CONTRIB_BY_ID) return null;

  // どのフェーズキーを使うかは CONTRIB_BY_ID から導出
  const first = Object.values(CONTRIB_BY_ID)[0];
  const phaseKeys = first?.phaseWeights ? Object.keys(first.phaseWeights) : [];
  const sums = Object.fromEntries(phaseKeys.map(k => [k, 0]));

  for(let i=0; i<questions.length; i++){
    const q = questions[i];
    const id = String(q?.id ?? "");
    const a = answersLogic[i];
    if(a == null) continue;

    const row = CONTRIB_BY_ID[id];
    if(!row?.phaseWeights) continue;

    for(const k of phaseKeys){
      const w = row.phaseWeights[k] ?? 0;
      sums[k] += a * w;
    }
  }

  // 表示は「存在するキーだけ」返す
  return sums;
}

function renderPhaseTable(phaseScores){
  const thead = el("thead",{},[
    el("tr",{},[
      el("th",{html:"項目"}),
      el("th",{html:"値"}),
    ])
  ]);
  const tbody = el("tbody");

  if(!phaseScores){
    tbody.appendChild(el("tr",{},[
      el("td",{html:"フェーズ別スコア"}),
      el("td",{html:"—"}),
    ]));
  }else{
    for(const [k,v] of Object.entries(phaseScores)){
      tbody.appendChild(el("tr",{},[
        el("td",{html:escapeHtml(k)}),
        el("td",{html:escapeHtml(String(Math.round(v)))}),
      ]));
    }
  }

  return el("table",{class:"table"},[thead, tbody]);
}

function renderResult(){
  const questions = pickQuestions();
  if(!questions) return el("div",{class:"card"},[el("h2",{html:"QUESTIONS が見つかりません"})]);

  try{
    const answersUI = state.answers.slice();
    const answersLogic = normalizeAnswersForLogic(questions, answersUI);

    const rarityFn = pickRarityFn();
    const aliasFn = pickAliasFn();
    if(typeof rarityFn !== "function") throw new Error("rarity_logic.js の関数が見つかりません");
    if(typeof aliasFn !== "function") throw new Error("alias_logic.js の関数が見つかりません");

    const rarity = rarityFn(answersLogic);
    const aliasRes = aliasFn(answersLogic, rarity);

    const alias = (typeof aliasRes === "string") ? aliasRes
                : (aliasRes && typeof aliasRes.alias === "string") ? aliasRes.alias
                : (aliasRes && typeof aliasRes.name === "string") ? aliasRes.name
                : "（異名不明）";

    const phaseScores = calcPhaseScores(questions, answersLogic);

    // 保存ID：右上にIDのみ（仕様書）
    const saveId = makeId(8);
    let badge = document.getElementById("saveId");
    if(!badge){
      badge = document.createElement("div");
      badge.id = "saveId";
      badge.className = "topright";
      document.body.appendChild(badge);
    }
    badge.textContent = saveId;

    return el("div",{class:"card"},[
      el("div",{class:"row"},[
        el("div",{style:"flex:1"},[
          el("h2",{html:`異名：${escapeHtml(alias)}`}),
          el("div",{class:"row"},[
            el("span",{class:"badge", html:`レアリティ：${escapeHtml(String(rarity))}`}),
          ])
        ])
      ]),
      el("p",{class:"mini", html:"※ 総合評価は表示しません（ユーザー非表示）。"}),
      el("h3",{html:"フェーズ別（内部値の可視化）"}),
      renderPhaseTable(phaseScores),
      el("div",{class:"navbar"},[
        el("button",{class:"btn secondary", onClick:()=>{
          state.mode="start"; state.page=0; state.answers=[];
          const s=document.getElementById("saveId"); if(s) s.remove();
          render();
        }},[document.createTextNode("もう一度診断する")]),
        el("button",{class:"btn primary", onClick: async ()=>{
          try{
            await navigator.clipboard.writeText(saveId);
            alert("結果コードをコピーしました");
          }catch(_){
            alert("コピーに失敗しました");
          }
        }},[document.createTextNode("結果コードを保存")]),
      ])
    ]);
  }catch(e){
    console.error(e);
    return el("div",{class:"card"},[
      el("h2",{html:"結果生成エラー"}),
      el("p",{html:escapeHtml(e?.message ?? String(e))}),
      el("p",{class:"mini", html:"console のエラーも確認してください（import/export 形式・関数名など）。"})
    ]);
  }
}

function boot(){
  if(!$("#app")) return;
  render();
}

document.addEventListener("DOMContentLoaded", boot);
