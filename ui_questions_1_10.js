export function render(root, ctx) {
  const { state, actions } = ctx;
  const pageQids = Array.from({ length: 10 }, (_, i) => `Q${i + 1}`);

  const legend = `1=あてはまらない / 2=あまりあてはまらない / 3=どちらともいえない / 4=すこしあてはまる / 5=あてはまる`;

  const qs = actions.getQuestionsByQids(pageQids);

  const missing = qs.filter(q => !q.qid || !q.text);

  const renderQuestion = (q) => {
    const v = actions.getAnswerValue(q.qid);
    const choices = [1,2,3,4,5].map(n => `
      <label class="choice">
        <input type="radio" name="${q.qid}" value="${n}" ${v===n ? "checked" : ""} />
        <span>${n}</span>
      </label>
    `).join("");
    return `
      <div class="q" data-qid="${q.qid}">
        <div class="q-title">${q.qid}　${q.text}</div>
        <div class="choices">${choices}</div>
      </div>
    `;
  };

  root.innerHTML = `
    <div class="container">
      <div class="card stack">
        <div class="legend">${legend}</div>
        ${missing.length ? `<div class="notice">※質問データに欠損がある項目は表示しません</div>` : ""}
        <div class="stack">
          ${qs.filter(q => q.qid && q.text).map(renderQuestion).join("")}
        </div>
        <div class="row between" style="margin-top:6px;">
          <button class="ghost" id="btnToStart">最初へ</button>
          <div class="btns">
            <button id="btnNext">次へ</button>
          </div>
        </div>
        <div id="warn" class="notice" style="display:none;">未回答の質問があります</div>
      </div>
    </div>
  `;

  root.querySelector("#btnToStart")?.addEventListener("click", () => actions.go("start"));

  root.querySelectorAll('input[type="radio"]').forEach((el) => {
    el.addEventListener("change", (e) => {
      const input = e.target;
      const qid = input?.name;
      const v = Number(input?.value);
      actions.setAnswer(qid, v);
    });
  });

  root.querySelector("#btnNext")?.addEventListener("click", () => {
    const ok = actions.isAllAnswered(pageQids);
    const warn = root.querySelector("#warn");
    if (!ok) {
      if (warn) warn.style.display = "";
      return;
    }
    if (warn) warn.style.display = "none";
    actions.go("q11_20");
  });
}
