// ui_questions_1_10.js
// export は render(root, ctx) のみ

function _legendText() {
  return (
    "1=あてはまらない / 2=あまりあてはまらない / 3=どちらともいえない / " +
    "4=すこしあてはまる / 5=あてはまる"
  );
}

function _isAnswered(actions, qid) {
  const v = actions.getAnswerValue(qid);
  return Number.isInteger(v) && v >= 1 && v <= 5;
}

export function render(root, ctx) {
  if (!(root instanceof HTMLElement)) return;

  root.innerHTML = "";
  root.onclick = null;

  const actions = ctx && ctx.actions;

  const wrap = document.createElement("div");
  wrap.className = "screen screen-questions screen-q1-10";

  const legend = document.createElement("p");
  legend.className = "legend";
  legend.textContent = _legendText();
  wrap.appendChild(legend);

  const qids = Array.from({ length: 10 }, (_, i) => `Q${i + 1}`);

  const questions = actions.getQuestionsByQids(qids);
  const list = document.createElement("div");
  list.className = "question-list";

  for (const qid of qids) {
    const q =
      Array.isArray(questions)
        ? questions.find((x) => x && typeof x === "object" && x.qid === qid)
        : null;

    const block = document.createElement("div");
    block.className = "question";

    const qText = document.createElement("p");
    qText.className = "qtext";
    qText.textContent = q && typeof q.text === "string" ? q.text : "";
    block.appendChild(qText);

    const choices = document.createElement("div");
    choices.className = "choices";

    const current = actions.getAnswerValue(qid);

    for (let v = 1; v <= 5; v += 1) {
      const label = document.createElement("label");
      label.className = "choice";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = qid;
      input.value = String(v);
      input.checked = Number(current) === v;

      input.onchange = () => {
        actions.setAnswer(qid, v);
        updateNextEnabled();
      };

      const span = document.createElement("span");
      span.textContent = String(v);

      label.appendChild(input);
      label.appendChild(span);
      choices.appendChild(label);
    }

    block.appendChild(choices);
    list.appendChild(block);
  }

  wrap.appendChild(list);

  const btnWrap = document.createElement("div");
  btnWrap.className = "buttons";

  const btnNext = document.createElement("button");
  btnNext.type = "button";
  btnNext.textContent = "次へ";
  btnNext.onclick = () => actions.go("q11_20");

  const btnStart = document.createElement("button");
  btnStart.type = "button";
  btnStart.textContent = "最初へ";
  btnStart.onclick = () => actions.go("start");

  btnWrap.appendChild(btnNext);
  btnWrap.appendChild(btnStart);
  wrap.appendChild(btnWrap);

  root.appendChild(wrap);

  function updateNextEnabled() {
    const ok = qids.every((qid) => _isAnswered(actions, qid));
    btnNext.disabled = !ok;
  }

  updateNextEnabled();
}
