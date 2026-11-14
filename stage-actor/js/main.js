// 画面表示と操作。状態は engine.js の Session が持ち、ここは毎回それを描き直すだけ。
import { Session } from './engine.js';
import { indexActors, resolveLayers, layersUsedBy } from './faces.js';

const STAGE_W = 2048;
const STAGE_H = 1152;
const POS_X = { left: 0.22, center: 0.5, right: 0.78 };
const SIZE = { bust: [768, 1024], full: [768, 1152] };

const $ = (s) => document.querySelector(s);
const el = {
  title: $('#title'), list: $('#work-list'), stage: $('#stage'), bg: $('#bg'), actors: $('#actors'),
  bubble: $('#bubble'), win: $('#window'), choices: $('#choices'), curtain: $('#curtain'),
  playbill: $('#curtain .playbill'), curtainArt: $('#curtain .art'), toTitle: $('#to-title'), error: $('#error'),
};
const THEATER = ['theater/curtain.png', 'theater/frame.png'];

/** 幕と額縁は画面の高さに合わせて中央に置く（飾り幕と床が必ず見える。横長の画面では左右が暗く、縦向きでは左右が切れる） */
function layoutCurtain() {
  const vw = el.stage.clientWidth;
  const vh = el.stage.clientHeight;
  const s = vh / STAGE_H;
  el.curtainArt.style.transform = `translate(${(vw - STAGE_W * s) / 2}px, ${(vh - STAGE_H * s) / 2}px) scale(${s})`;
}

let actorsDb = null;
let works = [];
let work = null; // { id, script, session, base }
let busy = false; // 幕の開閉中は操作を受け付けない
const actorEls = new Map();

function showError(e) {
  console.error(e);
  el.error.textContent = String(e && e.message ? e.message : e);
  el.error.hidden = false;
}
window.addEventListener('error', (e) => showError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showError(e.reason));

