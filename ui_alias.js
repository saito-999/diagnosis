/* ui_alias.js
 * export: render(root, ctx) のみ
 */
export function render(root, ctx) {
  if (!(root instanceof HTMLElement)) return;
  const { state, actions } = ctx || {};

  root.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "screen screen-alias";

  const nickname = state && state.result && typeof state.result.nickname === "string" ? state.result.nickname : "";

  const text = document.createElement("div");
  text.className = "alias-text";
  text.textContent = nickname;

  wrap.appendChild(text);

  const imgSrc =
    state && state.result && typeof state.result.aliasImage === "string" ? state.result.aliasImage : null;

  if (imgSrc) {
    const img = document.createElement("img");
    img.className = "alias-image";
    img.alt = "";
    img.src = imgSrc;
    wrap.appendChild(img);
  }

  root.appendChild(wrap);

  // 画面全体タップで result
  root.onclick = () => {
    if (actions && typeof actions.go === "function") actions.go("result");
  };
}
