// ui_questions_11_20.js
// export は render(root, ctx) のみ（契約） :contentReference[oaicite:5]{index=5}

function _buildLegend() {
  const p = document.createElement("p");
  p.className = "legend";
  p.textContent =
    '1=あてはまらない / 2=あまりあてはまらない / 3=どちらともいえない / 4=すこしあてはまる / 5=あてはまる';
  return p;
}

function _qidList(from, to) {
  const out = [];
  for (let i = from; i <= to; i += 1) out.push(`Q${i}`);
  return out;
}

function _isAnswered(actions, qid) {
  if (!actions || typeof actions.getAnswerValue !== "function") return false;
  const v = actions.getAnswerValue(qid);
  return Number.isInteger(v) && v >= 1 && v <= 5;
}

function _buildChoice(qid, v, checked, onChange) {
  const label = document.createElement("label");
  label.className = "choice";

  const input = document.createElement("input");
  input.type = "radio";
  input.name = qid;
  input.value = String(v);
  input.checked = checked;
  input.onchange = onChange;

  const span = document.createElement("span");
  span.textContent = String(v);

  label.appendChild(input);
  label.appendChild(span);
  return label;
}

export function render(root, ctx) {
  if (!(root instanceof HTMLElement)) return;
  const state = ctx ? ctx.state : null;
  const actions = ctx ? ctx.actions : null;

  root.onclick = null;
  root.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "screen screen-q11-20";

  // 凡例（固定文言） :contentReference[oaicite:6]{index=6}
  wrap.appendChild(_buildLegend());

  const qids = _qidList(11, 20);
  const questions =
    actions && typeof actions.getQuestionsByQids === "function"
      ? actions.getQuestionsByQids(qids)
      : [];

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

    const current =
      actions && typeof actions.getAnswerValue === "function"
        ? actions.getAnswerValue(qid)
        : null;

    for (let v = 1; v <= 5; v += 1) {
      const checked = Number(current) === v;
      choices.appendChild(
        _buildChoice(qid, v, checked, () => {
          if (actions && typeof actions.setAnswer === "function") {
            actions.setAnswer(qid, v);
            updateNextEnabled();
          }
        })
      );
    }

    block.appendChild(choices);
    list.appendChild(block);
  }

  wrap.appendChild(list);

  const buttons = document.createElement("div");
  buttons.className = "buttons";

  // 次へ（alias） :contentReference[oaicite:7]{index=7}
  const btnNext = document.createElement("button");
  btnNext.type = "button";
  btnNext.className = "btn";
  btnNext.textContent = "次へ";
  btnNext.onclick = () => {
    if (actions && typeof actions.go === "function") actions.go("alias");
  };

  // 戻る（q1_10） :contentReference[oaicite:8]{index=8}
  const btnBack = document.createElement("button");
  btnBack.type = "button";
  btnBack.className = "btn";
  btnBack.textContent = "戻る";
  btnBack.onclick = () => {
    if (actions && typeof actions.go === "function") actions.go("q1_10");
  };

  buttons.appendChild(btnNext);
  buttons.appendChild(btnBack);
  wrap.appendChild(buttons);

  root.appendChild(wrap);

  // 遷移条件：Q11〜Q20 のみで判定し、全回答で「次へ」有効化 :contentReference[oaicite:9]{index=9}
  function updateNextEnabled() {
    const ok = qids.every((qid) => _isAnswered(actions, qid));
    btnNext.disabled = !ok;
  }

  updateNextEnabled();

  void state;
}
