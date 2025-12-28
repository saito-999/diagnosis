import { calcRarity } from './rarity_logic.js';
import { calcAlias } from './alias_logic.js';
import { QUESTIONS } from './data_questions.js';
import { computeAllPhases } from './contrib_table.js';

const STORAGE_KEY = 'love_diagnosis_state_full_r2';
const PAGE_SIZE = 10;
const RARITY_RATES = { C:35, U:25, R:20, E:12, M:6, Lg:1.5, Sg:0.5 };
const PHASE_LABELS = ['出会い（マッチング）','初対面','デート','交際','結婚'];
const ANSWER_LEGEND_TEXT = '凡例：1=かなり当てはまる / 2=あてはまる / 3=どちらでもない / 4=あてはまらない / 5=かなりあてはまらない';

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
    if (c == null) continue;
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return n;
}
function safeParse(s){ try{ return JSON.parse(s); }catch{ return null; } }
function clampInt(v, min, max){
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return (i>=min && i<=max) ? i : null;
}
function stableSaveCode(answers20){
  const data = new TextEncoder().encode(answers20.join(','));
  let h = 0x811c9dc5;
  for (const b of data){ h ^= b; h = (h * 0x01000193) >>> 0; }
  return h.toString(36).toUpperCase().padStart(7,'0');
}
function setSaveCode(code){ $('#saveCodeBadge').textContent = code ? code : ''; }
function scrollToTop(){ window.scrollTo({top:0, behavior:'smooth'}); }

function defaultState(){
  return { screen:'start', pageIndex:0, answers:Array.from({length:20},(_,i)=>({qid:`Q${i+1}`,v:null})), lastResult:null, scroll:{start:0,questions:0,result:0} };
}
function loadState(){
  const st = safeParse(localStorage.getItem(STORAGE_KEY) || '');
  if (!st) return defaultState();
  const base = defaultState();
  base.screen = (st.screen==='questions' || st.screen==='result') ? st.screen : 'start';
  base.pageIndex = Number.isFinite(st.pageIndex) ? Math.max(0, Math.min(1, st.pageIndex)) : 0;
  if (Array.isArray(st.answers) && st.answers.length === 20){
    base.answers = st.answers.map((a,i)=>({ qid:String(a?.qid ?? `Q${i+1}`), v: clampInt(a?.v,1,5) }));
  }
  base.lastResult = st.lastResult ?? null;
  if (st.scroll && typeof st.scroll === 'object'){
    base.scroll = {
      start: Number.isFinite(st.scroll.start) ? st.scroll.start : 0,
      questions: Number.isFinite(st.scroll.questions) ? st.scroll.questions : 0,
      result: Number.isFinite(st.scroll.result) ? st.scroll.result : 0,
    };
  }
  return base;
}
function saveState(st){ localStorage.setItem(STORAGE_KEY, JSON.stringify(st)); }
function hookScroll(st){
  window.addEventListener('scroll', ()=>{ st.scroll[st.screen] = window.scrollY || 0; saveState(st); }, {passive:true});
}
function restoreScroll(st){ window.scrollTo({top: (st.scroll?.[st.screen] ?? 0), behavior:'auto'}); }

function goStartAndClear(st){
  const ok = confirm('診断開始前にもどりますか');
  if (!ok) return;
  const ns = defaultState();
  saveState(ns);
  rerender(ns);
  scrollToTop();
}

function answersNormalized(st){
  const map = new Map(st.answers.map(a=>[String(a.qid), clampInt(a.v,1,5)]));
  const out = [];
  for (let i=1;i<=20;i++) out.push(map.get(`Q${i}`) ?? null);
  return out;
}
function hasUnanswered(ans){ return ans.some(v => !(v>=1 && v<=5)); }

function rarityLegendText(){
  const order = ['C','U','R','E','M','Lg','Sg'];
  return order.map(c => `${c}:${RARITY_RATES[c]}%`).join(' / ');
}
function rarityAssetCandidates(code){
  const safe = String(code || '_default');
  return [`./assets/rarity/${safe}.png`, `./assets/rarity/${safe}.gif`, `./assets/rarity/_default.png`];
}
function aliasAssetPath(aliasObj){
  const asset = aliasObj?.aliasAssetOverall ?? aliasObj?.aliasAsset ?? aliasObj?.asset ?? null;
  return asset ? `./assets/alias/${asset}` : './assets/alias/_default.png';
}

