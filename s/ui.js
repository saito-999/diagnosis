import { PHASES, SCORE_LABEL } from "./phases.js";

export function qs(sel, root=document){ return root.querySelector(sel); }
export function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

export function showScreen(screenKey){
  qsa(".screen").forEach(el => el.classList.remove("is-active"));
  const el = qs(`[data-screen="${screenKey}"]`);
  if(el) el.classList.add("is-active");
}

export function renderQuestions(container, questions, answersMap){
  container.innerHTML = "";
  questions.forEach(q => {
    if(!q || typeof q.qid !== "string" || typeof q.text !== "string" || !q.qid || !q.text) return;

    const wrap = document.createElement("div");
    wrap.className = "question";

    const p = document.createElement("p");
    p.className = "qtext";
    p.textContent = `${q.qid}. ${q.text}`;
    wrap.appendChild(p);

    const choices = document.createElement("div");
    choices.className = "choices";

    for(let v=1; v<=5; v++){
      const label = document.createElement("label");
      label.className = "choice";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = q.qid;
      input.value = String(v);
      input.checked = answersMap.get(q.qid) === v;
      input.addEventListener("change", () => {
        const ev = new CustomEvent("answer-change", { detail: { qid: q.qid, v }});
        container.dispatchEvent(ev);
      });

      const span = document.createElement("span");
      span.textContent = String(v);

      label.appendChild(input);
      label.appendChild(span);
      choices.appendChild(label);
    }

    wrap.appendChild(choices);
    container.appendChild(wrap);
  });
}

export function renderAliasScreen(nickname, imgSrc){
  const textEl = qs("#alias-only-text");
  const imgEl = qs("#alias-only-img");
  textEl.textContent = nickname ?? "";
  if(imgSrc){
    imgEl.src = imgSrc;
    imgEl.style.display = "";
  }else{
    imgEl.removeAttribute("src");
    imgEl.style.display = "none";
  }
}

export function renderResult(result){
  qs("#savecode").textContent = result?.saveCode ?? "";
  qs("#nickname").textContent = result?.nickname ?? "";
  qs("#rarity").textContent = result?.rarity ?? "";

  const nickImg = qs("#nickname-img");
  if(result?.nicknameImageSrc){
    nickImg.src = result.nicknameImageSrc;
    nickImg.style.display = "";
  }else{
    nickImg.removeAttribute("src");
    nickImg.style.display = "none";
  }

  // Table rows: phase / score / remark(=scene bullet 1)
  const tbody = qs("#phase-table-body");
  tbody.innerHTML = "";
  PHASES.forEach(ph => {
    const tr = document.createElement("tr");
    const tdPhase = document.createElement("td");
    tdPhase.textContent = ph.label;
    const tdScore = document.createElement("td");
    const band = result?.scoreBandByPhase?.[ph.key];
    tdScore.textContent = SCORE_LABEL[band] ?? "";
    const tdRemark = document.createElement("td");
    const textObj = result?.phaseTextsByPhase?.[ph.key];
    const b0 = textObj?.scene?.bullets?.[0];
    tdRemark.textContent = (typeof b0 === "string") ? b0 : "";
    tr.appendChild(tdPhase);
    tr.appendChild(tdScore);
    tr.appendChild(tdRemark);
    tbody.appendChild(tr);
  });

  // Rarity legend (fixed in code; if later specified, replace these constants)
  const legend = qs("#rarity-legend");
  legend.textContent = "";
  const line = document.createElement("div");
  line.textContent = "C / U / R / E / M / Lg / Sg";
  legend.appendChild(line);

  // Phase details (collapsible)
  const detailsWrap = qs("#phase-details");
  detailsWrap.innerHTML = "";
  PHASES.forEach(ph => {
    const d = document.createElement("details");
    const s = document.createElement("summary");
    s.textContent = ph.label;
    d.appendChild(s);

    const txt = result?.phaseTextsByPhase?.[ph.key];
    const block = document.createElement("div");

    if(txt){
      // Render sections in fixed order without extra headings/labels
      const order = ["scene", "why", "awareness", "recommend"];
      order.forEach(k => {
        const sec = txt[k];
        if(!sec) return;

        const bullets = Array.isArray(sec.bullets) ? sec.bullets : [];
        const sentences = Array.isArray(sec.sentences) ? sec.sentences : [];

        bullets.filter(v => typeof v === "string" && v.length).forEach(v => {
          const p = document.createElement("div");
          p.textContent = `・${v}`;
          block.appendChild(p);
        });
        sentences.filter(v => typeof v === "string" && v.length).forEach(v => {
          const p = document.createElement("div");
          p.textContent = v;
          block.appendChild(p);
        });

        block.appendChild(document.createElement("br"));
      });
    }

    d.appendChild(block);
    detailsWrap.appendChild(d);
  });
}
