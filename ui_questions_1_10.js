// ui_questions_1_10.js
// export は render(root, ctx) のみ（契約） :contentReference[oaicite:0]{index=0}

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
  wrap.className = "screen screen-q1-10";

  // 凡例（固定文言） :contentReference[oaicite:1]{index=1}
  wrap.appendChild(_buildLegend());

  const qids = _qidList(1, 10);
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

  // 次へ（q11_20） :contentReference[oaicite:2]{index=2}
  const btnNext = document.createElement("button");
  btnNext.type = "button";
  btnNext.className = "btn";
  btnNext.textContent = "次へ";
  btnNext.onclick = () => {
    if (actions && typeof actions.go === "function") actions.go("q11_20");
  };

  // 最初へ（start） :contentReference[oaicite:3]{index=3}
  const btnStart = document.createElement("button");
  btnStart.type = "button";
  btnStart.className = "btn";
  btnStart.textContent = "最初へ";
  btnStart.onclick = () => {
    if (actions && typeof actions.go === "function") actions.go("start");
  };

  buttons.appendChild(btnNext);
  buttons.appendChild(btnStart);
  wrap.appendChild(buttons);

  root.appendChild(wrap);

  // 遷移条件：Q1〜Q10 のみで判定し、全回答で「次へ」有効化 :contentReference[oaicite:4]{index=4}
  function updateNextEnabled() {
    const ok = qids.every((qid) => _isAnswered(actions, qid));
    btnNext.disabled = !ok;
  }

  // 初期反映
  updateNextEnabled();

  // state.screen に依存する補完はしない（未定義扱い）
  void state;
}