function getPhaseNode(phasesObj, phaseLabel){ return phasesObj?.[phaseLabel] ?? null; }
function firstBulletFromSection(sec){
  if (!sec) return null;
  if (Array.isArray(sec.bullets) && sec.bullets.length) return String(sec.bullets[0]);
  return null;
}
function sectionBody(sec){
  if (!sec) return '—';
  const bullets = Array.isArray(sec.bullets) ? sec.bullets : [];
  const tail = sec.tail ? String(sec.tail) : '';
  const parts = [];
  if (bullets.length) parts.push('・' + bullets.join('\n・'));
  if (tail) parts.push(tail);
  return parts.length ? parts.join('\n') : '—';
}

async function evaluate(st){
  const ans = answersNormalized(st);
  if (hasUnanswered(ans)) throw new Error('未回答が存在します。');

  const rarityOverall = await calcRarity(ans);
  const aliasObj = await calcAlias(ans, rarityOverall);
  const phasesRes = await computeAllPhases({ answers: ans });

  const phases = phasesRes?.phases ?? {};

  const tableRows = PHASE_LABELS.map(label=>{
    const node = getPhaseNode(phases, label);
    const score = node?.scoreBand ?? node?.scoreLabel ?? '—';
    const note = firstBulletFromSection(node?.sections?.scene) ?? node?.note ?? '—';
    return { phaseLabel: label, scoreBand: score, note };
  });

  const phaseTexts = PHASE_LABELS.map(label=>{
    const node = getPhaseNode(phases, label);
    const s = node?.sections ?? {};
    const blocks = [
      { title:'よくあるシーン（具体）', body: sectionBody(s.scene) },
      { title:'なぜ起きるのか（理由・モデル）', body: sectionBody(s.why) },
      { title:'自覚ポイント', body: sectionBody(s.aware) },
      { title:'おすすめ', body: sectionBody(s.reco) },
      { title:'おすすめをやるとどうなりやすいか', body: sectionBody(s.effect) },
    ];
    if (label === '出会い（マッチング）') blocks.push({ title:'マッチングしやすい相手像', body: sectionBody(s.matchingExtra) });
    return { phaseLabel: label, blocks };
  });

  const nickname =
    aliasObj?.aliasOverall ??
    aliasObj?.nickname ??
    aliasObj?.alias ??
    (typeof aliasObj === 'string' ? aliasObj : null) ??
    '（異名未取得）';

  return {
    saveCode: stableSaveCode(ans),
    rarityOverall,
    nickname,
    aliasAsset: aliasAssetPath(aliasObj),
    rarityAssetCandidates: rarityAssetCandidates(rarityOverall),
    tableRows,
    phaseTexts,
  };
}

function renderStart(st){
  setSaveCode(null);
  const card = el('section', {class:'card'}, el('div', {class:'card-inner stack'}, [
    el('h1', {class:'h1'}, '恋愛戦場フェーズ診断'),
    el('div', {class:'legend'}, [el('span', {class:'pill'}, `レアリティ凡例：${rarityLegendText()}`)]),
    el('div', {class:'row'}, [
      el('button', {class:'btn btn-primary', type:'button', onclick: ()=>{ st.screen='questions'; st.pageIndex=0; saveState(st); rerender(st); scrollToTop(); }}, '診断開始'),
    ]),
  ]));
  const fab = el('div', {class:'fab'}, el('button', {class:'btn btn-sm', type:'button', onclick: ()=>randomStart(st)}, 'ランダム診断'));
  return el('div', {class:'stack'}, [card, fab]);
}

function randomStart(st){
  st.answers = Array.from({length:20}, (_,i)=>({ qid:`Q${i+1}`, v: 1 + Math.floor(Math.random()*5) }));
  st.pageIndex = 0;
  st.screen = 'questions';
  saveState(st);
  rerender(st);
  scrollToTop();
}

