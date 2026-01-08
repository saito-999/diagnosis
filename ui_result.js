/* ui_result.js
 * export: render(root, ctx) のみ
 */
export function render(root, ctx) {
  if (!(root instanceof HTMLElement)) return;
  const { state, actions } = ctx || {};
  const result = state ? state.result : null;

  root.onclick = null;
  root.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "screen screen-result";

  // 保存コード（右上・小さく・薄く）※ラベルなし
  const saveCode =
    result && typeof result.saveCode === "string" ? result.saveCode : "";

  const saveCodeEl = document.createElement("div");
  saveCodeEl.className = "save-code";
  saveCodeEl.textContent = saveCode;
  wrap.appendChild(saveCodeEl);

  // 異名（ラベル付き）
  const nickname =
    result && typeof result.nickname === "string" ? result.nickname : "";
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
  const rarity =
    result && typeof result.rarity === "string" ? result.rarity : "";
  const rarityRow = document.createElement("div");
  rarityRow.className = "row rarity-row";
  rarityRow.textContent = rarity;
  wrap.appendChild(rarityRow);

  // 異名画像（存在する場合のみ表示）
  const aliasImage =
    result && typeof result.aliasImage === "string" ? result.aliasImage : null;
  if (aliasImage) {
    const img = document.createElement("img");
    img.className = "result-alias-image";
    img.alt = "";
    img.src = aliasImage;
    wrap.appendChild(img);
  }

  // フェーズ別結果表：result.tableRows を表形式で表示（score / note）
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

      // phase 表示名は未定義なら非表示（補完しない）
      const phaseLabel =
        typeof row.phaseLabel === "string"
          ? row.phaseLabel
          : typeof row.phase === "string"
            ? row.phase
            : "";

      tdPhase.textContent = phaseLabel;

      const tdScore = document.createElement("td");
      tdScore.className = "score";
      const score =
        typeof row.score === "string" || typeof row.score === "number"
          ? String(row.score)
          : "";
      tdScore.textContent = score;

      const tdNote = document.createElement("td");
      tdNote.className = "note";
      const note =
        typeof row.note === "string" ? row.note : "";
      tdNote.textContent = note;

      tr.appendChild(tdPhase);
      tr.appendChild(tdScore);
      tr.appendChild(tdNote);
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  // レアリティ凡例（固定表示、横書き）
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
      const phaseLabel =
        typeof pt.phaseLabel === "string"
          ? pt.phaseLabel
          : typeof pt.phase === "string"
            ? pt.phase
            : "";
      summary.textContent = phaseLabel;

      details.appendChild(summary);

      // sections（scene / why / awareness / recommend を順に表示）
      const sections = pt.sections;
      if (sections && typeof sections === "object") {
        const order = ["scene", "why", "awareness", "recommend"];
        for (const key of order) {
          const val = sections[key];
          if (typeof val === "string" && val.trim() !== "") {
            const p = document.createElement("p");
            p.className = `section section-${key}`;
            p.textContent = val;
            details.appendChild(p);
          } else if (Array.isArray(val)) {
            // 配列要素が string の場合のみ表示（補完しない）
            for (const item of val) {
              if (typeof item !== "string" || item.trim() === "") continue;
              const p = document.createElement("p");
              p.className = `section section-${key}`;
              p.textContent = item;
              details.appendChild(p);
            }
          }
        }
      }

      detailsWrap.appendChild(details);
    }

    wrap.appendChild(detailsWrap);
  }

  // 操作ボタン＋コピーボタン（付近に配置）
  const btnWrap = document.createElement("div");
  btnWrap.className = "buttons";

  const btnRetry = document.createElement("button");
  btnRetry.type = "button";
  btnRetry.textContent = "もう一度診断";
  btnRetry.onclick = () => {
    if (actions && typeof actions.go === "function") actions.go("start");
  };

  const btnSave = document.createElement("button");
  btnSave.type = "button";
  btnSave.textContent = "結果を保存";
  btnSave.onclick = () => {
    // 本紙：結果保存の仕様（遷移や保存先）はここでは未定義。挙動追加は禁止。
  };

  const btnCopy = document.createElement("button");
  btnCopy.type = "button";
  btnCopy.textContent = "コピー";
  btnCopy.onclick = async () => {
    if (!saveCode) return;
    await copyToClipboard(saveCode);
  };

  btnWrap.appendChild(btnRetry);
  btnWrap.appendChild(btnSave);
  btnWrap.appendChild(btnCopy);

  wrap.appendChild(btnWrap);

  // 将来用UI枠（非表示）
  const future = document.createElement("div");
  future.className = "future-frame";
  future.style.display = "none";
  wrap.appendChild(future);

  root.appendChild(wrap);

  async function copyToClipboard(text) {
    try {
      if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch (_) {
      // fallthrough
    }
    // fallback（成功保証はしない）
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
}
