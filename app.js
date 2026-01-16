/* app.js は本紙（仕様書_本紙）に従属する。 */
/* import は app.js 最上部に1回だけ記述し、以降の BLOCK START より前にまとめる（契約）。 */

/***** BLOCK START 0:IMPORTS *****/
/**   - 本紙の「app.js のブロック分割（契約）」に従い、import はここに集約する
/**   - dynamic import（import()）は禁止（契約）
/**=========================================================== */

/* ---- 別紙JS（ブラックボックス）: export 名は本紙の契約どおり ---- */
import { QUESTIONS } from "./data_questions.js";
import { computeAllPhases } from "./contrib_table.js";
import { calcRarity } from "./rarity_logic.js";
import { calcAlias } from "./alias_logic.js";
import { calcResultKeys } from "./result_key_logic.js";
import { getText } from "./text.js";

/* ---- UI modules: すべて `export function render(root, ctx)` のみを持つ（契約） ---- */
import { render as renderTitle } from "./ui_title.js";
import { render as renderStart } from "./ui_start.js";
import { render as renderQuestions1_10 } from "./ui_questions_1_10.js";
import { render as renderQuestions11_20 } from "./ui_questions_11_20.js";
import { render as renderAlias } from "./ui_alias.js";
import { render as renderResult } from "./ui_result.js";

/***** BLOCK END 0 *****/


/***** BLOCK START 1:CONSTANTS / TYPES *****/
/**   - 共有定数・共有型は本ブロックにのみ定義する（契約）
/**   - 名称は固定（改名禁止）、他ブロックは参照のみ（再宣言禁止）
/**   - sha256Hex(str) は Promise<string> を返す（await 前提）／16進小文字（契約）
/**======================================== */

/** フェーズ内部キー（固定・順序固定） */
const PHASE_KEYS = ["matching", "firstMeet", "date", "relationship", "marriage"];

/** 画面キー（固定・順序固定） */
const SCREENS = ["title", "start", "q1_10", "q11_20", "alias", "result"];

/** 状態保存キー（固定） */
const STORAGE_KEY = "love_diag_state_v1";

/**
 * SHA-256（16進小文字）を返すユーティリティ（契約）
 * - Promise<string> を返す（await sha256Hex(...) 前提）
 * @param {string} str
 * @returns {Promise<string>}
 */
async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/***** BLOCK END 1 *****/


/***** BLOCK START 2:STATE *****/
/**   - ブロック2（STATE）は 状態の定義と初期値のみを持つ（契約）
/**   - BLOCK 2 で定義してよい関数は persistState() 1つのみ（契約）
/**   - persistState() は sessionStorage の setItem のみ（契約）
/**   - 保存キー指定は必ず STORAGE_KEY を参照（契約）
/**   - 保存対象は screen / answers / result に固定（契約）
/**======================================== */

/** @type {{ screen: string, answers: Array<{qid:string,v:number}>, answersNormalized: number[]|null, result: any|null, runMode: ("manual"|"random")|null }} */
const state = {
  screen: "title",
  answers: [],
  answersNormalized: null,
  result: null,
  runMode: null, // 任意
};

/**
 * 共有名（固定）：persistState()
 * - sessionStorage.setItem のみ（契約）
 * - 保存キーは STORAGE_KEY を参照（契約）
 * - 保存対象は screen / answers / result のみ（契約）
 */
