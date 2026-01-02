// UI本体（本紙契約）
// - index.html は画面構造のみ
// - app.js は状態管理・画面遷移・別紙JS呼び出し・結果整形のみ
// - 算出ロジック（採点/判定/文章選択）は別紙JSの責務

import { QUESTIONS } from "./data_questions.js";
import { computeAllPhases } from "./contrib_table.js";
import { calcRarity } from "./rarity_logic.js";
import { calcAlias } from "./alias_logic.js";
import { getText } from "./text.js";

const PHASE_KEYS = ["matching", "firstMeet", "date", "relationship", "marriage"];
const PHASE_LABELS_JA = {
  matching: "出会い（マッチング）",
  firstMeet: "初対面",
  date: "デート",
  relationship: "交際",
  marriage: "結婚",
};

const SCORE_LABEL = {
  1: "激弱",
  2: "弱",
  3: "普通",
  4: "強",
  5: "激強",
};

const STORAGE_KEY = "love_diag_beta_state_v1";

function $(id) {
  return document.getElementById(id);
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const i = Math.trunc(x);
  if (i < min || i > max) return null;
  return i;
}

function parseQIndex(qid) {
  const m = /^Q(\d{1,2})$/.exec(String(qid || ""));
  if (!m) return null;
  return clampInt(m[1], 1, 20);
}

function getValidQuestions() {
  if (!Array.isArray(QUESTIONS)) return [];
  return QUESTIONS.filter((q) => q && typeof q.qid === "string" && typeof q.text === "string" && q.qid && q.text);
}

