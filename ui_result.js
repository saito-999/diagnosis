// ui_result.js
// export は render(root, ctx) のみ

async function _copyText(text) {
  if (typeof text !== "string" || text.length === 0) return;

  try {
    if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (_) {
    // fallthrough
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  } catch (_) {
    // no-op
  }
}

export function render(root, ctx) {
  if (!(root instanceof HTMLElement)) return;

  root.innerHTML = "";
  root.onclick = null;

  const state = ctx && ctx.state;
  const actions = ctx && ctx.actions;
  const result = state ? state.result : null;

  const wrap = document.createElement("div");
  wrap.className = "screen screen-result";

  // 保存コード（右上・小さく・薄く、ラベルなし）
  const saveCode = result && typeof result.saveCode === "string" ? result.saveCode : "";
  const saveCodeEl = document.createElement("div");
  saveCodeEl.className = "save-code";
  saveCodeEl.textContent = saveCode;
  wrap.appendChild(saveCodeEl);

  // 異名（ラベル付き）
  const nickname = result && typeof result.nickname === "string" ? result.nickname : "";
  const nickRow = document.createElement("div");
  nickRow.className = "row nickname-row";
  const nickLabel = document.createElement("span");
  nickLabel.className = "label";
  nickLabel.textContent = "異名：";
  const nickVal = document.createElement("span");
  nickVal.className = "value";
  nickVal.textContent = nickname;
  nickRow.appendChild(nickLabel);
  nickRow.appendChild(nickVal);
  wrap.appendChild(nickRow);

  // レアリティ（略称テキスト）
  const rarity = result && typeof result.rarity === "string" ? result.rarity : "";
  const rarityRow = document.createElement("div");
  rarityRow.className = "row rarity-row";
  rarityRow.textContent = rarity;
  wrap.appendChild(rarityRow);

  // 異名画像（存在する場合のみ表示）
  const aliasImage = result && typeof result.aliasImage === "string" ? result.aliasImage : null;
  if (aliasImage) {
    const img = document.createElement("img");
    img.className = "result-alias-image";
    img.alt = "";
    img.src = aliasImage;
    wrap.appendChild(img);
  }

  // フェーズ別結果表（tableRows）
  const tableRows = result && Array.isArray(result.tableRows) ? result.tableRows : null;
  if (tableRows) {
    const table = document.createElement("table");
    table.className = "phase-table";

    const tbody = document.createElement("tbody");

    for (const row of tableRows) {
      if (!row || typeof row !== "object") continue;

      const tr = document.createElement("tr");

      const tdPhase = document.createElement("td");
      tdPhase.className = "phase";
      tdPhase.textContent = typeof row.phaseLabel === "string" ? row.phaseLabel : "";

      const tdScore = document.createElement("td");
      tdScore.className = "score";
      tdScore.textContent = typeof row.scoreLabel === "string" ? row.scoreLabel : "";

      const tdNote = document.createElement("td");
      tdNote.className = "note";
      tdNote.textContent = typeof row.note === "string" ? row.note : "";

      tr.appendChild(tdPhase);
      tr.appendChild(tdScore);
      tr.appendChild(tdNote);
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  // レアリティ凡例（固定表示・確率％）
  const rarityLegend = document.createElement("p");
  rarityLegend.className = "rarity-legend";
  rarityLegend.textContent = "C 35% / U 25% / R 20% / E 12% / M 6% / Lg 1.5% / Sg 0.5%";
  wrap.appendChild(rarityLegend);

  // フェーズ別詳細文章（折りたたみ）
  const phaseTexts = result && Array.isArray(result.phaseTexts) ? result.phaseTexts : null;
  if (phaseTexts) {
    const detailsWrap = document.createElement("div");
    detailsWrap.className = "phase-texts";

    for (const pt of phaseTexts) {
      if (!pt || typeof pt !== "object") continue;

      const details = document.createElement("details");
      details.className = "phase-detail";

      const summary = document.createElement("summary");
      summary.textContent = typeof pt.phaseLabel === "string" ? pt.phaseLabel : "";
      details.appendChild(summary);

      const sections = pt.sections;
      const order = ["scene", "why", "awareness", "recommend"];

      if (sections && typeof sections === "object") {
        for (const key of order) {
          const val = sections[key];

          if (typeof val === "string") {
            const t = val.trim();
            if (t !== "") {
              const p = document.createElement("p");
              p.className = `section section-${key}`;
              p.textContent = t;
              details.appendChild(p);
            }
            continue;
          }

          if (Array.isArray(val)) {
            for (const item of val) {
              if (typeof item !== "string") continue;
              const t = item.trim();
              if (t === "") continue;
              const p = document.createElement("p");
              p.className = `section section-${key}`;
              p.textContent = t;
              details.appendChild(p);
            }
          }
        }
      }

      detailsWrap.appendChild(details);
    }

    wrap.appendChild(detailsWrap);
  }

  // 操作ボタン + コピーボタン（付近）
  const btnWrap = document.createElement("div");
  btnWrap.className = "buttons";

  const btnRetry = document.createElement("button");
  btnRetry.type = "button";
  btnRetry.textContent = "もう一度診断";
  btnRetry.onclick = () => actions.go("start");

  const btnSave = document.createElement("button");
  btnSave.type = "button";
  btnSave.textContent = "結果を保存";
  btnSave.onclick = () => {
    // 画面遷移なし（現在結果を保持）
  };

  const btnCopy = document.createElement("button");
  btnCopy.type = "button";
  btnCopy.textContent = "コピー";
  btnCopy.onclick = async () => {
    await _copyText(saveCode);
  };

  btnWrap.appendChild(btnRetry);
  btnWrap.appendChild(btnSave);
  btnWrap.appendChild(btnCopy);

  wrap.appendChild(btnWrap);

  // 将来用 UI 枠（非表示）
  const future = document.createElement("div");
  future.className = "future-frame";
  future.style.display = "none";
  wrap.appendChild(future);

  root.appendChild(wrap);
}
