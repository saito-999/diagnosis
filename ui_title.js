export function render(root, ctx) {
  const { actions } = ctx;

  root.innerHTML = `
    <div class="container">
      <div class="card" id="titleCard" style="cursor:pointer;">
        <div class="h1">恋愛戦場タイプ診断</div>
        <div class="h2">あなたが下手でも悪いんでもない。逢ってないだけ。</div>
        <div class="fadeLoop" aria-label="行ループ表示">
          <span id="loopText"></span>
        </div>
        <div class="small" style="margin-top:14px;">画面をタップすると進みます</div>
      </div>
    </div>
  `;

  const lines = ["会ってる。", "合ってない。", "遇ってる。", "遭ってない。"];
  let i = 0;
  const loopEl = root.querySelector("#loopText");
  const tick = () => {
    if (!loopEl) return;
    loopEl.textContent = lines[i % lines.length];
    loopEl.style.animationDelay = "0s";
    i += 1;
  };
  tick();
  const timer = window.setInterval(tick, 400);

  const card = root.querySelector("#titleCard");
  card?.addEventListener("click", () => {
    window.clearInterval(timer);
    actions.go("start");
  });
}