function initState() {
  return {
    screen: "title", // title/start/q1/q2/nickname/result
    answers: [], // [{qid, v}]
    result: null,
    scroll: {}, // per screen
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    return obj;
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function captureScroll(state) {
  state.scroll = state.scroll || {};
  state.scroll[state.screen] = window.scrollY || 0;
}

function restoreScroll(state) {
  const y = state?.scroll?.[state.screen];
  if (typeof y === "number" && Number.isFinite(y)) {
    window.scrollTo(0, y);
  } else {
    window.scrollTo(0, 0);
  }
}

function showScreen(state, nextScreen) {
  captureScroll(state);

  const screens = document.querySelectorAll(".screen");
  screens.forEach((el) => el.classList.remove("is-active"));

  const target = document.querySelector(`.screen[data-screen="${nextScreen}"]`);
  if (target) target.classList.add("is-active");

  state.screen = nextScreen;
  saveState(state);

  // 復元時に不自然に飛ばないよう、描画後に復元
  requestAnimationFrame(() => restoreScroll(state));
}

function upsertAnswer(state, qid, v) {
  const qn = parseQIndex(qid);
  const vv = clampInt(v, 1, 5);
  if (!qn || vv == null) return;

  const idx = state.answers.findIndex((a) => a && a.qid === qid);
  if (idx >= 0) state.answers[idx] = { qid, v: vv };
  else state.answers.push({ qid, v: vv });

  saveState(state);
}

function getAnswerValue(state, qid) {
  const a = state.answers.find((x) => x && x.qid === qid);
  return a ? a.v : null;
}

function getPageQuestions(validQuestions, pageIndex /* 0 or 1 */) {
  const start = pageIndex === 0 ? 0 : 10;
  const end = pageIndex === 0 ? 10 : 20;
  return validQuestions.slice(start, end);
}

function isPageComplete(state, pageQuestions) {
  return pageQuestions.every((q) => getAnswerValue(state, q.qid) != null);
}

function isAllComplete(state, validQuestions) {
  return validQuestions.length === 20 && validQuestions.every((q) => getAnswerValue(state, q.qid) != null);
}

function normalizeAnswers(state) {
  // 未回答がある状態では行わない
  const normalized = new Array(20).fill(null);
  for (const a of state.answers) {
    if (!a || typeof a.qid !== "string") continue;
    const qi = parseQIndex(a.qid);
    const vv = clampInt(a.v, 1, 5);
    if (!qi || vv == null) continue;
    normalized[qi - 1] = vv;
  }
  if (normalized.some((x) => x == null)) return null;
  return normalized;
}

function renderQuestions(state, pageIndex, containerId) {
  const container = $(containerId);
  if (!container) return;

  const questions = getValidQuestions();
  const pageQuestions = getPageQuestions(questions, pageIndex);

  container.innerHTML = "";

  for (const q of pageQuestions) {
    // 欠損している質問は表示しない（本紙）
    if (!q || typeof q.qid !== "string" || typeof q.text !== "string") continue;
    if (!q.qid || !q.text) continue;

    const card = document.createElement("div");
    card.className = "q-card";

    const p = document.createElement("p");
    p.className = "q-title";
    p.textContent = q.text;

    const choices = document.createElement("div");
    choices.className = "choices";

    const current = getAnswerValue(state, q.qid);

    for (let v = 1; v <= 5; v++) {
      const label = document.createElement("label");
      label.className = "choice";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = q.qid;
      input.value = String(v);
      if (current === v) input.checked = true;

      input.addEventListener("change", () => {
        upsertAnswer(state, q.qid, v);
        // ボタン活性の再評価
        updateNavButtons(state);
      });

      const span = document.createElement("span");
      span.textContent = String(v);

      label.appendChild(input);
      label.appendChild(span);
      choices.appendChild(label);
    }

    card.appendChild(p);
    card.appendChild(choices);
    container.appendChild(card);
  }
}

function updateNavButtons(state) {
  const validQuestions = getValidQuestions();
  const page1 = getPageQuestions(validQuestions, 0);
  const page2 = getPageQuestions(validQuestions, 1);

  const q1Next = $("btn-q1-next");
  if (q1Next) q1Next.disabled = !isPageComplete(state, page1);

  const q2Finish = $("btn-q2-finish");
  if (q2Finish) q2Finish.disabled = !isPageComplete(state, page2);
}

function setNicknameAndImage(nicknameValue, imageMaybe, textEl, imgEl) {
  if (textEl) textEl.textContent = nicknameValue || "";

  if (!imgEl) return;

  const src = typeof imageMaybe === "string" ? imageMaybe : "";
  if (src) {
    imgEl.src = src;
    imgEl.style.display = "block";
  } else {
    imgEl.removeAttribute("src");
    imgEl.style.display = "none";
  }
}

function buildLegendFixed() {
  // 本紙：文言・順序・割合固定（ただし本紙内に割合の記載がないため、値は外部から供給される想定）
  // UIは要素のみを表示する。値が未取得の場合は表示しない。
  const entries = [
    { code: "C", pct: "" },
    { code: "U", pct: "" },
    { code: "R", pct: "" },
    { code: "E", pct: "" },
    { code: "M", pct: "" },
    { code: "Lg", pct: "" },
    { code: "Sg", pct: "" },
  ];
  return entries;
}

function safeGet(obj, path) {
  try {
    return path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
  } catch {
    return undefined;
  }
}

function renderResult(state) {
  const result = state.result;
  if (!result || typeof result !== "object") return;

  // saveCode（ラベルなし）
  const saveCode = typeof result.saveCode === "string" ? result.saveCode : "";
  const saveEl = $("savecode");
  if (saveEl) saveEl.textContent = saveCode || "";

  // 異名・画像
  const nicknameEl = $("nickname");
  const nicknameImgEl = $("nickname-img");
  const nicknameOnlyEl = $("nickname-only");
  const nicknameOnlyImgEl = $("nickname-only-img");

  const nicknameValue = typeof result.nickname === "string" ? result.nickname : "";
  const nicknameImg = typeof result.nicknameImage === "string"
    ? result.nicknameImage
    : (typeof result.nicknameImagePath === "string" ? result.nicknameImagePath : "");

  setNicknameAndImage(nicknameValue, nicknameImg, nicknameEl, nicknameImgEl);
  setNicknameAndImage(nicknameValue, nicknameImg, nicknameOnlyEl, nicknameOnlyImgEl);

  // rarity
  const rarityEl = $("rarity");
  const rarityValue = typeof result.rarity === "string" ? result.rarity : "";
  if (rarityEl) rarityEl.textContent = rarityValue || "";

  // table
  const tbody = $("phase-table-body");
  if (tbody) tbody.innerHTML = "";

  const rows = Array.isArray(result.tableRows) ? result.tableRows : [];
  if (tbody) {
    for (const phaseKey of PHASE_KEYS) {
      // rows 形式は別紙を正とするため、できるだけ仮定しない
      const row = rows.find((r) => r && (r.phaseKey === phaseKey || r.phase === phaseKey)) || null;

      const tr = document.createElement("tr");

      const tdPhase = document.createElement("td");
      tdPhase.textContent = PHASE_LABELS_JA[phaseKey] || phaseKey;

      const tdScore = document.createElement("td");
      const band =
        (row && clampInt(row.scoreBand, 1, 5)) ??
        (row && clampInt(row.score, 1, 5)) ??
        (result.scoreBandByPhase && clampInt(result.scoreBandByPhase[phaseKey], 1, 5)) ??
        null;
      tdScore.textContent = band ? (SCORE_LABEL[band] || String(band)) : "";

      const tdNote = document.createElement("td");
      const note =
        (row && typeof row.note === "string" ? row.note : "") ||
        (row && typeof row.remark === "string" ? row.remark : "") ||
        "";
      tdNote.textContent = note;

      tr.appendChild(tdPhase);
      tr.appendChild(tdScore);
      tr.appendChild(tdNote);
      tbody.appendChild(tr);
    }
  }

  // rarity legend
  const legend = $("rarity-legend");
  if (legend) {
    legend.innerHTML = "";
    const entries = buildLegendFixed();
    for (const e of entries) {
      const item = document.createElement("div");
      item.className = "legend-item";

      const code = document.createElement("span");
      code.className = "code";
      code.textContent = e.code;

      item.appendChild(code);

      if (e.pct) {
        const pct = document.createElement("span");
        pct.className = "pct";
        pct.textContent = e.pct;
        item.appendChild(pct);
      }

      legend.appendChild(item);
    }
  }

  // phase details (fold)
  const detailsWrap = $("phase-details");
  if (detailsWrap) detailsWrap.innerHTML = "";

  const phaseTexts = Array.isArray(result.phaseTexts) ? result.phaseTexts : null;

  // patternKeysByPhase を使う場合（本紙）：未取得なら _default
  const patternKeysByPhase = result.patternKeysByPhase && typeof result.patternKeysByPhase === "object"
    ? result.patternKeysByPhase
    : null;

  for (const phaseKey of PHASE_KEYS) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = PHASE_LABELS_JA[phaseKey] || phaseKey;
    details.appendChild(summary);

    let sections = null;

    // 1) result.phaseTexts が別紙から返ってきている場合（別紙を正とする）
    if (phaseTexts) {
      const found = phaseTexts.find((p) => p && (p.phaseKey === phaseKey || p.phase === phaseKey));
      if (found && found.sections) sections = found.sections;
      else if (found && found.scene) sections = found; // 直接 section を持つ形
    }

    // 2) patternKeysByPhase がある場合は text.js から取得（本紙）
    if (!sections && patternKeysByPhase) {
      const pkRaw = patternKeysByPhase[phaseKey];
      const patternKey = typeof pkRaw === "string" && pkRaw ? pkRaw : "_default";
      try {
        sections = getText(phaseKey, patternKey);
      } catch {
        sections = null;
      }
    }

    if (sections && typeof sections === "object") {
      const order = [
        { key: "scene", title: "よくあるシーン" },
        { key: "why", title: "なぜ起きるのか" },
        { key: "awareness", title: "自覚ポイント" },
        { key: "recommend", title: "おすすめ" },
      ];

      for (const sec of order) {
        const block = sections[sec.key];
        if (!block || typeof block !== "object") continue;

        const wrap = document.createElement("div");
        wrap.className = "section-block";

        const h = document.createElement("p");
        h.className = "section-title";
        h.textContent = sec.title;

        wrap.appendChild(h);

        const bullets = Array.isArray(block.bullets) ? block.bullets : [];
        if (bullets.length) {
          const ul = document.createElement("ul");
          ul.className = "section-bullets";
          for (const b of bullets) {
            const li = document.createElement("li");
            li.textContent = String(b);
            ul.appendChild(li);
          }
          wrap.appendChild(ul);
        }

        const sentences = Array.isArray(block.sentences) ? block.sentences : [];
        if (sentences.length) {
          const ul2 = document.createElement("ul");
          ul2.className = "section-sentences";
          for (const s of sentences) {
            const li = document.createElement("li");
            li.textContent = String(s);
            ul2.appendChild(li);
          }
          wrap.appendChild(ul2);
        }

        details.appendChild(wrap);
      }
    }

    detailsWrap.appendChild(details);
  }
}

async function computeResultFromAnswers(state, runMode) {
  const validQuestions = getValidQuestions();
  if (validQuestions.length !== 20) return null;

  const answersNormalized = normalizeAnswers(state);
  if (!answersNormalized) return null;

  // rarity / alias は別紙に委譲
  let rarity = "";
  try {
    const r = calcRarity(answersNormalized);
    rarity = typeof r === "string" ? r : (r && typeof r.rarity === "string" ? r.rarity : "");
  } catch {
    rarity = "";
  }

  let nickname = "";
  let nicknameImage = "";
  try {
    const a = calcAlias(answersNormalized, rarity);
    if (typeof a === "string") {
      nickname = a;
    } else if (a && typeof a === "object") {
      if (typeof a.nickname === "string") nickname = a.nickname;
      else if (typeof a.name === "string") nickname = a.name;
      if (typeof a.image === "string") nicknameImage = a.image;
      else if (typeof a.imagePath === "string") nicknameImage = a.imagePath;
    }
  } catch {
    nickname = "";
    nicknameImage = "";
  }

  // contrib_table は別紙を正とするため、入力形を固定仮定しない（可能な範囲で呼び分け）
  let core = null;
  const meta = { runMode: runMode === "random" ? "random" : "manual" };

  try {
    core = computeAllPhases({ answersNormalized, meta });
  } catch {
    try {
      core = computeAllPhases({ answers: answersNormalized, meta });
    } catch {
      try {
        core = computeAllPhases(answersNormalized);
      } catch {
        core = null;
      }
    }
  }

  // UIは別紙出力を補完しない。UI表示に必要な最小フィールドのみを束ねる。
  const result = (core && typeof core === "object") ? { ...core } : {};

  // 本紙で出力が必須な項目（別紙側が返していない場合は未表示のまま）
  if (nickname && typeof result.nickname !== "string") result.nickname = nickname;
  if (nicknameImage && typeof result.nicknameImage !== "string") result.nicknameImage = nicknameImage;
  if (rarity && typeof result.rarity !== "string") result.rarity = rarity;

  // phaseKeys は固定でも可（本紙）
  if (!result.phaseKeys || typeof result.phaseKeys !== "object") {
    result.phaseKeys = {
      matching: "matching",
      firstMeet: "firstMeet",
      date: "date",
      relationship: "relationship",
      marriage: "marriage",
    };
  }

  return result;
}

function bindEvents(state) {
  // title tap -> start
  $("screen-title")?.addEventListener("click", () => showScreen(state, "start"));

  // start -> q1
  $("btn-start")?.addEventListener("click", () => {
    showScreen(state, "q1");
    renderQuestions(state, 0, "q1-list");
    updateNavButtons(state);
  });

  // random
  $("btn-random")?.addEventListener("click", async () => {
    // answers を完全ランダム（1..5）
    state.answers = [];
    for (let i = 1; i <= 20; i++) state.answers.push({ qid: `Q${i}`, v: 1 + Math.floor(Math.random() * 5) });
    saveState(state);

    state.result = await computeResultFromAnswers(state, "random");
    saveState(state);

    renderResult(state);
    showScreen(state, "nickname");
  });

  // q1 back -> start
  $("btn-q1-back")?.addEventListener("click", () => showScreen(state, "start"));

  // q1 next -> q2
  $("btn-q1-next")?.addEventListener("click", () => {
    showScreen(state, "q2");
    renderQuestions(state, 1, "q2-list");
    updateNavButtons(state);
  });

  // q2 back -> q1
  $("btn-q2-back")?.addEventListener("click", () => {
    showScreen(state, "q1");
    renderQuestions(state, 0, "q1-list");
    updateNavButtons(state);
  });

  // finish -> compute -> nickname
  $("btn-q2-finish")?.addEventListener("click", async () => {
    state.result = await computeResultFromAnswers(state, "manual");
    saveState(state);

    renderResult(state);
    showScreen(state, "nickname");
  });

  // nickname tap -> result
  $("screen-nickname")?.addEventListener("click", () => {
    renderResult(state);
    showScreen(state, "result");
  });

  // retry -> start (reset answers + result)
  $("btn-retry")?.addEventListener("click", () => {
    state.answers = [];
    state.result = null;
    saveState(state);
    showScreen(state, "start");
  });

  // copy saveCode (near retry)
  $("btn-copy")?.addEventListener("click", async () => {
    const code = typeof state.result?.saveCode === "string" ? state.result.saveCode : "";
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // ignore
    }
  });

  // save result
  $("btn-save")?.addEventListener("click", () => {
    // 本紙：結果を保存（具体保存形式は未定義）→ 状態保存のみ
    saveState(state);
  });
}

function restoreUI(state) {
  // 画面復元
  const screen = typeof state.screen === "string" ? state.screen : "title";
  showScreen(state, screen);

  // 必要に応じて描画
  if (screen === "q1") {
    renderQuestions(state, 0, "q1-list");
    updateNavButtons(state);
  } else if (screen === "q2") {
    renderQuestions(state, 1, "q2-list");
    updateNavButtons(state);
  } else if (screen === "nickname" || screen === "result") {
    renderResult(state);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const restored = loadState();
  const state = restored ? { ...initState(), ...restored } : initState();

  // answers / result の形だけ軽く整える（補完ではなく破損回避）
  if (!Array.isArray(state.answers)) state.answers = [];
  if (state.result && typeof state.result !== "object") state.result = null;

  // 初回描画
  restoreUI(state);
  bindEvents(state);
});