function renderQuestions(st){
  setSaveCode(null);
  if (!Array.isArray(QUESTIONS) || QUESTIONS.length < 20){
    return el('section', {class:'card'}, el('div', {class:'card-inner stack'}, [
      el('h1', {class:'h1'}, '質問データが見つかりません'),
      el('div', {class:'errorbox'}, 'data_questions.js の QUESTIONS が 20問ぶん存在する必要があります。'),
    ]));
  }

  const pageCount = Math.ceil(20 / PAGE_SIZE);
  const start = st.pageIndex * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, 20);

  const header = el('div', {class:'row spread'}, [
    el('div', {class:'stack'}, [
      el('h1', {class:'h1'}, `質問 ${start+1}〜${end} / 20`),
      el('p', {class:'note'}, ANSWER_LEGEND_TEXT),
    ]),
    el('button', {class:'btn btn-ghost btn-sm', type:'button', onclick: ()=>goStartAndClear(st)}, '最初へ'),
  ]);

  const list = el('div', {class:'stack'});
  for (let i=start; i<end; i++){
    const q = QUESTIONS[i];
    const qid = String(q?.qid ?? `Q${i+1}`);
    const text = String(q?.text ?? q?.question ?? '');
    const current = clampInt(st.answers[i]?.v, 1, 5);

    list.appendChild(el('div', {class:'qcard'}, [
      el('div', {class:'qtitle'}, `${qid}  ${text}`),
      el('div', {class:'choices'},
        [1,2,3,4,5].map(v => el('div', {
          class:'choice',
          role:'button',
          tabindex:'0',
          'data-selected': String(current === v),
          onclick: ()=>setAnswer(st, i, v),
          onkeydown: (e)=>{ if (e.key==='Enter' || e.key===' ') { e.preventDefault(); setAnswer(st,i,v); } },
        }, String(v)))
      ),
    ]));
  }

  const nav = el('div', {class:'row spread'}, [
    el('button', {class:'btn', type:'button', disabled: st.pageIndex===0, onclick: ()=>{ st.pageIndex=Math.max(0, st.pageIndex-1); saveState(st); rerender(st); scrollToTop(); }}, '戻る'),
    el('div', {class:'note'}, `ページ ${st.pageIndex+1} / ${pageCount}`),
    el('button', {
      class:'btn btn-primary',
      type:'button',
      disabled: !pageAnswered(st, start, end),
      onclick: ()=>nextOrResult(st),
    }, st.pageIndex === pageCount-1 ? '結果へ' : '次へ'),
  ]);

  return el('section', {class:'card'}, el('div', {class:'card-inner stack'}, [header, list, nav]));
}

function setAnswer(st, idx, v){
  st.answers[idx] = { qid:`Q${idx+1}`, v };
  saveState(st);
  rerender(st);
}
function pageAnswered(st, start, end){
  for (let i=start; i<end; i++){
    const v = clampInt(st.answers[i]?.v, 1, 5);
    if (!(v>=1 && v<=5)) return false;
  }
  return true;
}
function nextOrResult(st){
  const pageCount = Math.ceil(20 / PAGE_SIZE);
  if (st.pageIndex < pageCount - 1){
    st.pageIndex += 1;
    saveState(st);
    rerender(st);
    scrollToTop();
    return;
  }
  goResult(st);
}

async function goResult(st){
  const root = $('#app');
  root.innerHTML = '';
  root.appendChild(el('section', {class:'card'}, el('div', {class:'card-inner'}, [el('h1', {class:'h1'}, '集計中…')])));
  try{
    const res = await evaluate(st);
    st.lastResult = res;
    st.screen = 'result';
    saveState(st);
    rerender(st);
    scrollToTop();
  }catch(err){
    const msg = err?.message ? err.message : String(err);
    root.innerHTML = '';
    root.appendChild(el('section', {class:'card'}, el('div', {class:'card-inner stack'}, [
      el('h1', {class:'h1'}, '集計に失敗しました'),
      el('div', {class:'errorbox'}, [
        el('div', {}, '別紙JSの I/O（export名・入力形式）を確認してください。'),
        el('div', {class:'code'}, msg),
      ]),
      el('div', {class:'row'}, [
        el('button', {class:'btn', type:'button', onclick: ()=>{ st.screen='questions'; saveState(st); rerender(st); }}, '質問に戻る'),
        el('button', {class:'btn btn-ghost', type:'button', onclick: ()=>goStartAndClear(st)}, '最初へ'),
      ]),
    ])));
  }
}

