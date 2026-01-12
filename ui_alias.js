// ui_alias.js
// export ‚Í render(root, ctx) ‚Ì‚Ý

export function render(root, ctx) {
  if (!(root instanceof HTMLElement)) return;

  root.innerHTML = "";
  root.onclick = null;

  const state = ctx && ctx.state;
  const actions = ctx && ctx.actions;

  const wrap = document.createElement("div");
  wrap.className = "screen screen-alias";

  const nickname =
    state && state.result && typeof state.result.nickname === "string" ? state.result.nickname : "";

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

  // ‰æ–Êƒ^ƒbƒv‚Å result
  root.onclick = () => {
    actions.go("result");
  };
}