function persistState() {
  try {
    const payload = {
      screen: state.screen,
      answers: state.answers,
      result: state.result,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {
    // 失敗時の補完・代替は禁止（何もしない）
  }
}

/***** BLOCK END 2 *****/


/***** BLOCK START 3A:INTERNAL_UTILS *****/

/**
 * qid 検証（契約：Q1..Q20）
 * @param {any} qid
 * @returns {boolean}
 */
function _3a_isQid(qid) {
  return typeof qid === "string" && /^Q([1-9]|1[0-9]|20)$/.test(qid);
}

/**
 * 回答値 v 検証（契約：1..5 の整数）
 * @param {any} v
 * @returns {boolean}
 */
function _3a_isAnswerValue(v) {
  return Number.isInteger(v) && v >= 1 && v <= 5;
}

/**
 * 【未回答の定義（契約）】
 * 未回答とは、以下のいずれか：
 * - answers が Array(20) でない
 * - Q1..Q20 の qid が揃っていない（欠損 or 重複）
 * - v が 1..5 の整数でない（null/undefined/小数/範囲外）
 * @param {any} answers
 * @returns {boolean}
 */
function _3a_hasUnanswered(answers) {
  if (!Array.isArray(answers)) return true;
  if (answers.length !== 20) return true;

  const seen = new Set();

  for (const a of answers) {
    if (!a || typeof a !== "object") return true;

    const qid = a.qid;
    const v = a.v;

    if (!_3a_isQid(qid)) return true;
    if (!_3a_isAnswerValue(v)) return true;

    if (seen.has(qid)) return true;
    seen.add(qid);
  }

  for (let n = 1; n <= 20; n += 1) {
    if (!seen.has(`Q${n}`)) return true;
  }

  return false;
}

/**
 * getQuestionsByQids の返却順（契約）
 * - 入力 qids の順序を維持
 * - 存在しない qid は除外（補完しない）
 * - qid/text が欠損している質問は UI 表示対象外（除外）
 * @param {any} qids
 * @returns {QuestionDef[]}
 */
function _3a_getQuestionsByQids(qids) {
  if (!Array.isArray(qids)) return [];
  if (!Array.isArray(QUESTIONS)) return [];

  const byId = new Map();
  for (const q of QUESTIONS) {
    if (!q || typeof q !== "object") continue;
    const qid = q.qid;
    const text = q.text;
    if (typeof qid !== "string") continue;
    if (typeof text !== "string") continue;
    byId.set(qid, { qid, text });
  }

  /** @type {QuestionDef[]} */
  const out = [];
  for (const qid of qids) {
    if (typeof qid !== "string") continue;
    const item = byId.get(qid);
    if (item) out.push(item);
  }
  return out;
}

/**
 * answersNormalized 生成（契約）
 * - answers を qid で Q1..Q20 の順に並び替え
 * - 20件すべて揃わない場合は未回答
 * - 生成できない場合 null
 * @param {any} answers
 * @returns {number[]|null}
 */
function _3a_buildAnswersNormalized(answers) {
  if (_3a_hasUnanswered(answers)) return null;

  const map = new Map();
  for (const a of answers) {
    map.set(a.qid, a.v);
  }

  /** @type {number[]} */
  const normalized = [];
  for (let n = 1; n <= 20; n += 1) {
    const qid = `Q${n}`;
    const v = map.get(qid);
    if (!_3a_isAnswerValue(v)) return null;
    normalized.push(v);
  }

  return normalized;
}

/***** BLOCK END 3A *****/


/***** BLOCK START 3B:INTERNAL_RESULT_BUILD *****/
/**
 * 3B INTERNAL_RESULT_BUILD（契約）
 * - result はこのブロックのみが生成してよい
 * - 別紙JSを呼び出してよいのはこのブロックのみ
 * - _default フォールバックは text.js 呼び出し直前のみで適用する
 * - sha256Hex(str) は await して使用する（Promise のまま扱う実装は禁止）
 */

/** @returns {boolean} */
function _3b_isIntInRange(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max;
}

/** @returns {boolean} */
function _3b_isValidQid(qid) {
  if (typeof qid !== "string") return false;
  const m = /^Q(\d{1,2})$/.exec(qid);
  if (!m) return false;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= 20;
}

/** @returns {boolean} */
function _3b_validateAnswersShape(answers) {
  if (!Array.isArray(answers) || answers.length !== 20) return false;

  const seen = new Set();
  for (const a of answers) {
    if (!a || typeof a !== "object") return false;
    if (!_3b_isValidQid(a.qid)) return false;
    if (!_3b_isIntInRange(a.v, 1, 5)) return false;

    if (seen.has(a.qid)) return false;
    seen.add(a.qid);
  }

  for (let i = 1; i <= 20; i += 1) {
    if (!seen.has(`Q${i}`)) return false;
  }

  return true;
}

/** @returns {boolean} */
function _3b_validateAnswersNormalized(answersNormalized) {
  if (!Array.isArray(answersNormalized) || answersNormalized.length !== 20) return false;
  for (const v of answersNormalized) {
    if (!_3b_isIntInRange(v, 1, 5)) return false;
  }
  return true;
}

/** @returns {boolean} */
function _3b_validateScoreBandByPhase(scoreBandByPhase) {
  if (!scoreBandByPhase || typeof scoreBandByPhase !== "object") return false;
  for (const phaseKey of PHASE_KEYS) {
    if (!_3b_isIntInRange(scoreBandByPhase[phaseKey], 1, 5)) return false;
  }
  return true;
}

/** @returns {boolean} */
function _3b_validateResultKeys(resultKeys) {
  if (!resultKeys || typeof resultKeys !== "object") return false;
  for (const phaseKey of PHASE_KEYS) {
    if (typeof resultKeys[phaseKey] !== "string") return false;
  }
  return true;
}

/** @returns {boolean} */
function _3b_isValidRarity(rarity) {
  return (
    rarity === "C" ||
    rarity === "U" ||
    rarity === "R" ||
    rarity === "E" ||
    rarity === "M" ||
    rarity === "Lg" ||
    rarity === "Sg"
  );
}

/**
 * saveCode 生成（契約）
 * - answersNormalized を JSON 文字列化
 * - SHA-256 を計算（sha256Hex を await）
 * - 先頭10文字を英数字・大文字として採用
 * @param {number[]} answersNormalized
 * @returns {Promise<string|null>}
 */
async function _3b_buildSaveCode(answersNormalized) {
  const json = JSON.stringify(answersNormalized);
  const hex = await sha256Hex(json); // BLOCK1 定義（再宣言禁止）
  if (typeof hex !== "string" || hex.length < 10) return null;
  return hex.toUpperCase().slice(0, 10);
}

/**
 * Result を完成形として一括生成（契約）
 * - 必須要素が揃わない場合は null（部分生成禁止）
 * - sha256Hex を await するため async
 * @param {{ answers: any, answersNormalized: any }} input
 * @returns {Promise<any|null>}
 */
async function _3b_buildResult(input) {
  const answers = input ? input.answers : null;
  const answersNormalized = input ? input.answersNormalized : null;

  // result を生成しない条件（契約）
  if (!_3b_validateAnswersShape(answers)) return null;
  if (!_3b_validateAnswersNormalized(answersNormalized)) return null;

  const saveCode = await _3b_buildSaveCode(answersNormalized);
  if (typeof saveCode !== "string" || saveCode.length !== 10) return null;

  // 別紙I/O（契約形固定）
  const contrib = computeAllPhases({ answers });
  if (!contrib || typeof contrib !== "object") return null;
  if (!_3b_validateScoreBandByPhase(contrib.scoreBandByPhase)) return null;

  const rarity = calcRarity(answers);
  if (!_3b_isValidRarity(rarity)) return null;

  const nickname = calcAlias(answers, rarity);
  if (typeof nickname !== "string") return null;

  const resultKeys = calcResultKeys({ answers, contrib });
  if (!_3b_validateResultKeys(resultKeys)) return null;

  // tableRows（契約：phaseLabel は phaseKey と同一文字列）
  // scoreLabel / note は仕様未定義のため空文字（補完禁止）
  const tableRows = PHASE_KEYS.map((phaseKey) => ({
    phaseKey,
    phaseLabel: phaseKey,
    scoreBand: contrib.scoreBandByPhase[phaseKey],
    scoreLabel: "",
    note: "",
  }));

  // phaseTexts（契約：順序固定 PHASE_KEYS）
  const phaseTexts = [];
  for (const phaseKey of PHASE_KEYS) {
    const rawPatternKey = resultKeys[phaseKey]; // string（契約）
    const patternKey = typeof rawPatternKey === "string" ? rawPatternKey : "";

    // _default は text.js 呼び出し直前のみ適用（契約）
    const patternKeyForText =
      typeof rawPatternKey === "string" && rawPatternKey.length > 0
        ? rawPatternKey
        : "_default";

    const sections = getText(phaseKey, patternKeyForText);
    if (sections === null || sections === undefined) return null;

    phaseTexts.push({
      phaseKey,
      phaseLabel: phaseKey,
      patternKey,
      sections,
    });
  }

  // 必須フェーズ欠損の最終ガード（契約）
  if (tableRows.length !== PHASE_KEYS.length) return null;
  if (phaseTexts.length !== PHASE_KEYS.length) return null;

  return {
    saveCode,
    nickname,
    rarity,
    scoreBandByPhase: contrib.scoreBandByPhase,
    tableRows,
    phaseTexts,
  };
}

/***** BLOCK END 3B *****/



/***** BLOCK START 4:ACTIONS *****/
/**   - UI が呼んでよい公開操作の唯一の窓口（契約）
/**   - export const actions は 1 回だけ定義（再宣言禁止）
/**   - 公開 API は本紙列挙のものに固定（追加・改名禁止）
/**   - DOM を直接触らない（契約）
/**======================================== */

/**
 * actions.go(screen)
 * - screen は SCREENS で検証してから遷移
 * - 画面遷移の実体は FLOW（_flow_go）
 * @param {any} screen
 */

function _actions_go(screen) {
  if (typeof screen !== "string") return;
  if (!Array.isArray(SCREENS) || !SCREENS.includes(screen)) return;
  _flow_go(screen);
}

/**
 * actions.getQuestionsByQids(qids)
 * - 実装は 3A（INTERNAL_UTILS）の質問取得処理に必ず委譲
 * @param {any} qids
 * @returns {any[]}
 */
function _actions_getQuestionsByQids(qids) {
  return _3a_getQuestionsByQids(qids);
}

/**
 * actions.getAnswerValue(qid): number | null
 * - answers（{qid, v}配列）から現在値を返す
 * - 未設定は null（補完しない）
 * @param {any} qid
 * @returns {number|null}
 */
function _actions_getAnswerValue(qid) {
  if (typeof qid !== "string") return null;
  if (!state || !Array.isArray(state.answers)) return null;

  for (const a of state.answers) {
    if (!a || typeof a !== "object") continue;
    if (a.qid !== qid) continue;
    const v = a.v;
    return typeof v === "number" ? v : null;
  }
  return null;
}

/**
 * actions.setAnswer(qid, v)
 * - state.answers の更新と persistState() 呼び出しのみ（他の計算・結果生成は禁止）
 * @param {any} qid
 * @param {any} v
 */
function _actions_setAnswer(qid, v) {
  if (typeof qid !== "string") return;

  // qid は "Q1"〜"Q20" のみ許可
  const m = /^Q(\d{1,2})$/.exec(qid);
  if (!m) return;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 1 || n > 20) return;

  // v は 1..5 の整数のみ許可
  if (!Number.isInteger(v) || v < 1 || v > 5) return;

  if (!state || typeof state !== "object") return;
  if (!Array.isArray(state.answers)) state.answers = [];

  // 同一 qid は 1つにする（重複を残さない）
  const next = [];
  for (const a of state.answers) {
    if (!a || typeof a !== "object") continue;
    if (a.qid === qid) continue;
    next.push(a);
  }
  next.push({ qid, v });

  state.answers = next;

  // 保存は persistState() を呼ぶだけ
  persistState();
}

export const actions = {
  go: _actions_go,
  getQuestionsByQids: _actions_getQuestionsByQids,
  getAnswerValue: _actions_getAnswerValue,
  setAnswer: _actions_setAnswer,
};

/***** BLOCK END 4 *****/


/***** BLOCK 5: FLOW（画面遷移制御） START *****/

let _flow_root = null;

/**
 * BOOTSTRAP から root を受け取り保持する
 * DOM参照・生成は禁止（root保持のみ）
 */
export function _flow_init(root) {
  _flow_root = root;
}

/**
 * 画面描画の唯一のディスパッチ
 * 必ず root を引数で受け取る
 */
export function _render_dispatch(root) {
  if (!root) return;

  const ctx = { state, actions };

  switch (state.screen) {
    case "title":
      renderTitle(root, ctx);
      break;
    case "start":
      renderStart(root, ctx);
      break;
    case "q1_10":
      renderQuestions1_10(root, ctx);
      break;
    case "q11_20":
      renderQuestions11_20(root, ctx);
      break;
    case "alias":
      renderAlias(root, ctx);
      break;
    case "result":
      renderResult(root, ctx);
      break;
    default:
      // 不正な screen は title に戻す
      state.screen = "title";
      persistState();
      renderTitle(root, ctx);
  }
}

/**
 * 画面遷移の実体
 * ACTIONS.go からのみ呼ばれる
 */
export async function _flow_go(screen) {
  if (!SCREENS.includes(screen)) return;

  // q1_10 → q11_20 判定（Q1〜Q10のみ）
  if (state.screen === "q1_10" && screen === "q11_20") {
    const qids = Array.from({ length: 10 }, (_, i) => `Q${i + 1}`);
    const answered = qids.every((qid) => {
      const v = actions.getAnswerValue(qid);
      return Number.isInteger(v) && v >= 1 && v <= 5;
    });
    if (!answered) return;
  }

  // q11_20 → alias 判定（Q11〜Q20のみ）
  if (state.screen === "q11_20" && screen === "alias") {
    const qids = Array.from({ length: 10 }, (_, i) => `Q${i + 11}`);
    const answered = qids.every((qid) => {
      const v = actions.getAnswerValue(qid);
      return Number.isInteger(v) && v >= 1 && v <= 5;
    });
    if (!answered) return;

    // result 生成（失敗しても遷移は止めない）
    try {
      const r = await buildResult();
      state.result = r ?? null;
    } catch {
      state.result = null;
    }
  }

  // result → start の場合は state を全クリア
  if (state.screen === "result" && screen === "start") {
    state.answers = [];
    state.answersNormalized = null;
    state.result = null;
  }

  state.screen = screen;
  persistState();

  if (_flow_root) {
    _render_dispatch(_flow_root);
  }
}

/***** BLOCK END 5 *****/


/***** BLOCK START 6:BOOTSTRAP *****/
/**   - BOOTSTRAP が行ってよい DOM 操作は document.getElementById("app") による root 取得のみ（契約）
/**   - BOOTSTRAP はイベント接続（addEventListener 等）を行わない（契約）
/**   - 必須依存が欠ける場合は即停止、代替処理は行わない（契約）
/**   - 状態保持は sessionStorage（localStorage 禁止）（契約）
/**   - 復元時の検証はブロック6内で完結（他ブロックの内部関数を参照しない）（契約）
/**   - 起動時に sessionStorage(STORAGE_KEY) を読み、JSON 解析失敗時は復元しない（契約）
/**   - 復元対象は screen / answers / result のみ（契約）
/**   - answers 復元は「未回答の定義」を満たすときのみ（契約）
/**   - result 復元は object のときのみ（契約）
/**   - 起動処理の最後に render を1回だけ呼ぶ（契約）：_render_dispatch(root)
/**======================================== */

(function bootstrap() {
  // DOM 操作は root 取得のみ（契約）
  const root = document.getElementById("app");
  if (!root) throw new Error("Missing #app root element.");

  // 必須依存チェック（欠けたら即停止：代替処理禁止）
  if (!Array.isArray(SCREENS)) throw new Error("Missing SCREENS.");
  if (typeof STORAGE_KEY !== "string") throw new Error("Missing STORAGE_KEY.");
  if (!state || typeof state !== "object") throw new Error("Missing state.");
  if (!actions || typeof actions !== "object") throw new Error("Missing actions.");
  if (typeof persistState !== "function") throw new Error("Missing persistState.");
  if (typeof _render_dispatch !== "function") throw new Error("Missing _render_dispatch.");

  // 復元検証（ブロック6内で完結：他ブロック参照禁止）
  function isScreenKey(v) {
    return typeof v === "string" && SCREENS.includes(v);
  }

  function isIntInRange(v, min, max) {
    return Number.isInteger(v) && v >= min && v <= max;
  }

  function isValidQid(qid) {
    if (typeof qid !== "string") return false;
    const m = /^Q(\d{1,2})$/.exec(qid);
    if (!m) return false;
    const n = Number(m[1]);
    return Number.isInteger(n) && n >= 1 && n <= 20;
  }

  // answers 復元条件（契約）
  // - "Q1"〜"Q20" がすべて揃っている
  // - 重複なし
  // - v は 1..5 の整数
  function isValidAnswers(answers) {
    if (!Array.isArray(answers) || answers.length !== 20) return false;

    const seen = new Set();
    for (const a of answers) {
      if (!a || typeof a !== "object") return false;
      if (!isValidQid(a.qid)) return false;
      if (!isIntInRange(a.v, 1, 5)) return false;
      if (seen.has(a.qid)) return false;
      seen.add(a.qid);
    }
    for (let i = 1; i <= 20; i += 1) {
      if (!seen.has(`Q${i}`)) return false;
    }
    return true;
  }

  // result 復元条件（契約）
  // - object のみ許可（null/配列/文字列などは破棄）
  function isValidResult(result) {
    if (!result || typeof result !== "object") return false;
    if (Array.isArray(result)) return false;
    return true;
  }

  // sessionStorage から復元（契約）
  let restored = null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (typeof raw === "string") restored = JSON.parse(raw);
  } catch (_) {
    restored = null; // 解析失敗時は何も復元しない（契約）
  }

  if (restored && typeof restored === "object") {
    // screen
    if (isScreenKey(restored.screen)) {
      state.screen = restored.screen;
    } else if (typeof restored.screen === "string") {
      // SCREENS に存在しない場合は title にする（補完はしない＝固定値へ）
      state.screen = "title";
    }

    // answers
    if (isValidAnswers(restored.answers)) {
      state.answers = restored.answers;
    }

    // result
    if (isValidResult(restored.result)) {
      state.result = restored.result;
    }
  }

  // 起動処理の最後に render を1回だけ呼ぶ（契約）
  // root は BOOTSTRAP が保持し、FLOW の _render_dispatch(root) に渡す
  _render_dispatch(root);
})();

/***** BLOCK END 6 *****/

