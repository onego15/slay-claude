// Hand of cards: fan layout, hover, drag & drop, click-to-select, targeting arrow.
import { CARDS, cardStats } from '../core/cards.js';
import { cardElement, updateCard } from './cardview.js';
import { el, eventToDesign, hideTip } from './dom.js';
import { addTicker, damp } from '../gfx/clock.js';
import { sfx } from '../audio/audio.js';

const PLAY_LINE = 470;

export class Hand {
  constructor(root, battle) {
    this.root = root;
    this.battle = battle;
    this.cards = []; // {inst, el, x,y,r,s, tx,ty,tr,ts, alpha}
    this.hover = null;
    this.drag = null;
    this.selected = null;
    this.enabled = false;
    this.chooseMode = null;
    this.arrowSvg = el('div', '', `<svg id="arrow" width="1280" height="720" viewBox="0 0 1280 720"><defs>
      <filter id="aglow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <g id="arrowg" filter="url(#aglow)" style="display:none"><path id="arrowpath" fill="none" stroke-width="9" stroke-linecap="square" stroke-dasharray="10 8"/>
      <polygon id="arrowhead" points="0,-16 22,0 0,16 6,0"/></g></svg>`);
    this.arrowSvg.className = 'np';
    this.arrowSvg.style.cssText = 'position:absolute;inset:0;z-index:20';
    root.appendChild(this.arrowSvg);
    this.layer = el('div', '', '', { id: 'hand' });
    root.appendChild(this.layer);
    this.stop = addTicker((dt, rdt) => this.update(rdt));
    this.onMove = (e) => this.pointerMove(e);
    this.onUp = (e) => this.pointerUp(e);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    this.onKey = (e) => this.key(e);
    window.addEventListener('keydown', this.onKey);
    this.onCtx = (e) => { if (this.selected || this.drag) { e.preventDefault(); this.cancel(); } };
    window.addEventListener('contextmenu', this.onCtx);
    this.pointer = { x: 640, y: 400 };
  }

  destroy() {
    this.stop();
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('contextmenu', this.onCtx);
    this.layer.remove();
    this.arrowSvg.remove();
  }

  get combat() { return this.battle.combat; }

  add(inst, from = { x: 70, y: 660 }) {
    const e = cardElement(inst, { combat: this.combat });
    const c = { inst, el: e, x: from.x, y: from.y, r: -20, s: 0.35, tx: 0, ty: 0, tr: 0, ts: 1, alpha: 1, born: performance.now() };
    e.style.transform = `translate(${c.x - 75}px, ${c.y - 105}px) rotate(${c.r}deg) scale(${c.s})`;
    e.addEventListener('pointerdown', (ev) => this.pointerDown(ev, c));
    e.addEventListener('pointerenter', () => { if (!this.drag) { this.hover = c; sfx('hover'); } });
    e.addEventListener('pointerleave', () => { if (this.hover === c) this.hover = null; });
    this.layer.appendChild(e);
    this.cards.push(c);
    this.refresh();
    return c;
  }

  remove(inst) {
    const i = this.cards.findIndex((c) => c.inst === inst);
    if (i < 0) return null;
    const [c] = this.cards.splice(i, 1);
    if (this.hover === c) this.hover = null;
    if (this.selected === c) this.selected = null;
    return c;
  }

  find(inst) { return this.cards.find((c) => c.inst === inst); }

  refresh() {
    const tgt = this.currentTarget();
    for (const c of this.cards) updateCard(c.el, this.combat, tgt);
  }

  currentTarget() {
    if ((this.drag || this.selected) && this.battle.hoverEnemy) return this.battle.hoverEnemy;
    return null;
  }

  layout() {
    const n = this.cards.length;
    const spacing = Math.min(110, 640 / Math.max(1, n));
    const mid = (n - 1) / 2;
    const hi = this.hover ? this.cards.indexOf(this.hover) : -1;
    this.cards.forEach((c, i) => {
      const off = i - mid;
      let x = 640 + off * spacing;
      let y = 616 + Math.abs(off) * Math.abs(off) * 2.6;
      let r = off * 3.2;
      let s = 0.92;
      if (hi >= 0 && !this.drag && !this.selected) {
        if (i === hi) { y = 540; r = 0; s = 1.3; }
        else x += (i < hi ? -1 : 1) * Math.max(0, 70 - Math.abs(i - hi) * 18);
      }
      c.tx = x; c.ty = y; c.tr = r; c.ts = s;
      c.z = i === hi ? 100 : i;
    });
    if (this.selected) {
      // lifted in place so the battlefield stays visible while aiming
      const c = this.selected;
      c.ty = 528; c.tr = 0; c.ts = 1.2; c.z = 200;
    }
    if (this.drag) {
      const c = this.drag.card;
      const targeted = CARDS[c.inst.id].target === 'enemy';
      if (targeted && this.pointer.y < PLAY_LINE + 30) { c.ty = 528; c.ts = 1.2; }
      else { c.tx = this.pointer.x - this.drag.dx; c.ty = this.pointer.y - this.drag.dy; c.ts = 1.18; }
      c.tr = 0; c.z = 300;
    }
  }

