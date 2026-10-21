// Card DOM rendering.
import { CARDS, cardStats } from '../core/cards.js';
import { iconURL, cardArtURL, frameURL } from '../gfx/icons.js';
import { el, formatText, keywordTips, bindTip } from './dom.js';

const TYPE_NAME = { attack: 'アタック', skill: 'スキル', power: 'パワー', status: '状態異常', curse: '呪い' };
const FRAMES = {
  attack: { fill: '#2a1418', edge: '#c0583a', inner: '#5a2a26', light: '#f0a070', shadow: '#0a0406' },
  skill: { fill: '#121e26', edge: '#4a90a8', inner: '#24485a', light: '#a0e0f0', shadow: '#04080c' },
  power: { fill: '#1e1628', edge: '#c8a050', inner: '#4a3a5a', light: '#fff0b0', shadow: '#08040c' },
  status: { fill: '#1a1a20', edge: '#6a6a78', inner: '#2a2a34', light: '#a0a0b0', shadow: '#050508' },
  curse: { fill: '#140a1a', edge: '#7a4aa0', inner: '#2a1a3a', light: '#c090f0', shadow: '#050208' },
};
const BANNER = {
  starter: 'linear-gradient(#5a5048, #3a332e)',
  common: 'linear-gradient(#5a5048, #3a332e)',
  uncommon: 'linear-gradient(#3a5a7a, #24384e)',
  rare: 'linear-gradient(#b08a3a, #6a4a1a)',
  special: 'linear-gradient(#3a3440, #24202a)',
};
const EDGE = { starter: '#6a5a48', common: '#6a5a48', uncommon: '#5a8ab0', rare: '#e0b050', special: '#5a5060' };

export function costGemURL(type) {
  return iconURL('energy', { size: 48 });
}

export function cardElement(inst, { combat = null, small = false } = {}) {
  const d = CARDS[inst.id];
  const e = el('div', `card ${d.type} ${d.rarity}${inst.upgraded ? ' upgraded' : ''}${d.unplayable ? ' unplayable' : ''}`);
  e.style.setProperty('--cframe', `url(${frameURL(FRAMES[d.type])})`);
  e.style.setProperty('--banner', BANNER[d.rarity] || BANNER.common);
  e.style.setProperty('--edge', EDGE[d.rarity] || EDGE.common);
  e.innerHTML = `
    <div class="c-glow"></div>
    <div class="c-body"></div>
    <div class="c-art"></div>
    <div class="c-name"></div>
    <div class="c-type"><span>${TYPE_NAME[d.type]}</span></div>
    <div class="c-desc"></div>
    <div class="c-cost"></div>
    <div class="c-shine"></div>`;
  e.querySelector('.c-art').style.backgroundImage = `url(${cardArtURL(d.art, d.type)})`;
  const cost = e.querySelector('.c-cost');
  cost.style.backgroundImage = `url(${costGemURL(d.type)})`;
  cost.style.backgroundSize = '100% 100%';
  e._inst = inst;
  updateCard(e, combat);
  bindTip(e, () => keywordTips(d.text), { side: 'right' });
  return e;
}

export function cardDescHTML(inst, combat = null, target = null) {
  const d = CARDS[inst.id];
  const s = cardStats(inst);
  let p = s;
  if (combat) p = combat.previewCard(inst, target);
  const base = cardStats({ ...inst, upgraded: false });
  const fmt = (v, b, baseInCombat) => {
    let cls = '';
    if (combat && baseInCombat !== undefined) cls = v > baseInCombat ? 'num-up' : v < baseInCombat ? 'num-down' : '';
    else if (inst.upgraded && v !== b) cls = 'num-up';
    return `<span class="${cls}">${v}</span>`;
  };
  let t = d.text;
  t = formatText(t);
  t = t.replace('{D}', fmt(p.dmg, base.dmg, combat ? (d.calcDmg ? p.dmgBase : s.dmg) : undefined));
  t = t.replace('{B}', fmt(p.blk, base.blk, combat ? (d.calcBlk ? undefined : s.blk) : undefined));
  t = t.replace(/\{M\}/g, d.id === 'heavens_light' && combat ? fmt(p.mag, base.mag, s.mag) : fmt(s.mag, base.mag));
  t = t.replace('{H}', fmt(s.hits, base.hits));
  return t;
}

export function updateCard(e, combat = null, target = null) {
  const inst = e._inst;
  const d = CARDS[inst.id];
  const s = cardStats(inst);
  e.querySelector('.c-name').textContent = d.name + (inst.upgraded ? '+' : '');
  e.querySelector('.c-desc').innerHTML = `<div>${cardDescHTML(inst, combat, target)}</div>`;
  const cost = e.querySelector('.c-cost');
  cost.textContent = s.cost === 'X' ? 'X' : s.cost;
  cost.classList.toggle('cant', !!combat && !d.unplayable && s.cost !== 'X' && combat.energy < s.cost);
  cost.classList.toggle('mod', inst.upgraded && d.up && d.up.cost !== undefined);
  if (combat) e.classList.toggle('playable', combat.canPlay(inst) && !d.unplayable);
}
