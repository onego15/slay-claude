// DOM helpers, design-space scaling, tooltips, keyword formatting.
import { STATUSES } from '../core/statuses.js';
import { iconURL, frameURL } from '../gfx/icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export function el(tag, cls = '', html = '', attrs = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

export const ui = { root: null, scale: 1, ox: 0, oy: 0 };

export function setupUIRoot(root) {
  ui.root = root;
  const fit = () => {
    const w = window.innerWidth, h = window.innerHeight;
    const s = Math.min(w / 1280, h / 720);
    ui.scale = s;
    ui.ox = (w - 1280 * s) / 2;
    ui.oy = (h - 720 * s) / 2;
    root.style.transform = `translate(${-640 * s}px, ${-360 * s}px) scale(${s})`;
  };
  fit();
  window.addEventListener('resize', fit);
  const st = document.documentElement.style;
  st.setProperty('--frame', `url(${frameURL()})`);
  st.setProperty('--frame-btn', `url(${frameURL({ fill: '#2a2236', edge: '#a8844a', inner: '#463a56', light: '#e8c890' })})`);
  st.setProperty('--frame-gold', `url(${frameURL({ fill: '#d8a848', edge: '#fff0b8', inner: '#f0cc70', shadow: '#3a2208', light: '#fff8e0' })})`);
}

// Convert screen px (from 3D projection) to design-space coordinates.
export function toDesign(x, y) {
  return { x: (x - ui.ox) / ui.scale, y: (y - ui.oy) / ui.scale };
}
export function eventToDesign(e) {
  const t = e.touches ? e.touches[0] || e.changedTouches[0] : e;
  return toDesign(t.clientX, t.clientY);
}

// ---------------------------------------------------------------- keywords
export const KEYWORDS = {
  灼熱: { cls: 'burn', status: 'burn' },
  輝き: { cls: 'radiance', status: 'radiance' },
  焼却: { cls: 'exhaust', desc: '使用後、この戦闘中は山札に戻らない。' },
  脆弱: { cls: 'debuff', status: 'vulnerable' },
  弱体: { cls: 'debuff', status: 'weak' },
  筋力: { cls: '', status: 'strength' },
  反撃: { cls: '', status: 'thorns' },
  ブロック: { cls: '', desc: '次の自分のターン開始時まで、受けるダメージを防ぐ。' },
};
const KW_RE = new RegExp(Object.keys(KEYWORDS).join('|'), 'g');

export function formatText(text) {
  return text.replace(KW_RE, (m) => `<span class="kw ${KEYWORDS[m].cls}">${m}</span>`);
}

export function keywordTips(text) {
  const tips = [];
  const seen = new Set();
  for (const m of text.match(KW_RE) || []) {
    if (seen.has(m)) continue;
    seen.add(m);
    const k = KEYWORDS[m];
    if (k.status) tips.push({ title: m, body: STATUSES[k.status].desc('N').replace('N個', '').replace('残りNターン。', '').replace(/N/g, 'X'), icon: STATUSES[k.status].icon });
    else tips.push({ title: m, body: k.desc });
  }
  return tips;
}

// ---------------------------------------------------------------- tooltip
let tipEl = null;
export function initTooltip(root) {
  tipEl = el('div', 'panel hidden', '', { id: 'tooltip' });
  root.appendChild(tipEl);
}
export function showTip(items, x, y, { side = 'right' } = {}) {
  if (!items || !items.length) return hideTip();
  tipEl.innerHTML = items.map((t) => `<div class="tt"><div class="tt-h">${t.icon ? `<img class="ico m" src="${iconURL(t.icon, { size: 32 })}">` : ''}${t.title}</div><div class="tt-b">${t.body}</div></div>`).join('');
  tipEl.classList.remove('hidden');
  const r = tipEl.getBoundingClientRect();
  const w = r.width / ui.scale, h = r.height / ui.scale;
  let tx = side === 'left' ? x - w - 12 : x + 14;
  let ty = y;
  if (tx + w > 1270) tx = x - w - 14;
  if (tx < 4) tx = 4;
  if (ty + h > 712) ty = 712 - h;
  if (ty < 4) ty = 4;
  tipEl.style.left = tx + 'px';
  tipEl.style.top = ty + 'px';
}
export function hideTip() { if (tipEl) tipEl.classList.add('hidden'); }

export function bindTip(elm, getItems, opts) {
  elm.addEventListener('mouseenter', (e) => { const p = eventToDesign(e); showTip(getItems(), p.x, p.y, opts); });
  elm.addEventListener('mousemove', (e) => { const p = eventToDesign(e); showTip(getItems(), p.x, p.y, opts); });
  elm.addEventListener('mouseleave', hideTip);
}

export function statusTipItems(statuses) {
  return Object.entries(statuses).filter(([k]) => STATUSES[k]).map(([k, n]) => ({ title: `${STATUSES[k].name} ${['bulwark', 'undying', 'stoneskin'].includes(k) ? '' : n}`, body: STATUSES[k].desc(n), icon: STATUSES[k].icon }));
}

export function toast(text, ms = 1600) {
  const t = el('div', 'toast', text);
  ui.root.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
