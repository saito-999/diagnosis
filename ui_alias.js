export function render(root, ctx) {
  const { state, actions } = ctx;
  const nickname = state?.result?.nickname ?? "";
  const asset = state?.result?.aliasAssetOverall ?? "_default.png";

  root.innerHTML = `
    <div class="container">
      <div class="card" id="aliasCard" style="cursor:pointer;">
        <div class="grid2">
          <div>
            <div class="h1" style="margin-bottom:0;">${escapeHtml(nickname)}</div>
          </div>
          <div>
            <img class="aliasImg" alt="" src="./assets/alias/${encodeURI(asset)}" />
          </div>
        </div>
        <div class="small" style="margin-top:14px;">画面をタップすると進みます</div>
      </div>
    </div>
  `;

  root.querySelector("#aliasCard")?.addEventListener("click", () => actions.go("result"));

  function escapeHtml(s){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
}
