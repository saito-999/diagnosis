// ui_start.js
// export は render(root, ctx) のみ

function _randInt1to5() {
  return 1 + Math.floor(Math.random() * 5);
}

export function render(root, ctx) {
  if (!(root instanceof HTMLElement)) return;

  root.innerHTML = "";
  root.onclick = null;

  const wrap = document.createElement("div");
  wrap.className = "screen screen-start";

  const title = document.createElement("h2");
  title.textContent = "恋愛戦場タイプ診断";

  const descWrap = document.createElement("div");
  descWrap.className = "desc";

  const p1 = document.createElement("p");
  p1.textContent = "これは、あなたの価値や優劣・人間性を決めつける診断ではありません。";
  const p2 = document.createElement("p");
  p2.textContent = "恋愛の傾向を統計的にモデル化したものであり、正解とは限りません。";
  const p3 = document.createElement("p");
  p3.textContent =
    "恋愛心理学・行動科学・交際統計など複数研究の傾向から『出会い〜交際〜結婚』フェーズ別のデータを用いて作成しています。";

  descWrap.appendChild(p1);
  descWrap.appendChild(p2);
  descWrap.appendChild(p3);

  const btnWrap = document.createElement("div");
  btnWrap.className = "buttons";

  const btnStart = document.createElement("button");
  btnStart.type = "button";
  btnStart.textContent = "▶ 診断を始める";
  btnStart.onclick = () => {
    const actions = ctx && ctx.actions;
    if (!actions) return;
    actions.go("q1_10");
  };

  const btnRandom = document.createElement("button");
  btnRandom.type = "button";
  btnRandom.textContent = "ランダム診断";
  btnRandom.onclick = () => {
    const actions = ctx && ctx.actions;
    if (!actions) return;

    // Q1..Q20 を全入力（qid重複なし、vは1..5整数）
    for (let i = 1; i <= 20; i += 1) {
      actions.setAnswer(`Q${i}`, _randInt1to5());
    }
    actions.go("q1_10");
  };

  btnWrap.appendChild(btnStart);
  btnWrap.appendChild(btnRandom);

  const note = document.createElement("p");
  note.className = "note";
  note.textContent = "※この診断は医学的・医療的評価を目的としたものではありません";

  wrap.appendChild(title);
  wrap.appendChild(descWrap);
  wrap.appendChild(btnWrap);
  wrap.appendChild(note);

  root.appendChild(wrap);
}
