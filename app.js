/* 
契約:
- 仕様書にない挙動は補完しない。
- ただし本紙r3で「質問は1ページ10問」「次へで次ページ」「上部に凡例」「最初へで戻る(確認あり)」は定義済み。
- 既存JSは生成しない: data_questions.js / contrib_table.js / rarity_logic.js / alias_logic.js を参照。
*/

(function(){
  // ---------- utils ----------
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, attrs={}, children=[]) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=>{
      if(k==="class") n.className=v;
      else if(k==="html") n.innerHTML=v;
      else if(k.startsWith("on") && typeof v==="function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    for(const c of children) n.appendChild(c);
    return n;
  };

  function hardFail(message){
    const root = $("#app");
    root.innerHTML = "";
    root.appendChild(el("div",{class:"card"},[
      el("h2",{html:"初期化エラー"}),
      el("p",{html:escapeHtml(message)}),
      el("p",{class:"mini", html:"必要ファイルの読み込み順と、ファイル名を確認してください。"})
    ]));
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (c)=>({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
    }[c]));
  }

  // ---------- dependencies ----------
  function readQuestions(){
    // 期待: QUESTIONS = [{id:number, text:string, group:string}]
    if(Array.isArray(window.QUESTIONS)) return window.QUESTIONS;
    // fallback: QUESTION(S) names
    if(Array.isArray(window.QUESTIONS_DATA)) return window.QUESTIONS_DATA;
    return null;
  }

  // 既存ロジックの呼び出し口（未定義ならエラー）
  function calcRarity(answers){
    // 期待: window.calcRarity(answers) -> "C"|"U"...
    if(typeof window.calcRarity === "function") return window.calcRarity(answers);
    if(typeof window.getRarity === "function") return window.getRarity(answers);
    if(typeof window.rarityLogic === "function") return window.rarityLogic(answers);
    throw new Error("rarity_logic.js に calcRarity/getRarity/rarityLogic が見つかりません");
  }

  function calcAlias(answers, rarity){
    // 期待: window.calcAlias(answers, rarity) -> { alias: string, ... } or string
    if(typeof window.calcAlias === "function") return window.calcAlias(answers, rarity);
    if(typeof window.getAlias === "function") return window.getAlias(answers, rarity);
    if(typeof window.aliasLogic === "function") return window.aliasLogic(answers, rarity);
    throw new Error("alias_logic.js に calcAlias/getAlias/aliasLogic が見つかりません");
  }

  function calcPhaseScores(answers){
    // contrib_table.js の公開関数に寄せる。無ければ最低限のstub。
    if(typeof window.calcPhaseScores === "function") return window.calcPhaseScores(answers);
    if(typeof window.scoreByPhase === "function") return window.scoreByPhase(answers);
    // stub（契約外の補完は避けたいが、結果が空だと表示不能なため最小の保険）
    return { match:null, firstMeet:null, date:null, relationship:null, marriage:null };
  }

  // ---------- state ----------
  const state = {
    mode: "start",        // start | questions | result
    page: 0,              // 0..1 (20問/10問ずつ)
    answers: [],          // 20
  };

  const ANSWER_LABELS = ["1","2","3","4","5"];
  const QUESTIONS_PER_PAGE = 10;

  // ---------- render ----------
  function render(){
    const root = $("#app");
    root.innerHTML = "";

    if(state.mode === "start"){
      root.appendChild(renderStart());
      return;
    }
    if(state.mode === "questions"){
      root.appendChild(renderQuestions());
      return;
    }
    if(state.mode === "result"){
      root.appendChild(renderResult());
      return;
    }
    hardFail("不明な画面状態です。");
  }

  function renderStart(){
    return el("div",{class:"card"},[
      el("h1",{html:"恋愛診断"}),
      el("p",{html:"※ 本ページは仕様書未定義の詳細を増やさず、最小の導線のみ表示します。"}),
      el("div",{class:"row"},[
        el("button",{class:"btn", onClick:()=>{
          state.mode="questions";
          state.page=0;
          render();
        }},[document.createTextNode("はじめる")]),
      ]),
      el("div",{class:"spacer"}),
      el("p",{class:"mini", html:"質問は 1ページ10問 / 全20問。"})
    ]);
  }

  function renderLegend(){
    return el("div",{class:"legend"}, ANSWER_LABELS.map(t => el("span",{class:"pill", html:t})));
  }

  function renderQuestions(){
    const questions = readQuestions();
    if(!questions){
      return el("div",{class:"card"},[
        el("h2",{html:"QUESTIONS が見つかりません"}),
        el("p",{html:"data_questions.js が読み込めていないか、期待する変数名が違います（QUESTIONS）。"})
      ]);
    }
    if(questions.length !== 20){
      // 仕様書上は20問。ここは警告のみ（止めない）。
      console.warn("QUESTIONS length expected 20 but got", questions.length);
    }

    const start = state.page * QUESTIONS_PER_PAGE;
    const end = Math.min(start + QUESTIONS_PER_PAGE, questions.length);

    const qNodes = [];
    for(let i=start; i<end; i++){
      const q = questions[i];
      qNodes.push(renderQuestion(i, q));
    }

    const pageInfo = el("div",{class:"mini", html:`${start+1}〜${end} / ${questions.length} 問`});

    const nextLabel = (end >= questions.length) ? "結果へ" : "次へ";

    return el("div",{class:"card"},[
      el("div",{class:"row"},[
        el("h2",{html:"質問"}),
        el("div",{style:"flex:1"}),
        pageInfo,
      ]),
      renderLegend(),
      el("div",{class:"spacer"}),
      ...qNodes,
      el("div",{class:"navbar"},[
        el("button",{class:"btn secondary", onClick:()=>{
          const ok = confirm("最初の画面に戻りますか？（回答は破棄されます）");
          if(!ok) return;
          state.mode="start";
          state.page=0;
          state.answers=[];
          render();
        }},[document.createTextNode("最初へ")]),
        el("button",{class:"btn", onClick:()=>{
          // validate current page answered
          for(let i=start; i<end; i++){
            if(state.answers[i] == null){
              alert("未回答があります");
              return;
            }
          }
          if(end >= questions.length){
            // go to result
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
        state.answers[idx] = v;
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

  function renderResult(){
    // 必要な依存がなければ停止
    try{
      const answers = state.answers.slice();
      // レアリティ → 異名
      const rarity = calcRarity(answers);
      const aliasRes = calcAlias(answers, rarity);

      const alias = (typeof aliasRes === "string") ? aliasRes
                   : (aliasRes && typeof aliasRes.alias === "string") ? aliasRes.alias
                   : (aliasRes && typeof aliasRes.name === "string") ? aliasRes.name
                   : "（異名不明）";

      const phaseScores = calcPhaseScores(answers);

      // 保存ID（仕様書で「右上にIDのみ」があったため、最小で生成）
      const saveId = makeId(8);

      // UI
      const root = el("div",{});
      // right-top id
      document.body.appendChild(el("div",{class:"topright", id:"saveId", html:escapeHtml(saveId)}));

      const header = el("div",{class:"row"},[
        el("div",{style:"flex:1"},[
          el("h2",{html:`異名：${escapeHtml(alias)}`}),
          el("div",{class:"row"},[
            el("span",{class:"badge", html:`レアリティ：${escapeHtml(rarity)}`}),
          ])
        ])
      ]);

      const table = renderPhaseTable(phaseScores);

      const actions = el("div",{class:"navbar"},[
        el("button",{class:"btn secondary", onClick:()=>{
          state.mode="start";
          state.page=0;
          state.answers=[];
          // remove saveId badge if exists
          const s=$("#saveId"); if(s) s.remove();
          render();
        }},[document.createTextNode("もう一度診断する")]),
        el("button",{class:"btn", onClick: async ()=>{
          try{
            await navigator.clipboard.writeText(saveId);
            alert("結果コードをコピーしました");
          }catch(e){
            alert("コピーに失敗しました");
          }
        }},[document.createTextNode("結果コードを保存")]),
      ]);

      return el("div",{class:"card"},[
        header,
        el("div",{class:"spacer"}),
        el("h3",{html:"フェーズ別結果"}),
        table,
        el("div",{class:"spacer"}),
        el("p",{class:"mini", html:"※ 総合評価は表示しません。"}),
        actions
      ]);

    }catch(e){
      console.error(e);
      return el("div",{class:"card"},[
        el("h2",{html:"結果生成エラー"}),
        el("p",{html:escapeHtml(e?.message ?? String(e))})
      ]);
    }
  }

  function renderPhaseTable(phaseScores){
    const rows = [
      ["出会い（マッチング）","match"],
      ["初対面","firstMeet"],
      ["デート","date"],
      ["交際","relationship"],
      ["結婚","marriage"],
    ];

    const thead = el("thead",{},[
      el("tr",{},[
        el("th",{html:"フェーズ"}),
        el("th",{html:"スコア"}),
        el("th",{html:"備考"}),
      ])
    ]);

    const tbody = el("tbody");
    for(const [label,key] of rows){
      const v = phaseScores ? phaseScores[key] : null;
      tbody.appendChild(el("tr",{},[
        el("td",{html:escapeHtml(label)}),
        el("td",{html:escapeHtml(v==null ? "—" : String(v))}),
        el("td",{html:"—"}),
      ]));
    }

    const table = el("table",{class:"table"},[thead, tbody]);
    return table;
  }

  function makeId(n){
    const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s="";
    for(let i=0;i<n;i++){
      s += chars[Math.floor(Math.random()*chars.length)];
    }
    return s;
  }

  // ---------- init ----------
  function boot(){
    // 必須: app root
    if(!$("#app")) return;
    render();
  }

  // 既存の initApp チェックをしていた環境向け
  window.initApp = boot;

  document.addEventListener("DOMContentLoaded", ()=>{
    // 依存が揃っていない場合でも start 画面は出す（質問に進んだら検知）
    boot();
  });
})();
