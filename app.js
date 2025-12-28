// app.js (ES Modules entrypoint)
// 本紙（添付の仕様書）に従い、UIは app.js のみを index.html から type="module" で読み込む。
// 別紙JS（data_questions.js / contrib_table.js / rarity_logic.js / alias_logic.js）はブラックボックスとして import する。

import * as QuestionsMod from './data_questions.js';
import * as ContribMod from './contrib_table.js';
import * as RarityMod from './rarity_logic.js';
import * as AliasMod from './alias_logic.js';

const STORAGE_KEY = 'love_diagnosis_state_v2';
const PHASE_KEYS = ['matching','firstMeet','date','relationship','marriage'];
const PHASE_LABELS = {
  matching: '出会い（マッチング）',
  firstMeet: '初対面',
  date: 'デート',
  relationship: '交際',
  marriage: '結婚',
};

// 本紙 D-3: レアリティ分布（％）は固定
const RARITY_RATES = {
  C: 35, U: 25, R: 20, E: 12, M: 6, Lg: 1.5, Sg: 0.5,
};

const ANSWER_LABELS = {
  1: 'かなり当てはまる',
  2: 'あてはまる',
  3: 'どちらでもない',
  4: 'あてはまらない',
  5: 'かなりあてはまらない',
};

function $(sel, root=document){ return root.querySelector(sel); }
function el(tag, attrs={}, children=[]){
  const n = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)){
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v === false || v === null || v === undefined) continue;
    else n.setAttribute(k, String(v));
  }
  for (const c of (Array.isArray(children) ? children : [children])){
    if (c === null || c === undefined) continue;
    if (typeof c === 'string') n.appendChild(document.createTextNode(c));
    else n.appendChild(c);
  }
  return n;
}

function safeJsonParse(s){
  try{ return JSON.parse(s); }catch{ return null; }
}

function stableHashToCode(ints){
  // saveCode: 本紙で詳細未定義のため、UI側で「一意・決定論」な短いコードを生成する（ラベルなし表示）。
  const str = ints.join(',');
  const buf = new TextEncoder().encode(str);
  // FNV-1a 32bit
  let h = 0x811c9dc5;
  for (const b of buf){
    h ^= b;
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(36).toUpperCase().padStart(7, '0');
}

function normalizeAnswers(answersArr){
  // 本紙: UI入力は {qid, v} の配列（長さ20）
  // app側でQ1..Q20昇順に並び替え、長さ20の数値配列を生成する。
  const map = new Map();
  for (const a of answersArr){
    if (!a) continue;
    map.set(String(a.qid), Number(a.v));
  }
  const out = [];
  for (let i=1;i<=20;i++){
    const qid = `Q${i}`;
    const v = map.get(qid);
    out.push(Number(v));
  }
  return out;
}

function hasUnanswered(normalized){
  return normalized.some(v => !(v >= 1 && v <= 5));
}

function resolveExport(mod, candidates){
  for (const name of candidates){
    if (name === 'default' && typeof mod.default === 'function') return mod.default;
    if (typeof mod[name] === 'function') return mod[name];
  }
  return null;
}

function resolveValue(mod, candidates){
  for (const name of candidates){
    if (name === 'default' && mod.default != null) return mod.default;
    if (mod[name] != null) return mod[name];
  }
  return null;
}

function getQuestions(){
  // data_questions.js の形式は本紙で未定義のため、できるだけ柔軟に読む。
  const q = resolveValue(QuestionsMod, ['questions','QUESTIONS','data','default']);
  if (Array.isArray(q) && q.length >= 20) return q;
  // 最低限：qidだけ生成（テキストが無いとUIは成立しないため、わかりやすいエラーを出す）
  return null;
}

function qidOf(q, idx){
  const cand = q?.qid ?? q?.id ?? q?.key ?? q?.qidStr;
  if (cand) return String(cand);
  return `Q${idx+1}`;
}
function qTextOf(q, idx){
  return q?.text ?? q?.q ?? q?.question ?? q?.label ?? `質問 ${idx+1}`;
}
function choicesOf(q){
  // 1..5 の5択は本紙FIX。文言は別紙で決まる可能性があるため、なければデフォルト凡例を使う。
  const c = q?.choices ?? q?.options ?? q?.answers ?? null;
  if (Array.isArray(c) && c.length === 5) return c;
  return [ANSWER_LABELS[1], ANSWER_LABELS[2], ANSWER_LABELS[3], ANSWER_LABELS[4], ANSWER_LABELS[5]];
}

function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  const st = raw ? safeJsonParse(raw) : null;
  if (!st) return {
    screen: 'start',
    pageIndex: 0,
    answers: Array.from({length:20}, (_,i)=>({ qid:`Q${i+1}`, v:null })),
    lastResult: null,
  };
  // 軽い整形（破損耐性）
  const answers = Array.isArray(st.answers) && st.answers.length === 20
    ? st.answers.map((a,i)=>({ qid: String(a.qid ?? `Q${i+1}`), v: (a.v==null?null:Number(a.v)) }))
    : Array.from({length:20}, (_,i)=>({ qid:`Q${i+1}`, v:null }));
  return {
    screen: st.screen || 'start',
    pageIndex: Number.isFinite(st.pageIndex) ? st.pageIndex : 0,
    answers,
    lastResult: st.lastResult ?? null,
  };
}

