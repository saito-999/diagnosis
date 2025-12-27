let currentPage = 0;
const answers = [];

function renderPage() {
  const container = document.getElementById("questions");
  container.innerHTML = "";
  const start = currentPage * 10;
  const end = start + 10;

  for (let i = start; i < end; i++) {
    if (!window.QUESTIONS || !QUESTIONS[i]) break;
    const div = document.createElement("div");
    div.className = "question";
    div.innerHTML = `<p>${QUESTIONS[i].text}</p>` +
      [1,2,3,4,5].map(v =>
        `<label><input type="radio" name="q${i}" value="${v}">${v}</label>`
      ).join("");
    container.appendChild(div);
  }
}

document.getElementById("nextBtn").onclick = () => {
  const start = currentPage * 10;
  const end = start + 10;
  for (let i = start; i < end; i++) {
    const checked = document.querySelector(`input[name="q${i}"]:checked`);
    if (!checked) return alert("未回答があります");
    answers[i] = Number(checked.value);
  }
  currentPage++;
  if (currentPage * 10 >= (window.QUESTIONS?.length || 0)) {
    alert("診断完了（ここで結果処理）");
  } else {
    renderPage();
  }
};

renderPage();
