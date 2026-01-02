export function renderQuestions11to20(root, handlers) {
  const { questions, onAnswer, onNext } = handlers;

  const container = document.createElement("div");
  container.style.padding = "16px";

  const legend = document.createElement("div");
  legend.textContent = "1=あてはまらない / 2=あまりあてはまらない / 3=どちらともいえない / 4=すこしあてはまる / 5=あてはまる";
  legend.style.marginBottom = "12px";
  container.appendChild(legend);

  const answered = new Set();

  questions.slice(10, 20).forEach(q => {
    if (!q || !q.qid || !q.text) return;

    const block = document.createElement("div");
    block.style.marginBottom = "16px";

    const qText = document.createElement("div");
    qText.textContent = q.text;
    qText.style.marginBottom = "8px";
    block.appendChild(qText);

    const options = document.createElement("div");
    for (let v = 1; v <= 5; v++) {
      const label = document.createElement("label");
      label.style.marginRight = "8px";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = q.qid;
      input.value = v;
      input.addEventListener("change", () => {
        answered.add(q.qid);
        onAnswer && onAnswer(q.qid, v);
        updateNext();
      });

      label.appendChild(input);
      label.appendChild(document.createTextNode(String(v)));
      options.appendChild(label);
    }

    block.appendChild(options);
    container.appendChild(block);
  });

  const nextBtn = document.createElement("button");
  nextBtn.textContent = "次へ";
  nextBtn.disabled = true;
  nextBtn.addEventListener("click", () => onNext && onNext());

  function updateNext() {
    nextBtn.disabled = answered.size < 10;
  }

  container.appendChild(nextBtn);
  root.appendChild(container);
}
