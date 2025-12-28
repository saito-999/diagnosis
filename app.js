/* app.js
   - UI & state only. Calculation logic is blackbox (provided by: rarity_logic.js / alias_logic.js / contrib_table.js / data_questions.js)
   - This file intentionally avoids modifying those blackbox modules.
*/

(() => {
  'use strict';

  // ===== Spec constants (rarity legend is fixed in 本紙) =====
  const RARITY_RATES = {
    C: 35,
    U: 25,
    R: 20,
    E: 12,
    M: 6,
    Lg: 1.5,
    Sg: 0.5,
  };

  const PHASES = [
    { key: 'matching', label: '出会い（マッチング）' },
    { key: 'firstMeet', label: '初対面' },
    { key: 'date', label: 'デート' },
    { key: 'relationship', label: '交際' },
    { key: 'marriage', label: '結婚' },
  ];

  // ===== Storage keys =====
  const STORAGE_KEY = 'love_diag_beta_v1';

  // ===== DOM =====
  const $ = (sel) => document.querySelector(sel);

  const viewStart = $('#viewStart');
  const viewQuestions = $('#viewQuestions');
  const viewResult = $('#viewResult');
  const viewError = $('#viewError');

  const btnStart = $('#btnStart');
  const btnRandom = $('#btnRandom');
  const btnPrevPage = $('#btnPrevPage');
  const btnNextPage = $('#btnNextPage');
  const btnToResult = $('#btnToResult');
  const btnToStart = $('#btnToStart');

  const pageIndicator = $('#pageIndicator');
  const questionList = $('#questionList');
  const toast = $('#toast');

  const saveCodeEl = $('#saveCode');
  const btnCopySaveCode = $('#btnCopySaveCode');

  const aliasTextEl = $('#aliasText');
  const aliasFullTextEl = $('#aliasFullText');
  const aliasAssetEl = $('#aliasAsset');
  const btnShowAlias = $('#btnShowAlias');
  const aliasModal = $('#aliasModal');
  const aliasModalBackdrop = $('#aliasModalBackdrop');
  const btnCloseAlias = $('#btnCloseAlias');

  const rarityCodeEl = $('#rarityCode');
  const rarityFrameEl = $('#rarityFrame');
  const rarityLegendEl = $('#rarityLegend');

  const resultTableBody = $('#resultTableBody');
  const phaseAccordions = $('#phaseAccordions');

  const btnRedo = $('#btnRedo');
  const btnReset = $('#btnReset');
  const errorText = $('#errorText');
  const errorDetails = $('#errorDetails');

  // ===== State =====
  const state = {
    view: 'start',          // start | questions | result | error
    pageIndex: 0,           // 0..1 (10 questions per page)
    answers: {},            // { Q1: 1..5, ... Q20: 1..5 }
    lastResult: null,       // result object for display
  };

  // ===== Utilities =====
  function setView(name) {
    state.view = name;
    [viewStart, viewQuestions, viewResult, viewError].forEach(v => v.classList.remove('view--active'));
    if (name === 'start') viewStart.classList.add('view--active');
    else if (name === 'questions') viewQuestions.classList.add('view--active');
    else if (name === 'result') viewResult.classList.add('view--active');
    else viewError.classList.add('view--active');

    // Topbar savecode should not appear in alias fullscreen (but it is okay to show always).
    renderSaveCode();
    persist();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function showToast(msg) {
    toast.textContent = msg || '';
  }

  function persist() {
    try {
      const payload = {
        view: state.view,
        pageIndex: state.pageIndex,
        answers: state.answers,
        lastResult: state.lastResult,
        // scroll position can be added later if needed
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {}
  }

  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (!payload || typeof payload !== 'object') return;
      if (payload.answers && typeof payload.answers === 'object') state.answers = payload.answers;
      if (typeof payload.pageIndex === 'number') state.pageIndex = payload.pageIndex;
      if (payload.lastResult) state.lastResult = payload.lastResult;
      if (payload.view) state.view = payload.view;
    } catch (_) {}
  }

  function hardReset() {
    state.view = 'start';
    state.pageIndex = 0;
    state.answers = {};
    state.lastResult = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    setView('start');
    renderQuestions();
  }

  function qid(n) { return `Q${n}`; }

  function normalizeAnswersToArray() {
    // 本紙: UI入力は {qid,v} の配列; 本紙側で昇順に並び替え、answersNormalized(長さ20の数値配列)を作る
    const arr = [];
    for (let i = 1; i <= 20; i++) {
      const v = state.answers[qid(i)];
      if (typeof v !== 'number') return null;
      arr.push(v);
    }
    return arr;
  }

  function isPageComplete(pageIndex) {
    const start = pageIndex * 10 + 1;
    const end = start + 9;
    for (let i = start; i <= end; i++) {
      if (typeof state.answers[qid(i)] !== 'number') return false;
    }
    return true;
  }

  function isAllComplete() {
    for (let i = 1; i <= 20; i++) {
      if (typeof state.answers[qid(i)] !== 'number') return false;
    }
    return true;
  }

  function safeText(s) {
    return (s ?? '').toString();
  }

  function createEl(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  // ===== Blackbox adapters (must be tolerant) =====
  function getQuestionsFromBlackbox() {
    // Accept a few common shapes:
    // 1) window.DATA_QUESTIONS = [{ qid:"Q1", text:"...", choices:[...]}...]
    // 2) window.questions = [...]
    // 3) window.getQuestions() => [...]
    const candidates = [
      window.DATA_QUESTIONS,
      window.data_questions,
      window.questions,
      typeof window.getQuestions === 'function' ? window.getQuestions() : null,
    ].filter(Boolean);

    const q = candidates.find(x => Array.isArray(x) && x.length >= 20);
    if (!q) return null;

    // Normalize to {qid,text,choices}
    return q.map((item, idx) => {
      const qidStr = item.qid || item.id || item.q || `Q${idx + 1}`;
      const text = item.text || item.question || item.title || '';
      const choices =
        item.choices || item.options || [
          'かなり当てはまる', 'あてはまる', 'どちらでもない', 'あてはまらない', 'かなりあてはまらない'
        ];
      return { qid: qidStr, text, choices };
    });
  }

  function callRarityLogic(answersNormalized) {
    // Expected output: {rarity} or "C" etc.
    // Try a few function names.
    const fns = [
      window.calcRarity,
      window.calcRarityOverall,
      window.computeRarity,
      window.rarityLogic,
      window.rarity_logic,
    ].filter(fn => typeof fn === 'function');

    if (fns.length === 0) throw new Error('rarity_logic.js の関数が見つかりません。calcRarity / calcRarityOverall / computeRarity などの公開が必要です。');

    const out = fns[0](answersNormalized);
    if (typeof out === 'string') return { rarity: out };
    if (out && typeof out === 'object') {
      const r = out.rarity || out.rarityOverall || out.rarity_code || out.code;
      return { rarity: r, raw: out };
    }
    throw new Error('レアリティ算出の戻り値が不正です。');
  }

  function callAliasLogic(answersNormalized, rarityOverall, scoreBandByPhase) {
    // alias_logic v6 expects answers + rarityOverall. Some impl may also accept score trend.
    const fns = [
      window.calcAlias,
      window.calcAliasOverall,
      window.computeAlias,
      window.aliasLogic,
      window.alias_logic,
    ].filter(fn => typeof fn === 'function');

    if (fns.length === 0) throw new Error('alias_logic.js の関数が見つかりません。calcAlias / calcAliasOverall / computeAlias などの公開が必要です。');

    const out = fns[0](answersNormalized, rarityOverall, scoreBandByPhase);
    if (!out || typeof out !== 'object') throw new Error('異名算出の戻り値が不正です。');

    return {
      alias: out.aliasOverall || out.alias || out.nickname || '',
      aliasId: out.aliasId || out.alias_id || null,
      category: out.aliasCategoryOverall || out.aliasCategory || null,
      asset: out.aliasAssetOverall || out.aliasAsset || null,
      raw: out,
    };
  }

  function callScoreLogic(answersNormalized) {
    // contrib_table.js could expose calcScores/evaluateResult/etc.
    // We only need scoreBandByPhase and (optionally) debug tags for text generation.
    const fns = [
      window.calcScores,
      window.calcScoreBandByPhase,
      window.computeScores,
      window.evaluateAll,
      window.evaluateResult,
      window.contribEvaluate,
    ].filter(fn => typeof fn === 'function');

    if (fns.length === 0) {
      // If not available, we cannot legally compute from locked contrib table.
      throw new Error('contrib_table.js の評価関数が見つかりません。calcScores / evaluateResult などの公開が必要です。');
    }

    const out = fns[0](answersNormalized);
    if (!out) throw new Error('スコア算出の戻り値が不正です。');

    // Accept:
    // - { scoreBandByPhase:{matching:..} , phaseTagsByPhase:..., tableRows:... }
    // - {matching:..,firstMeet:..,...} as direct
    const sb =
      out.scoreBandByPhase ||
      out.phaseScoreBand ||
      (out.matching && out.firstMeet ? out : null);

    if (!sb || typeof sb !== 'object') throw new Error('スコア段階（フェーズ別）が取得できません。');

    const scoreBandByPhase = {
      matching: sb.matching,
      firstMeet: sb.firstMeet,
      date: sb.date,
      relationship: sb.relationship,
      marriage: sb.marriage,
    };

    // normalize to ints 1..5
    for (const k of Object.keys(scoreBandByPhase)) {
      const v = scoreBandByPhase[k];
      if (typeof v !== 'number') throw new Error(`scoreBandByPhase.${k} が数値ではありません。`);
    }

    return {
      scoreBandByPhase,
      tableRows: out.tableRows || null,
      debug: out.debug || null,
      tags: out.tags || out.phaseTags || out.tagsByPhase || null,
      raw: out,
    };
  }

  // ===== Asset helpers =====
  function setImageInto(el, src, alt) {
    el.innerHTML = '';
    const img = document.createElement('img');
    img.alt = alt || '';
    img.src = src;
    el.appendChild(img);
  }

  async function resolveAssetUrl(preferBasePathList) {
    // Try a list of URLs in order. Return first that loads, else null.
    const tryOne = (url) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = () => resolve(null);
      img.src = url;
    });

    for (const url of preferBasePathList) {
      const ok = await tryOne(url);
      if (ok) return ok;
    }
    return null;
  }

  async function renderRarityFrame(rarityCode) {
    // H-3: assets/rarity/ 配下のレアリティ画像を参照。拡張子はpng/gif、欠損は_default。
    const base = `./assets/rarity/${rarityCode}`;
    const fallbackBase = './assets/rarity/_default';
    const urls = [`${base}.gif`, `${base}.png`, `${fallbackBase}.png`, `${fallbackBase}.gif`];
    const url = await resolveAssetUrl(urls);
    if (url) setImageInto(rarityFrameEl, url, `rarity ${rarityCode}`);
    else rarityFrameEl.textContent = '(rarity asset not found)';
  }

  async function renderAliasAsset(rarityCode, aliasAssetOverall, aliasId) {
    // alias_logic may already return a file name. If not, build from rarity + aliasId.
    const candidates = [];
    if (aliasAssetOverall) {
      candidates.push(`./assets/alias/${aliasAssetOverall}`);
      // also allow it without directory if user uses flat structure
      candidates.push(`./${aliasAssetOverall}`);
    }
    if (aliasId) {
      candidates.push(`./assets/alias/${rarityCode}_${aliasId}.gif`);
      candidates.push(`./assets/alias/${rarityCode}_${aliasId}.png`);
    }
    // last resort: _default
    candidates.push('./assets/alias/_default.png');

    const url = await resolveAssetUrl(candidates);
    if (url) setImageInto(aliasAssetEl, url, 'alias');
    else aliasAssetEl.textContent = '(alias asset not found)';
  }

  // ===== Rendering =====
  function renderRarityLegend() {
    const order = ['C','U','R','E','M','Lg','Sg'];
    rarityLegendEl.innerHTML = '';
    for (const code of order) {
      const item = createEl('div', 'rarityLegend__item');
      item.appendChild(createEl('div', 'rarityLegend__code', code));
      item.appendChild(createEl('div', 'rarityLegend__rate', `${RARITY_RATES[code]}%`));
      rarityLegendEl.appendChild(item);
    }
  }

  function renderSaveCode() {
    const sc = state.lastResult?.saveCode || '';
    saveCodeEl.textContent = sc ? sc : '';
    btnCopySaveCode.style.display = sc ? 'inline-flex' : 'none';
  }

  function renderQuestions() {
    const all = getQuestionsFromBlackbox();
    if (!all) {
      return showError(
        '質問データが見つかりません。',
        'data_questions.js から、20問以上の質問配列（例: window.DATA_QUESTIONS）を公開してください。'
      );
    }

    const pageSize = 10;
    const pageCount = Math.ceil(all.length / pageSize);
    const pageIndex = Math.max(0, Math.min(state.pageIndex, pageCount - 1));
    state.pageIndex = pageIndex;

    pageIndicator.textContent = `${pageIndex + 1} / ${pageCount}`;

    const start = pageIndex * pageSize;
    const items = all.slice(start, start + pageSize);

    questionList.innerHTML = '';
    for (const q of items) {
      const qNum = parseInt((q.qid || '').replace(/^Q/i, ''), 10);
      const wrap = createEl('div', 'qitem');
      const title = createEl('div', 'qitem__title', `${q.qid}  ${q.text}`);
      wrap.appendChild(title);

      const opts = createEl('div', 'qopts');
      const current = state.answers[q.qid];

      for (let v = 1; v <= 5; v++) {
        const label = createEl('label', 'qopt' + (current === v ? ' qopt--selected' : ''));
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `opt_${q.qid}`;
        input.value = String(v);
        input.checked = current === v;

        input.addEventListener('change', () => {
          state.answers[q.qid] = v;
          persist();
          renderQuestions();
        });

        const n = createEl('span', 'qopt__n', String(v));
        const t = createEl('span', 'qopt__t', q.choices?.[v - 1] || '');
        label.appendChild(input);
        label.appendChild(n);
        label.appendChild(t);
        opts.appendChild(label);
      }

      wrap.appendChild(opts);
      questionList.appendChild(wrap);
    }

    // Buttons visibility
    btnPrevPage.style.display = pageIndex === 0 ? 'none' : 'inline-flex';
    btnNextPage.style.display = pageIndex === pageCount - 1 ? 'none' : 'inline-flex';
    btnToResult.style.display = pageIndex === pageCount - 1 ? 'inline-flex' : 'none';

    showToast('');
  }

  function renderResult(result) {
    // Header: alias + rarity
    aliasTextEl.textContent = safeText(result.nickname);
    aliasFullTextEl.textContent = safeText(result.nickname);
    rarityCodeEl.textContent = safeText(result.rarity);

    // Table: phase rows
    resultTableBody.innerHTML = '';
    const scoreName = (n) => {
      const map = { 1:'激弱', 2:'弱', 3:'普通', 4:'強', 5:'変にモテる' };
      return map[n] || String(n);
    };

    // Prefer tableRows from logic, but fall back to minimal.
    const rows = Array.isArray(result.tableRows) ? result.tableRows : PHASES.map(p => ({
      phaseKey: p.key,
      phaseLabel: p.label,
      scoreBand: result.scoreBandByPhase?.[p.key],
      note: result.phaseTexts?.find(x => x.phaseKey === p.key)?.scene?.[0] || '',
    }));

    for (const p of PHASES) {
      const row = rows.find(r => r.phaseKey === p.key || r.phase === p.key || r.key === p.key) || {};
      const tr = document.createElement('tr');

      const td1 = document.createElement('td');
      td1.textContent = p.label;

      const td2 = document.createElement('td');
      const sb = row.scoreBand ?? result.scoreBandByPhase?.[p.key];
      td2.innerHTML = `<div>${safeText(scoreName(sb))}</div><div class="mini">(${safeText(sb)})</div>`;

      const td3 = document.createElement('td');
      td3.textContent = safeText(row.note || '—');

      tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
      resultTableBody.appendChild(tr);
    }

    // Phase accordions (phaseTexts is expected from app; but if missing, generate placeholder)
    phaseAccordions.innerHTML = '';
    const texts = Array.isArray(result.phaseTexts) ? result.phaseTexts : PHASES.map(p => ({
      phaseKey: p.key,
      phaseLabel: p.label,
      scene: ['（本文生成が未接続）'],
      why: '文章ロジックは後で別紙化予定のため、ここはプレースホルダです。',
      aware: '—',
      recommend: ['—'],
      after: '—',
      matchPartner: p.key === 'matching' ? '—' : null,
    }));

    for (const p of PHASES) {
      const t = texts.find(x => x.phaseKey === p.key) || {};
      const acc = createEl('div', 'accordion');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'accordion__btn';
      btn.innerHTML = `<div>${p.label}</div><span>開く / 閉じる</span>`;
      btn.addEventListener('click', () => {
        acc.classList.toggle('accordion--open');
        persist();
      });

      const panel = createEl('div', 'accordion__panel');
      const block = createEl('div', 'phaseBlock');

      const addSection = (h, body, isList=false) => {
        const sec = createEl('div', 'phaseBlock__section');
        sec.appendChild(createEl('div', 'phaseBlock__h', h));
        if (isList) {
          const ul = createEl('ul', 'phaseBlock__list');
          (Array.isArray(body) ? body : [body]).filter(Boolean).forEach(line => {
            const li = document.createElement('li');
            li.textContent = safeText(line);
            ul.appendChild(li);
          });
          sec.appendChild(ul);
        } else {
          sec.appendChild(createEl('p', 'phaseBlock__p', safeText(body)));
        }
        block.appendChild(sec);
      };

      addSection('1. よくあるシーン（具体）', t.scene || ['—'], true);
      addSection('2. なぜ起きるのか（理由・モデル）', t.why || '—');
      addSection('3. 自覚ポイント', t.aware || '—');
      addSection('4. おすすめ', t.recommend || ['—'], true);
      addSection('5. おすすめをやるとどうなりやすいか', t.after || '—');
      if (p.key === 'matching') addSection('6. マッチングしやすい相手像', t.matchPartner || '—');

      panel.appendChild(block);
      acc.appendChild(btn);
      acc.appendChild(panel);
      phaseAccordions.appendChild(acc);
    }

    // Assets
    renderRarityFrame(result.rarity);
    renderAliasAsset(result.rarity, result.aliasAssetOverall, result.aliasId);
  }

  function showError(title, details) {
    state.view = 'error';
    errorText.textContent = title || 'エラー';
    errorDetails.textContent = details || '';
    setView('error');
  }

  // ===== Result building (App responsibility: normalize -> call blackboxes -> prepare UI result) =====
  function buildResult(runMode) {
    // runMode: "manual"|"random" (meta)
    const answersNormalized = normalizeAnswersToArray();
    if (!answersNormalized) throw new Error('未回答が残っています。');

    const score = callScoreLogic(answersNormalized);
    const rarity = callRarityLogic(answersNormalized);
    const alias = callAliasLogic(answersNormalized, rarity.rarity, score.scoreBandByPhase);

    // saveCode: not fully specified; create a deterministic-ish code for display only.
    // It depends on answers only (in spec: results depend on answers; saveCode is a display artifact).
    const saveCode = makeSaveCode(answersNormalized);

    // Ensure required structure for UI
    const result = {
      saveCode,
      nickname: alias.alias,
      rarity: rarity.rarity,
      scoreBandByPhase: score.scoreBandByPhase,
      tableRows: score.tableRows || null,
      phaseTexts: score.raw?.phaseTexts || null, // If contrib provides it.
      debug: score.debug || null,

      // For alias fullscreen asset resolution
      aliasId: alias.aliasId || deriveAliasId(alias.alias),
      aliasAssetOverall: alias.asset || null,
      aliasCategoryOverall: alias.category || null,
    };

    return result;
  }

  function deriveAliasId(aliasText) {
    // Spec: for Sg, use Japanese main title only (before 《 or newline). Otherwise same string.
    const s = safeText(aliasText).trim();
    if (!s) return null;
    const firstLine = s.split(/\n/)[0];
    const main = firstLine.split('《')[0];
    return main.trim();
  }

  function makeSaveCode(answersNormalized) {
    // Short, deterministic. (No crypto needed.)
    // base32-like from a simple FNV-1a hash.
    let h = 0x811c9dc5;
    for (const v of answersNormalized) {
      h ^= (v & 0xff);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/1/I/O
    let out = '';
    let x = h;
    for (let i=0; i<8; i++){
      out += alphabet[x % alphabet.length];
      x = Math.floor(x / alphabet.length);
    }
    return out;
  }

  // ===== Events =====
  btnStart.addEventListener('click', () => {
    state.pageIndex = 0;
    setView('questions');
    renderQuestions();
  });

  btnRandom.addEventListener('click', () => {
    // Create random answers (1..5). Must go through same evaluation path.
    for (let i = 1; i <= 20; i++) {
      state.answers[qid(i)] = 1 + Math.floor(Math.random() * 5);
    }
    state.pageIndex = 1; // jump to last page so user can see "結果へ" immediately
    setView('questions');
    renderQuestions();

    // Auto-run result
    try {
      const result = buildResult('random');
      state.lastResult = result;
      persist();
      setView('result');
      renderRarityLegend();
      renderResult(result);
    } catch (e) {
      showError('ランダム診断の実行に失敗しました。', String(e?.message || e));
    }
  });

  btnPrevPage.addEventListener('click', () => {
    state.pageIndex = Math.max(0, state.pageIndex - 1);
    renderQuestions();
    persist();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });

  btnNextPage.addEventListener('click', () => {
    if (!isPageComplete(state.pageIndex)) {
      return showToast('未回答の質問があります。すべて回答してから次へ進めます。');
    }
    state.pageIndex = Math.min(1, state.pageIndex + 1);
    renderQuestions();
    persist();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });

  btnToResult.addEventListener('click', () => {
    if (!isAllComplete()) {
      return showToast('未回答の質問があります。すべて回答してから結果へ進めます。');
    }
    try {
      const result = buildResult('manual');
      state.lastResult = result;
      persist();
      setView('result');
      renderRarityLegend();
      renderResult(result);
    } catch (e) {
      showError('結果の生成に失敗しました。', String(e?.message || e));
    }
  });

  btnToStart.addEventListener('click', () => {
    const ok = window.confirm('診断開始前にもどりますか');
    if (!ok) return;
    // Spec: 「最初へ」操作時は必ず回答をクリア
    state.answers = {};
    state.pageIndex = 0;
    state.lastResult = null;
    persist();
    setView('start');
    renderQuestions();
  });

  btnRedo.addEventListener('click', () => {
    // Re-run: keep answers? Spec says "もう一度診断する" near copy button; not defined.
    // We'll interpret as go back to start but keep no answers (fresh run).
    state.answers = {};
    state.pageIndex = 0;
    state.lastResult = null;
    persist();
    setView('start');
    renderQuestions();
  });

  btnCopySaveCode.addEventListener('click', async () => {
    const sc = state.lastResult?.saveCode || '';
    if (!sc) return;
    try {
      await navigator.clipboard.writeText(sc);
      btnCopySaveCode.textContent = 'コピー済';
      setTimeout(() => (btnCopySaveCode.textContent = 'コピー'), 900);
    } catch (_) {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = sc;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      btnCopySaveCode.textContent = 'コピー済';
      setTimeout(() => (btnCopySaveCode.textContent = 'コピー'), 900);
    }
  });

  function openAliasModal() {
    aliasModal.setAttribute('aria-hidden', 'false');
  }
  function closeAliasModal() {
    aliasModal.setAttribute('aria-hidden', 'true');
  }
  btnShowAlias.addEventListener('click', openAliasModal);
  btnCloseAlias.addEventListener('click', closeAliasModal);
  aliasModalBackdrop.addEventListener('click', closeAliasModal);

  btnReset.addEventListener('click', () => hardReset());

  // ===== Boot =====
  function boot() {
    restore();

    // Minimal compatibility check early: data_questions must exist for questions view
    renderRarityLegend();

    if (state.view === 'result' && state.lastResult) {
      setView('result');
      renderResult(state.lastResult);
    } else if (state.view === 'questions') {
      setView('questions');
      renderQuestions();
    } else if (state.view === 'error') {
      setView('error');
    } else {
      setView('start');
      renderQuestions(); // pre-render for cached answers (no effect on start)
    }

    // Hide savecode in start/questions (it will show only when result exists)
    renderSaveCode();
  }

  // Ensure DOMContentLoaded after other scripts
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

})();