function renderResult(st){
  const r = st.lastResult ?? null;
  setSaveCode(r?.saveCode ?? null);

  const rarityImg = el('img', { alt:'レアリティ枠' });
  const candidates = r?.rarityAssetCandidates ?? ['./assets/rarity/_default.png'];
  let ci = 0;
  const setNext = ()=>{ rarityImg.src = candidates[Math.min(ci, candidates.length-1)]; };
  rarityImg.onerror = ()=>{ ci += 1; if (ci < candidates.length) setNext(); };
  setNext();

  const aliasCard = el('section', {class:'card'}, el('div', {class:'card-inner stack'}, [
    el('div', {class:'alias-head'}, [
      el('div', {class:'stack'}, [
        el('div', {class:'rarity-frame'}, [rarityImg]),
        el('div', {class:'note'}, 'レアリティ枠'),
      ]),
      el('div', {class:'stack'}, [
        el('div', {class:'kv'}, [el('span', {class:'k'}, '異名'), el('span', {class:'v'}, 'ラベル')]),
        el('h2', {class:'alias-name'}, String(r?.nickname ?? '—')),
        el('div', {class:'kv'}, [
          el('span', {class:'k'}, 'レアリティ'),
          el('span', {class:'v'}, String(r?.rarityOverall ?? 'C')),
          el('span', {class:'k'}, '凡例'),
          el('span', {class:'v'}, `${RARITY_RATES[r?.rarityOverall] ?? '?'}%`),
        ]),
        el('div', {class:'alias-img'}, [
          el('img', {src: r?.aliasAsset ?? './assets/alias/_default.png', alt:'異名画像', onerror:(e)=>{ e.target.src='./assets/alias/_default.png'; }}),
        ]),
      ]),
    ]),
  ]));

  const tableCard = el('section', {class:'card'}, el('div', {class:'card-inner stack'}, [
    el('h2', {class:'h2'}, 'フェーズ別の結果表'),
    el('table', {class:'table'}, [
      el('thead', {}, el('tr', {}, [el('th', {}, 'フェーズ'), el('th', {}, 'スコア'), el('th', {}, '備考（よくあるシーン 1つ）')])),
      el('tbody', {}, (r?.tableRows ?? []).map(row => el('tr', {}, [el('td', {}, String(row.phaseLabel ?? '—')), el('td', {}, String(row.scoreBand ?? '—')), el('td', {}, String(row.note ?? '—'))]))),
    ]),
  ]));

  const textsCard = el('section', {class:'card'}, el('div', {class:'card-inner stack'}, [
    el('h2', {class:'h2'}, 'フェーズ別の詳細文章'),
    ...(r?.phaseTexts ?? []).map(pt => el('details', {class:'details'}, [
      el('summary', {}, String(pt.phaseLabel ?? '—')),
      el('div', {class:'details-inner stack'}, (pt.blocks ?? []).map(b => el('div', {class:'stack'}, [el('div', {class:'note'}, String(b.title ?? '')), el('div', {}, String(b.body ?? '—'))]))),
    ])),
  ]));

  const footerCard = el('section', {class:'card'}, el('div', {class:'card-inner stack'}, [
    el('div', {class:'row spread'}, [
      el('div', {class:'row'}, [
        el('button', {class:'btn btn-primary', type:'button', onclick: ()=>{ st.screen='questions'; st.pageIndex=0; st.answers = Array.from({length:20},(_,i)=>({qid:`Q${i+1}`,v:null})); st.lastResult=null; saveState(st); rerender(st); scrollToTop(); }}, 'もう一度診断する'),
        el('button', {class:'btn', type:'button', onclick: ()=>goStartAndClear(st)}, '最初へ'),
      ]),
      el('button', {class:'btn btn-sm', type:'button', onclick: async ()=>{ const code=r?.saveCode??''; if(!code) return; try{ await navigator.clipboard.writeText(code); alert('保存コードをコピーしました'); }catch{ alert('コピーに失敗しました'); } }}, '保存コードをコピー'),
    ]),
    el('details', {class:'details'}, [el('summary', {}, '将来用の言い訳枠（現時点では非実装）'), el('div', {class:'details-inner'}, '—')]),
  ]));

  return el('div', {class:'stack'}, [aliasCard, tableCard, textsCard, footerCard]);
}

function rerender(st){
  const root = $('#app');
  root.innerHTML = '';
  if (st.screen === 'start') root.appendChild(renderStart(st));
  else if (st.screen === 'questions') root.appendChild(renderQuestions(st));
  else if (st.screen === 'result') root.appendChild(renderResult(st));
  else { st.screen='start'; saveState(st); root.appendChild(renderStart(st)); }
  restoreScroll(st);
}

document.addEventListener('DOMContentLoaded', () => {
  const st = loadState();
  hookScroll(st);
  rerender(st);
});
