// ui_title.js
// export は render(root, ctx) のみ

export function render(root, ctx) {
  if (!(root instanceof HTMLElement)) return;

  // 既存タイマーの停止（動的表示 0.8秒ループ）
  if (root.__ui_title_timer_id) {
    clearInterval(root.__ui_title_timer_id);
    root.__ui_title_timer_id = null;
  }

  root.innerHTML = "";
  root.onclick = null;

  const wrap = document.createElement("div");
  wrap.className = "screen screen-title";

  const h1 = document.createElement("h1");
  h1.textContent = "恋愛戦場タイプ診断";

  const sub = document.createElement("p");
  sub.className = "subtitle";
  sub.textContent = "あなたが下手でも悪いんでもない。逢ってないだけ。";

  const helper = document.createElement("p");
  helper.className = "helper";

  const loopTexts = ["会ってる。", "合ってない。", "遇ってる。", "遭ってない。"];
  let idx = 0;
  helper.textContent = loopTexts[idx];

  root.__ui_title_timer_id = setInterval(() => {
    idx = (idx + 1) % loopTexts.length;
    helper.textContent = loopTexts[idx];
  }, 800);

  wrap.appendChild(h1);
  wrap.appendChild(sub);
  wrap.appendChild(helper);
  root.appendChild(wrap);

  // 画面タップで start
  root.onclick = () => {
    const actions = ctx && ctx.actions;
    if (!actions) return;
    actions.go("start");
  };
}
