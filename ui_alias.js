export function renderAlias(root, result, onNext) {
  const container = document.createElement("div");
  container.style.minHeight = "100vh";
  container.style.display = "flex";
  container.style.alignItems = "center";
  container.style.justifyContent = "space-between";
  container.style.padding = "16px";

  const name = document.createElement("div");
  name.textContent = result?.nickname ?? "";
  name.style.fontSize = "24px";
  name.style.flex = "1";

  const img = document.createElement("img");
  if (result?.aliasImage) {
    img.src = result.aliasImage;
  }
  img.style.maxWidth = "40%";
  img.style.objectFit = "contain";

  container.appendChild(name);
  container.appendChild(img);

  container.addEventListener("click", () => {
    onNext && onNext();
  });

  root.appendChild(container);
}