  update(dt) {
    if (!this.enabled && this.selected) this.selected = null;
    this.layout();
    for (const c of this.cards) {
      const k = this.drag && this.drag.card === c && !(CARDS[c.inst.id].target === 'enemy' && this.pointer.y < PLAY_LINE + 30) ? 40 : 15;
      c.x = damp(c.x, c.tx, k, dt);
      c.y = damp(c.y, c.ty, k, dt);
      c.r = damp(c.r, c.tr, k, dt);
      c.s = damp(c.s, c.ts, k, dt);
      c.el.style.transform = `translate(${c.x - 75}px, ${c.y - 105}px) rotate(${c.r}deg) scale(${c.s})`;
      c.el.style.zIndex = c.z;
      c.el.style.opacity = c.alpha;
      c.el.classList.toggle('selected', this.selected === c || (this.drag && this.drag.card === c));
    }
    this.updateArrow();
  }

  updateArrow() {
    const g = this.arrowSvg.querySelector('#arrowg');
    const c = (this.drag && this.drag.card) || this.selected;
    const targeted = c && CARDS[c.inst.id].target === 'enemy';
    const show = targeted && (this.selected || this.pointer.y < PLAY_LINE + 30);
    const potion = this.battle.potionTargeting;
    if (!show && !potion) { g.style.display = 'none'; return; }
    g.style.display = '';
    const sx = potion ? potion.x : c.x, sy = potion ? potion.y : c.y - 110 * c.s;
    const ex = this.pointer.x, ey = this.pointer.y;
    const cx = (sx + ex) / 2, cy = Math.min(sy, ey) - 120;
    const path = this.arrowSvg.querySelector('#arrowpath');
    const has = !!this.battle.hoverEnemy;
    const col = has ? '#ffe070' : '#d0c0a0';
    path.setAttribute('d', `M${sx},${sy} Q${cx},${cy} ${ex},${ey}`);
    path.setAttribute('stroke', col);
    const head = this.arrowSvg.querySelector('#arrowhead');
    const ang = (Math.atan2(ey - cy, ex - cx) * 180) / Math.PI;
    head.setAttribute('transform', `translate(${ex},${ey}) rotate(${ang})`);
    head.setAttribute('fill', col);
  }

  pointerDown(e, c) {
    if (e.button === 2) return;
    e.preventDefault();
    hideTip();
    if (this.chooseMode) { this.chooseMode(c.inst); return; }
    if (!this.enabled) return;
    const p = eventToDesign(e);
    this.pointer = p;
    if (this.selected && this.selected !== c) this.selected = null;
    if (this.selected === c) {
      // second click on an already-selected untargeted card plays it
      if (CARDS[c.inst.id].target !== 'enemy') { this.tryPlay(c, null); return; }
    }
    this.drag = { card: c, dx: p.x - c.x, dy: p.y - c.y, sx: p.x, sy: p.y, moved: false };
  }

  pointerMove(e) {
    this.pointer = eventToDesign(e);
    if (this.drag) {
      const d = Math.hypot(this.pointer.x - this.drag.sx, this.pointer.y - this.drag.sy);
      if (d > 8) this.drag.moved = true;
    }
    this.battle.updateHoverEnemy(this.pointer);
  }

  pointerUp(e) {
    const p = eventToDesign(e);
    this.pointer = p;
    if (this.battle.potionTargeting) { this.battle.finishPotionTarget(); return; }
    if (this.drag) {
      const c = this.drag.card;
      const moved = this.drag.moved;
      this.drag = null;
      const d = CARDS[c.inst.id];
      if (!moved) {
        // click: toggle select
        if (!this.combat.canPlay(c.inst)) { this.reject(c); return; }
        this.selected = this.selected === c ? null : c;
        if (this.selected) sfx('card');
        return;
      }
      if (d.target === 'enemy') {
        if (p.y < PLAY_LINE + 30 && this.battle.hoverEnemy) this.tryPlay(c, this.battle.hoverEnemy);
      } else if (p.y < PLAY_LINE) this.tryPlay(c, null);
      return;
    }
    if (this.selected && e.target.closest && !e.target.closest('.card')) {
      const c = this.selected;
      const d = CARDS[c.inst.id];
      if (d.target === 'enemy') {
        if (this.battle.hoverEnemy) this.tryPlay(c, this.battle.hoverEnemy);
        else if (p.y > PLAY_LINE + 60) this.selected = null;
      } else if (p.y < PLAY_LINE + 40) this.tryPlay(c, null);
      else this.selected = null;
    }
  }

  reject(c) {
    sfx('error');
    const d = CARDS[c.inst.id];
    this.battle.toast(d.unplayable ? 'このカードは使用できない' : 'エネルギーが足りない');
    c.el.animate([{ marginLeft: '0px' }, { marginLeft: '-8px' }, { marginLeft: '8px' }, { marginLeft: '0px' }], { duration: 200 });
  }

  tryPlay(c, target) {
    this.selected = null;
    if (!this.combat.canPlay(c.inst)) { this.reject(c); return; }
    this.battle.playCard(c.inst, target);
  }

  cancel() { this.selected = null; this.drag = null; }

  key(e) {
    if (!this.enabled && !this.chooseMode) return;
    if (e.key === 'Escape') { this.cancel(); return; }
    if (/^[1-9]$/.test(e.key)) {
      const c = this.cards[Number(e.key) - 1];
      if (!c) return;
      if (this.chooseMode) { this.chooseMode(c.inst); return; }
      if (!this.combat.canPlay(c.inst)) { this.reject(c); return; }
      if (CARDS[c.inst.id].target !== 'enemy' && this.selected === c) { this.tryPlay(c, null); return; }
      this.selected = c;
      sfx('card');
    }
    if ((e.key === 'e' || e.key === 'E') && this.enabled) this.battle.endTurn();
  }
}
