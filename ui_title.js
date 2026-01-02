export function renderTitle(root, onNext) {
  const container = document.createElement("div");
  container.style.minHeight = "100vh";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.justifyContent = "center";
  container.style.alignItems = "center";
  container.style.textAlign = "center";

  const title = document.createElement("h1");
  title.textContent = "恋愛戦場タイプ診断";

  const subtitle = document.createElement("p");
  subtitle.textContent = "あなたが下手でも悪いんでもない。逢ってないだけ。";

  const loop = document.createElement("div");
  const lines = ["会ってる。","合ってない。","遇ってる。","遭ってない。"];
  let idx = 0;
  loop.textContent = lines[idx];

  setInterval(() => {
    idx = (idx + 1) % lines.length;
    loop.textContent = lines[idx];
  }, 400);

  container.appendChild(title);
  container.appendChild(subtitle);
  container.appendChild(loop);

  container.addEventListener("click", () => {
    onNext();
  });

  root.appendChild(container);
}
