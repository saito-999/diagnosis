export function render(root, ctx) {
  const { state, actions } = ctx;
  const r = state?.result ?? null;

  const nickname = r?.nickname ?? "";
  const rarity = r?.rarity ?? "";
  const asset = r?.aliasAssetOverall ?? "_default.png";
  const saveCode = r?.saveCode ?? "";

  const tableRows = Array.isArray(r?.tableRows) ? r.tableRows : [];
  const phaseTexts = Array.isArray(r?.phaseTexts) ? r.phaseTexts : [];

  const rarityLegend = `C 35% / U 25% / R 20% / E 12% / M 6% / Lg 1.5% / Sg 0.5%`;

  const renderTable = () => {
    const rowsHtml = tableRows.map(row => `
      <tr>
        <td>${escapeHtml(row.phaseLabel ?? "")}</td>
        <td>${escapeHtml(row.scoreLabel ?? "")}</td>
        <td>${escapeHtml(row.note ?? "")}</td>
      </tr>
    `).join("");

    return `
      <table class="table" aria-label="フェーズ別の結果表">
        <thead>
          <tr>
            <th>フェーズ</th>
            <th>スコア</th>
            <th>備考</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
  };

  const sectionLabel = {
    scene: "よくあるシーン",
    why: "なぜ起きるのか",
    awareness: "自覚ポイント",
    recommend: "おすすめ",
    effect: "おすすめをやるとどうなりやすいか",
    partner: "マッチングしやすい相手像"
  };

  const renderSection = (key, sec) => {
    if (!sec) return "";
    const bullets = Array.isArray(sec.bullets) ? sec.bullets : [];
    const sentences = Array.isArray(sec.sentences) ? sec.sentences : [];
    return `
      <div>
        <div class="sectionTitle">${escapeHtml(sectionLabel[key] ?? key)}</div>
        ${bullets.length ? `<ul class="ul">${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join("")}</ul>` : ""}
        ${sentences.map(s => `<div class="p">${escapeHtml(s)}</div>`).join("")}
      </div>
    `;
  };

  const renderDetails = () => {
    const byPhaseKey = new Map(phaseTexts.map(p => [p.phaseKey, p]));
    const ordered = actions.getPhaseOrder().map(pk => byPhaseKey.get(pk)).filter(Boolean);

    return ordered.map(p => {
      const label = actions.phaseLabel(p.phaseKey);
      const sections = p.sections ?? {};
      const keys = ["scene","why","awareness","recommend","effect","partner"];
      return `
        <details class="details">
          <summary>${escapeHtml(label)}</summary>
          <div style="margin-top:6px;">
            ${keys.map(k => renderSection(k, sections[k])).join("")}
          </div>
        </details>
      `;
    }).join("");
  };

  root.innerHTML = `
    <div class="container">
      ${saveCode ? `<div class="saveCode">${escapeHtml(saveCode)}</div>` : ""}
      <div class="card stack">
        <div class="grid2">
          <div class="stack" style="gap:6px;">
            <div><span style="color:var(--muted); font-weight:600;">異名：</span>${escapeHtml(nickname)}</div>
            ${rarity ? `<div><span style="color:var(--muted); font-weight:600;">レアリティ：</span>${escapeHtml(rarity)}</div>` : ""}
          </div>
          <div>
            <img class="aliasImg" alt="" src="./assets/alias/${encodeURI(asset)}" />
          </div>
        </div>

        ${renderTable()}

        <div class="small">${rarityLegend}</div>

        <div class="stack" style="gap:10px;">
          ${renderDetails()}
        </div>

        <div class="row between" style="margin-top:2px;">
          <div class="btns">
            <button class="secondary" id="btnRetry">もう一度診断</button>
            <button class="ghost" id="btnCopy">IDをコピー</button>
          </div>
          <div class="btns">
            <button id="btnSave">結果を保存</button>
          </div>
        </div>
      </div>
    </div>
  `;

  root.querySelector("#btnRetry")?.addEventListener("click", () => actions.resetToStart());
  root.querySelector("#btnCopy")?.addEventListener("click", async () => actions.copySaveCode());
  root.querySelector("#btnSave")?.addEventListener("click", async () => actions.saveResult());

  function escapeHtml(s){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
}