async function loadJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url} を読み込めません（${r.status}）`);
  return r.json();
}

function preload(urls) {
  return Promise.all(urls.map((u) => new Promise((res) => {
    const i = new Image();
    i.onload = () => res(true);
    i.onerror = () => { console.warn('画像が見つかりません:', u); res(false); };
    i.src = u;
  })));
}

/* ---------- タイトル ---------- */

function renderTitle() {
  el.list.textContent = '';
  for (const w of works) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = '';
    b.append(w.title);
    const m = document.createElement('span');
    m.className = 'meta';
    m.textContent = w.original || (w.test ? '基盤の動作確認用' : '');
    b.append(m);
    b.addEventListener('click', () => openWork(w.id));
    li.append(b);
    el.list.append(li);
  }
}

function goTitle() {
  work = null;
  el.stage.hidden = true;
  el.title.hidden = false;
  el.error.hidden = true;
  history.replaceState(null, '', location.pathname);
}

/* ---------- 開演 ---------- */

async function openWork(id) {
  const base = `works/${id}/`;
  const script = await loadJSON(`${base}script.json`);
  const session = new Session(script);
  work = { id, script, session, base };
  history.replaceState(null, '', `?work=${encodeURIComponent(id)}`);

  // 脚本が使う表情だけ先読みする（全部だと1作品で数MBになる）
  const urls = [...THEATER, ...Object.values(script.backgrounds || {}).map((p) => base + p), ...layersUsedBy(actorsDb, script)];

  el.title.hidden = true;
  el.stage.hidden = false;
  el.curtain.classList.remove('open');
  layoutCurtain();
  el.playbill.textContent = script.meta?.title || id;
  busy = true;
  actorEls.clear();
  el.actors.textContent = '';
  await Promise.all([preload(urls), new Promise((r) => setTimeout(r, 900))]);
  render();
  el.curtain.classList.add('open');
  setTimeout(() => { busy = false; }, 1600);
}

/* ---------- 描画 ---------- */

// 舞台の領域：横向きは画面全体。縦向きは下半分がセリフウィンドウなので、その上の部分。
const PORTRAIT_STAGE = 0.52;

function layout() {
  const vw = el.stage.clientWidth;
  const vh = el.stage.clientHeight;
  const portrait = vh > vw;
  const rh = portrait ? Math.round(vh * PORTRAIT_STAGE) : vh;
  const s = Math.max(vw / STAGE_W, rh / STAGE_H); // 背景は領域を覆う（cover）。役者も同じ倍率でドットの粒を揃える
  const ox = (vw - STAGE_W * s) / 2;
  const oy = (rh - STAGE_H * s) / 2;
  return { vw, vh, rh, s, ox, oy, portrait };
}

function render() {
  if (!work) return;
  const { session, script, base } = work;
  const stop = session.current;
  const st = stop.state;
  const L = layout();
  el.stage.classList.toggle('portrait', L.portrait);
  el.stage.classList.toggle('bg-full', st.bgMode === 'full');

  // 背景
  const bgPath = st.bg ? base + script.backgrounds[st.bg] : '';
  if (bgPath && !el.bg.src.endsWith(bgPath)) el.bg.src = bgPath;
  el.bg.hidden = !bgPath;
  el.bg.style.width = `${STAGE_W}px`;
  el.bg.style.height = `${STAGE_H}px`;
  el.bg.style.transform = `translate(${L.ox}px, ${L.oy}px) scale(${L.s})`;

  // 役者（後から show した役者ほど手前）
  const present = new Set(st.order);
  for (const [id, node] of actorEls) if (!present.has(id)) { node.remove(); actorEls.delete(id); }
  st.order.forEach((id, z) => {
    const a = st.actors[id];
    const r = resolveLayers(actorsDb, id, a);
    const [w, h] = SIZE[r.view];
    let node = actorEls.get(id);
    if (!node) {
      node = document.createElement('div');
      node.className = 'actor';
      node.dataset.actor = id;
      el.actors.append(node);
      actorEls.set(id, node);
    }
    while (node.children.length < r.layers.length) node.append(document.createElement('img'));
    while (node.children.length > r.layers.length) node.lastChild.remove();
    r.layers.forEach((src, i) => { const img = node.children[i]; if (img.getAttribute('src') !== src) img.setAttribute('src', src); });
    const cx = L.vw * POS_X[a.pos];
    // 腰から上：背景の下端に合わせる。全身：領域の高さに収める（背景が上下に切れている画面では少し小さくなる）
    let sc = L.s;
    let bottom = L.oy + STAGE_H * L.s;
    if (r.view === 'full' && h * sc > L.rh) { sc = L.rh / h; bottom = L.rh; }
    node.style.width = `${w}px`;
    node.style.height = `${h}px`;
    node.style.zIndex = String(z + 1);
    node.style.transform = `translate(${cx - (w * sc) / 2}px, ${bottom - h * sc}px) scale(${sc})`;
  });

  renderText(stop, L);
  renderChoices(stop);
}

function renderText(stop, L) {
  el.bubble.hidden = true;
  el.win.hidden = true;
  el.bubble.className = 'bubble';
  if (stop.kind === 'choice' && stop.chosen === undefined) return;
  const line = stop.line || {};
  const isSay = stop.kind === 'say';
  const name = isSay ? line.name : '';
  const text = stop.kind === 'choice' ? line.text : line.text;
  if (!text) return;

  if (L.portrait) {
    el.win.querySelector('.name').textContent = name;
    el.win.querySelector('.name').hidden = !name;
    el.win.querySelector('.text').textContent = text;
    el.win.hidden = false;
    return;
  }
  el.bubble.querySelector('.name').textContent = name;
  el.bubble.querySelector('.name').hidden = !name;
  el.bubble.querySelector('.text').textContent = text;
  el.bubble.hidden = false;
  const a = isSay ? stop.state.actors[line.actor] : null;
  if (!a || stop.state.bgMode === 'full') {
    el.bubble.classList.add('nar');
    return;
  }
  // 話者の頭の横に吹き出しを出す。右側の役者なら左へ、それ以外は右へ。
  const cx = L.vw * POS_X[a.pos];
  const headOffset = 768 * L.s * 0.28;
  el.bubble.style.top = `${Math.max(12, L.oy + 120 * L.s)}px`;
  // 中央の話者は、空いている側に吹き出しを出す
  const occupied = new Set(Object.values(stop.state.actors).map((x) => x.pos));
  const toLeft = a.pos === 'right' || (a.pos === 'center' && occupied.has('right') && !occupied.has('left'));
  if (toLeft) {
    el.bubble.style.left = '';
    el.bubble.style.right = `${Math.max(8, L.vw - (cx - headOffset))}px`;
    el.bubble.classList.add('tail-right');
  } else {
    el.bubble.style.right = '';
    el.bubble.style.left = `${Math.min(L.vw * 0.62, cx + headOffset)}px`;
    el.bubble.classList.add('tail-left');
  }
}

function renderChoices(stop) {
  const waiting = stop.kind === 'choice' && stop.chosen === undefined;
  el.choices.hidden = !waiting;
  if (!waiting) return;
  el.choices.querySelector('.prompt').textContent = stop.line.text || '';
  const box = el.choices.querySelector('.options');
  box.textContent = '';
  stop.line.options.forEach((t, k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t;
    b.addEventListener('pointerup', (e) => { e.stopPropagation(); if (work.session.choose(k)) render(); });
    box.append(b);
  });
}

/* ---------- 操作：左タップで進む、右タップで戻る ---------- */

function next() {
  if (!work || busy) return;
  const s = work.session;
  if (s.atEnd) return goTitle();
  if (s.next()) render();
}
function back() {
  if (!work || busy) return;
  if (work.session.back()) render();
}

el.stage.addEventListener('pointerup', (e) => {
  if (e.target.closest('button')) return;
  const r = el.stage.getBoundingClientRect();
  if (e.clientX - r.left < r.width / 2) next();
  else back();
});
el.toTitle.addEventListener('pointerup', (e) => { e.stopPropagation(); goTitle(); });
window.addEventListener('keydown', (e) => {
  if (!work) return;
  if (['ArrowLeft', 'Enter', ' '].includes(e.key)) { e.preventDefault(); next(); }
  else if (['ArrowRight', 'Backspace'].includes(e.key)) { e.preventDefault(); back(); }
  else if (e.key === 'Escape') goTitle();
});
window.addEventListener('resize', () => { layoutCurtain(); render(); });

/* ---------- 起動 ---------- */

(async function boot() {
  try {
    const [a, w] = await Promise.all([loadJSON('data/actors.json'), loadJSON('data/works.json')]);
    actorsDb = indexActors(a);
    works = w.works;
    renderTitle();
    const q = new URLSearchParams(location.search).get('work');
    if (q && works.some((x) => x.id === q)) await openWork(q);
  } catch (e) {
    showError(e);
  }
})();