function saveState(state){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clearState(){
  localStorage.removeItem(STORAGE_KEY);
}

function setSaveCodeBadge(code){
  const badge = $('#saveCodeBadge');
  const btn = $('#copySaveCodeBtn');
  if (!code){
    badge.textContent = '';
    btn.style.display = 'none';
    return;
  }
  badge.textContent = code;
  btn.style.display = '';
  btn.onclick = async () => {
    try{
      await navigator.clipboard.writeText(code);
      btn.textContent = 'コピー済';
      setTimeout(()=>btn.textContent='コピー', 900);
    }catch{
      btn.textContent = '失敗';
      setTimeout(()=>btn.textContent='コピー', 900);
    }
  };
}

function scrollTopNice(){
  window.scrollTo({top:0, behavior:'smooth'});
}

async function evaluateResult(state){
  const answersNormalized = normalizeAnswers(state.answers);
  if (hasUnanswered(answersNormalized)){
    throw new Error('未回答が存在するため、集計できません。');
  }

  // できるだけ「別紙ロジックが result を返す」構成に寄せる。
  // ただしブラックボックスの export 形は未定義なので、候補を順番に試す。
  const contribEvaluate = resolveExport(ContribMod, ['evaluateAll','evaluate','calcResult','getResult','default']);
  const rarityFn = resolveExport(RarityMod, ['calcRarity','computeRarity','evaluateRarity','getRarity','default']);
  const aliasFn = resolveExport(AliasMod, ['calcAlias','computeAlias','evaluateAlias','getAlias','default']);

  let result = null;

  if (typeof contribEvaluate === 'function'){
    // 期待：result 互換（saveCode/nickname/rarity/scoreBandByPhase/tableRows/phaseTexts/debug など）
    result = await contribEvaluate(answersNormalized);
  }

  // もし contrib が「スコアだけ」等しか返さない場合に備えて補完（本紙で未定義の箇所は任意で補完）
  const partial = (result && typeof result === 'object') ? {...result} : {};

  // rarity
  let rarity = partial.rarity ?? partial.rarityOverall ?? null;
  if (!rarity && typeof rarityFn === 'function'){
    const r = await rarityFn(answersNormalized);
    if (typeof r === 'string') rarity = r;
    else rarity = r?.rarity ?? r?.rarityOverall ?? r?.rarityCode ?? null;
    partial.debug = mergeDebug(partial.debug, r?.debug);
  }

  // alias
  let nickname = partial.nickname ?? partial.aliasOverall ?? partial.alias ?? null;
  let aliasId = partial.aliasId ?? null;
  let aliasAsset = partial.aliasAssetOverall ?? partial.aliasAsset ?? null;

  if ((!nickname || !aliasAsset) && typeof aliasFn === 'function'){
    const a = await aliasFn(answersNormalized, rarity);
    if (typeof a === 'string') nickname = a;
    else {
      nickname = nickname ?? a?.nickname ?? a?.aliasOverall ?? a?.alias ?? null;
      aliasId = aliasId ?? a?.aliasId ?? a?.alias_id ?? null;
      aliasAsset = aliasAsset ?? a?.aliasAssetOverall ?? a?.aliasAsset ?? a?.asset ?? null;
      partial.debug = mergeDebug(partial.debug, a?.debug);
    }
  }

  // saveCode
  const saveCode = partial.saveCode ?? stableHashToCode(answersNormalized);

  // score bands
  const scoreBandByPhase = partial.scoreBandByPhase ?? partial.phaseScoreBands ?? partial.scores ?? null;

  // tableRows
  const tableRows = Array.isArray(partial.tableRows) ? partial.tableRows : buildFallbackTableRows(scoreBandByPhase);

  // phaseTexts
  const phaseTexts = Array.isArray(partial.phaseTexts) ? partial.phaseTexts : buildFallbackPhaseTexts(scoreBandByPhase, partial.debug);

  return {
    saveCode,
    nickname: nickname ?? '（異名未取得）',
    rarity: rarity ?? 'C',
    scoreBandByPhase: scoreBandByPhase ?? null,
    tableRows,
    phaseTexts,
    aliasAsset,
    aliasId,
    debug: partial.debug ?? null,
  };
}

function mergeDebug(a,b){
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  // どちらも object or string を想定。文字列化で連結。
  if (typeof a === 'string' && typeof b === 'string') return `${a}\n${b}`;
  if (typeof a === 'object' && typeof b === 'object') return {...a, ...b};
  return {a, b};
}

function buildFallbackTableRows(scoreBandByPhase){
  // 本紙: 表には「スコア / 備考（= よくあるシーン箇条書き1つ）」を出す。
  // 備考は文章ロジックが別紙化予定のため、ここでは最小限にする（任意補完）。
  return PHASE_KEYS.map(k => {
    const score = scoreBandByPhase?.[k] ?? null;
    return {
      phaseKey: k,
      phaseLabel: PHASE_LABELS[k],
      scoreBand: score,
      note: score == null ? '（未取得）' : fallbackOneLiner(k, score),
    };
  });
}

function fallbackOneLiner(phaseKey, scoreBand){
  // 「スコア直結文言だけ」にならないよう、フェーズ語彙を入れた短文にする（任意補完）。
  const tone = (scoreBand <= 2) ? '慎重' : (scoreBand === 3 ? '中庸' : '勢い');
  switch(phaseKey){
    case 'matching': return `${tone}めに入口を整えやすい`;
    case 'firstMeet': return `${tone}めに会話の温度を合わせやすい`;
    case 'date': return `${tone}めに踏み込み方を調整しやすい`;
    case 'relationship': return `${tone}めにすれ違いの扱いを選びやすい`;
    case 'marriage': return `${tone}めに長期の現実感を置きやすい`;
    default: return '—';
  }
}

function buildFallbackPhaseTexts(scoreBandByPhase, debug){
  // 本紙: 文章は固定テンプレ禁止・タグで分岐…だが、別紙未接続なら無理に作らない。
  // ここでは「未接続であること」を明示しつつ、構造だけ成立させる。
  const note = '（文章ロジック未接続：別紙化予定。現時点では構造のみ表示）';
  return PHASE_KEYS.map(k => {
    const score = scoreBandByPhase?.[k] ?? null;
    return {
      phaseKey: k,
      phaseLabel: PHASE_LABELS[k],
      blocks: [
        { title: 'よくあるシーン（具体）', body: note },
        { title: 'なぜ起きるのか（理由・モデル）', body: note },
        { title: '自覚ポイント', body: note },
        { title: 'おすすめ', body: note },
        { title: 'おすすめをやるとどうなりやすいか', body: note },
        ...(k === 'matching' ? [{ title: 'マッチングしやすい相手像', body: note }] : []),
      ],
    };
  });
}

function rarityLegend(){
  const order = ['C','U','R','E','M','Lg','Sg'];
  return order.map(code => `${code}:${RARITY_RATES[code]}%`).join(' / ');
}

function rarityFrameAsset(rarity){
  // 本紙H-3: assets/rarity/配下のレアリティ画像（_default あり）
  return `./assets/rarity/${rarity || '_default'}.png`;
}

function pickAliasAssetPath(result){
  // 別紙（異名選出ロジック）側で探索順/フォールバックが定義されるが、
  // 本紙側では最低限「表示は必ず出す」：ここでは指示された文字列があればそれを使う。
  // aliasAsset が無ければ _default.png に落とす。
  const asset = result?.aliasAsset;
  if (asset) return `./assets/alias/${asset}`;
  return `./assets/alias/_default.png`;
}

function renderStart(state){
  setSaveCodeBadge(null);

  const card = el('section', {class:'card'}, el('div', {class:'card-inner stack'}, [
    el('h1', {class:'h1'}, '恋愛診断 β'),
    el('p', {class:'p'}, '全20問（5択）。あなたの回答傾向をフェーズ別に可視化します。'),
    el('div', {class:'legend'}, [
      el('span', {class:'pill'}, '同一回答 → 同一結果'),
      el('span', {class:'pill'}, '未回答があると進めない'),
      el('span', {class:'pill'}, `レアリティ凡例：${rarityLegend()}`),
    ]),
    el('div', {class:'hr'}),
    el('div', {class:'row'}, [
      el('button', {class:'btn btn-primary', type:'button', onclick: ()=>startManual(state)}, '診断をはじめる'),
      el('button', {class:'btn', type:'button', onclick: ()=>startRandom(state)}, 'ランダム診断'),
    ]),
    el('p', {class:'note'}, '※ ランダム診断も、最終的に answers を生成して同じ評価関数に渡します（本紙H-1）。'),
  ]));

  return card;
}

function startManual(state){
  state.screen = 'questions';
  state.pageIndex = 0;
  saveState(state);
  rerender(state);
  scrollTopNice();
}

function startRandom(state){
  state.answers = Array.from({length:20}, (_,i)=>({ qid:`Q${i+1}`, v: 1 + Math.floor(Math.random()*5) }));
  state.screen = 'questions';
  state.pageIndex = 0;
  saveState(state);
  rerender(state);
  scrollTopNice();
}

function renderQuestions(state, questions){
  setSaveCodeBadge(null);

  const pageSize = 10;
  const pageCount = Math.ceil(20 / pageSize);
  const start = state.pageIndex * pageSize;
  const end = Math.min(start + pageSize, 20);

  const header = el('div', {class:'row spread'}, [
    el('div', {}, [
      el('h1', {class:'h1'}, `質問 ${start+1}〜${end} / 20`),
      el('div', {class:'note'}, '凡例：1=かなり当てはまる / 2=あてはまる / 3=どちらでもない / 4=あてはまらない / 5=かなりあてはまらない'),
    ]),
    el('div', {class:'row'}, [
      el('button', {class:'btn btn-ghost', type:'button', onclick: ()=>goHome(state)}, '最初へ'),
    ]),
  ]);

  const list = el('div', {class:'stack'});
  for (let i=start;i<end;i++){
    const q = questions[i];
    const qid = qidOf(q, i);
    const current = state.answers[i]?.v ?? null;
    const choices = choicesOf(q);
    const qEl = el('div', {class:'qcard'}, [
      el('div', {class:'qtitle'}, `${qid}  ${qTextOf(q,i)}`),
      el('div', {class:'choices'},
        choices.map((label, idx)=>{
          const v = idx+1;
          return el('div', {
            class:'choice',
            role:'button',
            tabindex:'0',
            'data-selected': String(current === v),
            onclick: ()=>setAnswer(state, i, v),
            onkeydown: (e)=>{ if (e.key==='Enter' || e.key===' ') { e.preventDefault(); setAnswer(state,i,v);} },
            title: label,
          }, `${v}. ${label}`);
        })
      ),
    ]);
    list.appendChild(qEl);
  }

  const nav = el('div', {class:'row spread'}, [
    el('button', {
      class:'btn',
      type:'button',
      disabled: state.pageIndex === 0,
      onclick: ()=>prevPage(state),
    }, '戻る'),
    el('div', {class:'note'}, `ページ ${state.pageIndex+1} / ${pageCount}`),
    el('button', {
      class:'btn btn-primary',
      type:'button',
      onclick: ()=>nextOrResult(state),
      disabled: !pageAnswered(state, start, end),
    }, state.pageIndex === pageCount-1 ? '結果へ' : '次へ'),
  ]);

  const card = el('section', {class:'card'}, el('div', {class:'card-inner stack'}, [header, list, nav]));
  return card;
}

function pageAnswered(state, start, end){
  for (let i=start;i<end;i++){
    const v = state.answers[i]?.v;
    if (!(v >= 1 && v <= 5)) return false;
  }
  return true;
}

function setAnswer(state, idx, v){
  state.answers[idx] = { qid: `Q${idx+1}`, v };
  saveState(state);
  rerender(state);
}

function prevPage(state){
  state.pageIndex = Math.max(0, state.pageIndex - 1);
  saveState(state);
  rerender(state);
  scrollTopNice();
}

function nextOrResult(state){
  const pageSize = 10;
  const pageCount = Math.ceil(20 / pageSize);
  if (state.pageIndex < pageCount - 1){
    state.pageIndex += 1;
    saveState(state);
    rerender(state);
    scrollTopNice();
    return;
  }
  // last page -> evaluate and go result
  goResult(state);
}

async function goResult(state){
  const root = $('#app');
  root.innerHTML = '';
  root.appendChild(el('section', {class:'card'}, el('div', {class:'card-inner'}, [
    el('h1', {class:'h1'}, '集計中…'),
    el('p', {class:'p'}, '別紙ロジックを呼び出しています。'),
  ])));

  try{
    const result = await evaluateResult(state);
    state.lastResult = result;
    state.screen = 'result';
    saveState(state);
    rerender(state);
    scrollTopNice();
  }catch(err){
    const msg = (err && err.message) ? err.message : String(err);
    root.innerHTML = '';
    root.appendChild(el('section', {class:'card'}, el('div', {class:'card-inner stack'}, [
      el('h1', {class:'h1'}, '集計に失敗しました'),
      el('div', {class:'errorbox'}, [
        el('div', {}, '次を確認してください：'),
        el('ul', {}, [
          el('li', {}, '未回答がないか'),
          el('li', {}, '別紙JSが ES Modules として読み込めているか'),
          el('li', {}, '別紙JSの export 形が想定と大きく違わないか'),
        ]),
        el('div', {class:'hr'}),
        el('div', {class:'code'}, msg),
      ]),
      el('div', {class:'row'}, [
        el('button', {class:'btn', type:'button', onclick: ()=>{ state.screen='questions'; saveState(state); rerender(state); }}, '質問に戻る'),
        el('button', {class:'btn btn-ghost', type:'button', onclick: ()=>goHome(state)}, '最初へ'),
      ]),
    ])));
  }
}

function goHome(state){
  if (confirm('診断開始前にもどりますか')){
    // 本紙H-2: 「最初へ」操作時は必ず回答をクリア
    state.screen = 'start';
    state.pageIndex = 0;
    state.answers = Array.from({length:20}, (_,i)=>({ qid:`Q${i+1}`, v:null }));
    state.lastResult = null;
    saveState(state);
    rerender(state);
    scrollTopNice();
  }
}

function renderResult(state){
  const r = state.lastResult;
  const saveCode = r?.saveCode || null;
  setSaveCodeBadge(saveCode);

  const aliasCard = el('div', {class:'card'}, el('div', {class:'card-inner stack'}, [
    el('div', {class:'alias-hero'}, [
      el('div', {class:'alias-img'}, [
        el('img', {src: pickAliasAssetPath(r), alt: '異名画像', onerror: (e)=>{ e.target.src = './assets/alias/_default.png'; }}),
      ]),
      el('div', {class:'stack'}, [
        el('div', {class:'kv'}, [
          el('span', {class:'k'}, '異名'),
          el('span', {class:'v'}, '表示用ラベル'),
        ]),
        el('div', {class:'alias-name'}, r?.nickname ?? '（異名）'),
        el('div', {class:'kv'}, [
          el('span', {class:'k'}, 'レアリティ'),
          el('span', {class:'v'}, r?.rarity ?? 'C'),
          el('span', {class:'k'}, '凡例'),
          el('span', {class:'v'}, `${(RARITY_RATES[r?.rarity] ?? '?')}%`),
        ]),
      ]),
    ]),
  ]));

  const legendCard = el('div', {class:'card'}, el('div', {class:'card-inner stack'}, [
    el('h2', {class:'h2'}, 'レアリティ凡例（固定）'),
    el('p', {class:'p'}, rarityLegend()),
    el('div', {class:'note'}, '※ 表示は固定。割合は本紙 D-3 に従う。'),
  ]));

  const tableCard = el('div', {class:'card'}, el('div', {class:'card-inner stack'}, [
    el('h2', {class:'h2'}, 'フェーズ別の結果表'),
    el('table', {class:'table'}, [
      el('thead', {}, el('tr', {}, [
        el('th', {}, 'フェーズ'),
        el('th', {}, 'スコア'),
        el('th', {}, '備考（よくあるシーン 1つ）'),
      ])),
      el('tbody', {}, (r?.tableRows ?? []).map(row=>{
        const score = row.scoreBand ?? row.score ?? '—';
        return el('tr', {}, [
          el('td', {}, row.phaseLabel ?? PHASE_LABELS[row.phaseKey] ?? row.phaseKey ?? ''),
          el('td', {}, String(score)),
          el('td', {}, row.note ?? row.scene ?? '—'),
        ]);
      })),
    ]),
  ]));

  const textsCard = el('div', {class:'card'}, el('div', {class:'card-inner stack'}, [
    el('h2', {class:'h2'}, 'フェーズ別の詳細文章'),
    el('p', {class:'p'}, '折りたたみで表示します。'),
    ...(r?.phaseTexts ?? []).map(pt=>{
      const blocks = Array.isArray(pt.blocks) ? pt.blocks : [];
      return el('details', {class:'details'}, [
        el('summary', {}, pt.phaseLabel ?? PHASE_LABELS[pt.phaseKey] ?? pt.phaseKey ?? ''),
        el('div', {class:'details-inner stack'}, blocks.map(b=>{
          return el('div', {class:'stack'}, [
            el('div', {class:'k'}, b.title ?? ''),
            el('div', {}, String(b.body ?? '')),
          ]);
        })),
      ]);
    }),
  ]));

  const bottomCard = el('div', {class:'card'}, el('div', {class:'card-inner stack'}, [
    el('div', {class:'row'}, [
      el('button', {class:'btn btn-primary', type:'button', onclick: ()=>restartKeepResult(state)}, 'もう一度診断する'),
      el('button', {class:'btn', type:'button', onclick: ()=>goHome(state)}, '最初へ'),
    ]),
    el('details', {class:'details'}, [
      el('summary', {}, '将来用の言い訳枠（現時点では非実装）'),
      el('div', {class:'details-inner'}, '（本紙G-4）運用側判断で内容を実装する枠。現時点では枠のみ。'),
    ]),
    // debug（UI非表示が前提だが、開発中の最低限として折りたたみに格納）
    ...(r?.debug ? [el('details', {class:'details'}, [
      el('summary', {}, 'debug（非表示想定）'),
      el('div', {class:'details-inner'}, el('div', {class:'code'}, typeof r.debug === 'string' ? r.debug : JSON.stringify(r.debug, null, 2))),
    ])] : []),
  ]));

  return el('div', {class:'stack'}, [aliasCard, legendCard, tableCard, textsCard, bottomCard]);
}

function restartKeepResult(state){
  // 回答クリアして開始に戻す（結果は残さない：再診断）
  state.screen = 'questions';
  state.pageIndex = 0;
  state.answers = Array.from({length:20}, (_,i)=>({ qid:`Q${i+1}`, v:null }));
  state.lastResult = null;
  saveState(state);
  rerender(state);
  scrollTopNice();
}

function rerender(state){
  const root = $('#app');
  root.innerHTML = '';

  const questions = getQuestions();
  if (!questions){
    root.appendChild(el('section', {class:'card'}, el('div', {class:'card-inner stack'}, [
      el('h1', {class:'h1'}, '質問データが見つかりません'),
      el('div', {class:'errorbox'}, [
        el('div', {}, 'data_questions.js から質問配列を取得できませんでした。'),
        el('div', {class:'hr'}),
        el('div', {class:'note'}, '期待する export 例：'),
        el('div', {class:'code'}, 'export const questions = [ { qid:"Q1", text:"…", choices:[…] }, ... ];\n// または export default [...]'),
      ]),
    ])));
    return;
  }

  if (state.screen === 'start'){
    root.appendChild(renderStart(state));
  } else if (state.screen === 'questions'){
    root.appendChild(renderQuestions(state, questions));
  } else if (state.screen === 'result'){
    root.appendChild(renderResult(state));
  } else {
    state.screen = 'start';
    saveState(state);
    root.appendChild(renderStart(state));
  }
}

// boot
document.addEventListener('DOMContentLoaded', () => {
  const state = loadState();
  // 状態復元（本紙H-2）
  rerender(state);
});
