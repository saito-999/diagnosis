export function render(root, ctx) {
  const { actions } = ctx;

  root.innerHTML = `
    <div class="container">
      <div class="card stack">
        <div>
          <div class="h1">恋愛戦場タイプ診断</div>
        </div>

        <div class="stack" style="gap:12px;">
          <button id="btnStart" aria-label="診断開始">▶ 診断を始める</button>
          <button id="btnRandom" class="secondary" aria-label="ランダム診断">ランダム診断</button>
        </div>

        <div class="stack" style="gap:10px;">
          <div class="small" style="line-height:1.7;">
            これは、あなたの価値や優劣・人間性を決めつける診断ではありません。<br/>
            恋愛の傾向を統計的にモデル化したものであり、正解とは限りません。<br/><br/>
            恋愛心理学・行動科学・交際統計など複数研究の傾向から<br/>
            「出会い〜交際〜結婚」フェーズ別のデータを用いて作成しています。
          </div>

          <div class="small" style="margin-top:4px;">※この診断は医学的・医療的評価を目的としたものではありません</div>
        </div>
      </div>
    </div>
  `;

  root.querySelector("#btnStart")?.addEventListener("click", () => actions.go("q1_10"));
  root.querySelector("#btnRandom")?.addEventListener("click", () => actions.runRandom());
}
