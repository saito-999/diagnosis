/* ui_title.js
 * export: render(root, ctx) のみ
 */
export function render(root, ctx) {
  if (!(root instanceof HTMLElement)) return;
  const { actions } = ctx || {};
  const goStart = () => {
    if (actions && typeof actions.go === "function") actions.go("start");
  };

  // 以前のタイマーが残っていたら止める（title の動的表示用）
  if (root.__uiTitleTimerId) {
    clearInterval(root.__uiTitleTimerId);
    root.__uiTitleTimerId = null;
  }

  root.onclick = null;
  root.innerHTML = "";

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

  // 0.8秒ループ表示
  root.__uiTitleTimerId = setInterval(() => {
    idx = (idx + 1) % loopTexts.length;
    helper.textContent = loopTexts[idx];
  }, 800);

  wrap.appendChild(h1);
  wrap.appendChild(sub);
  wrap.appendChild(helper);

  root.appendChild(wrap);

  // 画面全体タップで start
  root.onclick = goStart;
}
