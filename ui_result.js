export function renderResult(root, result, handlers = {}) {
  const { onRetry, onSave } = handlers;

  const container = document.createElement("div");
  container.style.padding = "16px";

  // 保存コード（右上・薄く）
  if (result?.saveCode) {
    const code = document.createElement("div");
    code.textContent = result.saveCode;
    code.style.position = "fixed";
    code.style.top = "8px";
    code.style.right = "8px";
    code.style.opacity = "0.5";
    code.style.fontSize = "12px";
    container.appendChild(code);
  }

  // 異名
  const nickname = document.createElement("div");
  nickname.textContent = result?.nickname ?? "";
  nickname.style.fontSize = "20px";
  container.appendChild(nickname);

  // レアリティ
  const rarity = document.createElement("div");
  rarity.textContent = result?.rarity ?? "";
  container.appendChild(rarity);

  // フェーズ別表
  if (Array.isArray(result?.tableRows)) {
    const table = document.createElement("table");
    table.style.width = "100%";
    result.tableRows.forEach(row => {
      const tr = document.createElement("tr");
      const td1 = document.createElement("td");
      const td2 = document.createElement("td");
      td1.textContent = row.score;
      td2.textContent = row.note;
      tr.appendChild(td1);
      tr.appendChild(td2);
      table.appendChild(tr);
    });
    container.appendChild(table);
  }

  // レアリティ凡例
  const legend = document.createElement("div");
  legend.textContent = "C / U / R / E / M / Lg / Sg";
  container.appendChild(legend);

  // フェーズ文章
  if (result?.phaseTexts) {
    Object.values(result.phaseTexts).forEach(block => {
      if (!block) return;
      const section = document.createElement("div");
      ["scene","why","awareness","recommend"].forEach(k => {
        if (!block[k]) return;
        const part = document.createElement("div");
        if (Array.isArray(block[k].bullets)) {
          block[k].bullets.forEach(b => {
            const li = document.createElement("div");
            li.textContent = b;
            part.appendChild(li);
          });
        }
        if (Array.isArray(block[k].sentences)) {
          block[k].sentences.forEach(s => {
            const p = document.createElement("div");
            p.textContent = s;
            part.appendChild(p);
          });
        }
        section.appendChild(part);
      });
      container.appendChild(section);
    });
  }

  const actions = document.createElement("div");

  const retryBtn = document.createElement("button");
  retryBtn.textContent = "もう一度診断";
  retryBtn.addEventListener("click", () => onRetry && onRetry());
  actions.appendChild(retryBtn);

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "結果を保存";
  saveBtn.addEventListener("click", () => onSave && onSave());
  actions.appendChild(saveBtn);

  container.appendChild(actions);
  root.appendChild(container);
}
