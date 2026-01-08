/* ui_questions_11_20.js
 * export: render(root, ctx) のみ
 */
export function render(root, ctx) {
  if (!(root instanceof HTMLElement)) return;
  const { actions } = ctx || {};

  root.onclick = null;
  root.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "screen screen-questions screen-q11-20";

  const legend = document.createElement("p");
  legend.className = "legend";
  legend.textContent =
    "1=あてはまらない / 2=あまりあてはまらない / 3=どちらともいえない / 4=すこしあてはまる / 5=あてはまる";

  wrap.appendChild(legend);

  const list = document.createElement("div");
  list.className = "question-list";

  const qids = Array.from({ length: 10 }, (_, i) => `Q${i + 11}`);

  const questions =
    actions && typeof actions.getQuestionsByQids === "function"
      ? actions.getQuestionsByQids(qids)
      : [];

  const safeQuestions = Array.isArray(questions) ? questions : [];

  for (let i = 0; i < qids.length; i += 1) {
    const qid = qids[i];
    const q = safeQuestions.find((x) => x && typeof x === "object" && x.qid === qid);

    const block = document.createElement("div");
    block.className = "question";

    const qt = document.createElement("p");
    qt.className = "qtext";
    qt.textContent = q && typeof q.text === "string" ? q.text : "";

    block.appendChild(qt);

    const radios = document.createElement("div");
    radios.className = "choices";

    const current =
      actions && typeof actions.getAnswerValue === "function" ? actions.getAnswerValue(qid) : null;

    for (let v = 1; v <= 5; v += 1) {
      const label = document.createElement("label");
      label.className = "choice";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = qid;
      input.value = String(v);
      input.checked = Number(current) === v;

      input.onchange = () => {
        if (actions && typeof actions.setAnswer === "function") actions.setAnswer(qid, v);
        updateGoEnabled();
      };

      const span = document.createElement("span");
      span.textContent = String(v);

      label.appendChild(input);
      label.appendChild(span);
      radios.appendChild(label);
    }

    block.appendChild(radios);
    list.appendChild(block);
  }

  wrap.appendChild(list);

  const btnWrap = document.createElement("div");
  btnWrap.className = "buttons";

  const btnGo = document.createElement("button");
  btnGo.type = "button";
  btnGo.textContent = "結果へ";

  const btnBack = document.createElement("button");
  btnBack.type = "button";
  btnBack.textContent = "戻る";
  btnBack.onclick = () => {
    if (actions && typeof actions.go === "function") actions.go("q1_10");
  };

  btnGo.onclick = () => {
    if (actions && typeof actions.go === "function") actions.go("alias");
  };

  btnWrap.appendChild(btnGo);
  btnWrap.appendChild(btnBack);
  wrap.appendChild(btnWrap);

  root.appendChild(wrap);

  function isAnswered(qid) {
    const v =
      actions && typeof actions.getAnswerValue === "function" ? actions.getAnswerValue(qid) : null;
    return Number.isInteger(v) && v >= 1 && v <= 5;
  }

  function updateGoEnabled() {
    // 表示中10問すべて回答で有効化
    const ok = qids.every(isAnswered);
    btnGo.disabled = !ok;
  }

  updateGoEnabled();
}
