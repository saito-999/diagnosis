import { calcRarity } from './rarity_logic.js';
import { calcAlias } from './alias_logic.js';
import { QUESTIONS } from './data_questions.js';
import { computeAllPhases } from './contrib_table.js';

console.info('[love-diagnosis] build 20251228_232040');

const STORAGE_KEY = 'love_diagnosis_state_full_r2_strict';
const PAGE_SIZE = 10;

const RARITY_RATES = { C:35, U:25, R:20, E:12, M:6, Lg:1.5, Sg:0.5 };
const RARITY_ORDER = ['C','U','R','E','M','Lg','Sg'];

const PHASE_LABELS = ['出会い（マッチング）','初対面','デート','交際','結婚'];
const ANSWER_LEGEND_TEXT = '凡例：1=かなり当てはまる / 2=あてはまる / 3=どちらでもない / 4=あてはまらない / 5=かなりあてはまらない';

function $(sel, root=document){ return root.querySelector(sel); }

function el(tag, attrs={}, children=[]) {
  const n = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v === false || v === null || v === undefined) continue;
    else n.setAttribute(k, String(v));
  }
  for (const c of (Array.isArray(children) ? children : [children])) {
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

function storageGet(){ return sessionStorage.getItem(STORAGE_KEY); }
function storageSet(v){ sessionStorage.setItem(STORAGE_KEY, v); }

function stableSaveCode(answers20){
  const data = new TextEncoder().encode(answers20.join(','));
  let h = 0x811c9dc5;
  for (const b of data){ h ^= b; h = (h * 0x01000193) >>> 0; }
  return h.toString(36).toUpperCase().padStart(7,'0');
}
function setSaveCode(code){ $('#saveCodeBadge').textContent = code ? code : ''; }
function scrollToTop(){ window.scrollTo({top:0, behavior:'smooth'}); }

function defaultState(){
  return {
    screen:'start',
    pageIndex:0,
    answers:Array.from({length:20},(_,i)=>({qid:`Q${i+1}`,v:null})),
    lastResult:null,
    scroll:{start:0,questions:0,result:0},
  };
}

function loadState(){
  const st = safeParse(storageGet() || '');
  if (!st) return defaultState();
  const base = defaultState();
  base.screen = (st.screen==='start' || st.screen==='questions' || st.screen==='result') ? st.screen : 'start';
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

function saveState(st){ storageSet(JSON.stringify(st)); }

function hookScroll(st){
  window.addEventListener('scroll', ()=>{
    st.scroll[st.screen] = window.scrollY || 0;
    saveState(st);
  }, {passive:true});
}
function restoreScroll(st){
  const y = st.scroll?.[st.screen] ?? 0;
  window.scrollTo({top:y, behavior:'auto'});
}

function answersNormalized(st){
  const map = new Map(st.answers.map(a=>[String(a.qid), clampInt(a.v,1,5)]));
  const out = [];
  for (let i=1;i<=20;i++) out.push(map.get(`Q${i}`) ?? null);
  return out;
}
function hasUnanswered(ans){ return ans.some(v => !(v>=1 && v<=5)); }

function rarityLegendLine(){
  return RARITY_ORDER.map(c => `${c}:${RARITY_RATES[c]}%`).join(' / ');
}

function aliasAssetCandidates(aliasObj){
  const asset = aliasObj?.aliasAssetOverall ?? aliasObj?.aliasAsset ?? aliasObj?.asset ?? null;
  if (!asset) return ['./assets/alias/_default.png'];
  return [
    `./assets/alias/${asset}`,
    `./assets/${asset}`,
    './assets/alias/_default.png'
  ];
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
  const phases = phasesRes?.phases ?? phasesRes ?? {};

  const tableRows = PHASE_LABELS.map(label=>{
    const node = getPhaseNode(phases, label);
    const score = node?.scoreBand ?? node?.scoreLabel ?? node?.score ?? '—';
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
    aliasAssetCandidates: aliasAssetCandidates(aliasObj),
    tableRows,
    phaseTexts,
  };
}

function goStartAndClear(st){
  const ok = confirm('診断開始前にもどりますか');
  if (!ok) return;
  const ns = defaultState();
  saveState(ns);
  rerender(ns);
  scrollToTop();
}

function randomStart(st){
  st.answers = Array.from({length:20}, (_,i)=>({ qid:`Q${i+1}`, v: 1 + Math.floor(Math.random()*5) }));
  st.pageIndex = 0;
  st.screen = 'questions';
  st.lastResult = null;
  saveState(st);
  rerender(st);
  scrollToTop();
}

function renderStart(st){
  setSaveCode(null);
  const card = el('section', {class:'card'}, el('div', {class:'card-inner section'}, [
    el('div', {}, '恋愛戦場フェーズ診断'),
    el('div', {class:'row'}, [
      el('button', {
        class:'btn btn-primary', type:'button',
        onclick: ()=>{ st.screen='questions'; st.pageIndex=0; saveState(st); rerender(st); scrollToTop(); }
      }, '診断開始'),
    ]),
  ]));
  const fab = el('div', {class:'fab'},
    el('button', {class:'btn btn-sm', type:'button', onclick: ()=>randomStart(st)}, 'ランダム診断')
  );
  return el('div', {class:'section'}, [card, fab]);
}

function setAnswer(st, idx, v){
  st.scroll.questions = window.scrollY || 0;
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

function renderQuestions(st){
  setSaveCode(null);
  if (!Array.isArray(QUESTIONS) || QUESTIONS.length < 20){
    return el('section', {class:'card'}, el('div', {class:'card-inner section'}, [
      el('div', {class:'errorbox'}, 'data_questions.js の export const QUESTIONS が 20問ぶん必要です。'),
    ]));
  }

  const pageCount = Math.ceil(20 / PAGE_SIZE);
  const start = st.pageIndex * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, 20);

  const header = el('div', {class:'row'}, [
    el('div', {}, `質問 ${start+1}〜${end} / 20`),
    el('button', {class:'btn btn-sm', type:'button', onclick: ()=>goStartAndClear(st)}, '最初へ'),
  ]);

  const legend = el('p', {class:'note'}, ANSWER_LEGEND_TEXT);

  const list = el('div', {class:'section'});
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

  const nav = el('div', {class:'row'}, [
    el('button', {
      class:'btn', type:'button',
      disabled: st.pageIndex===0,
      onclick: ()=>{ st.pageIndex=Math.max(0, st.pageIndex-1); saveState(st); rerender(st); scrollToTop(); }
    }, '戻る'),
    el('div', {class:'note'}, `ページ ${st.pageIndex+1} / ${pageCount}`),
    el('button', {
      class:'btn btn-primary', type:'button',
      disabled: !pageAnswered(st, start, end),
      onclick: ()=>nextOrResult(st),
    }, st.pageIndex === pageCount-1 ? '結果へ' : '次へ'),
  ]);

  return el('section', {class:'card'}, el('div', {class:'card-inner section'}, [header, legend, list, nav]));
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
  root.appendChild(el('section', {class:'card'}, el('div', {class:'card-inner'}, '集計中…')));

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
    root.appendChild(el('section', {class:'card'}, el('div', {class:'card-inner section'}, [
      el('div', {class:'errorbox'}, [
        el('div', {}, '集計に失敗しました'),
        el('div', {class:'code'}, msg),
      ]),
      el('div', {class:'row'}, [
        el('button', {class:'btn', type:'button', onclick: ()=>{ st.screen='questions'; saveState(st); rerender(st); }}, '質問に戻る'),
        el('button', {class:'btn', type:'button', onclick: ()=>goStartAndClear(st)}, '最初へ'),
      ]),
    ])));
  }
}

function renderResult(st){
  const r = st.lastResult ?? null;
  setSaveCode(r?.saveCode ?? null);

  const aliasImg = el('img', { alt:'異名画像' });
  const candidates = r?.aliasAssetCandidates ?? ['./assets/alias/_default.png'];
  let ci = 0;
  const setNext = ()=>{ aliasImg.src = candidates[Math.min(ci, candidates.length-1)]; };
  aliasImg.onerror = ()=>{ ci += 1; if (ci < candidates.length) setNext(); };
  setNext();

  const head = el('section', {class:'card'}, el('div', {class:'card-inner'}, [
    el('div', {class:'result-head'}, [
      el('div', {class:'section'}, [
        el('h2', {class:'nickname'}, String(r?.nickname ?? '—')),
        el('div', {class:'rarity-code'}, String(r?.rarityOverall ?? 'C')),
      ]),
      el('div', {class:'alias-img'}, [aliasImg]),
    ]),
  ]));

  const tableCard = el('section', {class:'card'}, el('div', {class:'card-inner section'}, [
    el('div', {}, 'フェーズ別の結果表'),
    el('table', {class:'table'}, [
      el('thead', {}, el('tr', {}, [
        el('th', {}, 'フェーズ'),
        el('th', {}, 'スコア'),
        el('th', {}, '備考（よくあるシーン1つ）')
      ])),
      el('tbody', {}, (r?.tableRows ?? []).map(row => el('tr', {}, [
        el('td', {}, String(row.phaseLabel ?? '—')),
        el('td', {}, String(row.scoreBand ?? '—')),
        el('td', {}, String(row.note ?? '—')),
      ]))),
    ]),
    el('p', {class:'note'}, rarityLegendLine()),
  ]));

  const textsCard = el('section', {class:'card'}, el('div', {class:'card-inner section'}, [
    el('div', {}, 'フェーズ別の詳細文章'),
    ...(r?.phaseTexts ?? []).map(pt => el('details', {class:'details'}, [
      el('summary', {}, String(pt.phaseLabel ?? '—')),
      el('div', {class:'details-inner section'}, (pt.blocks ?? []).map(b => el('div', {class:'section'}, [
        el('p', {class:'note'}, String(b.title ?? '')),
        el('div', {}, String(b.body ?? '—'))
      ]))),
    ])),
  ]));

  const actions = el('section', {class:'card'}, el('div', {class:'card-inner section'}, [
    el('div', {class:'row'}, [
      el('button', {
        class:'btn btn-primary', type:'button',
        onclick: ()=>{
          st.screen='questions';
          st.pageIndex=0;
          st.answers = Array.from({length:20},(_,i)=>({qid:`Q${i+1}`,v:null}));
          st.lastResult=null;
          saveState(st);
          rerender(st);
          scrollToTop();
        }
      }, 'もう一度診断'),
      el('button', {
        class:'btn', type:'button',
        onclick: async ()=>{
          const code = r?.saveCode ?? '';
          if (!code) return;
          try{ await navigator.clipboard.writeText(code); alert('コピーしました'); }
          catch{ alert('コピーに失敗しました'); }
        }
      }, '結果を保存'),
    ]),
  ]));

  return el('div', {class:'section'}, [head, tableCard, textsCard, actions]);
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
