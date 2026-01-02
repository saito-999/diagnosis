export function renderStart(root, handlers) {
  const { onStart, onRandom } = handlers;

  const container = document.createElement("div");
  container.style.minHeight = "100vh";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.justifyContent = "space-between";
  container.style.padding = "16px";

  const top = document.createElement("div");

  const title = document.createElement("h1");
  title.textContent = "恋愛戦場タイプ診断";

  const desc = document.createElement("div");
  desc.innerHTML = `
    <p>これは、あなたの価値や優劣・人間性を決めつける診断ではありません。</p>
    <p>恋愛の傾向を統計的にモデル化したものであり、正解とは限りません。</p>
    <p>
      恋愛心理学・行動科学・交際統計など複数研究の傾向から<br>
      「出会い〜交際〜結婚」フェーズ別のデータを用いて作成しています。
    </p>
  `;

  top.appendChild(title);
  top.appendChild(desc);

  const middle = document.createElement("div");

  const startBtn = document.createElement("button");
  startBtn.textContent = "▶ 診断を始める";
  startBtn.addEventListener("click", () => onStart && onStart());

  const randomBtn = document.createElement("button");
  randomBtn.textContent = "ランダム診断";
  randomBtn.style.marginLeft = "8px";
  randomBtn.addEventListener("click", () => onRandom && onRandom());

  middle.appendChild(startBtn);
  middle.appendChild(randomBtn);

  const bottom = document.createElement("div");
  const note = document.createElement("small");
  note.textContent = "※この診断は医学的・医療的評価を目的としたものではありません";
  bottom.appendChild(note);

  container.appendChild(top);
  container.appendChild(middle);
  container.appendChild(bottom);

  root.appendChild(container);
}
